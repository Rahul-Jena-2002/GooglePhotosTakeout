package com.photovault.ui.fx;

import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Node;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.Tooltip;
import javafx.scene.image.Image;
import javafx.scene.image.ImageView;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.Region;
import javafx.scene.layout.VBox;

/**
 * Top navigation and operations bar for PhotoVault.
 * Matches TakeoutFix styling with branding, website link, history, theme toggle, and auth pill.
 */
public class HeaderBar extends HBox {

    private final Button themeToggleBtn;
    private final HBox userProfileBox;
    private final Runnable onThemeToggle;
    private final Runnable onHistoryClick;
    private final Runnable onWebsiteClick;
    private final Runnable onSponsorClick;
    private final Runnable onSignInClick;

    private boolean isDark;
    private String userEmail;

    public HeaderBar(boolean initialDark,
                     Runnable onWebsiteClick,
                     Runnable onHistoryClick,
                     Runnable onSponsorClick,
                     Runnable onThemeToggle,
                     Runnable onSignInClick) {
        super(16);
        this.isDark = initialDark;
        this.onWebsiteClick = onWebsiteClick;
        this.onHistoryClick = onHistoryClick;
        this.onSponsorClick = onSponsorClick;
        this.onThemeToggle = onThemeToggle;
        this.onSignInClick = onSignInClick;

        setAlignment(Pos.CENTER_LEFT);
        setPadding(new Insets(2, 0, 4, 0));

        // Brand Logo
        Node logoNode = createBrandLogoNode();

        // Title & Subtitle Box
        VBox titleBox = new VBox(2);
        titleBox.setPadding(new Insets(0, 12, 0, 0));
        Label title = new Label("PhotoVault");
        title.getStyleClass().add("text-primary");
        title.setStyle("-fx-font-size: 18px; -fx-font-weight: bold;");

        Label subtitle = new Label("Local Photo Backup Verifier • Bit-for-bit SHA-256");
        subtitle.getStyleClass().add("text-muted");
        subtitle.setStyle("-fx-font-size: 11px;");
        titleBox.getChildren().addAll(title, subtitle);

        // Navigation Actions Box
        HBox navActions = new HBox(10);
        navActions.setAlignment(Pos.CENTER_LEFT);

        // Website Button
        Button websiteBtn = new Button("Website");
        websiteBtn.getStyleClass().add("btn-navbar");
        websiteBtn.setGraphic(UiIcons.createSvgIcon(UiIcons.WEBSITE, 13, "#38bdf8"));
        websiteBtn.setGraphicTextGap(8);
        websiteBtn.setTooltip(new Tooltip("Visit TakeoutFix / PhotoVault Website"));
        websiteBtn.setOnAction(e -> {
            if (this.onWebsiteClick != null) this.onWebsiteClick.run();
        });

        // History Button
        Button historyBtn = new Button("History");
        historyBtn.getStyleClass().add("btn-navbar");
        historyBtn.setGraphic(UiIcons.createSvgIcon(UiIcons.HISTORY, 13, "#a855f7"));
        historyBtn.setGraphicTextGap(8);
        historyBtn.setTooltip(new Tooltip("View Past Verification Runs & Checked Folders"));
        historyBtn.setOnAction(e -> {
            if (this.onHistoryClick != null) this.onHistoryClick.run();
        });

        // Sponsor Button (Heart Icon)
        Button sponsorBtn = new Button("Sponsor");
        sponsorBtn.getStyleClass().add("btn-navbar");
        sponsorBtn.setGraphic(UiIcons.createSvgIcon(UiIcons.HEART, 13, "#ec4899"));
        sponsorBtn.setGraphicTextGap(8);
        sponsorBtn.setTooltip(new Tooltip("Support PhotoVault & TakeoutFix on GitHub Sponsors"));
        sponsorBtn.setOnAction(e -> {
            if (this.onSponsorClick != null) this.onSponsorClick.run();
        });

        navActions.getChildren().addAll(websiteBtn, historyBtn, sponsorBtn);

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        // Right side tools
        HBox rightTools = new HBox(12);
        rightTools.setAlignment(Pos.CENTER_RIGHT);

        // Theme Switcher Toggle (Vector SVG Icon)
        themeToggleBtn = new Button();
        themeToggleBtn.getStyleClass().add("btn-icon");
        themeToggleBtn.setTooltip(new Tooltip(isDark ? "Switch to Light Theme" : "Switch to Dark Theme"));
        updateThemeIcon();
        themeToggleBtn.setOnAction(e -> {
            isDark = !isDark;
            updateThemeIcon();
            if (this.onThemeToggle != null) this.onThemeToggle.run();
        });

        // 100% Offline Badge
        Label offlineBadge = new Label("100% OFFLINE & READ-ONLY");
        offlineBadge.getStyleClass().add("badge-offline");
        offlineBadge.setTooltip(new Tooltip("Zero network transmission • " + com.photovault.core.HardwareAccelerationManager.getAccelerationStatusSummary()));

        // User Profile / Sign In Box
        userProfileBox = new HBox(8);
        userProfileBox.setAlignment(Pos.CENTER);
        updateUserAuthUi();

        rightTools.getChildren().addAll(themeToggleBtn, offlineBadge, userProfileBox);

        getChildren().addAll(logoNode, titleBox, navActions, spacer, rightTools);
    }

    public void setDark(boolean dark) {
        this.isDark = dark;
        updateThemeIcon();
    }

    public boolean isDark() {
        return isDark;
    }

    public void setUserEmail(String email) {
        this.userEmail = email;
        updateUserAuthUi();
    }

    public String getUserEmail() {
        return userEmail;
    }

    private void updateThemeIcon() {
        if (isDark) {
            themeToggleBtn.setGraphic(UiIcons.createSvgIcon(UiIcons.SUN, 16, "#f59e0b"));
            if (themeToggleBtn.getTooltip() != null) {
                themeToggleBtn.getTooltip().setText("Switch to Light Theme");
            }
        } else {
            themeToggleBtn.setGraphic(UiIcons.createSvgIcon(UiIcons.MOON, 16, "#6366f1"));
            if (themeToggleBtn.getTooltip() != null) {
                themeToggleBtn.getTooltip().setText("Switch to Dark Theme");
            }
        }
    }

    private void updateUserAuthUi() {
        userProfileBox.getChildren().clear();
        if (userEmail == null) {
            Button btnSignIn = new Button("Sign In");
            btnSignIn.getStyleClass().add("btn-secondary");
            btnSignIn.setGraphic(UiIcons.createSvgIcon(UiIcons.USER, 13, "#818cf8"));
            btnSignIn.setGraphicTextGap(8);
            btnSignIn.setOnAction(e -> {
                if (onSignInClick != null) onSignInClick.run();
            });
            userProfileBox.getChildren().add(btnSignIn);
        } else {
            HBox pill = new HBox(8);
            pill.getStyleClass().add("user-pill");
            pill.setAlignment(Pos.CENTER);

            Label avatar = new Label(userEmail.substring(0, 1).toUpperCase());
            avatar.getStyleClass().add("user-avatar");

            Label emailLabel = new Label(userEmail);
            emailLabel.setStyle("-fx-font-size: 11px; -fx-font-weight: bold;");

            Button signOutBtn = new Button("Sign Out");
            signOutBtn.getStyleClass().add("btn-secondary");
            signOutBtn.setStyle("-fx-font-size: 10px; -fx-padding: 2 8 2 8;");
            signOutBtn.setOnAction(e -> setUserEmail(null));

            pill.getChildren().addAll(avatar, emailLabel, signOutBtn);
            userProfileBox.getChildren().add(pill);
        }
    }

    private Node createBrandLogoNode() {
        try {
            var stream = getClass().getResourceAsStream("/icons/icon.png");
            if (stream != null) {
                ImageView iv = new ImageView(new Image(stream, 36, 36, true, true));
                iv.setFitWidth(36);
                iv.setFitHeight(36);
                return iv;
            }
        } catch (Exception ignored) {}

        Label logoBadge = new Label("PV");
        logoBadge.getStyleClass().add("badge-pv");
        return logoBadge;
    }
}
