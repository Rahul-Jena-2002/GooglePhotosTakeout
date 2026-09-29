package com.takeoutfix.ui.fx;

import com.takeoutfix.restore.SessionStatsService;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.image.Image;
import javafx.scene.image.ImageView;
import javafx.scene.layout.*;

import java.util.HashMap;
import java.util.Map;
import java.util.function.Consumer;

/**
 * Modern Clean Left Sidebar for TakeoutFix Studio.
 * Reproduces the minimal SaaS navigation layout (media_1790664642131.png):
 * - Brand Header: TakeoutFix Studio • Photography Toolkit
 * - WORKSPACES: TakeoutFix, MetaSync, PhotoVault
 * - SYSTEM: History, Settings
 * - Bottom Trust Card: 100% Local Processing
 */
public class SidebarNav extends VBox {

    private final Consumer<WorkspaceType> onSelect;
    private final SessionStatsService statsService;
    private final Map<WorkspaceType, Button> navButtons = new HashMap<>();
    private WorkspaceType activeWorkspace = WorkspaceType.DASHBOARD;

    public SidebarNav(Consumer<WorkspaceType> onSelect, SessionStatsService statsService) {
        this.onSelect = onSelect;
        this.statsService = statsService;

        getStyleClass().add("sidebar");
        setPrefWidth(240);
        setMinWidth(220);
        setMaxWidth(260);
        setSpacing(16);
        setPadding(new Insets(18, 14, 18, 14));

        // 1. Studio Brand Header
        buildHeader();

        // 2. Workspaces Navigation Section (TakeoutFix, MetaSync, PhotoVault)
        buildWorkspacesSection();

        // 3. System Navigation Section (History, Settings)
        buildSystemSection();

        // 4. Spacer pushing trust badge to bottom
        Region spacer = new Region();
        VBox.setVgrow(spacer, Priority.ALWAYS);
        getChildren().add(spacer);

        // 5. Privacy Trust Badge
        buildPrivacyFooter();
    }

    private void buildHeader() {
        HBox header = new HBox(10);
        header.setAlignment(Pos.CENTER_LEFT);
        header.setPadding(new Insets(2, 4, 8, 4));

        ImageView logoView = null;
        try {
            var stream = getClass().getResourceAsStream("/icons/icon.png");
            if (stream != null) {
                logoView = new ImageView(new Image(stream, 28, 28, true, true));
            }
        } catch (Exception ignored) {}

        VBox titleBox = new VBox(2);
        Label title = new Label("TakeoutFix Studio");
        title.setStyle("-fx-font-size: 15px; -fx-font-weight: 800;");

        Label subtitle = new Label("Photography Toolkit");
        subtitle.setStyle("-fx-font-size: 11px; -fx-font-weight: 500; -fx-text-fill: #71717a;");

        titleBox.getChildren().addAll(title, subtitle);

        if (logoView != null) {
            header.getChildren().addAll(logoView, titleBox);
        } else {
            var fallback = UiIcons.createSvgIcon(UiIcons.RESTORE, 22, "#8b5cf6");
            header.getChildren().addAll(fallback, titleBox);
        }

        getChildren().add(header);
    }

    private void buildWorkspacesSection() {
        VBox section = new VBox(4);

        Label label = new Label("LIBRARY");
        label.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-text-fill: #71717a; -fx-padding: 6 8 4 8;");
        section.getChildren().add(label);

        Button btnOverview = createNavButton(WorkspaceType.DASHBOARD, UiIcons.LAYERS, "Overview");
        Button btnFixPhotos = createNavButton(WorkspaceType.TAKEOUT_RESTORE, UiIcons.RESTORE, "Fix Google Photos");
        Button btnEditDetails = createNavButton(WorkspaceType.PHOTO_STUDIO, UiIcons.SLIDERS, "Edit Photo Details");
        Button btnViewDetails = createNavButton(WorkspaceType.EXIF_VIEWER, UiIcons.CAMERA, "View Photo Details");
        Button btnCompare = createNavButton(WorkspaceType.ARCHIVE_COMPARE, UiIcons.DIFF, "Compare Archives");
        Button btnDuplicates = createNavButton(WorkspaceType.DUPLICATE_FINDER, UiIcons.COPY, "Find Duplicates");
        Button btnSyncDetails = createNavButton(WorkspaceType.METASYNC, UiIcons.SYNC, "Sync Photo Details");
        Button btnPhotoVault = createNavButton(WorkspaceType.PHOTOVAULT, UiIcons.SHIELD_CHECK, "Private Photo Vault");

        section.getChildren().addAll(btnOverview, btnFixPhotos, btnEditDetails, btnViewDetails, btnCompare, btnDuplicates, btnSyncDetails, btnPhotoVault);
        getChildren().add(section);

        select(WorkspaceType.DASHBOARD, false);
    }

    private void buildSystemSection() {
        VBox section = new VBox(4);

        Label label = new Label("SYSTEM");
        label.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-text-fill: #71717a; -fx-padding: 8 8 4 8;");
        section.getChildren().add(label);

        Button btnHistory = createNavButton(WorkspaceType.HISTORY, UiIcons.HISTORY, "Activity History");
        Button btnSettings = createNavButton(WorkspaceType.SETTINGS, UiIcons.SETTINGS, "Settings");

        section.getChildren().addAll(btnHistory, btnSettings);
        getChildren().add(section);
    }

    private Button createNavButton(WorkspaceType type, String iconSvg, String label) {
        Button btn = new Button(label);
        btn.getStyleClass().add("nav-button");
        btn.setMaxWidth(Double.MAX_VALUE);
        btn.setAlignment(Pos.CENTER_LEFT);

        var icon = UiIcons.createSvgIcon(iconSvg, 15, "currentColor");
        btn.setGraphic(icon);
        btn.setGraphicTextGap(10);
        btn.setStyle("-fx-font-size: 13px; -fx-font-weight: 600; -fx-padding: 8 12 8 12; -fx-background-radius: 6;");

        btn.setOnAction(e -> select(type, true));
        navButtons.put(type, btn);
        return btn;
    }

    public void select(WorkspaceType type, boolean notify) {
        this.activeWorkspace = type;
        navButtons.forEach((wType, btn) -> {
            if (wType == type) {
                if (!btn.getStyleClass().contains("nav-button-selected")) {
                    btn.getStyleClass().add("nav-button-selected");
                }
            } else {
                btn.getStyleClass().remove("nav-button-selected");
            }
        });

        if (notify && onSelect != null) {
            onSelect.accept(type);
        }
    }

    private void buildPrivacyFooter() {
        VBox trustCard = new VBox(4);
        trustCard.getStyleClass().add("trust-badge");
        trustCard.setStyle("-fx-border-radius: 8; -fx-background-radius: 8; -fx-padding: 10 12 10 12;");

        HBox trustRow = new HBox(6);
        trustRow.setAlignment(Pos.CENTER_LEFT);
        var lockIcon = UiIcons.createSvgIcon(UiIcons.LOCK, 12, "#10b981");
        Label trustTitle = new Label("100% Local Processing");
        trustTitle.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-text-fill: #10b981;");
        trustRow.getChildren().addAll(lockIcon, trustTitle);

        Label trustSubtitle = new Label("Your photos & metadata never leave this computer.");
        trustSubtitle.setStyle("-fx-font-size: 10px; -fx-text-fill: #71717a;");
        trustSubtitle.setWrapText(true);

        trustCard.getChildren().addAll(trustRow, trustSubtitle);
        getChildren().add(trustCard);
    }

    private void openUrl(String url) {
        try {
            if (java.awt.Desktop.isDesktopSupported() && java.awt.Desktop.getDesktop().isSupported(java.awt.Desktop.Action.BROWSE)) {
                java.awt.Desktop.getDesktop().browse(new java.net.URI(url));
            }
        } catch (Exception ignored) {}
    }

    public void setSessionRunning(boolean running) {
        // Telemetry hook
    }

    public void updateSessionCounts(int scanned, int restored, int skipped, int errors) {
        // Telemetry hook
    }
}
