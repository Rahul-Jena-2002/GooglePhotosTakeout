package com.takeoutfix.ui.fx;

import javafx.application.Platform;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.concurrent.Task;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.stage.DirectoryChooser;
import javafx.stage.FileChooser;
import javafx.stage.Stage;

import java.io.File;
import java.io.InputStream;
import java.io.PrintWriter;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.stream.Stream;

/**
 * Modern Pure JavaFX Workspace for PhotoVault Backup Verifier.
 * Merged into TakeoutFix Studio suite:
 * - Bit-for-bit SHA-256 cryptographic verification
 * - 100% Read-Only execution guarantee
 * - High-contrast semantic KPI deck
 * - Dual folder comparison (Original vs Backup)
 * - Live throughput and ETA
 * - Outcome banner (Verified Match, Incomplete, Corrupted)
 * - Exportable audit report
 */
public class PhotoVaultView extends VBox {

    private final Stage stage;

    // Dual Paths
    private File originalDir = null;
    private File backupDir = null;
    private final Label origPathLabel = new Label("No original directory selected");
    private final Label backupPathLabel = new Label("No backup directory selected");

    // Action Controls
    private final Button btnStart = new Button("Start Verification");
    private final Button btnPause = new Button("Pause");
    private final Button btnCancel = new Button("Cancel");
    private final Button btnExportReport = new Button("Export Audit Report");

    // KPI Metric Labels
    private final Label kpiOriginal = new Label("0");
    private final Label kpiMatched = new Label("0");
    private final Label kpiDiscrepancies = new Label("0");
    private final Label kpiSpeed = new Label("0.0 MB/s");

    // Progress Deck
    private final ProgressBar progressBar = new ProgressBar(0.0);
    private final Label progressStatusLabel = new Label("Ready — Select Original and Backup folders to begin.");
    private final Label progressPercentLabel = new Label("0%");
    private final Label etaLabel = new Label("⏱ Elapsed: 00:00");

    // Outcome Banner
    private final HBox outcomeBanner = new HBox(10);
    private final Label outcomeTitle = new Label();
    private final Label outcomeDesc = new Label();

    // Audit Discrepancies Table
    public static class AuditEntry {
        private final String timestamp;
        private final String status;
        private final String relativePath;
        private final String details;

        public AuditEntry(String status, String relativePath, String details) {
            this.timestamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("HH:mm:ss"));
            this.status = status;
            this.relativePath = relativePath;
            this.details = details;
        }

        public String getTimestamp() { return timestamp; }
        public String getStatus() { return status; }
        public String getRelativePath() { return relativePath; }
        public String getDetails() { return details; }
    }

    private final ObservableList<AuditEntry> auditList = FXCollections.observableArrayList();
    private final TableView<AuditEntry> auditTable = new TableView<>(auditList);

    // State
    private Task<Void> activeTask = null;
    private final AtomicBoolean isPaused = new AtomicBoolean(false);
    private final AtomicBoolean isCancelled = new AtomicBoolean(false);
    private final List<AuditEntry> completedDiscrepancies = new ArrayList<>();

    public PhotoVaultView(Stage stage) {
        this.stage = stage;

        setSpacing(14);
        setPadding(new Insets(16, 20, 16, 20));
        VBox.setVgrow(this, Priority.ALWAYS);

        // 1. Header
        getChildren().add(buildHeaderRow());

        // 2. High-Contrast KPI Cards Deck
        getChildren().add(buildKpiCardsDeck());

        // 3. Operations Workspace (Folders + Actions)
        getChildren().add(buildOperationsCard());

        // 4. Verification Outcome Banner (hidden by default)
        buildOutcomeBanner();
        getChildren().add(outcomeBanner);

        // 5. Audit Table & Diagnostics
        VBox tableCard = buildAuditTableCard();
        VBox.setVgrow(tableCard, Priority.ALWAYS);
        getChildren().add(tableCard);
    }

    private HBox buildHeaderRow() {
        HBox header = new HBox(16);
        header.setAlignment(Pos.CENTER_LEFT);

        VBox titleBox = new VBox(2);
        Label mainTitle = new Label("Private Photo Vault");
        mainTitle.setStyle("-fx-font-size: 16px; -fx-font-weight: 800;");

        Label subtitle = new Label("Verify bit-for-bit SHA-256 integrity and securely encrypt private media with AES-256-GCM.");
        subtitle.setStyle("-fx-font-size: 12px; -fx-text-fill: #71717a;");

        titleBox.getChildren().addAll(mainTitle, subtitle);

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        Button btnVaultCrypto = new Button("Encrypted Vault Storage");
        btnVaultCrypto.getStyleClass().add("btn-primary");
        btnVaultCrypto.setGraphic(UiIcons.createSvgIcon(UiIcons.LOCK, 13, "currentColor"));
        btnVaultCrypto.setOnAction(e -> {
            FxVaultCryptoDialog dlg = new FxVaultCryptoDialog(stage);
            dlg.showAndWait();
        });

        header.getChildren().addAll(titleBox, spacer, btnVaultCrypto);
        return header;
    }

    private HBox buildKpiCardsDeck() {
        HBox deck = new HBox(12);
        deck.setAlignment(Pos.CENTER_LEFT);

        VBox card1 = createSemanticKpiCard("Scanned Files", kpiOriginal, "Items found in original library", "#2563eb", "rgba(37, 99, 235, 0.08)");
        VBox card2 = createSemanticKpiCard("Verified Matches", kpiMatched, "Cryptographically identical SHA-256", "#059669", "rgba(5, 150, 105, 0.08)");
        VBox card3 = createSemanticKpiCard("Discrepancies", kpiDiscrepancies, "Missing or altered backup files", "#d97706", "rgba(217, 119, 6, 0.08)");
        VBox card4 = createSemanticKpiCard("Verification Speed", kpiSpeed, "I/O read throughput", "#7c3aed", "rgba(124, 58, 237, 0.08)");

        HBox.setHgrow(card1, Priority.ALWAYS);
        HBox.setHgrow(card2, Priority.ALWAYS);
        HBox.setHgrow(card3, Priority.ALWAYS);
        HBox.setHgrow(card4, Priority.ALWAYS);

        deck.getChildren().addAll(card1, card2, card3, card4);
        return deck;
    }

    private VBox createSemanticKpiCard(String labelText, Label valLabel, String subText, String accentColor, String bgTint) {
        VBox card = new VBox(4);
        card.getStyleClass().add("kpi-card");
        card.setStyle(String.format(
                "-fx-background-color: %s; -fx-border-color: %s; -fx-border-width: 0 0 0 4; -fx-background-radius: 8; -fx-border-radius: 8; -fx-padding: 12 16 12 16;",
                bgTint, accentColor
        ));

        Label lbl = new Label(labelText);
        lbl.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-text-fill: #64748b;");

        valLabel.setStyle(String.format(
                "-fx-font-size: 24px; -fx-font-weight: 800; -fx-text-fill: %s;",
                accentColor
        ));

        Label sub = new Label(subText);
        sub.setStyle("-fx-font-size: 11px; -fx-text-fill: #94a3b8;");

        card.getChildren().addAll(lbl, valLabel, sub);
        return card;
    }

    private VBox buildOperationsCard() {
        VBox card = new VBox(12);
        card.getStyleClass().add("glass-card");
        card.setPadding(new Insets(14, 16, 14, 16));

        // Row 1: Dual Folders (Original vs Backup)
        HBox foldersRow = new HBox(14);

        // Original Folder
        VBox origBox = new VBox(4);
        origBox.setStyle("-fx-background-color: rgba(113, 113, 122, 0.06); -fx-border-color: rgba(113, 113, 122, 0.15); -fx-border-radius: 6; -fx-background-radius: 6; -fx-padding: 8 10 8 10;");
        Label origTitle = new Label("1. ORIGINAL PHOTO LIBRARY (SOURCE)");
        origTitle.setStyle("-fx-font-size: 10px; -fx-font-weight: 700; -fx-text-fill: #71717a;");
        HBox origPickRow = new HBox(8);
        origPickRow.setAlignment(Pos.CENTER_LEFT);
        Button btnPickOrig = new Button("Select Folder");
        btnPickOrig.getStyleClass().add("btn-primary");
        btnPickOrig.setGraphic(UiIcons.createSvgIcon(UiIcons.FOLDER, 13, "currentColor"));
        btnPickOrig.setGraphicTextGap(6);
        btnPickOrig.setOnAction(e -> pickOriginalFolder());
        origPathLabel.setStyle("-fx-font-size: 11px; -fx-text-fill: #71717a;");
        origPickRow.getChildren().addAll(btnPickOrig, origPathLabel);
        origBox.getChildren().addAll(origTitle, origPickRow);
        HBox.setHgrow(origBox, Priority.ALWAYS);

        // Backup Folder
        VBox backupBox = new VBox(4);
        backupBox.setStyle("-fx-background-color: rgba(113, 113, 122, 0.06); -fx-border-color: rgba(113, 113, 122, 0.15); -fx-border-radius: 6; -fx-background-radius: 6; -fx-padding: 8 10 8 10;");
        Label backupTitle = new Label("2. BACKUP DESTINATION TO VERIFY");
        backupTitle.setStyle("-fx-font-size: 10px; -fx-font-weight: 700; -fx-text-fill: #71717a;");
        HBox backupPickRow = new HBox(8);
        backupPickRow.setAlignment(Pos.CENTER_LEFT);
        Button btnPickBackup = new Button("Select Folder");
        btnPickBackup.getStyleClass().add("btn-secondary");
        btnPickBackup.setGraphic(UiIcons.createSvgIcon(UiIcons.OUTPUT_FOLDER, 13, "currentColor"));
        btnPickBackup.setGraphicTextGap(6);
        btnPickBackup.setOnAction(e -> pickBackupFolder());
        backupPathLabel.setStyle("-fx-font-size: 11px; -fx-text-fill: #71717a;");
        backupPickRow.getChildren().addAll(btnPickBackup, backupPathLabel);
        backupBox.getChildren().addAll(backupTitle, backupPickRow);
        HBox.setHgrow(backupBox, Priority.ALWAYS);

        foldersRow.getChildren().addAll(origBox, backupBox);

        // Row 2: Action Controls + Progress Deck
        HBox actRow = new HBox(8);
        actRow.setAlignment(Pos.CENTER_LEFT);

        btnStart.getStyleClass().add("btn-primary");
        btnStart.setGraphic(UiIcons.createSvgIcon(UiIcons.SHIELD_CHECK, 14, "currentColor"));
        btnStart.setGraphicTextGap(6);
        btnStart.setStyle("-fx-font-size: 12px; -fx-font-weight: 700; -fx-pref-height: 32px; -fx-padding: 0 18 0 18;");
        btnStart.setOnAction(e -> startVerification());

        btnPause.getStyleClass().add("btn-secondary");
        btnPause.setGraphic(UiIcons.createSvgIcon(UiIcons.PAUSE, 13, "currentColor"));
        btnPause.setGraphicTextGap(6);
        btnPause.setDisable(true);
        btnPause.setOnAction(e -> togglePause());

        btnCancel.getStyleClass().add("btn-danger");
        btnCancel.setGraphic(UiIcons.createSvgIcon(UiIcons.X, 13, "currentColor"));
        btnCancel.setGraphicTextGap(6);
        btnCancel.setDisable(true);
        btnCancel.setOnAction(e -> cancelVerification());

        btnExportReport.getStyleClass().add("btn-ghost");
        btnExportReport.setStyle("-fx-font-size: 11px; -fx-font-weight: 600;");
        btnExportReport.setDisable(true);
        btnExportReport.setOnAction(e -> exportAuditReport());

        actRow.getChildren().addAll(btnStart, btnPause, btnCancel, btnExportReport);

        // Progress Bar & Status
        VBox progBox = new VBox(4);
        HBox progHeader = new HBox();
        progressStatusLabel.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-text-fill: #71717a;");
        Region pSp = new Region();
        HBox.setHgrow(pSp, Priority.ALWAYS);
        progressPercentLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: 700;");
        progHeader.getChildren().addAll(progressStatusLabel, pSp, etaLabel, new Label("  "), progressPercentLabel);

        progressBar.setMaxWidth(Double.MAX_VALUE);
        progressBar.setPrefHeight(6);

        progBox.getChildren().addAll(progHeader, progressBar);

        card.getChildren().addAll(foldersRow, actRow, progBox);
        return card;
    }

    private void buildOutcomeBanner() {
        outcomeBanner.setAlignment(Pos.CENTER_LEFT);
        outcomeBanner.setPadding(new Insets(10, 14, 10, 14));
        outcomeBanner.setVisible(false);
        outcomeBanner.setManaged(false);

        VBox textBox = new VBox(2);
        outcomeTitle.setStyle("-fx-font-size: 13px; -fx-font-weight: 800;");
        outcomeDesc.setStyle("-fx-font-size: 11px;");
        textBox.getChildren().addAll(outcomeTitle, outcomeDesc);

        outcomeBanner.getChildren().add(textBox);
    }

    private void showOutcome(String status, String title, String desc) {
        outcomeBanner.getChildren().clear();
        outcomeTitle.setText(title);
        outcomeDesc.setText(desc);

        if ("SUCCESS".equals(status)) {
            outcomeBanner.setStyle("-fx-background-color: rgba(16, 185, 129, 0.12); -fx-border-color: rgba(16, 185, 129, 0.35); -fx-border-radius: 6; -fx-background-radius: 6;");
            outcomeTitle.setStyle("-fx-font-size: 13px; -fx-font-weight: 800; -fx-text-fill: #10b981;");
            outcomeDesc.setStyle("-fx-font-size: 11px; -fx-text-fill: #059669;");
            var icon = UiIcons.createSvgIcon(UiIcons.CHECK_CIRCLE, 18, "#10b981");
            outcomeBanner.getChildren().addAll(icon, new VBox(2, outcomeTitle, outcomeDesc));
        } else if ("WARNING".equals(status)) {
            outcomeBanner.setStyle("-fx-background-color: rgba(245, 158, 11, 0.12); -fx-border-color: rgba(245, 158, 11, 0.35); -fx-border-radius: 6; -fx-background-radius: 6;");
            outcomeTitle.setStyle("-fx-font-size: 13px; -fx-font-weight: 800; -fx-text-fill: #f59e0b;");
            outcomeDesc.setStyle("-fx-font-size: 11px; -fx-text-fill: #d97706;");
            var icon = UiIcons.createSvgIcon(UiIcons.ALERT, 18, "#f59e0b");
            outcomeBanner.getChildren().addAll(icon, new VBox(2, outcomeTitle, outcomeDesc));
        } else {
            outcomeBanner.setStyle("-fx-background-color: rgba(239, 68, 68, 0.12); -fx-border-color: rgba(239, 68, 68, 0.35); -fx-border-radius: 6; -fx-background-radius: 6;");
            outcomeTitle.setStyle("-fx-font-size: 13px; -fx-font-weight: 800; -fx-text-fill: #ef4444;");
            outcomeDesc.setStyle("-fx-font-size: 11px; -fx-text-fill: #dc2626;");
            var icon = UiIcons.createSvgIcon(UiIcons.ALERT, 18, "#ef4444");
            outcomeBanner.getChildren().addAll(icon, new VBox(2, outcomeTitle, outcomeDesc));
        }

        outcomeBanner.setVisible(true);
        outcomeBanner.setManaged(true);
    }

    private VBox buildAuditTableCard() {
        VBox card = new VBox(6);
        card.getStyleClass().add("glass-card");
        card.setPadding(new Insets(10, 14, 10, 14));

        Label title = new Label("Audit & Discrepancies Log");
        title.setStyle("-fx-font-size: 12px; -fx-font-weight: 700; -fx-text-fill: #71717a;");

        TableColumn<AuditEntry, String> colTime = new TableColumn<>("Time");
        colTime.setCellValueFactory(d -> new javafx.beans.property.SimpleStringProperty(d.getValue().getTimestamp()));
        colTime.setPrefWidth(90);

        TableColumn<AuditEntry, String> colStatus = new TableColumn<>("Status");
        colStatus.setCellValueFactory(d -> new javafx.beans.property.SimpleStringProperty(d.getValue().getStatus()));
        colStatus.setPrefWidth(120);

        TableColumn<AuditEntry, String> colFile = new TableColumn<>("Relative Path");
        colFile.setCellValueFactory(d -> new javafx.beans.property.SimpleStringProperty(d.getValue().getRelativePath()));
        colFile.setPrefWidth(350);

        TableColumn<AuditEntry, String> colDetails = new TableColumn<>("Details");
        colDetails.setCellValueFactory(d -> new javafx.beans.property.SimpleStringProperty(d.getValue().getDetails()));
        colDetails.setPrefWidth(300);

        auditTable.getColumns().addAll(List.of(colTime, colStatus, colFile, colDetails));
        auditTable.setColumnResizePolicy(TableView.CONSTRAINED_RESIZE_POLICY);
        VBox.setVgrow(auditTable, Priority.ALWAYS);

        card.getChildren().addAll(title, auditTable);
        return card;
    }

    private void pickOriginalFolder() {
        DirectoryChooser dc = new DirectoryChooser();
        dc.setTitle("Select Original Photo Library");
        File dir = dc.showDialog(stage);
        if (dir != null) {
            this.originalDir = dir;
            origPathLabel.setText(dir.getAbsolutePath());
            origPathLabel.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-text-fill: #10b981;");
        }
    }

    private void pickBackupFolder() {
        DirectoryChooser dc = new DirectoryChooser();
        dc.setTitle("Select Backup Directory to Verify");
        File dir = dc.showDialog(stage);
        if (dir != null) {
            this.backupDir = dir;
            backupPathLabel.setText(dir.getAbsolutePath());
            backupPathLabel.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-text-fill: #10b981;");
        }
    }

    private void startVerification() {
        if (originalDir == null || backupDir == null) {
            showAlert("Selection Required", "Please select both Original and Backup directories before starting.");
            return;
        }

        btnStart.setDisable(true);
        btnPause.setDisable(false);
        btnCancel.setDisable(false);
        btnExportReport.setDisable(true);
        outcomeBanner.setVisible(false);
        outcomeBanner.setManaged(false);

        auditList.clear();
        completedDiscrepancies.clear();
        kpiMatched.setText("0");
        kpiDiscrepancies.setText("0");
        kpiSpeed.setText("0.0 MB/s");

        isPaused.set(false);
        isCancelled.set(false);

        activeTask = new Task<>() {
            @Override
            protected Void call() throws Exception {
                long startMs = System.currentTimeMillis();
                updateMessage("Scanning files in original directory...");

                List<Path> originalFiles;
                try (Stream<Path> stream = Files.walk(originalDir.toPath())) {
                    originalFiles = stream.filter(Files::isRegularFile).toList();
                }

                int total = originalFiles.size();
                Platform.runLater(() -> kpiOriginal.setText(String.valueOf(total)));

                if (total == 0) {
                    Platform.runLater(() -> {
                        showOutcome("WARNING", "No Files Found", "No regular files were found in original library.");
                        finishVerification();
                    });
                    return null;
                }

                int matched = 0;
                int discrepancies = 0;
                long totalBytesHashed = 0;

                for (int i = 0; i < total; i++) {
                    if (isCancelled.get()) break;
                    while (isPaused.get()) {
                        Thread.sleep(200);
                        if (isCancelled.get()) break;
                    }

                    Path origPath = originalFiles.get(i);
                    Path relative = originalDir.toPath().relativize(origPath);
                    Path backupPath = backupDir.toPath().resolve(relative);

                    int curIndex = i + 1;
                    double pct = (double) curIndex / total;

                    if (!Files.exists(backupPath)) {
                        discrepancies++;
                        AuditEntry entry = new AuditEntry("MISSING", relative.toString(), "File missing in backup copy");
                        Platform.runLater(() -> auditList.add(entry));
                        completedDiscrepancies.add(entry);
                    } else if (Files.size(origPath) != Files.size(backupPath)) {
                        discrepancies++;
                        AuditEntry entry = new AuditEntry("SIZE MISMATCH", relative.toString(),
                                "Orig: " + Files.size(origPath) + "B vs Backup: " + Files.size(backupPath) + "B");
                        Platform.runLater(() -> auditList.add(entry));
                        completedDiscrepancies.add(entry);
                    } else {
                        // Stream SHA-256 for both
                        String origHash = hashFile(origPath);
                        String backupHash = hashFile(backupPath);
                        totalBytesHashed += Files.size(origPath) * 2;

                        if (origHash.equalsIgnoreCase(backupHash)) {
                            matched++;
                        } else {
                            discrepancies++;
                            AuditEntry entry = new AuditEntry("CORRUPTED", relative.toString(), "Cryptographic SHA-256 hash mismatch");
                            Platform.runLater(() -> auditList.add(entry));
                            completedDiscrepancies.add(entry);
                        }
                    }

                    int curMatched = matched;
                    int curDiscrepancies = discrepancies;
                    long elapsedSec = Math.max(1, (System.currentTimeMillis() - startMs) / 1000);
                    double mbPerSec = (totalBytesHashed / (1024.0 * 1024.0)) / elapsedSec;

                    Platform.runLater(() -> {
                        progressBar.setProgress(pct);
                        progressPercentLabel.setText(String.format(java.util.Locale.US, "%.0f%%", pct * 100));
                        progressStatusLabel.setText("Verifying: " + relative.getFileName());
                        etaLabel.setText(String.format(java.util.Locale.US, "⏱ Elapsed: %02d:%02d", elapsedSec / 60, elapsedSec % 60));
                        kpiMatched.setText(String.valueOf(curMatched));
                        kpiDiscrepancies.setText(String.valueOf(curDiscrepancies));
                        kpiSpeed.setText(String.format(java.util.Locale.US, "%.1f MB/s", mbPerSec));
                    });
                }

                int finalMatched = matched;
                int finalDiscrepancies = discrepancies;
                Platform.runLater(() -> {
                    if (isCancelled.get()) {
                        showOutcome("WARNING", "Verification Cancelled", "Verification was halted by user.");
                    } else if (finalDiscrepancies == 0) {
                        showOutcome("SUCCESS", "VERIFIED 100% BIT-FOR-BIT MATCH",
                                String.format(java.util.Locale.US, "All %d files are cryptographically identical with 0 discrepancies.", total));
                    } else {
                        showOutcome("DANGER", "VERIFICATION DISCREPANCIES DETECTED",
                                String.format(java.util.Locale.US, "%d matching files, %d altered or missing backup files.", finalMatched, finalDiscrepancies));
                    }
                    finishVerification();
                });

                return null;
            }
        };

        Thread t = new Thread(activeTask, "photovault-verifier");
        t.setDaemon(true);
        t.start();
    }

    private String hashFile(Path path) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] buffer = new byte[65536];
        try (InputStream in = Files.newInputStream(path)) {
            int read;
            while ((read = in.read(buffer)) != -1) {
                digest.update(buffer, 0, read);
            }
        }
        byte[] hash = digest.digest();
        StringBuilder hex = new StringBuilder();
        for (byte b : hash) {
            hex.append(String.format("%02x", b));
        }
        return hex.toString();
    }

    private void togglePause() {
        boolean currentlyPaused = isPaused.get();
        isPaused.set(!currentlyPaused);
        if (!currentlyPaused) {
            btnPause.setText("Resume");
            progressStatusLabel.setText("Paused");
        } else {
            btnPause.setText("Pause");
            progressStatusLabel.setText("Resuming verification...");
        }
    }

    private void cancelVerification() {
        isCancelled.set(true);
        if (activeTask != null) {
            activeTask.cancel();
        }
        finishVerification();
    }

    private void finishVerification() {
        btnStart.setDisable(false);
        btnPause.setDisable(true);
        btnCancel.setDisable(true);
        btnExportReport.setDisable(false);
    }

    private void exportAuditReport() {
        FileChooser fc = new FileChooser();
        fc.setTitle("Save PhotoVault Audit Certificate");
        fc.setInitialFileName("PhotoVault_Audit_Report.txt");
        fc.getExtensionFilters().add(new FileChooser.ExtensionFilter("Text Certificate (*.txt)", "*.txt"));
        File file = fc.showSaveDialog(stage);
        if (file != null) {
            try (PrintWriter out = new PrintWriter(file)) {
                out.println("=================================================");
                out.println("  PhotoVault Cryptographic Backup Verification");
                out.println("=================================================");
                out.println("Generated: " + LocalDateTime.now());
                out.println("Original:  " + (originalDir != null ? originalDir.getAbsolutePath() : ""));
                out.println("Backup:    " + (backupDir != null ? backupDir.getAbsolutePath() : ""));
                out.println("Verified Matches: " + kpiMatched.getText());
                out.println("Discrepancies:    " + kpiDiscrepancies.getText());
                out.println("Throughput:       " + kpiSpeed.getText());
                out.println("-------------------------------------------------");
                out.println("DISCREPANCY AUDIT DETAILS:");
                for (AuditEntry e : auditList) {
                    out.printf("[%s] [%s] %s — %s%n", e.getTimestamp(), e.getStatus(), e.getRelativePath(), e.getDetails());
                }
                out.println("=================================================");
                showAlert("Report Exported", "Audit report saved successfully:\n" + file.getAbsolutePath());
            } catch (Exception ex) {
                showAlert("Export Failed", "Error writing audit report: " + ex.getMessage());
            }
        }
    }

    private void showAlert(String title, String message) {
        Alert alert = new Alert(Alert.AlertType.INFORMATION);
        alert.initOwner(stage);
        alert.setTitle(title);
        alert.setHeaderText(null);
        alert.setContentText(message);
        alert.showAndWait();
    }
}
