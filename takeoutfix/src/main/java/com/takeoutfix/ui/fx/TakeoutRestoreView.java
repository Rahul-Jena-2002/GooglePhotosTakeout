package com.takeoutfix.ui.fx;

import com.takeoutfix.auth.UserSyncBridgeService;
import com.takeoutfix.restore.PowerManager;
import com.takeoutfix.restore.SessionStatsService;
import com.takeoutfix.restore.infrastructure.ExtractionService;
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
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

/**
 * Modern JavaFX Recovery Center for TakeoutFix.
 * Reproduces the complete TakeoutFix Operations Center shown in Image 2:
 * - Top header with title, subtitle, and top-right Tool Dropdown
 * - 2-Column workspace (Operations Pipeline on left, Restoration Controls on right)
 * - Source selection (Browse Folder, ZIP File, Drag & Drop, Clear)
 * - Destination selection (Select Destination Folder, Drag & Drop, Clear)
 * - Action buttons (Start, Pause, Cancel, Open Output Folder)
 * - Telemetry (Status, %, Progress bar, Elapsed, Speed, ETA)
 * - Restoration controls (Fallback date picker, 4 option checkboxes)
 * - Traffic light logs & diagnostics console with filter tabs (All, Restored, Errors, Skipped)
 */
public class TakeoutRestoreView extends VBox {

    private final Stage stage;
    private final ExtractionService extractionService;
    private final UserSyncBridgeService userService;
    private final SessionStatsService statsService;
    private final Consumer<WorkspaceType> onToolSwitch;

    // Header & Tool Dropdown
    public static final String TOOL_RESTORE = "Photo Metadata Restorer";
    public static final String TOOL_METASYNC = "MetaSync — RAW/JPEG Synchronizer";
    public static final String TOOL_DASHBOARD = "Operations Dashboard";
    public static final String TOOL_EXIF = "EXIF Viewer";
    public static final String TOOL_COMPARE = "Archive Compare";
    public static final String TOOL_DUPLICATE = "Duplicate Finder";

    // High-Contrast Semantic KPI Metric Cards (shadcn/SaaS styled)
    private final Label kpiScanned = new Label("0");
    private final Label kpiRestored = new Label("0");
    private final Label kpiIssues = new Label("0");
    private final Label kpiErrors = new Label("0");

    // Paths
    private File selectedSource = null;
    private File selectedOutput = null;
    private final Label sourcePathLabel = new Label("No folder or ZIP archive selected yet");
    private final Label outputPathLabel = new Label("No destination folder selected yet");
    private final Button btnSourceClear = new Button("✕");
    private final Button btnDestClear = new Button("✕");

    // Action Controls
    private final Button btnStart = new Button("Start Restoration");
    private final Button btnPause = new Button("Pause");
    private final Button btnCancel = new Button("Cancel");
    private final Button btnOpenOutput = new Button("Open Output Folder");

    // Telemetry
    private final Label progressStatusLabel = new Label("Status: Ready - Select source and destination to begin.");
    private final Label progressPercentLabel = new Label("0%");
    private final ProgressBar progressBar = new ProgressBar(0.0);
    private final Label elapsedLabel = new Label("⏱ Elapsed: 00:00");
    private final Label speedLabel = new Label("Speed: 0.0 files/s • 0.0 MB/s");
    private final Label etaLabel = new Label("⏳ ETA: --:--");

    // Restoration Options
    private final TextField dateOverrideField = new TextField();
    private final DatePicker datePicker = new DatePicker();
    private final CheckBox organizeMonthCheck = new CheckBox("Organize into Month subfolders");
    private final CheckBox smartInterpolationCheck = new CheckBox("Smart Timestamp Interpolation");
    private final CheckBox keepAwakeCheck = new CheckBox("Keep System Awake while processing");
    private final CheckBox splitVolumesCheck = new CheckBox("Compress output into 2GB ZIP volumes");

    // Logs & Diagnostics
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

    private String currentLogFilter = "ALL";
    private final Button tabAll = new Button("All (0)");
    private final Button tabRestored = new Button("Restored (0)");
    private final Button tabErrors = new Button("Errors (0)");
    private final Button tabSkipped = new Button("Skipped (0)");

    private boolean isRunning = false;
    private boolean isPaused = false;
    private long startTimeMs = 0;

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

        setSpacing(14);
        setPadding(new Insets(16, 20, 16, 20));
        VBox.setVgrow(this, Priority.ALWAYS);

        // 1. TakeoutFix — Restore Header Row
        getChildren().add(buildHeaderRow());

        // 2. High-Contrast 4-Card KPI Metric Deck
        getChildren().add(buildKpiCardsDeck());

        // 3. Main 2-Column Workspace (Operations Pipeline | Restoration Controls)
        getChildren().add(buildUnifiedWorkspaceCard());

        // 4. Restore Logs & Diagnostics Console
        VBox logsCard = buildLogsConsoleCard();
        VBox.setVgrow(logsCard, Priority.ALWAYS);
        getChildren().add(logsCard);

        // Initial log entries
        appendLog("INFO", "TakeoutFix Engine ready. Ready to scan Takeout archive or folder.");
        if (userService != null && userService.isSignedIn()) {
            appendLog("SUCCESS", "Session validated: " + userService.getCurrentEmail() + " • Cloud sync active.");
        }

        setupExtractionListeners();
    }

    private HBox buildHeaderRow() {
        HBox header = new HBox(16);
        header.setAlignment(Pos.CENTER_LEFT);

        VBox titleBox = new VBox(2);
        Label mainTitle = new Label("TakeoutFix — Restore");
        mainTitle.setStyle("-fx-font-size: 16px; -fx-font-weight: 800;");

        Label subtitle = new Label("Restore metadata, EXIF dates and JSON sidecars from Google Takeout archives");
        subtitle.setStyle("-fx-font-size: 12px; -fx-text-fill: #71717a;");

        titleBox.getChildren().addAll(mainTitle, subtitle);
        header.getChildren().add(titleBox);
        return header;
    }

    private HBox buildKpiCardsDeck() {
        HBox deck = new HBox(12);
        deck.setAlignment(Pos.CENTER_LEFT);

        VBox card1 = createSemanticKpiCard("Scanned Media", kpiScanned, "kpi-value-blue", "Total photo & video files", "kpi-card-blue");
        VBox card2 = createSemanticKpiCard("Restored Tags", kpiRestored, "kpi-value-green", "Metadata injected successfully", "kpi-card-green");
        VBox card3 = createSemanticKpiCard("Issues / Unmatched", kpiIssues, "kpi-value-amber", "Files requiring inspection", "kpi-card-amber");
        VBox card4 = createSemanticKpiCard("Errors / Failed", kpiErrors, "kpi-value-red", "Corrupted or failed files", "kpi-card-red");

        HBox.setHgrow(card1, Priority.ALWAYS);
        HBox.setHgrow(card2, Priority.ALWAYS);
        HBox.setHgrow(card3, Priority.ALWAYS);
        HBox.setHgrow(card4, Priority.ALWAYS);

        deck.getChildren().addAll(card1, card2, card3, card4);
        return deck;
    }

    private VBox createSemanticKpiCard(String labelText, Label valLabel, String valStyleClass, String subText, String cardStyleClass) {
        VBox card = new VBox(4);
        card.getStyleClass().addAll("kpi-card", cardStyleClass);

        Label lbl = new Label(labelText);
        lbl.getStyleClass().add("kpi-label");

        valLabel.getStyleClass().add(valStyleClass);

        Label sub = new Label(subText);
        sub.getStyleClass().add("kpi-sub");

        card.getChildren().addAll(lbl, valLabel, sub);
        return card;
    }

    private VBox buildUnifiedWorkspaceCard() {
        VBox card = new VBox(10);
        card.getStyleClass().add("glass-card");
        card.setPadding(new Insets(12, 14, 12, 14));

        HBox split = new HBox(14);
        split.setAlignment(Pos.TOP_LEFT);

        // ── Left Column: Operations Pipeline (68% width) ──
        VBox leftCol = new VBox(8);
        HBox.setHgrow(leftCol, Priority.ALWAYS);

        VBox srcBox = buildSourceBox();
        VBox dstBox = buildDestinationBox();
        HBox actBox = buildActionButtonsBox();
        VBox progBox = buildProgressTelemetryBox();

        leftCol.getChildren().addAll(srcBox, dstBox, actBox, progBox);

        // ── Right Column: Restoration Controls (32% width) ──
        VBox rightCol = new VBox(8);
        rightCol.setPrefWidth(280);
        rightCol.setMinWidth(260);
        rightCol.getChildren().add(buildRestorationControlsBox());

        split.getChildren().addAll(leftCol, rightCol);
        card.getChildren().add(split);
        return card;
    }

    private VBox buildSourceBox() {
        VBox box = new VBox(5);
        box.getStyleClass().add("inner-container");
        box.setPadding(new Insets(8, 10, 8, 10));

        Label title = new Label("1. TAKEOUT ARCHIVE SOURCE");
        title.getStyleClass().add("kpi-label");

        HBox row = new HBox(8);
        row.setAlignment(Pos.CENTER_LEFT);

        Button btnFolder = new Button("Browse Folder");
        btnFolder.getStyleClass().add("btn-primary");
        btnFolder.setGraphic(UiIcons.createSvgIcon(UiIcons.FOLDER, 14, "currentColor"));
        btnFolder.setGraphicTextGap(6);
        btnFolder.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-pref-height: 28px; -fx-pref-width: 130px;");
        btnFolder.setOnAction(e -> chooseSourceFolder());

        Button btnZip = new Button("ZIP File");
        btnZip.getStyleClass().add("btn-secondary");
        btnZip.setGraphic(UiIcons.createSvgIcon(UiIcons.ZIP, 14, "currentColor"));
        btnZip.setGraphicTextGap(6);
        btnZip.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-pref-height: 28px; -fx-pref-width: 90px;");
        btnZip.setOnAction(e -> chooseSourceZip());

        HBox pathDisplay = new HBox(6);
        pathDisplay.setAlignment(Pos.CENTER_LEFT);
        HBox.setHgrow(pathDisplay, Priority.ALWAYS);
        pathDisplay.getStyleClass().add("text-field");
        pathDisplay.setStyle("-fx-padding: 3 8 3 8; -fx-pref-height: 28px;");

        sourcePathLabel.getStyleClass().add("text-secondary");
        sourcePathLabel.setStyle("-fx-font-size: 11px;");
        HBox.setHgrow(sourcePathLabel, Priority.ALWAYS);

        btnSourceClear.getStyleClass().add("btn-ghost");
        btnSourceClear.setStyle("-fx-font-size: 10px; -fx-font-weight: 700; -fx-padding: 2 6 2 6; -fx-cursor: hand;");
        btnSourceClear.setVisible(false);
        btnSourceClear.setOnAction(e -> clearSource());

        pathDisplay.getChildren().addAll(sourcePathLabel, btnSourceClear);
        row.getChildren().addAll(btnFolder, btnZip, pathDisplay);
        box.getChildren().addAll(title, row);

        // Drag & Drop
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
        VBox box = new VBox(5);
        box.getStyleClass().add("inner-container");
        box.setPadding(new Insets(8, 10, 8, 10));

        Label title = new Label("2. OUTPUT DESTINATION FOLDER");
        title.getStyleClass().add("kpi-label");

        HBox row = new HBox(8);
        row.setAlignment(Pos.CENTER_LEFT);

        Button btnDest = new Button("Select Destination Folder");
        btnDest.getStyleClass().add("btn-secondary");
        btnDest.setGraphic(UiIcons.createSvgIcon(UiIcons.OUTPUT_FOLDER, 14, "currentColor"));
        btnDest.setGraphicTextGap(6);
        btnDest.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-pref-height: 28px; -fx-pref-width: 190px;");
        btnDest.setOnAction(e -> chooseDestinationFolder());

        HBox pathDisplay = new HBox(6);
        pathDisplay.setAlignment(Pos.CENTER_LEFT);
        HBox.setHgrow(pathDisplay, Priority.ALWAYS);
        pathDisplay.getStyleClass().add("text-field");
        pathDisplay.setStyle("-fx-padding: 3 8 3 8; -fx-pref-height: 28px;");

        outputPathLabel.getStyleClass().add("text-secondary");
        outputPathLabel.setStyle("-fx-font-size: 11px;");
        HBox.setHgrow(outputPathLabel, Priority.ALWAYS);

        btnDestClear.getStyleClass().add("btn-ghost");
        btnDestClear.setStyle("-fx-font-size: 10px; -fx-font-weight: 700; -fx-padding: 2 6 2 6; -fx-cursor: hand;");
        btnDestClear.setVisible(false);
        btnDestClear.setOnAction(e -> clearDestination());

        pathDisplay.getChildren().addAll(outputPathLabel, btnDestClear);
        row.getChildren().addAll(btnDest, pathDisplay);
        box.getChildren().addAll(title, row);

        // Drag & Drop
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
        row.setPadding(new Insets(6, 10, 6, 10));

        btnStart.getStyleClass().add("btn-primary");
        btnStart.setGraphic(UiIcons.createSvgIcon(UiIcons.PLAY, 13, "currentColor"));
        btnStart.setGraphicTextGap(7);
        btnStart.setStyle("-fx-font-size: 12px; -fx-font-weight: 700; -fx-pref-height: 32px; -fx-pref-width: 160px;");
        btnStart.setOnAction(e -> handleStart());

        btnPause.getStyleClass().add("btn-secondary");
        btnPause.setGraphic(UiIcons.createSvgIcon(UiIcons.PAUSE, 12, "currentColor"));
        btnPause.setGraphicTextGap(6);
        btnPause.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-pref-height: 32px; -fx-pref-width: 100px;");
        btnPause.setDisable(true);
        btnPause.setOnAction(e -> handlePause());

        btnCancel.getStyleClass().add("btn-secondary");
        btnCancel.setText("Stop");
        btnCancel.setGraphic(UiIcons.createSvgIcon(UiIcons.STOP, 11, "currentColor"));
        btnCancel.setGraphicTextGap(6);
        btnCancel.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-pref-height: 32px; -fx-pref-width: 95px;");
        btnCancel.setDisable(true);
        btnCancel.setOnAction(e -> handleCancel());

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        btnOpenOutput.getStyleClass().add("btn-secondary");
        btnOpenOutput.setGraphic(UiIcons.createSvgIcon(UiIcons.OUTPUT_FOLDER, 13, "currentColor"));
        btnOpenOutput.setGraphicTextGap(6);
        btnOpenOutput.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-pref-height: 32px; -fx-pref-width: 170px;");
        btnOpenOutput.setOnAction(e -> handleOpenOutput());

        row.getChildren().addAll(btnStart, btnPause, btnCancel, spacer, btnOpenOutput);
        return row;
    }

    private VBox buildProgressTelemetryBox() {
        VBox box = new VBox(4);
        box.getStyleClass().add("inner-container");
        box.setPadding(new Insets(8, 10, 8, 10));

        HBox statusRow = new HBox(8);
        statusRow.setAlignment(Pos.CENTER_LEFT);

        progressStatusLabel.getStyleClass().add("text-primary");
        progressStatusLabel.setStyle("-fx-font-size: 11px; -fx-font-weight: 700;");
        HBox.setHgrow(progressStatusLabel, Priority.ALWAYS);

        progressPercentLabel.getStyleClass().add("kpi-value-blue");
        progressPercentLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: 800;");

        statusRow.getChildren().addAll(progressStatusLabel, progressPercentLabel);

        progressBar.setMaxWidth(Double.MAX_VALUE);
        progressBar.setPrefHeight(6);

        HBox telemetryRow = new HBox(12);
        telemetryRow.setAlignment(Pos.CENTER_LEFT);

        elapsedLabel.getStyleClass().add("text-muted");
        elapsedLabel.setStyle("-fx-font-size: 10px;");

        speedLabel.getStyleClass().add("text-secondary");
        speedLabel.setStyle("-fx-font-size: 10px;");
        HBox.setHgrow(speedLabel, Priority.ALWAYS);
        speedLabel.setAlignment(Pos.CENTER);

        etaLabel.getStyleClass().add("kpi-value-blue");
        etaLabel.setStyle("-fx-font-size: 10px; -fx-font-weight: 700;");

        telemetryRow.getChildren().addAll(elapsedLabel, speedLabel, etaLabel);

        box.getChildren().addAll(statusRow, progressBar, telemetryRow);
        return box;
    }

    private VBox buildRestorationControlsBox() {
        VBox box = new VBox(6);
        box.getStyleClass().add("inner-container");
        box.setPadding(new Insets(8, 10, 8, 10));
        VBox.setVgrow(box, Priority.ALWAYS);

        HBox titleRow = new HBox(8);
        titleRow.setAlignment(Pos.CENTER_LEFT);
        Label title = new Label("RESTORATION CONTROLS");
        title.getStyleClass().add("kpi-label");
        Region sp = new Region();
        HBox.setHgrow(sp, Priority.ALWAYS);

        Label optBadge = new Label("OPTIONS");
        optBadge.getStyleClass().add("badge");
        optBadge.setStyle("-fx-font-size: 9px; -fx-font-weight: 700;");

        titleRow.getChildren().addAll(title, sp, optBadge);

        // Date input block
        VBox dateBlock = new VBox(3);
        Label dateLbl = new Label("Fallback Date (missing timestamps)");
        dateLbl.getStyleClass().add("text-muted");
        dateLbl.setStyle("-fx-font-size: 10px;");

        HBox dateRow = new HBox(4);
        dateRow.setAlignment(Pos.CENTER_LEFT);
        dateOverrideField.setPromptText("YYYY-MM-DD");
        dateOverrideField.getStyleClass().add("text-field");
        dateOverrideField.setStyle("-fx-font-size: 11px; -fx-pref-height: 26px; -fx-pref-width: 120px;");

        datePicker.setStyle("-fx-pref-width: 28px; -fx-pref-height: 26px;");
        datePicker.setOnAction(e -> {
            LocalDate d = datePicker.getValue();
            if (d != null) dateOverrideField.setText(d.toString());
        });

        dateRow.getChildren().addAll(dateOverrideField, datePicker);
        dateBlock.getChildren().addAll(dateLbl, dateRow);

        // 4 Checkboxes
        organizeMonthCheck.setStyle("-fx-font-size: 11px;");
        smartInterpolationCheck.setStyle("-fx-font-size: 11px;");
        smartInterpolationCheck.setSelected(true);
        keepAwakeCheck.setStyle("-fx-font-size: 11px;");
        keepAwakeCheck.setSelected(true);
        splitVolumesCheck.setStyle("-fx-font-size: 11px;");

        box.getChildren().addAll(titleRow, dateBlock, organizeMonthCheck, smartInterpolationCheck, keepAwakeCheck, splitVolumesCheck);
        return box;
    }

    private VBox buildLogsConsoleCard() {
        VBox card = new VBox(6);
        card.getStyleClass().add("glass-card");
        card.setPadding(new Insets(10, 12, 10, 12));

        // Top bar with Traffic light dots, Title, Filter Tabs, and Action buttons
        HBox topRow = new HBox(8);
        topRow.setAlignment(Pos.CENTER_LEFT);

        // 🔴 🟡 🟢 Traffic light dots
        HBox trafficLights = new HBox(5);
        trafficLights.setAlignment(Pos.CENTER_LEFT);
        Circle dotRed = new Circle(4, Color.web("#ef4444"));
        Circle dotYellow = new Circle(4, Color.web("#f59e0b"));
        Circle dotGreen = new Circle(4, Color.web("#10b981"));
        trafficLights.getChildren().addAll(dotRed, dotYellow, dotGreen);

        Label logsTitle = new Label("RESTORE LOGS & DIAGNOSTICS");
        logsTitle.getStyleClass().add("kpi-label");

        // Filter tabs
        HBox filterTabs = new HBox(4);
        filterTabs.setAlignment(Pos.CENTER_LEFT);
        styleTabButton(tabAll, "ALL", true);
        styleTabButton(tabRestored, "RESTORED", false);
        styleTabButton(tabErrors, "ERRORS", false);
        styleTabButton(tabSkipped, "SKIPPED", false);

        tabAll.setOnAction(e -> setLogFilter("ALL"));
        tabRestored.setOnAction(e -> setLogFilter("RESTORED"));
        tabErrors.setOnAction(e -> setLogFilter("ERRORS"));
        tabSkipped.setOnAction(e -> setLogFilter("SKIPPED"));

        filterTabs.getChildren().addAll(tabAll, tabRestored, tabErrors, tabSkipped);

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        Button btnCopy = new Button("Copy Logs");
        btnCopy.getStyleClass().add("btn-ghost");
        btnCopy.setGraphic(UiIcons.createSvgIcon(UiIcons.COPY, 12, "currentColor"));
        btnCopy.setStyle("-fx-font-size: 10px; -fx-font-weight: 600; -fx-padding: 3 8 3 8;");
        btnCopy.setOnAction(e -> copyLogsToClipboard());

        Button btnClear = new Button("Clear Logs");
        btnClear.getStyleClass().add("btn-ghost");
        btnClear.setGraphic(UiIcons.createSvgIcon(UiIcons.TRASH, 12, "currentColor"));
        btnClear.setStyle("-fx-font-size: 10px; -fx-font-weight: 600; -fx-padding: 3 8 3 8;");
        btnClear.setOnAction(e -> clearLogs());

        topRow.getChildren().addAll(trafficLights, logsTitle, filterTabs, spacer, btnCopy, btnClear);

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
                    timeLabel.setStyle("-fx-font-family: 'Consolas', 'Courier New', monospace; -fx-font-size: 11px;");

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
                    msgLabel.setStyle("-fx-font-size: 11px;");
                    msgLabel.setWrapText(true);
                    HBox.setHgrow(msgLabel, Priority.ALWAYS);

                    row.getChildren().addAll(timeLabel, badge, msgLabel);
                    setGraphic(row);
                    setText(null);
                }
            }
        });

        VBox.setVgrow(logListView, Priority.ALWAYS);
        card.getChildren().addAll(topRow, logListView);
        return card;
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
        styleTabButton(tabErrors, "ERRORS", "ERRORS".equals(filterKey));
        styleTabButton(tabSkipped, "SKIPPED", "SKIPPED".equals(filterKey));

        filteredLogs.clear();
        for (LogEntry e : allLogs) {
            if ("ALL".equals(filterKey)) {
                filteredLogs.add(e);
            } else if ("RESTORED".equals(filterKey) && "SUCCESS".equalsIgnoreCase(e.level)) {
                filteredLogs.add(e);
            } else if ("ERRORS".equals(filterKey) && "ERROR".equalsIgnoreCase(e.level)) {
                filteredLogs.add(e);
            } else if ("SKIPPED".equals(filterKey) && "WARN".equalsIgnoreCase(e.level)) {
                filteredLogs.add(e);
            }
        }
    }

    public void appendLog(String level, String message) {
        Platform.runLater(() -> {
            LogEntry entry = new LogEntry(level, message);
            allLogs.add(entry);

            boolean matches = "ALL".equals(currentLogFilter) ||
                    ("RESTORED".equals(currentLogFilter) && "SUCCESS".equalsIgnoreCase(level)) ||
                    ("ERRORS".equals(currentLogFilter) && "ERROR".equalsIgnoreCase(level)) ||
                    ("SKIPPED".equals(currentLogFilter) && "WARN".equalsIgnoreCase(level));

            if (matches) {
                filteredLogs.add(entry);
                logListView.scrollTo(filteredLogs.size() - 1);
            }

            // Update badge counts
            int allCount = allLogs.size();
            long succCount = allLogs.stream().filter(l -> "SUCCESS".equalsIgnoreCase(l.level)).count();
            long errCount = allLogs.stream().filter(l -> "ERROR".equalsIgnoreCase(l.level)).count();
            long skipCount = allLogs.stream().filter(l -> "WARN".equalsIgnoreCase(l.level)).count();

            tabAll.setText("All (" + allCount + ")");
            tabRestored.setText("Restored (" + succCount + ")");
            tabErrors.setText("Errors (" + errCount + ")");
            tabSkipped.setText("Skipped (" + skipCount + ")");
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

    private void clearLogs() {
        allLogs.clear();
        filteredLogs.clear();
        tabAll.setText("All (0)");
        tabRestored.setText("Restored (0)");
        tabErrors.setText("Errors (0)");
        tabSkipped.setText("Skipped (0)");
        kpiScanned.setText("0");
        kpiRestored.setText("0");
        kpiIssues.setText("0");
        kpiErrors.setText("0");
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
        sourcePathLabel.setStyle("-fx-font-size: 11px; -fx-font-weight: 600;");
        btnSourceClear.setVisible(true);

        // Auto-suggest destination folder if empty
        if (selectedOutput == null) {
            File suggested = new File(file.getParentFile(), "Takeout_Restored");
            setDestinationFile(suggested);
        }
    }

    private void clearSource() {
        selectedSource = null;
        sourcePathLabel.setText("No folder or ZIP archive selected yet");
        sourcePathLabel.setStyle("-fx-font-size: 11px; -fx-text-fill: #71717a;");
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
        outputPathLabel.setStyle("-fx-font-size: 11px; -fx-font-weight: 600;");
        btnDestClear.setVisible(true);
    }

    private void clearDestination() {
        selectedOutput = null;
        outputPathLabel.setText("No destination folder selected yet");
        outputPathLabel.setStyle("-fx-font-size: 11px; -fx-text-fill: #71717a;");
        btnDestClear.setVisible(false);
    }

    private final PowerManager powerManager = new PowerManager();

    private java.util.Optional<java.time.Instant> parseDateOverride() {
        String text = dateOverrideField.getText();
        if (text == null || text.trim().isEmpty() || text.startsWith("YYYY-MM-DD")) {
            return java.util.Optional.empty();
        }
        try {
            LocalDate d = LocalDate.parse(text.trim());
            return java.util.Optional.of(d.atStartOfDay(java.time.ZoneId.systemDefault()).toInstant());
        } catch (Exception e) {
            return java.util.Optional.empty();
        }
    }

    private void handleStart() {

        if (selectedSource == null) {
            showAlert("Source Required", "Please select a Google Takeout folder or ZIP archive first.");
            return;
        }
        if (selectedOutput == null) {
            showAlert("Destination Required", "Please select an output destination folder first.");
            return;
        }

        if (selectedSource.equals(selectedOutput) ||
            selectedOutput.getAbsolutePath().equalsIgnoreCase(selectedSource.getAbsolutePath()) ||
            selectedOutput.getAbsolutePath().startsWith(selectedSource.getAbsolutePath() + File.separator)) {
            showAlert("Destination Conflict", "To preserve original files intact, the destination folder must be a separate directory outside the source archive.");
            return;
        }

        isRunning = true;
        isPaused = false;
        startTimeMs = System.currentTimeMillis();
        updateButtonStates();

        if (keepAwakeCheck.isSelected()) {
            powerManager.startKeepAwake();
        }

        appendLog("INFO", "Starting restoration from " + selectedSource.getName() + " to " + selectedOutput.getName());
        progressStatusLabel.setText("Processing restoration...");

        new Thread(() -> {
            try {
                extractionService.startExtraction(
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
                Platform.runLater(this::showRestoreCompletionPopup);
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
            } catch (Exception ex) {
                Platform.runLater(() -> {
                    appendLog("ERROR", "Restoration failed: " + (ex.getMessage() != null ? ex.getMessage() : ex.getClass().getSimpleName()));
                    progressStatusLabel.setText("Error — restoration did not complete.");
                    showErrorAlert("Restoration Failed", ex.getMessage() != null ? ex.getMessage() : ex.toString());
                });
            } finally {
                // Always reset button states when the restore thread exits — whether completed, failed, or cancelled
                Platform.runLater(() -> {
                    isRunning = false;
                    isPaused = false;
                    updateButtonStates();
                    powerManager.stopKeepAwake();
                });
            }
        }, "fx-restore-runner").start();
    }

    private void handlePause() {
        isPaused = !isPaused;
        if (isPaused) {
            btnPause.setText("Resume");
            progressStatusLabel.setText("Restoration paused.");
            appendLog("WARN", "Restoration paused by user.");
            extractionService.pause();
        } else {
            btnPause.setText("Pause");
            progressStatusLabel.setText("Restoration resumed.");
            appendLog("INFO", "Restoration resumed.");
            extractionService.resume();
        }
    }

    private void handleCancel() {
        if (!isRunning) return;
        extractionService.cancel();
        isRunning = false;
        isPaused = false;
        updateButtonStates();
        powerManager.stopKeepAwake();
        appendLog("WARN", "Restoration cancelled by user.");
        progressStatusLabel.setText("Restoration cancelled.");
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
                    progressPercentLabel.setText(pct + "%");
                    progressStatusLabel.setText("Status: " + currentAction);
                });
            }

            @Override
            public void onProgressTelemetry(int processed, int total, long processedBytes, String currentAction,
                                           long elapsedSec, long etaSec, double filesPerSec, double mbPerSec) {
                Platform.runLater(() -> {
                    int pct = total > 0 ? (int) (((double) processed / total) * 100) : 0;
                    progressBar.setProgress(pct / 100.0);
                    progressPercentLabel.setText(pct + "%");
                    progressStatusLabel.setText("Status: " + currentAction);

                    long hours = elapsedSec / 3600;
                    long mins = (elapsedSec % 3600) / 60;
                    long secs = elapsedSec % 60;
                    elapsedLabel.setText(String.format("⏱ Elapsed: %02d:%02d:%02d", hours, mins, secs));

                    speedLabel.setText(String.format(java.util.Locale.US, "Speed: %.1f files/s • %.1f MB/s", filesPerSec, mbPerSec));

                    long etaMins = etaSec / 60;
                    long etaRem = etaSec % 60;
                    etaLabel.setText(String.format("⏳ ETA: %02d:%02d", etaMins, etaRem));

                    if (processed >= total && total > 0) {
                        isRunning = false;
                        isPaused = false;
                        updateButtonStates();
                        powerManager.stopKeepAwake();
                    }
                });
            }

            @Override
            public void onStats(int scanned, int total, int restored, int unmatched, int errors) {
                Platform.runLater(() -> {
                    kpiScanned.setText(String.valueOf(scanned > 0 ? scanned : total));
                    kpiRestored.setText(String.valueOf(restored));
                    kpiIssues.setText(String.valueOf(unmatched));
                    kpiErrors.setText(String.valueOf(errors));
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
                + "• Files Processed: %s\n"
                + "• Successfully Restored: %s\n"
                + "• Unmatched / Issues: %s\n"
                + "• Errors / Failed: %s\n\n"
                + "Destination:\n%s",
                kpiScanned.getText(),
                kpiRestored.getText(),
                kpiIssues.getText(),
                kpiErrors.getText(),
                selectedOutput != null ? selectedOutput.getAbsolutePath() : ""
        ));

        ButtonType openFolderBtn = new ButtonType("Open Output Folder");
        ButtonType closeBtn = new ButtonType("OK", ButtonBar.ButtonData.CANCEL_CLOSE);
        alert.getButtonTypes().setAll(openFolderBtn, closeBtn);

        java.util.Optional<ButtonType> result = alert.showAndWait();
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
