package com.rahul.gui.service;

import com.rahul.controller.UserController;
import org.json.JSONObject;

import javax.swing.*;
import java.awt.*;
import java.io.File;
import java.net.URI;
import java.nio.file.Files;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Consumer;

/**
 * Bridge between auth state, local persistent session file, and the GUI.
 *
 * Persistent login strategy:
 *  - On startup, session.json is restored immediately into the in-memory profile.
 *  - session.json is saved on every profile update and deleted only on explicit sign-out.
 *  - Login is performed via standard browser flow listening on ephemeral local port.
 */
public class UserSyncBridgeService {

    private static final File SESSION_FILE = new File(System.getProperty("user.home"), ".takeoutfix/session.json");
    private static final File USERS_FILE = new File(System.getProperty("user.home"), ".takeoutfix/users.json");
    private final List<Consumer<Map<String, Object>>> listeners = new CopyOnWriteArrayList<>();

    public UserSyncBridgeService() {
        // 1. Restore persisted session FIRST into the in-memory profile
        loadPersistedSession();
        // 2. Wire up the profile listener AFTER loading so subsequent updates notify GUI
        UserController.setProfileUpdateListener(this::handleProfileUpdate);
        // 3. If we have a session, notify all already-added listeners immediately
        if (isSignedIn()) {
            handleProfileUpdate(UserController.getCurrentUserProfile());
        }
    }

    // ── Browser Authentication Flow ───────────────────────────────────────────

    public static void openGoogleLogin(Component parent) {
        openGoogleLogin(parent, false);
    }

    public static void openGoogleLogin(Component parent, boolean selectAccount) {
        try {
            int port = DesktopAuthServer.start(profile -> {
                SwingUtilities.invokeLater(() -> {
                    UserController.syncUser(profile);
                    saveSessionFile(profile);
                    JOptionPane.showMessageDialog(parent,
                            "Welcome back, " + profile.getOrDefault("displayName", profile.getOrDefault("email", "User")) + "!\nYour session is active.",
                            "Sign-In Successful", JOptionPane.INFORMATION_MESSAGE);
                });
            });

            if (port <= 0) {
                JOptionPane.showMessageDialog(parent,
                        "Failed to initialize local authentication listener.",
                        "Sign-In Error", JOptionPane.ERROR_MESSAGE);
                return;
            }

            String url = "https://takeoutfix.pages.dev/auth/desktop?port=" + port + (selectAccount ? "&select_account=true" : "");
            Desktop.getDesktop().browse(new URI(url));
        } catch (Exception ex) {
            JOptionPane.showMessageDialog(parent,
                    "Failed to open browser for Google login:\n" + ex.getMessage(),
                    "Sign-In Error", JOptionPane.ERROR_MESSAGE);
        }
    }

    // ── Session persistence ──────────────────────────────────────────────────

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
                    UserController.getCurrentUserProfile().putAll(map);
                }
            }
        } catch (Exception ignored) {}
    }

    private static void saveSessionFile(Map<String, Object> profile) {
        if (profile == null || profile.isEmpty()) return;
        Object email = profile.get("email");
        if (email == null || email.toString().trim().isEmpty()) return;
        try {
            SESSION_FILE.getParentFile().mkdirs();
            JSONObject json = new JSONObject(profile);
            Files.writeString(SESSION_FILE.toPath(), json.toString(2));
        } catch (Exception ignored) {}
    }

    // ── Listener management ──────────────────────────────────────────────────

    public void addListener(Consumer<Map<String, Object>> listener) {
        listeners.add(listener);
        SwingUtilities.invokeLater(() -> listener.accept(UserController.getCurrentUserProfile()));
    }

    private void handleProfileUpdate(Map<String, Object> profile) {
        saveSessionFile(profile);
        for (Consumer<Map<String, Object>> listener : listeners) {
            try {
                listener.accept(profile);
            } catch (Exception ignored) {}
        }
    }

    // ── Profile accessors ────────────────────────────────────────────────────

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

    // ── Mutators ─────────────────────────────────────────────────────────────

    public void signIn(String email, String plan) {
        Map<String, Object> updates = new HashMap<>(getCurrentProfile());
        updates.put("email", email);
        updates.put("plan", (plan == null || plan.isEmpty()) ? "free" : plan);
        updates.putIfAbsent("usedFiles", 0L);
        updates.putIfAbsent("usedBytes", 0L);
        UserController.updateUserProfile(updates);
    }

    /**
     * Explicit user-initiated sign-out. Deletes all local session and repository state.
     */
    public void signOut() {
        try {
            if (SESSION_FILE.exists()) {
                Files.deleteIfExists(SESSION_FILE.toPath());
            }
        } catch (Exception ignored) {}

        try {
            if (USERS_FILE.exists()) {
                Files.deleteIfExists(USERS_FILE.toPath());
            }
        } catch (Exception ignored) {}

        UserController.logout();
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
            try { return Long.parseLong(str); } catch (Exception ignored) {}}
        return 0;
    }
}
