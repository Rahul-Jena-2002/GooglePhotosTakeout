package com.takeoutfix.gui;

import com.formdev.flatlaf.FlatLightLaf;
import com.takeoutfix.controller.UserController;
import com.takeoutfix.gui.components.*;
import com.takeoutfix.gui.service.NetworkMonitorService;
import com.takeoutfix.gui.service.UserSyncBridgeService;
import com.takeoutfix.gui.theme.ThemeColors;
import com.takeoutfix.service.*;
import javax.swing.*;
import java.awt.*;
import java.io.File;
import java.io.InputStream;
import java.net.URI;
import java.time.Instant;
import java.util.Optional;

public class NativeDesktopGui {

    private ExtractionService extractionService;
    private SessionStatsService sessionStatsService;
    private NetworkMonitorService networkMonitorService;
    private UserSyncBridgeService userSyncBridgeService;

    public NativeDesktopGui() {
        this.sessionStatsService = new SessionStatsService();
        this.networkMonitorService = new NetworkMonitorService();
        this.userSyncBridgeService = new UserSyncBridgeService();
        UserService userService = new UserService();
        UserController.setUserService(userService);
        this.extractionService = new ExtractionService(
                new MediaScanner(),
                new MetadataMatcher(),
                new TimestampRestorer(),
                new MetadataInjector(),
                new FileOperationService(),
                this.sessionStatsService,
                userService
        );
    }

    public NativeDesktopGui(ExtractionService extractionService, SessionStatsService sessionStatsService,
                            NetworkMonitorService networkMonitorService, UserSyncBridgeService userSyncBridgeService) {
        this.extractionService = extractionService;
        this.sessionStatsService = sessionStatsService;
        this.networkMonitorService = networkMonitorService;
        this.userSyncBridgeService = userSyncBridgeService;
    }

    private JFrame mainFrame;
    private HeaderBar headerBar;
    private CommandCenterPanel commandCenterPanel;
    private RecoveryCenterPanel recoveryCenterPanel;
    private DealsRotatorBanner dealsRotatorBanner;
    private PowerManager powerManager = new PowerManager();
    private Timer progressTimer;

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
                com.takeoutfix.gui.service.DesktopTelemetryServer.startServer();

                buildInterface();
                System.out.println("[GUI-LAUNCHER] buildInterface completed. mainFrame.isVisible=" + (mainFrame != null && mainFrame.isVisible()));

                ConsoleCard console = recoveryCenterPanel.getConsoleCard();
                console.appendLog("INFO", "TakeoutFix Native Desktop Ops Center initialized.");
                console.appendLog("INFO", "Layout rebuilt with strict Swing layout managers (BorderLayout + GridBagLayout).");
                console.appendLog("INFO", "Connected to local extraction microservices & dynamic ExifTool worker pool.");

                if (!userSyncBridgeService.isSignedIn()) {
                    console.appendLog("WARN", "Sign-in required: Please sign in to activate tool access according to your tier.");
                } else {
                    console.appendLog("SUCCESS", "Active session restored: " + userSyncBridgeService.getCurrentEmail() + " (" + userSyncBridgeService.getCurrentPlan().toUpperCase() + " TIER).");
                }

                // Push notifications for available updates
                UpdateCheckerService updateCheckerService = new UpdateCheckerService();
                updateCheckerService.addListener(updateInfo -> {
                    if (updateInfo.isUpdateAvailable()) {
                        headerBar.setUpdateAvailable(updateInfo);
                        console.appendLog("SUCCESS", "[UPDATE AVAILABLE] A new release " + updateInfo.versionTag() + " is available! Click 'Update' in the top bar to download.");
                    }
                });
                updateCheckerService.start();

            } catch (Throwable t) {
                System.err.println("CRITICAL ERROR INITIALIZING GUI: " + t.getMessage());
                t.printStackTrace();
            }
        });
    }

    private void buildInterface() {
        mainFrame = new JFrame("TakeoutFix Operations Center");
        mainFrame.setDefaultCloseOperation(JFrame.DO_NOTHING_ON_CLOSE);
        mainFrame.addWindowListener(new java.awt.event.WindowAdapter() {
            @Override
            public void windowClosing(java.awt.event.WindowEvent e) {
                try {
                    if (userSyncBridgeService != null) {
                        userSyncBridgeService.syncOnClose();
                    }
                } catch (Exception ignored) {}
                mainFrame.dispose();
                System.exit(0);
            }
        });
        mainFrame.setSize(1240, 900);
        mainFrame.setMinimumSize(new Dimension(1060, 740));
        mainFrame.setLocationRelativeTo(null);
        // Open in maximized screen size by default for maximum convenience
        mainFrame.setExtendedState(JFrame.MAXIMIZED_BOTH);
        mainFrame.getContentPane().setBackground(ThemeColors.canvasBg());
        mainFrame.setLayout(new BorderLayout(0, 0));

        // Load window icon
        try (InputStream is = getClass().getResourceAsStream("/icons/icon.png")) {
            if (is != null) {
                mainFrame.setIconImage(Toolkit.getDefaultToolkit().createImage(is.readAllBytes()));
            }
        } catch (Exception ignored) {}

        // 1. NORTH: Top Header
        mainFrame.add(createHeaderPanel(), BorderLayout.NORTH);

        // 2. WEST: Fixed-width Sidebar
        mainFrame.add(createSidebar(), BorderLayout.WEST);

        // 3. CENTER: Recovery Center (Main Content)
        mainFrame.add(createRecoveryCenter(), BorderLayout.CENTER);

        // 4. SOUTH: Footer Status / Telemetry Bar
        mainFrame.add(createFooter(), BorderLayout.SOUTH);

        // Header Navigation -> Recovery Center switcher with active tab synchronization
        if (headerBar != null && recoveryCenterPanel != null) {
            headerBar.setNavigationCallback(cardName -> {
                recoveryCenterPanel.switchTo(cardName);
                headerBar.setActiveTab(cardName);
            });
            recoveryCenterPanel.setOnCardChangeListener(cardName -> {
                headerBar.setActiveTab(cardName);
            });
            // Open Dashboard by default to align with the active Dashboard pill
            recoveryCenterPanel.switchTo(RecoveryCenterPanel.CARD_DASHBOARD);
            headerBar.setActiveTab("Dashboard");
        }

        // Dynamic theme synchronization across root containers
        ThemeColors.addThemeListener(() -> {
            mainFrame.getContentPane().setBackground(ThemeColors.canvasBg());
            mainFrame.revalidate();
            mainFrame.repaint();
        });

        mainFrame.setVisible(true);
        SwingUtilities.invokeLater(() -> {
            mainFrame.setExtendedState(JFrame.MAXIMIZED_BOTH);
            mainFrame.toFront();
            mainFrame.requestFocus();
        });
    }

    // 1. Top Header Panel
    public JPanel createHeaderPanel() {
        headerBar = new HeaderBar(networkMonitorService, userSyncBridgeService, mainFrame);
        return headerBar;
    }

    // 2. Left Sidebar (Fixed-width with pinned quota header & smooth scrollable body)
    public JComponent createSidebar() {
        commandCenterPanel = new CommandCenterPanel(userSyncBridgeService, sessionStatsService);
        userSyncBridgeService.addListener(user -> commandCenterPanel.updateUserData());
        return commandCenterPanel;
    }

    // 3. Main Content (Recovery Center)
    public JPanel createRecoveryCenter() {
        recoveryCenterPanel = new RecoveryCenterPanel(mainFrame, networkMonitorService, userSyncBridgeService);
        recoveryCenterPanel.setExecutionCallbacks(
                this::handleStart,
                this::handlePause,
                this::handleCancel,
                this::handleOpenOutput
        );
        userSyncBridgeService.addListener(user -> recoveryCenterPanel.updatePlanBadge());
        return recoveryCenterPanel;
    }

    // 4. Footer Status Bar
    public JPanel createFooter() {
        dealsRotatorBanner = new DealsRotatorBanner();
        return dealsRotatorBanner;
    }

    // Execution Logic
    private void handleStart() {
        String inPath = recoveryCenterPanel.getSourcePath();
        String outPath = recoveryCenterPanel.getOutputPath();

        // 1. Validate Source Selected
        if (inPath == null || inPath.trim().isEmpty()) {
            JOptionPane.showMessageDialog(mainFrame,
                    "Please select a Google Takeout source directory or ZIP archive first.",
                    "Source Required",
                    JOptionPane.WARNING_MESSAGE);
            return;
        }

        // 2. Validate Output Selected
        if (outPath == null || outPath.trim().isEmpty()) {
            JOptionPane.showMessageDialog(mainFrame,
                    "Please select a destination folder to output the restored photos and videos.",
                    "Destination Required",
                    JOptionPane.WARNING_MESSAGE);
            return;
        }

        File inFile = new File(inPath);
        if (!inFile.exists()) {
            JOptionPane.showMessageDialog(mainFrame,
                    "Selected Takeout Source does not exist: " + inPath,
                    "Invalid Source",
                    JOptionPane.ERROR_MESSAGE);
            return;
        }

        // 3. User Sign-in Check — Always provide native login interface instead of directly jumping to browser
        if (!userSyncBridgeService.isSignedIn()) {
            new SignInDialog(mainFrame, userSyncBridgeService).setVisible(true);
            return;
        }

        if (recoveryCenterPanel.isPowerKeepAwake()) {
            powerManager.startKeepAwake();
        }

        recoveryCenterPanel.setRunningState(true, false);
        commandCenterPanel.setState("RUNNING (UNLIMITED)", ThemeColors.successLight(), ThemeColors.success());

        ConsoleCard console = recoveryCenterPanel.getConsoleCard();
        console.appendLog("INFO", "Starting restoration for source: " + inPath);
        console.appendLog("INFO", "Destination directory: " + outPath);
        console.appendLog("INFO", "Restoration Mode: UNLIMITED | Account: " + userSyncBridgeService.getCurrentEmail());

        Optional<Instant> dateOverride = recoveryCenterPanel.getArchiveDateOverride();
        dateOverride.ifPresent(d -> console.appendLog("INFO", "Archive date fallback override set to: " + d));

        boolean splitZip = recoveryCenterPanel.isSplitVolumes();
        boolean smartInterp = recoveryCenterPanel.isSmartInterpolation();
        boolean organizeYearMonth = recoveryCenterPanel.isOrganizeYearMonth();
        int limitFiles = -1; // Unlimited for all users

        if (organizeYearMonth) {
            console.appendLog("INFO", "Output mode: Month/Year subfolders inside original folders (Album/YYYY-MM)");
        }

        commandCenterPanel.resetJobCounters(0);
        recoveryCenterPanel.setProgress(0, "Scanning files in source...");

        java.util.concurrent.atomic.AtomicInteger lastRestoredCount = new java.util.concurrent.atomic.AtomicInteger(0);

        extractionService.setRestorationListener(new ExtractionService.RestorationListener() {
            @Override
            public void onLog(String level, String message) {
                console.appendLog(level, message);
            }

            @Override
            public void onProgress(int processed, int total, long processedBytes, String currentAction) {
                SwingUtilities.invokeLater(() -> {
                    int pct = total > 0 ? (int) Math.min(100, Math.round((processed * 100.0) / total)) : 0;
                    recoveryCenterPanel.setProgress(pct, currentAction);
                });
            }

            @Override
            public void onProgressTelemetry(int processed, int total, long processedBytes, String currentAction, long elapsedSec, long etaSec, double filesPerSec, double mbPerSec) {
                SwingUtilities.invokeLater(() -> {
                    int pct = total > 0 ? (int) Math.min(100, Math.round((processed * 100.0) / total)) : 0;
                    recoveryCenterPanel.setProgressTelemetry(pct, currentAction, elapsedSec, etaSec, filesPerSec, mbPerSec);
                    commandCenterPanel.updateLiveRestorationUsage(processed, total, processedBytes);
                    if (recoveryCenterPanel.getDashboardPanel() != null) {
                        recoveryCenterPanel.getDashboardPanel().updateLiveSessionUsage(processed, total, processedBytes);
                    }
                });
            }

            @Override
            public void onStats(int scanned, int total, int restored, int unmatched, int errors) {
                lastRestoredCount.set(restored);
                commandCenterPanel.updateJobCounters(scanned, total, restored, unmatched, errors);
                if (recoveryCenterPanel.getDashboardPanel() != null) {
                    recoveryCenterPanel.getDashboardPanel().updateSessionStats(scanned, restored, unmatched, errors);
                }
            }
        });

        try {
            extractionService.startExtraction(
                    inPath,
                    outPath,
                    PowerManager.PostAction.KEEP_AWAKE_ONLY,
                    dateOverride,
                    false,
                    splitZip,
                    limitFiles,
                    0,
                    smartInterp,
                    organizeYearMonth
            );

            // Progress polling timer
            if (progressTimer != null) progressTimer.stop();
            progressTimer = new Timer(500, e -> {
                boolean running = extractionService.isRunning();
                boolean paused = extractionService.isPaused();
                long bytes = extractionService.getProcessedBytes();

                if (!running) {
                    ((Timer) e.getSource()).stop();
                    recoveryCenterPanel.setRunningState(false, false);
                    commandCenterPanel.setState("COMPLETE", ThemeColors.successLight(), ThemeColors.success());
                    powerManager.stopKeepAwake();
                    int finalFiles = Math.max(lastRestoredCount.get(), extractionService.getProcessedFiles());
                    userSyncBridgeService.recordUsage(finalFiles, bytes);
                    commandCenterPanel.updateUserData();
                    if (recoveryCenterPanel.getDashboardPanel() != null) {
                        recoveryCenterPanel.getDashboardPanel().updateUserData();
                    }
                    recoveryCenterPanel.setProgress(100, "Restoration complete!");
                    console.appendLog("SUCCESS", "Restoration finished successfully. Synced " + finalFiles + " files (" + CommandCenterPanel.formatBytes(bytes) + ") to cloud quota.");
                } else {
                    recoveryCenterPanel.setRunningState(true, paused);
                }
            });
            progressTimer.start();

        } catch (Exception ex) {
            recoveryCenterPanel.setRunningState(false, false);
            commandCenterPanel.setState("ERROR", ThemeColors.dangerLight(), ThemeColors.danger());
            powerManager.stopKeepAwake();
            console.appendLog("ERROR", "Restoration failed to start: " + ex.getMessage());
            JOptionPane.showMessageDialog(mainFrame, "Failed to start extraction: " + ex.getMessage(), "Execution Error", JOptionPane.ERROR_MESSAGE);
        }
    }

    private void handlePause() {
        extractionService.togglePause();
        boolean paused = extractionService.isPaused();
        recoveryCenterPanel.setRunningState(true, paused);
        if (paused) {
            commandCenterPanel.setState("PAUSED", ThemeColors.warningLight(), ThemeColors.warning());
            recoveryCenterPanel.getConsoleCard().appendLog("WARN", "Restoration paused.");
        } else {
            commandCenterPanel.setState("RUNNING", ThemeColors.successLight(), ThemeColors.success());
            recoveryCenterPanel.getConsoleCard().appendLog("INFO", "Restoration resumed.");
        }
    }

    private void handleCancel() {
        int confirm = JOptionPane.showConfirmDialog(mainFrame,
                "Are you sure you want to stop the ongoing restoration job?",
                "Confirm Cancel",
                JOptionPane.YES_NO_OPTION,
                JOptionPane.WARNING_MESSAGE);
        if (confirm == JOptionPane.YES_OPTION) {
            extractionService.cancel();
            powerManager.stopKeepAwake();
            if (progressTimer != null) progressTimer.stop();
            recoveryCenterPanel.setRunningState(false, false);
            commandCenterPanel.setState("CANCELLED", ThemeColors.pillBg(), ThemeColors.textMuted());
            recoveryCenterPanel.getConsoleCard().appendLog("WARN", "Restoration cancelled by user.");
        }
    }

    private void handleOpenOutput() {
        String outPath = recoveryCenterPanel.getOutputPath();
        if (outPath != null && !outPath.isEmpty()) {
            File folder = new File(outPath);
            if (folder.exists()) {
                try {
                    Desktop.getDesktop().open(folder);
                } catch (Exception ex) {
                    JOptionPane.showMessageDialog(mainFrame, "Could not open folder: " + ex.getMessage(), "Error", JOptionPane.ERROR_MESSAGE);
                }
            }
        }
    }
}
