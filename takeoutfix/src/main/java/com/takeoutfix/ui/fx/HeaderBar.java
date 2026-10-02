package com.takeoutfix.ui.fx;

import com.takeoutfix.auth.UserController;
import com.takeoutfix.auth.UserSyncBridgeService;
import com.takeoutfix.network.NetworkMonitorService;
import com.takeoutfix.restore.SessionStatsService;
import com.takeoutfix.shared.theme.AppTheme;
import com.takeoutfix.shared.theme.ThemeManager;
import javafx.application.Platform;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Node;
import javafx.scene.control.*;
import javafx.scene.image.Image;
import javafx.scene.image.ImageView;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.Region;
import javafx.scene.shape.Circle;
import javafx.stage.Stage;

import java.awt.Desktop;
import java.net.URI;
import java.util.function.Consumer;

/**
 * Top header bar component for TakeoutFix Studio.
 * Matches the production look of TakeoutFix Operations Center:
 * - Brand icon + TakeoutFix + v2.1.8 badge
 * - Navigation pills: Dashboard, Restore, MetaSync, Website
 * - Theme dropdown menu (All supported IDE & app themes)
 * - Network status indicator (ONLINE / OFFLINE)
 * - User Profile pill (Hi, <Name> [Avatar]) + Sign In / Sign Out button
 */
public class HeaderBar extends HBox {

    private final Stage parentStage;
    private final UserSyncBridgeService userService;
    private final NetworkMonitorService networkService;
    private final SessionStatsService statsService;
    private final Runnable onThemeToggled;
    private final Consumer<WorkspaceType> onWorkspaceSelected;

    // Theme dropdown state
    private boolean isDark = true;
    private final MenuButton themeMenuBtn = new MenuButton();
    private final Button sponsorBtn = new Button("Sponsor");

    // Online Status Pill
    private final HBox onlineBadge = new HBox(5);
    private final Circle onlineDot = new Circle(4);
    private final Label onlineLabel = new Label("ONLINE");

    // Profile & Auth
    private final HBox profileContainer = new HBox(8);
    private final HBox profilePillBox = new HBox(6);
    private final Label userPill = new Label();
    private final Label avatarCircle = new Label();
    private final Button authActionBtn = new Button();

    private final Button versionBtn = new Button();
    private final com.takeoutfix.updates.UpdateCheckerService updateCheckerService;

    // Nav Pills
    private Button btnWebsite;

    public HeaderBar(Stage parentStage,
                     UserSyncBridgeService userService,
                     NetworkMonitorService networkService,
                     SessionStatsService statsService,
                     com.takeoutfix.updates.UpdateCheckerService updateCheckerService,
                     Runnable onThemeToggled,
                     Consumer<WorkspaceType> onWorkspaceSelected) {
        this.parentStage = parentStage;
        this.userService = userService;
        this.networkService = networkService;
        this.statsService = statsService;
        this.updateCheckerService = updateCheckerService;
        this.onThemeToggled = onThemeToggled;
        this.onWorkspaceSelected = onWorkspaceSelected;

        getStyleClass().add("top-header");
        setAlignment(Pos.CENTER_LEFT);
        setSpacing(14);
        setPadding(new Insets(10, 18, 10, 18));

        // 1. Brand Logo + Version Badge
        HBox brandBox = buildBrandBox();

        // 2. Navigation / External Links
        HBox navPillsBox = buildNavPills();

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        // 3. Theme Dropdown Menu & Sponsor Buttons
        setupThemeMenu();
        setupSponsorBtn();

        // 4. Online Network Pill
        setupOnlineBadge();

        // 5. User Profile / Sign-In controls
        setupProfileSection();

        getChildren().addAll(brandBox, navPillsBox, spacer, sponsorBtn, themeMenuBtn, onlineBadge, profileContainer);

        // Hook listeners
        if (networkService != null) {
            networkService.addListener(online -> Platform.runLater(() -> updateOnlineState(online)));
        }
        if (userService != null) {
            userService.addListener(profile -> Platform.runLater(this::updateUserProfile));
        }
        if (updateCheckerService != null) {
            updateCheckerService.addListener(info -> Platform.runLater(() -> updateVersionBadge(info)));
        }

        ThemeManager.addListener(theme -> Platform.runLater(() -> updateThemeMenu(theme)));

        updateUserProfile();
        updateVersionBadge(updateCheckerService != null ? updateCheckerService.getLatestUpdate() : null);
    }

    public HeaderBar(Stage parentStage,
                     UserSyncBridgeService userService,
                     NetworkMonitorService networkService,
                     SessionStatsService statsService,
                     Runnable onThemeToggled,
                     Consumer<WorkspaceType> onWorkspaceSelected) {
        this(parentStage, userService, networkService, statsService, null, onThemeToggled, onWorkspaceSelected);
    }

    private HBox buildBrandBox() {
        HBox brand = new HBox(8);
        brand.setAlignment(Pos.CENTER_LEFT);

        ImageView logoView = null;
        try {
            var stream = getClass().getResourceAsStream("/icons/icon.png");
            if (stream != null) {
                logoView = new ImageView(new Image(stream, 24, 24, true, true));
            }
        } catch (Exception ignored) {}

        Label brandText = new Label("TakeoutFix");
        brandText.setStyle("-fx-font-size: 17px; -fx-font-weight: 800;");

        versionBtn.setOnAction(e -> handleVersionClick());

        if (logoView != null) {
            brand.getChildren().addAll(logoView, brandText, versionBtn);
        } else {
            var fallback = UiIcons.createSvgIcon(UiIcons.RESTORE, 18, "#7C3AED");
            brand.getChildren().addAll(fallback, brandText, versionBtn);
        }
        return brand;
    }

    private void updateVersionBadge(com.takeoutfix.updates.UpdateCheckerService.UpdateInfo info) {
        if (info != null && info.isUpdateAvailable()) {
            versionBtn.setText("⚡ Update: " + info.versionTag());
            versionBtn.setStyle("-fx-font-size: 11.5px; -fx-font-weight: 600; -fx-text-fill: #10b981; -fx-background-color: rgba(16, 185, 129, 0.18); -fx-padding: 3 8 3 8; -fx-background-radius: 4; -fx-border-color: rgba(16, 185, 129, 0.4); -fx-border-radius: 4; -fx-cursor: hand;");
            Tooltip.install(versionBtn, new Tooltip("New update " + info.versionTag() + " available! Click to review and install OTA."));
        } else {
            versionBtn.setText("v" + com.takeoutfix.shared.util.AppVersion.getVersion());
            versionBtn.getStyleClass().setAll("button", "version-badge");
            versionBtn.setStyle("-fx-font-size: 11.5px; -fx-font-weight: 600; -fx-padding: 3 8 3 8; -fx-background-radius: 4; -fx-cursor: hand; -fx-border-color: transparent;");
            Tooltip.install(versionBtn, new Tooltip("TakeoutFix Studio v" + com.takeoutfix.shared.util.AppVersion.getVersion() + " (Click to check for updates)"));
        }
    }

    private void handleVersionClick() {
        if (updateCheckerService != null && updateCheckerService.getLatestUpdate() != null && updateCheckerService.getLatestUpdate().isUpdateAvailable()) {
            FxOtaUpdateDialog dlg = new FxOtaUpdateDialog(parentStage, updateCheckerService.getLatestUpdate(), null);
            dlg.showAndWait();
        } else {
            versionBtn.setText("Checking...");
            if (updateCheckerService != null) {
                new Thread(() -> {
                    updateCheckerService.checkForUpdates();
                    Platform.runLater(() -> {
                        var latest = updateCheckerService.getLatestUpdate();
                        updateVersionBadge(latest);
                        if (latest != null && latest.isUpdateAvailable()) {
                            FxOtaUpdateDialog dlg = new FxOtaUpdateDialog(parentStage, latest, null);
                            dlg.showAndWait();
                        } else {
                            versionBtn.setText("✓ Up to date");
                            new Thread(() -> {
                                try { Thread.sleep(2500); } catch (Exception ignored) {}
                                Platform.runLater(() -> updateVersionBadge(null));
                            }).start();
                        }
                    });
                }).start();
            }
        }
    }

    private HBox buildNavPills() {
        HBox pills = new HBox(6);
        pills.setAlignment(Pos.CENTER_LEFT);

        btnWebsite = createPillButton("Website", () -> openUrl("https://takeoutfix.pages.dev"));
        btnWebsite.setGraphic(UiIcons.createSvgIcon(UiIcons.GLOBE, 13, "currentColor"));
        btnWebsite.setGraphicTextGap(6);

        pills.getChildren().add(btnWebsite);
        return pills;
    }

    private Button createPillButton(String text, Runnable action) {
        Button btn = new Button(text);
        btn.getStyleClass().add("btn-ghost");
        btn.setStyle("-fx-font-size: 12px; -fx-font-weight: 600; -fx-padding: 5 12 5 12; -fx-background-radius: 6;");
        btn.setOnAction(e -> {
            if (action != null) action.run();
        });
        return btn;
    }

    public void setActivePill(WorkspaceType type) {
        // Active workspace is indicated dynamically in the Left Sidebar Navigation
    }

    private void setupThemeMenu() {
        themeMenuBtn.getStyleClass().addAll("btn-ghost", "theme-menu-btn");
        themeMenuBtn.setStyle("-fx-font-size: 13px; -fx-font-weight: 600; -fx-padding: 5 10 5 10; -fx-background-radius: 6; -fx-cursor: hand;");
        updateThemeMenu(ThemeManager.getCurrentTheme());
    }

    private void updateThemeMenu(AppTheme theme) {
        if (theme == null) theme = ThemeManager.getCurrentTheme();
        this.isDark = theme.isDark();
        themeMenuBtn.setGraphic(createThemeIcon(theme, 13));
        themeMenuBtn.setGraphicTextGap(6);
        themeMenuBtn.setText(theme.getDisplayName());
        Tooltip.install(themeMenuBtn, new Tooltip("Active Theme: " + theme.getDisplayName() + "\nClick to switch theme"));

        themeMenuBtn.getItems().clear();
        for (AppTheme t : AppTheme.values()) {
            String prefix = (t == theme) ? "✓  " : "    ";
            MenuItem item = new MenuItem(prefix + t.getDisplayName());
            Node itemIcon = createThemeIcon(t, 13);
            if (itemIcon != null) item.setGraphic(itemIcon);
            if (t == theme) {
                item.setStyle("-fx-font-weight: bold;");
            }
            final AppTheme target = t;
            item.setOnAction(e -> {
                ThemeManager.setTheme(target);
                if (onThemeToggled != null) onThemeToggled.run();
            });
            themeMenuBtn.getItems().add(item);
        }
    }

    private Node createThemeIcon(AppTheme theme, double size) {
        if (theme == AppTheme.CATPPUCCIN_FOREST) {
            return UiIcons.createSvgIcon(UiIcons.FOREST, size, "#4EBA87");
        } else if (theme == AppTheme.INTELLIJ_DARK) {
            return UiIcons.createSvgIcon(UiIcons.TERMINAL, size, "#3574F0");
        } else if (theme == AppTheme.INTELLIJ_LIGHT) {
            return UiIcons.createSvgIcon(UiIcons.TERMINAL, size, "#3574F0");
        } else if (theme != null && theme.isDark()) {
            return UiIcons.createSvgIcon(UiIcons.MOON, size, "#BD93F9");
        } else {
            return UiIcons.createSvgIcon(UiIcons.SUN, size, "#EAB308");
        }
    }

    private void setupSponsorBtn() {
        sponsorBtn.getStyleClass().add("btn-ghost");
        sponsorBtn.setGraphic(UiIcons.createSvgIcon(UiIcons.HEART, 13, "#F43F5E"));
        sponsorBtn.setGraphicTextGap(6);
        sponsorBtn.setStyle("-fx-font-size: 13px; -fx-font-weight: 600; -fx-padding: 6 12 6 12; -fx-background-radius: 6; -fx-cursor: hand;");
        sponsorBtn.setTooltip(new Tooltip("Sponsor TakeoutFix on GitHub (Opens in browser)"));
        sponsorBtn.setOnAction(e -> openUrl("https://github.com/sponsors/Rahul-Jena-2002"));
    }

    private void setupOnlineBadge() {
        onlineBadge.setAlignment(Pos.CENTER);
        onlineBadge.setStyle("-fx-background-color: rgba(16, 185, 129, 0.10); -fx-border-color: rgba(16, 185, 129, 0.20); -fx-border-radius: 12; -fx-background-radius: 12; -fx-padding: 3 10 3 10;");

        onlineDot.setFill(javafx.scene.paint.Color.web("#10b981"));
        onlineLabel.setText("Connected");
        onlineLabel.setStyle("-fx-font-size: 12.5px; -fx-font-weight: 500; -fx-text-fill: #10b981;");

        onlineBadge.getChildren().addAll(onlineDot, onlineLabel);
    }

    private void updateOnlineState(boolean online) {
        if (online) {
            onlineBadge.setStyle("-fx-background-color: rgba(16, 185, 129, 0.10); -fx-border-color: rgba(16, 185, 129, 0.20); -fx-border-radius: 12; -fx-background-radius: 12; -fx-padding: 3 10 3 10;");
            onlineDot.setFill(javafx.scene.paint.Color.web("#10b981"));
            onlineLabel.setText("Connected");
            onlineLabel.setStyle("-fx-font-size: 12.5px; -fx-font-weight: 500; -fx-text-fill: #10b981;");
        } else {
            onlineBadge.setStyle("-fx-background-color: rgba(113, 113, 122, 0.10); -fx-border-color: rgba(113, 113, 122, 0.20); -fx-border-radius: 12; -fx-background-radius: 12; -fx-padding: 3 10 3 10;");
            onlineDot.setFill(javafx.scene.paint.Color.web("#71717a"));
            onlineLabel.setText("Offline");
            onlineLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: 500; -fx-text-fill: #9299A8;");
        }
    }

    private void setupProfileSection() {
        profileContainer.setAlignment(Pos.CENTER_LEFT);

        avatarCircle.setStyle("-fx-font-size: 12px; -fx-font-weight: 600; -fx-text-fill: #ffffff; -fx-background-color: #7C3AED; -fx-padding: 3 7 3 7; -fx-background-radius: 12;");
        userPill.setStyle("-fx-font-size: 13.5px; -fx-font-weight: 500;");

        profilePillBox.setAlignment(Pos.CENTER_LEFT);
        profilePillBox.setStyle("-fx-cursor: hand; -fx-padding: 3 8 3 8; -fx-background-radius: 6; -fx-background-color: rgba(113, 113, 122, 0.08);");
        profilePillBox.getChildren().addAll(userPill, avatarCircle);
        profilePillBox.setOnMouseClicked(e -> {
            if (userService != null && userService.isSignedIn()) {
                showProfileDashboard();
            } else {
                FxSignInDialog dlg = new FxSignInDialog(parentStage, userService, success -> {
                    updateUserProfile();
                });
                dlg.showAndWait();
            }
        });
        Tooltip.install(profilePillBox, new Tooltip("Account & profile controls (Sign in optional for cloud sync)"));

        authActionBtn.setStyle("-fx-font-size: 12px; -fx-font-weight: 600; -fx-padding: 5 12 5 12; -fx-background-radius: 6;");

        profileContainer.getChildren().addAll(profilePillBox, authActionBtn);
    }

    private void showProfileDashboard() {
        ProfileDashboardDialog dlg = new ProfileDashboardDialog(parentStage, userService, statsService, () -> {
            updateUserProfile();
        });
        dlg.showAndWait();
    }

    public void updateUserProfile() {
        boolean signedIn = userService != null && userService.isSignedIn();

        if (signedIn) {
            String name = userService.getCurrentName();
            if (name == null || name.isEmpty()) {
                name = userService.getCurrentEmail();
            }
            if (name == null || name.isEmpty()) name = "User";

            String firstName = name.contains(" ") ? name.substring(0, name.indexOf(" ")) : name;
            String initial = name.substring(0, 1).toUpperCase();

            userPill.setText("Hi, " + firstName);
            userPill.setStyle("-fx-font-size: 12px; -fx-font-weight: 700; -fx-text-fill: #7C3AED;");
            profilePillBox.setVisible(true);
            profilePillBox.setManaged(true);

            avatarCircle.setText(initial);
            avatarCircle.setVisible(true);
            avatarCircle.setManaged(true);

            authActionBtn.setText("Dashboard");
            authActionBtn.getStyleClass().clear();
            authActionBtn.getStyleClass().addAll("button", "btn-secondary");
            authActionBtn.setGraphic(UiIcons.createSvgIcon(UiIcons.TERMINAL, 12, "currentColor"));
            authActionBtn.setGraphicTextGap(6);
            authActionBtn.setOnAction(e -> showProfileDashboard());
        } else {
            profilePillBox.setVisible(false);
            profilePillBox.setManaged(false);

            authActionBtn.setText("Sign In");
            authActionBtn.getStyleClass().clear();
            authActionBtn.getStyleClass().addAll("button", "btn-ghost");
            authActionBtn.setGraphic(UiIcons.createGoogleIcon(13));
            authActionBtn.setGraphicTextGap(6);
            authActionBtn.setOnAction(e -> {
                FxSignInDialog dlg = new FxSignInDialog(parentStage, userService, success -> {
                    updateUserProfile();
                });
                dlg.showAndWait();
            });
        }
    }

    public boolean isDark() {
        return ThemeManager.isDark();
    }

    private void openUrl(String url) {
        try {
            if (Desktop.isDesktopSupported() && Desktop.getDesktop().isSupported(Desktop.Action.BROWSE)) {
                Desktop.getDesktop().browse(new URI(url));
            }
        } catch (Exception ignored) {}
    }
}
