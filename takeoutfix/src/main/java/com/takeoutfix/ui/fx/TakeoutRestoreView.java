package com.takeoutfix.ui.fx;

import com.takeoutfix.auth.GuestQuotaStore;
import com.takeoutfix.auth.UserSyncBridgeService;
import com.takeoutfix.restore.PowerManager;
import com.takeoutfix.restore.SessionStatsService;
import com.takeoutfix.restore.RestoreTaskService;
import com.takeoutfix.restore.TakeoutRestoreTask;
import com.takeoutfix.restore.TakeoutScanTask;
import com.takeoutfix.restore.infrastructure.ExtractionService;
import com.takeoutfix.restore.infrastructure.MediaScanner;
import com.takeoutfix.task.BackgroundTask;
import com.takeoutfix.task.TaskManager;
import javafx.animation.Animation;
import javafx.animation.KeyFrame;
import javafx.animation.Timeline;
import javafx.application.Platform;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Node;
import javafx.scene.control.*;
import javafx.scene.input.Dragboard;
import javafx.scene.input.TransferMode;
import javafx.scene.layout.*;
import javafx.scene.paint.Color;
import javafx.scene.shape.Circle;
import javafx.stage.DirectoryChooser;
import javafx.stage.Stage;
import javafx.util.Duration;

import java.awt.Desktop;
import java.io.File;
import java.time.LocalDate;
import java.util.List;
import java.util.function.Consumer;

/**
 * Enterprise IntelliJ-style Takeout Restoration Center.
 * Clean, restrained layout with high-contrast typography and purple brand accents.
 */
public class TakeoutRestoreView extends VBox {

    private final Stage stage;
    private final ExtractionService extractionService;
    private final UserSyncBridgeService userService;
    private final RestoreTaskService restoreTasks;
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
    private final Label sourcePathLabel = new Label("Select or drop an extracted Takeout folder");
    private final Label sourceMetaLabel = new Label("Extract ZIP files before selecting a folder");
    private final Label outputPathLabel = new Label("Choose a folder for restored copies");
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
    private final Label currentFileLabel = new Label("Select an extracted Takeout folder and an output folder to begin.");
    private final Label filesRatioLabel = new Label("0 / 0 files (0%)");
    private final ProgressBar progressBar = new ProgressBar(0.0);
    private final Label elapsedValLabel = new Label("00:00:00");
    private final Label speedValLabel = new Label("0.0 f/s • 0.0 MB/s");
    private final Label etaValLabel = new Label("--:--");

    // Restoration Options (All unchecked by default)
    private final CheckBox organizeMonthCheck = new CheckBox("Organize by year and month");
    private final CheckBox splitVolumesCheck = new CheckBox("Create 2 GB ZIP files");
    private final CheckBox estimateDatesCheck = new CheckBox("Estimate missing dates");
    private final CheckBox keepAwakeCheck = new CheckBox("Keep computer awake");
    private final CheckBox shutdownAfterCheck = new CheckBox("Shut down when finished");

    // Storage Telemetry (Side-by-side metric cards: done and required)
    private long sourceSizeBytes = 0;
    private long restoredBytes = 0;
    private final Label storageDoneValue = new Label("-- / --");
    private final Label storageDoneLabel = new Label("done");
    private final Label storageReqValue = new Label("-- / --");
    private final Label storageReqLabel = new Label("required");

    private final RestoreLogPanel logPanel;

    private boolean isRunning = false;
    private boolean isPaused = false;
    private boolean guestQuotaBlocked = false;
    private long startTimeMs = 0;
    private final PowerManager powerManager = new PowerManager();
    private com.takeoutfix.restore.TakeoutRestoreTask activeRestoreTask = null;
    private com.takeoutfix.restore.TakeoutScanTask activeScanTask = null;

    private Timeline telemetryTimeline;

    private void startTelemetryTimeline() {
        stopTelemetryTimeline();
        telemetryTimeline = new Timeline(new KeyFrame(Duration.seconds(1), e -> {
            if (isRunning && !isPaused && startTimeMs > 0) {
                long elapsedSec = (System.currentTimeMillis() - startTimeMs) / 1000;
                long hours = elapsedSec / 3600;
                long mins = (elapsedSec % 3600) / 60;
                long secs = elapsedSec % 60;
                elapsedValLabel.setText(String.format("%02d:%02d:%02d", hours, mins, secs));
                updateStorageDisplay();
            }
        }));
        telemetryTimeline.setCycleCount(Animation.INDEFINITE);
        telemetryTimeline.play();
    }

    private void stopTelemetryTimeline() {
        if (telemetryTimeline != null) {
            telemetryTimeline.stop();
            telemetryTimeline = null;
        }
    }

    public TakeoutRestoreView(Stage stage,
                              ExtractionService extractionService,
                              UserSyncBridgeService userService,
                              SessionStatsService statsService,
                              Consumer<WorkspaceType> onToolSwitch) {
        this.stage = stage;
        this.extractionService = extractionService;
        this.userService = userService;
        this.restoreTasks = new RestoreTaskService(extractionService, statsService);
        this.onToolSwitch = onToolSwitch;

        getStyleClass().add("restore-workspace");
        setSpacing(16);
        setPadding(new Insets(24));
        VBox.setVgrow(this, Priority.ALWAYS);

        // 1. Header Row
        getChildren().add(buildHeaderRow());

        // Keep the restore steps visible and let activity expand when needed.
        VBox workspaceCard = buildUnifiedWorkspaceCard();
        ScrollPane workspaceScroll = new ScrollPane(workspaceCard);
        workspaceScroll.setFitToWidth(true);
        workspaceScroll.setHbarPolicy(ScrollPane.ScrollBarPolicy.NEVER);
        workspaceScroll.getStyleClass().add("restore-workspace-scroll");
        VBox.setVgrow(workspaceScroll, Priority.ALWAYS);
        logPanel = new RestoreLogPanel(stage, this::showAlert);
        TitledPane activityPane = new TitledPane("Activity & logs", logPanel);
        activityPane.setAnimated(false);
        activityPane.setExpanded(false);
        getChildren().addAll(workspaceScroll, activityPane);

        // Options unchecked by default
        organizeMonthCheck.setSelected(false);
        splitVolumesCheck.setSelected(false);
        estimateDatesCheck.setSelected(false);
        organizeMonthCheck.disableProperty().bind(splitVolumesCheck.selectedProperty());
        organizeMonthCheck.setTooltip(new Tooltip("Year/month organization is available for folder output."));
        splitVolumesCheck.selectedProperty().addListener((observable, wasSelected, selected) -> {
            if (selected) {
                organizeMonthCheck.setSelected(false);
                if (userService == null || !userService.isSignedIn()) {
                    showAlert("Guest ZIP output", "If ZIP creation is interrupted, files in an unfinished archive may still count toward your guest limit. Folder output avoids this ZIP-specific issue. Keep your originals and check your output.");
                }
            }
        });
        keepAwakeCheck.setSelected(false);
        shutdownAfterCheck.setSelected(false);

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
        Label mainTitle = new Label("Restore your photos");
        mainTitle.getStyleClass().addAll("page-title", "header-title");
        mainTitle.setStyle("-fx-font-size: 20px; -fx-font-weight: 700;");

        Label subtitle = new Label("Add available dates, locations, and details to copies of your photos.");
        subtitle.getStyleClass().addAll("page-description", "header-subtitle");
        subtitle.setStyle("-fx-font-size: 13px;");

        titleBox.getChildren().addAll(mainTitle, subtitle);
        header.getChildren().addAll(iconTile, titleBox);
        return header;
    }

    private GridPane buildKpiCardsDeck() {
        GridPane deck = new GridPane();
        deck.setHgap(8);
        deck.setVgap(8);

        VBox card1 = createSemanticKpiCard("Scanned", kpiScanned, "Files checked", UiIcons.CAMERA);
        VBox card2 = createSemanticKpiCard("Restored", kpiRestored, "Details added", UiIcons.CHECK_CIRCLE);
        VBox card3 = createSemanticKpiCard("Review", kpiNeedsReview, "Check these files", UiIcons.ALERT);
        VBox card4 = createSemanticKpiCard("Failed", kpiFailed, "Files with errors", UiIcons.X);

        for (VBox metric : new VBox[]{card1, card2, card3, card4}) {
            metric.setMaxWidth(Double.MAX_VALUE);
            GridPane.setHgrow(metric, Priority.ALWAYS);
        }
        deck.add(card1, 0, 0);
        deck.add(card2, 1, 0);
        deck.add(card3, 0, 1);
        deck.add(card4, 1, 1);
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
        card.setPrefHeight(76);
        card.setMinHeight(76);

        HBox topRow = new HBox(8);
        topRow.setAlignment(Pos.CENTER_LEFT);

        Label lbl = new Label(labelText);
        lbl.getStyleClass().addAll("kpi-title", "kpi-label");
        lbl.setStyle("-fx-font-size: 12px; -fx-font-weight: 600;");

        Region sp = new Region();
        HBox.setHgrow(sp, Priority.ALWAYS);

        Node icon = UiIcons.createSvgIcon(iconSvg, 13, "currentColor");
        icon.setOpacity(0.5);

        topRow.getChildren().addAll(lbl, sp, icon);

        valLabel.getStyleClass().setAll("kpi-value", "text-primary");
        valLabel.setStyle("-fx-font-size: 26px; -fx-font-weight: 700;");

        Label sub = new Label(subText);
        sub.getStyleClass().add("text-muted");
        sub.setStyle("-fx-font-size: 12px;");

        card.getChildren().addAll(topRow, valLabel, sub);
        return card;
    }

    private VBox buildUnifiedWorkspaceCard() {
        VBox card = new VBox(10);
        card.getStyleClass().add("restore-layout");
        card.setStyle("-fx-background-radius: 12; -fx-border-radius: 12; -fx-border-width: 1; -fx-padding: 16;");
        VBox.setVgrow(card, Priority.ALWAYS);

        SplitPane horizSplit = new SplitPane();
        horizSplit.setOrientation(javafx.geometry.Orientation.HORIZONTAL);
        horizSplit.setMinHeight(Region.USE_PREF_SIZE);
        VBox.setVgrow(horizSplit, Priority.ALWAYS);

        // Left Column: Operations Pipeline + KPI Cards
        VBox leftCol = new VBox(10);
        leftCol.setMinHeight(Region.USE_PREF_SIZE);
        VBox.setVgrow(leftCol, Priority.ALWAYS);
        leftCol.setMinWidth(480);

        VBox srcBox = buildSourceBox();
        VBox dstBox = buildDestinationBox();
        VBox actBox = buildActionButtonsBox();
        VBox progBox = buildProgressTelemetryBox();

        leftCol.getChildren().addAll(srcBox, dstBox, actBox, progBox);

        // Right Column: Restoration Options (compact) + Dedicated Storage Card (outside at bottom)
        VBox rightCol = new VBox(10);
        rightCol.setMinHeight(Region.USE_PREF_SIZE);
        VBox.setVgrow(rightCol, Priority.ALWAYS);
        rightCol.setPrefWidth(330);
        rightCol.setMinWidth(280);

        VBox overview = new VBox(4);
        overview.getStyleClass().add("inner-container");
        Label overviewTitle = new Label("Overview");
        overviewTitle.getStyleClass().add("card-title");
        overview.getChildren().addAll(overviewTitle, buildKpiCardsDeck());
        VBox optionsCard = buildRestorationOptionsCard();
        VBox.setVgrow(optionsCard, Priority.NEVER);

        Region rightSpacer = new Region();
        VBox.setVgrow(rightSpacer, Priority.ALWAYS);

        VBox storageCard = buildDedicatedStorageCard();
        VBox.setVgrow(storageCard, Priority.NEVER);

        rightCol.getChildren().addAll(overview, optionsCard, rightSpacer, storageCard);

        horizSplit.getItems().addAll(leftCol, rightCol);
        horizSplit.setDividerPositions(0.70);
        card.getChildren().add(horizSplit);
        card.widthProperty().addListener((observable, oldWidth, newWidth) -> {
            boolean stacked = newWidth.doubleValue() < 820;
            var orientation = stacked ? javafx.geometry.Orientation.VERTICAL : javafx.geometry.Orientation.HORIZONTAL;
            if (horizSplit.getOrientation() == orientation) return;
            leftCol.setMinWidth(stacked ? 0 : 480);
            rightCol.setMinWidth(stacked ? 0 : 280);
            horizSplit.setOrientation(orientation);
            if (stacked) {
                double width = Math.max(200, newWidth.doubleValue() - 40);
                double leftHeight = leftCol.prefHeight(width);
                double rightHeight = rightCol.prefHeight(width);
                horizSplit.setPrefHeight(leftHeight + rightHeight + 32);
                horizSplit.setDividerPositions(leftHeight / (leftHeight + rightHeight));
            } else {
                horizSplit.setPrefHeight(Region.USE_COMPUTED_SIZE);
                horizSplit.setDividerPositions(0.70);
            }
        });
        return card;
    }

    private VBox buildSourceBox() {
        VBox box = new VBox(6);
        box.getStyleClass().add("inner-container");
        box.setStyle("-fx-padding: 12;");

        HBox headerRow = new HBox(8);
        headerRow.setAlignment(Pos.CENTER_LEFT);

        Label title = new Label("1. Choose your Takeout folder");
        title.setStyle("-fx-font-size: 15px; -fx-font-weight: 700;");
        title.getStyleClass().add("card-title");

        sourceMetaLabel.getStyleClass().add("text-muted");
        sourceMetaLabel.setWrapText(true);

        headerRow.getChildren().add(title);

        HBox row = new HBox(8);
        row.setAlignment(Pos.CENTER_LEFT);

        Button btnFolder = new Button("Browse Folder");
        btnFolder.getStyleClass().add("btn-secondary");
        btnFolder.setGraphic(UiIcons.createSvgIcon(UiIcons.FOLDER, 14, "currentColor"));
        btnFolder.setGraphicTextGap(7);
        btnFolder.setMinWidth(Region.USE_PREF_SIZE);
        btnFolder.setStyle("-fx-font-size: 14.5px; -fx-font-weight: 600; -fx-pref-height: 38px; -fx-padding: 0 16 0 16;");
        btnFolder.setOnAction(e -> chooseSourceFolder());

        HBox pathDisplay = new HBox(8);
        pathDisplay.setAlignment(Pos.CENTER_LEFT);
        HBox.setHgrow(pathDisplay, Priority.ALWAYS);
        pathDisplay.getStyleClass().add("path-display-box");
        pathDisplay.setStyle("-fx-border-radius: 6; -fx-background-radius: 6; -fx-border-width: 1; -fx-padding: 4 10 4 10; -fx-pref-height: 36px;");

        Label pathIcon = new Label();
        pathIcon.setGraphic(UiIcons.createSvgIcon(UiIcons.FOLDER, 13, "currentColor"));

        sourcePathLabel.setStyle("-fx-font-size: 14.5px;");
        sourcePathLabel.getStyleClass().add("text-secondary");
        sourcePathLabel.setTextOverrun(OverrunStyle.CENTER_ELLIPSIS);
        HBox.setHgrow(sourcePathLabel, Priority.ALWAYS);

        btnSourceClear.getStyleClass().add("btn-ghost");
        btnSourceClear.setStyle("-fx-font-size: 13px; -fx-font-weight: 600; -fx-padding: 2 6 2 6; -fx-cursor: hand;");
        btnSourceClear.setVisible(false);
        btnSourceClear.setOnAction(e -> clearSource());

        pathDisplay.getChildren().addAll(pathIcon, sourcePathLabel, btnSourceClear);
        row.getChildren().addAll(pathDisplay, btnFolder);
        box.getChildren().addAll(headerRow, sourceMetaLabel, row);

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
                File source = db.getFiles().get(0);
                if (source.isDirectory()) {
                    setSourceFile(source);
                    success = true;
                } else {
                    showAlert("Select a Folder", "Extract your Takeout ZIP first, then select or drop the extracted folder.");
                }
            }
            box.setStyle("-fx-background-radius: 6; -fx-border-radius: 6; -fx-border-width: 1; -fx-padding: 8 12 8 12;");
            event.setDropCompleted(success);
            event.consume();
        });

        return box;
    }

    private VBox buildDestinationBox() {
        VBox box = new VBox(6);
        box.getStyleClass().add("inner-container");
        box.setStyle("-fx-padding: 12;");

        HBox headerRow = new HBox(8);
        headerRow.setAlignment(Pos.CENTER_LEFT);

        Label title = new Label("2. Choose where to save copies");
        title.setStyle("-fx-font-size: 15px; -fx-font-weight: 700;");
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
        btnDest.setMinWidth(Region.USE_PREF_SIZE);
        btnDest.setStyle("-fx-font-size: 14.5px; -fx-font-weight: 600; -fx-pref-height: 38px; -fx-padding: 0 16 0 16;");
        btnDest.setOnAction(e -> chooseDestinationFolder());

        HBox pathDisplay = new HBox(8);
        pathDisplay.setAlignment(Pos.CENTER_LEFT);
        HBox.setHgrow(pathDisplay, Priority.ALWAYS);
        pathDisplay.getStyleClass().add("path-display-box");
        pathDisplay.setStyle("-fx-border-radius: 6; -fx-background-radius: 6; -fx-border-width: 1; -fx-padding: 4 10 4 10; -fx-pref-height: 36px;");

        Label pathIcon = new Label();
        pathIcon.setGraphic(UiIcons.createSvgIcon(UiIcons.OUTPUT_FOLDER, 13, "currentColor"));

        outputPathLabel.setStyle("-fx-font-size: 14.5px;");
        outputPathLabel.getStyleClass().add("text-secondary");
        outputPathLabel.setTextOverrun(OverrunStyle.CENTER_ELLIPSIS);
        HBox.setHgrow(outputPathLabel, Priority.ALWAYS);

        btnDestClear.getStyleClass().add("btn-ghost");
        btnDestClear.setStyle("-fx-font-size: 13px; -fx-font-weight: 600; -fx-padding: 2 6 2 6; -fx-cursor: hand;");
        btnDestClear.setVisible(false);
        btnDestClear.setOnAction(e -> clearDestination());

        pathDisplay.getChildren().addAll(pathIcon, outputPathLabel, btnDestClear);
        row.getChildren().addAll(pathDisplay, btnDest);
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

    private VBox buildActionButtonsBox() {
        VBox actions = new VBox(8);
        FlowPane row = new FlowPane(8, 8);
        row.setAlignment(Pos.CENTER_LEFT);
        row.setMinHeight(Region.USE_PREF_SIZE);

        btnStart.getStyleClass().add("btn-primary");
        btnStart.setGraphic(UiIcons.createSvgIcon(UiIcons.PLAY, 14, "currentColor"));
        btnStart.setGraphicTextGap(8);
        btnStart.setMinWidth(Region.USE_PREF_SIZE);
        btnStart.setMaxWidth(Double.MAX_VALUE);
        btnStart.setStyle("-fx-font-size: 14.5px; -fx-font-weight: 600; -fx-pref-height: 44px; -fx-padding: 0 18 0 18; -fx-background-radius: 8;");
        btnStart.setOnAction(e -> handleStart());

        btnScan.getStyleClass().add("btn-secondary");
        btnScan.setGraphic(UiIcons.createSvgIcon(UiIcons.SEARCH, 13, "currentColor"));
        btnScan.setGraphicTextGap(7);
        btnScan.setMinWidth(Region.USE_PREF_SIZE);
        btnScan.setStyle("-fx-font-size: 14.5px; -fx-font-weight: 600; -fx-pref-height: 38px; -fx-padding: 0 14 0 14; -fx-background-radius: 6;");
        btnScan.setTooltip(new Tooltip("Scan archive and preview matched items without writing to disk."));
        btnScan.setOnAction(e -> handleScan());

        btnPause.getStyleClass().add("btn-secondary");
        btnPause.setGraphic(UiIcons.createSvgIcon(UiIcons.PAUSE, 12, "currentColor"));
        btnPause.setGraphicTextGap(6);
        btnPause.setMinWidth(Region.USE_PREF_SIZE);
        btnPause.setStyle("-fx-font-size: 14.5px; -fx-font-weight: 600; -fx-pref-height: 38px; -fx-padding: 0 12 0 12; -fx-background-radius: 6;");
        btnPause.setDisable(true);
        btnPause.setOnAction(e -> handlePause());

        btnCancel.getStyleClass().add("btn-secondary");
        btnCancel.setText("Stop");
        btnCancel.setGraphic(UiIcons.createSvgIcon(UiIcons.STOP, 11, "currentColor"));
        btnCancel.setGraphicTextGap(6);
        btnCancel.setMinWidth(Region.USE_PREF_SIZE);
        btnCancel.setStyle("-fx-font-size: 14.5px; -fx-font-weight: 600; -fx-pref-height: 38px; -fx-padding: 0 12 0 12; -fx-background-radius: 6;");
        btnCancel.setDisable(true);
        btnCancel.setOnAction(e -> handleCancel());

        btnOpenOutput.getStyleClass().add("btn-secondary");
        btnOpenOutput.setGraphic(UiIcons.createSvgIcon(UiIcons.OUTPUT_FOLDER, 13, "currentColor"));
        btnOpenOutput.setGraphicTextGap(7);
        btnOpenOutput.setMinWidth(Region.USE_PREF_SIZE);
        btnOpenOutput.setStyle("-fx-font-size: 14.5px; -fx-font-weight: 600; -fx-pref-height: 38px; -fx-padding: 0 14 0 14; -fx-background-radius: 6;");
        btnOpenOutput.setOnAction(e -> handleOpenOutput());

        row.getChildren().addAll(btnScan, btnPause, btnCancel, btnOpenOutput);
        actions.getChildren().addAll(btnStart, row);
        return actions;
    }

    private VBox buildProgressTelemetryBox() {
        VBox box = new VBox(7);
        box.getStyleClass().add("inner-container");
        box.setStyle("-fx-background-radius: 6; -fx-border-radius: 6; -fx-border-width: 1; -fx-padding: 8 12 8 12;");

        HBox statusRow = new HBox(8);
        statusRow.setAlignment(Pos.CENTER_LEFT);

        statusRow.getChildren().add(statusPulseDot);

        operationStateLabel.setStyle("-fx-font-size: 14.5px; -fx-font-weight: 700;");
        operationStateLabel.getStyleClass().add("text-primary");
        statusRow.getChildren().add(operationStateLabel);

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        filesRatioLabel.setStyle("-fx-font-size: 14.5px; -fx-font-weight: 700; -fx-font-family: 'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace;"); filesRatioLabel.getStyleClass().add("brand-accent");

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
        name.setStyle("-fx-font-size: 13px; -fx-font-weight: 600;");

        valLabel.getStyleClass().add("telemetry-chip-value");
        valLabel.setStyle("-fx-font-family: 'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace; -fx-font-size: 13.5px; -fx-font-weight: 700;");

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
        Label title = new Label("Restore options");
        title.setStyle("-fx-font-size: 14px; -fx-font-weight: 700; -fx-letter-spacing: 0.5px;");
        title.getStyleClass().add("card-title");
        titleRow.getChildren().addAll(UiIcons.createSvgIcon(UiIcons.SETTINGS, 13, "currentColor"), title);

        // Group 1: Output & Structure
        Label outputGroupLabel = new Label("Output & Structure");
        outputGroupLabel.getStyleClass().addAll("section-sub-title", "text-muted");
        outputGroupLabel.setStyle("-fx-font-size: 13px; -fx-font-weight: 700; -fx-text-transform: uppercase; -fx-padding: 4 0 2 0;");

        organizeMonthCheck.getStyleClass().add("text-primary");
        organizeMonthCheck.setWrapText(true);
        organizeMonthCheck.setStyle("-fx-font-size: 14.5px; -fx-cursor: hand;");
        splitVolumesCheck.getStyleClass().add("text-primary");
        splitVolumesCheck.setWrapText(true);
        splitVolumesCheck.setStyle("-fx-font-size: 14.5px; -fx-cursor: hand;");
        estimateDatesCheck.getStyleClass().add("text-primary");
        estimateDatesCheck.setStyle("-fx-font-size: 14.5px; -fx-cursor: hand;");
        estimateDatesCheck.setWrapText(true);
        Label estimateNote = new Label("Estimates use nearby files and can be wrong. Check them before importing.");
        estimateNote.getStyleClass().add("text-muted");
        estimateNote.setWrapText(true);

        // Group 2: System & Power
        Label systemGroupLabel = new Label("System & Power");
        systemGroupLabel.getStyleClass().addAll("section-sub-title", "text-muted");
        systemGroupLabel.setStyle("-fx-font-size: 13px; -fx-font-weight: 700; -fx-text-transform: uppercase; -fx-padding: 6 0 2 0;");

        keepAwakeCheck.getStyleClass().add("text-primary");
        keepAwakeCheck.setWrapText(true);
        keepAwakeCheck.setStyle("-fx-font-size: 14.5px; -fx-cursor: hand;");
        shutdownAfterCheck.getStyleClass().add("text-primary");
        shutdownAfterCheck.setWrapText(true);
        shutdownAfterCheck.setStyle("-fx-font-size: 14.5px; -fx-cursor: hand;");

        card.getChildren().addAll(
                titleRow,
                outputGroupLabel,
                organizeMonthCheck,
                splitVolumesCheck,
                estimateDatesCheck,
                estimateNote,
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
        storeTitle.setStyle("-fx-font-size: 14px; -fx-font-weight: 700; -fx-letter-spacing: 0.5px;");
        storeTitle.getStyleClass().add("card-title");

        storeHeaderRow.getChildren().addAll(icon, storeTitle);

        // Two small cards side-by-side: [ done ] and [ required ]
        HBox dualCardsRow = new HBox(8);
        dualCardsRow.setAlignment(Pos.CENTER);

        VBox doneCard = createStorageSubCard(storageDoneValue, storageDoneLabel);
        VBox reqCard = createStorageSubCard(storageReqValue, storageReqLabel);
        storageDoneValue.setTooltip(new Tooltip("Restored data / Total source archive data"));
        storageReqValue.setTooltip(new Tooltip("Remaining required disk space / Available free space on destination"));

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

        valueLabel.setStyle("-fx-font-family: 'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace; -fx-font-size: 15px; -fx-font-weight: 700; -fx-text-alignment: center;");
        valueLabel.getStyleClass().add("text-primary");
        valueLabel.setAlignment(Pos.CENTER);

        tagLabel.setStyle("-fx-font-size: 12.5px; -fx-font-weight: 600; -fx-opacity: 0.85; -fx-text-alignment: center;");
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

        // Dynamic remaining required space: counts down as files are written
        long remainingBytes = Math.max(0, sourceSizeBytes - restoredBytes);
        String reqLeft = sourceSizeBytes > 0 ? formatStorageGb(remainingBytes) : "--";
        String reqRight = freeBytes > 0 ? formatStorageGb(freeBytes) : "--";
        storageReqValue.setText(reqLeft + " / " + reqRight);

        if (restoredBytes > 0 && remainingBytes > 0) {
            storageReqLabel.setText("remaining required");
        } else if (remainingBytes == 0 && sourceSizeBytes > 0) {
            storageReqLabel.setText("all written");
        } else {
            storageReqLabel.setText("required");
        }

        if (remainingBytes > 0 && freeBytes > 0) {
            if (freeBytes < remainingBytes) {
                // Warning: destination disk does not have enough free space for the remaining files
                storageReqValue.setStyle("-fx-font-family: 'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace; -fx-font-size: 15px; -fx-font-weight: 700; -fx-text-fill: #EF4444; -fx-text-alignment: center;");
            } else {
                // Healthy: available free space safely accommodates the remaining files
                storageReqValue.setStyle("-fx-font-family: 'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace; -fx-font-size: 15px; -fx-font-weight: 700; -fx-text-fill: #10B981; -fx-text-alignment: center;");
            }
        } else if (remainingBytes == 0 && sourceSizeBytes > 0) {
            storageReqValue.setStyle("-fx-font-family: 'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace; -fx-font-size: 15px; -fx-font-weight: 700; -fx-text-fill: #10B981; -fx-text-alignment: center;");
        } else {
            storageReqValue.setStyle("-fx-font-family: 'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace; -fx-font-size: 15px; -fx-font-weight: 700; -fx-text-alignment: center;");
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

    public void appendLog(String level, String message) {
        logPanel.appendLog(level, message);
    }

    private void chooseSourceFolder() {
        DirectoryChooser chooser = new DirectoryChooser();
        chooser.setTitle("Select Google Takeout Directory");
        File dir = chooser.showDialog(stage);
        if (dir != null) {
            setSourceFile(dir);
        }
    }

    private void setSourceFile(File file) {
        this.selectedSource = file;
        sourceSizeBytes = 0;
        sourcePathLabel.setText(file.getAbsolutePath());
        sourcePathLabel.setStyle("-fx-font-size: 14.5px; -fx-font-weight: 600;");
        sourcePathLabel.getStyleClass().add("text-primary");
        btnSourceClear.setVisible(true);

        sourceMetaLabel.setText("Scanning archive...");
        updateButtonStates();
        new Thread(() -> {
            try {
                if (file.isDirectory()) {
                    List<File> media = new MediaScanner().listMediaFiles(file);
                    long totalBytes = 0;
                    for (File m : media) totalBytes += m.length();
                    long sizeBytes = totalBytes;
                    long sizeMb = totalBytes / (1024 * 1024);
                    int count = media.size();
                    Platform.runLater(() -> {
                        if (!file.equals(selectedSource)) return;
                        sourceSizeBytes = sizeBytes;
                        sourceMetaLabel.setText(String.format("%,d media files • %,d MB", count, sizeMb));
                        updateStorageDisplay();
                    });
                }
            } catch (Exception e) {
                Platform.runLater(() -> {
                    if (!file.equals(selectedSource)) return;
                    sourceMetaLabel.setText("Could not inspect the selected source");
                    appendLog("WARN", "Could not inspect source: " + e.getMessage());
                    updateStorageDisplay();
                });
            }
        }, "source-scan-thread").start();
    }

    private void clearSource() {
        selectedSource = null;
        sourceSizeBytes = 0;
        sourcePathLabel.setText("Select or drop an extracted Takeout folder");
        sourcePathLabel.setStyle("-fx-font-size: 14.5px;");
        sourcePathLabel.getStyleClass().add("text-secondary");
        sourceMetaLabel.setText("Extract ZIP files before selecting a folder");
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
        outputPathLabel.setStyle("-fx-font-size: 14.5px; -fx-font-weight: 600;");
        outputPathLabel.getStyleClass().add("text-primary");
        outputMetaLabel.setText("Destination selected");
        btnDestClear.setVisible(true);
        updateButtonStates();
        updateStorageDisplay();
    }

    private void clearDestination() {
        selectedOutput = null;
        outputPathLabel.setText("Choose a folder for restored copies");
        outputPathLabel.setStyle("-fx-font-size: 14.5px;");
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
            showAlert("Source Folder Required", "Select the extracted Google Takeout folder to scan.");
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
            showAlert("Source Folder Required", "Select the extracted Google Takeout folder to begin.");
            return;
        }
        if (selectedOutput == null) {
            showAlert("Output Location Required", "Please designate an output destination folder.");
            return;
        }

        try {
            var sourcePath = selectedSource.getCanonicalFile().toPath();
            var outputPath = selectedOutput.getCanonicalFile().toPath();
            if (outputPath.startsWith(sourcePath)) {
                showAlert("Destination Conflict", "Choose an output folder outside the source archive or folder.");
                return;
            }
        } catch (java.io.IOException e) {
            showAlert("Cannot Check Folders", "Could not check the selected paths. Please select them again and check that they are accessible.");
            return;
        }

        boolean signedIn = userService != null && userService.isSignedIn();
        if (!signedIn && GuestQuotaStore.isExhausted()) {
            FxTrustSignInDialog trustDialog = new FxTrustSignInDialog(stage, userService, () -> {
                if (userService != null && userService.isSignedIn()) {
                    executeLiveRestoration();
                }
            });
            trustDialog.showAndWait();
            return;
        }

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
        kpiScanned.setText("0");
        kpiRestored.setText("0");
        kpiNeedsReview.setText("0");
        kpiFailed.setText("0");
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
                    kpiScanned.setText(String.valueOf(current));
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
        scanTask.stateProperty().addListener((obs, oldState, newState) -> {
            if (newState == BackgroundTask.TaskState.CANCELLED) {
                Platform.runLater(() -> {
                    isRunning = false;
                    isPaused = false;
                    activeScanTask = null;
                    operationStateLabel.setText("Scan cancelled.");
                    currentFileLabel.setText("Operation stopped.");
                    updateButtonStates();
                });
            }
        });
        TaskManager.getInstance().submitTask(scanTask);
    }

    private void executeLiveRestoration() {
        isRunning = true;
        isPaused = false;
        guestQuotaBlocked = false;
        kpiScanned.setText("0");
        kpiRestored.setText("0");
        kpiNeedsReview.setText("0");
        kpiFailed.setText("0");
        updateRestoredBytes(0);
        startTimeMs = System.currentTimeMillis();
        startTelemetryTimeline();
        updateButtonStates();

        boolean shutdownRequested = shutdownAfterCheck.isSelected();
        boolean zipOutput = splitVolumesCheck.isSelected();
        if (keepAwakeCheck.isSelected() || shutdownRequested) {
            powerManager.startKeepAwake();
        }

        appendLog("INFO", "Starting restoration from " + selectedSource.getName() + " to " + selectedOutput.getName());
        operationStateLabel.setText("Initializing restoration engine...");
        currentFileLabel.setText("Extracting archive & parsing sidecars...");

        TakeoutRestoreTask restoreTask = restoreTasks.createRestoreTask(selectedSource, selectedOutput,
                shutdownRequested, zipOutput, estimateDatesCheck.isSelected(), organizeMonthCheck.isSelected());

        this.activeRestoreTask = restoreTask;

        restoreTask.stateProperty().addListener((obs, oldState, newState) -> {
            if (newState == BackgroundTask.TaskState.COMPLETED) {
                Platform.runLater(() -> {
                    stopTelemetryTimeline();
                    int restored = Integer.parseInt(kpiRestored.getText().trim());
                    boolean needsReview = Integer.parseInt(kpiNeedsReview.getText().trim()) > 0
                            || Integer.parseInt(kpiFailed.getText().trim()) > 0;
                    long bytes = restoreTask.getBytesProcessed() > 0 ? restoreTask.getBytesProcessed() : (extractionService != null ? extractionService.getProcessedBytes() : 0L);
                    if (bytes > 0) updateRestoredBytes(bytes);
                    restoreTasks.recordCompletion(restored, bytes, needsReview);
                    operationStateLabel.setText(needsReview ? "Restoration Finished — Review Needed" : "Restoration Complete");
                    currentFileLabel.setText("Check the output and report before moving your originals.");
                    showRestoreCompletionPopup(shutdownRequested, needsReview);
                    isRunning = false;
                    isPaused = false;
                    activeRestoreTask = null;
                    updateButtonStates();
                    powerManager.stopKeepAwake();

                    if (shutdownRequested) {
                        try {
                            Process shutdown = powerManager.runShutdownCommand(60);
                            appendLog("WARN", "Restoration finished. A system shutdown was requested; timing depends on your operating system.");
                            shutdown.onExit().thenAccept(process -> {
                                if (process.exitValue() != 0) Platform.runLater(() -> {
                                    appendLog("ERROR", "The operating system did not accept the shutdown request.");
                                    showErrorAlert("Shutdown Not Scheduled", "The operating system did not accept the shutdown request. You can shut down manually.");
                                });
                            });
                        } catch (Exception error) {
                            appendLog("ERROR", "Could not request system shutdown: " + error.getMessage());
                            showErrorAlert("Shutdown Not Scheduled", "Could not request system shutdown. You can shut down manually.");
                        }
                    }
                });
            } else if (newState == BackgroundTask.TaskState.FAILED) {
                Platform.runLater(() -> {
                    stopTelemetryTimeline();
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
                    stopTelemetryTimeline();
                    isRunning = false;
                    isPaused = false;
                    activeRestoreTask = null;
                    updateButtonStates();
                    powerManager.stopKeepAwake();
                    appendLog("WARN", zipOutput ? "Restoration cancelled. ZIP output may be incomplete; check it and keep your originals." : "Restoration cancelled by user.");
                    operationStateLabel.setText("Restoration cancelled.");
                    currentFileLabel.setText(zipOutput ? "ZIP output may be incomplete. Keep your originals." : "Operation stopped. Check partial output and keep your originals.");
                });
            } else if (newState == BackgroundTask.TaskState.PAUSED) {
                Platform.runLater(() -> {
                    if (telemetryTimeline != null) telemetryTimeline.pause();
                    isPaused = true;
                    updateButtonStates();
                    operationStateLabel.setText("Restoration paused.");
                    appendLog("WARN", "Restoration paused.");
                });
            } else if (newState == BackgroundTask.TaskState.PROCESSING && isPaused) {
                Platform.runLater(() -> {
                    if (telemetryTimeline != null) telemetryTimeline.play();
                    isPaused = false;
                    updateButtonStates();
                    operationStateLabel.setText("Restoring metadata...");
                    appendLog("INFO", "Restoration resumed.");
                });
            }
        });

        TaskManager.getInstance().submitTask(restoreTask);
    }

    private void handlePause() {
        if (!isRunning) return;
        if (activeRestoreTask != null) {
            if (activeRestoreTask.isPaused()) {
                if ((userService == null || !userService.isSignedIn())
                        && (guestQuotaBlocked || GuestQuotaStore.isExhausted())) {
                    TakeoutRestoreTask pausedTask = activeRestoreTask;
                    new FxTrustSignInDialog(stage, userService, () -> {
                        if (userService != null && userService.isSignedIn() && activeRestoreTask == pausedTask) {
                            guestQuotaBlocked = false;
                            pausedTask.resume();
                        }
                    }, true).showAndWait();
                    return;
                }
                guestQuotaBlocked = false;
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
                if (telemetryTimeline != null) telemetryTimeline.pause();
                extractionService.pause();
            } else {
                if (telemetryTimeline != null) telemetryTimeline.play();
                extractionService.resume();
            }
        }
    }

    private void handleCancel() {
        if (!isRunning) return;
        stopTelemetryTimeline();
        if (activeRestoreTask != null) {
            activeRestoreTask.cancel();
        } else if (activeScanTask != null) {
            activeScanTask.cancel();
        } else {
            extractionService.cancel();
        }
        btnPause.setDisable(true);
        btnCancel.setDisable(true);
        appendLog("WARN", "Stopping the operation. Please wait for active files to finish.");
        operationStateLabel.setText("Stopping...");
        currentFileLabel.setText("Waiting for active work to finish.");
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
            public void onUsageCommitted(long files, long bytes) {
                if (userService != null) userService.recordCommittedOutput(files, bytes);
            }

            @Override
            public void onStopped() {
                if (userService != null) {
                    userService.checkpointCommittedUsage();
                    userService.syncIfOnline();
                }
            }

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

            @Override
            public void onGuestLimitReached() {
                Platform.runLater(() -> {
                    if (!isRunning || activeRestoreTask == null || !extractionService.isPaused()) return;
                    TakeoutRestoreTask pausedTask = activeRestoreTask;
                    guestQuotaBlocked = true;
                    stopTelemetryTimeline();
                    isPaused = true;
                    updateButtonStates();
                    operationStateLabel.setText("Guest allowance insufficient for next file");
                    currentFileLabel.setText("Sign in to continue restoring for free.");

                    FxTrustSignInDialog trustDialog = new FxTrustSignInDialog(stage, userService, () -> {
                        if (userService != null && userService.isSignedIn() && activeRestoreTask == pausedTask) {
                            guestQuotaBlocked = false;
                            isPaused = false;
                            updateButtonStates();
                            startTelemetryTimeline();
                            pausedTask.resume();
                        }
                    }, true);
                    trustDialog.showAndWait();
                });
            }
        });
    }

    private void showRestoreCompletionPopup(boolean shutdownRequested, boolean needsReview) {
        Alert alert = new Alert(Alert.AlertType.INFORMATION);
        alert.initOwner(stage);
        alert.setTitle("Restoration Finished");
        alert.setHeaderText(needsReview ? "Restoration Finished — Review Needed" : "Google Takeout Restoration Complete");
        String shutdownNote = shutdownRequested
                ? "\n\nSystem shutdown will be requested. Timing depends on your operating system."
                : "";
        alert.setContentText(String.format(
                "Restoration finished. Check the output and keep your original export.\n\n"
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
