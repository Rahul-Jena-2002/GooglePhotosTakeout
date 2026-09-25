package com.takeoutfix.auth;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.jupiter.api.Assertions.*;

class UserSyncBridgeServiceTest {

    private UserSyncBridgeService bridgeService;

    @BeforeEach
    void setUp() {
        UserController.getCurrentUserProfile().clear();
        UserController.setUserService(null);
        bridgeService = new UserSyncBridgeService();
    }

    @org.junit.jupiter.api.AfterEach
    void tearDown() {
        UserController.getCurrentUserProfile().clear();
        UserController.setProfileUpdateListener(null);
    }

    @Test
    @DisplayName("All users should have unlimited file processing permission")
    void testFreeTierQuotaLimit() {
        UserController.getCurrentUserProfile().put("plan", "free");
        UserController.getCurrentUserProfile().put("usedFiles", 200L);

        assertTrue(bridgeService.canProcessMoreFiles(50), "200 + 50 should be allowed");
        assertTrue(bridgeService.canProcessMoreFiles(51), "Unlimited mode allows 51 additional files");
        assertFalse(bridgeService.isQuotaExceeded(), "Quota is never exceeded in unlimited mode");
    }

    @Test
    @DisplayName("Pro and Super tiers should have unlimited file processing permission")
    void testProAndSuperUnlimited() {
        UserController.getCurrentUserProfile().put("plan", "pro");
        UserController.getCurrentUserProfile().put("usedFiles", 5000L);
        assertTrue(bridgeService.canProcessMoreFiles(10000), "Pro tier must be unlimited");

        UserController.getCurrentUserProfile().put("plan", "super");
        UserController.getCurrentUserProfile().put("usedFiles", 50000L);
        assertTrue(bridgeService.canProcessMoreFiles(100000), "Super tier must be unlimited");
    }

    @Test
    @DisplayName("Listener receives real-time profile updates when user data changes")
    void testListenerNotification() {
        AtomicBoolean updated = new AtomicBoolean(false);
        bridgeService.addListener(profile -> {
            if ("test@example.com".equals(profile.get("email"))) {
                updated.set(true);
            }
        });

        UserController.syncUser(Map.of("email", "test@example.com", "plan", "pro"));

        assertTrue(updated.get(), "Listener should have been triggered with new email");
    }
}
