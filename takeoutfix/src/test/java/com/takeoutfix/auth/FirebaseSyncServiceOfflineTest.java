package com.takeoutfix.auth;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("Firebase Sync Service Offline & Session Gate Tests")
class FirebaseSyncServiceOfflineTest {

    private FirebaseSyncService syncService;

    @BeforeEach
    void setUp() {
        UserController.getCurrentUserProfile().clear();
        syncService = new FirebaseSyncService();
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
