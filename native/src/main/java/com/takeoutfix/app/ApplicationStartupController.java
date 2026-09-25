package com.takeoutfix.app;

import com.takeoutfix.ads.AdSyncService;
import com.takeoutfix.auth.AuthSession;
import com.takeoutfix.auth.GoogleAuthService;
import com.takeoutfix.auth.SessionManager;
import com.takeoutfix.auth.SessionRestoreResult;
import com.takeoutfix.auth.UserController;
import com.takeoutfix.auth.UserSyncBridgeService;
import com.takeoutfix.network.NetworkMonitorService;
import com.takeoutfix.restore.SessionStatsService;
import com.takeoutfix.restore.infrastructure.ExtractionService;
import com.takeoutfix.ui.auth.SignInView;
import com.takeoutfix.ui.dashboard.DashboardView;
import com.takeoutfix.ui.startup.LoadingView;
import com.takeoutfix.shared.ui.UiFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import javax.swing.*;
import java.awt.*;
import java.awt.event.WindowAdapter;
import java.awt.event.WindowEvent;
import java.util.concurrent.CompletableFuture;

/**
 * Top-level Application Startup & Navigation Controller.
 *
 * Coordinates view transitions within the single main application window:
 *   TakeoutFix starts ──► LoadingView ──► SessionManager.restore()
 *                                               │
 *                                ┌──────────────┴──────────────┐
 *                                ▼                             ▼
 *                          DashboardView                   SignInView
 *                                                              │
 *                                                    Continue with Google
 *                                                              │
 *                                                              ▼
 *                                                        DashboardView
 */
@Component
public class ApplicationStartupController {

    private final SessionManager sessionManager;
    private final GoogleAuthService googleAuthService;
    private final UserSyncBridgeService userSyncBridgeService;
    private final ExtractionService extractionService;
    private final SessionStatsService sessionStatsService;
    private final NetworkMonitorService networkMonitorService;
    private final AdSyncService adSyncService;

    private JFrame mainFrame;
    private LoadingView loadingView;
    private SignInView signInView;
    private DashboardView dashboardView;
    private boolean isAuthenticated = false;

    @Autowired
    public ApplicationStartupController(UserSyncBridgeService userSyncBridgeService,
                                        ExtractionService extractionService,
                                        SessionStatsService sessionStatsService,
                                        NetworkMonitorService networkMonitorService,
                                        AdSyncService adSyncService) {
        this.userSyncBridgeService = userSyncBridgeService;
        this.sessionManager = userSyncBridgeService != null ? userSyncBridgeService.getSessionManager() : new SessionManager();
        this.googleAuthService = userSyncBridgeService != null ? userSyncBridgeService.getGoogleAuthService() : new GoogleAuthService();
        this.extractionService = extractionService;
        this.sessionStatsService = sessionStatsService;
        this.networkMonitorService = networkMonitorService;
        this.adSyncService = adSyncService;
    }

    public ApplicationStartupController() {
        this(new UserSyncBridgeService(), new ExtractionService(), new SessionStatsService(),
                new NetworkMonitorService(), new AdSyncService());
    }

    /**
     * Entry point: Revalidates session before rendering UI.
     *
     * STEP 4 — Silent re-auth on every app launch:
     * if session.json has refreshToken:
     *     POST https://securetoken.googleapis.com/v1/token?key={API_KEY}
     *     Content-Type: application/x-www-form-urlencoded
     *     Body: grant_type=refresh_token&refresh_token={stored_refresh_token}
     *
     *     if success: use new idToken, render GUI already signed in. Browser is never opened.
     *     if 400/invalid_grant: delete session.json, show Sign-In dialog (Step 1)
     * else:
     *     show Sign-In dialog (Step 1)
     */
    public void startApplication() {
        initMainFrame();

        com.takeoutfix.auth.CredentialStore credStore = new com.takeoutfix.auth.CredentialStore();
        if (!credStore.hasStoredCredential()) {
            // Unauthenticated / fresh start: Open dashboard directly in Guest Mode
            showDashboard(AuthSession.unauthenticated());
            return;
        }

        // Session exists with refreshToken: Revalidate silently BEFORE rendering main dashboard
        showLoadingView();

        CompletableFuture.supplyAsync(sessionManager::restore)
                .thenAccept(result -> SwingUtilities.invokeLater(() -> {
                    if (result instanceof SessionRestoreResult.Authenticated auth) {
                        isAuthenticated = true;
                        UserController.syncUser(auth.session().toMap());
                        userSyncBridgeService.triggerCloudSync(null);
                        showDashboard(auth.session());
                    } else if (result instanceof SessionRestoreResult.AuthUnavailable) {
                        // Preserved offline session during transient network failures
                        AuthSession stored = credStore.loadSession();
                        if (stored != null && stored.isAuthenticated()) {
                            isAuthenticated = true;
                            UserController.syncUser(stored.toMap());
                            showDashboard(stored);
                        } else {
                            isAuthenticated = false;
                            showDashboard(AuthSession.unauthenticated());
                        }
                    } else {
                        // 400, invalid_grant, expired or corrupt token:
                        // Fall back to Dashboard in Guest Mode
                        isAuthenticated = false;
                        credStore.clear();
                        userSyncBridgeService.signOut();
                        showDashboard(AuthSession.unauthenticated());
                    }
                }))
                .exceptionally(error -> {
                    SwingUtilities.invokeLater(() -> {
                        isAuthenticated = false;
                        credStore.clear();
                        showDashboard(AuthSession.unauthenticated());
                    });
                    return null;
                });
    }

    private JComponent currentView;

    private void initMainFrame() {
        if (GraphicsEnvironment.isHeadless()) {
            return;
        }
        mainFrame = new JFrame("TakeoutFix");
        UiFactory.applyAppIcon(mainFrame);
        mainFrame.setDefaultCloseOperation(JFrame.DO_NOTHING_ON_CLOSE);
        mainFrame.addWindowListener(new WindowAdapter() {
            @Override
            public void windowClosing(WindowEvent e) {
                handleWindowClose();
            }
        });

        mainFrame.addWindowFocusListener(new WindowAdapter() {
            @Override
            public void windowLostFocus(WindowEvent e) {
                MenuSelectionManager.defaultManager().clearSelectedPath();
                if (dashboardView != null) {
                    dashboardView.closeOpenPopups();
                }
            }

            @Override
            public void windowDeactivated(WindowEvent e) {
                MenuSelectionManager.defaultManager().clearSelectedPath();
                if (dashboardView != null) {
                    dashboardView.closeOpenPopups();
                }
            }
        });

        // Global JVM shutdown hook
        try {
            Runtime.getRuntime().addShutdownHook(new Thread(() -> {
                if (dashboardView != null) {
                    try {
                        dashboardView.flushExtractionProgressToCloud("jvm shutdown", true);
                    } catch (Exception ignored) {}
                }
            }, "TakeoutFix-StartupControllerShutdown"));
        } catch (Exception ignored) {}
    }

    public synchronized void ensureMainFrameInitialized() {
        if (mainFrame == null && !GraphicsEnvironment.isHeadless()) {
            initMainFrame();
        }
    }

    public void showLoadingView() {
        ensureMainFrameInitialized();
        if (loadingView == null) {
            loadingView = new LoadingView();
        }
        loadingView.setStatus("Checking secure credentials...");
        this.currentView = loadingView;

        if (mainFrame != null) {
            mainFrame.setTitle("TakeoutFix");
            mainFrame.setResizable(false);
            mainFrame.setContentPane(loadingView);
            mainFrame.setSize(440, 380);
            mainFrame.setLocationRelativeTo(null);
            mainFrame.setVisible(true);
        }
    }

    public void showSignIn() {
        ensureMainFrameInitialized();
        isAuthenticated = false;
        if (signInView == null) {
            signInView = new SignInView(googleAuthService, sessionManager, this::onAuthenticationSuccess);
        }
        this.currentView = signInView;

        if (mainFrame != null) {
            mainFrame.setTitle("TakeoutFix — Sign In");
            mainFrame.setResizable(false);
            mainFrame.setContentPane(signInView);
            mainFrame.setSize(460, 580);
            mainFrame.setLocationRelativeTo(null);
            mainFrame.revalidate();
            mainFrame.repaint();
            mainFrame.setVisible(true);
        }
    }

    public void showDashboard(AuthSession session) {
        ensureMainFrameInitialized();
        isAuthenticated = session != null && session.isAuthenticated();

        if (isAuthenticated) {
            UserController.syncUser(session.toMap());
            userSyncBridgeService.signIn(session.getEmail(), session.getPlan());
        } else {
            userSyncBridgeService.signOut();
        }

        if (dashboardView == null) {
            dashboardView = new DashboardView(
                    mainFrame,
                    extractionService,
                    sessionStatsService,
                    networkMonitorService,
                    userSyncBridgeService,
                    adSyncService,
                    this::handleSignOut
            );
        }
        this.currentView = dashboardView;

        if (mainFrame != null) {
            mainFrame.setTitle(isAuthenticated ? "TakeoutFix Operations Center" : "TakeoutFix Operations Center — Guest Mode");
            mainFrame.setResizable(true);
            mainFrame.setMinimumSize(new Dimension(1060, 740));
            mainFrame.setContentPane(dashboardView);
            mainFrame.setSize(1240, 900);
            mainFrame.setLocationRelativeTo(null);
            mainFrame.revalidate();
            mainFrame.repaint();
            mainFrame.setVisible(true);

            SwingUtilities.invokeLater(() -> {
                mainFrame.setExtendedState(JFrame.MAXIMIZED_BOTH);
                mainFrame.toFront();
                mainFrame.requestFocus();
            });
        }
    }

    private void onAuthenticationSuccess(AuthSession session) {
        isAuthenticated = true;
        userSyncBridgeService.triggerCloudSync(null);
        showDashboard(session);
    }

    private void handleSignOut() {
        isAuthenticated = false;
        userSyncBridgeService.signOut();
        sessionManager.clear();
        new com.takeoutfix.auth.CredentialStore().clear();
        dashboardView = null;
        showDashboard(AuthSession.unauthenticated());
    }

    private void handleWindowClose() {
        if (isAuthenticated && dashboardView != null) {
            try {
                dashboardView.flushExtractionProgressToCloud("window close", true);
                userSyncBridgeService.syncOnClose();
            } catch (Exception ignored) {}
        }
        mainFrame.dispose();
        System.exit(0);
    }

    public JFrame getMainFrame() {
        return mainFrame;
    }

    public JComponent getCurrentView() {
        return currentView;
    }

    public boolean isAuthenticated() {
        return isAuthenticated;
    }
}
