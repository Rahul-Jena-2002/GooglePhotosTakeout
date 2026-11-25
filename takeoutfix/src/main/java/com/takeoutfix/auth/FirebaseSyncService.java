package com.takeoutfix.auth;

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

    private static String getFirebaseApiKey() {
        return FirebaseConfig.getApiKey();
    }

    private static String getProjectId() {
        return FirebaseConfig.getProjectId();
    }

    private static String getSecureTokenUrl() {
        return "https://securetoken.googleapis.com/v1/token?key=" + getFirebaseApiKey();
    }

    private static String getFirestoreBaseUrl() {
        return "https://firestore.googleapis.com/v1/projects/" + getProjectId() + "/databases/(default)/documents";
    }

    private final File sessionFile;
    private final File pendingSyncFile;
    private final CredentialStore credentialStore;
    private final UsageJournal usageJournal;
    private final UsageBatchClient usageBatchClient;

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(6))
            .build();

    private volatile String currentIdToken = "";
    private volatile String currentTokenUid = "";
    public enum SyncState {
        IDLE, SYNCING, SYNCED, FAILED
    }

    private volatile String currentRefreshToken = "";
    private volatile SyncState currentSyncState = SyncState.IDLE;
    private volatile String lastSyncError = "";
    private Consumer<SyncState> syncStateListener = null;
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();
    private final AtomicBoolean closeSyncDone = new AtomicBoolean(false);

    public boolean hasActiveUserSession() {
        if (UserController.isLoggedIn()) {
            return true;
        }
        if (currentIdToken != null && !currentIdToken.isBlank()) {
            return true;
        }
        if (currentRefreshToken != null && !currentRefreshToken.isBlank()) {
            return true;
        }
        File mainSession = sessionFile;
        if (mainSession.exists()) {
            try {
                String content = Files.readString(mainSession.toPath());
                if (content != null && !content.isBlank()) {
                    JSONObject json = new JSONObject(content);
                    String id = json.optString("uid", json.optString("googleId", ""));
                    if (!id.isBlank()) return true;
                }
            } catch (Exception ignored) {}
        }
        if (sessionFile.exists()) {
            try {
                String content = Files.readString(sessionFile.toPath());
                if (content != null && !content.isBlank()) {
                    JSONObject json = new JSONObject(content);
                    String idTok = json.optString("idToken", "");
                    String refTok = json.optString("refreshToken", "");
                    if (!idTok.isBlank() || !refTok.isBlank()) return true;
                }
            } catch (Exception ignored) {}
        }
        return false;
    }

    public FirebaseSyncService() {
        this(new File(System.getProperty("user.home"), ".takeoutfix"), true);
    }

    FirebaseSyncService(File configDir, boolean startBackgroundSync) {
        this(configDir, startBackgroundSync, new CredentialStore(configDir));
    }

    FirebaseSyncService(File configDir, boolean startBackgroundSync, CredentialStore credentialStore) {
        this(configDir, startBackgroundSync, credentialStore, null);
    }

    FirebaseSyncService(File configDir, boolean startBackgroundSync, CredentialStore credentialStore, UsageBatchClient batchClient) {
        this.sessionFile = new File(configDir, "session.json");
        this.pendingSyncFile = new File(configDir, "pending_sync.json");
        this.credentialStore = credentialStore;
        this.usageJournal = new UsageJournal(configDir.toPath().resolve("pending-usage-v2"));
        this.usageBatchClient = batchClient != null ? batchClient : new UsageBatchClient(httpClient, getFirestoreBaseUrl(),
                "projects/" + getProjectId() + "/databases/(default)/documents");
        if (!startBackgroundSync) return;
        // Bootstrap tokens from session.json if present
        loadTokensFromSession(true);

        // Only schedule Firebase synchronization if an authenticated user session is active!
        if (hasActiveUserSession()) {
            scheduler.schedule(this::syncWithFirebase, 1, TimeUnit.SECONDS);
        } else {
            notifySyncState(SyncState.IDLE, "");
        }

        // Register JVM shutdown hook to sync once on close ONLY if an authenticated session exists
        try {
            Runtime.getRuntime().addShutdownHook(new Thread(() -> {
                if (hasActiveUserSession()) {
                    log.info("JVM Shutdown hook triggered: executing closing Firebase sync...");
                    syncOnClose();
                }
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
            if (!hasActiveUserSession()) {
                notifySyncState(SyncState.IDLE, "");
                if (onComplete != null) {
                    try { onComplete.accept(false); } catch (Exception ignored) {}
                }
                return;
            }
            boolean ok = performSync();
            if (onComplete != null) {
                try {
                    onComplete.accept(ok);
                } catch (Exception ignored) {}
            }
        });
    }

    private void loadTokensFromSession() {
        loadTokensFromSession(false);
    }

    private void loadTokensFromSession(boolean allowStartup) {
        long version = UserController.sessionVersion();
        try {
            AuthSession session = credentialStore.loadSession();
            if (session != null) {
                synchronized (UserController.class) {
                    if (version != UserController.sessionVersion()) return;
                    Object activeUid = UserController.getCurrentUserProfile().getOrDefault("uid", UserController.getCurrentUserProfile().get("googleId"));
                    if ((!allowStartup || activeUid != null) && !session.getUid().equals(activeUid)) return;
                    this.currentIdToken = session.getIdToken();
                    this.currentRefreshToken = session.getRefreshToken();
                    this.currentTokenUid = session.getUid();
                }
            }
        } catch (Exception e) {
            log.warn("Unable to load credentials for Firebase sync", e);
        }
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

    public synchronized void recordPendingOfflineSync(long deltaFiles, long deltaBytes) {
        if (deltaFiles <= 0 && deltaBytes <= 0) return;
        try {
            long existingFiles = 0;
            long existingBytes = 0;
            if (pendingSyncFile.exists()) {
                String content = Files.readString(pendingSyncFile.toPath());
                if (content != null && !content.isBlank()) {
                    JSONObject json = new JSONObject(content);
                    existingFiles = json.optLong("pendingFiles", 0);
                    existingBytes = json.optLong("pendingBytes", 0);
                }
            } else {
                File dir = pendingSyncFile.getParentFile();
                if (dir != null && !dir.exists()) dir.mkdirs();
            }
            JSONObject next = new JSONObject();
            next.put("pendingFiles", existingFiles + deltaFiles);
            next.put("pendingBytes", existingBytes + deltaBytes);
            next.put("lastQueuedAt", java.time.Instant.now().toString());
            Files.writeString(pendingSyncFile.toPath(), next.toString(2));
            log.info("Queued offline sync metrics to disk: +{} files, +{} bytes (total pending: {})", deltaFiles, deltaBytes, existingFiles + deltaFiles);
        } catch (Exception e) {
            log.warn("Failed to record pending offline sync: {}", e.getMessage());
        }
    }

    public synchronized void drainPendingOfflineSync() {
        // Legacy entries have no account ID or retry-safe transaction identifier.
        if (pendingSyncFile.exists()) {
            log.warn("Preserving legacy pending usage without replay; account ownership cannot be verified.");
        }
    }

    /**
     * Synchronizes user quota, tier, and promo state directly from Firestore.
     */
    public synchronized void syncWithFirebase() {
        if (!hasActiveUserSession()) {
            notifySyncState(SyncState.IDLE, "");
            return;
        }
        drainPendingOfflineSync();
        performSync();
    }

    private synchronized boolean performSync() {
        Map<String, Object> profile = UserController.getCurrentUserProfile();
        final String uid;
        final long sessionVersion;
        synchronized (UserController.class) {
            uid = (String) profile.getOrDefault("uid", profile.getOrDefault("googleId", ""));
            sessionVersion = UserController.sessionVersion();
        }
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
            notifySyncState(SyncState.FAILED, "Unable to sync: no valid account token is available.");
            return false;
        }

        // 2. Fetch User Document from Firestore
        boolean userSuccess = false;
        try {
            String userUrl = getFirestoreBaseUrl() + "/users/" + URLEncoder.encode(uid, StandardCharsets.UTF_8);
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(userUrl))
                    .header("Authorization", "Bearer " + tokenToUse)
                    .timeout(Duration.ofSeconds(8))
                    .GET()
                    .build();

            HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
            if (!UserController.isCurrentSession(uid, sessionVersion)) return false;
            if (resp.statusCode() == 200) {
                JSONObject doc = new JSONObject(resp.body());
                JSONObject fields = doc.optJSONObject("fields");
                if (fields != null) {
                    applyFirestoreUserData(fields, uid, tokenToUse, sessionVersion);
                    userSuccess = true;
                }
            } else if (resp.statusCode() == 401) {
                // Token expired — try one immediate forced refresh
                this.currentIdToken = "";
                String refreshed = ensureFreshIdToken();
                if (refreshed != null && !refreshed.isBlank()) {
                    tokenToUse = refreshed;
                }
            }
        } catch (Exception e) {
            log.debug("Firebase user sync offline/error: {}", e.getMessage());
        }

        if (!UserController.isCurrentSession(uid, sessionVersion)) return false;
        // 3. Sync Global Settings (e.g. Free Unlimited Promo Window)
        try {
            String settingsUrl = getFirestoreBaseUrl() + "/settings/global";
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
                    applyGlobalSettings(fields, uid, sessionVersion);
                }
            }
        } catch (Exception e) {
            log.debug("Global settings sync skipped: {}", e.getMessage());
        }

        if (!UserController.isCurrentSession(uid, sessionVersion)) return false;
        if (userSuccess) {
            notifySyncState(SyncState.SYNCED, "");
        } else {
            notifySyncState(SyncState.FAILED, "Account data could not be synced. Your local session is still available.");
        }
        return userSuccess;
    }

    void applyGlobalSettings(JSONObject fields, String uid, long sessionVersion) {
        Map<String, Object> globalUpdates = new HashMap<>();

        // Check if pricing and payments are enabled globally in Firestore settings/global
        boolean enablePricingAndPayments = getBoolean(fields, "enablePricingAndPayments", false);
        globalUpdates.put("enablePricingAndPayments", enablePricingAndPayments);

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

        // 2. Feature unlock setting (100% unlocked when pricing is disabled)
        boolean unlockFeatures = !enablePricingAndPayments || getBoolean(fields, "unlockFreeFeatures", false);
        globalUpdates.put("unlockFreeFeatures", unlockFeatures);

        // 3. Direct freeUnlimited flag
        boolean directFreeUnlimited = getBoolean(fields, "freeUnlimited", false) || getBoolean(fields, "unlimitedFree", false);

        // 4. Tier Thresholds (Admin Plan Thresholds)
        long freeMaxFiles = 250;
        long freeMaxSizeMB = 500;
        boolean thresholdsUnlimited = false;

        if (!enablePricingAndPayments) {
            // When payments are disabled, grant 100% unlimited access
            thresholdsUnlimited = true;
            freeMaxFiles = Long.MAX_VALUE;
            freeMaxSizeMB = Long.MAX_VALUE;
        } else if (fields.has("tierThresholds")) {
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

        boolean isFreeUnlimited = !enablePricingAndPayments || isFreePromo || directFreeUnlimited || thresholdsUnlimited;
        globalUpdates.put("isFreeUnlimited", isFreeUnlimited);
        globalUpdates.put("freeMaxFiles", freeMaxFiles);
        globalUpdates.put("freeMaxBytes", freeMaxSizeMB == Long.MAX_VALUE ? Long.MAX_VALUE : (freeMaxSizeMB * 1024L * 1024L));
        if (!enablePricingAndPayments) {
            globalUpdates.put("plan", "free");
        }

        UserController.updateUserProfileIfCurrent(uid, sessionVersion, globalUpdates);
    }

    void applyFirestoreUserData(JSONObject fields, String uid, String token, long sessionVersion) {
        boolean enablePricing = Boolean.TRUE.equals(UserController.getCurrentUserProfile().get("enablePricingAndPayments"));
        String plan = getString(fields, "plan", "free");
        if (!enablePricing) {
            plan = "free";
        }
        long remoteUsedFiles = getLong(fields, "usedFiles");
        long remoteTotalFiles = getLong(fields, "totalFilesProcessed");
        long remoteLifetimeFiles = getLong(fields, "lifetimeFiles");
        long remoteFilesProcessed = getLong(fields, "filesProcessed");
        long remoteTotalRestored = getLong(fields, "totalRestored");
        long remoteBestFiles = Math.max(remoteUsedFiles,
                Math.max(remoteTotalFiles,
                Math.max(remoteLifetimeFiles,
                Math.max(remoteFilesProcessed, remoteTotalRestored))));

        long remoteUsedBytes = getLong(fields, "usedBytes");
        long remoteTotalBytes = getLong(fields, "totalBytesProcessed");
        long remoteLifetimeBytes = getLong(fields, "lifetimeBytes");
        long remoteBytesProcessed = getLong(fields, "bytesProcessed");
        long remoteTotalBytesAll = getLong(fields, "totalBytes");
        long remoteBestBytes = Math.max(remoteUsedBytes,
                Math.max(remoteTotalBytes,
                Math.max(remoteLifetimeBytes,
                Math.max(remoteBytesProcessed, remoteTotalBytesAll))));

        boolean isAdmin = checkIfAdmin(uid, token);
        boolean userUnlimited = getBoolean(fields, "unlimited", false) || getBoolean(fields, "isFreeUnlimited", false);

        if (!enablePricing) {
            plan = "free";
        } else if (isAdmin) {
            plan = "super";
        }

        // Compare with local session usage so local progress is NEVER wiped by 0 from cloud!
        Map<String, Object> localProfile = UserController.getCurrentUserProfile();
        long localFiles = Math.max(toLong(localProfile.get("usedFiles")),
                Math.max(toLong(localProfile.get("lifetimeFiles")),
                Math.max(toLong(localProfile.get("totalFilesProcessed")),
                Math.max(toLong(localProfile.get("filesProcessed")), toLong(localProfile.get("totalRestored"))))));
        long localBytes = Math.max(toLong(localProfile.get("usedBytes")),
                Math.max(toLong(localProfile.get("lifetimeBytes")),
                Math.max(toLong(localProfile.get("totalBytesProcessed")),
                Math.max(toLong(localProfile.get("bytesProcessed")), toLong(localProfile.get("totalBytes"))))));

        long bestFiles = Math.max(remoteBestFiles, localFiles);
        long bestBytes = Math.max(remoteBestBytes, localBytes);

        Map<String, Object> updates = new HashMap<>();
        updates.put("plan", plan);
        updates.put("usedFiles", bestFiles);
        updates.put("usedBytes", bestBytes);
        updates.put("filesProcessed", bestFiles);
        updates.put("totalRestored", bestFiles);
        updates.put("totalFilesProcessed", bestFiles);
        updates.put("totalBytesProcessed", bestBytes);
        updates.put("bytesProcessed", bestBytes);
        updates.put("totalBytes", bestBytes);
        updates.put("lifetimeFiles", bestFiles);
        updates.put("lifetimeBytes", bestBytes);
        updates.put("isAdmin", isAdmin);
        if (userUnlimited) {
            updates.put("isFreeUnlimited", true);
        }

        if (!UserController.updateUserProfileIfCurrent(uid, sessionVersion, updates)) {
            log.debug("Discarded Firebase user data for an inactive account.");
            return;
        }

    }

    boolean checkIfAdmin(String uid, String token) {
        try {
            String adminUrl = getFirestoreBaseUrl() + "/admins/" + URLEncoder.encode(uid, StandardCharsets.UTF_8);
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
        final String expectedUid;
        final long version;
        final String refToken;
        synchronized (UserController.class) {
            expectedUid = (String) profile.getOrDefault("uid", profile.getOrDefault("googleId", ""));
            version = UserController.sessionVersion();
            if (expectedUid == null || expectedUid.isBlank()) return null;
            boolean sameCachedUser = expectedUid.equals(currentTokenUid);
            refToken = (String) profile.getOrDefault("refreshToken", sameCachedUser ? currentRefreshToken : "");
            String idToken = (String) profile.getOrDefault("idToken", profile.getOrDefault("token", sameCachedUser ? currentIdToken : ""));
            currentTokenUid = expectedUid;
            currentIdToken = idToken == null ? "" : idToken;
            currentRefreshToken = refToken == null ? "" : refToken;
            if (currentRefreshToken.isBlank()) return currentIdToken;
        }

        try {
            String form = "grant_type=refresh_token&refresh_token=" + URLEncoder.encode(refToken, StandardCharsets.UTF_8);
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(getSecureTokenUrl()))
                    .header("Content-Type", "application/x-www-form-urlencoded")
                    .timeout(Duration.ofSeconds(5))
                    .POST(HttpRequest.BodyPublishers.ofString(form))
                    .build();

            HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() == 200) {
                return applyRefreshedTokens(expectedUid, version, refToken, new JSONObject(resp.body()));
            }
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            log.warn("Firebase token refresh was interrupted.");
        } catch (Exception error) {
            log.warn("Firebase token refresh or credential save failed: {}", error.getClass().getSimpleName());
        }

        synchronized (UserController.class) {
            return UserController.isCurrentSession(expectedUid, version) ? this.currentIdToken : null;
        }
    }

    String applyRefreshedTokens(String expectedUid, long version, String requestedRefreshToken, JSONObject json) {
        synchronized (UserController.class) {
            if (!expectedUid.equals(json.optString("user_id", "")) || !UserController.isCurrentSession(expectedUid, version)) return null;
            Map<String, Object> profile = UserController.getCurrentUserProfile();
            Object profileRefresh = profile.get("refreshToken");
            String activeRefresh = profileRefresh instanceof String value && !value.isBlank() ? value : currentRefreshToken;
            if (!java.util.Objects.equals(requestedRefreshToken, activeRefresh)) return null;
            String refreshedIdToken = json.optString("id_token", "");
            if (refreshedIdToken.isBlank()) return null;
            String refreshedRefreshToken = json.optString("refresh_token", requestedRefreshToken);
            if (refreshedRefreshToken.isBlank()) return null;
            currentIdToken = refreshedIdToken;
            currentRefreshToken = refreshedRefreshToken;
            currentTokenUid = expectedUid;
            profile.put("idToken", currentIdToken);
            profile.put("token", currentIdToken);
            profile.put("refreshToken", currentRefreshToken);
            saveTokensToSession(credentialStore, currentIdToken, currentRefreshToken, expectedUid);
            return currentIdToken;
        }
    }

    void clearCachedTokens() {
        synchronized (UserController.class) {
            currentIdToken = "";
            currentRefreshToken = "";
            currentTokenUid = "";
        }
    }

    static void saveTokensToSession(CredentialStore store, String idToken, String refreshToken, String uid) {
        AuthSession session = store.loadSession();
        if (session == null || uid == null || uid.isBlank() || !uid.equals(session.getUid())) {
            return;
        }
        store.saveSession(session.withNewTokens(idToken, refreshToken, System.currentTimeMillis() + 3600_000L, session.getPlan()));
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
     * Sends account-owned usage batches without overwriting shared counters.
     */
    public synchronized boolean pushCurrentTotalsToCloud() {
        final String uid;
        final long version;
        synchronized (UserController.class) {
            if (!UserController.hasSignedInCredentials()) return false;
            Map<String, Object> profile = UserController.getCurrentUserProfile();
            Object id = profile.getOrDefault("uid", profile.get("googleId"));
            if (!(id instanceof String value) || value.isBlank()) return false;
            uid = value;
            version = UserController.sessionVersion();
        }
        try {
            var batches = usageJournal.pendingFor(uid);
            if (batches.isEmpty()) return true;
            String token = ensureFreshIdToken();
            if ((token == null || token.isBlank()) && UserController.isCurrentSession(uid, version)) {
                loadTokensFromSession();
                token = ensureFreshIdToken();
            }
            if (token == null || token.isBlank() || !UserController.isCurrentSession(uid, version)) return false;
            for (UsageJournal.Batch batch : batches) {
                if (!UserController.isCurrentSession(uid, version) || !usageBatchClient.apply(batch, token)) return false;
                if (!UserController.isCurrentSession(uid, version)) return false;
                usageJournal.acknowledge(batch);
            }
            return true;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        } catch (Exception e) {
            log.warn("Pending usage could not be synced; it remains queued for retry: {}", e.getClass().getSimpleName());
            return false;
        }
    }

    boolean hasPendingUsageForCurrentAccount() {
        synchronized (UserController.class) {
            if (!UserController.hasSignedInCredentials()) return false;
            Object id = UserController.getCurrentUserProfile().getOrDefault("uid", UserController.getCurrentUserProfile().get("googleId"));
            if (!(id instanceof String uid) || uid.isBlank()) return false;
            try { return !usageJournal.pendingFor(uid).isEmpty(); }
            catch (java.io.IOException e) { return true; }
        }
    }
    /**
     * Called once when the application closes:
     * Synchronizes accumulated local usage metrics back to Firebase Firestore.
     */
    public synchronized boolean syncOnClose() {
        if (!hasActiveUserSession()) {
            return false;
        }
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
