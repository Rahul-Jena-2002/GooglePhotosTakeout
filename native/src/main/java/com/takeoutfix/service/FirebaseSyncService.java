package com.takeoutfix.service;

import com.takeoutfix.controller.UserController;
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
import java.util.function.Consumer;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

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
    public enum SyncState {
        IDLE, SYNCING, SYNCED, FAILED
    }

    private volatile String currentRefreshToken = "";
    private volatile SyncState currentSyncState = SyncState.IDLE;
    private volatile String lastSyncError = "";
    private Consumer<SyncState> syncStateListener = null;
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();
    private final AtomicBoolean closeSyncDone = new AtomicBoolean(false);

    public FirebaseSyncService() {
        // Bootstrap tokens from session.json if present
        loadTokensFromSession();
        // Call Firebase authentication & profile sync exactly ONCE on application start
        scheduler.schedule(this::syncWithFirebase, 1, TimeUnit.SECONDS);

        // Register JVM shutdown hook to sync once on close
        try {
            Runtime.getRuntime().addShutdownHook(new Thread(() -> {
                log.info("JVM Shutdown hook triggered: executing closing Firebase sync...");
                syncOnClose();
            }, "TakeoutFix-CloseSync"));
        } catch (Exception ignored) {}
    }

    public void setSyncStateListener(Consumer<SyncState> listener) {
        this.syncStateListener = listener;
        if (listener != null) {
            listener.accept(this.currentSyncState);
        }
    }

    public SyncState getSyncState() {
        return currentSyncState;
    }

    public String getLastSyncError() {
        return lastSyncError;
    }

    public void triggerImmediateSync() {
        triggerImmediateSync(null);
    }

    public void triggerImmediateSync(java.util.function.Consumer<Boolean> onComplete) {
        scheduler.submit(() -> {
            boolean ok = performSync();
            if (onComplete != null) {
                try {
                    onComplete.accept(ok);
                } catch (Exception ignored) {}
            }
        });
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

    private void notifySyncState(SyncState state, String error) {
        this.currentSyncState = state;
        this.lastSyncError = error != null ? error : "";
        if (syncStateListener != null) {
            try {
                syncStateListener.accept(state);
            } catch (Exception ignored) {}
        }
    }

    /**
     * Synchronizes user quota, tier, and promo state directly from Firestore.
     */
    public synchronized void syncWithFirebase() {
        performSync();
    }

    private synchronized boolean performSync() {
        Map<String, Object> profile = UserController.getCurrentUserProfile();
        String uid = (String) profile.getOrDefault("uid", profile.getOrDefault("googleId", ""));
        if (uid == null || uid.trim().isEmpty()) {
            notifySyncState(SyncState.IDLE, "");
            return false;
        }

        notifySyncState(SyncState.SYNCING, "");

        // 1. Refresh ID Token if we have a refresh token
        String tokenToUse = ensureFreshIdToken();
        if (tokenToUse == null || tokenToUse.isBlank()) {
            // Check session file directly as fallback
            loadTokensFromSession();
            tokenToUse = ensureFreshIdToken();
        }

        if (tokenToUse == null || tokenToUse.isBlank()) {
            // If user is actively signed in locally, keep them online with local session
            notifySyncState(SyncState.SYNCED, "");
            return true;
        }

        // 2. Fetch User Document from Firestore
        boolean userSuccess = false;
        try {
            String userUrl = FIRESTORE_BASE_URL + "/users/" + URLEncoder.encode(uid, StandardCharsets.UTF_8);
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(userUrl))
                    .header("Authorization", "Bearer " + tokenToUse)
                    .timeout(Duration.ofSeconds(8))
                    .GET()
                    .build();

            HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() == 200) {
                JSONObject doc = new JSONObject(resp.body());
                JSONObject fields = doc.optJSONObject("fields");
                if (fields != null) {
                    applyFirestoreUserData(fields, uid, tokenToUse);
                    userSuccess = true;
                }
            } else if (resp.statusCode() == 401) {
                // Token expired — try one immediate forced refresh
                this.currentIdToken = "";
                String refreshed = ensureFreshIdToken();
                if (refreshed != null && !refreshed.isBlank()) {
                    tokenToUse = refreshed;
                    userSuccess = true;
                } else {
                    userSuccess = true; // Fallback to local session
                }
            } else {
                userSuccess = true; // Fallback to local session
            }
        } catch (Exception e) {
            log.debug("Firebase user sync offline/error: {}", e.getMessage());
            userSuccess = true; // Retain cached session and remain online
        }

        // 3. Sync Global Settings (e.g. Free Unlimited Promo Window)
        try {
            String settingsUrl = FIRESTORE_BASE_URL + "/settings/global";
            HttpRequest setReq = HttpRequest.newBuilder()
                    .uri(URI.create(settingsUrl))
                    .header("Authorization", "Bearer " + tokenToUse)
                    .timeout(Duration.ofSeconds(6))
                    .GET()
                    .build();

            HttpResponse<String> setResp = httpClient.send(setReq, HttpResponse.BodyHandlers.ofString());
            if (setResp.statusCode() == 200) {
                JSONObject doc = new JSONObject(setResp.body());
                JSONObject fields = doc.optJSONObject("fields");
                if (fields != null) {
                    applyGlobalSettings(fields);
                }
            }
        } catch (Exception e) {
            log.debug("Global settings sync skipped: {}", e.getMessage());
        }

        if (userSuccess) {
            notifySyncState(SyncState.SYNCED, "");
        }
        return userSuccess;
    }

    private void applyGlobalSettings(JSONObject fields) {
        Map<String, Object> globalUpdates = new HashMap<>();

        // 1. Free Unlimited Promo Window
        boolean isFreePromo = false;
        if (fields.has("freeUnlimitedPromo")) {
            JSONObject promoObj = fields.optJSONObject("freeUnlimitedPromo");
            if (promoObj != null && promoObj.has("mapValue")) {
                JSONObject promoFields = promoObj.getJSONObject("mapValue").optJSONObject("fields");
                if (promoFields != null) {
                    boolean enabled = getBoolean(promoFields, "enabled", false);
                    long endsAt = getLong(promoFields, "endsAt");
                    isFreePromo = enabled && (endsAt == 0 || endsAt > System.currentTimeMillis());
                }
            }
        }
        globalUpdates.put("isFreePromoActive", isFreePromo);

        // 2. Direct free tier feature unlock setting
        boolean unlockFeatures = getBoolean(fields, "unlockFreeFeatures", false);
        globalUpdates.put("unlockFreeFeatures", unlockFeatures);

        // 3. Direct freeUnlimited flag
        boolean directFreeUnlimited = getBoolean(fields, "freeUnlimited", false) || getBoolean(fields, "unlimitedFree", false);

        // 4. Tier Thresholds (Admin Plan Thresholds)
        long freeMaxFiles = 250;
        long freeMaxSizeMB = 500;
        boolean thresholdsUnlimited = false;

        if (fields.has("tierThresholds")) {
            JSONObject ttObj = fields.optJSONObject("tierThresholds");
            if (ttObj != null && ttObj.has("mapValue")) {
                JSONObject ttFields = ttObj.getJSONObject("mapValue").optJSONObject("fields");
                if (ttFields != null && ttFields.has("free") && ttFields.optJSONObject("free") != null) {
                    JSONObject freeObj = ttFields.optJSONObject("free");
                    if (freeObj.has("mapValue")) {
                        JSONObject freeFields = freeObj.getJSONObject("mapValue").optJSONObject("fields");
                        if (freeFields != null) {
                            long mf = getLong(freeFields, "maxFiles");
                            long ms = getLong(freeFields, "maxSizeMB");
                            // In webapp admin, 0 means unlimited
                            if (mf == 0 || mf >= 999999) {
                                thresholdsUnlimited = true;
                                freeMaxFiles = Long.MAX_VALUE;
                            } else if (mf > 0) {
                                freeMaxFiles = mf;
                            }
                            if (ms == 0 || ms >= 999999) {
                                freeMaxSizeMB = Long.MAX_VALUE;
                            } else if (ms > 0) {
                                freeMaxSizeMB = ms;
                            }
                        }
                    }
                }
            }
        }

        boolean isFreeUnlimited = isFreePromo || directFreeUnlimited || thresholdsUnlimited;
        globalUpdates.put("isFreeUnlimited", isFreeUnlimited);
        globalUpdates.put("freeMaxFiles", freeMaxFiles);
        globalUpdates.put("freeMaxBytes", freeMaxSizeMB == Long.MAX_VALUE ? Long.MAX_VALUE : (freeMaxSizeMB * 1024L * 1024L));

        UserController.updateUserProfile(globalUpdates);
    }

    private void applyFirestoreUserData(JSONObject fields, String uid, String token) {
        String plan = getString(fields, "plan", "free");
        long remoteUsedFiles = getLong(fields, "usedFiles");
        long remoteTotalFiles = getLong(fields, "totalFilesProcessed");
        long remoteLifetimeFiles = getLong(fields, "lifetimeFiles");
        long remoteBestFiles = Math.max(remoteUsedFiles, Math.max(remoteTotalFiles, remoteLifetimeFiles));

        long remoteUsedBytes = getLong(fields, "usedBytes");
        long remoteTotalBytes = getLong(fields, "totalBytesProcessed");
        long remoteLifetimeBytes = getLong(fields, "lifetimeBytes");
        long remoteBestBytes = Math.max(remoteUsedBytes, Math.max(remoteTotalBytes, remoteLifetimeBytes));

        boolean isAdmin = getBoolean(fields, "isAdmin", false);
        boolean userUnlimited = getBoolean(fields, "unlimited", false) || getBoolean(fields, "isFreeUnlimited", false);

        // Also check admins collection in Firestore
        if (!isAdmin) {
            isAdmin = checkIfAdmin(uid, token);
        }

        if (isAdmin) {
            plan = "super";
        }

        // Compare with local session usage so local progress is NEVER wiped by 0 from cloud!
        Map<String, Object> localProfile = UserController.getCurrentUserProfile();
        long localFiles = Math.max(toLong(localProfile.get("usedFiles")), Math.max(toLong(localProfile.get("lifetimeFiles")), toLong(localProfile.get("totalFilesProcessed"))));
        long localBytes = Math.max(toLong(localProfile.get("usedBytes")), Math.max(toLong(localProfile.get("lifetimeBytes")), toLong(localProfile.get("totalBytesProcessed"))));

        long bestFiles = Math.max(remoteBestFiles, localFiles);
        long bestBytes = Math.max(remoteBestBytes, localBytes);

        Map<String, Object> updates = new HashMap<>();
        updates.put("plan", plan);
        updates.put("usedFiles", bestFiles);
        updates.put("usedBytes", bestBytes);
        updates.put("totalFilesProcessed", bestFiles);
        updates.put("totalBytesProcessed", bestBytes);
        updates.put("lifetimeFiles", bestFiles);
        updates.put("lifetimeBytes", bestBytes);
        updates.put("isAdmin", isAdmin);
        if (userUnlimited) {
            updates.put("isFreeUnlimited", true);
        }

        UserController.updateUserProfile(updates);

        // If local usage has not yet been pushed to Firestore, push it now!
        if (localFiles > remoteBestFiles || localBytes > remoteBestBytes) {
            log.info("Local usage ({}, {} bytes) exceeds Firestore ({}, {} bytes). Pushing local progress to cloud.",
                    localFiles, localBytes, remoteBestFiles, remoteBestBytes);
            scheduler.submit(this::pushCurrentTotalsToCloud);
        }
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
        String idTok = (String) profile.getOrDefault("idToken", profile.getOrDefault("token", this.currentIdToken));
        if (idTok != null && !idTok.isBlank()) {
            this.currentIdToken = idTok;
        }
        if (refToken != null && !refToken.isBlank()) {
            this.currentRefreshToken = refToken;
        }

        if (this.currentRefreshToken == null || this.currentRefreshToken.isBlank()) {
            return this.currentIdToken;
        }

        try {
            String form = "grant_type=refresh_token&refresh_token=" + URLEncoder.encode(this.currentRefreshToken, StandardCharsets.UTF_8);
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
                profile.put("idToken", this.currentIdToken);
                profile.put("token", this.currentIdToken);
                profile.put("refreshToken", this.currentRefreshToken);
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

    /**
     * Immediately pushes current accumulated local usage totals to Firestore.
     */
    public synchronized boolean pushCurrentTotalsToCloud() {
        Map<String, Object> profile = UserController.getCurrentUserProfile();
        String uid = (String) profile.getOrDefault("uid", profile.getOrDefault("googleId", ""));
        if (uid == null || uid.trim().isEmpty()) {
            return false;
        }

        String token = ensureFreshIdToken();
        if (token == null || token.isBlank()) {
            loadTokensFromSession();
            token = ensureFreshIdToken();
        }
        if (token == null || token.isBlank()) {
            log.warn("Cloud usage push skipped: missing authentication token");
            return false;
        }

        try {
            long usedFiles = toLong(profile.get("usedFiles"));
            long usedBytes = toLong(profile.get("usedBytes"));
            long lifeFiles = Math.max(usedFiles, Math.max(toLong(profile.get("lifetimeFiles")), toLong(profile.get("totalFilesProcessed"))));
            long lifeBytes = Math.max(usedBytes, Math.max(toLong(profile.get("lifetimeBytes")), toLong(profile.get("totalBytesProcessed"))));

            JSONObject fields = new JSONObject();
            JSONObject uf = new JSONObject(); uf.put("integerValue", String.valueOf(lifeFiles));
            JSONObject ub = new JSONObject(); ub.put("integerValue", String.valueOf(lifeBytes));
            JSONObject lf = new JSONObject(); lf.put("integerValue", String.valueOf(lifeFiles));
            JSONObject lb = new JSONObject(); lb.put("integerValue", String.valueOf(lifeBytes));
            JSONObject tf = new JSONObject(); tf.put("integerValue", String.valueOf(lifeFiles));
            JSONObject tb = new JSONObject(); tb.put("integerValue", String.valueOf(lifeBytes));
            JSONObject la = new JSONObject(); la.put("stringValue", java.time.Instant.now().toString());

            fields.put("usedFiles", uf);
            fields.put("usedBytes", ub);
            fields.put("lifetimeFiles", lf);
            fields.put("lifetimeBytes", lb);
            fields.put("totalFilesProcessed", tf);
            fields.put("totalBytesProcessed", tb);
            fields.put("lastActiveAt", la);

            JSONObject body = new JSONObject();
            body.put("fields", fields);

            String patchUrl = FIRESTORE_BASE_URL + "/users/" + URLEncoder.encode(uid, StandardCharsets.UTF_8)
                    + "?updateMask.fieldPaths=usedFiles"
                    + "&updateMask.fieldPaths=usedBytes"
                    + "&updateMask.fieldPaths=lifetimeFiles"
                    + "&updateMask.fieldPaths=lifetimeBytes"
                    + "&updateMask.fieldPaths=totalFilesProcessed"
                    + "&updateMask.fieldPaths=totalBytesProcessed"
                    + "&updateMask.fieldPaths=lastActiveAt";

            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(patchUrl))
                    .header("Authorization", "Bearer " + token)
                    .header("Content-Type", "application/json")
                    .timeout(Duration.ofSeconds(6))
                    .method("PATCH", HttpRequest.BodyPublishers.ofString(body.toString()))
                    .build();

            HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
            log.info("Push usage to Firestore status: {}", resp.statusCode());
            if (resp.statusCode() == 200) {
                notifySyncState(SyncState.SYNCED, "");
                return true;
            } else if (resp.statusCode() == 401) {
                this.currentIdToken = "";
                String refreshed = ensureFreshIdToken();
                if (refreshed != null && !refreshed.isBlank()) {
                    HttpRequest retryReq = HttpRequest.newBuilder()
                            .uri(URI.create(patchUrl))
                            .header("Authorization", "Bearer " + refreshed)
                            .header("Content-Type", "application/json")
                            .timeout(Duration.ofSeconds(6))
                            .method("PATCH", HttpRequest.BodyPublishers.ofString(body.toString()))
                            .build();
                    HttpResponse<String> retryResp = httpClient.send(retryReq, HttpResponse.BodyHandlers.ofString());
                    if (retryResp.statusCode() == 200) {
                        notifySyncState(SyncState.SYNCED, "");
                        return true;
                    }
                }
            }
            return false;
        } catch (Exception e) {
            log.warn("Push usage to Firestore failed: {}", e.getMessage());
            return false;
        }
    }

    /**
     * Called once when the application closes:
     * Synchronizes accumulated local usage metrics back to Firebase Firestore.
     */
    public synchronized boolean syncOnClose() {
        if (closeSyncDone.getAndSet(true)) {
            return true; // Already executed once
        }
        return pushCurrentTotalsToCloud();
    }

    private static long toLong(Object obj) {
        if (obj instanceof Number n) return n.longValue();
        if (obj instanceof String s) {
            try { return Long.parseLong(s); } catch (Exception ignored) {}
        }
        return 0L;
    }
}
