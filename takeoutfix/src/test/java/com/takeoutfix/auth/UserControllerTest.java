package com.takeoutfix.auth;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class UserControllerTest {

    @BeforeEach
    void setUp() {
        UserController.setUserService(null);
        UserController.setProfileUpdateListener(null);
        UserController.getCurrentUserProfile().clear();
    }

    @Test
    @DisplayName("Syncing user profile should persist profile fields")
    void testSyncUser() {
        Map<String, Object> input = Map.of(
                "uid", "user_123",
                "email", "alice@example.com",
                "plan", "super",
                "usedFiles", 42L
        );

        UserController.syncUser(input);

        Map<String, Object> body = UserController.getCurrentUserProfile();
        assertNotNull(body);
        assertEquals("alice@example.com", body.get("email"));
        assertEquals("super", body.get("plan"));
        assertEquals(42L, body.get("usedFiles"));
    }

    @Test
    @DisplayName("Logout should clear user profile")
    void testLogout() {
        UserController.syncUser(Map.of("email", "bob@example.com"));
        assertFalse(UserController.getCurrentUserProfile().isEmpty());

        UserController.logout();
        assertTrue(UserController.getCurrentUserProfile().isEmpty(), "User profile must be empty after logout");
    }

    @Test
    @DisplayName("Incrementing usage should correctly update all metric keys and totals")
    void testIncrementUsage() {
        UserController.syncUser(Map.of("email", "operator@example.com", "usedFiles", 100L, "usedBytes", 50000000L));
        UserController.incrementUsage(50L, 25000000L);

        Map<String, Object> body = UserController.getCurrentUserProfile();
        assertEquals(150L, body.get("usedFiles"));
        assertEquals(75000000L, body.get("usedBytes"));
        assertEquals(150L, body.get("totalFilesProcessed"));
        assertEquals(75000000L, body.get("totalBytesProcessed"));
        assertEquals(150L, body.get("filesProcessed"));
        assertEquals(75000000L, body.get("bytesProcessed"));
        assertEquals(150L, body.get("totalRestored"));
        assertEquals(75000000L, body.get("totalBytes"));
    }
}
