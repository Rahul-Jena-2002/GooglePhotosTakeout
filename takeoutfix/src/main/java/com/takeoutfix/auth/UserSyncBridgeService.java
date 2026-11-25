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
import java.util.Objects;
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

    private final ExecutorService executorService = Executors.newCachedThreadPool();
    private final java.util.concurrent.atomic.AtomicBoolean usageSyncRunning = new java.util.concurrent.atomic.AtomicBoolean();
    private final java.util.concurrent.atomic.AtomicBoolean retryStartupAuthentication = new java.util.concurrent.atomic.AtomicBoolean();
    private final java.util.concurrent.atomic.AtomicBoolean startupRetryRunning = new java.util.concurrent.atomic.AtomicBoolean();
    private final java.util.concurrent.atomic.AtomicLong sessionGeneration = new java.util.concurrent.atomic.AtomicLong();
    // Attribution only: a saved identity is not proof of a currently valid sign-in.
    private volatile String offlineUsageOwner;
    private final List<Consumer<Map<String, Object>>> listeners = new CopyOnWriteArrayList<>();
    private final FirebaseSyncService firebaseSyncService;
    private final CredentialStore credentialStore;
    private final GoogleAuthService googleAuthService;
    private final UsageAccumulator usageAccumulator;
    private final java.util.concurrent.ScheduledExecutorService usageCheckpoint = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread thread = new Thread(r, "takeoutfix-usage-checkpoint");
        thread.setDaemon(true);
        return thread;
    });
    private final Object cloudEnrichmentLock = new Object();
    private long cloudEnrichmentGeneration;

    public UserSyncBridgeService() {
        this(new GoogleAuthService(), new CredentialStore());
    }

    @Autowired
    public UserSyncBridgeService(GoogleAuthService googleAuthService, CredentialStore credentialStore) {
        this(googleAuthService, credentialStore, new FirebaseSyncService());
    }

    UserSyncBridgeService(GoogleAuthService googleAuthService, CredentialStore credentialStore, FirebaseSyncService firebaseSyncService) {
        this.googleAuthService = googleAuthService;
        this.credentialStore = credentialStore;
        this.firebaseSyncService = firebaseSyncService;
        this.usageAccumulator = new UsageAccumulator(new UsageJournal(credentialStore.getConfigDir().toPath().resolve("pending-usage-v2")));
        usageCheckpoint.scheduleWithFixedDelay(this::checkpointCommittedUsage, 10, 10, java.util.concurrent.TimeUnit.SECONDS);
        usageCheckpoint.scheduleWithFixedDelay(this::syncIfOnline, 30, 30, java.util.concurrent.TimeUnit.SECONDS);
        UserController.setProfileUpdateListener(this::handleProfileUpdate);
    }

    public void recordCommittedOutput(long files, long bytes) {
        synchronized (UserController.class) {
            Object uid = UserController.hasSignedInCredentials()
                    ? UserController.getCurrentUserProfile().getOrDefault("uid", UserController.getCurrentUserProfile().get("googleId"))
                    : offlineUsageOwner;
            if (uid instanceof String id && !id.isBlank()) usageAccumulator.add(id, files, bytes);
        }
    }

    public void checkpointCommittedUsage() {
        try {
            usageAccumulator.checkpoint();
        } catch (java.io.IOException e) {
            log.warn("Could not checkpoint restored usage; it remains in memory for retry.", e);
        }
    }

    public GoogleAuthService getGoogleAuthService() {
        return googleAuthService;
    }

    public SessionManager getSessionManager() {
        return googleAuthService.getSessionManager();
    }

    public void commitAuthenticatedSession(AuthSession session) {
        if (session == null || !session.isAuthenticated()) throw new IllegalArgumentException("Authenticated session required.");
        SessionManager manager = getSessionManager();
        synchronized (manager) {
            sessionGeneration.incrementAndGet();
            retryStartupAuthentication.set(false);
            offlineUsageOwner = null;
            manager.save(session);
            UserController.syncUser(session.toMap());
        }
        syncIfOnline();
    }

    public FirebaseSyncService getFirebaseSyncService() {
        return firebaseSyncService;
    }

    public void triggerCloudSync(Consumer<Boolean> onComplete) {
        final long generation;
        final Map<String, Object> current;
        synchronized (cloudEnrichmentLock) {
            generation = cloudEnrichmentGeneration;
            current = new HashMap<>(UserController.getCurrentUserProfile());
        }
        executorService.submit(() -> {
            Map<String, Object> enriched = new HashMap<>(current);
            try {
                DirectAuthHttpsService.enrichFromFirestoreIfPresent(enriched);
            } catch (Exception ignored) {
                // Non-fatal optional cloud enrichment failure
            }
            if (!applyCloudEnrichment(current, enriched, generation)) {
                if (onComplete != null) onComplete.accept(false);
                return;
            }
            firebaseSyncService.triggerImmediateSync(onComplete);
        });
    }

    static Map<String, Object> enrichmentChanges(Map<String, Object> original, Map<String, Object> enriched,
            Map<String, Object> active) {
        Map<String, Object> changes = new HashMap<>(enriched);
        changes.entrySet().removeIf(entry -> Objects.equals(original.get(entry.getKey()), entry.getValue())
                || !Objects.equals(original.get(entry.getKey()), active.get(entry.getKey())));
        return changes;
    }

    boolean applyCloudEnrichment(Map<String, Object> profile, Map<String, Object> enriched, long generation) {
        synchronized (cloudEnrichmentLock) {
            Object uid = profile.getOrDefault("uid", profile.get("googleId"));
            Map<String, Object> active = UserController.getCurrentUserProfile();
            Object activeUid = active.getOrDefault("uid", active.get("googleId"));
            if (generation != cloudEnrichmentGeneration || !(uid instanceof String id)
                    || id.isBlank() || !id.equals(activeUid) || !UserController.hasSignedInCredentials()) {
                return false;
            }
            UserController.updateUserProfile(enrichmentChanges(profile, enriched, active));
            saveProfileSession(active);
            return true;
        }
    }

    void invalidateCloudEnrichment() {
        synchronized (cloudEnrichmentLock) {
            cloudEnrichmentGeneration++;
        }
    }

    /** Attempts to send queued usage; unsuccessful batches stay on disk for retry. */
    public void syncIfOnline() {
        if (!isSignedIn()) {
            if (retryStartupAuthentication.get() && startupRetryRunning.compareAndSet(false, true)) {
                try {
                    verifyStartupSession(ignored -> startupRetryRunning.set(false));
                } catch (java.util.concurrent.RejectedExecutionException e) {
                    startupRetryRunning.set(false);
                    if (!executorService.isShutdown()) throw e;
                }
            }
            return;
        }
        if (!usageSyncRunning.compareAndSet(false, true)) {
            return;
        }
        try {
            executorService.submit(() -> {
                try {
                    if (!firebaseSyncService.hasPendingUsageForCurrentAccount()) return;
                    if (firebaseSyncService.pushCurrentTotalsToCloud()) firebaseSyncService.syncWithFirebase();
                } finally {
                    usageSyncRunning.set(false);
                }
            });
        } catch (java.util.concurrent.RejectedExecutionException e) {
            usageSyncRunning.set(false);
            if (!executorService.isShutdown()) throw e;
        }
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
        long generation = sessionGeneration.get();
        executorService.submit(() -> {
            boolean valid = false;
            try {
                SessionManager manager = getSessionManager();
                synchronized (manager) {
                    if (generation == sessionGeneration.get() && !isSignedIn()) {
                        AuthSession saved = credentialStore.loadSession();
                        offlineUsageOwner = saved != null && saved.isAuthenticated() ? saved.getUid() : null;
                    }
                }
                SessionRestoreResult result = manager.restore();
                synchronized (manager) {
                    if (generation == sessionGeneration.get() && !isSignedIn()) {
                        retryStartupAuthentication.set(result instanceof SessionRestoreResult.AuthUnavailable);
                        if (!(result instanceof SessionRestoreResult.AuthUnavailable)) offlineUsageOwner = null;
                    }
                }
                if (result instanceof SessionRestoreResult.Authenticated auth) {
                    synchronized (manager) {
                        if (generation == sessionGeneration.get() && manager.getCurrentSession() == auth.session()) {
                            offlineUsageOwner = null;
                            UserController.syncUser(auth.session().toMap());
                            valid = true;
                        }
                    }
                    if (valid) {
                        triggerCloudSync(null);
                        syncIfOnline();
                    }
                }
            } catch (Exception e) {
                valid = false;
            }

            final boolean authOk = valid;
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
                    saveProfileSession(profile);
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
                    saveProfileSession(profile);
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
                    saveProfileSession(profile);
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
        saveSessionFile(profile, new CredentialStore());
    }

    private void saveProfileSession(Map<String, Object> profile) {
        saveSessionFile(profile, credentialStore);
    }

    private static void saveSessionFile(Map<String, Object> profile, CredentialStore store) {
        if (profile == null || profile.isEmpty())
            return;
        try {
            AuthSession session = AuthSession.fromMap(profile);
            if (session != null && session.isValid()) {
                store.saveSession(session);
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
        saveProfileSession(profile);
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
        return UserController.hasSignedInCredentials();
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
    public boolean signOut() {
        synchronized (getSessionManager()) {
            return signOutLocked();
        }
    }

    private boolean signOutLocked() {
        sessionGeneration.incrementAndGet();
        retryStartupAuthentication.set(false);
        offlineUsageOwner = null;
        File sessionFile = new File(credentialStore.getConfigDir(), "session.json");
        File usersFile = new File(credentialStore.getConfigDir(), "users.json");
        invalidateCloudEnrichment();
        synchronized (UserController.class) {
            UserController.logout();
            firebaseSyncService.clearCachedTokens();
        }
        boolean cleared = true;
        try {
            cleared = credentialStore.clear();
        } catch (Exception e) {
            cleared = false;
            log.warn("Could not clear stored credentials", e);
        }
        try {
            if (!googleAuthService.signOut()) cleared = false;
        } catch (Exception e) {
            cleared = false;
            log.warn("Could not clear Google sign-in credentials", e);
        }
        try {
            if (sessionFile.exists()) {
                Files.deleteIfExists(sessionFile.toPath());
            }
        } catch (Exception e) {
            cleared = false;
            log.warn("Could not remove session file", e);
        }

        try {
            if (usersFile.exists()) {
                Files.deleteIfExists(usersFile.toPath());
            }
        } catch (Exception e) {
            cleared = false;
            log.warn("Could not remove local account file", e);
        }

        handleProfileUpdate(new HashMap<>());
        return cleared;
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
        saveProfileSession(UserController.getCurrentUserProfile());
        // Usage counts are saved purely into local storage/session during active execution.
        // Network cloud synchronization is invoked only when paused, stopped, completed,
        // or on app exit, preventing excessive and frequent network requests.
    }

    public void shutdown() {
        usageCheckpoint.shutdown();
        checkpointCommittedUsage();
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
