package com.takeoutfix.ui.fx;

import com.takeoutfix.auth.UserSyncBridgeService;
import com.takeoutfix.restore.PowerManager;
import com.takeoutfix.restore.SessionStatsService;
import com.takeoutfix.restore.TakeoutRestoreTask;
import com.takeoutfix.restore.TakeoutScanTask;
import com.takeoutfix.restore.infrastructure.ExtractionService;
import com.takeoutfix.restore.infrastructure.MediaScanner;
import com.takeoutfix.task.BackgroundTask;
import com.takeoutfix.task.TaskManager;
import javafx.application.Platform;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Node;
import javafx.scene.control.*;
import javafx.scene.input.Clipboard;
import javafx.scene.input.ClipboardContent;
import javafx.scene.input.Dragboard;
import javafx.scene.input.TransferMode;
import javafx.scene.layout.*;
import javafx.scene.paint.Color;
import javafx.scene.shape.Circle;
import javafx.stage.DirectoryChooser;
import javafx.stage.FileChooser;
import javafx.stage.Stage;

import java.awt.Desktop;
import java.io.File;
import java.io.PrintWriter;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.function.Consumer;

/**
 * Enterprise IntelliJ-style Takeout Restoration Center.
 * Clean, restrained layout with high-contrast typography and purple brand accents.
 */
public class TakeoutRestoreView extends VBox {

    private final Stage stage;
    private final ExtractionService extractionService;
    private final UserSyncBridgeService userService;
    private final SessionStatsService statsService;
    private final Consumer<WorkspaceType> onToolSwitch;

    // KPI Metric Labels
    private final Label kpiScanned = new Label("0");
    private final Label kpiRestored = new Label("0");
    private final Label kpiRestoredGb = new Label("0.00 GB");
    private final Label kpiNeedsReview = new Label("0");
    private final Label kpiFailed = new Label("0");

    // Paths & Source Telemetry
    private File selectedSource = null;
    private File selectedOutput = null;
    private final Label sourcePathLabel = new Label("No archive selected — browse or drop Takeout directory / ZIP");
    private final Label sourceMetaLabel = new Label("Awaiting selection • Folder or .zip");
    private final Label outputPathLabel = new Label("No destination folder selected yet — restored files will be saved here");
    private final Label outputMetaLabel = new Label("");
    private final Button btnSourceClear = new Button("✕");
    private final Button btnDestClear = new Button("✕");

    // Action Controls
    private final Button btnStart = new Button("Start Restoration");
    private final Button btnScan = new Button("Scan Archive");
    private final Button btnPause = new Button("Pause");
    private final Button btnCancel = new Button("Stop");
    private final Button btnOpenOutput = new Button("Open Output Folder");

    // Telemetry
    private final Circle statusPulseDot = new Circle(4.5, Color.web("#22C55E"));
    private final Label operationStateLabel = new Label("Ready to restore");
    private final Label currentFileLabel = new Label("Select a source archive and output destination to begin.");
    private final Label filesRatioLabel = new Label("0 / 0 files (0%)");
    private final ProgressBar progressBar = new ProgressBar(0.0);
    private final Label elapsedValLabel = new Label("00:00:00");
    private final Label speedValLabel = new Label("0.0 f/s • 0.0 MB/s");
    private final Label etaValLabel = new Label("--:--");

    // Restoration Options (All unchecked by default)
    private final CheckBox organizeMonthCheck = new CheckBox("Organize into Year/Month subfolders (YYYY/MM)");
    private final CheckBox splitVolumesCheck = new CheckBox("Compress output into 2GB ZIP volumes");
    private final CheckBox keepAwakeCheck = new CheckBox("Keep system awake while processing");
    private final CheckBox shutdownAfterCheck = new CheckBox("Shutdown system after completion");

    // Storage Telemetry (Side-by-side metric cards: done and required)
    private long sourceSizeBytes = 0;
    private long restoredBytes = 0;
    private final Label storageDoneValue = new Label("-- / --");
    private final Label storageDoneLabel = new Label("done");
    private final Label storageReqValue = new Label("-- / --");
    private final Label storageReqLabel = new Label("required");

    // Logs & Diagnostics Model
    private static class LogEntry {
        final String timestamp;
        final String level;
        final String message;

        LogEntry(String level, String message) {
            this.timestamp = LocalTime.now().format(DateTimeFormatter.ofPattern("HH:mm:ss"));
            this.level = level;
            this.message = message;
        }

        @Override
        public String toString() {
            return String.format("[%s] [%s] %s", timestamp, level, message);
        }
    }

    private final List<LogEntry> allLogs = new ArrayList<>();
    private final ObservableList<LogEntry> filteredLogs = FXCollections.observableArrayList();
    private final ListView<LogEntry> logListView = new ListView<>(filteredLogs);
    private final VBox logEmptyStateBox = new VBox(8);

    private String currentLogFilter = "ALL";
    private final TextField logSearchField = new TextField();
    private final Button tabAll = new Button("All (0)");
    private final Button tabRestored = new Button("Restored (0)");
    private final Button tabNeedsReview = new Button("Needs Review (0)");
    private final Button tabFailed = new Button("Failed (0)");
    private final Button btnCollapseLogs = new Button("Collapse Logs");
    private boolean isLogsCollapsed = false;

    private boolean isRunning = false;
    private boolean isPaused = false;
    private long startTimeMs = 0;
    private final PowerManager powerManager = new PowerManager();
    private com.takeoutfix.restore.TakeoutRestoreTask activeRestoreTask = null;
    private com.takeoutfix.restore.TakeoutScanTask activeScanTask = null;

    public TakeoutRestoreView(Stage stage,
                              ExtractionService extractionService,
                              UserSyncBridgeService userService,
                              SessionStatsService statsService,
                              Consumer<WorkspaceType> onToolSwitch) {
        this.stage = stage;
        this.extractionService = extractionService;
        this.userService = userService;
        this.statsService = statsService;
        this.onToolSwitch = onToolSwitch;

        setSpacing(16);
        setPadding(new Insets(24));
        VBox.setVgrow(this, Priority.ALWAYS);

        // 1. Header Row
        getChildren().add(buildHeaderRow());

        // 2. Resizable Vertical SplitPane (Workspace on Top | Diagnostics on Bottom)
        SplitPane verticalSplit = new SplitPane();
        verticalSplit.setOrientation(javafx.geometry.Orientation.VERTICAL);
        VBox.setVgrow(verticalSplit, Priority.ALWAYS);

        VBox workspaceCard = buildUnifiedWorkspaceCard();
        SplitPane.setResizableWithParent(workspaceCard, false);
        VBox logsCard = buildLogsConsoleCard();
        VBox.setVgrow(logsCard, Priority.ALWAYS);

        verticalSplit.getItems().addAll(workspaceCard, logsCard);
        verticalSplit.setDividerPositions(0.60);
        getChildren().add(verticalSplit);

        // Options unchecked by default
        organizeMonthCheck.setSelected(false);
        splitVolumesCheck.setSelected(false);
        keepAwakeCheck.setSelected(false);
        shutdownAfterCheck.setSelected(false);

        updateLogViewVisibility();
        updateButtonStates();
        updateStorageDisplay();
        setupExtractionListeners();
    }

    private HBox buildHeaderRow() {
        HBox header = new HBox(12);
        header.setAlignment(Pos.CENTER_LEFT);

        StackPane iconTile = new StackPane(UiIcons.createSvgIcon(UiIcons.RESTORE, 16, "currentColor"));
        iconTile.getStyleClass().add("header-icon-tile");

        VBox titleBox = new VBox(2);
        Label mainTitle = new Label("Takeout Metadata Restoration");
        mainTitle.getStyleClass().addAll("page-title", "header-title");

        Label subtitle = new Label("Restore original photo dates, locations, and details back into your media files");
        subtitle.getStyleClass().addAll("page-description", "header-subtitle");

        titleBox.getChildren().addAll(mainTitle, subtitle);
        header.getChildren().addAll(iconTile, titleBox);
        return header;
    }

    private HBox buildKpiCardsDeck() {
        HBox deck = new HBox(12);
        deck.setAlignment(Pos.CENTER_LEFT);

        VBox card1 = createSemanticKpiCard("FILES SCANNED", kpiScanned, "Examined media files", UiIcons.CAMERA);
        VBox card2 = createSemanticKpiCard("METADATA RESTORED", kpiRestored, "Dates & details restored", UiIcons.CHECK_CIRCLE);
        VBox card3 = createSemanticKpiCard("NEEDS REVIEW", kpiNeedsReview, "Ambiguous or partial sidecars", UiIcons.ALERT);
        VBox card4 = createSemanticKpiCard("FAILED", kpiFailed, "Corrupted or missing tags", UiIcons.X);

        HBox.setHgrow(card1, Priority.ALWAYS);
        HBox.setHgrow(card2, Priority.ALWAYS);
        HBox.setHgrow(card3, Priority.ALWAYS);
        HBox.setHgrow(card4, Priority.ALWAYS);

        deck.getChildren().addAll(card1, card2, card3, card4);
        return deck;
    }

    private void updateRestoredBytes(long bytes) {
        this.restoredBytes = bytes;
        if (bytes <= 0) {
            kpiRestoredGb.setText("0.00 GB");
        } else {
            double gb = bytes / (1024.0 * 1024.0 * 1024.0);
            if (gb >= 0.01) {
                kpiRestoredGb.setText(String.format(java.util.Locale.US, "%.2f GB", gb));
            } else {
                double mb = bytes / (1024.0 * 1024.0);
                kpiRestoredGb.setText(String.format(java.util.Locale.US, "%.1f MB", mb));
            }
        }
        updateStorageDisplay();
    }

    private VBox createSemanticKpiCard(String labelText, Label valLabel, String subText, String iconSvg) {
        VBox card = new VBox(4);
        card.getStyleClass().add("kpi-card");
        card.setPadding(new Insets(10, 16, 10, 16));
        card.setPrefHeight(88);
        card.setMinHeight(88);

        HBox topRow = new HBox(8);
        topRow.setAlignment(Pos.CENTER_LEFT);

        Label lbl = new Label(labelText);
        lbl.getStyleClass().addAll("kpi-title", "kpi-label");
        lbl.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-letter-spacing: 0.5px;");

        Region sp = new Region();
        HBox.setHgrow(sp, Priority.ALWAYS);

        Node icon = UiIcons.createSvgIcon(iconSvg, 13, "currentColor");
        icon.setOpacity(0.5);

        topRow.getChildren().addAll(lbl, sp, icon);

        valLabel.getStyleClass().setAll("kpi-value", "text-primary");
        valLabel.setStyle("-fx-font-size: 24px; -fx-font-weight: 700;");

        Label sub = new Label(subText);
        sub.getStyleClass().add("text-muted");
        sub.setStyle("-fx-font-size: 12px;");

        card.getChildren().addAll(topRow, valLabel, sub);
        return card;
    }

    private VBox buildUnifiedWorkspaceCard() {
        VBox card = new VBox(10);
        card.getStyleClass().add("glass-card");
        card.setStyle("-fx-background-radius: 8; -fx-border-radius: 8; -fx-border-width: 1; -fx-padding: 12 14 12 14;");
        VBox.setVgrow(card, Priority.ALWAYS);

        SplitPane horizSplit = new SplitPane();
        horizSplit.setOrientation(javafx.geometry.Orientation.HORIZONTAL);
        VBox.setVgrow(horizSplit, Priority.ALWAYS);

        // Left Column: Operations Pipeline + KPI Cards
        VBox leftCol = new VBox(8);
        VBox.setVgrow(leftCol, Priority.ALWAYS);
        leftCol.setMinWidth(480);

        HBox kpiDeck = buildKpiCardsDeck();
        VBox srcBox = buildSourceBox();
        VBox dstBox = buildDestinationBox();
        HBox actBox = buildActionButtonsBox();
        VBox progBox = buildProgressTelemetryBox();

        leftCol.getChildren().addAll(kpiDeck, srcBox, dstBox, actBox, progBox);

        // Right Column: Restoration Options (compact) + Dedicated Storage Card (outside at bottom)
        VBox rightCol = new VBox(10);
        VBox.setVgrow(rightCol, Priority.ALWAYS);
        rightCol.setPrefWidth(330);
        rightCol.setMinWidth(280);

        VBox optionsCard = buildRestorationOptionsCard();
        VBox.setVgrow(optionsCard, Priority.NEVER);

        Region rightSpacer = new Region();
        VBox.setVgrow(rightSpacer, Priority.ALWAYS);

        VBox storageCard = buildDedicatedStorageCard();
        VBox.setVgrow(storageCard, Priority.NEVER);

        rightCol.getChildren().addAll(optionsCard, rightSpacer, storageCard);

        horizSplit.getItems().addAll(leftCol, rightCol);
        horizSplit.setDividerPositions(0.68);
        card.getChildren().add(horizSplit);
        return card;
    }

    private VBox buildSourceBox() {
        VBox box = new VBox(6);
        box.setStyle("-fx-padding: 4 0 4 0;");

        HBox headerRow = new HBox(8);
        headerRow.setAlignment(Pos.CENTER_LEFT);

        Label title = new Label("Source Takeout Archive");
        title.setStyle("-fx-font-size: 13.5px; -fx-font-weight: 600;");
        title.getStyleClass().add("card-title");

        Region sp = new Region();
        HBox.setHgrow(sp, Priority.ALWAYS);

        sourceMetaLabel.getStyleClass().add("text-muted");

        headerRow.getChildren().addAll(title, sp, sourceMetaLabel);

        HBox row = new HBox(8);
        row.setAlignment(Pos.CENTER_LEFT);

        Button btnFolder = new Button("Browse Folder");
        btnFolder.getStyleClass().add("btn-secondary");
        btnFolder.setGraphic(UiIcons.createSvgIcon(UiIcons.FOLDER, 14, "currentColor"));
        btnFolder.setGraphicTextGap(7);
        btnFolder.setMinWidth(130);
        btnFolder.setStyle("-fx-font-size: 13.5px; -fx-font-weight: 500; -fx-pref-height: 36px; -fx-padding: 0 16 0 16;");
        btnFolder.setOnAction(e -> chooseSourceFolder());

        Button btnZip = new Button("ZIP Archive");
        btnZip.getStyleClass().add("btn-secondary");
        btnZip.setGraphic(UiIcons.createSvgIcon(UiIcons.ZIP, 14, "currentColor"));
        btnZip.setGraphicTextGap(7);
        btnZip.setMinWidth(115);
        btnZip.setStyle("-fx-font-size: 13.5px; -fx-font-weight: 500; -fx-pref-height: 36px; -fx-padding: 0 14 0 14;");
        btnZip.setOnAction(e -> chooseSourceZip());

        HBox pathDisplay = new HBox(8);
        pathDisplay.setAlignment(Pos.CENTER_LEFT);
        HBox.setHgrow(pathDisplay, Priority.ALWAYS);
        pathDisplay.getStyleClass().add("path-display-box");
        pathDisplay.setStyle("-fx-border-radius: 6; -fx-background-radius: 6; -fx-border-width: 1; -fx-padding: 4 10 4 10; -fx-pref-height: 36px;");

        Label pathIcon = new Label();
        pathIcon.setGraphic(UiIcons.createSvgIcon(UiIcons.FOLDER, 13, "currentColor"));

        sourcePathLabel.setStyle("-fx-font-size: 13px;");
        sourcePathLabel.getStyleClass().add("text-secondary");
        sourcePathLabel.setTextOverrun(OverrunStyle.CENTER_ELLIPSIS);
        HBox.setHgrow(sourcePathLabel, Priority.ALWAYS);

        btnSourceClear.getStyleClass().add("btn-ghost");
        btnSourceClear.setStyle("-fx-font-size: 12px; -fx-font-weight: 600; -fx-padding: 2 6 2 6; -fx-cursor: hand;");
        btnSourceClear.setVisible(false);
        btnSourceClear.setOnAction(e -> clearSource());

        pathDisplay.getChildren().addAll(pathIcon, sourcePathLabel, btnSourceClear);
        row.getChildren().addAll(btnFolder, btnZip, pathDisplay);
        box.getChildren().addAll(headerRow, row);

        box.setOnDragOver(event -> {
            if (event.getGestureSource() != box && event.getDragboard().hasFiles()) {
                event.acceptTransferModes(TransferMode.COPY);
                box.setStyle("-fx-background-color: rgba(167, 139, 250, 0.08); -fx-background-radius: 6; "
                        + "-fx-border-color: #A78BFA; -fx-border-radius: 6; -fx-border-width: 1; -fx-border-style: dashed; -fx-padding: 8 12 8 12;");
            }
            event.consume();
        });
        box.setOnDragExited(event -> {
            box.setStyle("-fx-background-radius: 6; -fx-border-radius: 6; -fx-border-width: 1; -fx-padding: 8 12 8 12;");
            event.consume();
        });
        box.setOnDragDropped(event -> {
            Dragboard db = event.getDragboard();
            boolean success = false;
            if (db.hasFiles() && !db.getFiles().isEmpty()) {
                setSourceFile(db.getFiles().get(0));
                success = true;
            }
            box.setStyle("-fx-background-radius: 6; -fx-border-radius: 6; -fx-border-width: 1; -fx-padding: 8 12 8 12;");
            event.setDropCompleted(success);
            event.consume();
        });

        return box;
    }

    private VBox buildDestinationBox() {
        VBox box = new VBox(6);
        box.setStyle("-fx-padding: 4 0 4 0;");

        HBox headerRow = new HBox(8);
        headerRow.setAlignment(Pos.CENTER_LEFT);

        Label title = new Label("Restored Destination");
        title.setStyle("-fx-font-size: 13.5px; -fx-font-weight: 600;");
        title.getStyleClass().add("card-title");

        Region sp = new Region();
        HBox.setHgrow(sp, Priority.ALWAYS);

        outputMetaLabel.getStyleClass().add("text-muted");

        headerRow.getChildren().addAll(title, sp, outputMetaLabel);

        HBox row = new HBox(8);
        row.setAlignment(Pos.CENTER_LEFT);

        Button btnDest = new Button("Select Destination");
        btnDest.getStyleClass().add("btn-secondary");
        btnDest.setGraphic(UiIcons.createSvgIcon(UiIcons.OUTPUT_FOLDER, 14, "currentColor"));
        btnDest.setGraphicTextGap(7);
        btnDest.setMinWidth(155);
        btnDest.setStyle("-fx-font-size: 13.5px; -fx-font-weight: 500; -fx-pref-height: 36px; -fx-padding: 0 16 0 16;");
        btnDest.setOnAction(e -> chooseDestinationFolder());

        HBox pathDisplay = new HBox(8);
        pathDisplay.setAlignment(Pos.CENTER_LEFT);
        HBox.setHgrow(pathDisplay, Priority.ALWAYS);
        pathDisplay.getStyleClass().add("path-display-box");
        pathDisplay.setStyle("-fx-border-radius: 6; -fx-background-radius: 6; -fx-border-width: 1; -fx-padding: 4 10 4 10; -fx-pref-height: 36px;");

        Label pathIcon = new Label();
        pathIcon.setGraphic(UiIcons.createSvgIcon(UiIcons.OUTPUT_FOLDER, 13, "currentColor"));

        outputPathLabel.setStyle("-fx-font-size: 13px;");
        outputPathLabel.getStyleClass().add("text-secondary");
        outputPathLabel.setTextOverrun(OverrunStyle.CENTER_ELLIPSIS);
        HBox.setHgrow(outputPathLabel, Priority.ALWAYS);

        btnDestClear.getStyleClass().add("btn-ghost");
        btnDestClear.setStyle("-fx-font-size: 12px; -fx-font-weight: 600; -fx-padding: 2 6 2 6; -fx-cursor: hand;");
        btnDestClear.setVisible(false);
        btnDestClear.setOnAction(e -> clearDestination());

        pathDisplay.getChildren().addAll(pathIcon, outputPathLabel, btnDestClear);
        row.getChildren().addAll(btnDest, pathDisplay);
        box.getChildren().addAll(headerRow, row);

        box.setOnDragOver(event -> {
            if (event.getGestureSource() != box && event.getDragboard().hasFiles()) {
                event.acceptTransferModes(TransferMode.COPY);
                box.setStyle("-fx-background-color: rgba(54, 201, 143, 0.08); -fx-background-radius: 6; "
                        + "-fx-border-color: #36C98F; -fx-border-radius: 6; -fx-border-width: 1; -fx-border-style: dashed; -fx-padding: 8 12 8 12;");
            }
            event.consume();
        });
        box.setOnDragExited(event -> {
            box.setStyle("-fx-background-radius: 6; -fx-border-radius: 6; -fx-border-width: 1; -fx-padding: 8 12 8 12;");
            event.consume();
        });
        box.setOnDragDropped(event -> {
            Dragboard db = event.getDragboard();
            boolean success = false;
            if (db.hasFiles() && !db.getFiles().isEmpty()) {
                File f = db.getFiles().get(0);
                setDestinationFile(f.isDirectory() ? f : f.getParentFile());
                success = true;
            }
            box.setStyle("-fx-background-radius: 6; -fx-border-radius: 6; -fx-border-width: 1; -fx-padding: 8 12 8 12;");
            event.setDropCompleted(success);
            event.consume();
        });

        return box;
    }

    private HBox buildActionButtonsBox() {
        HBox row = new HBox(8);
        row.setAlignment(Pos.CENTER_LEFT);
        row.setStyle("-fx-padding: 4 0 4 0;");

        btnStart.getStyleClass().add("btn-primary");
        btnStart.setGraphic(UiIcons.createSvgIcon(UiIcons.PLAY, 14, "currentColor"));
        btnStart.setGraphicTextGap(8);
        btnStart.setMinWidth(140);
        btnStart.setStyle("-fx-font-size: 13.5px; -fx-font-weight: 600; -fx-pref-height: 36px; -fx-padding: 0 18 0 18; -fx-background-radius: 6;");
        btnStart.setOnAction(e -> handleStart());

        btnScan.getStyleClass().add("btn-secondary");
        btnScan.setGraphic(UiIcons.createSvgIcon(UiIcons.SEARCH, 13, "currentColor"));
        btnScan.setGraphicTextGap(7);
        btnScan.setMinWidth(120);
        btnScan.setStyle("-fx-font-size: 13.5px; -fx-font-weight: 500; -fx-pref-height: 36px; -fx-padding: 0 14 0 14; -fx-background-radius: 6;");
        btnScan.setTooltip(new Tooltip("Scan archive and preview matched items without writing to disk."));
        btnScan.setOnAction(e -> handleScan());

        btnPause.getStyleClass().add("btn-secondary");
        btnPause.setGraphic(UiIcons.createSvgIcon(UiIcons.PAUSE, 12, "currentColor"));
        btnPause.setGraphicTextGap(6);
        btnPause.setMinWidth(80);
        btnPause.setStyle("-fx-font-size: 13.5px; -fx-font-weight: 500; -fx-pref-height: 36px; -fx-padding: 0 12 0 12; -fx-background-radius: 6;");
        btnPause.setDisable(true);
        btnPause.setOnAction(e -> handlePause());

        btnCancel.getStyleClass().add("btn-secondary");
        btnCancel.setText("Stop");
        btnCancel.setGraphic(UiIcons.createSvgIcon(UiIcons.STOP, 11, "currentColor"));
        btnCancel.setGraphicTextGap(6);
        btnCancel.setMinWidth(75);
        btnCancel.setStyle("-fx-font-size: 13.5px; -fx-font-weight: 500; -fx-pref-height: 36px; -fx-padding: 0 12 0 12; -fx-background-radius: 6;");
        btnCancel.setDisable(true);
        btnCancel.setOnAction(e -> handleCancel());

        btnOpenOutput.getStyleClass().add("btn-secondary");
        btnOpenOutput.setGraphic(UiIcons.createSvgIcon(UiIcons.OUTPUT_FOLDER, 13, "currentColor"));
        btnOpenOutput.setGraphicTextGap(7);
        btnOpenOutput.setMinWidth(150);
        btnOpenOutput.setStyle("-fx-font-size: 13.5px; -fx-font-weight: 500; -fx-pref-height: 36px; -fx-padding: 0 14 0 14; -fx-background-radius: 6;");
        btnOpenOutput.setOnAction(e -> handleOpenOutput());

        row.getChildren().addAll(btnStart, btnScan, btnPause, btnCancel, btnOpenOutput);
        return row;
    }

    private VBox buildProgressTelemetryBox() {
        VBox box = new VBox(7);
        box.getStyleClass().add("inner-container");
        box.setStyle("-fx-background-radius: 6; -fx-border-radius: 6; -fx-border-width: 1; -fx-padding: 8 12 8 12;");

        HBox statusRow = new HBox(8);
        statusRow.setAlignment(Pos.CENTER_LEFT);

        statusRow.getChildren().add(statusPulseDot);

        operationStateLabel.setStyle("-fx-font-size: 13px; -fx-font-weight: 600;");
        operationStateLabel.getStyleClass().add("text-primary");
        statusRow.getChildren().add(operationStateLabel);

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        filesRatioLabel.setStyle("-fx-font-size: 13px; -fx-font-weight: 700; -fx-font-family: 'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace;"); filesRatioLabel.getStyleClass().add("brand-accent");

        statusRow.getChildren().addAll(spacer, filesRatioLabel);

        currentFileLabel.getStyleClass().add("text-secondary");
        currentFileLabel.setTextOverrun(OverrunStyle.CENTER_ELLIPSIS);

        progressBar.setMaxWidth(Double.MAX_VALUE);
        progressBar.setPrefHeight(6);

        HBox telemetryRow = new HBox(8);
        telemetryRow.setAlignment(Pos.CENTER_LEFT);

        HBox chipElapsed = createTelemetryChip("Elapsed", elapsedValLabel, UiIcons.HISTORY);
        HBox chipSpeed = createTelemetryChip("Speed", speedValLabel, UiIcons.ZAP);
        HBox chipEta = createTelemetryChip("Estimated", etaValLabel, UiIcons.CALENDAR);

        HBox.setHgrow(chipElapsed, Priority.ALWAYS);
        HBox.setHgrow(chipSpeed, Priority.ALWAYS);
        HBox.setHgrow(chipEta, Priority.ALWAYS);

        telemetryRow.getChildren().addAll(chipElapsed, chipSpeed, chipEta);

        box.getChildren().addAll(statusRow, currentFileLabel, progressBar, telemetryRow);
        return box;
    }

    private HBox createTelemetryChip(String label, Label valLabel, String iconSvg) {
        HBox chip = new HBox(5);
        chip.setAlignment(Pos.CENTER_LEFT);
        chip.getStyleClass().add("telemetry-chip");

        Label icon = new Label();
        icon.setGraphic(UiIcons.createSvgIcon(iconSvg, 12, "currentColor"));

        Label name = new Label(label + ":");
        name.getStyleClass().add("telemetry-chip-label");
        name.setStyle("-fx-font-size: 12px; -fx-font-weight: 600;");

        valLabel.getStyleClass().add("telemetry-chip-value");
        valLabel.setStyle("-fx-font-family: 'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace; -fx-font-size: 12.5px; -fx-font-weight: 700;");

        chip.getChildren().addAll(icon, name, valLabel);
        return chip;
    }

    private VBox buildRestorationOptionsCard() {
        VBox card = new VBox(6);
        card.getStyleClass().add("inner-container");
        card.setStyle("-fx-background-radius: 8; -fx-border-radius: 8; -fx-border-width: 1; -fx-padding: 10 12 10 12;");

        // Header
        HBox titleRow = new HBox(8);
        titleRow.setAlignment(Pos.CENTER_LEFT);
        Label title = new Label("RESTORATION OPTIONS");
        title.setStyle("-fx-font-size: 12.5px; -fx-font-weight: 700; -fx-letter-spacing: 0.5px;");
        title.getStyleClass().add("card-title");
        titleRow.getChildren().addAll(UiIcons.createSvgIcon(UiIcons.SETTINGS, 13, "currentColor"), title);

        // Group 1: Output & Structure
        Label outputGroupLabel = new Label("Output & Structure");
        outputGroupLabel.getStyleClass().addAll("section-sub-title", "text-muted");
        outputGroupLabel.setStyle("-fx-font-size: 12.5px; -fx-font-weight: 700; -fx-text-transform: uppercase; -fx-padding: 4 0 2 0;");

        organizeMonthCheck.getStyleClass().add("text-primary");
        organizeMonthCheck.setStyle("-fx-font-size: 13.5px; -fx-cursor: hand;");
        splitVolumesCheck.getStyleClass().add("text-primary");
        splitVolumesCheck.setStyle("-fx-font-size: 13.5px; -fx-cursor: hand;");

        // Group 2: System & Power
        Label systemGroupLabel = new Label("System & Power");
        systemGroupLabel.getStyleClass().addAll("section-sub-title", "text-muted");
        systemGroupLabel.setStyle("-fx-font-size: 12.5px; -fx-font-weight: 700; -fx-text-transform: uppercase; -fx-padding: 6 0 2 0;");

        keepAwakeCheck.getStyleClass().add("text-primary");
        keepAwakeCheck.setStyle("-fx-font-size: 13.5px; -fx-cursor: hand;");
        shutdownAfterCheck.getStyleClass().add("text-primary");
        shutdownAfterCheck.setStyle("-fx-font-size: 13.5px; -fx-cursor: hand;");

        card.getChildren().addAll(
                titleRow,
                outputGroupLabel,
                organizeMonthCheck,
                splitVolumesCheck,
                systemGroupLabel,
                keepAwakeCheck,
                shutdownAfterCheck
        );
        return card;
    }

    private VBox buildDedicatedStorageCard() {
        VBox card = new VBox(8);
        card.getStyleClass().add("inner-container");
        card.setStyle("-fx-background-radius: 8; -fx-border-radius: 8; -fx-border-width: 1; -fx-padding: 10 12 10 12;");

        HBox storeHeaderRow = new HBox(8);
        storeHeaderRow.setAlignment(Pos.CENTER_LEFT);

        Node icon = UiIcons.createSvgIcon(UiIcons.HARD_DRIVE, 13, "currentColor");
        Label storeTitle = new Label("STORAGE");
        storeTitle.setStyle("-fx-font-size: 12.5px; -fx-font-weight: 700; -fx-letter-spacing: 0.5px;");
        storeTitle.getStyleClass().add("card-title");

        Region spStorage = new Region();
        HBox.setHgrow(spStorage, Priority.ALWAYS);

        Label localPill = new Label("100% OFFLINE");
        localPill.setStyle("-fx-font-size: 10px; -fx-font-weight: 700; -fx-text-fill: #10B981; -fx-background-color: rgba(16, 185, 129, 0.12); -fx-padding: 2 6 2 6; -fx-background-radius: 4;");

        storeHeaderRow.getChildren().addAll(icon, storeTitle, spStorage, localPill);

        // Two small cards side-by-side: [ done ] and [ required ]
        HBox dualCardsRow = new HBox(8);
        dualCardsRow.setAlignment(Pos.CENTER);

        VBox doneCard = createStorageSubCard(storageDoneValue, storageDoneLabel);
        VBox reqCard = createStorageSubCard(storageReqValue, storageReqLabel);

        dualCardsRow.getChildren().addAll(doneCard, reqCard);
        card.getChildren().addAll(storeHeaderRow, dualCardsRow);
        return card;
    }

    private VBox createStorageSubCard(Label valueLabel, Label tagLabel) {
        VBox card = new VBox(3);
        card.getStyleClass().add("sub-card");
        card.setAlignment(Pos.CENTER);
        card.setStyle("-fx-background-radius: 6; -fx-border-radius: 6; -fx-border-width: 1; -fx-padding: 10 6 10 6;");
        HBox.setHgrow(card, Priority.ALWAYS);

        valueLabel.setStyle("-fx-font-family: 'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace; -fx-font-size: 13px; -fx-font-weight: 700; -fx-text-alignment: center;");
        valueLabel.getStyleClass().add("text-primary");
        valueLabel.setAlignment(Pos.CENTER);

        tagLabel.setStyle("-fx-font-size: 11.5px; -fx-font-weight: 600; -fx-opacity: 0.85; -fx-text-alignment: center;");
        tagLabel.getStyleClass().add("text-muted");
        tagLabel.setAlignment(Pos.CENTER);

        card.getChildren().addAll(valueLabel, tagLabel);
        return card;
    }

    private void updateStorageDisplay() {
        String doneLeft = formatStorageGb(restoredBytes);
        String doneRight = sourceSizeBytes > 0 ? formatStorageGb(sourceSizeBytes) : "--";
        storageDoneValue.setText(doneLeft + " / " + doneRight);

        long freeBytes = 0;
        if (selectedOutput != null) {
            try {
                freeBytes = selectedOutput.getUsableSpace();
            } catch (Exception ignored) {}
        }

        String reqLeft = sourceSizeBytes > 0 ? formatStorageGb(sourceSizeBytes) : "--";
        String reqRight = freeBytes > 0 ? formatStorageGb(freeBytes) : "--";
        storageReqValue.setText(reqLeft + " / " + reqRight);

        if (sourceSizeBytes > 0 && freeBytes > 0) {
            if (freeBytes < sourceSizeBytes) {
                storageReqValue.setStyle("-fx-font-family: 'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace; -fx-font-size: 12.5px; -fx-font-weight: 700; -fx-text-fill: #EF4444; -fx-text-alignment: center;");
            } else {
                storageReqValue.setStyle("-fx-font-family: 'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace; -fx-font-size: 12.5px; -fx-font-weight: 700; -fx-text-fill: #10B981; -fx-text-alignment: center;");
            }
        } else {
            storageReqValue.setStyle("-fx-font-family: 'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace; -fx-font-size: 12.5px; -fx-font-weight: 700; -fx-text-alignment: center;");
        }
    }

    private String formatStorageGb(long bytes) {
        if (bytes <= 0) return "0 GB";
        double gb = bytes / (1024.0 * 1024.0 * 1024.0);
        if (gb >= 1.0) {
            return String.format(java.util.Locale.US, "%.1f GB", gb);
        } else {
            double mb = bytes / (1024.0 * 1024.0);
            return String.format(java.util.Locale.US, "%.0f MB", mb);
        }
    }

    private VBox buildLogsConsoleCard() {
        VBox card = new VBox(6);
        card.getStyleClass().add("glass-card");
        card.setStyle("-fx-background-radius: 8; -fx-border-radius: 8; -fx-border-width: 1; -fx-padding: 8 12 8 12;");

        HBox topRow = new HBox(8);
        topRow.setAlignment(Pos.CENTER_LEFT);

        Label termIcon = new Label();
        termIcon.setGraphic(UiIcons.createSvgIcon(UiIcons.TERMINAL, 13, "currentColor"));

        Label logsTitle = new Label("DIAGNOSTICS & LOGS");
        logsTitle.setStyle("-fx-font-size: 12px; -fx-font-weight: 600; -fx-letter-spacing: 0.5px;");
        logsTitle.getStyleClass().add("card-title");

        HBox filterTabs = new HBox(4);
        filterTabs.setAlignment(Pos.CENTER_LEFT);
        styleTabButton(tabAll, "ALL", true);
        styleTabButton(tabRestored, "RESTORED", false);
        styleTabButton(tabNeedsReview, "NEEDS REVIEW", false);
        styleTabButton(tabFailed, "FAILED", false);

        tabAll.setOnAction(e -> setLogFilter("ALL"));
        tabRestored.setOnAction(e -> setLogFilter("RESTORED"));
        tabNeedsReview.setOnAction(e -> setLogFilter("NEEDS_REVIEW"));
        tabFailed.setOnAction(e -> setLogFilter("FAILED"));

        filterTabs.getChildren().addAll(tabAll, tabRestored, tabNeedsReview, tabFailed);

        logSearchField.setPromptText("Filter logs...");
        logSearchField.getStyleClass().add("text-field");
        logSearchField.setStyle("-fx-font-size: 12.5px; -fx-pref-height: 28px; -fx-pref-width: 150px;");
        logSearchField.textProperty().addListener((obs, oldV, newV) -> applyLogFilter());

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        Button btnExport = new Button("Export");
        btnExport.getStyleClass().add("btn-ghost");
        btnExport.setGraphic(UiIcons.createSvgIcon(UiIcons.DOWNLOAD, 12, "currentColor"));
        btnExport.setStyle("-fx-font-size: 12.5px; -fx-font-weight: 500; -fx-padding: 4 8 4 8; -fx-cursor: hand;");
        btnExport.setOnAction(e -> exportLogsToFile());

        Button btnCopy = new Button("Copy");
        btnCopy.getStyleClass().add("btn-ghost");
        btnCopy.setGraphic(UiIcons.createSvgIcon(UiIcons.COPY, 12, "currentColor"));
        btnCopy.setStyle("-fx-font-size: 12.5px; -fx-font-weight: 500; -fx-padding: 4 8 4 8; -fx-cursor: hand;");
        btnCopy.setOnAction(e -> copyLogsToClipboard());

        Button btnClear = new Button("Clear");
        btnClear.getStyleClass().add("btn-ghost");
        btnClear.setGraphic(UiIcons.createSvgIcon(UiIcons.TRASH, 12, "currentColor"));
        btnClear.setStyle("-fx-font-size: 12.5px; -fx-font-weight: 500; -fx-padding: 4 8 4 8; -fx-cursor: hand;");
        btnClear.setOnAction(e -> clearLogs());

        btnCollapseLogs.getStyleClass().add("btn-ghost");
        btnCollapseLogs.setStyle("-fx-font-size: 12.5px; -fx-font-weight: 500; -fx-padding: 4 8 4 8; -fx-cursor: hand;");
        btnCollapseLogs.setOnAction(e -> toggleCollapseLogs());

        topRow.getChildren().addAll(termIcon, logsTitle, filterTabs, logSearchField, spacer, btnExport, btnCopy, btnClear, btnCollapseLogs);

        logEmptyStateBox.getStyleClass().add("empty-state-box");
        logEmptyStateBox.setStyle("-fx-background-radius: 6; -fx-border-radius: 6; -fx-border-width: 1; -fx-padding: 18 16 18 16; -fx-alignment: center;");

        StackPane emptyIconCircle = new StackPane();
        emptyIconCircle.setStyle("-fx-background-color: rgba(167, 139, 250, 0.08); -fx-background-radius: 20; -fx-min-width: 40px; -fx-min-height: 40px; -fx-max-width: 40px; -fx-max-height: 40px;");
        emptyIconCircle.getChildren().add(UiIcons.createSvgIcon(UiIcons.TERMINAL, 18, "#A78BFA"));

        Label emptyTitle = new Label("No restoration activity yet");
        emptyTitle.getStyleClass().add("empty-state-title");
        emptyTitle.setStyle("-fx-font-size: 14.5px; -fx-font-weight: 600;");

        Label emptySub = new Label("Activity logs, file matching details, and processing status will appear here when restoration starts.");
        emptySub.getStyleClass().add("empty-state-sub");
        emptySub.setStyle("-fx-font-size: 13px; -fx-text-alignment: center;");

        logEmptyStateBox.getChildren().addAll(emptyIconCircle, emptyTitle, emptySub);

        logListView.getStyleClass().add("list-view");
        logListView.setStyle("-fx-border-radius: 6; -fx-background-radius: 6;");
        logListView.setCellFactory(lv -> new ListCell<>() {
            @Override
            protected void updateItem(LogEntry item, boolean empty) {
                super.updateItem(item, empty);
                if (empty || item == null) {
                    setText(null);
                    setGraphic(null);
                } else {
                    HBox row = new HBox(10);
                    row.setAlignment(Pos.CENTER_LEFT);

                    Label timeLabel = new Label(item.timestamp);
                    timeLabel.getStyleClass().add("timestamp");

                    Label badge = new Label(item.level.toUpperCase());
                    badge.getStyleClass().add("log-badge");
                    if ("SUCCESS".equalsIgnoreCase(item.level)) {
                        badge.getStyleClass().add("log-badge-success");
                    } else if ("ERROR".equalsIgnoreCase(item.level)) {
                        badge.getStyleClass().add("log-badge-error");
                    } else if ("WARN".equalsIgnoreCase(item.level)) {
                        badge.getStyleClass().add("log-badge-warn");
                    } else {
                        badge.getStyleClass().add("log-badge-info");
                    }

                    Label msgLabel = new Label(item.message);
                    msgLabel.getStyleClass().addAll("log-entry", "text-primary");
                    msgLabel.setWrapText(true);
                    HBox.setHgrow(msgLabel, Priority.ALWAYS);

                    row.getChildren().addAll(timeLabel, badge, msgLabel);
                    setGraphic(row);
                    setText(null);
                }
            }
        });

        VBox.setVgrow(logListView, Priority.ALWAYS);
        VBox.setVgrow(logEmptyStateBox, Priority.ALWAYS);

        StackPane contentStack = new StackPane(logEmptyStateBox, logListView);
        VBox.setVgrow(contentStack, Priority.ALWAYS);

        card.getChildren().addAll(topRow, contentStack);
        return card;
    }

    private void toggleCollapseLogs() {
        isLogsCollapsed = !isLogsCollapsed;
        btnCollapseLogs.setText(isLogsCollapsed ? "Expand Logs" : "Collapse Logs");
        if (isLogsCollapsed) {
            logListView.setMaxHeight(80);
            logEmptyStateBox.setMaxHeight(80);
        } else {
            logListView.setMaxHeight(Double.MAX_VALUE);
            logEmptyStateBox.setMaxHeight(Double.MAX_VALUE);
        }
    }

    private void updateLogViewVisibility() {
        boolean hasLogs = !allLogs.isEmpty();
        logEmptyStateBox.setVisible(!hasLogs);
        logEmptyStateBox.setManaged(!hasLogs);
        logListView.setVisible(hasLogs);
        logListView.setManaged(hasLogs);
    }

    private void styleTabButton(Button btn, String filterKey, boolean active) {
        btn.getStyleClass().removeAll("log-tab-btn-active");
        if (!btn.getStyleClass().contains("log-tab-btn")) {
            btn.getStyleClass().add("log-tab-btn");
        }
        if (active) {
            btn.getStyleClass().add("log-tab-btn-active");
        }
        btn.setStyle("");
    }

    private void setLogFilter(String filterKey) {
        this.currentLogFilter = filterKey;
        styleTabButton(tabAll, "ALL", "ALL".equals(filterKey));
        styleTabButton(tabRestored, "RESTORED", "RESTORED".equals(filterKey));
        styleTabButton(tabNeedsReview, "NEEDS_REVIEW", "NEEDS_REVIEW".equals(filterKey));
        styleTabButton(tabFailed, "FAILED", "FAILED".equals(filterKey));
        applyLogFilter();
    }

    private void applyLogFilter() {
        String query = logSearchField.getText() != null ? logSearchField.getText().trim().toLowerCase() : "";
        filteredLogs.clear();
        for (LogEntry e : allLogs) {
            boolean matchesCategory = switch (currentLogFilter) {
                case "RESTORED" -> "SUCCESS".equalsIgnoreCase(e.level);
                case "NEEDS_REVIEW" -> "WARN".equalsIgnoreCase(e.level);
                case "FAILED" -> "ERROR".equalsIgnoreCase(e.level);
                default -> true;
            };

            boolean matchesSearch = query.isEmpty() || e.message.toLowerCase().contains(query);
            if (matchesCategory && matchesSearch) {
                filteredLogs.add(e);
            }
        }
        updateLogViewVisibility();
    }

    public void appendLog(String level, String message) {
        Platform.runLater(() -> {
            LogEntry entry = new LogEntry(level, message);
            allLogs.add(entry);

            applyLogFilter();
            if (!filteredLogs.isEmpty()) {
                logListView.scrollTo(filteredLogs.size() - 1);
            }

            int allCount = allLogs.size();
            long succCount = allLogs.stream().filter(l -> "SUCCESS".equalsIgnoreCase(l.level)).count();
            long warnCount = allLogs.stream().filter(l -> "WARN".equalsIgnoreCase(l.level)).count();
            long errCount = allLogs.stream().filter(l -> "ERROR".equalsIgnoreCase(l.level)).count();

            tabAll.setText("All (" + allCount + ")");
            tabRestored.setText("Restored (" + succCount + ")");
            tabNeedsReview.setText("Needs Review (" + warnCount + ")");
            tabFailed.setText("Failed (" + errCount + ")");
        });
    }

    private void copyLogsToClipboard() {
        StringBuilder sb = new StringBuilder();
        for (LogEntry e : allLogs) {
            sb.append(e.toString()).append("\n");
        }
        Clipboard clipboard = Clipboard.getSystemClipboard();
        ClipboardContent content = new ClipboardContent();
        content.putString(sb.toString());
        clipboard.setContent(content);
        appendLog("INFO", "Copied " + allLogs.size() + " logs to clipboard.");
    }

    private void exportLogsToFile() {
        FileChooser chooser = new FileChooser();
        chooser.setTitle("Export Diagnostic Logs");
        chooser.setInitialFileName("takeoutfix-restore-log.txt");
        chooser.getExtensionFilters().add(new FileChooser.ExtensionFilter("Text Log (*.txt)", "*.txt"));
        File file = chooser.showSaveDialog(stage);
        if (file != null) {
            try (PrintWriter writer = new PrintWriter(file)) {
                for (LogEntry e : allLogs) {
                    writer.println(e.toString());
                }
                appendLog("SUCCESS", "Diagnostic logs successfully exported to " + file.getName());
            } catch (Exception ex) {
                showAlert("Export Failed", "Could not export logs: " + ex.getMessage());
            }
        }
    }

    private void clearLogs() {
        allLogs.clear();
        filteredLogs.clear();
        tabAll.setText("All (0)");
        tabRestored.setText("Restored (0)");
        tabNeedsReview.setText("Needs Review (0)");
        tabFailed.setText("Failed (0)");
        kpiScanned.setText("0");
        kpiRestored.setText("0");
        kpiRestoredGb.setText("0.00 GB");
        kpiNeedsReview.setText("0");
        kpiFailed.setText("0");
        restoredBytes = 0;
        updateStorageDisplay();
        updateLogViewVisibility();
    }

    private void chooseSourceFolder() {
        DirectoryChooser chooser = new DirectoryChooser();
        chooser.setTitle("Select Google Takeout Directory");
        File dir = chooser.showDialog(stage);
        if (dir != null) {
            setSourceFile(dir);
        }
    }

    private void chooseSourceZip() {
        FileChooser chooser = new FileChooser();
        chooser.setTitle("Select Google Takeout ZIP Archive");
        chooser.getExtensionFilters().add(new FileChooser.ExtensionFilter("ZIP Archive (*.zip)", "*.zip"));
        File zip = chooser.showOpenDialog(stage);
        if (zip != null) {
            setSourceFile(zip);
        }
    }

    private void setSourceFile(File file) {
        this.selectedSource = file;
        sourcePathLabel.setText(file.getAbsolutePath());
        sourcePathLabel.setStyle("-fx-font-size: 13px; -fx-font-weight: 600;");
        sourcePathLabel.getStyleClass().add("text-primary");
        btnSourceClear.setVisible(true);

        sourceMetaLabel.setText("Scanning archive...");
        updateButtonStates();
        new Thread(() -> {
            try {
                if (file.isFile() && file.getName().toLowerCase().endsWith(".zip")) {
                    sourceSizeBytes = file.length();
                    long sizeMb = file.length() / (1024 * 1024);
                    Platform.runLater(() -> {
                        sourceMetaLabel.setText(String.format("ZIP Archive • %,d MB", sizeMb));
                        updateStorageDisplay();
                    });
                } else if (file.isDirectory()) {
                    List<File> media = new MediaScanner().listMediaFiles(file);
                    long totalBytes = 0;
                    for (File m : media) totalBytes += m.length();
                    sourceSizeBytes = totalBytes;
                    long sizeMb = totalBytes / (1024 * 1024);
                    int count = media.size();
                    Platform.runLater(() -> {
                        sourceMetaLabel.setText(String.format("%,d media files • %,d MB", count, sizeMb));
                        kpiScanned.setText(String.valueOf(count));
                        updateStorageDisplay();
                    });
                }
            } catch (Exception ignored) {
                Platform.runLater(() -> {
                    sourceMetaLabel.setText("Ready to process");
                    updateStorageDisplay();
                });
            }
        }, "source-scan-thread").start();
    }

    private void clearSource() {
        selectedSource = null;
        sourceSizeBytes = 0;
        sourcePathLabel.setText("No archive selected — browse or drop Takeout directory / ZIP");
        sourcePathLabel.setStyle("-fx-font-size: 13px;");
        sourcePathLabel.getStyleClass().add("text-secondary");
        sourceMetaLabel.setText("Awaiting selection • Folder or .zip");
        btnSourceClear.setVisible(false);
        updateButtonStates();
        updateStorageDisplay();
    }

    private void chooseDestinationFolder() {
        DirectoryChooser chooser = new DirectoryChooser();
        chooser.setTitle("Select Restored Destination Folder");
        File dir = chooser.showDialog(stage);
        if (dir != null) {
            setDestinationFile(dir);
        }
    }

    private void setDestinationFile(File file) {
        this.selectedOutput = file;
        outputPathLabel.setText(file.getAbsolutePath());
        outputPathLabel.setStyle("-fx-font-size: 13px; -fx-font-weight: 600;");
        outputPathLabel.getStyleClass().add("text-primary");
        outputMetaLabel.setText("Destination selected");
        btnDestClear.setVisible(true);
        updateButtonStates();
        updateStorageDisplay();
    }

    private void clearDestination() {
        selectedOutput = null;
        outputPathLabel.setText("No destination folder selected yet — restored files will be saved here");
        outputPathLabel.setStyle("-fx-font-size: 13px;");
        outputPathLabel.getStyleClass().add("text-secondary");
        outputMetaLabel.setText("");
        btnDestClear.setVisible(false);
        updateButtonStates();
        updateStorageDisplay();
    }

    private void handleScan() {
        if (isRunning) {
            showAlert("Process Running", "A scan or restoration process is already actively running.");
            return;
        }
        if (selectedSource == null) {
            showAlert("Source Archive Required", "Please select a Google Takeout folder or ZIP archive to scan.");
            return;
        }
        executeScanArchive();
    }

    private void handleStart() {
        if (isRunning) {
            showAlert("Process Running", "A scan or restoration process is already actively running.");
            return;
        }
        if (selectedSource == null) {
            showAlert("Source Archive Required", "Please select a Google Takeout folder or ZIP archive to begin.");
            return;
        }
        if (selectedOutput == null) {
            showAlert("Output Location Required", "Please designate an output destination folder.");
            return;
        }

        if (selectedSource.equals(selectedOutput) ||
                selectedOutput.getAbsolutePath().equalsIgnoreCase(selectedSource.getAbsolutePath()) ||
                selectedOutput.getAbsolutePath().startsWith(selectedSource.getAbsolutePath() + File.separator)) {
            showAlert("Destination Conflict", "The output folder must be a separate directory outside the source archive.");
            return;
        }

        boolean signedIn = userService != null && userService.isSignedIn();
        java.util.prefs.Preferences prefs = java.util.prefs.Preferences.userNodeForPackage(TakeoutRestoreView.class);
        boolean suppress = prefs.getBoolean("suppress_trust_popup", false);
        if (!signedIn && !suppress) {
            FxTrustSignInDialog trustDialog = new FxTrustSignInDialog(stage, userService, () -> {
                executeLiveRestoration();
            });
            trustDialog.showAndWait();
            return;
        }

        executeLiveRestoration();
    }

    private void executeScanArchive() {
        isRunning = true;
        isPaused = false;
        startTimeMs = System.currentTimeMillis();
        updateButtonStates();

        appendLog("INFO", "Starting scan for " + selectedSource.getName());
        operationStateLabel.setText("Scanning archive & matching metadata...");
        currentFileLabel.setText("Inspecting files and JSON sidecars without writing to disk");

        TakeoutScanTask scanTask = new TakeoutScanTask(selectedSource, new TakeoutScanTask.ScanListener() {
            @Override
            public void onProgress(int current, int total, int matched, int unmatched, File currentFile) {
                Platform.runLater(() -> {
                    int pct = total > 0 ? (int) (((double) current / total) * 100) : 0;
                    progressBar.setProgress(pct / 100.0);
                    filesRatioLabel.setText(String.format("%,d / %,d files (%d%%)", current, total, pct));
                    currentFileLabel.setText("Scanning: " + currentFile.getName());
                    kpiRestored.setText(String.valueOf(matched));
                    kpiNeedsReview.setText(String.valueOf(unmatched));
                });
            }

            @Override
            public void onComplete(int total, int matched, int unmatched) {
                Platform.runLater(() -> {
                    operationStateLabel.setText("Scan Complete");
                    currentFileLabel.setText(String.format("Scanned %,d files: %,d matched, %,d require review.", total, matched, unmatched));
                    appendLog("SUCCESS", String.format("Scan finished: %,d files evaluated, %,d sidecars matched.", total, matched));
                    showAlert("Scan Completed", String.format("Scan finished.\n\n• Files Scanned: %,d\n• Metadata Matchable: %,d\n• Needs Review: %,d", total, matched, unmatched));
                    isRunning = false;
                    isPaused = false;
                    activeScanTask = null;
                    updateButtonStates();
                });
            }

            @Override
            public void onError(Throwable t) {
                Platform.runLater(() -> {
                    appendLog("ERROR", "Scan failed: " + t.getMessage());
                    operationStateLabel.setText("Scan encountered an error.");
                    isRunning = false;
                    isPaused = false;
                    activeScanTask = null;
                    updateButtonStates();
                });
            }
        });

        this.activeScanTask = scanTask;
        com.takeoutfix.task.TaskManager.getInstance().submitTask(scanTask);
    }

    private void executeLiveRestoration() {
        isRunning = true;
        isPaused = false;
        startTimeMs = System.currentTimeMillis();
        updateButtonStates();

        boolean shutdownRequested = shutdownAfterCheck.isSelected();
        if (keepAwakeCheck.isSelected() || shutdownRequested) {
            powerManager.startKeepAwake();
        }

        appendLog("INFO", "Starting restoration from " + selectedSource.getName() + " to " + selectedOutput.getName());
        operationStateLabel.setText("Initializing restoration engine...");
        currentFileLabel.setText("Extracting archive & parsing sidecars...");

        PowerManager.PostAction postAction = shutdownRequested
                ? PowerManager.PostAction.KEEP_AWAKE_THEN_SHUTDOWN
                : PowerManager.PostAction.KEEP_AWAKE_ONLY;

        TakeoutRestoreTask restoreTask = new TakeoutRestoreTask(
                extractionService,
                selectedSource.getAbsolutePath(),
                selectedOutput.getAbsolutePath(),
                postAction,
                Optional.empty(),
                false,
                splitVolumesCheck.isSelected(),
                -1,
                0,
                true,
                organizeMonthCheck.isSelected()
        );

        this.activeRestoreTask = restoreTask;

        restoreTask.stateProperty().addListener((obs, oldState, newState) -> {
            if (newState == BackgroundTask.TaskState.COMPLETED) {
                Platform.runLater(() -> {
                    operationStateLabel.setText("Restoration Complete");
                    currentFileLabel.setText("Restoration completed successfully.");
                    showRestoreCompletionPopup();
                    isRunning = false;
                    isPaused = false;
                    activeRestoreTask = null;
                    updateButtonStates();
                    powerManager.stopKeepAwake();

                    if (shutdownRequested) {
                        appendLog("WARN", "Restoration complete. Shutdown initiated: System will power off in 60 seconds. (Run 'shutdown /a' to cancel)");
                        powerManager.runShutdownCommand(60);
                    }
                });
                try {
                    int restored = 0;
                    try { restored = Integer.parseInt(kpiRestored.getText().trim()); } catch (Exception ignored) {}
                    if (restored <= 0 && extractionService != null) {
                        restored = extractionService.getProcessedFiles();
                    }
                    long bytes = restoreTask.getBytesProcessed() > 0 ? restoreTask.getBytesProcessed() : (extractionService != null ? extractionService.getProcessedBytes() : 0L);
                    if (bytes <= 0 && restored > 0) {
                        bytes = restored * 3500000L;
                    }
                    if (bytes > 0) {
                        final long fBytes = bytes;
                        Platform.runLater(() -> updateRestoredBytes(fBytes));
                    }
                    if (statsService != null) {
                        statsService.record(restored, bytes);
                    }
                    new com.takeoutfix.shared.history.OperationHistoryService().recordOperation(
                            "Fix Google Photos",
                            "SUCCESS",
                            null,
                            java.time.Instant.now(),
                            restored,
                            bytes,
                            "Google Photos Takeout restoration completed with verified metadata."
                    );
                } catch (Exception ignored) {}
            } else if (newState == BackgroundTask.TaskState.FAILED) {
                Platform.runLater(() -> {
                    Throwable ex = restoreTask.getFailureError();
                    String msg = ex != null ? (ex.getMessage() != null ? ex.getMessage() : ex.getClass().getSimpleName()) : "Unknown error";
                    appendLog("ERROR", "Restoration failed: " + msg);
                    operationStateLabel.setText("Restoration did not complete.");
                    showErrorAlert("Restoration Failed", msg);
                    isRunning = false;
                    isPaused = false;
                    activeRestoreTask = null;
                    updateButtonStates();
                    powerManager.stopKeepAwake();
                });
            } else if (newState == BackgroundTask.TaskState.CANCELLED) {
                Platform.runLater(() -> {
                    isRunning = false;
                    isPaused = false;
                    activeRestoreTask = null;
                    updateButtonStates();
                    powerManager.stopKeepAwake();
                    appendLog("WARN", "Restoration cancelled by user.");
                    operationStateLabel.setText("Restoration cancelled.");
                    currentFileLabel.setText("Operation stopped.");
                });
            } else if (newState == BackgroundTask.TaskState.PAUSED) {
                Platform.runLater(() -> {
                    isPaused = true;
                    updateButtonStates();
                    operationStateLabel.setText("Restoration paused.");
                    appendLog("WARN", "Restoration paused.");
                });
            } else if (newState == BackgroundTask.TaskState.PROCESSING && isPaused) {
                Platform.runLater(() -> {
                    isPaused = false;
                    updateButtonStates();
                    operationStateLabel.setText("Restoring metadata...");
                    appendLog("INFO", "Restoration resumed.");
                });
            }
        });

        com.takeoutfix.task.TaskManager.getInstance().submitTask(restoreTask);
    }

    private void handlePause() {
        if (!isRunning) return;
        if (activeRestoreTask != null) {
            if (activeRestoreTask.isPaused()) {
                activeRestoreTask.resume();
            } else {
                activeRestoreTask.pause();
            }
        } else if (activeScanTask != null) {
            if (activeScanTask.isPaused()) {
                activeScanTask.resume();
            } else {
                activeScanTask.pause();
            }
        } else {
            isPaused = !isPaused;
            updateButtonStates();
            if (isPaused) {
                extractionService.pause();
            } else {
                extractionService.resume();
            }
        }
    }

    private void handleCancel() {
        if (!isRunning) return;
        if (activeRestoreTask != null) {
            activeRestoreTask.cancel();
        } else if (activeScanTask != null) {
            activeScanTask.cancel();
        } else {
            extractionService.cancel();
        }
        isRunning = false;
        isPaused = false;
        updateButtonStates();
        powerManager.stopKeepAwake();
        appendLog("WARN", "Operation cancelled by user.");
        operationStateLabel.setText("Operation cancelled.");
        currentFileLabel.setText("Operation stopped.");
    }

    private void handleOpenOutput() {
        if (selectedOutput != null && selectedOutput.exists()) {
            try {
                Desktop.getDesktop().open(selectedOutput);
            } catch (Exception ex) {
                showAlert("Cannot Open Folder", "Could not open folder: " + ex.getMessage());
            }
        } else {
            showAlert("Folder Not Found", "Output folder does not exist yet.");
        }
    }

    private void updateButtonStates() {
        btnStart.setDisable(isRunning || selectedSource == null || selectedOutput == null);
        btnScan.setDisable(isRunning);
        btnPause.setDisable(!isRunning);
        btnCancel.setDisable(!isRunning);
        btnPause.setText(isPaused ? "Resume" : "Pause");
        btnPause.setGraphic(UiIcons.createSvgIcon(isPaused ? UiIcons.PLAY : UiIcons.PAUSE, 12, "currentColor"));
        btnCancel.setGraphic(UiIcons.createSvgIcon(UiIcons.STOP, 11, "currentColor"));

        if (!isRunning) {
            statusPulseDot.setFill(Color.web("#22C55E"));
        } else if (isPaused) {
            statusPulseDot.setFill(Color.web("#F59E0B"));
        } else {
            statusPulseDot.setFill(Color.web("#A78BFA"));
        }
    }

    private void setupExtractionListeners() {
        extractionService.addRestorationListener(new ExtractionService.RestorationListener() {
            @Override
            public void onLog(String level, String message) {
                appendLog(level, message);
            }

            @Override
            public void onProgress(int processed, int total, long processedBytes, String currentAction) {
                Platform.runLater(() -> {
                    int pct = total > 0 ? (int) (((double) processed / total) * 100) : 0;
                    progressBar.setProgress(pct / 100.0);
                    filesRatioLabel.setText(String.format("%,d / %,d files (%d%%)", processed, total, pct));
                    if (currentAction != null && currentAction.contains("Processing:")) {
                        currentFileLabel.setText(currentAction);
                        operationStateLabel.setText("Applying photo metadata...");
                    } else if (currentAction != null) {
                        operationStateLabel.setText(currentAction);
                    }
                    updateRestoredBytes(processedBytes);
                });
            }

            @Override
            public void onProgressTelemetry(int processed, int total, long processedBytes, String currentAction,
                                            long elapsedSec, long etaSec, double filesPerSec, double mbPerSec) {
                Platform.runLater(() -> {
                    int pct = total > 0 ? (int) (((double) processed / total) * 100) : 0;
                    progressBar.setProgress(pct / 100.0);
                    filesRatioLabel.setText(String.format("%,d / %,d files (%d%%)", processed, total, pct));

                    if (currentAction != null && currentAction.contains("Processing:")) {
                        currentFileLabel.setText(currentAction);
                        operationStateLabel.setText("Writing metadata & sidecars...");
                    } else if (currentAction != null) {
                        operationStateLabel.setText(currentAction);
                    }

                    long hours = elapsedSec / 3600;
                    long mins = (elapsedSec % 3600) / 60;
                    long secs = elapsedSec % 60;
                    elapsedValLabel.setText(String.format("%02d:%02d:%02d", hours, mins, secs));

                    speedValLabel.setText(String.format(java.util.Locale.US, "%.1f f/s • %.1f MB/s", filesPerSec, mbPerSec));

                    long etaMins = etaSec / 60;
                    long etaRem = etaSec % 60;
                    etaValLabel.setText(String.format("%02d:%02d", etaMins, etaRem));

                    if (processed >= total && total > 0) {
                        operationStateLabel.setText("Finalizing restoration...");
                        currentFileLabel.setText(String.format("Processed %,d of %,d media files.", processed, total));
                    }
                    updateRestoredBytes(processedBytes);
                });
            }

            @Override
            public void onStats(int scanned, int total, int restored, int unmatched, int errors) {
                Platform.runLater(() -> {
                    kpiScanned.setText(String.valueOf(scanned > 0 ? scanned : total));
                    kpiRestored.setText(String.valueOf(restored));
                    kpiNeedsReview.setText(String.valueOf(unmatched));
                    kpiFailed.setText(String.valueOf(errors));

                    if (restored > 0) {
                        kpiRestored.getStyleClass().setAll("kpi-value", "kpi-value-green");
                    } else {
                        kpiRestored.getStyleClass().setAll("kpi-value", "text-primary");
                    }
                    if (unmatched > 0) {
                        kpiNeedsReview.getStyleClass().setAll("kpi-value", "kpi-value-amber");
                    } else {
                        kpiNeedsReview.getStyleClass().setAll("kpi-value", "text-primary");
                    }
                    if (errors > 0) {
                        kpiFailed.getStyleClass().setAll("kpi-value", "kpi-value-red");
                    } else {
                        kpiFailed.getStyleClass().setAll("kpi-value", "text-primary");
                    }
                    long curBytes = extractionService != null ? extractionService.getProcessedBytes() : 0L;
                    if (curBytes > 0) {
                        updateRestoredBytes(curBytes);
                    }
                });
            }
        });
    }

    private void showRestoreCompletionPopup() {
        Alert alert = new Alert(Alert.AlertType.INFORMATION);
        alert.initOwner(stage);
        alert.setTitle("Restoration Finished");
        alert.setHeaderText("Google Takeout Restoration Complete");
        String shutdownNote = shutdownAfterCheck.isSelected()
                ? "\n\n⚠️ System shutdown scheduled in 60 seconds."
                : "";
        alert.setContentText(String.format(
                "Restoration process completed successfully!\n\n"
                        + "• Files Scanned: %s\n"
                        + "• Metadata Restored: %s\n"
                        + "• Needs Review: %s\n"
                        + "• Failed: %s\n\n"
                        + "Destination:\n%s%s",
                kpiScanned.getText(),
                kpiRestored.getText(),
                kpiNeedsReview.getText(),
                kpiFailed.getText(),
                selectedOutput != null ? selectedOutput.getAbsolutePath() : "",
                shutdownNote
        ));
        alert.show();
    }

    private void showAlert(String title, String message) {
        Alert alert = new Alert(Alert.AlertType.INFORMATION);
        alert.initOwner(stage);
        alert.setTitle(title);
        alert.setHeaderText(null);
        alert.setContentText(message);
        alert.show();
    }

    private void showErrorAlert(String title, String message) {
        Alert alert = new Alert(Alert.AlertType.ERROR);
        alert.initOwner(stage);
        alert.setTitle(title);
        alert.setHeaderText(null);
        alert.setContentText(message);
        alert.show();
    }
}
