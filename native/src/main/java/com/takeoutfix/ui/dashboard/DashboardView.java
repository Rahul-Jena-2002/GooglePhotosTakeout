package com.takeoutfix.ui.dashboard;

import com.takeoutfix.ads.AdSyncService;
import com.takeoutfix.ads.DealsRotatorBanner;
import com.takeoutfix.app.HeaderBar;
import com.takeoutfix.app.RecoveryCenterPanel;
import com.takeoutfix.auth.UserSyncBridgeService;
import com.takeoutfix.network.NetworkMonitorService;
import com.takeoutfix.restore.CommandCenterPanel;
import com.takeoutfix.restore.ConsoleCard;
import com.takeoutfix.restore.PowerManager;
import com.takeoutfix.restore.SessionStatsService;
import com.takeoutfix.restore.infrastructure.ExtractionService;
import com.takeoutfix.shared.theme.ThemeColors;
import com.takeoutfix.shared.ui.AppRoutes;
import com.takeoutfix.updates.UpdateCheckerService;
import com.takeoutfix.updates.UpdateNotificationBanner;

import javax.swing.*;
import java.awt.*;
import java.io.File;
import java.time.Instant;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Operations Center Dashboard View for authenticated TakeoutFix sessions.
 *
 * Encapsulates the operations interface:
 *  - HeaderBar with navigation, profile, theme toggle, and sign-out
 *  - CommandCenterPanel sidebar
 *  - RecoveryCenterPanel main workspace
 *  - Telemetry footer & update banners
 */
public class DashboardView extends JPanel {

    private final JFrame parentFrame;
    private final ExtractionService extractionService;
    private final SessionStatsService sessionStatsService;
    private final NetworkMonitorService networkMonitorService;
    private final UserSyncBridgeService userSyncBridgeService;
    private final AdSyncService adSyncService;
    private final Runnable onSignOutRequested;

    private HeaderBar headerBar;
    private CommandCenterPanel commandCenterPanel;
    private RecoveryCenterPanel recoveryCenterPanel;
    private DealsRotatorBanner dealsRotatorBanner;
    private UpdateNotificationBanner updateNotificationBanner;
    private final PowerManager powerManager = new PowerManager();
    private Timer progressTimer;

    private final AtomicInteger lastRestoredCount = new AtomicInteger(0);
    private final AtomicInteger sessionSyncedFiles = new AtomicInteger(0);
    private final AtomicLong sessionSyncedBytes = new AtomicLong(0);

    public DashboardView(JFrame parentFrame,
                         ExtractionService extractionService,
                         SessionStatsService sessionStatsService,
                         NetworkMonitorService networkMonitorService,
                         UserSyncBridgeService userSyncBridgeService,
                         AdSyncService adSyncService,
                         Runnable onSignOutRequested) {
        super(new BorderLayout(0, 0));
        this.parentFrame = parentFrame;
        this.extractionService = extractionService != null ? extractionService : new ExtractionService();
        this.sessionStatsService = sessionStatsService != null ? sessionStatsService : new SessionStatsService();
        this.networkMonitorService = networkMonitorService != null ? networkMonitorService : new NetworkMonitorService();
        this.userSyncBridgeService = userSyncBridgeService != null ? userSyncBridgeService : new UserSyncBridgeService();
        this.adSyncService = adSyncService != null ? adSyncService : new AdSyncService();
        this.onSignOutRequested = onSignOutRequested;

        buildInterface();
    }

    private void buildInterface() {
        // Ambient Glass Canvas with subtle radial underglow blooms for glassmorphism
        JPanel ambientCanvas = new JPanel(new BorderLayout(0, 0)) {
            @Override
            protected void paintComponent(Graphics g) {
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                g2.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
                int w = getWidth();
                int h = getHeight();
                boolean dark = ThemeColors.isDark();

                // 1. Base Canvas
                Color base = ThemeColors.canvasBg();
                g2.setColor(base);
                g2.fillRect(0, 0, w, h);

                // 2. Ambient Underglow Blooms
                if (w > 100 && h > 100) {
                    int r1 = Math.max(380, (int) (w * 0.45));
                    Color c1 = dark ? new Color(99, 102, 241, 32) : new Color(224, 231, 255, 140);
                    Color c1Edge = new Color(c1.getRed(), c1.getGreen(), c1.getBlue(), 0);
                    RadialGradientPaint rgp1 = new RadialGradientPaint(
                            new Point(r1 / 4, r1 / 4), r1,
                            new float[]{0f, 1f},
                            new Color[]{c1, c1Edge}
                    );
                    g2.setPaint(rgp1);
                    g2.fillRect(0, 0, w, h);

                    int r2 = Math.max(350, (int) (w * 0.40));
                    Color c2 = dark ? new Color(168, 85, 247, 26) : new Color(219, 234, 254, 120);
                    Color c2Edge = new Color(c2.getRed(), c2.getGreen(), c2.getBlue(), 0);
                    RadialGradientPaint rgp2 = new RadialGradientPaint(
                            new Point(w - r2 / 4, h - r2 / 4), r2,
                            new float[]{0f, 1f},
                            new Color[]{c2, c2Edge}
                    );
                    g2.setPaint(rgp2);
                    g2.fillRect(0, 0, w, h);
                }
                g2.dispose();
                super.paintComponent(g);
            }
        };

        // 1. NORTH: Top Header
        ambientCanvas.add(createHeaderPanel(), BorderLayout.NORTH);

        // 2. WEST: Fixed-width Sidebar
        ambientCanvas.add(createSidebar(), BorderLayout.WEST);

        // 3. CENTER: Recovery Center (Main Content)
        ambientCanvas.add(createRecoveryCenter(), BorderLayout.CENTER);

        // 4. SOUTH: Footer Status / Telemetry Bar
        ambientCanvas.add(createFooter(), BorderLayout.SOUTH);

        // Header Navigation -> Recovery Center switcher with active tab synchronization
        if (headerBar != null && recoveryCenterPanel != null) {
            headerBar.setNavigationCallback(cardName -> {
                recoveryCenterPanel.switchTo(cardName);
                headerBar.setActiveTab(cardName);
                handleActiveCardChanged(cardName);
            });
            recoveryCenterPanel.setOnCardChangeListener(cardName -> {
                headerBar.setActiveTab(cardName);
                handleActiveCardChanged(cardName);
            });
            recoveryCenterPanel.switchTo(AppRoutes.DASHBOARD);
            headerBar.setActiveTab("Dashboard");
            handleActiveCardChanged(AppRoutes.DASHBOARD);
        }

        if (headerBar != null && onSignOutRequested != null) {
            headerBar.setOnSignOutListener(onSignOutRequested);
        }

        // Dynamic theme synchronization
        ThemeColors.addThemeListener(() -> {
            ambientCanvas.setBackground(ThemeColors.canvasBg());
            revalidate();
            repaint();
        });

        // Update notifications
        UpdateCheckerService updateCheckerService = new UpdateCheckerService();
        updateCheckerService.addListener(updateInfo -> {
            if (updateInfo.isUpdateAvailable()) {
                if (headerBar != null) headerBar.setUpdateAvailable(updateInfo);
                if (updateNotificationBanner != null) updateNotificationBanner.showUpdate(updateInfo);
                if (recoveryCenterPanel != null && recoveryCenterPanel.getConsoleCard() != null) {
                    recoveryCenterPanel.getConsoleCard().appendLog("SUCCESS",
                            "[UPDATE AVAILABLE] A new release " + updateInfo.versionTag() + " is available!");
                }
            }
        });
        updateCheckerService.start();

        add(ambientCanvas, BorderLayout.CENTER);
    }

    private void handleActiveCardChanged(String cardName) {
        boolean isDashboard = AppRoutes.DASHBOARD.equalsIgnoreCase(cardName)
                || "Dashboard".equalsIgnoreCase(cardName);
        if (commandCenterPanel != null) {
            commandCenterPanel.setVisible(!isDashboard);
            revalidate();
            repaint();
        }
    }

    private JPanel createHeaderPanel() {
        JPanel container = new JPanel(new BorderLayout());
        container.setOpaque(false);
        headerBar = new HeaderBar(networkMonitorService, userSyncBridgeService, parentFrame);
        updateNotificationBanner = new UpdateNotificationBanner();
        container.add(headerBar, BorderLayout.NORTH);
        container.add(updateNotificationBanner, BorderLayout.SOUTH);
        return container;
    }

    private JComponent createSidebar() {
        commandCenterPanel = new CommandCenterPanel(userSyncBridgeService, sessionStatsService, adSyncService);
        userSyncBridgeService.addListener(user -> commandCenterPanel.updateUserData());
        return commandCenterPanel;
    }

    private JPanel createRecoveryCenter() {
        recoveryCenterPanel = new RecoveryCenterPanel(parentFrame, networkMonitorService, userSyncBridgeService, adSyncService);
        recoveryCenterPanel.setExecutionCallbacks(
                this::handleStart,
                this::handlePause,
                this::handleCancel,
                this::handleOpenOutput
        );
        userSyncBridgeService.addListener(user -> recoveryCenterPanel.updatePlanBadge());
        return recoveryCenterPanel;
    }

    private JPanel createFooter() {
        dealsRotatorBanner = new DealsRotatorBanner();
        return dealsRotatorBanner;
    }

    // Execution Logic
    private void handleStart() {
        String inPath = recoveryCenterPanel.getSourcePath();
        String outPath = recoveryCenterPanel.getOutputPath();

        if (inPath == null || inPath.trim().isEmpty()) {
            JOptionPane.showMessageDialog(parentFrame,
                    "Please select a Google Takeout source directory or ZIP archive first.",
                    "Source Required",
                    JOptionPane.WARNING_MESSAGE);
            return;
        }

        if (outPath == null || outPath.trim().isEmpty()) {
            JOptionPane.showMessageDialog(parentFrame,
                    "Please select a destination folder to output the restored photos and videos.",
                    "Destination Required",
                    JOptionPane.WARNING_MESSAGE);
            return;
        }

        File inFile = new File(inPath);
        if (!inFile.exists()) {
            JOptionPane.showMessageDialog(parentFrame,
                    "Selected Takeout Source does not exist: " + inPath,
                    "Invalid Source",
                    JOptionPane.ERROR_MESSAGE);
            return;
        }

        // 3. User Sign-in Check — Always require sign-in for tool access
        if (!userSyncBridgeService.isSignedIn()) {
            new com.takeoutfix.auth.ui.SignInDialog(parentFrame, userSyncBridgeService).setVisible(true);
            if (!userSyncBridgeService.isSignedIn()) {
                return;
            }
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
        int limitFiles = -1;

        if (organizeYearMonth) {
            console.appendLog("INFO", "Output mode: Month/Year subfolders inside original folders (Album/YYYY-MM)");
        }

        commandCenterPanel.resetJobCounters(0);
        recoveryCenterPanel.setProgress(0, "Scanning files in source...");

        lastRestoredCount.set(0);
        sessionSyncedFiles.set(0);
        sessionSyncedBytes.set(0);

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
            public void onProgressTelemetry(int processed, int total, long processedBytes, String currentAction,
                                            long elapsedSec, long etaSec, double filesPerSec, double mbPerSec) {
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
                    flushExtractionProgressToCloud("completion", false);
                    int finalFiles = Math.max(lastRestoredCount.get(), extractionService.getProcessedFiles());
                    bytes = extractionService.getProcessedBytes();
                    recoveryCenterPanel.setProgress(100, "Restoration complete!");
                    console.appendLog("SUCCESS", "Restoration finished successfully. Total synced: " + finalFiles + " files (" + CommandCenterPanel.formatBytes(bytes) + ") to cloud quota.");
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
            JOptionPane.showMessageDialog(parentFrame, "Failed to start extraction: " + ex.getMessage(), "Execution Error", JOptionPane.ERROR_MESSAGE);
        }
    }

    private void handlePause() {
        extractionService.togglePause();
        boolean paused = extractionService.isPaused();
        recoveryCenterPanel.setRunningState(true, paused);
        if (paused) {
            commandCenterPanel.setState("PAUSED", ThemeColors.warningLight(), ThemeColors.warning());
            recoveryCenterPanel.getConsoleCard().appendLog("WARN", "Restoration paused.");
            flushExtractionProgressToCloud("pause", false);
        } else {
            commandCenterPanel.setState("RUNNING", ThemeColors.successLight(), ThemeColors.success());
            recoveryCenterPanel.getConsoleCard().appendLog("INFO", "Restoration resumed.");
        }
    }

    private void handleCancel() {
        int confirm = JOptionPane.showConfirmDialog(parentFrame,
                "Are you sure you want to stop the ongoing restoration job?",
                "Confirm Cancel",
                JOptionPane.YES_NO_OPTION,
                JOptionPane.WARNING_MESSAGE);
        if (confirm == JOptionPane.YES_OPTION) {
            flushExtractionProgressToCloud("cancellation", false);
            extractionService.cancel();
            powerManager.stopKeepAwake();
            if (progressTimer != null) progressTimer.stop();
            recoveryCenterPanel.setRunningState(false, false);
            commandCenterPanel.setState("CANCELLED", ThemeColors.pillBg(), ThemeColors.textMuted());
            recoveryCenterPanel.getConsoleCard().appendLog("WARN", "Restoration cancelled by user.");
        }
    }

    public synchronized void flushExtractionProgressToCloud(String triggerReason, boolean synchronous) {
        if (extractionService == null) return;
        int currentFiles = Math.max(lastRestoredCount.get(), extractionService.getProcessedFiles());
        long currentBytes = extractionService.getProcessedBytes();

        int deltaFiles = Math.max(0, currentFiles - sessionSyncedFiles.get());
        long deltaBytes = Math.max(0, currentBytes - sessionSyncedBytes.get());

        if (deltaFiles > 0 || deltaBytes > 0) {
            sessionSyncedFiles.addAndGet(deltaFiles);
            sessionSyncedBytes.addAndGet(deltaBytes);

            if (userSyncBridgeService != null) {
                if (synchronous) {
                    userSyncBridgeService.recordUsageSync(deltaFiles, deltaBytes);
                } else {
                    userSyncBridgeService.recordUsage(deltaFiles, deltaBytes);
                }
            }

            if (commandCenterPanel != null) {
                commandCenterPanel.updateUserData();
            }
            if (recoveryCenterPanel != null && recoveryCenterPanel.getDashboardPanel() != null) {
                recoveryCenterPanel.getDashboardPanel().updateUserData();
            }

            if (recoveryCenterPanel != null && recoveryCenterPanel.getConsoleCard() != null) {
                recoveryCenterPanel.getConsoleCard().appendLog("INFO", "Cloud Sync (" + triggerReason + "): "
                        + currentFiles + " files, " + CommandCenterPanel.formatBytes(currentBytes)
                        + " synchronized to cloud telemetry.");
            }
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
                    JOptionPane.showMessageDialog(parentFrame, "Could not open folder: " + ex.getMessage(), "Error", JOptionPane.ERROR_MESSAGE);
                }
            }
        }
    }

    public void closeOpenPopups() {
        if (recoveryCenterPanel != null) {
            recoveryCenterPanel.closeOpenPopups();
        }
    }

    public ConsoleCard getConsoleCard() {
        return recoveryCenterPanel != null ? recoveryCenterPanel.getConsoleCard() : null;
    }
}
