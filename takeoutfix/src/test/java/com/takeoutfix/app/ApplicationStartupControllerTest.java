package com.takeoutfix.app;

import com.takeoutfix.ads.AdSyncService;
import com.takeoutfix.auth.*;
import com.takeoutfix.network.NetworkMonitorService;
import com.takeoutfix.restore.SessionStatsService;
import com.takeoutfix.restore.infrastructure.ExtractionService;
import com.takeoutfix.ui.auth.SignInView;
import com.takeoutfix.ui.dashboard.DashboardView;
import com.takeoutfix.ui.startup.LoadingView;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("Application Startup Controller Architecture Tests")
public class ApplicationStartupControllerTest {

    @BeforeEach
    void setupHeadless() {
        System.setProperty("java.awt.headless", "true");
        new CredentialStore().clear();
        UserController.logout();
    }

    @org.junit.jupiter.api.AfterEach
    void tearDown() {
        new CredentialStore().clear();
        UserController.logout();
    }

    @Test
    @DisplayName("Verify startup controller initializes with clean state and displays LoadingView")
    void testStartupDisplaysLoadingView() {
        UserSyncBridgeService userSyncBridgeService = new UserSyncBridgeService();
        ApplicationStartupController controller = new ApplicationStartupController(
                userSyncBridgeService,
                new ExtractionService(),
                new SessionStatsService(),
                new NetworkMonitorService(),
                new AdSyncService()
        );

        controller.showLoadingView();

        assertNotNull(controller.getCurrentView(), "Current view should be present");
        assertTrue(controller.getCurrentView() instanceof LoadingView,
                "Current view should be an instance of LoadingView during loading state");
        assertFalse(controller.isAuthenticated(), "Should not be authenticated during initial loading");
    }

    @Test
    @DisplayName("Verify unauthenticated session triggers SignInView presentation")
    void testShowSignInPresentsSignInView() {
        UserSyncBridgeService userSyncBridgeService = new UserSyncBridgeService();
        ApplicationStartupController controller = new ApplicationStartupController(
                userSyncBridgeService,
                new ExtractionService(),
                new SessionStatsService(),
                new NetworkMonitorService(),
                new AdSyncService()
        );

        controller.showLoadingView();
        controller.showSignIn();

        assertNotNull(controller.getCurrentView(), "Current view should be present");
        assertTrue(controller.getCurrentView() instanceof SignInView,
                "Current view should be replaced with SignInView when authentication is required");
        assertFalse(controller.isAuthenticated(), "Controller should indicate unauthenticated status");
    }

    @Test
    @DisplayName("Verify authenticated session triggers DashboardView presentation")
    void testShowDashboardPresentsDashboardView() {
        UserSyncBridgeService userSyncBridgeService = new UserSyncBridgeService();
        ApplicationStartupController controller = new ApplicationStartupController(
                userSyncBridgeService,
                new ExtractionService(),
                new SessionStatsService(),
                new NetworkMonitorService(),
                new AdSyncService()
        );

        AuthSession mockSession = new AuthSession("test-uid-123", "alice@gmail.com", "Alice Smith",
                null, "mock-id-token", "mock-refresh-token", "unlimited", System.currentTimeMillis() + 3600_000L);

        controller.showLoadingView();
        controller.showDashboard(mockSession);

        assertNotNull(controller.getCurrentView(), "Current view should be present");
        assertTrue(controller.getCurrentView() instanceof DashboardView,
                "Current view should be replaced with DashboardView once authenticated");
        assertTrue(controller.isAuthenticated(), "Controller should indicate authenticated status");
    }
}
