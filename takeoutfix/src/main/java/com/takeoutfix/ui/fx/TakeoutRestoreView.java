package com.takeoutfix.ui.fx;

import com.takeoutfix.auth.UserSyncBridgeService;
import com.takeoutfix.restore.PowerManager;
import com.takeoutfix.restore.SessionStatsService;
import com.takeoutfix.restore.TakeoutRestoreTask;
import com.takeoutfix.restore.TakeoutScanTask;
import com.takeoutfix.restore.infrastructure.ExtractionService;
import com.takeoutfix.restore.infrastructure.MediaScanner;
import com.takeoutfix.restore.infrastructure.MetadataMatcher;
import com.takeoutfix.task.BackgroundTask;
import com.takeoutfix.task.TaskManager;
import javafx.application.Platform;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
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
 * Modern JavaFX Recovery Center for TakeoutFix.
 * Built with a neutral monochromatic foundation, high text contrast, and restrained violet accents.
 * Features:
 * - Direct "Scan Archive" and "Start Restoration" action buttons side-by-side
 * - Unified toolbar utilizing horizontal space with non-destructive status indicators
 * - Clear section headings for Source archive and Output location with scan telemetry
 * - Semantic 4-card KPI deck: Files Scanned, Metadata Restored, Needs Review, Failed
 * - Informative real-time progress area with active file, ratio counter, and high-contrast typography
 * - Structured Restoration Options (Date & Timestamp handling, Output & Processing)
 * - Collapsible Activity & Diagnostics panel with friendly idle empty state, search filter, and log exporter
 */
public class TakeoutRestoreView extends VBox {

    private final Stage stage;
    private final ExtractionService extractionService;
    private final UserSyncBridgeService userService;
    private final SessionStatsService statsService;
    private final Consumer<WorkspaceType> onToolSwitch;

    // Semantic KPI Metric Cards (Refined wording & subtle tinted surfaces)
    private final Label kpiScanned = new Label("0");
    private final Label kpiRestored = new Label("0");
    private final Label kpiNeedsReview = new Label("0");
    private final Label kpiFailed = new Label("0");

    // Paths & Source Telemetry
    private File selectedSource = null;
    private File selectedOutput = null;
    private final Label sourcePathLabel = new Label("No folder or ZIP archive selected yet");
    private final Label sourceMetaLabel = new Label("Awaiting selection");
    private final Label outputPathLabel = new Label("No destination folder selected yet");
    private final Label outputMetaLabel = new Label("Original Takeout files will remain untouched");
    private final Button btnSourceClear = new Button("✕");
    private final Button btnDestClear = new Button("✕");

    // Action Controls (Start Restoration & Scan Archive side-by-side)
    private final Button btnStart = new Button("Start Restoration");
    private final Button btnScan = new Button("Scan Archive");
    private final Button btnPause = new Button("Pause");
    private final Button btnCancel = new Button("Stop");
    private final Button btnOpenOutput = new Button("Open Output Folder");

    // Informative Telemetry
    private final Label operationStateLabel = new Label("Ready to restore your photos");
    private final Label currentFileLabel = new Label("Select a source archive and output location to begin.");
    private final Label filesRatioLabel = new Label("0 / 0 files (0%)");
    private final ProgressBar progressBar = new ProgressBar(0.0);
    private final Label elapsedLabel = new Label("⏱ Elapsed: 00:00:00");
    private final Label speedLabel = new Label("Speed: 0.0 files/s • 0.0 MB/s");
    private final Label etaLabel = new Label("⏳ ETA: --:--");

    // Restoration Options
    private final TextField dateOverrideField = new TextField();
    private final DatePicker datePicker = new DatePicker();
    private final CheckBox organizeMonthCheck = new CheckBox("Organize into Month subfolders (YYYY/MM)");
    private final CheckBox smartInterpolationCheck = new CheckBox("Smart Timestamp Interpolation");
    private final CheckBox keepAwakeCheck = new CheckBox("Keep System Awake while processing");
    private final CheckBox splitVolumesCheck = new CheckBox("Compress output into 2GB ZIP volumes");

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

        setSpacing(12);
        setPadding(new Insets(14, 18, 14, 18));
        VBox.setVgrow(this, Priority.ALWAYS);

        // 1. Header Row
        getChildren().add(buildHeaderRow());

        // 2. High-Contrast 4-Card KPI Metric Deck
        getChildren().add(buildKpiCardsDeck());

        // 3. Main Workspace: Operations Pipeline + Restoration Options
        getChildren().add(buildUnifiedWorkspaceCard());

        // 4. Activity & Diagnostics Console
        VBox logsCard = buildLogsConsoleCard();
        VBox.setVgrow(logsCard, Priority.ALWAYS);
        getChildren().add(logsCard);

        updateLogViewVisibility();
        setupExtractionListeners();
    }

    private HBox buildHeaderRow() {
        HBox header = new HBox(12);
        header.setAlignment(Pos.CENTER_LEFT);

        VBox titleBox = new VBox(4);
        Label mainTitle = new Label("Restore Metadata");
        mainTitle.getStyleClass().addAll("page-title", "header-title");
        mainTitle.setStyle("-fx-font-size: 24px; -fx-font-weight: 700; -fx-text-fill: #FAFAFA;");

        Label subtitle = new Label("Recover missing photo & video metadata, EXIF timestamps and JSON sidecars from Google Takeout");
        subtitle.getStyleClass().addAll("page-description", "header-subtitle");
        subtitle.setStyle("-fx-font-size: 13px; -fx-font-weight: 500; -fx-text-fill: #D4D4D8;");

        titleBox.getChildren().addAll(mainTitle, subtitle);
        header.getChildren().add(titleBox);
        return header;
    }

    private HBox buildKpiCardsDeck() {
        HBox deck = new HBox(12);
        deck.setAlignment(Pos.CENTER_LEFT);

        VBox card1 = createSemanticKpiCard("Files Scanned", kpiScanned, "kpi-value-blue", "Total media files detected", "kpi-card-blue");
        VBox card2 = createSemanticKpiCard("Metadata Restored", kpiRestored, "kpi-value-green", "Successfully updated EXIF tags", "kpi-card-green");
        VBox card3 = createSemanticKpiCard("Needs Review", kpiNeedsReview, "kpi-value-amber", "Unmatched or conflicting sidecars", "kpi-card-amber");
        VBox card4 = createSemanticKpiCard("Failed", kpiFailed, "kpi-value-red", "Files that could not be processed", "kpi-card-red");

        HBox.setHgrow(card1, Priority.ALWAYS);
        HBox.setHgrow(card2, Priority.ALWAYS);
        HBox.setHgrow(card3, Priority.ALWAYS);
        HBox.setHgrow(card4, Priority.ALWAYS);

        deck.getChildren().addAll(card1, card2, card3, card4);
        return deck;
    }

    private VBox createSemanticKpiCard(String labelText, Label valLabel, String valStyleClass, String subText, String cardStyleClass) {
        VBox card = new VBox(6);
        card.getStyleClass().addAll("kpi-card", cardStyleClass);
        card.setPadding(new Insets(14, 16, 14, 16));

        Label lbl = new Label(labelText);
        lbl.getStyleClass().addAll("kpi-title", "kpi-label");
        lbl.setStyle("-fx-font-size: 12px; -fx-font-weight: 700; -fx-text-fill: #D4D4D8;");

        valLabel.getStyleClass().addAll("kpi-value", valStyleClass);
        valLabel.setStyle("-fx-font-size: 28px; -fx-font-weight: 700;");

        Label sub = new Label(subText);
        sub.getStyleClass().addAll("kpi-description", "kpi-sub");
        sub.setStyle("-fx-font-size: 11px; -fx-font-weight: 500; -fx-text-fill: #E4E4E7;");

        card.getChildren().addAll(lbl, valLabel, sub);
        return card;
    }

    private VBox buildUnifiedWorkspaceCard() {
        VBox card = new VBox(12);
        card.getStyleClass().add("glass-card");
        card.setPadding(new Insets(16, 18, 16, 18));

        HBox split = new HBox(16);
        split.setAlignment(Pos.TOP_LEFT);

        // ── Left Column: Operations Pipeline (68% width) ──
        VBox leftCol = new VBox(12);
        HBox.setHgrow(leftCol, Priority.ALWAYS);

        VBox srcBox = buildSourceBox();
        VBox dstBox = buildDestinationBox();
        HBox actBox = buildActionButtonsBox();
        VBox progBox = buildProgressTelemetryBox();

        leftCol.getChildren().addAll(srcBox, dstBox, actBox, progBox);

        // ── Right Column: Restoration Options (32% width) ──
        VBox rightCol = new VBox(10);
        rightCol.setPrefWidth(310);
        rightCol.setMinWidth(290);
        rightCol.getChildren().add(buildRestorationControlsBox());

        split.getChildren().addAll(leftCol, rightCol);
        card.getChildren().add(split);
        return card;
    }

    private VBox buildSourceBox() {
        VBox box = new VBox(8);
        box.getStyleClass().add("inner-container");
        box.setPadding(new Insets(10, 12, 10, 12));

        HBox headerRow = new HBox(8);
        headerRow.setAlignment(Pos.CENTER_LEFT);

        Label title = new Label("Source archive");
        title.getStyleClass().addAll("form-label", "kpi-label");
        title.setStyle("-fx-font-size: 13px; -fx-font-weight: 700; -fx-text-fill: #FAFAFA;");

        Region sp = new Region();
        HBox.setHgrow(sp, Priority.ALWAYS);

        sourceMetaLabel.getStyleClass().add("kpi-sub");
        sourceMetaLabel.setStyle("-fx-font-size: 11px; -fx-font-weight: 500; -fx-text-fill: #D4D4D8;");

        headerRow.getChildren().addAll(title, sp, sourceMetaLabel);

        HBox row = new HBox(8);
        row.setAlignment(Pos.CENTER_LEFT);

        Button btnFolder = new Button("Browse Folder");
        btnFolder.getStyleClass().add("btn-primary");
        btnFolder.setGraphic(UiIcons.createSvgIcon(UiIcons.FOLDER, 14, "currentColor"));
        btnFolder.setGraphicTextGap(6);
        btnFolder.setStyle("-fx-font-size: 13px; -fx-font-weight: 700; -fx-pref-height: 36px; -fx-pref-width: 140px;");
        btnFolder.setOnAction(e -> chooseSourceFolder());

        Button btnZip = new Button("ZIP File");
        btnZip.getStyleClass().add("btn-secondary");
        btnZip.setGraphic(UiIcons.createSvgIcon(UiIcons.ZIP, 14, "currentColor"));
        btnZip.setGraphicTextGap(6);
        btnZip.setStyle("-fx-font-size: 13px; -fx-font-weight: 700; -fx-pref-height: 36px; -fx-pref-width: 100px;");
        btnZip.setOnAction(e -> chooseSourceZip());

        HBox pathDisplay = new HBox(6);
        pathDisplay.setAlignment(Pos.CENTER_LEFT);
        HBox.setHgrow(pathDisplay, Priority.ALWAYS);
        pathDisplay.getStyleClass().add("text-field");
        pathDisplay.setStyle("-fx-padding: 4 10 4 10; -fx-pref-height: 36px;");

        sourcePathLabel.getStyleClass().add("text-secondary");
        sourcePathLabel.setStyle("-fx-font-size: 13px; -fx-text-fill: #D4D4D8;");
        HBox.setHgrow(sourcePathLabel, Priority.ALWAYS);

        btnSourceClear.getStyleClass().add("btn-ghost");
        btnSourceClear.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-padding: 2 6 2 6; -fx-cursor: hand;");
        btnSourceClear.setVisible(false);
        btnSourceClear.setOnAction(e -> clearSource());

        pathDisplay.getChildren().addAll(sourcePathLabel, btnSourceClear);
        row.getChildren().addAll(btnFolder, btnZip, pathDisplay);
        box.getChildren().addAll(headerRow, row);

        // Drag & Drop Handling
        box.setOnDragOver(event -> {
            if (event.getGestureSource() != box && event.getDragboard().hasFiles()) {
                event.acceptTransferModes(TransferMode.COPY);
            }
            event.consume();
        });
        box.setOnDragDropped(event -> {
            Dragboard db = event.getDragboard();
            boolean success = false;
            if (db.hasFiles() && !db.getFiles().isEmpty()) {
                setSourceFile(db.getFiles().get(0));
                success = true;
            }
            event.setDropCompleted(success);
            event.consume();
        });

        return box;
    }

    private VBox buildDestinationBox() {
        VBox box = new VBox(8);
        box.getStyleClass().add("inner-container");
        box.setPadding(new Insets(10, 12, 10, 12));

        HBox headerRow = new HBox(8);
        headerRow.setAlignment(Pos.CENTER_LEFT);

        Label title = new Label("Output location");
        title.getStyleClass().addAll("form-label", "kpi-label");
        title.setStyle("-fx-font-size: 13px; -fx-font-weight: 700; -fx-text-fill: #FAFAFA;");

        Region sp = new Region();
        HBox.setHgrow(sp, Priority.ALWAYS);

        outputMetaLabel.getStyleClass().add("kpi-sub");
        outputMetaLabel.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-text-fill: #22C55E;");

        headerRow.getChildren().addAll(title, sp, outputMetaLabel);

        HBox row = new HBox(8);
        row.setAlignment(Pos.CENTER_LEFT);

        Button btnDest = new Button("Select Destination Folder");
        btnDest.getStyleClass().add("btn-secondary");
        btnDest.setGraphic(UiIcons.createSvgIcon(UiIcons.OUTPUT_FOLDER, 14, "currentColor"));
        btnDest.setGraphicTextGap(6);
        btnDest.setStyle("-fx-font-size: 13px; -fx-font-weight: 700; -fx-pref-height: 36px; -fx-pref-width: 215px;");
        btnDest.setOnAction(e -> chooseDestinationFolder());

        HBox pathDisplay = new HBox(6);
        pathDisplay.setAlignment(Pos.CENTER_LEFT);
        HBox.setHgrow(pathDisplay, Priority.ALWAYS);
        pathDisplay.getStyleClass().add("text-field");
        pathDisplay.setStyle("-fx-padding: 4 10 4 10; -fx-pref-height: 36px;");

        outputPathLabel.getStyleClass().add("text-secondary");
        outputPathLabel.setStyle("-fx-font-size: 13px; -fx-text-fill: #D4D4D8;");
        HBox.setHgrow(outputPathLabel, Priority.ALWAYS);

        btnDestClear.getStyleClass().add("btn-ghost");
        btnDestClear.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-padding: 2 6 2 6; -fx-cursor: hand;");
        btnDestClear.setVisible(false);
        btnDestClear.setOnAction(e -> clearDestination());

        pathDisplay.getChildren().addAll(outputPathLabel, btnDestClear);
        row.getChildren().addAll(btnDest, pathDisplay);
        box.getChildren().addAll(headerRow, row);

        // Drag & Drop Handling
        box.setOnDragOver(event -> {
            if (event.getGestureSource() != box && event.getDragboard().hasFiles()) {
                event.acceptTransferModes(TransferMode.COPY);
            }
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
            event.setDropCompleted(success);
            event.consume();
        });

        return box;
    }

    private HBox buildActionButtonsBox() {
        HBox row = new HBox(8);
        row.setAlignment(Pos.CENTER_LEFT);
        row.getStyleClass().add("inner-container");
        row.setPadding(new Insets(8, 12, 8, 12));

        // 1. Primary Action: Start Restoration
        btnStart.getStyleClass().add("btn-primary");
        btnStart.setGraphic(UiIcons.createSvgIcon(UiIcons.PLAY, 14, "currentColor"));
        btnStart.setGraphicTextGap(8);
        btnStart.setStyle("-fx-font-size: 13px; -fx-font-weight: 700; -fx-pref-height: 36px; -fx-padding: 8 18 8 18;");
        btnStart.setOnAction(e -> handleStart());

        // 2. Scan Archive Button (Direct Scan/Preview Action)
        btnScan.getStyleClass().add("btn-secondary");
        btnScan.setGraphic(UiIcons.createSvgIcon(UiIcons.SEARCH, 13, "currentColor"));
        btnScan.setGraphicTextGap(7);
        btnScan.setStyle("-fx-font-size: 13px; -fx-font-weight: 600; -fx-pref-height: 36px; -fx-padding: 8 14 8 14;");
        btnScan.setTooltip(new Tooltip("Scan and match JSON sidecars across archive without writing to disk."));
        btnScan.setOnAction(e -> handleScan());

        // 3. Pause Button
        btnPause.getStyleClass().add("btn-secondary");
        btnPause.setGraphic(UiIcons.createSvgIcon(UiIcons.PAUSE, 12, "currentColor"));
        btnPause.setGraphicTextGap(6);
        btnPause.setStyle("-fx-font-size: 13px; -fx-font-weight: 600; -fx-pref-height: 36px; -fx-pref-width: 95px;");
        btnPause.setDisable(true);
        btnPause.setOnAction(e -> handlePause());

        // 4. Stop Button
        btnCancel.getStyleClass().add("btn-secondary");
        btnCancel.setText("Stop");
        btnCancel.setGraphic(UiIcons.createSvgIcon(UiIcons.STOP, 11, "currentColor"));
        btnCancel.setGraphicTextGap(6);
        btnCancel.setStyle("-fx-font-size: 13px; -fx-font-weight: 600; -fx-pref-height: 36px; -fx-pref-width: 85px;");
        btnCancel.setDisable(true);
        btnCancel.setOnAction(e -> handleCancel());

        // 5. Open Output Folder Button (Grouped alongside actions)
        btnOpenOutput.getStyleClass().add("btn-secondary");
        btnOpenOutput.setGraphic(UiIcons.createSvgIcon(UiIcons.OUTPUT_FOLDER, 13, "currentColor"));
        btnOpenOutput.setGraphicTextGap(7);
        btnOpenOutput.setStyle("-fx-font-size: 13px; -fx-font-weight: 600; -fx-pref-height: 36px; -fx-padding: 8 14 8 14;");
        btnOpenOutput.setOnAction(e -> handleOpenOutput());

        // Spacer to balance the layout
        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        // Right-aligned status badge utilizing the space effectively
        HBox safetyPill = new HBox(6);
        safetyPill.setAlignment(Pos.CENTER_RIGHT);
        Label safetyBadge = new Label("🔒 Non-Destructive Mode • Source Files Protected");
        safetyBadge.getStyleClass().add("badge");
        safetyBadge.setStyle("-fx-background-color: rgba(34, 197, 94, 0.1); -fx-border-color: rgba(34, 197, 94, 0.3); -fx-text-fill: #22C55E; -fx-font-size: 12px; -fx-font-weight: 600; -fx-padding: 6 12 6 12;");
        safetyPill.getChildren().add(safetyBadge);

        row.getChildren().addAll(btnStart, btnScan, btnPause, btnCancel, btnOpenOutput, spacer, safetyPill);
        return row;
    }

    private VBox buildProgressTelemetryBox() {
        VBox box = new VBox(5);
        box.getStyleClass().add("inner-container");
        box.setPadding(new Insets(10, 12, 10, 12));

        // Operation state & Files processed ratio
        HBox statusRow = new HBox(8);
        statusRow.setAlignment(Pos.CENTER_LEFT);

        operationStateLabel.getStyleClass().add("text-primary");
        operationStateLabel.setStyle("-fx-font-size: 13px; -fx-font-weight: 700; -fx-text-fill: #FAFAFA;");

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        filesRatioLabel.getStyleClass().add("kpi-value-blue");
        filesRatioLabel.setStyle("-fx-font-size: 13px; -fx-font-weight: 800; -fx-text-fill: #A78BFA;");

        statusRow.getChildren().addAll(operationStateLabel, spacer, filesRatioLabel);

        // Current file being processed
        currentFileLabel.getStyleClass().add("text-secondary");
        currentFileLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: 500; -fx-text-fill: #D4D4D8;");

        // Thin Violet Progress Bar
        progressBar.setMaxWidth(Double.MAX_VALUE);
        progressBar.setPrefHeight(8);

        // Elapsed, Speed, ETA
        HBox telemetryRow = new HBox(16);
        telemetryRow.setAlignment(Pos.CENTER_LEFT);

        elapsedLabel.getStyleClass().add("text-muted");
        elapsedLabel.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-text-fill: #D4D4D8;");

        speedLabel.getStyleClass().add("text-secondary");
        speedLabel.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-text-fill: #FAFAFA;");
        HBox.setHgrow(speedLabel, Priority.ALWAYS);
        speedLabel.setAlignment(Pos.CENTER);

        etaLabel.getStyleClass().add("kpi-value-blue");
        etaLabel.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-text-fill: #A78BFA;");

        telemetryRow.getChildren().addAll(elapsedLabel, speedLabel, etaLabel);

        box.getChildren().addAll(statusRow, currentFileLabel, progressBar, telemetryRow);
        return box;
    }

    private VBox buildRestorationControlsBox() {
        VBox box = new VBox(8);
        box.getStyleClass().add("inner-container");
        box.setPadding(new Insets(10, 12, 10, 12));
        VBox.setVgrow(box, Priority.ALWAYS);

        HBox titleRow = new HBox(8);
        titleRow.setAlignment(Pos.CENTER_LEFT);
        Label title = new Label("RESTORATION OPTIONS");
        title.getStyleClass().addAll("section-title", "kpi-label");
        title.setStyle("-fx-font-size: 13px; -fx-font-weight: 700; -fx-text-fill: #FAFAFA;");

        Region sp = new Region();
        HBox.setHgrow(sp, Priority.ALWAYS);

        Label optBadge = new Label("CONFIG");
        optBadge.getStyleClass().add("badge");
        optBadge.setStyle("-fx-font-size: 10px; -fx-font-weight: 700;");

        titleRow.getChildren().addAll(title, sp, optBadge);

        // Safety Notice
        HBox safetyNotice = new HBox(6);
        safetyNotice.setAlignment(Pos.CENTER_LEFT);
        safetyNotice.setStyle("-fx-background-color: rgba(34, 197, 94, 0.08); -fx-border-color: rgba(34, 197, 94, 0.25); -fx-border-radius: 4; -fx-background-radius: 4; -fx-padding: 5 10 5 10;");
        Label safetyText = new Label("Preserves Originals (Source files untouched)");
        safetyText.setStyle("-fx-font-size: 12px; -fx-font-weight: 600; -fx-text-fill: #22C55E;");
        safetyNotice.getChildren().add(safetyText);

        // Group 1: Date & Timestamp Handling
        Label dateGroupLabel = new Label("Date & Timestamp Handling");
        dateGroupLabel.setStyle("-fx-padding: 6 0 2 0; -fx-font-size: 11px; -fx-font-weight: 700; -fx-text-fill: #A78BFA; -fx-text-transform: uppercase;");

        VBox dateBlock = new VBox(4);
        Label dateLbl = new Label("Fallback Date (for missing timestamps)");
        dateLbl.setStyle("-fx-font-size: 12px; -fx-font-weight: 500; -fx-text-fill: #D4D4D8;");

        HBox dateRow = new HBox(6);
        dateRow.setAlignment(Pos.CENTER_LEFT);
        dateOverrideField.setPromptText("YYYY-MM-DD");
        dateOverrideField.getStyleClass().add("text-field");
        dateOverrideField.setStyle("-fx-font-size: 13px; -fx-pref-height: 32px; -fx-pref-width: 145px;");

        datePicker.setStyle("-fx-pref-width: 32px; -fx-pref-height: 32px;");
        datePicker.setOnAction(e -> {
            LocalDate d = datePicker.getValue();
            if (d != null) dateOverrideField.setText(d.toString());
        });

        dateRow.getChildren().addAll(dateOverrideField, datePicker);
        dateBlock.getChildren().addAll(dateLbl, dateRow);

        smartInterpolationCheck.setStyle("-fx-font-size: 13px; -fx-font-weight: 500; -fx-text-fill: #FAFAFA;");
        smartInterpolationCheck.setSelected(true);
        smartInterpolationCheck.setTooltip(new Tooltip("Interpolates missing timestamps from JSON sidecars, folder names, and file dates."));

        // Group 2: Output & Processing
        Label outputGroupLabel = new Label("Output & Processing");
        outputGroupLabel.setStyle("-fx-padding: 8 0 2 0; -fx-font-size: 11px; -fx-font-weight: 700; -fx-text-fill: #A78BFA; -fx-text-transform: uppercase;");

        organizeMonthCheck.setStyle("-fx-font-size: 13px; -fx-font-weight: 500; -fx-text-fill: #FAFAFA;");
        organizeMonthCheck.setTooltip(new Tooltip("Organizes photos and videos into Year/Month subfolders (e.g., 2023/08)."));

        splitVolumesCheck.setStyle("-fx-font-size: 13px; -fx-font-weight: 500; -fx-text-fill: #FAFAFA;");
        splitVolumesCheck.setTooltip(new Tooltip("Compresses output files into 2GB multi-volume ZIP archives for easy cloud backup."));

        keepAwakeCheck.setStyle("-fx-font-size: 13px; -fx-font-weight: 500; -fx-text-fill: #FAFAFA;");
        keepAwakeCheck.setSelected(true);
        keepAwakeCheck.setTooltip(new Tooltip("Prevents your computer from sleeping or hibernating during long restoration batches."));

        box.getChildren().addAll(
                titleRow,
                safetyNotice,
                dateGroupLabel,
                dateBlock,
                smartInterpolationCheck,
                outputGroupLabel,
                organizeMonthCheck,
                splitVolumesCheck,
                keepAwakeCheck
        );
        return box;
    }

    private VBox buildLogsConsoleCard() {
        VBox card = new VBox(6);
        card.getStyleClass().add("glass-card");
        card.setPadding(new Insets(10, 12, 10, 12));

        // Top bar with traffic lights, title, filter tabs, search field, and action buttons
        HBox topRow = new HBox(8);
        topRow.setAlignment(Pos.CENTER_LEFT);

        // Traffic light dots
        HBox trafficLights = new HBox(5);
        trafficLights.setAlignment(Pos.CENTER_LEFT);
        Circle dotRed = new Circle(4, Color.web("#EF4444"));
        Circle dotYellow = new Circle(4, Color.web("#F59E0B"));
        Circle dotGreen = new Circle(4, Color.web("#22C55E"));
        trafficLights.getChildren().addAll(dotRed, dotYellow, dotGreen);

        Label logsTitle = new Label("ACTIVITY & DIAGNOSTICS");
        logsTitle.getStyleClass().add("kpi-label");
        logsTitle.setStyle("-fx-font-size: 12px; -fx-font-weight: 700; -fx-text-fill: #FAFAFA;");

        // Filter tabs
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

        // Real-time search filter
        logSearchField.setPromptText("Filter logs...");
        logSearchField.getStyleClass().add("text-field");
        logSearchField.setStyle("-fx-font-size: 11px; -fx-pref-height: 28px; -fx-pref-width: 140px;");
        logSearchField.textProperty().addListener((obs, oldV, newV) -> applyLogFilter());

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        Button btnExport = new Button("Export Logs");
        btnExport.getStyleClass().add("btn-ghost");
        btnExport.setGraphic(UiIcons.createSvgIcon(UiIcons.DOWNLOAD, 12, "currentColor"));
        btnExport.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-padding: 4 8 4 8;");
        btnExport.setOnAction(e -> exportLogsToFile());

        Button btnCopy = new Button("Copy");
        btnCopy.getStyleClass().add("btn-ghost");
        btnCopy.setGraphic(UiIcons.createSvgIcon(UiIcons.COPY, 12, "currentColor"));
        btnCopy.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-padding: 4 8 4 8;");
        btnCopy.setOnAction(e -> copyLogsToClipboard());

        Button btnClear = new Button("Clear");
        btnClear.getStyleClass().add("btn-ghost");
        btnClear.setGraphic(UiIcons.createSvgIcon(UiIcons.TRASH, 12, "currentColor"));
        btnClear.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-padding: 4 8 4 8;");
        btnClear.setOnAction(e -> clearLogs());

        btnCollapseLogs.getStyleClass().add("btn-ghost");
        btnCollapseLogs.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-padding: 4 8 4 8;");
        btnCollapseLogs.setOnAction(e -> toggleCollapseLogs());

        topRow.getChildren().addAll(trafficLights, logsTitle, filterTabs, logSearchField, spacer, btnExport, btnCopy, btnClear, btnCollapseLogs);

        // Build Friendly Empty State Box
        logEmptyStateBox.getStyleClass().add("empty-state-box");
        Label emptyTitle = new Label("No restoration activity yet");
        emptyTitle.getStyleClass().add("empty-state-title");
        emptyTitle.setStyle("-fx-font-size: 14px; -fx-font-weight: 700; -fx-text-fill: #FAFAFA;");
        Label emptySub = new Label("Select a Google Takeout archive or folder and an output location to begin.\nReal-time telemetry, JSON sidecar matching, and diagnostics will appear here as tasks run.");
        emptySub.getStyleClass().add("empty-state-sub");
        emptySub.setStyle("-fx-font-size: 12px; -fx-font-weight: 500; -fx-text-fill: #D4D4D8;");
        logEmptyStateBox.getChildren().addAll(emptyTitle, emptySub);

        // Terminal ListView with clean theme support
        logListView.getStyleClass().add("list-view");
        logListView.setCellFactory(lv -> new ListCell<>() {
            @Override
            protected void updateItem(LogEntry item, boolean empty) {
                super.updateItem(item, empty);
                if (empty || item == null) {
                    setText(null);
                    setGraphic(null);
                } else {
                    HBox row = new HBox(8);
                    row.setAlignment(Pos.CENTER_LEFT);

                    Label timeLabel = new Label(item.timestamp);
                    timeLabel.getStyleClass().add("text-muted");
                    timeLabel.setStyle("-fx-font-family: 'Consolas', 'Courier New', monospace; -fx-font-size: 11px; -fx-text-fill: #D4D4D8;");

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
                    msgLabel.getStyleClass().add("text-primary");
                    msgLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: 500; -fx-text-fill: #FAFAFA;");
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
            logListView.setMaxHeight(90);
            logEmptyStateBox.setMaxHeight(90);
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
        btn.getStyleClass().removeAll("log-tab-btn", "log-tab-btn-active");
        btn.getStyleClass().add("log-tab-btn");
        if (active) {
            btn.getStyleClass().add("log-tab-btn-active");
        }
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

            // Update badge counts
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
        kpiNeedsReview.setText("0");
        kpiFailed.setText("0");
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
        sourcePathLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: 700; -fx-text-fill: #FAFAFA;");
        btnSourceClear.setVisible(true);

        sourceMetaLabel.setText("Scanning archive...");
        new Thread(() -> {
            try {
                if (file.isFile() && file.getName().toLowerCase().endsWith(".zip")) {
                    long sizeMb = file.length() / (1024 * 1024);
                    Platform.runLater(() -> sourceMetaLabel.setText(String.format("ZIP Archive • %,d MB", sizeMb)));
                } else if (file.isDirectory()) {
                    List<File> media = new MediaScanner().listMediaFiles(file);
                    long totalBytes = 0;
                    for (File m : media) totalBytes += m.length();
                    long sizeMb = totalBytes / (1024 * 1024);
                    int count = media.size();
                    Platform.runLater(() -> {
                        sourceMetaLabel.setText(String.format("%,d media files • %,d MB", count, sizeMb));
                        kpiScanned.setText(String.valueOf(count));
                    });
                }
            } catch (Exception ignored) {
                Platform.runLater(() -> sourceMetaLabel.setText("Ready to process"));
            }
        }, "source-scan-thread").start();
    }

    private void clearSource() {
        selectedSource = null;
        sourcePathLabel.setText("No folder or ZIP archive selected yet");
        sourcePathLabel.setStyle("-fx-font-size: 12px; -fx-text-fill: #A1A1AA;");
        sourceMetaLabel.setText("Awaiting selection");
        btnSourceClear.setVisible(false);
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
        outputPathLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: 700; -fx-text-fill: #FAFAFA;");
        outputMetaLabel.setText("Output folder designated");
        btnDestClear.setVisible(true);
    }

    private void clearDestination() {
        selectedOutput = null;
        outputPathLabel.setText("No destination folder selected yet");
        outputPathLabel.setStyle("-fx-font-size: 12px; -fx-text-fill: #A1A1AA;");
        outputMetaLabel.setText("Original Takeout files will remain untouched");
        btnDestClear.setVisible(false);
    }

    private Optional<java.time.Instant> parseDateOverride() {
        String text = dateOverrideField.getText();
        if (text == null || text.trim().isEmpty() || text.startsWith("YYYY-MM-DD")) {
            return Optional.empty();
        }
        try {
            LocalDate d = LocalDate.parse(text.trim());
            return Optional.of(d.atStartOfDay(java.time.ZoneId.systemDefault()).toInstant());
        } catch (Exception e) {
            return Optional.empty();
        }
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
            showAlert("Destination Conflict", "To preserve original files intact, the output folder must be a separate directory outside the source archive.");
            return;
        }

        // Show friendly trust & optional sign-in dialog if not signed in and not suppressed
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

        appendLog("INFO", "Starting SCAN for " + selectedSource.getName());
        operationStateLabel.setText("Scanning archive & matching metadata...");
        currentFileLabel.setText("Inspecting files and JSON sidecars without writing to disk");

        TakeoutScanTask scanTask = new TakeoutScanTask(selectedSource, new TakeoutScanTask.ScanListener() {
            @Override
            public void onProgress(int current, int total, int matched, int unmatched, File currentFile) {
                Platform.runLater(() -> {
                    int pct = (int) (((double) current / total) * 100);
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
                    operationStateLabel.setText("Scan Complete — analysis finished");
                    currentFileLabel.setText(String.format("Scanned %,d files: %,d matched, %,d require review.", total, matched, unmatched));
                    appendLog("SUCCESS", String.format("Scan finished: %,d files evaluated, %,d sidecars matched.", total, matched));
                    showAlert("Scan Completed", String.format("Scan finished!\n\n• Files Scanned: %,d\n• Metadata Matchable: %,d\n• Needs Review: %,d\n\nNo files were modified or written to disk.", total, matched, unmatched));
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

        if (keepAwakeCheck.isSelected()) {
            powerManager.startKeepAwake();
        }

        appendLog("INFO", "Starting live restoration from " + selectedSource.getName() + " to " + selectedOutput.getName());
        operationStateLabel.setText("Initializing restoration engine...");
        currentFileLabel.setText("Extracting archive & parsing sidecars...");

        TakeoutRestoreTask restoreTask = new TakeoutRestoreTask(
                extractionService,
                selectedSource.getAbsolutePath(),
                selectedOutput.getAbsolutePath(),
                PowerManager.PostAction.KEEP_AWAKE_ONLY,
                parseDateOverride(),
                false,
                splitVolumesCheck.isSelected(),
                -1,
                0,
                smartInterpolationCheck.isSelected(),
                organizeMonthCheck.isSelected()
        );

        this.activeRestoreTask = restoreTask;

        // Synchronize with background task state transitions
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
                });
                try {
                    int restored = 0;
                    try { restored = Integer.parseInt(kpiRestored.getText().trim()); } catch (Exception ignored) {}
                    new com.takeoutfix.shared.history.OperationHistoryService().recordOperation(
                            "Fix Google Photos",
                            "SUCCESS",
                            null,
                            java.time.Instant.now(),
                            restored,
                            0L,
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
        btnStart.setDisable(isRunning);
        btnScan.setDisable(isRunning);
        btnPause.setDisable(!isRunning);
        btnCancel.setDisable(!isRunning);
        btnPause.setText(isPaused ? "Resume" : "Pause");
        btnPause.setGraphic(UiIcons.createSvgIcon(isPaused ? UiIcons.PLAY : UiIcons.PAUSE, 12, "currentColor"));
        btnCancel.setGraphic(UiIcons.createSvgIcon(UiIcons.STOP, 11, "currentColor"));
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
                        operationStateLabel.setText("Injecting EXIF metadata...");
                    } else if (currentAction != null) {
                        operationStateLabel.setText(currentAction);
                    }
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
                    elapsedLabel.setText(String.format("⏱ Elapsed: %02d:%02d:%02d", hours, mins, secs));

                    speedLabel.setText(String.format(java.util.Locale.US, "Speed: %.1f files/s • %.1f MB/s", filesPerSec, mbPerSec));

                    long etaMins = etaSec / 60;
                    long etaRem = etaSec % 60;
                    etaLabel.setText(String.format("⏳ ETA: %02d:%02d", etaMins, etaRem));

                    if (processed >= total && total > 0) {
                        operationStateLabel.setText("Finalizing restoration...");
                        currentFileLabel.setText(String.format("Processed %,d of %,d media files.", processed, total));
                    }
                });
            }

            @Override
            public void onStats(int scanned, int total, int restored, int unmatched, int errors) {
                Platform.runLater(() -> {
                    kpiScanned.setText(String.valueOf(scanned > 0 ? scanned : total));
                    kpiRestored.setText(String.valueOf(restored));
                    kpiNeedsReview.setText(String.valueOf(unmatched));
                    kpiFailed.setText(String.valueOf(errors));
                });
            }
        });
    }

    private void showRestoreCompletionPopup() {
        Alert alert = new Alert(Alert.AlertType.INFORMATION);
        alert.initOwner(stage);
        alert.setTitle("Restoration Finished");
        alert.setHeaderText("Google Takeout Restoration Complete");
        alert.setContentText(String.format(
                "Restoration process completed successfully!\n\n"
                        + "• Files Scanned: %s\n"
                        + "• Metadata Restored: %s\n"
                        + "• Needs Review: %s\n"
                        + "• Failed: %s\n\n"
                        + "Destination:\n%s",
                kpiScanned.getText(),
                kpiRestored.getText(),
                kpiNeedsReview.getText(),
                kpiFailed.getText(),
                selectedOutput != null ? selectedOutput.getAbsolutePath() : ""
        ));

        ButtonType openFolderBtn = new ButtonType("Open Output Folder");
        ButtonType closeBtn = new ButtonType("OK", ButtonBar.ButtonData.CANCEL_CLOSE);
        alert.getButtonTypes().setAll(openFolderBtn, closeBtn);

        Optional<ButtonType> result = alert.showAndWait();
        if (result.isPresent() && result.get() == openFolderBtn) {
            handleOpenOutput();
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

    private void showErrorAlert(String title, String message) {
        Alert alert = new Alert(Alert.AlertType.ERROR);
        alert.initOwner(stage);
        alert.setTitle(title);
        alert.setHeaderText("An error occurred");
        alert.setContentText(message != null ? message : "An unexpected error occurred. Please check the logs.");
        alert.showAndWait();
    }
}
