package com.takeoutfix.task;

import com.takeoutfix.network.SystemHardwareInfo;
import com.takeoutfix.shared.theme.AppTheme;
import com.takeoutfix.shared.theme.ThemeColors;
import com.takeoutfix.shared.theme.ThemeManager;
import com.takeoutfix.ui.fx.WorkspaceType;
import javafx.animation.Animation;
import javafx.animation.KeyFrame;
import javafx.animation.Timeline;
import javafx.application.Platform;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.ProgressBar;
import javafx.scene.control.ScrollPane;
import javafx.scene.control.Tooltip;
import javafx.scene.layout.*;
import javafx.scene.shape.Circle;
import javafx.util.Duration;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.function.Consumer;

/**
 * Persistent footer and background task monitor attached to the bottom of the application shell.
 * Features:
 * - Full light / dark / forest / intellij theme adaptation matching the application theme.
 * - High-contrast, crystal-clear typography for readability across any display.
 * - Compact persistent status bar (privacy indicator, live active tasks count, CPU and memory telemetry).
 * - Expandable drawer displaying active task progress cards, pause/resume/cancel controls, and throughput metrics.
 */
public class PersistentTaskFooter extends VBox {

    private final TaskManager taskManager;
    private final Consumer<WorkspaceType> workspaceNavigator;

    private boolean isExpanded = false;
    private boolean isDark = false;

    // Collapsed bar components
    private final HBox collapsedBar = new HBox(12);
    private final Circle greenDot = new Circle(4);
    private final Label privacyPill = new Label("Processed locally · No uploads");
    private final Label dotSeparator = new Label("·");
    private final Label taskCountBadge = new Label("Idle · Ready");
    private final Label telemetryLabel = new Label("CPU 0% · App RAM 0 MB · Sys RAM 0.0 / 0.0 GB");
    private final Button toggleExpandBtn = new Button("▲ Tasks (0)");

    // Expanded drawer components
    private final VBox expandedDrawer = new VBox(12);
    private final VBox taskCardsContainer = new VBox(8);
    private final Label expandedHeaderLabel = new Label("Background Tasks");
    private final Label expandedSubLabel = new Label("0 active");
    private final Button btnViewAll = new Button("View all in History →");
    private final Button btnCloseDrawer = new Button("✕");

    private final Label appCpuMetric = new Label("0%");
    private final Label appMemMetric = new Label("0 MB");
    private final Label sysMemMetric = new Label("0.0 / 0.0 GB");
    private final Label throughputMetric = new Label("0 MB/s");
    private final List<Label> metricTitleLabels = new ArrayList<>();

    private Timeline telemetryTimeline;

    public PersistentTaskFooter(TaskManager taskManager, Consumer<WorkspaceType> workspaceNavigator) {
        this.taskManager = taskManager;
        this.workspaceNavigator = workspaceNavigator;

        getStyleClass().add("task-footer");

        buildExpandedDrawer();
        buildCollapsedBar();

        getChildren().addAll(expandedDrawer, collapsedBar);

        // Apply initial theme from ThemeManager
        applyThemeStyles();

        // Register dynamic theme listener
        ThemeManager.addListener(theme -> Platform.runLater(this::applyThemeStyles));

        // Task changes update counts & cards
        taskManager.addChangeListener(this::refreshUi);
        refreshUi();

        // Refresh telemetry every 1.5 seconds
        updateTelemetry();
        telemetryTimeline = new Timeline(new KeyFrame(Duration.seconds(1.5), e -> updateTelemetry()));
        telemetryTimeline.setCycleCount(Animation.INDEFINITE);
        telemetryTimeline.play();
    }

    /**
     * Dynamically switches the footer styling between Light and Dark mode.
     */
    public void setTheme(boolean dark) {
        this.isDark = dark;
        applyThemeStyles();
        refreshUi();
    }

    public boolean isDark() {
        return isDark;
    }

    private void applyThemeStyles() {
        AppTheme current = ThemeManager.getCurrentTheme();
        this.isDark = (current != null) ? current.isDark() : ThemeColors.isDark();

        if (current == AppTheme.CATPPUCCIN_FOREST) {
            setStyle("-fx-background-color: #131B17; -fx-border-color: #24352D transparent transparent transparent; -fx-border-width: 1;");

            greenDot.setFill(javafx.scene.paint.Color.web("#4EBA87"));
            taskCountBadge.setStyle("-fx-font-size: 12px; -fx-font-weight: 500; -fx-text-fill: #EAF2ED;");
            telemetryLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: 500; -fx-text-fill: #7C9489;");
            toggleExpandBtn.setStyle("-fx-font-size: 12px; -fx-font-weight: 600; -fx-background-color: transparent; -fx-text-fill: #EAF2ED; -fx-cursor: hand;");

            expandedDrawer.setStyle("-fx-background-color: #1E2B25; -fx-border-color: #2A3C33 transparent transparent transparent; -fx-border-width: 1;");
            expandedHeaderLabel.setStyle("-fx-font-size: 14px; -fx-font-weight: 600; -fx-text-fill: #FFFFFF;");
            btnViewAll.setStyle("-fx-font-size: 12px; -fx-font-weight: 600; -fx-background-color: transparent; -fx-text-fill: #4EBA87; -fx-cursor: hand;");
            btnCloseDrawer.setStyle("-fx-font-size: 12px; -fx-font-weight: 600; -fx-background-color: transparent; -fx-text-fill: #7C9489; -fx-cursor: hand;");

            appCpuMetric.setStyle("-fx-font-size: 12.5px; -fx-font-weight: 700; -fx-text-fill: #EAF2ED;");
            appMemMetric.setStyle("-fx-font-size: 12.5px; -fx-font-weight: 700; -fx-text-fill: #EAF2ED;");
            sysMemMetric.setStyle("-fx-font-size: 12.5px; -fx-font-weight: 700; -fx-text-fill: #EAF2ED;");
            throughputMetric.setStyle("-fx-font-size: 12.5px; -fx-font-weight: 700; -fx-text-fill: #EAF2ED;");
            for (Label lbl : metricTitleLabels) {
                lbl.setStyle("-fx-font-size: 12px; -fx-text-fill: #7C9489;");
            }
        } else if (current == AppTheme.INTELLIJ_DARK) {
            setStyle("-fx-background-color: #1E1F22; -fx-border-color: #2B2D30 transparent transparent transparent; -fx-border-width: 1;");

            greenDot.setFill(javafx.scene.paint.Color.web("#59A869"));
            taskCountBadge.setStyle("-fx-font-size: 12px; -fx-font-weight: 500; -fx-text-fill: #DFE1E5;");
            telemetryLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: 500; -fx-text-fill: #868A91;");
            toggleExpandBtn.setStyle("-fx-font-size: 12px; -fx-font-weight: 600; -fx-background-color: transparent; -fx-text-fill: #DFE1E5; -fx-cursor: hand;");

            expandedDrawer.setStyle("-fx-background-color: #2B2D30; -fx-border-color: #393B40 transparent transparent transparent; -fx-border-width: 1;");
            expandedHeaderLabel.setStyle("-fx-font-size: 14px; -fx-font-weight: 600; -fx-text-fill: #DFE1E5;");
            btnViewAll.setStyle("-fx-font-size: 12px; -fx-font-weight: 600; -fx-background-color: transparent; -fx-text-fill: #3574F0; -fx-cursor: hand;");
            btnCloseDrawer.setStyle("-fx-font-size: 12px; -fx-font-weight: 600; -fx-background-color: transparent; -fx-text-fill: #868A91; -fx-cursor: hand;");

            appCpuMetric.setStyle("-fx-font-size: 12.5px; -fx-font-weight: 700; -fx-text-fill: #DFE1E5;");
            appMemMetric.setStyle("-fx-font-size: 12.5px; -fx-font-weight: 700; -fx-text-fill: #DFE1E5;");
            sysMemMetric.setStyle("-fx-font-size: 12.5px; -fx-font-weight: 700; -fx-text-fill: #DFE1E5;");
            throughputMetric.setStyle("-fx-font-size: 12.5px; -fx-font-weight: 700; -fx-text-fill: #DFE1E5;");
            for (Label lbl : metricTitleLabels) {
                lbl.setStyle("-fx-font-size: 12px; -fx-text-fill: #868A91;");
            }
        } else if (isDark) {
            setStyle("-fx-background-color: #21222C; -fx-border-color: #44475A transparent transparent transparent; -fx-border-width: 1;");

            greenDot.setFill(javafx.scene.paint.Color.web("#50FA7B"));
            taskCountBadge.setStyle("-fx-font-size: 12px; -fx-font-weight: 500; -fx-text-fill: #F8F8F2;");
            telemetryLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: 500; -fx-text-fill: #9294A3;");
            toggleExpandBtn.setStyle("-fx-font-size: 12px; -fx-font-weight: 600; -fx-background-color: transparent; -fx-text-fill: #F8F8F2; -fx-cursor: hand;");

            expandedDrawer.setStyle("-fx-background-color: #343746; -fx-border-color: #44475A transparent transparent transparent; -fx-border-width: 1;");
            expandedHeaderLabel.setStyle("-fx-font-size: 14px; -fx-font-weight: 600; -fx-text-fill: #F8F8F2;");
            btnViewAll.setStyle("-fx-font-size: 12px; -fx-font-weight: 600; -fx-background-color: transparent; -fx-text-fill: #BD93F9; -fx-cursor: hand;");
            btnCloseDrawer.setStyle("-fx-font-size: 12px; -fx-font-weight: 600; -fx-background-color: transparent; -fx-text-fill: #9294A3; -fx-cursor: hand;");

            appCpuMetric.setStyle("-fx-font-size: 12.5px; -fx-font-weight: 700; -fx-text-fill: #F8F8F2;");
            appMemMetric.setStyle("-fx-font-size: 12.5px; -fx-font-weight: 700; -fx-text-fill: #F8F8F2;");
            sysMemMetric.setStyle("-fx-font-size: 12.5px; -fx-font-weight: 700; -fx-text-fill: #F8F8F2;");
            throughputMetric.setStyle("-fx-font-size: 12.5px; -fx-font-weight: 700; -fx-text-fill: #F8F8F2;");
            for (Label lbl : metricTitleLabels) {
                lbl.setStyle("-fx-font-size: 12px; -fx-text-fill: #9294A3;");
            }
        } else {
            setStyle("-fx-background-color: #EDEDF5; -fx-border-color: #D9DAE6 transparent transparent transparent; -fx-border-width: 1;");

            greenDot.setFill(javafx.scene.paint.Color.web("#2E7D32"));
            taskCountBadge.setStyle("-fx-font-size: 12px; -fx-font-weight: 500; -fx-text-fill: #1F2335;");
            telemetryLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: 500; -fx-text-fill: #5F6585;");
            toggleExpandBtn.setStyle("-fx-font-size: 12px; -fx-font-weight: 600; -fx-background-color: transparent; -fx-text-fill: #1F2335; -fx-cursor: hand;");

            expandedDrawer.setStyle("-fx-background-color: #FFFFFF; -fx-border-color: #D9DAE6 transparent transparent transparent; -fx-border-width: 1;");
            expandedHeaderLabel.setStyle("-fx-font-size: 14px; -fx-font-weight: 700; -fx-text-fill: #1F2335;");
            btnViewAll.setStyle("-fx-font-size: 12px; -fx-font-weight: 600; -fx-background-color: transparent; -fx-text-fill: #6D28D9; -fx-cursor: hand;");
            btnCloseDrawer.setStyle("-fx-font-size: 12px; -fx-font-weight: 600; -fx-background-color: transparent; -fx-text-fill: #5F6585; -fx-cursor: hand;");

            appCpuMetric.setStyle("-fx-font-size: 12.5px; -fx-font-weight: 700; -fx-text-fill: #1F2335;");
            appMemMetric.setStyle("-fx-font-size: 12.5px; -fx-font-weight: 700; -fx-text-fill: #1F2335;");
            sysMemMetric.setStyle("-fx-font-size: 12.5px; -fx-font-weight: 700; -fx-text-fill: #1F2335;");
            throughputMetric.setStyle("-fx-font-size: 12.5px; -fx-font-weight: 700; -fx-text-fill: #1F2335;");
            for (Label lbl : metricTitleLabels) {
                lbl.setStyle("-fx-font-size: 12px; -fx-font-weight: 600; -fx-text-fill: #5F6585;");
            }
        }
    }

    private void buildCollapsedBar() {
        collapsedBar.setAlignment(Pos.CENTER_LEFT);
        collapsedBar.setPadding(new Insets(6, 18, 6, 18));
        collapsedBar.setPrefHeight(34);

        HBox statusBox = new HBox(6, greenDot, taskCountBadge);
        statusBox.setAlignment(Pos.CENTER_LEFT);

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        // Expand Toggle button
        toggleExpandBtn.setOnAction(e -> toggleExpanded());

        collapsedBar.getChildren().addAll(statusBox, spacer, telemetryLabel, toggleExpandBtn);
    }

    private void buildExpandedDrawer() {
        expandedDrawer.setManaged(false);
        expandedDrawer.setVisible(false);
        expandedDrawer.setPadding(new Insets(14, 18, 12, 18));
        expandedDrawer.setPrefHeight(230);
        expandedDrawer.setMaxHeight(320);

        // Top Header of Drawer
        HBox drawerHeader = new HBox(12);
        drawerHeader.setAlignment(Pos.CENTER_LEFT);

        btnViewAll.setOnAction(e -> {
            toggleExpanded();
            if (workspaceNavigator != null) {
                workspaceNavigator.accept(WorkspaceType.HISTORY);
            }
        });

        btnCloseDrawer.setOnAction(e -> toggleExpanded());

        Region sp1 = new Region();
        HBox.setHgrow(sp1, Priority.ALWAYS);

        drawerHeader.getChildren().addAll(expandedHeaderLabel, expandedSubLabel, sp1, btnViewAll, btnCloseDrawer);

        // Center: Scrollable Task Cards
        ScrollPane scrollPane = new ScrollPane(taskCardsContainer);
        scrollPane.setFitToWidth(true);
        scrollPane.setStyle("-fx-background-color: transparent; -fx-background: transparent; -fx-border-color: transparent;");
        VBox.setVgrow(scrollPane, Priority.ALWAYS);

        // Bottom Telemetry Summary Row
        HBox metricsRow = new HBox(20);
        metricsRow.setAlignment(Pos.CENTER_LEFT);
        metricsRow.setPadding(new Insets(8, 4, 0, 4));

        metricsRow.getChildren().addAll(
                buildMetricItem("App CPU", appCpuMetric),
                buildMetricItem("App RAM", appMemMetric),
                buildMetricItem("System RAM", sysMemMetric),
                buildMetricItem("Throughput", throughputMetric)
        );

        expandedDrawer.getChildren().addAll(drawerHeader, scrollPane, metricsRow);
    }

    private HBox buildMetricItem(String label, Label valueLabel) {
        HBox box = new HBox(6);
        box.setAlignment(Pos.CENTER_LEFT);
        Label l = new Label(label + ":");
        metricTitleLabels.add(l);
        box.getChildren().addAll(l, valueLabel);
        return box;
    }

    private void toggleExpanded() {
        isExpanded = !isExpanded;
        expandedDrawer.setVisible(isExpanded);
        expandedDrawer.setManaged(isExpanded);
        toggleExpandBtn.setText((isExpanded ? "▼ Hide" : "▲ Tasks (" + taskManager.getActiveTaskCount() + ")"));
    }

    public void refreshUi() {
        int count = taskManager.getActiveTaskCount();
        AppTheme current = ThemeManager.getCurrentTheme();

        if (count == 0) {
            taskCountBadge.setText("Idle · Ready");
            if (current == AppTheme.CATPPUCCIN_FOREST) {
                taskCountBadge.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-text-fill: #7C9489; -fx-background-color: rgba(36, 53, 45, 0.6); -fx-border-color: #24352D; -fx-border-radius: 10; -fx-background-radius: 10; -fx-padding: 2 8 2 8;");
                expandedSubLabel.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-text-fill: #4EBA87; -fx-background-color: rgba(78, 186, 135, 0.15); -fx-padding: 2 6 2 6; -fx-background-radius: 8;");
            } else if (current == AppTheme.INTELLIJ_DARK) {
                taskCountBadge.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-text-fill: #868A91; -fx-background-color: rgba(43, 45, 48, 0.6); -fx-border-color: #393B40; -fx-border-radius: 10; -fx-background-radius: 10; -fx-padding: 2 8 2 8;");
                expandedSubLabel.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-text-fill: #3574F0; -fx-background-color: rgba(53, 116, 240, 0.15); -fx-padding: 2 6 2 6; -fx-background-radius: 8;");
            } else if (isDark) {
                taskCountBadge.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-text-fill: #9294A3; -fx-background-color: rgba(68, 71, 90, 0.5); -fx-border-color: #44475A; -fx-border-radius: 10; -fx-background-radius: 10; -fx-padding: 2 8 2 8;");
                expandedSubLabel.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-text-fill: #BD93F9; -fx-background-color: rgba(189, 147, 249, 0.15); -fx-padding: 2 6 2 6; -fx-background-radius: 8;");
            } else {
                taskCountBadge.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-text-fill: #475569; -fx-background-color: #F1F5F9; -fx-border-color: #CBD5E1; -fx-border-radius: 10; -fx-background-radius: 10; -fx-padding: 2 8 2 8;");
                expandedSubLabel.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-text-fill: #6366F1; -fx-background-color: #EEF2FF; -fx-padding: 2 6 2 6; -fx-background-radius: 8;");
            }
            expandedSubLabel.setText("0 running");
        } else {
            taskCountBadge.setText(count + (count == 1 ? " active task" : " active tasks"));
            if (current == AppTheme.CATPPUCCIN_FOREST) {
                taskCountBadge.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-text-fill: #4EBA87; -fx-background-color: rgba(78, 186, 135, 0.18); -fx-border-color: rgba(78, 186, 135, 0.3); -fx-border-radius: 10; -fx-background-radius: 10; -fx-padding: 2 8 2 8;");
                expandedSubLabel.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-text-fill: #4EBA87; -fx-background-color: rgba(78, 186, 135, 0.18); -fx-padding: 2 6 2 6; -fx-background-radius: 8;");
            } else if (current == AppTheme.INTELLIJ_DARK) {
                taskCountBadge.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-text-fill: #3574F0; -fx-background-color: rgba(53, 116, 240, 0.18); -fx-border-color: rgba(53, 116, 240, 0.3); -fx-border-radius: 10; -fx-background-radius: 10; -fx-padding: 2 8 2 8;");
                expandedSubLabel.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-text-fill: #3574F0; -fx-background-color: rgba(53, 116, 240, 0.18); -fx-padding: 2 6 2 6; -fx-background-radius: 8;");
            } else if (isDark) {
                taskCountBadge.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-text-fill: #50FA7B; -fx-background-color: rgba(80, 250, 123, 0.18); -fx-border-color: rgba(80, 250, 123, 0.3); -fx-border-radius: 10; -fx-background-radius: 10; -fx-padding: 2 8 2 8;");
                expandedSubLabel.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-text-fill: #50FA7B; -fx-background-color: rgba(80, 250, 123, 0.18); -fx-padding: 2 6 2 6; -fx-background-radius: 8;");
            } else {
                taskCountBadge.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-text-fill: #047857; -fx-background-color: #ECFDF5; -fx-border-color: #A7F3D0; -fx-border-radius: 10; -fx-background-radius: 10; -fx-padding: 2 8 2 8;");
                expandedSubLabel.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-text-fill: #047857; -fx-background-color: #ECFDF5; -fx-padding: 2 6 2 6; -fx-background-radius: 8;");
            }
            expandedSubLabel.setText(count + " running");
        }

        if (!isExpanded) {
            toggleExpandBtn.setText("▲ Tasks (" + count + ")");
        }

        // Rebuild active task cards
        taskCardsContainer.getChildren().clear();
        if (count == 0) {
            Label empty = new Label("No background tasks currently running. Long-running library scans and metadata repairs appear here.");
            empty.setStyle("-fx-font-size: 12px; -fx-text-fill: " + (isDark ? "#9294A3" : "#64748B") + "; -fx-padding: 12;");
            taskCardsContainer.getChildren().add(empty);
        } else {
            for (BackgroundTask task : taskManager.getActiveTasks()) {
                taskCardsContainer.getChildren().add(createTaskCard(task));
            }
        }
    }

    private HBox createTaskCard(BackgroundTask task) {
        HBox card = new HBox(12);
        card.setAlignment(Pos.CENTER_LEFT);
        card.setPadding(new Insets(10, 14, 10, 14));

        AppTheme current = ThemeManager.getCurrentTheme();
        if (current == AppTheme.CATPPUCCIN_FOREST) {
            card.setStyle("-fx-background-color: #141D18; -fx-border-color: #24352D; -fx-border-radius: 6; -fx-background-radius: 6;");
        } else if (current == AppTheme.INTELLIJ_DARK) {
            card.setStyle("-fx-background-color: #1E1F22; -fx-border-color: #2B2D30; -fx-border-radius: 6; -fx-background-radius: 6;");
        } else if (isDark) {
            card.setStyle("-fx-background-color: rgba(255, 255, 255, 0.04); -fx-border-color: rgba(255, 255, 255, 0.08); -fx-border-radius: 6; -fx-background-radius: 6;");
        } else {
            card.setStyle("-fx-background-color: #FFFFFF; -fx-border-color: #E2E8F0; -fx-border-radius: 6; -fx-background-radius: 6;");
        }

        // Left info: Name + Status text
        VBox leftInfo = new VBox(3);
        leftInfo.setPrefWidth(220);
        Label title = new Label(task.getName());
        title.setStyle("-fx-font-size: 12.5px; -fx-font-weight: 600; -fx-text-fill: " + (isDark ? "#F8F8F2" : "#1F2335") + ";");
        Label typeLabel = new Label(task.getType().getDisplayName());
        typeLabel.setStyle("-fx-font-size: 11px; -fx-text-fill: " + (isDark ? "#9294A3" : "#64748B") + ";");
        leftInfo.getChildren().addAll(title, typeLabel);

        // Center progress bar and percent
        VBox centerProgress = new VBox(4);
        HBox.setHgrow(centerProgress, Priority.ALWAYS);

        HBox progHeader = new HBox(8);
        progHeader.setAlignment(Pos.CENTER_LEFT);

        Label statusMsg = new Label();
        statusMsg.textProperty().bind(task.statusMessageProperty());
        statusMsg.setStyle("-fx-font-size: 11.5px; -fx-text-fill: " + (isDark ? "#9294A3" : "#64748B") + ";");

        Region sp = new Region();
        HBox.setHgrow(sp, Priority.ALWAYS);

        Label pctLbl = new Label();
        task.progressProperty().addListener((obs, oldV, newV) -> {
            double p = newV.doubleValue();
            if (p < 0) pctLbl.setText("Indeterminate");
            else pctLbl.setText(String.format(Locale.ROOT, "%.0f%%", p * 100));
        });
        pctLbl.setStyle("-fx-font-family: 'JetBrains Mono', 'Consolas', monospace; -fx-font-size: 11px; -fx-font-weight: 700; -fx-text-fill: " + (isDark ? "#F8F8F2" : "#1F2335") + ";");

        progHeader.getChildren().addAll(statusMsg, sp, pctLbl);

        ProgressBar pbar = new ProgressBar(0);
        pbar.setMaxWidth(Double.MAX_VALUE);
        pbar.progressProperty().bind(task.progressProperty());
        String pbarColor = (current == AppTheme.CATPPUCCIN_FOREST) ? "#4EBA87" : (current == AppTheme.INTELLIJ_DARK) ? "#3574F0" : (isDark ? "#BD93F9" : "#6366F1");
        pbar.setStyle("-fx-accent: " + pbarColor + "; -fx-pref-height: 6px;");

        centerProgress.getChildren().addAll(progHeader, pbar);

        // Actions: Pause/Resume and Cancel
        HBox actions = new HBox(6);
        actions.setAlignment(Pos.CENTER_RIGHT);

        Button btnPause = new Button(task.isPaused() ? "Resume" : "Pause");
        btnPause.setStyle("-fx-font-size: 10px; -fx-font-weight: 600; -fx-padding: 3 8 3 8; -fx-cursor: hand;");
        btnPause.setOnAction(e -> {
            if (task.isPaused()) {
                taskManager.resumeTask(task.getId());
                btnPause.setText("Pause");
            } else {
                taskManager.pauseTask(task.getId());
                btnPause.setText("Resume");
            }
        });

        Button btnCancel = new Button("Cancel");
        btnCancel.setStyle("-fx-font-size: 10px; -fx-font-weight: 600; -fx-text-fill: " + (isDark ? "#FF5555" : "#ef4444") + "; -fx-padding: 3 8 3 8; -fx-cursor: hand;");
        btnCancel.setOnAction(e -> taskManager.cancelTask(task.getId()));

        actions.getChildren().addAll(btnPause, btnCancel);

        card.getChildren().addAll(leftInfo, centerProgress, actions);
        return card;
    }

    private void updateTelemetry() {
        var rm = taskManager.getResourceManager();
        double sysCpu = rm.getSystemCpuPercent();
        double procCpu = rm.getProcessCpuPercent();
        long appProcessMemMb = rm.getAppProcessMemoryMb();
        long jvmHeapUsedMb = rm.getJvmMemoryUsedMb();
        long jvmHeapCommittedMb = rm.getJvmMemoryCommittedMb();

        double sysUsedGb = SystemHardwareInfo.getUsedMemoryGB();
        double sysTotalGb = SystemHardwareInfo.getTotalMemoryGB();

        telemetryLabel.setText(String.format(Locale.US, "CPU %.0f%%  ·  App RAM %d MB  ·  Sys RAM %.1f / %.1f GB",
                sysCpu, appProcessMemMb, sysUsedGb, sysTotalGb));

        telemetryLabel.setTooltip(new Tooltip(String.format(Locale.US,
                "CPU Usage: System %.1f%% (App %.1f%%)\nApp OS RAM (Task Manager): %d MB\nJVM Heap: %d MB used of %d MB committed\nSystem RAM: %.2f GB used of %.2f GB (%.0f%% in use)",
                sysCpu, procCpu, appProcessMemMb, jvmHeapUsedMb, jvmHeapCommittedMb, sysUsedGb, sysTotalGb,
                sysTotalGb > 0 ? (sysUsedGb / sysTotalGb * 100.0) : 0.0)));

        appCpuMetric.setText(String.format(Locale.US, "%.1f%%", procCpu));
        appMemMetric.setText(appProcessMemMb + " MB (" + jvmHeapUsedMb + " MB Heap)");
        sysMemMetric.setText(String.format(Locale.US, "%.1f / %.1f GB", sysUsedGb, sysTotalGb));

        // Calculate aggregated throughput
        double totalThroughput = 0.0;
        for (BackgroundTask t : taskManager.getActiveTasks()) {
            totalThroughput += t.getThroughputMbPerSec();
        }
        throughputMetric.setText(String.format(Locale.US, "%.1f MB/s", totalThroughput));
    }
}
