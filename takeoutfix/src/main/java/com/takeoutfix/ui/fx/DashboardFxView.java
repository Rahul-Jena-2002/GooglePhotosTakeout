package com.takeoutfix.ui.fx;

import com.takeoutfix.auth.UserSyncBridgeService;
import com.takeoutfix.network.SystemHardwareInfo;
import com.takeoutfix.restore.SessionStatsService;
import javafx.application.Platform;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.*;
import javafx.scene.layout.*;

import java.awt.Desktop;
import java.net.URI;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

/**
 * Pure JavaFX Operations Dashboard View.
 * Provides high-level telemetry, account status, KPI metrics, hardware stats, and quick launchers.
 */
public class DashboardFxView extends ScrollPane {

    private final UserSyncBridgeService userService;
    private final SessionStatsService statsService;
    private final Consumer<WorkspaceType> onNavigate;

    // Account & Quota
    private final Label userAvatarLabel = new Label("G");
    private final Label userNameLabel = new Label("Guest Mode");
    private final Label userEmailLabel = new Label("Local-only session");
    private final Label userTierBadge = new Label("GUEST TIER");

    // Telemetry & Hardware
    private final Label cpuLabel = new Label("CPU: 0%");
    private final ProgressBar cpuBar = new ProgressBar(0.0);
    private final Label ramLabel = new Label("RAM: -- / -- GB");
    private final ProgressBar ramBar = new ProgressBar(0.0);
    private final Label coresLabel = new Label("Cores: " + Runtime.getRuntime().availableProcessors());

    // KPIs
    private final Label kpiStorageRestored = new Label("0.0 MB");
    private final Label kpiFilesProcessed = new Label("0");
    private final Label kpiScanned = new Label("0");
    private final Label kpiSuccessRate = new Label("—");
    private final Label kpiSuccessRateSub = new Label("No tasks run yet");

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

        setFitToWidth(true);
        setStyle("-fx-background: transparent; -fx-background-color: transparent;");

        VBox content = new VBox(14);
        content.setPadding(new Insets(16, 20, 20, 20));

        // 1. Welcome Header Banner
        content.getChildren().add(buildWelcomeBanner());

        // 2. Account & Quota + Hardware Telemetry Row (2 Columns)
        HBox topRow = new HBox(14);
        VBox accountCard = buildAccountCard();
        VBox hardwareCard = buildHardwareCard();
        HBox.setHgrow(accountCard, Priority.ALWAYS);
        HBox.setHgrow(hardwareCard, Priority.ALWAYS);
        topRow.getChildren().addAll(accountCard, hardwareCard);
        content.getChildren().add(topRow);

        // 3. Operational KPI Grid
        content.getChildren().add(buildKpiGrid());

        // 4. Quick Actions Tool Launchers
        content.getChildren().add(buildQuickActionsSection());

        setContent(content);

        // Update initial user info
        updateUserInfo();
        if (userService != null) {
            userService.addListener(profile -> Platform.runLater(this::updateUserInfo));
        }

        // Start hardware sampler
        startTelemetryLoop();
    }

    private VBox buildWelcomeBanner() {
        VBox banner = new VBox(6);
        banner.getStyleClass().add("glass-card");
        banner.setPadding(new Insets(16, 18, 16, 18));
        banner.setStyle(banner.getStyle() + "; -fx-background-color: linear-gradient(to right, rgba(139, 92, 246, 0.12), rgba(59, 130, 246, 0.08));");

        HBox top = new HBox(12);
        top.setAlignment(Pos.CENTER_LEFT);

        VBox textCol = new VBox(2);
        Label title = new Label("OPERATIONS OVERVIEW");
        title.getStyleClass().add("card-title");
        title.setStyle("-fx-font-size: 16px; -fx-font-weight: 800;");

        Label subtitle = new Label("Manage Google Takeout exports, inspect and edit photo details, sync photo collections, and monitor system performance.");
        subtitle.getStyleClass().add("card-subtitle");
        subtitle.setStyle("-fx-font-size: 11px;");
        textCol.getChildren().addAll(title, subtitle);

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        Button btnStartRestore = new Button("Fix Google Photos");
        btnStartRestore.getStyleClass().add("btn-primary");
        btnStartRestore.setGraphic(UiIcons.createSvgIcon(UiIcons.RESTORE, 13, "currentColor"));
        btnStartRestore.setOnAction(e -> {
            if (onNavigate != null) onNavigate.accept(WorkspaceType.TAKEOUT_RESTORE);
        });

        Button btnOpenMetaSync = new Button("Sync Photo Details");
        btnOpenMetaSync.getStyleClass().add("btn-secondary");
        btnOpenMetaSync.setGraphic(UiIcons.createSvgIcon(UiIcons.SYNC, 13, "currentColor"));
        btnOpenMetaSync.setOnAction(e -> {
            if (onNavigate != null) onNavigate.accept(WorkspaceType.METASYNC);
        });

        top.getChildren().addAll(textCol, spacer, btnOpenMetaSync, btnStartRestore);
        banner.getChildren().add(top);
        return banner;
    }

    private VBox buildAccountCard() {
        VBox card = new VBox(10);
        card.getStyleClass().add("glass-card");
        card.setPadding(new Insets(14, 16, 14, 16));

        Label sectionTitle = new Label("ACCOUNT & SYNC STATUS");
        sectionTitle.getStyleClass().add("kpi-label");
        sectionTitle.setStyle("-fx-font-size: 10px; -fx-font-weight: 800; -fx-letter-spacing: 0.5px;");

        HBox userRow = new HBox(12);
        userRow.setAlignment(Pos.CENTER_LEFT);

        userAvatarLabel.setAlignment(Pos.CENTER);
        userAvatarLabel.setPrefSize(40, 40);
        userAvatarLabel.setMinSize(40, 40);
        userAvatarLabel.setStyle("-fx-background-color: #3b82f6; -fx-text-fill: white; -fx-font-size: 14px; -fx-font-weight: 800; -fx-background-radius: 20;");

        VBox userDetails = new VBox(2);
        userNameLabel.getStyleClass().add("text-primary");
        userNameLabel.setStyle("-fx-font-size: 13px; -fx-font-weight: 700;");
        userEmailLabel.getStyleClass().add("text-muted");
        userEmailLabel.setStyle("-fx-font-size: 11px;");
        userDetails.getChildren().addAll(userNameLabel, userEmailLabel);

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        userTierBadge.setStyle("-fx-font-size: 10px; -fx-font-weight: 700; -fx-text-fill: #10b981; -fx-background-color: rgba(16, 185, 129, 0.12); -fx-padding: 3 8 3 8; -fx-background-radius: 4;");

        userRow.getChildren().addAll(userAvatarLabel, userDetails, spacer, userTierBadge);

        // Quota & Engine details
        HBox infoRow = new HBox(20);
        VBox col1 = new VBox(2);
        Label l1 = new Label("RESTORATION ENGINE");
        l1.getStyleClass().add("kpi-label");
        l1.setStyle("-fx-font-size: 9px; -fx-font-weight: 700;");
        Label v1 = new Label("Native ExifTool v13.x");
        v1.getStyleClass().add("text-primary");
        v1.setStyle("-fx-font-size: 11px; -fx-font-weight: 600;");
        col1.getChildren().addAll(l1, v1);

        VBox col2 = new VBox(2);
        Label l2 = new Label("PROCESSING LIMIT");
        l2.getStyleClass().add("kpi-label");
        l2.setStyle("-fx-font-size: 9px; -fx-font-weight: 700;");
        Label v2 = new Label("Unlimited Local Files");
        v2.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-text-fill: #10b981;");
        col2.getChildren().addAll(l2, v2);

        VBox col3 = new VBox(2);
        Label l3 = new Label("LOCAL PRIVACY");
        l3.getStyleClass().add("kpi-label");
        l3.setStyle("-fx-font-size: 9px; -fx-font-weight: 700;");
        Label v3 = new Label("Zero Cloud Uploads");
        v3.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-text-fill: #3b82f6;");
        col3.getChildren().addAll(l3, v3);

        infoRow.getChildren().addAll(col1, col2, col3);

        card.getChildren().addAll(sectionTitle, userRow, new Separator(), infoRow);
        return card;
    }

    private VBox buildHardwareCard() {
        VBox card = new VBox(10);
        card.getStyleClass().add("glass-card");
        card.setPadding(new Insets(14, 16, 14, 16));

        Label sectionTitle = new Label("HOST SYSTEM TELEMETRY");
        sectionTitle.getStyleClass().add("kpi-label");
        sectionTitle.setStyle("-fx-font-size: 10px; -fx-font-weight: 800; -fx-letter-spacing: 0.5px;");

        // CPU Row
        VBox cpuBox = new VBox(3);
        HBox cpuHeader = new HBox();
        Label cpuTitle = new Label("CPU Utilization");
        cpuTitle.getStyleClass().add("text-primary");
        cpuTitle.setStyle("-fx-font-size: 11px; -fx-font-weight: 600;");
        Region sp1 = new Region();
        HBox.setHgrow(sp1, Priority.ALWAYS);
        cpuLabel.getStyleClass().add("text-primary");
        cpuLabel.setStyle("-fx-font-size: 11px; -fx-font-weight: 700;");
        cpuHeader.getChildren().addAll(cpuTitle, sp1, cpuLabel);
        cpuBar.setMaxWidth(Double.MAX_VALUE);
        cpuBar.setPrefHeight(6);
        cpuBox.getChildren().addAll(cpuHeader, cpuBar);

        // RAM Row
        VBox ramBox = new VBox(3);
        HBox ramHeader = new HBox();
        Label ramTitle = new Label("Physical Memory (RAM)");
        ramTitle.getStyleClass().add("text-primary");
        ramTitle.setStyle("-fx-font-size: 11px; -fx-font-weight: 600;");
        Region sp2 = new Region();
        HBox.setHgrow(sp2, Priority.ALWAYS);
        ramLabel.getStyleClass().add("text-primary");
        ramLabel.setStyle("-fx-font-size: 11px; -fx-font-weight: 700;");
        ramHeader.getChildren().addAll(ramTitle, sp2, ramLabel);
        ramBar.setMaxWidth(Double.MAX_VALUE);
        ramBar.setPrefHeight(6);
        ramBox.getChildren().addAll(ramHeader, ramBar);

        // Footer details
        HBox foot = new HBox(16);
        coresLabel.getStyleClass().add("text-muted");
        coresLabel.setStyle("-fx-font-size: 10px; -fx-font-weight: 600;");
        Label archLabel = new Label("OS: " + System.getProperty("os.name") + " (" + System.getProperty("os.arch") + ")");
        archLabel.getStyleClass().add("text-muted");
        archLabel.setStyle("-fx-font-size: 10px; -fx-font-weight: 600;");
        foot.getChildren().addAll(coresLabel, archLabel);

        card.getChildren().addAll(sectionTitle, cpuBox, ramBox, foot);
        return card;
    }

    private HBox buildKpiGrid() {
        HBox grid = new HBox(12);
        grid.setAlignment(Pos.CENTER);

        VBox card1 = createKpiCard("TOTAL RESTORED", kpiStorageRestored, "Cumulative data processed", "#3b82f6");
        VBox card2 = createKpiCard("FILES RESTORED", kpiFilesProcessed, "Tagged photos & videos", "#10b981");
        VBox card3 = createKpiCard("MEDIA SCANNED", kpiScanned, "Google Takeout items", "#8b5cf6");
        VBox card4 = createKpiCard("SUCCESS RATE", kpiSuccessRate, kpiSuccessRateSub, "#f59e0b");

        HBox.setHgrow(card1, Priority.ALWAYS);
        HBox.setHgrow(card2, Priority.ALWAYS);
        HBox.setHgrow(card3, Priority.ALWAYS);
        HBox.setHgrow(card4, Priority.ALWAYS);

        grid.getChildren().addAll(card1, card2, card3, card4);
        return grid;
    }

    private VBox createKpiCard(String title, Label valueLabel, Label subLabel, String accentColor) {
        VBox card = new VBox(3);
        card.getStyleClass().add("glass-card");
        card.setPadding(new Insets(12, 14, 12, 14));
        card.setStyle(card.getStyle() + "; -fx-border-left-color: " + accentColor + "; -fx-border-left-width: 3px;");

        Label t = new Label(title);
        t.getStyleClass().add("kpi-label");
        t.setStyle("-fx-font-size: 9px; -fx-font-weight: 800; -fx-letter-spacing: 0.5px;");

        valueLabel.getStyleClass().add("kpi-value");
        valueLabel.setStyle("-fx-font-size: 20px; -fx-font-weight: 800;");

        subLabel.getStyleClass().add("kpi-sub");
        subLabel.setStyle("-fx-font-size: 10px;");

        card.getChildren().addAll(t, valueLabel, subLabel);
        return card;
    }

    private VBox createKpiCard(String title, Label valueLabel, String subtitle, String accentColor) {
        return createKpiCard(title, valueLabel, new Label(subtitle), accentColor);
    }

    private VBox buildQuickActionsSection() {
        VBox section = new VBox(8);

        Label heading = new Label("OPERATIONS TOOLS");
        heading.setStyle("-fx-font-size: 11px; -fx-font-weight: 800; -fx-text-fill: #71717a; -fx-letter-spacing: 0.5px;");

        HBox row = new HBox(12);

        VBox tool1 = createToolLauncherCard(
                "Fix Google Photos",
                "Extract Google Takeout ZIP archives and inject JSON sidecars into photo headers.",
                UiIcons.RESTORE,
                "#3b82f6",
                () -> { if (onNavigate != null) onNavigate.accept(WorkspaceType.TAKEOUT_RESTORE); }
        );

        VBox tool2 = createToolLauncherCard(
                "Sync Photo Details",
                "Compare and transfer metadata across RAW originals, edited JPEGs, and sidecars.",
                UiIcons.SYNC,
                "#8b5cf6",
                () -> { if (onNavigate != null) onNavigate.accept(WorkspaceType.METASYNC); }
        );

        VBox tool3 = createToolLauncherCard(
                "View Photo Details",
                "Inspect camera specs, shutter, lens model, and GPS map locations in real-time.",
                UiIcons.EYE,
                "#10b981",
                () -> { if (onNavigate != null) onNavigate.accept(WorkspaceType.EXIF_VIEWER); }
        );

        VBox tool4 = createToolLauncherCard(
                "Compare Archives",
                "Side-by-side comparison between photo files and Google Takeout JSON sidecars.",
                UiIcons.DIFF,
                "#f59e0b",
                () -> { if (onNavigate != null) onNavigate.accept(WorkspaceType.ARCHIVE_COMPARE); }
        );

        VBox tool5 = createToolLauncherCard(
                "Find Duplicates",
                "Scan directories to find identical photo/video copies and reclaim drive space.",
                UiIcons.COPY,
                "#ec4899",
                () -> { if (onNavigate != null) onNavigate.accept(WorkspaceType.DUPLICATE_FINDER); }
        );

        HBox.setHgrow(tool1, Priority.ALWAYS);
        HBox.setHgrow(tool2, Priority.ALWAYS);
        HBox.setHgrow(tool3, Priority.ALWAYS);
        HBox.setHgrow(tool4, Priority.ALWAYS);
        HBox.setHgrow(tool5, Priority.ALWAYS);

        row.getChildren().addAll(tool1, tool2, tool3, tool4, tool5);
        section.getChildren().addAll(heading, row);
        return section;
    }

    private VBox createToolLauncherCard(String title, String desc, String iconPath, String color, Runnable action) {
        VBox card = new VBox(8);
        card.getStyleClass().add("glass-card");
        card.setPadding(new Insets(12, 14, 12, 14));
        card.setStyle("-fx-cursor: hand;");

        HBox top = new HBox(8);
        top.setAlignment(Pos.CENTER_LEFT);
        var icon = UiIcons.createSvgIcon(iconPath, 16, color);
        Label titleLbl = new Label(title);
        titleLbl.getStyleClass().addAll("card-title", "text-primary");
        titleLbl.setStyle("-fx-font-size: 12px; -fx-font-weight: 700;");
        top.getChildren().addAll(icon, titleLbl);

        Label descLbl = new Label(desc);
        descLbl.setWrapText(true);
        descLbl.getStyleClass().addAll("card-subtitle", "text-secondary");
        descLbl.setStyle("-fx-font-size: 10px;");

        Button launchBtn = new Button("Launch Tool");
        launchBtn.getStyleClass().add("btn-secondary");
        launchBtn.setStyle("-fx-font-size: 10px; -fx-padding: 3 8 3 8;");
        launchBtn.setOnAction(e -> action.run());

        card.getChildren().addAll(top, descLbl, launchBtn);
        card.setOnMouseClicked(e -> action.run());
        return card;
    }

    private VBox buildDealsSection() {
        VBox section = new VBox(8);

        Label heading = new Label("RECOMMENDED STORAGE & HARDWARE DEALS");
        heading.setStyle("-fx-font-size: 11px; -fx-font-weight: 800; -fx-text-fill: #71717a; -fx-letter-spacing: 0.5px;");

        HBox row = new HBox(12);

        VBox deal1 = createDealCard(
                "SanDisk Extreme 2TB Portable SSD",
                "Up to 1050MB/s NVMe read/write speeds, IP55 water & dust resistance. Perfect for high-speed Takeout library restoration.",
                "Amazon Special Deal",
                "https://amzn.to/3B4uKjS"
        );

        VBox deal2 = createDealCard(
                "Samsung T7 Shield 4TB Rugged SSD",
                "Heavy-duty photo storage with drop resistance and USB 3.2 Gen 2 transfer rates. Massive archive headroom.",
                "Verified Partner Deal",
                "https://amzn.to/4gYF1oO"
        );

        VBox deal3 = createDealCard(
                "Google One Cloud Storage (2TB)",
                "Official cloud backup, shared family storage and seamless Google Photos integration.",
                "Google Official",
                "https://one.google.com"
        );

        HBox.setHgrow(deal1, Priority.ALWAYS);
        HBox.setHgrow(deal2, Priority.ALWAYS);
        HBox.setHgrow(deal3, Priority.ALWAYS);

        row.getChildren().addAll(deal1, deal2, deal3);
        section.getChildren().addAll(heading, row);
        return section;
    }

    private VBox createDealCard(String title, String desc, String tag, String url) {
        VBox card = new VBox(6);
        card.getStyleClass().add("glass-card");
        card.setPadding(new Insets(12, 14, 12, 14));

        HBox top = new HBox(8);
        top.setAlignment(Pos.CENTER_LEFT);
        Label tagLbl = new Label(tag);
        tagLbl.setStyle("-fx-font-size: 9px; -fx-font-weight: 700; -fx-text-fill: #f59e0b; -fx-background-color: rgba(245, 158, 11, 0.12); -fx-padding: 2 6 2 6; -fx-background-radius: 4;");
        Region sp = new Region();
        HBox.setHgrow(sp, Priority.ALWAYS);
        Button openBtn = new Button("View Deal");
        openBtn.getStyleClass().add("btn-ghost");
        openBtn.setStyle("-fx-font-size: 10px; -fx-padding: 2 6 2 6;");
        openBtn.setGraphic(UiIcons.createSvgIcon(UiIcons.EXTERNAL_LINK, 10, "currentColor"));
        openBtn.setOnAction(e -> openUrl(url));
        top.getChildren().addAll(tagLbl, sp, openBtn);

        Label titleLbl = new Label(title);
        titleLbl.setStyle("-fx-font-size: 12px; -fx-font-weight: 700;");

        Label descLbl = new Label(desc);
        descLbl.setWrapText(true);
        descLbl.setStyle("-fx-font-size: 10px; -fx-text-fill: #71717a;");

        card.getChildren().addAll(top, titleLbl, descLbl);
        return card;
    }

    private void updateUserInfo() {
        if (userService != null && userService.isSignedIn()) {
            String name = userService.getCurrentName();
            String email = userService.getCurrentEmail();
            userNameLabel.setText(name);
            userEmailLabel.setText(email);
            userAvatarLabel.setText(name.isEmpty() ? "U" : name.substring(0, 1).toUpperCase());
            userTierBadge.setText("PRO TIER");
            userTierBadge.setStyle("-fx-font-size: 10px; -fx-font-weight: 700; -fx-text-fill: #8b5cf6; -fx-background-color: rgba(139, 92, 246, 0.12); -fx-padding: 3 8 3 8; -fx-background-radius: 4;");
        } else {
            userNameLabel.setText("Guest Mode");
            userEmailLabel.setText("Local-only session");
            userAvatarLabel.setText("G");
            userTierBadge.setText("GUEST TIER");
            userTierBadge.setStyle("-fx-font-size: 10px; -fx-font-weight: 700; -fx-text-fill: #10b981; -fx-background-color: rgba(16, 185, 129, 0.12); -fx-padding: 3 8 3 8; -fx-background-radius: 4;");
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
                kpiSuccessRateSub.setText("Zero corruption rate");
            }
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

                Platform.runLater(() -> {
                    cpuLabel.setText(String.format("CPU: %.1f%%", cpu));
                    cpuBar.setProgress(Math.max(0.0, Math.min(1.0, cpu / 100.0)));

                    ramLabel.setText(String.format("%.1f / %.1f GB", usedGb, totalGb));
                    ramBar.setProgress(Math.max(0.0, Math.min(1.0, ramFraction)));

                    updateStatsDisplay();
                });
            } catch (Exception ignored) {}
        }, 1, 3, TimeUnit.SECONDS);
    }

    private void openUrl(String url) {
        try {
            if (Desktop.isDesktopSupported() && Desktop.getDesktop().isSupported(Desktop.Action.BROWSE)) {
                Desktop.getDesktop().browse(new URI(url));
            } else {
                new ProcessBuilder("rundll32", "url.dll,FileProtocolHandler", url).start();
            }
        } catch (Exception ignored) {}
    }
}
