package com.takeoutfix.app;

import com.formdev.flatlaf.FlatLightLaf;
import com.takeoutfix.ads.AdSyncService;
import com.takeoutfix.auth.UserSyncBridgeService;
import com.takeoutfix.network.DesktopTelemetryServer;
import com.takeoutfix.network.NetworkMonitorService;
import com.takeoutfix.restore.SessionStatsService;
import com.takeoutfix.restore.infrastructure.ExtractionService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import javax.swing.*;
import java.awt.*;

/**
 * Top-level Desktop GUI Entrypoint for TakeoutFix.
 *
 * Responsibilities:
 *  - Configures UI Look-and-Feel (FlatLaf)
 *  - Initializes local telemetry server
 *  - Delegates navigation and view transitions to ApplicationStartupController
 */
@Component
public class NativeDesktopGui {

    private final ApplicationStartupController startupController;

    @Autowired
    public NativeDesktopGui(ApplicationStartupController startupController) {
        this.startupController = startupController;
    }

    public NativeDesktopGui(ExtractionService extractionService,
                            SessionStatsService sessionStatsService,
                            NetworkMonitorService networkMonitorService,
                            UserSyncBridgeService userSyncBridgeService,
                            AdSyncService adSyncService) {
        this(new ApplicationStartupController(userSyncBridgeService, extractionService, sessionStatsService,
                networkMonitorService, adSyncService));
    }

    public NativeDesktopGui() {
        this(new ApplicationStartupController());
    }

    public void initAndShowGui() {
        System.out.println("[GUI-LAUNCHER] initAndShowGui called. isHeadless=" + GraphicsEnvironment.isHeadless());
        SwingUtilities.invokeLater(() -> {
            try {
                // Initialize FlatLaf modern Light Look and Feel matching the web app
                FlatLightLaf.setup();
                UIManager.put("Button.arc", 10);
                UIManager.put("Component.arc", 10);
                UIManager.put("ProgressBar.arc", 10);
                UIManager.put("TextComponent.arc", 8);
                UIManager.put("ScrollBar.showButtons", false);
                UIManager.put("ScrollBar.width", 10);

                // Start local telemetry server so webapp receives genuine OS hardware metrics
                DesktopTelemetryServer.startServer();

                // Launch application with clean startup state and view transition
                startupController.startApplication();
            } catch (Throwable t) {
                System.err.println("CRITICAL ERROR INITIALIZING GUI: " + t.getMessage());
                t.printStackTrace();
            }
        });
    }

    public ApplicationStartupController getStartupController() {
        return startupController;
    }

    public JFrame getMainFrame() {
        return startupController != null ? startupController.getMainFrame() : null;
    }
}
