package com.takeoutfix.app;

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

    private UserSyncBridgeService userSyncBridgeService;

    @BeforeEach
    void setupHeadless() {
        System.setProperty("java.awt.headless", "true");
        new CredentialStore().clear();
        UserController.logout();
        userSyncBridgeService = new UserSyncBridgeService();
    }

    @org.junit.jupiter.api.AfterEach
    void tearDown() {
        if (userSyncBridgeService != null) {
            userSyncBridgeService.shutdown();
        }
        new CredentialStore().clear();
        UserController.logout();
    }

    @Test
    @DisplayName("Verify startup controller initializes with clean state and displays LoadingView")
    void testStartupDisplaysLoadingView() {
        ApplicationStartupController controller = new ApplicationStartupController(
                userSyncBridgeService,
                new ExtractionService(),
                new SessionStatsService(),
                new NetworkMonitorService()
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
        ApplicationStartupController controller = new ApplicationStartupController(
                userSyncBridgeService,
                new ExtractionService(),
                new SessionStatsService(),
                new NetworkMonitorService()
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
        ApplicationStartupController controller = new ApplicationStartupController(
                userSyncBridgeService,
                new ExtractionService(),
                new SessionStatsService(),
                new NetworkMonitorService()
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
