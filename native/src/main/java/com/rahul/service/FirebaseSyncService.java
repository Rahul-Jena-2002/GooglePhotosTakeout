package com.rahul.service;

import com.rahul.controller.UserController;
import org.json.JSONObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import java.io.File;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Direct Firebase & Firestore Cloud Sync for TakeoutFix Native Desktop App.
 *
 * Communicates directly with Google's Firebase Auth & Firestore REST APIs
 * using the project's Firebase credentials, keeping the desktop app 100%
 * in sync with cloud quotas, tier changes, and admin status even when
 * the webapp is closed.
 */
public class FirebaseSyncService {

    private static final Logger log = LoggerFactory.getLogger(FirebaseSyncService.class);

    private static final String FIREBASE_API_KEY = "AIzaSyDBTj1lcAbftiAYwnv5upjHK7ET_sNgZNk";
    private static final String PROJECT_ID = "takeout-fix";
    private static final String SECURE_TOKEN_URL = "https://securetoken.googleapis.com/v1/token?key=" + FIREBASE_API_KEY;
    private static final String FIRESTORE_BASE_URL = "https://firestore.googleapis.com/v1/projects/" + PROJECT_ID + "/databases/(default)/documents";
    private static final File SESSION_FILE = new File(System.getProperty("user.home"), ".takeoutfix/session.json");

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(6))
            .build();

    private volatile String currentIdToken = "";
    private volatile String currentRefreshToken = "";
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();

    public FirebaseSyncService() {
        // Bootstrap tokens from session.json if present
        loadTokensFromSession();
        // Initial sync at 3 seconds, then a relaxed 10-minute heartbeat (600s) to conserve Firestore quotas
        scheduler.scheduleWithFixedDelay(this::syncWithFirebase, 3, 600, TimeUnit.SECONDS);
    }

    public void triggerImmediateSync() {
        scheduler.submit(this::syncWithFirebase);
    }

    private void loadTokensFromSession() {
        try {
            if (SESSION_FILE.exists()) {
                String content = Files.readString(SESSION_FILE.toPath());
                if (content != null && !content.isBlank()) {
                    JSONObject json = new JSONObject(content);
                    this.currentIdToken = json.optString("idToken", "");
                    this.currentRefreshToken = json.optString("refreshToken", "");
                }
            }
        } catch (Exception ignored) {}
    }

    /**
     * Synchronizes user quota and tier directly from Firestore.
     */
    public synchronized void syncWithFirebase() {
        Map<String, Object> profile = UserController.getCurrentUserProfile();
        String uid = (String) profile.getOrDefault("uid", profile.getOrDefault("googleId", ""));
        if (uid == null || uid.trim().isEmpty()) {
            return;
        }

        // 1. Refresh ID Token if we have a refresh token
        String tokenToUse = ensureFreshIdToken();
        if (tokenToUse == null || tokenToUse.isBlank()) {
            return;
        }

        // 2. Fetch User Document from Firestore
        try {
            String userUrl = FIRESTORE_BASE_URL + "/users/" + URLEncoder.encode(uid, StandardCharsets.UTF_8);
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(userUrl))
                    .header("Authorization", "Bearer " + tokenToUse)
                    .timeout(Duration.ofSeconds(6))
                    .GET()
                    .build();

            HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() == 200) {
                JSONObject doc = new JSONObject(resp.body());
                JSONObject fields = doc.optJSONObject("fields");
                if (fields != null) {
                    applyFirestoreUserData(fields, uid, tokenToUse);
                }
            } else if (resp.statusCode() == 401) {
                // Token expired — invalidate cached token so next run forces refresh
                this.currentIdToken = "";
            }
        } catch (Exception e) {
            log.debug("Firebase background sync skipped: {}", e.getMessage());
        }
    }

    private void applyFirestoreUserData(JSONObject fields, String uid, String token) {
        String plan = getString(fields, "plan", "free");
        long usedFiles = getLong(fields, "usedFiles");
        long totalFiles = getLong(fields, "totalFilesProcessed");
        long lifetimeFiles = getLong(fields, "lifetimeFiles");
        long bestFiles = Math.max(usedFiles, Math.max(totalFiles, lifetimeFiles));

        long usedBytes = getLong(fields, "usedBytes");
        long totalBytes = getLong(fields, "totalBytesProcessed");
        long lifetimeBytes = getLong(fields, "lifetimeBytes");
        long bestBytes = Math.max(usedBytes, Math.max(totalBytes, lifetimeBytes));

        boolean isAdmin = getBoolean(fields, "isAdmin", false);

        // Also check admins collection in Firestore
        if (!isAdmin) {
            isAdmin = checkIfAdmin(uid, token);
        }

        if (isAdmin) {
            plan = "super";
        }

        Map<String, Object> updates = new HashMap<>();
        updates.put("plan", plan);
        updates.put("usedFiles", bestFiles);
        updates.put("usedBytes", bestBytes);
        updates.put("totalFilesProcessed", bestFiles);
        updates.put("totalBytesProcessed", bestBytes);
        updates.put("lifetimeFiles", bestFiles);
        updates.put("lifetimeBytes", bestBytes);
        updates.put("isAdmin", isAdmin);

        UserController.updateUserProfile(updates);
    }

    private boolean checkIfAdmin(String uid, String token) {
        try {
            String adminUrl = FIRESTORE_BASE_URL + "/admins/" + URLEncoder.encode(uid, StandardCharsets.UTF_8);
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(adminUrl))
                    .header("Authorization", "Bearer " + token)
                    .timeout(Duration.ofSeconds(4))
                    .GET()
                    .build();

            HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
            return resp.statusCode() == 200;
        } catch (Exception ignored) {
            return false;
        }
    }

    /**
     * Refreshes the ID Token using the stored refresh token against Google's Secure Token API.
     */
    private String ensureFreshIdToken() {
        Map<String, Object> profile = UserController.getCurrentUserProfile();
        String refToken = (String) profile.getOrDefault("refreshToken", this.currentRefreshToken);
        if (refToken == null || refToken.isBlank()) {
            return this.currentIdToken;
        }

        try {
            String form = "grant_type=refresh_token&refresh_token=" + URLEncoder.encode(refToken, StandardCharsets.UTF_8);
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(SECURE_TOKEN_URL))
                    .header("Content-Type", "application/x-www-form-urlencoded")
                    .timeout(Duration.ofSeconds(5))
                    .POST(HttpRequest.BodyPublishers.ofString(form))
                    .build();

            HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() == 200) {
                JSONObject json = new JSONObject(resp.body());
                this.currentIdToken = json.optString("id_token", this.currentIdToken);
                this.currentRefreshToken = json.optString("refresh_token", this.currentRefreshToken);
                return this.currentIdToken;
            }
        } catch (Exception ignored) {}

        return this.currentIdToken;
    }

    private static long getLong(JSONObject fields, String key) {
        if (fields.has(key)) {
            JSONObject obj = fields.optJSONObject(key);
            if (obj != null) {
                if (obj.has("integerValue")) {
                    try { return Long.parseLong(obj.getString("integerValue")); } catch (Exception ignored) {}
                }
                if (obj.has("doubleValue")) {
                    return (long) obj.optDouble("doubleValue", 0);
                }
            }
        }
        return 0L;
    }

    private static String getString(JSONObject fields, String key, String def) {
        if (fields.has(key)) {
            JSONObject obj = fields.optJSONObject(key);
            if (obj != null && obj.has("stringValue")) {
                return obj.getString("stringValue");
            }
        }
        return def;
    }

    private static boolean getBoolean(JSONObject fields, String key, boolean def) {
        if (fields.has(key)) {
            JSONObject obj = fields.optJSONObject(key);
            if (obj != null && obj.has("booleanValue")) {
                return obj.getBoolean("booleanValue");
            }
        }
        return def;
    }
}
