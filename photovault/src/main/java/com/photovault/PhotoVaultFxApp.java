package com.photovault;

import com.photovault.core.HistoryManager;
import com.photovault.hashing.VerificationEngine;
import com.photovault.model.VerificationDiscrepancy;
import com.photovault.model.VerificationResult;
import com.photovault.model.VerificationState;
import com.photovault.report.HtmlReportGenerator;
import com.photovault.report.TxtReportGenerator;
import com.photovault.ui.fx.*;
import javafx.application.Application;
import javafx.application.Platform;
import javafx.concurrent.Task;
import javafx.geometry.Insets;
import javafx.scene.Scene;
import javafx.scene.control.Alert;
import javafx.scene.control.ButtonType;
import javafx.scene.effect.GaussianBlur;
import javafx.scene.image.Image;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.VBox;
import javafx.stage.FileChooser;
import javafx.stage.Stage;

import java.awt.Desktop;
import java.io.File;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * Modern JavaFX Desktop Application for PhotoVault.
 * Built with native hardware-accelerated rendering, modular CSS theming (Light & Dark),
 * TakeoutFix-matching operations dashboard, and zero cloud telemetry.
 */
public class PhotoVaultFxApp extends Application {

    private static final String WEBSITE_URL = "https://takeoutfix.pages.dev";

    private Stage stage;
    private Scene scene;

    // Modular Components
    private HeaderBar headerBar;
    private KpiCardsRow kpiRow;
    private FolderSelectionCards folderCards;
    private ActionCard actionCard;
    private SponsoredCard sponsoredCard;
    private VerificationStatusDeck statusDeck;
    private AuditTableCard auditTableCard;

    private VerificationEngine activeEngine;
    private VerificationResult currentResult;

    @Override
    public void init() {
        com.photovault.core.HardwareAccelerationManager.initialize();
    }

    @Override
    public void start(Stage primaryStage) {
        this.stage = primaryStage;
        primaryStage.setTitle("PhotoVault — Local Photo Backup Verifier (JavaFX)");
        primaryStage.setMinWidth(1080);
        primaryStage.setMinHeight(760);

        applyWindowAndTaskbarIcon(primaryStage);

        VBox root = new VBox(14);
        root.setPadding(new Insets(16, 22, 16, 22));

        // 1. Navigation & Header Bar
        headerBar = new HeaderBar(
                true,
                () -> openUrl(WEBSITE_URL),
                this::showHistoryDialog,
                () -> openUrl("https://github.com/sponsors/Rahul-Jena-2002"),
                this::applyTheme,
                this::showSignInDialog
        );

        // 2. Top KPI Metric Cards
        kpiRow = new KpiCardsRow();

        // 3. Main Two-Column Operations Layout
        HBox mainGrid = createMainOperationsGrid();
        VBox.setVgrow(mainGrid, Priority.ALWAYS);

        root.getChildren().addAll(headerBar, kpiRow, mainGrid);

        scene = new Scene(root, 1180, 800);
        applyTheme();

        primaryStage.setScene(scene);
        primaryStage.show();
    }

    private HBox createMainOperationsGrid() {
        HBox grid = new HBox(16);

        // Left Column (Folders, Start/Pause/Cancel, and Sponsored Hardware Deals)
        VBox leftColumn = new VBox(12);
        leftColumn.setPrefWidth(380);
        leftColumn.setMinWidth(350);

        folderCards = new FolderSelectionCards(stage);
        actionCard = new ActionCard(this::startVerification, this::pauseVerification, this::resumeVerification, this::cancelVerification);
        sponsoredCard = new SponsoredCard(this::openUrl);

        leftColumn.getChildren().addAll(folderCards, actionCard, sponsoredCard);

        // Right Column (Overview / Progress / Result Deck + Issues Table)
        VBox rightColumn = new VBox(12);
        HBox.setHgrow(rightColumn, Priority.ALWAYS);

        statusDeck = new VerificationStatusDeck(
                () -> exportReport(true),
                () -> exportReport(false)
        );

        auditTableCard = new AuditTableCard();
        VBox.setVgrow(auditTableCard, Priority.ALWAYS);

        folderCards.setOnFolderSelected((type, path) -> {
            if ("SOURCE".equals(type)) {
                auditTableCard.addLog("SOURCE", "SOURCE", "badge-source", path.getFileName().toString(), "—",
                        "Original photo library selected: " + path.toAbsolutePath());
            } else {
                auditTableCard.addLog("BACKUP", "BACKUP", "badge-backup", path.getFileName().toString(), "—",
                        "Backup destination selected: " + path.toAbsolutePath());
            }
        });

        rightColumn.getChildren().addAll(statusDeck, auditTableCard);

        grid.getChildren().addAll(leftColumn, rightColumn);
        return grid;
    }

    private void startVerification() {
        Path orig = folderCards.getOriginalPath();
        Path back = folderCards.getBackupPath();

        if (orig == null || back == null) {
            showAlert(Alert.AlertType.WARNING, "Folder Selection Required",
                    "Please select both Original and Backup directories before starting verification.");
            return;
        }

        actionCard.setRunning(true);
        auditTableCard.setEffect(null);
        kpiRow.reset();
        auditTableCard.clear();
        auditTableCard.addLog("MILESTONE", "START", "badge-pv",
                orig.getFileName() + " ↔ " + back.getFileName(), "—",
                "Starting bit-for-bit SHA-256 verification.");
        statusDeck.showProgress("Initializing verification...", 0.0, "0 MB/s • 0% complete");

        activeEngine = new VerificationEngine();

        Task<VerificationResult> task = new Task<>() {
            @Override
            protected VerificationResult call() {
                return activeEngine.verify(orig, back, new VerificationEngine.VerificationListener() {
                    @Override
                    public void onPhaseChange(String phaseName) {
                        Platform.runLater(() -> {
                            statusDeck.showProgress(phaseName, -1, null);
                            auditTableCard.addLog("SCAN", "PHASE", "badge-source", phaseName, "—",
                                    "Verification phase active: " + phaseName);
                        });
                    }

                    @Override
                    public void onProgress(long bytesProcessed, long totalBytes, double mbPerSec, int filesCompleted, int totalFiles) {
                        Platform.runLater(() -> {
                            double pct = totalBytes > 0 ? (double) bytesProcessed / totalBytes : 0.0;
                            String telemetry = String.format("%.1f MB/s • %.0f%% complete (%d / %d files)",
                                    mbPerSec, pct * 100.0, filesCompleted, totalFiles);
                            statusDeck.showProgress(null, pct, telemetry);

                            long safeMatched = Math.max(0, filesCompleted - auditTableCard.getDiscrepancyCount());
                            kpiRow.updateStats(totalFiles, safeMatched, auditTableCard.getDiscrepancyCount(), mbPerSec);
                        });
                    }

                    @Override
                    public void onDiscrepancyFound(VerificationDiscrepancy discrepancy) {
                        Platform.runLater(() -> auditTableCard.addDiscrepancy(discrepancy));
                    }
                });
            }
        };

        task.setOnSucceeded(e -> {
            currentResult = task.getValue();
            onVerificationComplete();
        });

        task.setOnFailed(e -> {
            actionCard.setRunning(false);
            statusDeck.showProgress("Verification failed: " + task.getException().getMessage(), 0, "Error");
            auditTableCard.addLog("STATUS", "FAILED", "badge-read-error", "Verification Error", "—",
                    task.getException().getMessage());
        });

        Thread thread = new Thread(task, "PhotoVault-Verify-Worker");
        thread.setDaemon(true);
        thread.start();
    }

    private void pauseVerification() {
        if (activeEngine != null) {
            activeEngine.pause();
            statusDeck.showProgress("Verification paused", -1, "Paused by user • Click Resume to continue");
            auditTableCard.addLog("STATUS", "PAUSED", "badge-source", "Local Engine", "—",
                    "Verification paused by user.");
        }
    }

    private void resumeVerification() {
        if (activeEngine != null) {
            activeEngine.resume();
            statusDeck.showProgress("Resuming SHA-256 verification...", -1, "Active");
            auditTableCard.addLog("STATUS", "RESUMED", "badge-source", "Local Engine", "—",
                    "Verification resumed.");
        }
    }

    private void cancelVerification() {
        if (activeEngine != null) {
            activeEngine.cancel();
            actionCard.setRunning(false);
            auditTableCard.addLog("STATUS", "CANCELLED", "badge-missing-backup", "User Request", "—",
                    "Verification cancelled by user.");
        }
    }

    private void onVerificationComplete() {
        actionCard.setRunning(false);

        if (currentResult == null) return;

        long totalFiles = currentResult.originalInventory().totalFiles();
        int issueCount = currentResult.discrepancies().size();
        long matched = Math.max(0, totalFiles - issueCount);
        double throughput = currentResult.metrics().throughputMegabytesPerSec();

        kpiRow.updateStats(totalFiles, matched, issueCount, throughput);
        statusDeck.showResult(currentResult);

        if (currentResult.state() == VerificationState.VERIFIED) {
            auditTableCard.addLog("MILESTONE", "100% MATCH", "badge-backup", "All " + totalFiles + " files",
                    FormatUtils.formatBytes(currentResult.metrics().totalBytesScanned()),
                    "All files verified bit-for-bit identical! Zero corruption, zero missing files.");
        } else if (currentResult.state() == VerificationState.DIFFERENCES_FOUND) {
            auditTableCard.addLog("DISCREPANCY", "ISSUES FOUND", "badge-hash-mismatch", issueCount + " issues",
                    "—", String.format("%d issue(s) detected out of %d files checked.", issueCount, totalFiles));
        } else {
            auditTableCard.addLog("STATUS", "INCOMPLETE", "badge-missing-backup", "Verification Stopped",
                    "—", "Run was incomplete or interrupted.");
        }

        // Log to local history
        Path orig = folderCards.getOriginalPath();
        Path back = folderCards.getBackupPath();
        if (orig != null && back != null) {
            String status = currentResult.state() == VerificationState.VERIFIED ? "VERIFIED" :
                    currentResult.state() == VerificationState.DIFFERENCES_FOUND ? "ISSUES_FOUND" : "INCOMPLETE";
            HistoryManager.record(
                    orig.toAbsolutePath().toString(),
                    back.toAbsolutePath().toString(),
                    totalFiles,
                    matched,
                    issueCount,
                    status
            );
        }

        // Freemium Gate: If unauthenticated, blur the audit table & pop up Google Sign-In
        if (headerBar.getUserEmail() == null) {
            auditTableCard.setEffect(new GaussianBlur(14));
            SignInDialog.show(stage, headerBar.isDark(),
                    "Scan complete! Sign in with Google to view unblurred discrepancy details, inspect SHA-256 digests, and export certified reports.",
                    email -> {
                        headerBar.setUserEmail(email);
                        auditTableCard.setEffect(null);
                    }
            );
        } else {
            auditTableCard.setEffect(null);
        }
    }

    private void showHistoryDialog() {
        HistoryDialog.show(stage, headerBar.isDark(), (origStr, backStr) -> {
            if (origStr != null && !origStr.isBlank()) {
                try { folderCards.setOriginalPath(Paths.get(origStr)); } catch (Exception ignored) {}
            }
            if (backStr != null && !backStr.isBlank()) {
                try { folderCards.setBackupPath(Paths.get(backStr)); } catch (Exception ignored) {}
            }
        });
    }

    private void showSignInDialog() {
        SignInDialog.show(stage, headerBar.isDark(), email -> {
            headerBar.setUserEmail(email);
            auditTableCard.setEffect(null);
        });
    }

    private void exportReport(boolean isHtml) {
        if (currentResult == null) return;

        if (headerBar.getUserEmail() == null) {
            SignInDialog.show(stage, headerBar.isDark(),
                    "Please sign in with Google to export certified audit receipts.",
                    email -> {
                        headerBar.setUserEmail(email);
                        auditTableCard.setEffect(null);
                        exportReport(isHtml);
                    }
            );
            return;
        }

        FileChooser chooser = new FileChooser();
        String ext = isHtml ? "html" : "txt";
        chooser.setInitialFileName("photovault_verification_receipt." + ext);
        chooser.setTitle(isHtml ? "Save HTML Audit Report" : "Save TXT Audit Receipt");

        File file = chooser.showSaveDialog(stage);
        if (file != null) {
            try {
                Path p = file.toPath();
                if (isHtml) {
                    Files.writeString(p, HtmlReportGenerator.generate(currentResult));
                } else {
                    Files.writeString(p, TxtReportGenerator.generate(currentResult));
                }

                Alert alert = new Alert(Alert.AlertType.CONFIRMATION, "Report saved to:\n" + p.toAbsolutePath() + "\n\nOpen report now?", ButtonType.YES, ButtonType.NO);
                alert.setTitle("Report Exported");
                alert.showAndWait().ifPresent(response -> {
                    if (response == ButtonType.YES && Desktop.isDesktopSupported()) {
                        try { Desktop.getDesktop().open(file); } catch (Exception ignored) {}
                    }
                });
            } catch (Exception ex) {
                showAlert(Alert.AlertType.ERROR, "Export Error", "Failed to export report: " + ex.getMessage());
            }
        }
    }

    private void openUrl(String url) {
        try {
            if (Desktop.isDesktopSupported() && Desktop.getDesktop().isSupported(Desktop.Action.BROWSE)) {
                Desktop.getDesktop().browse(new URI(url));
            }
        } catch (Exception ignored) {}
    }

    private void applyTheme() {
        if (scene == null) return;
        scene.getStylesheets().clear();
        String css = headerBar.isDark() ? "/css/photovault-dark.css" : "/css/photovault-light.css";
        var res = getClass().getResource(css);
        if (res != null) {
            scene.getStylesheets().add(res.toExternalForm());
        }
    }

    private void applyWindowAndTaskbarIcon(Stage stage) {
        if (stage == null) return;
        try {
            int[] sizes = {16, 24, 32, 48, 64, 128, 256};
            for (int s : sizes) {
                var stream = getClass().getResourceAsStream("/icons/icon.png");
                if (stream != null) {
                    stage.getIcons().add(new Image(stream, s, s, true, true));
                }
            }
        } catch (Exception ignored) {}

        try {
            if (java.awt.Taskbar.isTaskbarSupported()) {
                java.awt.Taskbar taskbar = java.awt.Taskbar.getTaskbar();
                if (taskbar.isSupported(java.awt.Taskbar.Feature.ICON_IMAGE)) {
                    var stream = getClass().getResourceAsStream("/icons/icon.png");
                    if (stream != null) {
                        taskbar.setIconImage(javax.imageio.ImageIO.read(stream));
                    }
                }
            }
        } catch (Throwable ignored) {}
    }

    private void showAlert(Alert.AlertType type, String title, String message) {
        Alert alert = new Alert(type, message);
        alert.setTitle(title);
        alert.setHeaderText(null);
        alert.showAndWait();
    }
}
