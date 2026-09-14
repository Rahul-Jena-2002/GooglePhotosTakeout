package com.rahul.controller;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class UserControllerTest {

    @BeforeEach
    void setUp() {
        UserController.setUserService(null);
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
}
