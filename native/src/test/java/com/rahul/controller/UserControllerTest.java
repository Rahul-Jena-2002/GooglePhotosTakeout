package com.rahul.controller;

import com.rahul.service.UserService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.http.ResponseEntity;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class UserControllerTest {

    private UserController userController;

    @BeforeEach
    void setUp() {
        UserService mockUserService = Mockito.mock(UserService.class);
        userController = new UserController(mockUserService);
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

        ResponseEntity<Map<String, Object>> response = userController.syncUser(input);
        assertEquals(200, response.getStatusCode().value());

        ResponseEntity<Map<String, Object>> currentResp = userController.getCurrentUser();
        Map<String, Object> body = currentResp.getBody();
        assertNotNull(body);
        assertEquals("alice@example.com", body.get("email"));
        assertEquals("super", body.get("plan"));
        assertEquals(42L, body.get("usedFiles"));
    }

    @Test
    @DisplayName("Logout should clear user profile")
    void testLogout() {
        userController.syncUser(Map.of("email", "bob@example.com"));
        assertFalse(UserController.getCurrentUserProfile().isEmpty());

        ResponseEntity<Map<String, String>> response = userController.logout();
        assertEquals(200, response.getStatusCode().value());
        assertTrue(UserController.getCurrentUserProfile().isEmpty(), "User profile must be empty after logout");
    }
}
