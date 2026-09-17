package com.takeoutfix.gui.service;

import com.takeoutfix.controller.UserController;
import org.json.JSONObject;

import com.takeoutfix.service.FirebaseSyncService;

import javax.swing.*;
import java.awt.*;
import java.io.File;
import java.net.URI;
import java.nio.file.Files;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.function.Consumer;

/**
 * Bridge between auth state, local persistent session file, and the GUI.
 *
 * Persistent login strategy:
 *  - On startup, session.json is restored immediately into the in-memory profile.
 *  - session.json is saved on every profile update and deleted only on explicit sign-out.
 *  - Supports both direct email/password auth and standard browser Google redirect flow.
 */
public class UserSyncBridgeService {

    private static final File SESSION_FILE = new File(System.getProperty("user.home"), ".takeoutfix/session.json");
    private static final File USERS_FILE = new File(System.getProperty("user.home"), ".takeoutfix/users.json");
    private final List<Consumer<Map<String, Object>>> listeners = new CopyOnWriteArrayList<>();
    private final FirebaseSyncService firebaseSyncService = new FirebaseSyncService();

    public UserSyncBridgeService() {
        // 1. Restore persisted session FIRST into the in-memory profile
        loadPersistedSession();
        // 2. Wire up the profile listener AFTER loading so subsequent updates notify GUI
        UserController.setProfileUpdateListener(this::handleProfileUpdate);
        // 3. If we have a session, notify all already-added listeners immediately
        if (isSignedIn()) {
            handleProfileUpdate(UserController.getCurrentUserProfile());
            firebaseSyncService.triggerImmediateSync();
        }
    }

    public FirebaseSyncService getFirebaseSyncService() {
        return firebaseSyncService;
    }

    public void triggerCloudSync(Consumer<Boolean> onComplete) {
        firebaseSyncService.triggerImmediateSync(onComplete);
    }

    public void syncOnClose() {
        if (firebaseSyncService != null) {
            firebaseSyncService.syncOnClose();
        }
    }

    // ── Direct Email/Password & HTTPS Auth Methods ───────────────────────────

    public void signInWithEmail(String email, String password, Component parent, Consumer<Map<String, Object>> onSuccess, Consumer<String> onError) {
        Executors.newSingleThreadExecutor().submit(() -> {
            try {
                Map<String, Object> profile = DirectAuthHttpsService.signInWithEmailPassword(email, password);
                SwingUtilities.invokeLater(() -> {
                    UserController.syncUser(profile);
                    saveSessionFile(profile);
                    if (onSuccess != null) {
                        onSuccess.accept(profile);
                    }
                });
            } catch (Exception e) {
                SwingUtilities.invokeLater(() -> {
                    String msg = e.getMessage() != null ? e.getMessage() : "Authentication failed.";
                    if (onError != null) {
                        onError.accept(msg);
                    } else {
                        JOptionPane.showMessageDialog(parent, msg, "Sign-In Failed", JOptionPane.ERROR_MESSAGE);
                    }
                });
            }
        });
    }

    public void signUpWithEmail(String email, String password, Component parent, Consumer<Map<String, Object>> onSuccess, Consumer<String> onError) {
        Executors.newSingleThreadExecutor().submit(() -> {
            try {
                Map<String, Object> profile = DirectAuthHttpsService.signUpWithEmailPassword(email, password);
                SwingUtilities.invokeLater(() -> {
                    UserController.syncUser(profile);
                    saveSessionFile(profile);
                    if (onSuccess != null) {
                        onSuccess.accept(profile);
                    }
                });
            } catch (Exception e) {
                SwingUtilities.invokeLater(() -> {
                    String msg = e.getMessage() != null ? e.getMessage() : "Sign up failed.";
                    if (onError != null) {
                        onError.accept(msg);
                    } else {
                        JOptionPane.showMessageDialog(parent, msg, "Registration Failed", JOptionPane.ERROR_MESSAGE);
                    }
                });
            }
        });
    }

    public void sendPasswordReset(String email, Consumer<String> onSuccess, Consumer<String> onError) {
        Executors.newSingleThreadExecutor().submit(() -> {
            try {
                DirectAuthHttpsService.sendPasswordReset(email);
                SwingUtilities.invokeLater(() -> {
                    if (onSuccess != null) {
                        onSuccess.accept("Reset email sent! Please check your inbox.");
                    }
                });
            } catch (Exception e) {
                SwingUtilities.invokeLater(() -> {
                    String msg = e.getMessage() != null ? e.getMessage() : "Failed to send reset email.";
                    if (onError != null) {
                        onError.accept(msg);
                    }
                });
            }
        });
    }

    public void signInWithLinkOrToken(String input, Component parent, Consumer<Map<String, Object>> onSuccess, Consumer<String> onError) {
        Executors.newSingleThreadExecutor().submit(() -> {
            try {
                Map<String, Object> profile = DirectAuthHttpsService.parseAndAuthenticate(input);
                SwingUtilities.invokeLater(() -> {
                    UserController.syncUser(profile);
                    saveSessionFile(profile);
                    if (onSuccess != null) {
                        onSuccess.accept(profile);
                    }
                });
            } catch (Exception e) {
                SwingUtilities.invokeLater(() -> {
                    String msg = e.getMessage() != null ? e.getMessage() : "Verification failed.";
                    if (onError != null) {
                        onError.accept(msg);
                    } else {
                        JOptionPane.showMessageDialog(parent, msg, "Sign-In Failed", JOptionPane.ERROR_MESSAGE);
                    }
                });
            }
        });
    }

    // ── Browser Google Authentication Flow ───────────────────────────────────

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

            String url = "https://takeoutfix.pages.dev/login?desktop_port=" + port + "&port=" + port + (selectAccount ? "&select_account=true&prompt=select_account" : "");
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
                    String email = json.optString("email", "").trim().toLowerCase();
                    // Never restore mock or test accounts
                    if (email.isEmpty() || email.contains("test@") || email.endsWith("@example.com") || "test".equals(email)) {
                        Files.deleteIfExists(SESSION_FILE.toPath());
                        return;
                    }
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
        Object emailObj = profile.get("email");
        if (emailObj == null || emailObj.toString().trim().isEmpty()) return;
        String email = emailObj.toString().trim().toLowerCase();
        // Never persist test, mock, or example accounts to ~/.takeoutfix/session.json
        if (email.contains("test@") || email.endsWith("@example.com") || "test".equals(email)) {
            return;
        }
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

    public boolean isFreeUnlimited() {
        return true;
    }

    public boolean isFeaturesUnlocked() {
        return true;
    }

    public long getUsedFiles() {
        return getNumeric(getCurrentProfile().get("usedFiles"));
    }

    public long getUsedBytes() {
        return getNumeric(getCurrentProfile().get("usedBytes"));
    }

    public long getMaxFiles() {
        return Long.MAX_VALUE;
    }

    public long getMaxBytes() {
        return Long.MAX_VALUE;
    }

    public boolean canProcessMoreFiles(long nextFilesCount) {
        return true;
    }

    /**
     * Unlimited mode active for all users: quota is never exceeded.
     */
    public boolean isQuotaExceeded() {
        return false;
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
        saveSessionFile(UserController.getCurrentUserProfile());
        if (firebaseSyncService != null) {
            firebaseSyncService.pushCurrentTotalsToCloud();
        }
    }

    public static long getNumeric(Object obj) {
        if (obj instanceof Number num) return num.longValue();
        if (obj instanceof String str) {
            try { return Long.parseLong(str); } catch (Exception ignored) {}}
        return 0;
    }
}
