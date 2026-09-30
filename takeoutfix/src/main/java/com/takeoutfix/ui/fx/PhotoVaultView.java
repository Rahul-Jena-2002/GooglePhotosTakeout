package com.takeoutfix.ui.fx;

import javafx.application.Platform;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.collections.transformation.FilteredList;
import javafx.collections.transformation.SortedList;
import javafx.concurrent.Task;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Node;
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
 * - Bit-for-bit SHA-256 cryptographic verification
 * - 100% Read-Only execution guarantee
 * - Neutral dark KPI deck with 24-28px metrics
 * - Clear roles: SOURCE · ORIGINAL LIBRARY vs BACKUP · DESTINATION
 * - Filter pills (All, Verified, Missing, Modified) and search in Audit Log
 * - Exportable audit report in CSV, JSON, and Text Certificate
 */
public class PhotoVaultView extends VBox {

    private final Stage stage;

    // Dual Paths & info
    private File originalDir = null;
    private File backupDir = null;
    private final Label origPathLabel = new Label("No folder selected");
    private final Label origDetailsLabel = new Label("0 files");
    private final Label backupPathLabel = new Label("No folder selected");
    private final Label backupDetailsLabel = new Label("0 files");

    // Action Controls
    private final Button btnStart = new Button("Start Verification");
    private final Button btnPause = new Button("Pause");
    private final Button btnCancel = new Button("Cancel");
    private final MenuButton btnExportReport = new MenuButton("Export Report");

    // KPI Metric Labels
    private final Label kpiOriginal = new Label("0");
    private final Label kpiMatched = new Label("0");
    private final Label kpiDiscrepancies = new Label("0");
    private final Label kpiSpeed = new Label("0 MB/s");

    // Progress Deck
    private final ProgressBar progressBar = new ProgressBar(0.0);
    private final Label progressStatusLabel = new Label("Select original and backup folders to begin.");
    private final Label progressPercentLabel = new Label("0%");
    private final Label etaLabel = new Label("00:00");

    // Outcome Banner
    private final HBox outcomeBanner = new HBox(12);
    private final Label outcomeTitle = new Label();
    private final Label outcomeDesc = new Label();

    // Audit Discrepancies Table
    public static class AuditEntry {
        private final String timestamp;
        private final String status;      // VERIFIED, MISSING, MODIFIED
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

    private final ObservableList<AuditEntry> masterAuditList = FXCollections.observableArrayList();
    private final FilteredList<AuditEntry> filteredAuditList = new FilteredList<>(masterAuditList, p -> true);
    private final TableView<AuditEntry> auditTable = new TableView<>();
    private final TextField searchField = new TextField();
    private String activeFilter = "ALL";
    private final Label entriesCountLabel = new Label("0 entries");

    // State
    private Task<Void> activeTask = null;
    private final AtomicBoolean isPaused = new AtomicBoolean(false);
    private final AtomicBoolean isCancelled = new AtomicBoolean(false);

    public PhotoVaultView(Stage stage) {
        this.stage = stage;

        setSpacing(14);
        setPadding(new Insets(16, 20, 16, 20));
        VBox.setVgrow(this, Priority.ALWAYS);

        // 1. Header
        getChildren().add(buildHeaderRow());

        // 2. High-Contrast KPI Cards Deck
        getChildren().add(buildKpiCardsDeck());

        // 3. Operations Workspace (Folders + Compact Toolbar + Progress)
        getChildren().add(buildOperationsCard());

        // 4. Verification Outcome Banner
        buildOutcomeBanner();
        getChildren().add(outcomeBanner);

        // 5. Audit Log Table with Filters & Search
        VBox tableCard = buildAuditTableCard();
        VBox.setVgrow(tableCard, Priority.ALWAYS);
        getChildren().add(tableCard);
    }

    private HBox buildHeaderRow() {
        HBox header = new HBox(14);
        header.setAlignment(Pos.CENTER_LEFT);

        VBox titleBox = new VBox(3);
        HBox titleRow = new HBox(10);
        titleRow.setAlignment(Pos.CENTER_LEFT);

        Node vaultIcon = UiIcons.createSvgIcon(UiIcons.LOCK, 18, "#9B78F5");
        Label mainTitle = new Label("Private Photo Vault");
        mainTitle.setStyle("-fx-font-size: 22px; -fx-font-weight: 700; -fx-text-fill: #E6E7ED;");

        Label badge = new Label("Local processing");
        badge.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-text-fill: #10B981; -fx-background-color: rgba(16, 185, 129, 0.12); -fx-padding: 3 8 3 8; -fx-background-radius: 6;");

        titleRow.getChildren().addAll(vaultIcon, mainTitle, badge);

        Label subtitle = new Label("Verify backup integrity and protect private photo collections.");
        subtitle.setStyle("-fx-font-size: 13px; -fx-text-fill: #989BA8;");

        titleBox.getChildren().addAll(titleRow, subtitle);

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        Button btnVaultCrypto = new Button("Encrypted Vault Storage");
        btnVaultCrypto.getStyleClass().add("btn-secondary");
        btnVaultCrypto.setGraphic(UiIcons.createSvgIcon(UiIcons.SHIELD_CHECK, 14, "currentColor"));
        btnVaultCrypto.setStyle("-fx-font-size: 13px; -fx-padding: 7 14 7 14;");
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

        VBox card1 = createNeutralKpiCard("SCANNED", kpiOriginal, "Files in library", "#E6E7ED");
        VBox card2 = createNeutralKpiCard("VERIFIED", kpiMatched, "Identical files", "#10B981");
        VBox card3 = createNeutralKpiCard("DISCREPANCIES", kpiDiscrepancies, "Issues found", "#F59E0B");
        VBox card4 = createNeutralKpiCard("READ SPEED", kpiSpeed, "Current I/O throughput", "#3B82F6");

        HBox.setHgrow(card1, Priority.ALWAYS);
        HBox.setHgrow(card2, Priority.ALWAYS);
        HBox.setHgrow(card3, Priority.ALWAYS);
        HBox.setHgrow(card4, Priority.ALWAYS);

        deck.getChildren().addAll(card1, card2, card3, card4);
        return deck;
    }

    private VBox createNeutralKpiCard(String labelText, Label valLabel, String subText, String accentColor) {
        VBox card = new VBox(4);
        card.getStyleClass().add("glass-card");
        card.setStyle("-fx-background-color: #191A22; -fx-border-color: #30313B; -fx-border-radius: 8; -fx-background-radius: 8; -fx-padding: 12 16 12 16;");

        Label lbl = new Label(labelText);
        lbl.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-text-fill: #989BA8; -fx-letter-spacing: 0.5px;");

        valLabel.setStyle(String.format("-fx-font-size: 26px; -fx-font-weight: 800; -fx-text-fill: %s;", accentColor));

        Label sub = new Label(subText);
        sub.setStyle("-fx-font-size: 12px; -fx-text-fill: #989BA8;");

        card.getChildren().addAll(lbl, valLabel, sub);
        return card;
    }

    private VBox buildOperationsCard() {
        VBox card = new VBox(12);
        card.getStyleClass().add("glass-card");
        card.setStyle("-fx-background-color: #191A22; -fx-border-color: #30313B; -fx-border-radius: 8; -fx-background-radius: 8; -fx-padding: 14 16 14 16;");

        Label sectionTitle = new Label("Verify Backup Integrity");
        sectionTitle.setStyle("-fx-font-size: 14px; -fx-font-weight: 700; -fx-text-fill: #E6E7ED;");

        // Dual Folders: Source vs Destination
        HBox foldersRow = new HBox(14);

        // Source Box
        VBox origBox = new VBox(6);
        origBox.setStyle("-fx-background-color: #20212B; -fx-border-color: #30313B; -fx-border-radius: 6; -fx-background-radius: 6; -fx-padding: 10 12 10 12;");
        Label origTitle = new Label("SOURCE · ORIGINAL LIBRARY");
        origTitle.setStyle("-fx-font-size: 10px; -fx-font-weight: 800; -fx-text-fill: #989BA8; -fx-letter-spacing: 0.5px;");
        Label origHelp = new Label("Select the folder containing your original photos.");
        origHelp.setStyle("-fx-font-size: 11px; -fx-text-fill: #989BA8;");

        HBox origPickRow = new HBox(8);
        origPickRow.setAlignment(Pos.CENTER_LEFT);
        Button btnPickOrig = new Button("Select Folder");
        btnPickOrig.getStyleClass().add("btn-secondary");
        btnPickOrig.setStyle("-fx-font-size: 12px;");
        btnPickOrig.setGraphic(UiIcons.createSvgIcon(UiIcons.FOLDER, 13, "currentColor"));
        btnPickOrig.setOnAction(e -> pickOriginalFolder());

        VBox origText = new VBox(1);
        origPathLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: 600; -fx-text-fill: #E6E7ED;");
        origDetailsLabel.setStyle("-fx-font-size: 11px; -fx-text-fill: #989BA8;");
        origText.getChildren().addAll(origPathLabel, origDetailsLabel);

        origPickRow.getChildren().addAll(btnPickOrig, origText);
        origBox.getChildren().addAll(origTitle, origHelp, origPickRow);
        HBox.setHgrow(origBox, Priority.ALWAYS);

        // Backup Box
        VBox backupBox = new VBox(6);
        backupBox.setStyle("-fx-background-color: #20212B; -fx-border-color: #30313B; -fx-border-radius: 6; -fx-background-radius: 6; -fx-padding: 10 12 10 12;");
        Label backupTitle = new Label("BACKUP · DESTINATION");
        backupTitle.setStyle("-fx-font-size: 10px; -fx-font-weight: 800; -fx-text-fill: #989BA8; -fx-letter-spacing: 0.5px;");
        Label backupHelp = new Label("Select the backup to compare against.");
        backupHelp.setStyle("-fx-font-size: 11px; -fx-text-fill: #989BA8;");

        HBox backupPickRow = new HBox(8);
        backupPickRow.setAlignment(Pos.CENTER_LEFT);
        Button btnPickBackup = new Button("Select Folder");
        btnPickBackup.getStyleClass().add("btn-secondary");
        btnPickBackup.setStyle("-fx-font-size: 12px;");
        btnPickBackup.setGraphic(UiIcons.createSvgIcon(UiIcons.OUTPUT_FOLDER, 13, "currentColor"));
        btnPickBackup.setOnAction(e -> pickBackupFolder());

        VBox backupText = new VBox(1);
        backupPathLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: 600; -fx-text-fill: #E6E7ED;");
        backupDetailsLabel.setStyle("-fx-font-size: 11px; -fx-text-fill: #989BA8;");
        backupText.getChildren().addAll(backupPathLabel, backupDetailsLabel);

        backupPickRow.getChildren().addAll(btnPickBackup, backupText);
        backupBox.getChildren().addAll(backupTitle, backupHelp, backupPickRow);
        HBox.setHgrow(backupBox, Priority.ALWAYS);

        foldersRow.getChildren().addAll(origBox, backupBox);

        // Compact Toolbar Row: Start, Pause, Cancel, Export
        HBox toolbar = new HBox(10);
        toolbar.setAlignment(Pos.CENTER_LEFT);

        btnStart.getStyleClass().add("btn-primary");
        btnStart.setGraphic(UiIcons.createSvgIcon(UiIcons.SHIELD_CHECK, 14, "currentColor"));
        btnStart.setStyle("-fx-font-size: 13px; -fx-padding: 7 16 7 16;");
        btnStart.setOnAction(e -> startVerification());

        btnPause.getStyleClass().add("btn-secondary");
        btnPause.setGraphic(UiIcons.createSvgIcon(UiIcons.PAUSE, 13, "currentColor"));
        btnPause.setStyle("-fx-font-size: 13px; -fx-padding: 7 14 7 14;");
        btnPause.setDisable(true);
        btnPause.setOnAction(e -> togglePause());

        btnCancel.getStyleClass().add("btn-danger");
        btnCancel.setGraphic(UiIcons.createSvgIcon(UiIcons.X, 13, "currentColor"));
        btnCancel.setStyle("-fx-font-size: 13px; -fx-padding: 7 14 7 14;");
        btnCancel.setDisable(true);
        btnCancel.setOnAction(e -> cancelVerification());

        // Setup Export menu
        MenuItem itemCsv = new MenuItem("Export CSV (*.csv)");
        itemCsv.setOnAction(e -> exportAuditReport("CSV"));
        MenuItem itemJson = new MenuItem("Export JSON (*.json)");
        itemJson.setOnAction(e -> exportAuditReport("JSON"));
        MenuItem itemTxt = new MenuItem("Export Text Certificate (*.txt)");
        itemTxt.setOnAction(e -> exportAuditReport("TXT"));
        btnExportReport.getItems().setAll(itemCsv, itemJson, itemTxt);
        btnExportReport.getStyleClass().add("btn-secondary");
        btnExportReport.setStyle("-fx-font-size: 13px;");
        btnExportReport.setDisable(true);

        Region tbSpacer = new Region();
        HBox.setHgrow(tbSpacer, Priority.ALWAYS);

        toolbar.getChildren().addAll(btnStart, btnPause, btnCancel, tbSpacer, btnExportReport);

        // Progress Deck: percentage, ETA, status text, bar
        VBox progBox = new VBox(6);
        HBox progHeader = new HBox();
        progressStatusLabel.setStyle("-fx-font-size: 12px; -fx-text-fill: #989BA8;");

        Region pSp = new Region();
        HBox.setHgrow(pSp, Priority.ALWAYS);

        HBox metaProg = new HBox(6);
        progressPercentLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: 700; -fx-text-fill: #E6E7ED;");
        Label sep = new Label("·");
        sep.setStyle("-fx-text-fill: #989BA8;");
        etaLabel.setStyle("-fx-font-size: 12px; -fx-text-fill: #989BA8;");
        metaProg.getChildren().addAll(progressPercentLabel, sep, etaLabel);

        progHeader.getChildren().addAll(progressStatusLabel, pSp, metaProg);

        progressBar.setMaxWidth(Double.MAX_VALUE);
        progressBar.setStyle("-fx-pref-height: 5px;");

        progBox.getChildren().addAll(progHeader, progressBar);

        card.getChildren().addAll(sectionTitle, foldersRow, toolbar, progBox);
        return card;
    }

    private void buildOutcomeBanner() {
        outcomeBanner.setAlignment(Pos.CENTER_LEFT);
        outcomeBanner.setPadding(new Insets(10, 14, 10, 14));
        outcomeBanner.setVisible(false);
        outcomeBanner.setManaged(false);

        VBox textBox = new VBox(2);
        outcomeTitle.setStyle("-fx-font-size: 13px; -fx-font-weight: 800;");
        outcomeDesc.setStyle("-fx-font-size: 12px;");
        textBox.getChildren().addAll(outcomeTitle, outcomeDesc);

        outcomeBanner.getChildren().add(textBox);
    }

    private void showOutcome(String status, String title, String desc) {
        outcomeBanner.getChildren().clear();
        outcomeTitle.setText(title);
        outcomeDesc.setText(desc);

        if ("SUCCESS".equals(status)) {
            outcomeBanner.setStyle("-fx-background-color: rgba(16, 185, 129, 0.12); -fx-border-color: rgba(16, 185, 129, 0.35); -fx-border-radius: 6; -fx-background-radius: 6;");
            outcomeTitle.setStyle("-fx-font-size: 13px; -fx-font-weight: 800; -fx-text-fill: #10B981;");
            outcomeDesc.setStyle("-fx-font-size: 12px; -fx-text-fill: #10B981;");
            var icon = UiIcons.createSvgIcon(UiIcons.CHECK_CIRCLE, 18, "#10B981");
            outcomeBanner.getChildren().addAll(icon, new VBox(2, outcomeTitle, outcomeDesc));
        } else if ("WARNING".equals(status)) {
            outcomeBanner.setStyle("-fx-background-color: rgba(245, 158, 11, 0.12); -fx-border-color: rgba(245, 158, 11, 0.35); -fx-border-radius: 6; -fx-background-radius: 6;");
            outcomeTitle.setStyle("-fx-font-size: 13px; -fx-font-weight: 800; -fx-text-fill: #F59E0B;");
            outcomeDesc.setStyle("-fx-font-size: 12px; -fx-text-fill: #F59E0B;");
            var icon = UiIcons.createSvgIcon(UiIcons.ALERT, 18, "#F59E0B");
            outcomeBanner.getChildren().addAll(icon, new VBox(2, outcomeTitle, outcomeDesc));
        } else {
            outcomeBanner.setStyle("-fx-background-color: rgba(244, 63, 94, 0.12); -fx-border-color: rgba(244, 63, 94, 0.35); -fx-border-radius: 6; -fx-background-radius: 6;");
            outcomeTitle.setStyle("-fx-font-size: 13px; -fx-font-weight: 800; -fx-text-fill: #F43F5E;");
            outcomeDesc.setStyle("-fx-font-size: 12px; -fx-text-fill: #F43F5E;");
            var icon = UiIcons.createSvgIcon(UiIcons.ALERT, 18, "#F43F5E");
            outcomeBanner.getChildren().addAll(icon, new VBox(2, outcomeTitle, outcomeDesc));
        }

        outcomeBanner.setVisible(true);
        outcomeBanner.setManaged(true);
    }

    private VBox buildAuditTableCard() {
        VBox card = new VBox(10);
        card.getStyleClass().add("glass-card");
        card.setStyle("-fx-background-color: #191A22; -fx-border-color: #30313B; -fx-border-radius: 8; -fx-background-radius: 8; -fx-padding: 14;");

        // Header with count badge and search
        HBox headerRow = new HBox(8);
        headerRow.setAlignment(Pos.CENTER_LEFT);

        Label title = new Label("Audit & Discrepancy Log");
        title.setStyle("-fx-font-size: 15px; -fx-font-weight: 700; -fx-text-fill: #E6E7ED;");

        entriesCountLabel.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-text-fill: #989BA8; -fx-background-color: #20212B; -fx-padding: 2 8 2 8; -fx-background-radius: 10;");

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        searchField.setPromptText("Search files or paths...");
        searchField.setStyle("-fx-font-size: 12px; -fx-pref-width: 180px; -fx-background-color: #101116; -fx-text-fill: #E6E7ED; -fx-border-color: #30313B; -fx-border-radius: 6; -fx-background-radius: 6;");
        searchField.textProperty().addListener((obs, oldVal, newVal) -> applyFilter());

        headerRow.getChildren().addAll(title, entriesCountLabel, spacer, searchField);

        // Filter pills: All, Verified, Missing, Modified
        HBox filterBar = new HBox(6);
        filterBar.setAlignment(Pos.CENTER_LEFT);
        ToggleGroup filterGroup = new ToggleGroup();
        filterBar.getChildren().addAll(
                createFilterPill("All", "ALL", filterGroup, true),
                createFilterPill("Verified", "VERIFIED", filterGroup, false),
                createFilterPill("Missing", "MISSING", filterGroup, false),
                createFilterPill("Modified", "MODIFIED", filterGroup, false)
        );

        // Table setup
        setupAuditTableColumns();

        SortedList<AuditEntry> sortedData = new SortedList<>(filteredAuditList);
        sortedData.comparatorProperty().bind(auditTable.comparatorProperty());
        auditTable.setItems(sortedData);

        card.getChildren().addAll(headerRow, filterBar, auditTable);
        return card;
    }

    private ToggleButton createFilterPill(String text, String tag, ToggleGroup group, boolean selected) {
        ToggleButton btn = new ToggleButton(text);
        btn.setToggleGroup(group);
        btn.setSelected(selected);
        btn.setStyle("-fx-font-size: 12px; -fx-padding: 3 10 3 10; -fx-background-radius: 12;");
        btn.setOnAction(e -> {
            if (btn.isSelected()) {
                activeFilter = tag;
                applyFilter();
            } else {
                btn.setSelected(true);
            }
        });
        return btn;
    }

    private void setupAuditTableColumns() {
        TableColumn<AuditEntry, String> colTime = new TableColumn<>("Time");
        colTime.setCellValueFactory(d -> new javafx.beans.property.SimpleStringProperty(d.getValue().getTimestamp()));
        colTime.setPrefWidth(90);

        TableColumn<AuditEntry, String> colStatus = new TableColumn<>("Status");
        colStatus.setCellValueFactory(d -> new javafx.beans.property.SimpleStringProperty(d.getValue().getStatus()));
        colStatus.setPrefWidth(120);
        colStatus.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(String status, boolean empty) {
                super.updateItem(status, empty);
                if (empty || status == null) {
                    setText(null);
                    setGraphic(null);
                } else {
                    Label badge = new Label(status);
                    badge.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-padding: 2 7 2 7; -fx-background-radius: 4;");
                    if ("VERIFIED".equalsIgnoreCase(status)) {
                        badge.setStyle(badge.getStyle() + "; -fx-text-fill: #10B981; -fx-background-color: rgba(16, 185, 129, 0.12);");
                    } else if ("MISSING".equalsIgnoreCase(status)) {
                        badge.setStyle(badge.getStyle() + "; -fx-text-fill: #F59E0B; -fx-background-color: rgba(245, 158, 11, 0.12);");
                    } else {
                        badge.setStyle(badge.getStyle() + "; -fx-text-fill: #F43F5E; -fx-background-color: rgba(244, 63, 94, 0.12);");
                    }
                    setGraphic(badge);
                    setText(null);
                }
            }
        });

        TableColumn<AuditEntry, String> colFile = new TableColumn<>("Relative Path");
        colFile.setCellValueFactory(d -> new javafx.beans.property.SimpleStringProperty(d.getValue().getRelativePath()));
        colFile.setPrefWidth(350);

        TableColumn<AuditEntry, String> colDetails = new TableColumn<>("Details");
        colDetails.setCellValueFactory(d -> new javafx.beans.property.SimpleStringProperty(d.getValue().getDetails()));
        colDetails.setPrefWidth(300);

        auditTable.getColumns().clear();
        auditTable.getColumns().addAll(colTime, colStatus, colFile, colDetails);
        auditTable.setColumnResizePolicy(TableView.CONSTRAINED_RESIZE_POLICY);
        auditTable.setFixedCellSize(38);
        VBox.setVgrow(auditTable, Priority.ALWAYS);

        // Contextual empty state
        VBox emptyState = new VBox(10);
        emptyState.setAlignment(Pos.CENTER);
        emptyState.setPadding(new Insets(30));
        Node emptyIcon = UiIcons.createSvgIcon(UiIcons.SHIELD_CHECK, 40, "#989BA8");
        Label emptyTitle = new Label("No verification results yet");
        emptyTitle.setStyle("-fx-font-size: 15px; -fx-font-weight: 600; -fx-text-fill: #E6E7ED;");
        Label emptyDesc = new Label("Select your folders and start verification to view file-level results here.");
        emptyDesc.setStyle("-fx-font-size: 12px; -fx-text-fill: #989BA8;");
        emptyState.getChildren().addAll(emptyIcon, emptyTitle, emptyDesc);
        auditTable.setPlaceholder(emptyState);
    }

    private void applyFilter() {
        String q = searchField.getText() == null ? "" : searchField.getText().trim().toLowerCase();
        filteredAuditList.setPredicate(entry -> {
            boolean matchesSearch = q.isEmpty()
                    || entry.getRelativePath().toLowerCase().contains(q)
                    || entry.getDetails().toLowerCase().contains(q);
            if (!matchesSearch) return false;

            if ("VERIFIED".equalsIgnoreCase(activeFilter)) {
                return "VERIFIED".equalsIgnoreCase(entry.getStatus());
            } else if ("MISSING".equalsIgnoreCase(activeFilter)) {
                return "MISSING".equalsIgnoreCase(entry.getStatus());
            } else if ("MODIFIED".equalsIgnoreCase(activeFilter)) {
                return !"VERIFIED".equalsIgnoreCase(entry.getStatus()) && !"MISSING".equalsIgnoreCase(entry.getStatus());
            }
            return true; // ALL
        });

        entriesCountLabel.setText(filteredAuditList.size() + " entries");
    }

    private void pickOriginalFolder() {
        DirectoryChooser dc = new DirectoryChooser();
        dc.setTitle("Select Original Photo Library");
        File dir = dc.showDialog(stage);
        if (dir != null) {
            this.originalDir = dir;
            origPathLabel.setText(dir.getName());
            Tooltip.install(origPathLabel, new Tooltip(dir.getAbsolutePath()));

            File[] files = dir.listFiles();
            origDetailsLabel.setText((files != null ? files.length : 0) + " items in root folder");
        }
    }

    private void pickBackupFolder() {
        DirectoryChooser dc = new DirectoryChooser();
        dc.setTitle("Select Backup Directory to Verify");
        File dir = dc.showDialog(stage);
        if (dir != null) {
            this.backupDir = dir;
            backupPathLabel.setText(dir.getName());
            Tooltip.install(backupPathLabel, new Tooltip(dir.getAbsolutePath()));

            File[] files = dir.listFiles();
            backupDetailsLabel.setText((files != null ? files.length : 0) + " items in root folder");
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

        masterAuditList.clear();
        kpiMatched.setText("0");
        kpiDiscrepancies.setText("0");
        kpiSpeed.setText("0 MB/s");

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
                        AuditEntry entry = new AuditEntry("MISSING", relative.toString(), "File missing from backup");
                        Platform.runLater(() -> {
                            masterAuditList.add(entry);
                            applyFilter();
                        });
                    } else if (Files.size(origPath) != Files.size(backupPath)) {
                        discrepancies++;
                        AuditEntry entry = new AuditEntry("MODIFIED", relative.toString(),
                                "Size mismatch: Orig " + Files.size(origPath) + "B vs Backup " + Files.size(backupPath) + "B");
                        Platform.runLater(() -> {
                            masterAuditList.add(entry);
                            applyFilter();
                        });
                    } else {
                        // Stream SHA-256 for both
                        String origHash = hashFile(origPath);
                        String backupHash = hashFile(backupPath);
                        totalBytesHashed += Files.size(origPath) * 2;

                        if (origHash.equalsIgnoreCase(backupHash)) {
                            matched++;
                            AuditEntry entry = new AuditEntry("VERIFIED", relative.toString(), "Cryptographically identical SHA-256");
                            Platform.runLater(() -> {
                                masterAuditList.add(entry);
                                applyFilter();
                            });
                        } else {
                            discrepancies++;
                            AuditEntry entry = new AuditEntry("MODIFIED", relative.toString(), "Cryptographic SHA-256 checksum mismatch");
                            Platform.runLater(() -> {
                                masterAuditList.add(entry);
                                applyFilter();
                            });
                        }
                    }

                    int curMatched = matched;
                    int curDiscrepancies = discrepancies;
                    long elapsedSec = Math.max(1, (System.currentTimeMillis() - startMs) / 1000);
                    double mbPerSec = (totalBytesHashed / (1024.0 * 1024.0)) / elapsedSec;

                    Platform.runLater(() -> {
                        progressBar.setProgress(pct);
                        progressPercentLabel.setText(String.format(java.util.Locale.US, "%.0f%%", pct * 100));
                        progressStatusLabel.setText("Checking: " + relative.getFileName());
                        etaLabel.setText(String.format(java.util.Locale.US, "%02d:%02d", elapsedSec / 60, elapsedSec % 60));
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
        btnExportReport.setDisable(masterAuditList.isEmpty());
    }

    private void exportAuditReport(String format) {
        FileChooser fc = new FileChooser();
        fc.setTitle("Save PhotoVault Audit Report (" + format + ")");
        if ("CSV".equals(format)) {
            fc.setInitialFileName("PhotoVault_Audit_Report.csv");
            fc.getExtensionFilters().add(new FileChooser.ExtensionFilter("CSV (*.csv)", "*.csv"));
        } else if ("JSON".equals(format)) {
            fc.setInitialFileName("PhotoVault_Audit_Report.json");
            fc.getExtensionFilters().add(new FileChooser.ExtensionFilter("JSON (*.json)", "*.json"));
        } else {
            fc.setInitialFileName("PhotoVault_Audit_Certificate.txt");
            fc.getExtensionFilters().add(new FileChooser.ExtensionFilter("Text Certificate (*.txt)", "*.txt"));
        }

        File file = fc.showSaveDialog(stage);
        if (file == null) return;

        try (PrintWriter out = new PrintWriter(file)) {
            if ("CSV".equals(format)) {
                out.println("Time,Status,RelativePath,Details");
                for (AuditEntry e : masterAuditList) {
                    out.printf("\"%s\",\"%s\",\"%s\",\"%s\"%n",
                            escapeCsv(e.getTimestamp()),
                            escapeCsv(e.getStatus()),
                            escapeCsv(e.getRelativePath()),
                            escapeCsv(e.getDetails()));
                }
            } else if ("JSON".equals(format)) {
                out.println("[");
                for (int i = 0; i < masterAuditList.size(); i++) {
                    AuditEntry e = masterAuditList.get(i);
                    out.printf("  {\"time\":\"%s\",\"status\":\"%s\",\"file\":\"%s\",\"details\":\"%s\"}%s%n",
                            escapeJson(e.getTimestamp()),
                            escapeJson(e.getStatus()),
                            escapeJson(e.getRelativePath()),
                            escapeJson(e.getDetails()),
                            i < masterAuditList.size() - 1 ? "," : "");
                }
                out.println("]");
            } else {
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
                out.println("AUDIT DETAILS:");
                for (AuditEntry e : masterAuditList) {
                    out.printf("[%s] [%s] %s — %s%n", e.getTimestamp(), e.getStatus(), e.getRelativePath(), e.getDetails());
                }
                out.println("=================================================");
            }
            showAlert("Report Exported", "Audit report saved successfully:\n" + file.getAbsolutePath());
        } catch (Exception ex) {
            showAlert("Export Failed", "Error writing audit report: " + ex.getMessage());
        }
    }

    private String escapeCsv(String s) {
        return s == null ? "" : s.replace("\"", "\"\"");
    }

    private String escapeJson(String s) {
        return s == null ? "" : s.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private void showAlert(String title, String message) {
        Alert alert = new Alert(Alert.AlertType.INFORMATION);
        alert.initOwner(stage);
        alert.setTitle(title);
        alert.setHeaderText(null);
        alert.setContentText(message);
        alert.show();
    }
}
