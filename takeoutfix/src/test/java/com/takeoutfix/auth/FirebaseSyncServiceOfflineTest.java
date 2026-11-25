package com.takeoutfix.auth;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Path;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("Firebase Sync Service Offline & Session Gate Tests")
class FirebaseSyncServiceOfflineTest {

    @TempDir
    Path tempDir;
    private FirebaseSyncService syncService;

    @BeforeEach
    void setUp() {
        UserController.getCurrentUserProfile().clear();
        UserController.setUserService(null);
        syncService = new FirebaseSyncService(tempDir.toFile(), false);
    }

    @AfterEach
    void tearDown() {
        UserController.getCurrentUserProfile().clear();
    }

    @Test
    @DisplayName("Should not sync when user is not logged in")
    void testNoSyncWhenLoggedOut() {
        assertFalse(UserController.isLoggedIn(), "User should be logged out initially");
        assertFalse(syncService.hasActiveUserSession(), "Should not report active user session when logged out");

        // syncOnClose should immediately bail out and return false without network calls
        assertFalse(syncService.syncOnClose(), "syncOnClose should return false when user is not logged in");

        // syncWithFirebase should stay IDLE without error
        syncService.syncWithFirebase();
        assertEquals(FirebaseSyncService.SyncState.IDLE, syncService.getSyncState());
        assertEquals("", syncService.getLastSyncError());
    }

    @Test
    void pendingUsageUsesConfiguredDirectory() throws Exception {
        syncService.recordPendingOfflineSync(2, 123);
        org.json.JSONObject queued = new org.json.JSONObject(java.nio.file.Files.readString(tempDir.resolve("pending_sync.json")));
        assertEquals(2, queued.getLong("pendingFiles"));
        assertEquals(123, queued.getLong("pendingBytes"));
    }

    @Test
    void legacyPendingUsageIsNotReplayedIntoCurrentAccount() throws Exception {
        syncService.recordPendingOfflineSync(2, 123);
        UserController.updateUserProfile(Map.of("uid", "test-user", "email", "test@example.invalid", "usedFiles", 5L, "usedBytes", 500L));
        syncService.drainPendingOfflineSync();
        syncService.drainPendingOfflineSync();
        assertTrue(java.nio.file.Files.exists(tempDir.resolve("pending_sync.json")));
        assertEquals(5L, ((Number) UserController.getCurrentUserProfile().get("usedFiles")).longValue());
        assertEquals(500L, ((Number) UserController.getCurrentUserProfile().get("usedBytes")).longValue());
    }

    @Test
    void missingTokenDoesNotReportSuccessfulSync() {
        UserController.updateUserProfile(Map.of("uid", "test-user", "email", "test@example.com"));
        syncService.syncWithFirebase();
        assertEquals(FirebaseSyncService.SyncState.FAILED, syncService.getSyncState());
        assertTrue(syncService.getLastSyncError().contains("token"));
        assertTrue(UserController.isLoggedIn());
    }

    @Test
    void tokenFallbackDoesNotReloadSignedOutCredentials() throws Exception {
        UserController.setProfileUpdateListener(null);
        AuthSession session = new AuthSession("user", "user@example.test", "User", "", "token", "refresh", "free", Long.MAX_VALUE);
        CredentialStore store = new CredentialStore(tempDir.toFile()) {
            @Override public synchronized AuthSession loadSession() { return session; }
        };
        FirebaseSyncService service = new FirebaseSyncService(tempDir.toFile(), false, store);
        UserController.syncUser(session.toMap());
        UserController.logout();
        var method = FirebaseSyncService.class.getDeclaredMethod("loadTokensFromSession");
        method.setAccessible(true);
        method.invoke(service);
        assertFalse(service.hasActiveUserSession());
    }

    @Test
    void usagePushRejectsProfileWithoutSignedInCredentials() {
        UserController.setProfileUpdateListener(null);
        var switchOnLoad = new java.util.concurrent.atomic.AtomicBoolean();
        CredentialStore store = new CredentialStore(tempDir.toFile()) {
            @Override public synchronized AuthSession loadSession() {
                if (switchOnLoad.get()) {
                    UserController.syncUser(Map.of("uid", "new-user", "idToken", "new-token"));
                }
                return null;
            }
        };
        FirebaseSyncService service = new FirebaseSyncService(tempDir.toFile(), false, store);
        Number mustNotRead = new Number() {
            @Override public int intValue() { throw new AssertionError("stale usage read"); }
            @Override public long longValue() { throw new AssertionError("stale usage read"); }
            @Override public float floatValue() { throw new AssertionError("stale usage read"); }
            @Override public double doubleValue() { throw new AssertionError("stale usage read"); }
        };
        UserController.syncUser(Map.of("uid", "old-user"));
        UserController.getCurrentUserProfile().put("usedFiles", mustNotRead);
        switchOnLoad.set(true);

        assertFalse(service.pushCurrentTotalsToCloud());
        assertEquals("old-user", UserController.getCurrentUserProfile().get("uid"));
    }

    @Test
    void tokenRefreshIsDiscardedAfterSignOutOrNewSession() {
        UserController.setProfileUpdateListener(null);
        var saves = new java.util.concurrent.atomic.AtomicInteger();
        AuthSession session = new AuthSession("user", "user@example.test", "User", "", "old-token", "old-refresh", "free", Long.MAX_VALUE);
        CredentialStore store = new CredentialStore(tempDir.toFile()) {
            @Override public synchronized AuthSession loadSession() { return session; }
            @Override public synchronized void saveSession(AuthSession updated) { saves.incrementAndGet(); }
        };
        FirebaseSyncService service = new FirebaseSyncService(tempDir.toFile(), false, store);
        org.json.JSONObject response = new org.json.JSONObject().put("user_id", "user")
                .put("id_token", "new-token").put("refresh_token", "new-refresh");
        UserController.syncUser(session.toMap());
        long version = UserController.sessionVersion();
        assertNull(service.applyRefreshedTokens("user", version, "old-refresh",
                new org.json.JSONObject().put("user_id", "user").put("id_token", "").put("refresh_token", "new-refresh")));
        assertNull(service.applyRefreshedTokens("user", version, "old-refresh",
                new org.json.JSONObject().put("user_id", "user").put("id_token", "new-token").put("refresh_token", "")));
        assertEquals("old-token", UserController.getCurrentUserProfile().get("idToken"));
        assertEquals(0, saves.get());
        assertEquals("new-token", service.applyRefreshedTokens("user", version, "old-refresh", response));
        assertEquals(1, saves.get());

        UserController.logout();
        service.clearCachedTokens();
        assertNull(service.applyRefreshedTokens("user", version, "old-refresh", response));
        assertTrue(UserController.getCurrentUserProfile().isEmpty());
        assertEquals(1, saves.get());

        UserController.syncUser(session.toMap());
        assertNull(service.applyRefreshedTokens("user", version, "old-refresh", response));
        assertEquals("old-token", UserController.getCurrentUserProfile().get("idToken"));
        assertEquals(1, saves.get());
        long currentVersion = UserController.sessionVersion();
        UserController.updateUserProfile(Map.of("refreshToken", "rotated-refresh"));
        assertNull(service.applyRefreshedTokens("user", currentVersion, "old-refresh", response));
        assertEquals("rotated-refresh", UserController.getCurrentUserProfile().get("refreshToken"));
        assertEquals(1, saves.get());
    }

    @Test
    void globalSettingsApplyOnlyToTheAccountThatRequestedThem() {
        UserController.setProfileUpdateListener(null);
        UserController.updateUserProfile(Map.of("uid", "old-user", "email", "old@example.test", "idToken", "old-token"));
        long version = UserController.sessionVersion();
        syncService.applyGlobalSettings(new org.json.JSONObject(), "old-user", version);
        assertEquals(false, UserController.getCurrentUserProfile().get("enablePricingAndPayments"));

        UserController.logout();
        UserController.syncUser(Map.of("uid", "old-user", "email", "old@example.test", "idToken", "new-token"));
        syncService.applyGlobalSettings(new org.json.JSONObject(), "old-user", version);
        assertFalse(UserController.getCurrentUserProfile().containsKey("enablePricingAndPayments"));
        UserController.syncUser(Map.of("uid", "new-user", "email", "new@example.test", "idToken", "new-token"));
        syncService.applyGlobalSettings(new org.json.JSONObject(), "old-user", version);
        assertFalse(UserController.getCurrentUserProfile().containsKey("enablePricingAndPayments"));
        UserController.logout();
        syncService.applyGlobalSettings(new org.json.JSONObject(), "old-user", version);
        assertTrue(UserController.getCurrentUserProfile().isEmpty());
    }

    @Test
    void staleCloudUserDataCannotRestoreSignedOutProfile() {
        UserController.setProfileUpdateListener(null);
        FirebaseSyncService service = new FirebaseSyncService(tempDir.toFile(), false) {
            @Override boolean checkIfAdmin(String uid, String token) {
                UserController.logout();
                return true;
            }
        };
        UserController.updateUserProfile(Map.of("uid", "old-user", "email", "old@example.test", "idToken", "token"));
        service.applyFirestoreUserData(new org.json.JSONObject(), "old-user", "token", UserController.sessionVersion());
        assertTrue(UserController.getCurrentUserProfile().isEmpty());
    }

    @Test
    void staleCloudUserDataCannotModifyNewAccount() {
        UserController.setProfileUpdateListener(null);
        FirebaseSyncService service = new FirebaseSyncService(tempDir.toFile(), false) {
            @Override boolean checkIfAdmin(String uid, String token) {
                UserController.syncUser(Map.of("uid", "new-user", "email", "new@example.test", "idToken", "new-token"));
                return true;
            }
        };
        UserController.updateUserProfile(Map.of("uid", "old-user", "email", "old@example.test", "idToken", "token"));
        service.applyFirestoreUserData(new org.json.JSONObject(), "old-user", "token", UserController.sessionVersion());
        assertEquals("new-user", UserController.getCurrentUserProfile().get("uid"));
        assertFalse(UserController.getCurrentUserProfile().containsKey("isAdmin"));
    }

    @Test
    void staleProfileAdminFlagDoesNotGrantAdminAccess() {
        FirebaseSyncService service = new FirebaseSyncService(tempDir.toFile(), false) {
            @Override boolean checkIfAdmin(String uid, String token) { return false; }
        };
        UserController.updateUserProfile(Map.of("uid", "user", "isAdmin", true));
        org.json.JSONObject fields = new org.json.JSONObject()
                .put("isAdmin", new org.json.JSONObject().put("booleanValue", true));

        service.applyFirestoreUserData(fields, "user", "token", UserController.sessionVersion());

        assertEquals(false, UserController.getCurrentUserProfile().get("isAdmin"));
    }

    @Test
    @DisplayName("Should detect active user session when user profile has valid credentials")
    void testActiveSessionDetection() {
        UserController.updateUserProfile(Map.of(
                "uid", "test-user-12345",
                "email", "test@takeoutfix.com",
                "displayName", "Test User"
        ));

        assertTrue(UserController.isLoggedIn(), "User should be logged in after profile update");
        assertTrue(syncService.hasActiveUserSession(), "Should detect active user session for authenticated user");
    }
}
