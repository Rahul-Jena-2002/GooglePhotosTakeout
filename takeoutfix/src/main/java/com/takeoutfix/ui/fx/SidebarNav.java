package com.takeoutfix.ui.fx;

import com.takeoutfix.restore.SessionStatsService;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
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
        setPadding(new Insets(12, 14, 18, 14));

        // 1. Workspaces Navigation Section (TakeoutFix, MetaSync, PhotoVault)
        buildWorkspacesSection();

        // 2. System Navigation Section (History, Settings)
        buildSystemSection();

        // 3. Spacer pushing trust badge to bottom
        Region spacer = new Region();
        VBox.setVgrow(spacer, Priority.ALWAYS);
        getChildren().add(spacer);

        // 4. Privacy Trust Badge
        buildPrivacyFooter();
    }

    private void buildWorkspacesSection() {
        // 1. Workspace Section
        VBox wsSection = new VBox(4);
        Label wsLabel = new Label("WORKSPACE");
        wsLabel.setStyle("-fx-font-size: 10px; -fx-font-weight: 700; -fx-text-fill: #71717a; -fx-padding: 4 8 4 8;");
        wsSection.getChildren().add(wsLabel);

        Button btnOverview = createNavButton(WorkspaceType.DASHBOARD, UiIcons.LAYERS, "Overview");
        wsSection.getChildren().add(btnOverview);
        getChildren().add(wsSection);

        // 2. Photo Tools Section
        VBox toolsSection = new VBox(4);
        Label toolsLabel = new Label("PHOTO TOOLS");
        toolsLabel.setStyle("-fx-font-size: 10px; -fx-font-weight: 700; -fx-text-fill: #71717a; -fx-padding: 8 8 4 8;");
        toolsSection.getChildren().add(toolsLabel);

        Button btnFixPhotos = createNavButton(WorkspaceType.TAKEOUT_RESTORE, UiIcons.RESTORE, "Restore Metadata");
        Button btnEditDetails = createNavButton(WorkspaceType.PHOTO_STUDIO, UiIcons.SLIDERS, "Edit Metadata");
        Button btnViewDetails = createNavButton(WorkspaceType.EXIF_VIEWER, UiIcons.CAMERA, "EXIF Viewer");
        Button btnCompare = createNavButton(WorkspaceType.ARCHIVE_COMPARE, UiIcons.DIFF, "Compare Archives");
        Button btnDuplicates = createNavButton(WorkspaceType.DUPLICATE_FINDER, UiIcons.COPY, "Duplicate Finder");
        Button btnSyncDetails = createNavButton(WorkspaceType.METASYNC, UiIcons.SYNC, "Metadata Sync");
        Button btnPhotoVault = createNavButton(WorkspaceType.PHOTOVAULT, UiIcons.SHIELD_CHECK, "Private Photo Vault");

        toolsSection.getChildren().addAll(btnFixPhotos, btnEditDetails, btnViewDetails, btnCompare, btnDuplicates, btnSyncDetails, btnPhotoVault);
        getChildren().add(toolsSection);

        select(WorkspaceType.DASHBOARD, false);
    }

    private void buildSystemSection() {
        VBox section = new VBox(4);

        Label label = new Label("SYSTEM");
        label.setStyle("-fx-font-size: 10px; -fx-font-weight: 700; -fx-text-fill: #71717a; -fx-padding: 8 8 4 8;");
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
        Label trustTitle = new Label("Processed Locally");
        trustTitle.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-text-fill: #10b981;");
        trustRow.getChildren().addAll(lockIcon, trustTitle);

        Label trustSubtitle = new Label("Your files remain on your device during local processing.");
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
