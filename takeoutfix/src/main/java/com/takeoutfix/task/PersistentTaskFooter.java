package com.takeoutfix.task;

import com.takeoutfix.network.SystemHardwareInfo;
import com.takeoutfix.shared.theme.ThemeColors;
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
 * - Full light / dark theme adaptation matching the application theme.
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

        // Apply initial theme from global ThemeColors state
        setTheme(ThemeColors.isDark());

        // Register dynamic theme listener
        ThemeColors.addThemeListener(() -> Platform.runLater(() -> setTheme(ThemeColors.isDark())));

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
        if (isDark) {
            setStyle("-fx-background-color: #0F1117; -fx-border-color: #1E2330 transparent transparent transparent; -fx-border-width: 1;");

            // Collapsed bar
            greenDot.setFill(javafx.scene.paint.Color.web("#10B981"));
            privacyPill.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-text-fill: #34D399;");
            dotSeparator.setStyle("-fx-font-size: 11px; -fx-text-fill: #64748B;");
            telemetryLabel.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-text-fill: #CBD5E1;");
            toggleExpandBtn.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-background-color: transparent; -fx-text-fill: #CBD5E1; -fx-cursor: hand;");

            // Drawer
            expandedDrawer.setStyle("-fx-background-color: #141722; -fx-border-color: #242938 transparent transparent transparent; -fx-border-width: 1;");
            expandedHeaderLabel.setStyle("-fx-font-size: 14px; -fx-font-weight: 800; -fx-text-fill: #F8FAFC;");
            btnViewAll.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-background-color: transparent; -fx-text-fill: #818CF8; -fx-cursor: hand;");
            btnCloseDrawer.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-background-color: transparent; -fx-text-fill: #94A3B8; -fx-cursor: hand;");

            appCpuMetric.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-text-fill: #F8FAFC;");
            appMemMetric.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-text-fill: #F8FAFC;");
            sysMemMetric.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-text-fill: #F8FAFC;");
            throughputMetric.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-text-fill: #F8FAFC;");
            for (Label lbl : metricTitleLabels) {
                lbl.setStyle("-fx-font-size: 11px; -fx-text-fill: #94A3B8;");
            }
        } else {
            setStyle("-fx-background-color: #FFFFFF; -fx-border-color: #E2E8F0 transparent transparent transparent; -fx-border-width: 1;");

            // Collapsed bar
            greenDot.setFill(javafx.scene.paint.Color.web("#059669"));
            privacyPill.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-text-fill: #047857;");
            dotSeparator.setStyle("-fx-font-size: 11px; -fx-text-fill: #94A3B8;");
            telemetryLabel.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-text-fill: #334155;");
            toggleExpandBtn.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-background-color: transparent; -fx-text-fill: #334155; -fx-cursor: hand;");

            // Drawer
            expandedDrawer.setStyle("-fx-background-color: #F8FAFC; -fx-border-color: #E2E8F0 transparent transparent transparent; -fx-border-width: 1;");
            expandedHeaderLabel.setStyle("-fx-font-size: 14px; -fx-font-weight: 800; -fx-text-fill: #0F172A;");
            btnViewAll.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-background-color: transparent; -fx-text-fill: #6366F1; -fx-cursor: hand;");
            btnCloseDrawer.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-background-color: transparent; -fx-text-fill: #64748B; -fx-cursor: hand;");

            appCpuMetric.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-text-fill: #0F172A;");
            appMemMetric.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-text-fill: #0F172A;");
            sysMemMetric.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-text-fill: #0F172A;");
            throughputMetric.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-text-fill: #0F172A;");
            for (Label lbl : metricTitleLabels) {
                lbl.setStyle("-fx-font-size: 11px; -fx-text-fill: #64748B;");
            }
        }
    }

    private void buildCollapsedBar() {
        collapsedBar.setAlignment(Pos.CENTER_LEFT);
        collapsedBar.setPadding(new Insets(6, 18, 6, 18));
        collapsedBar.setPrefHeight(34);

        // Privacy indicator
        HBox privacyBox = new HBox(6);
        privacyBox.setAlignment(Pos.CENTER_LEFT);
        privacyBox.getChildren().addAll(greenDot, privacyPill);

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        // Expand Toggle button
        toggleExpandBtn.setOnAction(e -> toggleExpanded());

        collapsedBar.getChildren().addAll(privacyBox, dotSeparator, taskCountBadge, spacer, telemetryLabel, toggleExpandBtn);
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
        if (count == 0) {
            taskCountBadge.setText("Idle · Ready");
            if (isDark) {
                taskCountBadge.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-text-fill: #94A3B8; -fx-background-color: rgba(148, 163, 184, 0.12); -fx-border-color: rgba(148, 163, 184, 0.22); -fx-border-radius: 10; -fx-background-radius: 10; -fx-padding: 2 8 2 8;");
                expandedSubLabel.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-text-fill: #818CF8; -fx-background-color: rgba(129, 140, 248, 0.15); -fx-padding: 2 6 2 6; -fx-background-radius: 8;");
            } else {
                taskCountBadge.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-text-fill: #475569; -fx-background-color: #F1F5F9; -fx-border-color: #CBD5E1; -fx-border-radius: 10; -fx-background-radius: 10; -fx-padding: 2 8 2 8;");
                expandedSubLabel.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-text-fill: #6366F1; -fx-background-color: #EEF2FF; -fx-padding: 2 6 2 6; -fx-background-radius: 8;");
            }
            expandedSubLabel.setText("0 running");
        } else {
            taskCountBadge.setText(count + (count == 1 ? " active task" : " active tasks"));
            if (isDark) {
                taskCountBadge.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-text-fill: #34D399; -fx-background-color: rgba(16, 185, 129, 0.18); -fx-border-color: rgba(52, 211, 153, 0.3); -fx-border-radius: 10; -fx-background-radius: 10; -fx-padding: 2 8 2 8;");
                expandedSubLabel.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-text-fill: #34D399; -fx-background-color: rgba(16, 185, 129, 0.18); -fx-padding: 2 6 2 6; -fx-background-radius: 8;");
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
            empty.setStyle("-fx-font-size: 12px; -fx-text-fill: " + (isDark ? "#94A3B8" : "#64748B") + "; -fx-padding: 12;");
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

        if (isDark) {
            card.setStyle("-fx-background-color: rgba(255, 255, 255, 0.04); -fx-border-color: rgba(255, 255, 255, 0.08); -fx-border-radius: 6; -fx-background-radius: 6;");
        } else {
            card.setStyle("-fx-background-color: #FFFFFF; -fx-border-color: #E2E8F0; -fx-border-radius: 6; -fx-background-radius: 6;");
        }

        // Tool Icon / Name
        VBox leftInfo = new VBox(3);
        leftInfo.setPrefWidth(160);
        Label toolLbl = new Label(task.getToolName());
        toolLbl.setStyle("-fx-font-size: 12px; -fx-font-weight: 800; -fx-text-fill: " + (isDark ? "#F8FAFC" : "#0F172A") + ";");
        Label titleLbl = new Label(task.getTaskTitle());
        titleLbl.setStyle("-fx-font-size: 11px; -fx-text-fill: " + (isDark ? "#94A3B8" : "#64748B") + ";");
        leftInfo.getChildren().addAll(toolLbl, titleLbl);

        // Progress bar + detail label
        VBox centerProgress = new VBox(4);
        HBox.setHgrow(centerProgress, Priority.ALWAYS);

        HBox progHeader = new HBox(8);
        progHeader.setAlignment(Pos.CENTER_LEFT);
        Label statusMsg = new Label();
        statusMsg.textProperty().bind(task.statusMessageProperty());
        statusMsg.setStyle("-fx-font-size: 11px; -fx-text-fill: " + (isDark ? "#CBD5E1" : "#334155") + ";");

        Region sp = new Region();
        HBox.setHgrow(sp, Priority.ALWAYS);

        Label pctLbl = new Label();
        pctLbl.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-text-fill: " + (isDark ? "#34D399" : "#047857") + ";");
        task.progressProperty().addListener((obs, oldVal, newVal) -> {
            double p = newVal.doubleValue();
            if (p >= 0) {
                pctLbl.setText(String.format(Locale.US, "%.0f%%", p * 100));
            } else {
                pctLbl.setText("Processing...");
            }
        });

        progHeader.getChildren().addAll(statusMsg, sp, pctLbl);

        ProgressBar pbar = new ProgressBar(0);
        pbar.setMaxWidth(Double.MAX_VALUE);
        pbar.progressProperty().bind(task.progressProperty());
        pbar.setStyle("-fx-accent: " + (isDark ? "#818CF8" : "#6366F1") + "; -fx-pref-height: 6px;");

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
        btnCancel.setStyle("-fx-font-size: 10px; -fx-font-weight: 600; -fx-text-fill: #ef4444; -fx-padding: 3 8 3 8; -fx-cursor: hand;");
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
