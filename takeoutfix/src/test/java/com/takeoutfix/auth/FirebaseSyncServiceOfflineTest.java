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
