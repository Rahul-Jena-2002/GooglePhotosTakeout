package com.takeoutfix.auth;

import com.takeoutfix.network.DirectAuthHttpsService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import javax.swing.*;
import java.awt.*;
import java.io.File;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.file.Files;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Consumer;

/**
 * Bridge between auth state, local persistent session file, and the GUI.
 *
 * Persistent login strategy:
 * - On startup, silent token verification is executed via SessionManager.
 * - Tokens are stored in the OS Keyring via CredentialStore.
 * - Public metadata is stored in ~/.takeoutfix/session.json.
 *
 * Cloud synchronization strategy:
 * - Only loads from Firebase once upon login to cache entitlements locally.
 * - During restoration, all operations update local session storage without repeated cloud calls.
 * - When the user pauses, stops/cancels, or completes an operation, or exits the application:
 *   checks online connectivity, and only if online, synchronizes usage totals to Firebase.
 */
@Service
public class UserSyncBridgeService {

    private static final Logger log = LoggerFactory.getLogger(UserSyncBridgeService.class);
    private static final String KEY_EMAIL = "email";

    private static final File SESSION_FILE = new File(System.getProperty("user.home"), ".takeoutfix/session.json");
    private static final File USERS_FILE = new File(System.getProperty("user.home"), ".takeoutfix/users.json");

    private final ExecutorService executorService = Executors.newCachedThreadPool();
    private final List<Consumer<Map<String, Object>>> listeners = new CopyOnWriteArrayList<>();
    private final FirebaseSyncService firebaseSyncService = new FirebaseSyncService();
    private final CredentialStore credentialStore;
    private final GoogleAuthService googleAuthService;

    public UserSyncBridgeService() {
        this(new GoogleAuthService(), new CredentialStore());
    }

    @Autowired
    public UserSyncBridgeService(GoogleAuthService googleAuthService, CredentialStore credentialStore) {
        this.googleAuthService = googleAuthService;
        this.credentialStore = credentialStore;
        UserController.setProfileUpdateListener(this::handleProfileUpdate);
    }

    public GoogleAuthService getGoogleAuthService() {
        return googleAuthService;
    }

    public SessionManager getSessionManager() {
        return googleAuthService.getSessionManager();
    }

    public FirebaseSyncService getFirebaseSyncService() {
        return firebaseSyncService;
    }

    public void triggerCloudSync(Consumer<Boolean> onComplete) {
        executorService.submit(() -> {
            try {
                Map<String, Object> current = new HashMap<>(UserController.getCurrentUserProfile());
                DirectAuthHttpsService.enrichFromFirestoreIfPresent(current);
                UserController.updateUserProfile(current);
                saveSessionFile(current);
            } catch (Exception ignored) {
                // Non-fatal optional cloud enrichment failure
            }
            firebaseSyncService.triggerImmediateSync(onComplete);
        });
    }

    /**
     * Synchronizes accumulated local metrics to Firebase Firestore when the user
     * pauses, cancels/stops, or completes a restoration, verifying online status first.
     */
    public void syncIfOnline() {
        if (!isSignedIn()) {
            return;
        }
        executorService.submit(() -> {
            if (checkOnlineConnectivity()) {
                try {
                    log.info("Network is online: Synchronizing local usage metrics to Firebase...");
                    firebaseSyncService.pushCurrentTotalsToCloud();
                    firebaseSyncService.drainPendingOfflineSync();
                } catch (Exception e) {
                    log.warn("Firebase sync attempt failed: {}", e.getMessage());
                }
            } else {
                log.info("Network is offline: Firebase cloud sync safely deferred until online.");
            }
        });
    }

    /**
     * Fast check to verify actual internet connectivity before executing cloud network calls.
     */
    public boolean checkOnlineConnectivity() {
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress("8.8.8.8", 53), 1500);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    public void syncOnClose() {
        if (!isSignedIn()) return;
        try {
            if (checkOnlineConnectivity()) {
                firebaseSyncService.syncOnClose();
            } else {
                log.info("Application closed offline: cloud sync skipped safely.");
            }
        } catch (Exception ignored) {}
    }

    /**
     * IDE-style silent startup authentication.
     * Validates stored credentials against the token endpoint.
     */
    public void verifyStartupSession(Consumer<Boolean> onComplete) {
        executorService.submit(() -> {
            boolean valid = false;
            try {
                SessionRestoreResult result = getSessionManager().restore();
                if (result instanceof SessionRestoreResult.Authenticated auth) {
                    UserController.syncUser(auth.session().toMap());
                    triggerCloudSync(null);
                    valid = true;
                }
            } catch (Exception e) {
                valid = false;
            }

            final boolean authOk = valid;
            if (!authOk) {
                UserController.getCurrentUserProfile().clear();
            }

            SwingUtilities.invokeLater(() -> {
                if (onComplete != null) {
                    onComplete.accept(authOk);
                }
            });
        });
    }

    // ── Direct Email/Password & HTTPS Auth Methods ────────────────────────────

    public void signInWithEmail(String email, String password, Component parent,
            Consumer<Map<String, Object>> onSuccess, Consumer<String> onError) {
        executorService.submit(() -> {
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

    public void signUpWithEmail(String email, String password, Component parent,
            Consumer<Map<String, Object>> onSuccess, Consumer<String> onError) {
        executorService.submit(() -> {
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
        executorService.submit(() -> {
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

    public void signInWithLinkOrToken(String input, Component parent, Consumer<Map<String, Object>> onSuccess,
            Consumer<String> onError) {
        executorService.submit(() -> {
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
        new GoogleAuthService().authenticate().whenComplete((session, error) -> SwingUtilities.invokeLater(() -> {
            if (error != null) {
                JOptionPane.showMessageDialog(parent,
                        "Google Sign-In was cancelled or failed:\n" + error.getMessage(),
                        "Sign-In Error", JOptionPane.ERROR_MESSAGE);
            } else if (session != null && session.isAuthenticated()) {
                UserController.syncUser(session.toMap());
                saveSessionFile(session.toMap());
                JOptionPane.showMessageDialog(parent,
                        "Welcome back, " + session.getDisplayName() + "!\nYour session is active.",
                        "Sign-In Successful", JOptionPane.INFORMATION_MESSAGE);
            }
        }));
    }

    public void startBrowserSignIn(Component parent) {
        googleAuthService.authenticate().whenComplete((session, error) -> SwingUtilities.invokeLater(() -> {
            if (error != null) {
                log.error("[Auth] Browser sign-in error or cancelled: {}", error.getMessage());
            } else if (session != null && session.isAuthenticated()) {
                UserController.syncUser(session.toMap());
                triggerCloudSync(null);
                if (parent != null) {
                    JOptionPane.showMessageDialog(parent,
                            "Welcome back, " + session.getDisplayName() + "!\nYou are now signed in.",
                            "Sign-In Successful", JOptionPane.INFORMATION_MESSAGE);
                }
            }
        }));
    }

    // ── Session persistence ──────────────────────────────────────────────────

    public static void saveSessionFile(Map<String, Object> profile) {
        if (profile == null || profile.isEmpty())
            return;
        try {
            AuthSession session = AuthSession.fromMap(profile);
            if (session != null && session.isValid()) {
                new CredentialStore().saveSession(session);
            }
        } catch (Exception ignored) {
            // Non-fatal session persistence failure
        }
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
            } catch (Exception ignored) {
                // Non-fatal listener callback failure
            }
        }
    }

    // ── Profile accessors ────────────────────────────────────────────────────

    public Map<String, Object> getCurrentProfile() {
        return UserController.getCurrentUserProfile();
    }

    public boolean isSignedIn() {
        Map<String, Object> p = getCurrentProfile();
        String email = (String) p.getOrDefault(KEY_EMAIL, "");
        String refreshToken = (String) p.getOrDefault("refreshToken", "");
        String idToken = (String) p.getOrDefault("idToken", p.getOrDefault("token", ""));
        return email != null && !email.trim().isEmpty() &&
                ((refreshToken != null && !refreshToken.trim().isEmpty())
                        || (idToken != null && !idToken.trim().isEmpty()));
    }

    public static final long GUEST_MAX_BYTES = 1024L * 1024L * 1024L; // 1 GB free guest storage limit

    public String getCurrentEmail() {
        if (!isSignedIn()) {
            return "Guest Tier · 1 GB Free Storage";
        }
        return (String) getCurrentProfile().getOrDefault(KEY_EMAIL, "");
    }

    public String getCurrentName() {
        if (!isSignedIn()) {
            return "Guest User";
        }
        return (String) getCurrentProfile().getOrDefault("name",
                getCurrentProfile().getOrDefault("displayName", "Google User"));
    }

    public boolean isPaymentsEnabled() {
        return Boolean.TRUE.equals(getCurrentProfile().get("enablePricingAndPayments"));
    }

    public String getCurrentPlan() {
        if (!isSignedIn())
            return "guest";
        return "unlimited";
    }

    public boolean isSuper() {
        return true;
    }

    public boolean isProOrSuper() {
        return true;
    }

    public boolean isFreeUnlimited() {
        return isSignedIn();
    }

    public boolean isFeaturesUnlocked() {
        return true;
    }

    public boolean isFeatureAllowed(String feature) {
        return true;
    }

    public long getUsedFiles() {
        Map<String, Object> p = getCurrentProfile();
        long f1 = getNumeric(p.get("usedFiles"));
        long f2 = getNumeric(p.get("filesProcessed"));
        long f3 = getNumeric(p.get("totalRestored"));
        long f4 = getNumeric(p.get("lifetimeFiles"));
        long f5 = getNumeric(p.get("totalFilesProcessed"));
        return Math.max(f1, Math.max(f2, Math.max(f3, Math.max(f4, f5))));
    }

    public long getUsedBytes() {
        Map<String, Object> p = getCurrentProfile();
        long b1 = getNumeric(p.get("usedBytes"));
        long b2 = getNumeric(p.get("bytesProcessed"));
        long b3 = getNumeric(p.get("totalBytes"));
        long b4 = getNumeric(p.get("lifetimeBytes"));
        long b5 = getNumeric(p.get("totalBytesProcessed"));
        long maxUser = Math.max(b1, Math.max(b2, Math.max(b3, Math.max(b4, b5))));
        if (!isSignedIn()) {
            try {
                long guestBytes = java.util.prefs.Preferences.userNodeForPackage(UserSyncBridgeService.class)
                        .getLong("guest_used_bytes", 0L);
                return Math.max(maxUser, guestBytes);
            } catch (Exception ignored) {}
        }
        return maxUser;
    }

    public long getMaxFiles() {
        return Long.MAX_VALUE; // No file limit
    }

    public long getMaxBytes() {
        return isSignedIn() ? Long.MAX_VALUE : GUEST_MAX_BYTES;
    }

    public boolean canProcessMoreFiles() {
        return true;
    }

    public boolean canProcessMoreFiles(long nextFilesCount) {
        return true;
    }

    public boolean canProcessMoreBytes(long nextBytes) {
        if (isSignedIn()) return true;
        return (getUsedBytes() + nextBytes) <= GUEST_MAX_BYTES;
    }

    public boolean isQuotaExceeded() {
        if (isSignedIn()) return false;
        return getUsedBytes() >= GUEST_MAX_BYTES;
    }

    public void recordUsage(int files, long bytes) {
        if (!isSignedIn()) {
            try {
                var prefs = java.util.prefs.Preferences.userNodeForPackage(UserSyncBridgeService.class);
                long current = prefs.getLong("guest_used_bytes", 0L);
                prefs.putLong("guest_used_bytes", current + Math.max(0, bytes));
                prefs.flush();
            } catch (Exception ignored) {}
        }
        UserController.incrementUsage(files, bytes);
    }

    // ── Mutators ─────────────────────────────────────────────────────────────

    public void signIn(String email, String plan) {
        Map<String, Object> updates = new HashMap<>(getCurrentProfile());
        updates.put(KEY_EMAIL, email);
        updates.put("plan", (plan == null || plan.isEmpty()) ? "free" : plan);
        updates.putIfAbsent("usedFiles", 0L);
        updates.putIfAbsent("usedBytes", 0L);
        UserController.updateUserProfile(updates);
    }

    /**
     * Explicit user-initiated sign-out. Deletes all local session and repository
     * state.
     */
    public void signOut() {
        try {
            credentialStore.clear();
        } catch (Exception ignored) {
            // Non-fatal credential store cleanup
        }
        try {
            googleAuthService.signOut();
        } catch (Exception ignored) {
            // Non-fatal google service cleanup
        }
        try {
            if (SESSION_FILE.exists()) {
                Files.deleteIfExists(SESSION_FILE.toPath());
            }
        } catch (Exception ignored) {
            // Non-fatal session file deletion
        }

        try {
            if (USERS_FILE.exists()) {
                Files.deleteIfExists(USERS_FILE.toPath());
            }
        } catch (Exception ignored) {
            // Non-fatal users file deletion
        }

        UserController.logout();
        handleProfileUpdate(new HashMap<>());
    }

    public void syncFromCloud(Map<String, Object> updates) {
        UserController.updateUserProfile(updates);
    }

    public void recordUsage(long files, long bytes) {
        recordUsageInternal(files, bytes, false);
    }

    public void recordUsageSync(long files, long bytes) {
        recordUsageInternal(files, bytes, true);
    }

    private void recordUsageInternal(long files, long bytes, boolean synchronous) {
        UserController.incrementUsage(files, bytes);
        saveSessionFile(UserController.getCurrentUserProfile());
        // Usage counts are saved purely into local storage/session during active execution.
        // Network cloud synchronization is invoked only when paused, stopped, completed,
        // or on app exit, preventing excessive and frequent network requests.
    }

    public void shutdown() {
        executorService.shutdownNow();
    }

    public static long getNumeric(Object obj) {
        if (obj instanceof Number num)
            return num.longValue();
        if (obj instanceof String str) {
            try {
                return Long.parseLong(str);
            } catch (Exception ignored) {
                // Return fallback 0 if parse fails
            }
        }
        return 0;
    }
}
