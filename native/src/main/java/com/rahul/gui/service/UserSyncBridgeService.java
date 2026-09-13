package com.rahul.gui.service;

import com.rahul.controller.UserController;
import org.json.JSONObject;
import org.springframework.stereotype.Service;

import javax.swing.*;
import java.awt.*;
import java.io.File;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Consumer;

/**
 * Bridge between the Spring backend auth state, the local session file, and the GUI.
 *
 * Persistent login strategy:
 *  - On startup, session.json is restored immediately into the in-memory profile.
 *  - The polling loop ONLY refreshes quota when authenticated; it NEVER signs the user out.
 *    Signing out is an explicit user action only (signOut() method).
 *  - session.json is saved on every profile update and deleted only on explicit sign-out.
 */
@Service
public class UserSyncBridgeService {

    private static final File SESSION_FILE = new File(System.getProperty("user.home"), ".takeoutfix/session.json");
    private final List<Consumer<Map<String, Object>>> listeners = new CopyOnWriteArrayList<>();
    private final HttpClient httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();

    public UserSyncBridgeService() {
        // 1. Restore persisted session FIRST into the in-memory profile
        loadPersistedSession();
        // 2. Wire up the profile listener AFTER loading so subsequent updates notify GUI
        UserController.setProfileUpdateListener(this::handleProfileUpdate);
        // 3. If we have a session, notify all already-added listeners immediately
        if (isSignedIn()) {
            handleProfileUpdate(UserController.getCurrentUserProfile());
        }
        // 4. Start background quota refresh (never signs out automatically)
        startPollingAuthStatus();
    }

    // ── Static helpers ────────────────────────────────────────────────────────

    public static void openGoogleLogin(Component parent) {
        openGoogleLogin(parent, false);
    }

    public static void openGoogleLogin(Component parent, boolean selectAccount) {
        try {
            String url = "http://localhost:8081/login.html" + (selectAccount ? "?select_account=true" : "");
            Desktop.getDesktop().browse(new URI(url));
        } catch (Exception ex) {
            JOptionPane.showMessageDialog(parent,
                    "Failed to open browser for Google login:\n" + ex.getMessage()
                            + "\n\nPlease open http://localhost:8081/login.html manually.",
                    "Sign-In Error", JOptionPane.ERROR_MESSAGE);
        }
    }

    // ── Polling loop — refreshes quota only, NEVER auto-signs-out ─────────────

    private void startPollingAuthStatus() {
        Timer timer = new Timer(4000, e -> {
            try {
                HttpRequest req = HttpRequest.newBuilder()
                        .uri(URI.create("http://localhost:8081/api/auth/status"))
                        .timeout(Duration.ofSeconds(3))
                        .GET()
                        .build();

                httpClient.sendAsync(req, HttpResponse.BodyHandlers.ofString())
                        .thenAccept(res -> {
                            if (res.statusCode() != 200) return;
                            JSONObject json = new JSONObject(res.body());
                            boolean authed = json.optBoolean("authenticated", false);

                            if (authed) {
                                String serverEmail = json.optString("email", "");
                                if (!isSignedIn() || !getCurrentEmail().equalsIgnoreCase(serverEmail)) {
                                    // New login detected from browser — sync full profile
                                    Map<String, Object> map = new HashMap<>();
                                    for (String key : json.keySet()) map.put(key, json.get(key));
                                    UserController.updateUserProfile(map);
                                } else {
                                    // Same user — silently refresh quota & plan from server DB
                                    Map<String, Object> quotaUpdate = new HashMap<>();
                                    quotaUpdate.put("usedFiles", json.optLong("usedFiles", getUsedFiles()));
                                    quotaUpdate.put("usedBytes", json.optLong("usedBytes", getUsedBytes()));
                                    quotaUpdate.put("plan", json.optString("plan", getCurrentPlan()));
                                    quotaUpdate.put("accountStatus", json.optString("accountStatus", "ACTIVE"));
                                    UserController.updateUserProfile(quotaUpdate);
                                }
                            }
                            // If server says !authed but we have a local session — keep local session.
                            // The server-side state resets on restart; local session.json is authoritative.
                        }).exceptionally(ex -> null);
            } catch (Exception ignored) {}
        });
        timer.setRepeats(true);
        timer.start();
    }

    // ── Session persistence ───────────────────────────────────────────────────

    private void loadPersistedSession() {
        try {
            if (SESSION_FILE.exists()) {
                String content = Files.readString(SESSION_FILE.toPath());
                if (content != null && !content.isBlank()) {
                    JSONObject json = new JSONObject(content);
                    Map<String, Object> map = new HashMap<>();
                    for (String key : json.keySet()) {
                        map.put(key, json.get(key));
                    }
                    // Directly populate profile (listener not set yet; no notification)
                    UserController.getCurrentUserProfile().putAll(map);
                }
            }
        } catch (Exception ignored) {}
    }

    private void savePersistedSession(Map<String, Object> profile) {
        // Only save if actually signed in — don't persist empty sessions
        Object email = profile.get("email");
        if (email == null || email.toString().trim().isEmpty()) return;
        try {
            SESSION_FILE.getParentFile().mkdirs();
            JSONObject json = new JSONObject(profile);
            Files.writeString(SESSION_FILE.toPath(), json.toString(2));
        } catch (Exception ignored) {}
    }

    // ── Listener management ───────────────────────────────────────────────────

    public void addListener(Consumer<Map<String, Object>> listener) {
        listeners.add(listener);
        // Fire immediately with current state so the UI is populated on startup
        SwingUtilities.invokeLater(() -> listener.accept(UserController.getCurrentUserProfile()));
    }

    private void handleProfileUpdate(Map<String, Object> profile) {
        savePersistedSession(profile);
        for (Consumer<Map<String, Object>> listener : listeners) {
            try {
                listener.accept(profile);
            } catch (Exception ignored) {}
        }
    }

    // ── Profile accessors ─────────────────────────────────────────────────────

    public Map<String, Object> getCurrentProfile() {
        return UserController.getCurrentUserProfile();
    }

    public boolean isSignedIn() {
        String email = getCurrentEmail();
        return email != null && !email.trim().isEmpty();
    }

    public String getCurrentEmail() {
        return (String) getCurrentProfile().getOrDefault("email", "");
    }

    public String getCurrentName() {
        return (String) getCurrentProfile().getOrDefault("name",
                getCurrentProfile().getOrDefault("displayName", "Operator"));
    }

    public String getCurrentPlan() {
        if (!isSignedIn()) return "none";
        return (String) getCurrentProfile().getOrDefault("plan", "free");
    }

    public boolean isSuper() {
        return "super".equalsIgnoreCase(getCurrentPlan());
    }

    public boolean isProOrSuper() {
        String p = getCurrentPlan();
        return "super".equalsIgnoreCase(p) || "pro".equalsIgnoreCase(p);
    }

    public long getUsedFiles() {
        return getNumeric(getCurrentProfile().get("usedFiles"));
    }

    public long getUsedBytes() {
        return getNumeric(getCurrentProfile().get("usedBytes"));
    }

    public long getMaxFiles() {
        if (!isSignedIn()) return 0;
        return isProOrSuper() ? Long.MAX_VALUE : 250;
    }

    public long getMaxBytes() {
        if (!isSignedIn()) return 0;
        return isProOrSuper() ? Long.MAX_VALUE : 500L * 1024 * 1024;
    }

    public boolean canProcessMoreFiles(long nextFilesCount) {
        if (!isSignedIn()) return false;
        if (isProOrSuper()) return true;
        return (getUsedFiles() + nextFilesCount) <= 250;
    }

    public boolean isQuotaExceeded() {
        if (!isSignedIn()) return true;
        return !canProcessMoreFiles(1);
    }

    // ── Mutators ──────────────────────────────────────────────────────────────

    public void signIn(String email, String plan) {
        Map<String, Object> updates = new HashMap<>(getCurrentProfile());
        updates.put("email", email);
        updates.put("plan", (plan == null || plan.isEmpty()) ? "free" : plan);
        updates.putIfAbsent("usedFiles", 0L);
        updates.putIfAbsent("usedBytes", 0L);
        UserController.updateUserProfile(updates);
    }

    /**
     * Explicit user-initiated sign-out. Deletes local session file.
     */
    public void signOut() {
        // Delete local session file
        try {
            if (SESSION_FILE.exists()) SESSION_FILE.delete();
        } catch (Exception ignored) {}

        // Tell the server to clear its session
        try {
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create("http://localhost:8081/api/auth/logout"))
                    .POST(HttpRequest.BodyPublishers.noBody())
                    .build();
            httpClient.sendAsync(req, HttpResponse.BodyHandlers.discarding());
        } catch (Exception ignored) {}

        // Clear in-memory profile and notify GUI
        UserController.getCurrentUserProfile().clear();
        handleProfileUpdate(new HashMap<>());
    }

    public void syncFromCloud(Map<String, Object> updates) {
        UserController.updateUserProfile(updates);
    }

    public void recordUsage(long files, long bytes) {
        UserController.incrementUsage(files, bytes);
    }

    public static long getNumeric(Object obj) {
        if (obj instanceof Number num) return num.longValue();
        if (obj instanceof String str) {
            try { return Long.parseLong(str); } catch (Exception ignored) {}
        }
        return 0;
    }
}
