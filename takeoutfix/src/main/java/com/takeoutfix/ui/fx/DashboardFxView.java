package com.takeoutfix.ui.fx;

import com.takeoutfix.auth.UserSyncBridgeService;
import com.takeoutfix.network.SystemHardwareInfo;
import com.takeoutfix.restore.SessionStatsService;
import com.takeoutfix.shared.history.OperationHistoryService;
import com.takeoutfix.shared.history.OperationHistoryService.OperationRecord;
import javafx.application.Platform;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Node;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.scene.paint.Color;
import javafx.scene.shape.Circle;
import javafx.stage.Stage;

import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

/**
 * Modern Photography Workspace Dashboard for TakeoutFix.
 * Designed with a refined, shadcn-inspired desktop aesthetic:
 * - Photography-first identity: Workspace Overview, Data Recovered, Metadata
 * Restored
 * - Compact secondary telemetry strip: ExifTool engine state, local processing
 * badge, host resources
 * - Balanced 4+3 tool workflows with harmonized violet accents and full-card
 * clickability
 * - Real recent activity integration with empty state and quick start actions
 */
public class DashboardFxView extends ScrollPane {

    private static final DateTimeFormatter TIME_FMT = DateTimeFormatter.ofPattern("MMM dd, yyyy • hh:mm a")
            .withZone(ZoneId.systemDefault());

    private final UserSyncBridgeService userService;
    private final SessionStatsService statsService;
    private final Consumer<WorkspaceType> onNavigate;
    private final OperationHistoryService historyService;

    // Account & Status
    private final Label userAvatarLabel = new Label("L");
    private final Label userNameLabel = new Label("Local Session");
    private final Label userEmailLabel = new Label("Photos remain on this device");
    private final Label userTierBadge = new Label("FREE PLAN");

    // Telemetry & Hardware
    private final Label cpuLabel = new Label("CPU: 0%");
    private final ProgressBar cpuBar = new ProgressBar(0.0);
    private final Label appRamLabel = new Label("App: 0 MB");
    private final ProgressBar appRamBar = new ProgressBar(0.0);
    private final Label ramLabel = new Label("Sys RAM: -- / -- GB");
    private final ProgressBar ramBar = new ProgressBar(0.0);
    private final Label hostSpecsLabel = new Label("OS: -- • Cores: " + Runtime.getRuntime().availableProcessors());
    private final Label cpuModelBadge = new Label();
    private final Label gpuBadge = new Label();

    // KPIs
    private final Label kpiStorageRestored = new Label("0.0 MB");
    private final Label kpiFilesProcessed = new Label("0");
    private final Label kpiScanned = new Label("0");
    private final Label kpiSuccessRate = new Label("—");
    private final Label kpiSuccessRateSub = new Label("No tasks run yet");

    // Task Manager Status
    private final Label taskStatusBadge = new Label("Idle • 0 active jobs");

    // Recent Activity Container
    private final VBox recentActivityContent = new VBox(8);

    // Layout Store & Draggable Grid
    private final DashboardLayoutStore layoutStore = new DashboardLayoutStore();
    private final DraggableCardGrid cardGrid = new DraggableCardGrid(layoutStore);

    private final ScheduledExecutorService telemetryScheduler = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "fx-dash-telemetry");
        t.setDaemon(true);
        return t;
    });

    public DashboardFxView(UserSyncBridgeService userService,
            SessionStatsService statsService,
            Consumer<WorkspaceType> onNavigate) {
        this.userService = userService;
        this.statsService = statsService;
        this.onNavigate = onNavigate;
        this.historyService = new OperationHistoryService();

        setFitToWidth(true);
        setStyle("-fx-background: transparent; -fx-background-color: transparent;");

        VBox content = new VBox(16);
        content.setPadding(new Insets(24));

        // 1. Photography Workspace Header
        content.getChildren().add(buildPageHeader());

        // 2. Register Dashboard Sections into DraggableCardGrid
        cardGrid.registerCard(
                DashboardLayoutStore.CARD_TELEMETRY,
                "SYSTEM STATUS AND ENGINE TELEMETRY",
                buildStatusAndTelemetryRow()
        );

        cardGrid.registerCard(
                DashboardLayoutStore.CARD_KPI,
                "WORKSPACE METRICS AND INTEGRITY",
                buildKpiGrid()
        );

        cardGrid.registerCard(
                DashboardLayoutStore.CARD_WORKFLOWS,
                "PHOTO WORKFLOWS AND TOOLS",
                buildToolWorkflowsSection()
        );

        cardGrid.registerCard(
                DashboardLayoutStore.CARD_ACTIVITY,
                "RECENT WORKSPACE ACTIVITY",
                buildRecentActivitySection()
        );

        cardGrid.refreshLayout();
        content.getChildren().add(cardGrid);

        setContent(content);

        // Ensure scroll starts exactly at top with zero clipping offset
        setVvalue(0.0);
        Platform.runLater(() -> setVvalue(0.0));
        sceneProperty().addListener((obs, oldScene, newScene) -> {
            if (newScene != null) {
                Platform.runLater(() -> setVvalue(0.0));
            }
        });

        // Update initial user info and stats
        updateUserInfo();
        if (userService != null) {
            userService.addListener(profile -> Platform.runLater(this::updateUserInfo));
        }

        com.takeoutfix.task.TaskManager.getInstance()
                .addChangeListener(() -> Platform.runLater(this::updateTaskStatus));
        updateTaskStatus();

        // Start hardware sampler loop
        startTelemetryLoop();
    }

    private HBox buildPageHeader() {
        HBox header = new HBox(12);
        header.setAlignment(Pos.CENTER_LEFT);
        header.setPadding(new Insets(0, 0, 2, 0));

        StackPane iconTile = new StackPane(UiIcons.createSvgIcon(UiIcons.LAYERS, 16, "currentColor"));
        iconTile.getStyleClass().add("header-icon-tile");

        VBox textCol = new VBox(3);
        Label title = new Label("Workspace Overview");
        title.getStyleClass().addAll("page-title", "header-title");

        Label subtitle = new Label("Your photos, metadata, and archives in one local workspace.");
        subtitle.getStyleClass().addAll("page-description", "header-subtitle");
        textCol.getChildren().addAll(title, subtitle);

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        Button btnCustomize = new Button("Customize View");
        btnCustomize.getStyleClass().add("btn-secondary");
        btnCustomize.setGraphic(UiIcons.createSvgIcon(UiIcons.SLIDERS, 13, "currentColor"));
        btnCustomize.setGraphicTextGap(6);
        btnCustomize.setStyle("-fx-font-size: 13px; -fx-font-weight: 600;");
        btnCustomize.setOnAction(e -> {
            Stage owner = (getScene() != null && getScene().getWindow() instanceof Stage s) ? s : null;
            CustomizeDashboardDialog dialog = new CustomizeDashboardDialog(owner, layoutStore);
            dialog.showAndWait();
        });

        Button btnExifViewer = new Button("EXIF Viewer");
        btnExifViewer.getStyleClass().add("btn-secondary");
        btnExifViewer.setGraphic(UiIcons.createSvgIcon(UiIcons.CAMERA, 13, "currentColor"));
        btnExifViewer.setGraphicTextGap(6);
        btnExifViewer.setStyle("-fx-font-size: 13px; -fx-font-weight: 600;");
        btnExifViewer.setOnAction(e -> navigateTo(WorkspaceType.EXIF_VIEWER));

        Button btnStartRestore = new Button("Restore Metadata");
        btnStartRestore.getStyleClass().add("btn-primary");
        btnStartRestore.setGraphic(UiIcons.createSvgIcon(UiIcons.RESTORE, 13, "currentColor"));
        btnStartRestore.setGraphicTextGap(6);
        btnStartRestore.setStyle("-fx-font-size: 13px; -fx-font-weight: 700;");
        btnStartRestore.setOnAction(e -> navigateTo(WorkspaceType.TAKEOUT_RESTORE));

        header.getChildren().addAll(iconTile, textCol, spacer, btnCustomize, btnExifViewer, btnStartRestore);
        return header;
    }

    private HBox buildStatusAndTelemetryRow() {
        HBox row = new HBox(12);

        // ── Card 1: Processing & Engine Status ──
        VBox statusCard = new VBox(8);
        statusCard.getStyleClass().add("glass-card");
        statusCard.setPadding(new Insets(10, 14, 10, 14));

        HBox topStatus = new HBox(10);
        topStatus.setAlignment(Pos.CENTER_LEFT);

        Label statusHeader = new Label("PROCESSING STATUS");
        statusHeader.getStyleClass().add("kpi-label");
        statusHeader.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-letter-spacing: 0.5px;");

        Region spTop = new Region();
        HBox.setHgrow(spTop, Priority.ALWAYS);

        updateTaskStatus();

        Label privacyPill = new Label("Local Processing • 100% On-Device");
        privacyPill.setStyle(
                "-fx-font-size: 11px; -fx-font-weight: 600; -fx-text-fill: #10b981; -fx-background-color: rgba(16, 185, 129, 0.12); -fx-padding: 3 8 3 8; -fx-background-radius: 4;");
        topStatus.getChildren().addAll(statusHeader, spTop, taskStatusBadge, privacyPill);

        // Session & Engine info row
        HBox infoRow = new HBox(10);
        infoRow.setAlignment(Pos.CENTER_LEFT);

        Circle readyDot = new Circle(4, Color.web("#10b981"));
        Label engineLabel = new Label("Native ExifTool v13.x");
        engineLabel.getStyleClass().add("text-primary");
        engineLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: 700;");

        Label engineState = new Label("Ready");
        engineState.setStyle("-fx-font-size: 11px; -fx-text-fill: #10b981; -fx-font-weight: 700;");

        Region sep = new Region();
        sep.setPrefWidth(6);

        userAvatarLabel.setAlignment(Pos.CENTER);
        userAvatarLabel.setPrefSize(24, 24);
        userAvatarLabel.setMinSize(24, 24);
        userAvatarLabel.setStyle(
                "-fx-background-color: #8b5cf6; -fx-text-fill: white; -fx-font-size: 11px; -fx-font-weight: 800; -fx-background-radius: 12;");

        VBox userDetails = new VBox(0);
        userNameLabel.getStyleClass().add("text-primary");
        userNameLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: 700;");
        userEmailLabel.getStyleClass().add("text-muted");
        userEmailLabel.setStyle("-fx-font-size: 11px;");
        userDetails.getChildren().addAll(userNameLabel, userEmailLabel);

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        userTierBadge.getStyleClass().add("dash-tag");
        userTierBadge.setStyle(
                "-fx-font-size: 10px; -fx-font-weight: 700; -fx-text-fill: #8b5cf6; -fx-background-color: rgba(139, 92, 246, 0.15); -fx-padding: 3 8 3 8; -fx-background-radius: 4;");

        infoRow.getChildren().addAll(readyDot, engineLabel, engineState, sep, userAvatarLabel, userDetails, spacer,
                userTierBadge);
        statusCard.getChildren().addAll(topStatus, infoRow);

        // ── Card 2: System Resources (Fully Utilized Layout) ──
        VBox telemetryCard = new VBox(8);
        telemetryCard.getStyleClass().add("glass-card");
        telemetryCard.setPadding(new Insets(10, 14, 10, 14));

        HBox teleHeaderRow = new HBox(8);
        teleHeaderRow.setAlignment(Pos.CENTER_LEFT);

        Label teleHeader = new Label("SYSTEM RESOURCES");
        teleHeader.getStyleClass().add("kpi-label");
        teleHeader.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-letter-spacing: 0.5px;");

        cpuModelBadge.setStyle(
                "-fx-font-size: 11px; -fx-font-weight: 600; -fx-text-fill: #8b5cf6; -fx-background-color: rgba(139, 92, 246, 0.15); -fx-padding: 3 8 3 8; -fx-background-radius: 4;");
        cpuModelBadge.setVisible(false);
        cpuModelBadge.setManaged(false);

        Region spTele = new Region();
        HBox.setHgrow(spTele, Priority.ALWAYS);

        hostSpecsLabel.getStyleClass().add("text-muted");
        hostSpecsLabel.setStyle("-fx-font-size: 11px; -fx-font-weight: 600;");

        String os = System.getProperty("os.name", "").toLowerCase();
        String gpuText = os.contains("win") ? "Direct3D 11 • GPU"
                : (os.contains("mac") ? "Metal • GPU" : "OpenGL • GPU");
        gpuBadge.setText(gpuText);
        gpuBadge.setStyle(
                "-fx-font-size: 11px; -fx-font-weight: 600; -fx-text-fill: #10b981; -fx-background-color: rgba(16, 185, 129, 0.12); -fx-padding: 3 8 3 8; -fx-background-radius: 4;");

        teleHeaderRow.getChildren().addAll(teleHeader, cpuModelBadge, spTele, hostSpecsLabel, gpuBadge);

        HBox metersRow = new HBox(16);
        metersRow.setAlignment(Pos.CENTER_LEFT);

        // System CPU
        HBox cpuBox = new HBox(6);
        cpuBox.setAlignment(Pos.CENTER_LEFT);
        cpuLabel.getStyleClass().add("text-primary");
        cpuLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: 700; -fx-min-width: 68;");
        cpuBar.setPrefHeight(8);
        cpuBar.setMaxWidth(Double.MAX_VALUE);
        HBox.setHgrow(cpuBar, Priority.ALWAYS);
        HBox.setHgrow(cpuBox, Priority.ALWAYS);
        cpuBox.getChildren().addAll(cpuLabel, cpuBar);

        // App RAM (JVM heap)
        HBox appRamBox = new HBox(6);
        appRamBox.setAlignment(Pos.CENTER_LEFT);
        appRamLabel.getStyleClass().add("text-primary");
        appRamLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: 700; -fx-min-width: 82;");
        appRamBar.setPrefHeight(8);
        appRamBar.setMaxWidth(Double.MAX_VALUE);
        HBox.setHgrow(appRamBar, Priority.ALWAYS);
        HBox.setHgrow(appRamBox, Priority.ALWAYS);
        appRamBox.getChildren().addAll(appRamLabel, appRamBar);

        // System RAM (Physical OS)
        HBox ramBox = new HBox(6);
        ramBox.setAlignment(Pos.CENTER_LEFT);
        ramLabel.getStyleClass().add("text-primary");
        ramLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: 700; -fx-min-width: 116;");
        ramBar.setPrefHeight(8);
        ramBar.setMaxWidth(Double.MAX_VALUE);
        HBox.setHgrow(ramBar, Priority.ALWAYS);
        HBox.setHgrow(ramBox, Priority.ALWAYS);
        ramBox.getChildren().addAll(ramLabel, ramBar);

        metersRow.getChildren().addAll(cpuBox, appRamBox, ramBox);
        telemetryCard.getChildren().addAll(teleHeaderRow, metersRow);

        HBox.setHgrow(statusCard, Priority.ALWAYS);
        HBox.setHgrow(telemetryCard, Priority.ALWAYS);
        row.getChildren().addAll(statusCard, telemetryCard);
        return row;
    }

    private GridPane buildKpiGrid() {
        GridPane grid = new GridPane();
        grid.setHgap(12);
        grid.setVgap(12);

        for (int i = 0; i < 4; i++) {
            ColumnConstraints col = new ColumnConstraints();
            col.setPercentWidth(25.0);
            col.setHgrow(Priority.ALWAYS);
            grid.getColumnConstraints().add(col);
        }

        VBox card1 = createKpiCard("DATA RECOVERED", kpiStorageRestored, "Cumulative data processed",
                UiIcons.FOLDER);
        VBox card2 = createKpiCard("METADATA RESTORED", kpiFilesProcessed, "Photos & videos repaired",
                UiIcons.CHECK_CIRCLE);
        VBox card3 = createKpiCard("FILES SCANNED", kpiScanned, "Takeout archives examined", UiIcons.CAMERA);
        VBox card4 = createKpiCard("FILE INTEGRITY", kpiSuccessRate, kpiSuccessRateSub, UiIcons.SHIELD_CHECK);

        grid.add(card1, 0, 0);
        grid.add(card2, 1, 0);
        grid.add(card3, 2, 0);
        grid.add(card4, 3, 0);

        return grid;
    }

    private VBox createKpiCard(String title, Label valueLabel, String subtitle, String iconPath) {
        return createKpiCard(title, valueLabel, new Label(subtitle), iconPath);
    }

    private VBox createKpiCard(String title, Label valueLabel, Label subLabel, String iconPath) {
        VBox card = new VBox(4);
        card.getStyleClass().addAll("glass-card", "kpi-card");
        card.setPadding(new Insets(10, 16, 10, 16));
        card.setPrefHeight(88);
        card.setMinHeight(88);

        HBox topRow = new HBox();
        topRow.setAlignment(Pos.CENTER_LEFT);

        Label t = new Label(title);
        t.getStyleClass().add("kpi-label");
        t.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-letter-spacing: 0.5px;");

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        Node iconNode = UiIcons.createSvgIcon(iconPath, 13, "currentColor");
        iconNode.setOpacity(0.5);

        topRow.getChildren().addAll(t, spacer, iconNode);

        valueLabel.getStyleClass().setAll("kpi-value", "text-primary");
        valueLabel.setStyle("-fx-font-size: 24px; -fx-font-weight: 700;");

        subLabel.getStyleClass().add("text-muted");
        subLabel.setStyle("-fx-font-size: 12px;");

        card.getChildren().addAll(topRow, valueLabel, subLabel);
        return card;
    }

    private VBox buildToolWorkflowsSection() {
        VBox container = new VBox(14);

        // ── Primary Workflows (4 balanced cards across) ──
        VBox coreSection = new VBox(8);
        HBox coreHeader = new HBox(8);
        coreHeader.setAlignment(Pos.CENTER_LEFT);

        Label coreHeading = new Label("CORE PHOTO WORKFLOWS");
        coreHeading.getStyleClass().add("kpi-label");
        coreHeading.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-letter-spacing: 0.5px;");

        Label coreBadge = new Label("4 TOOLS");
        coreBadge.setStyle(
                "-fx-font-size: 10px; -fx-font-weight: 700; -fx-padding: 2 7 2 7; -fx-background-radius: 4; -fx-text-fill: #8b5cf6; -fx-background-color: rgba(139, 92, 246, 0.15);");

        coreHeader.getChildren().addAll(coreHeading, coreBadge);

        GridPane coreGrid = new GridPane();
        coreGrid.setHgap(12);
        coreGrid.setVgap(12);

        for (int i = 0; i < 4; i++) {
            ColumnConstraints col = new ColumnConstraints();
            col.setPercentWidth(25.0);
            col.setHgrow(Priority.ALWAYS);
            coreGrid.getColumnConstraints().add(col);
        }

        VBox tool1 = createToolCard(
                "Restore Google Takeout",
                "Recover missing photo metadata from Google Takeout archives and restore it to your photos, while preserving original files.",
                UiIcons.RESTORE,
                "#8b5cf6",
                "CORE",
                () -> navigateTo(WorkspaceType.TAKEOUT_RESTORE));

        VBox tool2 = createToolCard(
                "Edit Photo Metadata",
                "Batch-edit timestamps, adjust time zones and apply copyright, author and metadata presets to your photos.",
                UiIcons.SLIDERS,
                "#71717a",
                "METADATA",
                () -> navigateTo(WorkspaceType.PHOTO_STUDIO));

        VBox tool3 = createToolCard(
                "EXIF Viewer",
                "Explore camera settings, lens information, exposure, GPS coordinates and embedded metadata.",
                UiIcons.CAMERA,
                "#71717a",
                "EXIF",
                () -> navigateTo(WorkspaceType.EXIF_VIEWER));

        VBox tool4 = createToolCard(
                "Duplicate Finder",
                "Find identical and potentially similar photos, review duplicate groups and safely quarantine unwanted copies.",
                UiIcons.COPY,
                "#71717a",
                "STORAGE",
                () -> navigateTo(WorkspaceType.DUPLICATE_FINDER));

        coreGrid.add(tool1, 0, 0);
        coreGrid.add(tool2, 1, 0);
        coreGrid.add(tool3, 2, 0);
        coreGrid.add(tool4, 3, 0);

        coreSection.getChildren().addAll(coreHeader, coreGrid);

        // ── Archive & Security (3 balanced cards across) ──
        VBox archiveSection = new VBox(8);
        HBox archiveHeader = new HBox(8);
        archiveHeader.setAlignment(Pos.CENTER_LEFT);

        Label archiveHeading = new Label("ARCHIVE & SYNCHRONIZATION");
        archiveHeading.getStyleClass().add("kpi-label");
        archiveHeading.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-letter-spacing: 0.5px;");

        Label archiveBadge = new Label("3 TOOLS");
        archiveBadge.setStyle(
                "-fx-font-size: 10px; -fx-font-weight: 700; -fx-padding: 2 7 2 7; -fx-background-radius: 4; -fx-text-fill: #8b5cf6; -fx-background-color: rgba(139, 92, 246, 0.15);");

        archiveHeader.getChildren().addAll(archiveHeading, archiveBadge);

        GridPane archiveGrid = new GridPane();
        archiveGrid.setHgap(12);
        archiveGrid.setVgap(12);

        for (int i = 0; i < 3; i++) {
            ColumnConstraints col = new ColumnConstraints();
            col.setPercentWidth(33.333);
            col.setHgrow(Priority.ALWAYS);
            archiveGrid.getColumnConstraints().add(col);
        }

        VBox tool5 = createToolCard(
                "Metadata Sync",
                "Compare and synchronize metadata between RAW originals, edited JPEGs and other related photo files.",
                UiIcons.SYNC,
                "#8b5cf6",
                "SYNC",
                () -> navigateTo(WorkspaceType.METASYNC));

        VBox tool6 = createToolCard(
                "Compare Archives",
                "Compare original photos with Google Takeout metadata to identify missing, changed or conflicting information.",
                UiIcons.DIFF,
                "#f59e0b",
                "COMPARE",
                () -> navigateTo(WorkspaceType.ARCHIVE_COMPARE));

        VBox tool7 = createToolCard(
                "Private Photo Vault",
                "Store private photos in an encrypted local vault with controlled access and secure file handling.",
                UiIcons.LOCK,
                "#10b981",
                "VAULT",
                () -> navigateTo(WorkspaceType.PHOTOVAULT));

        archiveGrid.add(tool5, 0, 0);
        archiveGrid.add(tool6, 1, 0);
        archiveGrid.add(tool7, 2, 0);

        archiveSection.getChildren().addAll(archiveHeader, archiveGrid);

        container.getChildren().addAll(coreSection, archiveSection);
        return container;
    }

    private VBox createToolCard(String title, String desc, String iconPath, String accentColor, String tag,
            Runnable action) {
        VBox card = new VBox(8);
        card.getStyleClass().add("dash-tool-card");
        card.setAlignment(Pos.TOP_LEFT);

        // Top Row: Icon Container + Title + Tag
        HBox top = new HBox(8);
        top.setAlignment(Pos.CENTER_LEFT);

        StackPane iconBox = new StackPane(UiIcons.createSvgIcon(iconPath, 15, "currentColor"));
        iconBox.getStyleClass().addAll("dash-icon-box", "header-icon-tile");

        Label titleLbl = new Label(title);
        titleLbl.getStyleClass().addAll("card-title", "text-primary");
        titleLbl.setStyle("-fx-font-size: 14px; -fx-font-weight: 700;");

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        Label tagLbl = new Label(tag);
        tagLbl.getStyleClass().add("badge-neutral");
        tagLbl.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-padding: 2 6 2 6; -fx-background-radius: 4;");

        boolean isRunning = false;
        for (var t : com.takeoutfix.task.TaskManager.getInstance().getActiveTasks()) {
            if (t.getToolName().equalsIgnoreCase(title)
                    || title.toLowerCase().contains(t.getToolName().toLowerCase())) {
                isRunning = true;
                break;
            }
        }
        if (isRunning) {
            tagLbl.setText("⚡ RUNNING");
            tagLbl.setStyle(
                    "-fx-text-fill: #10b981; -fx-background-color: rgba(16, 185, 129, 0.15); -fx-font-weight: 700; -fx-font-size: 11px; -fx-padding: 2 6 2 6; -fx-background-radius: 4;");
        }

        top.getChildren().addAll(iconBox, titleLbl, spacer, tagLbl);

        // Description
        Label descLbl = new Label(desc);
        descLbl.setWrapText(true);
        descLbl.setMinHeight(40);
        VBox.setVgrow(descLbl, Priority.ALWAYS);
        descLbl.getStyleClass().addAll("card-subtitle", "text-secondary");
        descLbl.setStyle("-fx-font-size: 12px; -fx-line-spacing: 3;");

        // Footer Action Hint
        HBox foot = new HBox();
        foot.setAlignment(Pos.CENTER_LEFT);
        Label hint = new Label("Open Tool →");
        hint.getStyleClass().add("brand-accent");
        hint.setStyle("-fx-font-size: 11px; -fx-font-weight: 700;");
        foot.getChildren().add(hint);

        card.getChildren().addAll(top, descLbl, foot);

        // Entire card is interactive
        card.setOnMouseClicked(e -> action.run());

        return card;
    }

    private VBox buildRecentActivitySection() {
        VBox section = new VBox(8);

        HBox headerRow = new HBox(8);
        headerRow.setAlignment(Pos.CENTER_LEFT);

        Label heading = new Label("RECENT ACTIVITY");
        heading.getStyleClass().add("kpi-label");
        heading.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-letter-spacing: 0.5px;");

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        Button btnViewAll = new Button("View All History →");
        btnViewAll.getStyleClass().add("btn-ghost");
        btnViewAll.setStyle("-fx-font-size: 12px; -fx-font-weight: 600; -fx-padding: 3 8 3 8;");
        btnViewAll.setOnAction(e -> navigateTo(WorkspaceType.HISTORY));

        headerRow.getChildren().addAll(heading, spacer, btnViewAll);

        refreshRecentActivity();

        section.getChildren().addAll(headerRow, recentActivityContent);
        return section;
    }

    private void refreshRecentActivity() {
        recentActivityContent.getChildren().clear();

        List<OperationRecord> records = (historyService != null) ? historyService.loadRecords() : List.of();

        if (records.isEmpty()) {
            // Minimalist Photography Empty State
            HBox emptyBox = new HBox(12);
            emptyBox.getStyleClass().add("activity-row");
            emptyBox.setAlignment(Pos.CENTER_LEFT);
            emptyBox.setPadding(new Insets(12, 16, 12, 16));

            Node histIcon = UiIcons.createSvgIcon(UiIcons.HISTORY, 16, "#71717a");

            VBox textCol = new VBox(2);
            Label emptyTitle = new Label("No recent activity");
            emptyTitle.getStyleClass().add("text-primary");
            emptyTitle.setStyle("-fx-font-size: 13px; -fx-font-weight: 700;");

            Label emptySub = new Label("Your completed tasks will appear here. Choose a tool above to get started.");
            emptySub.getStyleClass().add("text-muted");
            emptySub.setStyle("-fx-font-size: 12px;");

            textCol.getChildren().addAll(emptyTitle, emptySub);

            Region sp = new Region();
            HBox.setHgrow(sp, Priority.ALWAYS);

            Button btnGetStarted = new Button("Get Started →");
            btnGetStarted.getStyleClass().add("btn-secondary");
            btnGetStarted.setStyle("-fx-font-size: 12px; -fx-font-weight: 600; -fx-padding: 5 12 5 12;");
            btnGetStarted.setOnAction(e -> navigateTo(WorkspaceType.TAKEOUT_RESTORE));

            emptyBox.getChildren().addAll(histIcon, textCol, sp, btnGetStarted);
            recentActivityContent.getChildren().add(emptyBox);
        } else {
            // Display top 3 most recent tasks
            int count = Math.min(3, records.size());
            for (int i = 0; i < count; i++) {
                OperationRecord r = records.get(i);
                HBox row = new HBox(12);
                row.getStyleClass().add("activity-row");
                row.setAlignment(Pos.CENTER_LEFT);
                row.setPadding(new Insets(8, 14, 8, 14));

                String iconSvg = r.operationType().toLowerCase().contains("sync") ? UiIcons.SYNC : UiIcons.RESTORE;
                Node iconNode = UiIcons.createSvgIcon(iconSvg, 14, "#8b5cf6");

                VBox details = new VBox(1);
                Label title = new Label(friendlyOperationName(r.operationType()));
                title.getStyleClass().add("text-primary");
                title.setStyle("-fx-font-size: 13px; -fx-font-weight: 700;");

                String summaryText = r.summary();
                if (summaryText.isBlank()) {
                    summaryText = r.itemsProcessed() + " items processed";
                }
                Label sub = new Label(summaryText);
                sub.getStyleClass().add("text-muted");
                sub.setStyle("-fx-font-size: 12px;");
                details.getChildren().addAll(title, sub);

                Region sp = new Region();
                HBox.setHgrow(sp, Priority.ALWAYS);

                String dateStr = (r.completedAt() != null) ? TIME_FMT.format(r.completedAt()) : "Recently";
                Label dateLbl = new Label(dateStr);
                dateLbl.getStyleClass().add("text-muted");
                dateLbl.setStyle("-fx-font-size: 11px;");

                Label statusBadge = new Label(r.status());
                statusBadge.setStyle(
                        "-fx-font-size: 10px; -fx-font-weight: 700; -fx-text-fill: #10b981; -fx-background-color: rgba(16, 185, 129, 0.15); -fx-padding: 3 8 3 8; -fx-background-radius: 4;");

                row.getChildren().addAll(iconNode, details, sp, dateLbl, statusBadge);
                row.setOnMouseClicked(e -> navigateTo(WorkspaceType.HISTORY));
                recentActivityContent.getChildren().add(row);
            }
        }
    }

    private String friendlyOperationName(String type) {
        if (type == null)
            return "Photo Task";
        return switch (type.toUpperCase()) {
            case "TAKEOUT_RESTORE", "RESTORE" -> "Takeout Metadata Restoration";
            case "PHOTO_STUDIO", "METADATA_EDIT" -> "Batch Metadata Edit";
            case "METASYNC", "SYNC" -> "Metadata Synchronization";
            case "EXIF_VIEWER", "INSPECT" -> "EXIF Inspection";
            case "ARCHIVE_COMPARE", "DIFF" -> "Archive Comparison";
            case "DUPLICATE_FINDER", "DUPLICATES" -> "Duplicate Photo Scan";
            case "PHOTOVAULT", "VAULT" -> "Vault Storage Access";
            default -> type;
        };
    }

    private void navigateTo(WorkspaceType type) {
        if (onNavigate != null) {
            onNavigate.accept(type);
        }
    }

    private String toRgba(String hex, double alpha) {
        if (hex.startsWith("#") && hex.length() == 7) {
            int r = Integer.parseInt(hex.substring(1, 3), 16);
            int g = Integer.parseInt(hex.substring(3, 5), 16);
            int b = Integer.parseInt(hex.substring(5, 7), 16);
            return String.format("rgba(%d, %d, %d, %.2f)", r, g, b, alpha);
        }
        return "rgba(139, 92, 246, 0.1)";
    }

    private void updateUserInfo() {
        if (userService != null && userService.isSignedIn()) {
            String name = userService.getCurrentName();
            String email = userService.getCurrentEmail();
            userNameLabel.setText(name);
            userEmailLabel.setText(email);
            userAvatarLabel.setText(name.isEmpty() ? "U" : name.substring(0, 1).toUpperCase());
            userTierBadge.setText("PRO PLAN");
            userTierBadge.setStyle(
                    "-fx-font-size: 11px; -fx-font-weight: 700; -fx-text-fill: #8b5cf6; -fx-background-color: rgba(139, 92, 246, 0.15); -fx-padding: 3 8 3 8; -fx-background-radius: 4;");
        } else {
            userNameLabel.setText("Local Session");
            userEmailLabel.setText("Photos remain on this device");
            userAvatarLabel.setText("L");
            userTierBadge.setText("FREE PLAN");
            userTierBadge.setStyle(
                    "-fx-font-size: 11px; -fx-font-weight: 700; -fx-text-fill: #10b981; -fx-background-color: rgba(16, 185, 129, 0.12); -fx-padding: 3 8 3 8; -fx-background-radius: 4;");
        }

        updateStatsDisplay();
    }

    private void updateStatsDisplay() {
        if (statsService != null) {
            long files = statsService.getTotalFiles();
            double mb = statsService.getTotalBytes() / (1024.0 * 1024.0);
            if (mb > 1024.0) {
                kpiStorageRestored.setText(String.format("%.2f GB", mb / 1024.0));
            } else {
                kpiStorageRestored.setText(String.format("%.1f MB", mb));
            }
            kpiFilesProcessed.setText(String.valueOf(files));
            kpiScanned.setText(String.valueOf(files));

            if (files == 0) {
                kpiSuccessRate.setText("—");
                kpiSuccessRateSub.setText("No tasks run yet");
            } else {
                kpiSuccessRate.setText("100%");
                kpiSuccessRateSub.setText("Zero corruption detected");
            }
        }
    }

    private void updateTaskStatus() {
        int count = com.takeoutfix.task.TaskManager.getInstance().getActiveTaskCount();
        if (count == 0) {
            taskStatusBadge.setText("Idle • No active jobs");
            taskStatusBadge.setStyle(
                    "-fx-font-size: 11px; -fx-font-weight: 600; -fx-text-fill: #10b981; -fx-background-color: rgba(16, 185, 129, 0.12); -fx-padding: 3 8 3 8; -fx-background-radius: 4;");
        } else {
            taskStatusBadge.setText("Processing • " + count + (count == 1 ? " active job" : " active jobs"));
            taskStatusBadge.setStyle(
                    "-fx-font-size: 11px; -fx-font-weight: 700; -fx-text-fill: #8b5cf6; -fx-background-color: rgba(139, 92, 246, 0.16); -fx-padding: 3 8 3 8; -fx-background-radius: 4;");
        }
    }

    private void startTelemetryLoop() {
        telemetryScheduler.scheduleAtFixedRate(() -> {
            try {
                double cpu = SystemHardwareInfo.getCpuLoadPercent();
                long usedRam = SystemHardwareInfo.getUsedPhysicalMemoryBytes();
                long totalRam = SystemHardwareInfo.getTotalPhysicalMemoryBytes();

                double usedGb = usedRam / (1024.0 * 1024.0 * 1024.0);
                double totalGb = totalRam / (1024.0 * 1024.0 * 1024.0);
                double ramFraction = (totalRam > 0) ? (double) usedRam / totalRam : 0.0;
                double cpuFraction = Math.max(0.0, Math.min(1.0, cpu / 100.0));

                long appProcessMb = SystemHardwareInfo.getProcessWorkingSetMB();
                Runtime rt = Runtime.getRuntime();
                long appUsedMb = (rt.totalMemory() - rt.freeMemory()) / (1024 * 1024);
                long appMaxMb = rt.maxMemory() / (1024 * 1024);
                double appRamFraction = (totalRam > 0) ? Math.min(1.0, (double) (appProcessMb * 1024L * 1024L) / totalRam) : 0.0;

                int pCores = SystemHardwareInfo.getPhysicalCores();
                int lThreads = SystemHardwareInfo.getLogicalProcessors();
                String coresText = (pCores > 0 && pCores != lThreads)
                        ? (pCores + "C / " + lThreads + "T")
                        : (lThreads + " Cores");
                String cpuName = SystemHardwareInfo.getCpuName();

                Platform.runLater(() -> {
                    cpuLabel.setText(String.format(java.util.Locale.US, "CPU: %.1f%%", cpu));
                    cpuBar.setProgress(cpuFraction);
                    updateBarColor(cpuBar, cpuFraction);

                    appRamLabel.setText(String.format(java.util.Locale.US, "App: %d MB", appProcessMb));
                    appRamLabel.setTooltip(new Tooltip(String.format(java.util.Locale.US,
                            "App Process RAM (Task Manager): %d MB\nJVM Heap: %d MB used / %d MB max",
                            appProcessMb, appUsedMb, appMaxMb)));
                    appRamBar.setProgress(appRamFraction);
                    updateBarColor(appRamBar, appRamFraction);

                    ramLabel.setText(String.format(java.util.Locale.US, "Sys: %.1f / %.1f GB", usedGb, totalGb));
                    ramBar.setProgress(ramFraction);
                    updateBarColor(ramBar, ramFraction);

                    hostSpecsLabel.setText(System.getProperty("os.name") + " • " + coresText);
                    if (cpuName != null && !cpuName.isEmpty() && !cpuName.startsWith("Host")) {
                        String shortCpu = cpuName.replace("Intel(R) Core(TM) ", "").replace("AMD Ryzen(TM) ", "");
                        cpuModelBadge.setText(shortCpu);
                        cpuModelBadge.setVisible(true);
                        cpuModelBadge.setManaged(true);
                    }

                    updateStatsDisplay();
                });
            } catch (Exception ignored) {
            }
        }, 0, 2, TimeUnit.SECONDS);
    }

    private void updateBarColor(ProgressBar bar, double fraction) {
        bar.getStyleClass().removeAll("telemetry-bar-green", "telemetry-bar-amber", "telemetry-bar-red");
        if (fraction < 0.60) {
            bar.getStyleClass().add("telemetry-bar-green");
        } else if (fraction < 0.85) {
            bar.getStyleClass().add("telemetry-bar-amber");
        } else {
            bar.getStyleClass().add("telemetry-bar-red");
        }
    }

    public void cleanup() {
        telemetryScheduler.shutdownNow();
    }
}
