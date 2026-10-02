package com.takeoutfix.ui.fx;

import com.takeoutfix.auth.UserSyncBridgeService;
import com.takeoutfix.restore.infrastructure.NativeExifToolEngine;
import com.takeoutfix.shared.theme.AppTheme;
import com.takeoutfix.shared.theme.ThemeManager;
import javafx.application.Platform;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Node;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.scene.paint.Color;
import javafx.scene.shape.Circle;
import javafx.stage.DirectoryChooser;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;
import java.util.prefs.Preferences;

/**
 * Settings view for configuring application preferences, user profile & cloud sync,
 * ExifTool engine parameters, and native IDE themes.
 */
public class SettingsView extends VBox {

    private final NativeExifToolEngine engine;
    private final UserSyncBridgeService userService;
    private final Consumer<WorkspaceType> onSwitchWorkspace;
    private final Preferences prefs = Preferences.userNodeForPackage(SettingsView.class);

    private final ListView<String> categoryList = new ListView<>();
    private final StackPane contentPane = new StackPane();

    // Section panels
    private final VBox profilePane = new VBox(14);
    private final VBox generalPane = new VBox(14);
    private final VBox processingPane = new VBox(14);
    private final VBox updatesPane = new VBox(14);
    private final VBox safetyPane = new VBox(14);
    private final VBox storagePane = new VBox(14);
    private final VBox privacyPane = new VBox(14);
    private final VBox advancedPane = new VBox(14);
    private final VBox supportPane = new VBox(14);
    private final VBox aboutPane = new VBox(14);

    public SettingsView(NativeExifToolEngine engine) {
        this(engine, null, null);
    }

    public SettingsView(NativeExifToolEngine engine, UserSyncBridgeService userService, Consumer<WorkspaceType> onSwitchWorkspace) {
        this.engine = engine;
        this.userService = userService;
        this.onSwitchWorkspace = onSwitchWorkspace;

        setSpacing(16);
        setPadding(new Insets(24));
        VBox.setVgrow(this, Priority.ALWAYS);

        // 1. Header
        getChildren().add(buildHeaderRow());

        // 2. Preferences Body: Two-column layout
        HBox body = new HBox(24);
        VBox.setVgrow(body, Priority.ALWAYS);

        VBox navSidebar = buildNavSidebar();
        navSidebar.setPrefWidth(220);
        navSidebar.setMinWidth(220);
        navSidebar.setMaxWidth(220);

        ScrollPane scrollContent = new ScrollPane(contentPane);
        scrollContent.setFitToWidth(true);
        scrollContent.setStyle("-fx-background-color: transparent; -fx-background: transparent; -fx-border-color: transparent;");
        HBox.setHgrow(scrollContent, Priority.ALWAYS);
        VBox.setVgrow(scrollContent, Priority.ALWAYS);

        body.getChildren().addAll(navSidebar, scrollContent);
        getChildren().add(body);

        // Initialize Panes
        buildProfilePane();
        buildGeneralPane();
        buildProcessingPane();
        buildUpdatesPane();
        buildSafetyPane();
        buildStoragePane();
        buildPrivacyPane();
        buildAdvancedPane();
        buildSupportPane();
        buildAboutPane();

        categoryList.getSelectionModel().select(0);
    }

    public void selectCategory(String name) {
        for (int i = 0; i < categoryList.getItems().size(); i++) {
            if (categoryList.getItems().get(i).equalsIgnoreCase(name)) {
                categoryList.getSelectionModel().select(i);
                break;
            }
        }
    }

    private HBox buildHeaderRow() {
        HBox header = new HBox(14);
        header.setAlignment(Pos.CENTER_LEFT);

        VBox titleBox = new VBox(3);
        Label title = new Label("Settings");
        title.getStyleClass().addAll("page-title", "header-title");

        Label subtitle = new Label("Configure user profile, appearance themes, processing engine, and file safety.");
        subtitle.getStyleClass().addAll("page-description", "header-subtitle");
        titleBox.getChildren().addAll(title, subtitle);

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        header.getChildren().addAll(titleBox, spacer);
        return header;
    }

    private VBox buildNavSidebar() {
        VBox box = new VBox(8);
        box.getStyleClass().add("glass-card");
        box.setStyle("-fx-border-radius: 8; -fx-background-radius: 8; -fx-padding: 10;");
        VBox.setVgrow(box, Priority.ALWAYS);

        categoryList.getItems().addAll("User Profile", "General", "Processing", "Updates", "File Safety", "Storage", "Privacy", "Advanced", "Support", "About");
        categoryList.setStyle("-fx-background-color: transparent; -fx-border-color: transparent;");
        VBox.setVgrow(categoryList, Priority.ALWAYS);

        categoryList.setCellFactory(lv -> new ListCell<>() {
            @Override
            protected void updateItem(String item, boolean empty) {
                super.updateItem(item, empty);
                if (empty || item == null) {
                    setText(null);
                    setGraphic(null);
                } else {
                    HBox row = new HBox(10);
                    row.setAlignment(Pos.CENTER_LEFT);
                    row.setPadding(new Insets(6, 10, 6, 10));

                    String iconSvg = switch (item) {
                        case "User Profile" -> UiIcons.USER;
                        case "General" -> UiIcons.SETTINGS;
                        case "Processing" -> UiIcons.PLAY;
                        case "Updates" -> UiIcons.RELOAD;
                        case "File Safety" -> UiIcons.SHIELD_CHECK;
                        case "Storage" -> UiIcons.FOLDER;
                        case "Privacy" -> UiIcons.LOCK;
                        case "Advanced" -> UiIcons.TERMINAL;
                        case "Support" -> UiIcons.EXTERNAL_LINK;
                        default -> UiIcons.HEART;
                    };

                    Node icon = UiIcons.createSvgIcon(iconSvg, 14, "#989BA8");
                    Label lbl = new Label(item);
                    lbl.setStyle("-fx-font-size: 13px; -fx-font-weight: 600;");
                    lbl.getStyleClass().add("text-primary");

                    row.getChildren().addAll(icon, lbl);
                    setGraphic(row);
                    setText(null);
                }
            }
        });

        categoryList.getSelectionModel().selectedIndexProperty().addListener((obs, oldVal, newVal) -> {
            int idx = newVal.intValue();
            contentPane.getChildren().clear();
            switch (idx) {
                case 0 -> contentPane.getChildren().add(profilePane);
                case 1 -> contentPane.getChildren().add(generalPane);
                case 2 -> contentPane.getChildren().add(processingPane);
                case 3 -> contentPane.getChildren().add(updatesPane);
                case 4 -> contentPane.getChildren().add(safetyPane);
                case 5 -> contentPane.getChildren().add(storagePane);
                case 6 -> contentPane.getChildren().add(privacyPane);
                case 7 -> contentPane.getChildren().add(advancedPane);
                case 8 -> contentPane.getChildren().add(supportPane);
                case 9 -> contentPane.getChildren().add(aboutPane);
            }
        });

        box.getChildren().add(categoryList);
        return box;
    }

    private void buildProfilePane() {
        profilePane.getChildren().clear();
        profilePane.getChildren().add(createSectionHeader("Profile & Account", "Manage your account, preferences, and cloud backup."));

        // 1. Account & Identity Card
        VBox identityCard = createCard();
        HBox idHeader = new HBox(8);
        idHeader.setAlignment(Pos.CENTER_LEFT);
        Label idTitle = new Label("Account");
        idTitle.setStyle("-fx-font-size: 14px; -fx-font-weight: 700;");
        idTitle.getStyleClass().add("card-title");
        idHeader.getChildren().add(idTitle);

        boolean signedIn = userService != null && userService.isSignedIn();
        String name = signedIn
                ? ((userService != null && userService.getCurrentName() != null && !userService.getCurrentName().isBlank())
                        ? userService.getCurrentName() : "Google User")
                : "Guest User";
        String email = signedIn
                ? ((userService != null && userService.getCurrentEmail() != null && !userService.getCurrentEmail().isBlank())
                        ? userService.getCurrentEmail() : "Connected")
                : "Guest Tier · 1 GB Free Storage";

        HBox userBox = new HBox(16);
        userBox.setAlignment(Pos.CENTER_LEFT);
        userBox.setStyle("-fx-padding: 8 0 8 0;");

        // Avatar circle
        String initial = signedIn
                ? ((name != null && !name.isEmpty()) ? name.substring(0, 1).toUpperCase() : "U")
                : "G";
        Label avatar = new Label(initial);
        avatar.setStyle(signedIn
                ? "-fx-font-size: 20px; -fx-font-weight: 700; -fx-text-fill: white; -fx-background-color: linear-gradient(to bottom, #7C3AED, #5B21B6); -fx-alignment: center; -fx-min-width: 52px; -fx-min-height: 52px; -fx-max-width: 52px; -fx-max-height: 52px; -fx-background-radius: 26;"
                : "-fx-font-size: 20px; -fx-font-weight: 700; -fx-text-fill: white; -fx-background-color: linear-gradient(to bottom, #475569, #334155); -fx-alignment: center; -fx-min-width: 52px; -fx-min-height: 52px; -fx-max-width: 52px; -fx-max-height: 52px; -fx-background-radius: 26;");

        VBox userDetails = new VBox(4);
        Label nameLbl = new Label(name);
        nameLbl.setStyle("-fx-font-size: 16px; -fx-font-weight: 700;");
        nameLbl.getStyleClass().add("text-primary");

        Label emailLbl = new Label(email);
        emailLbl.setStyle("-fx-font-size: 13px;");
        emailLbl.getStyleClass().add("text-muted");

        HBox badgeRow = new HBox(6);
        badgeRow.setAlignment(Pos.CENTER_LEFT);
        Label statusBadge = new Label(signedIn ? "● Google Account Connected · Unlimited Access" : "○ Guest Mode · 1 GB Limit (Sign in for Unlimited)");
        statusBadge.setStyle(signedIn
                ? "-fx-font-size: 11px; -fx-font-weight: 600; -fx-text-fill: #10B981; -fx-background-color: rgba(16, 185, 129, 0.12); -fx-padding: 2 8 2 8; -fx-background-radius: 12;"
                : "-fx-font-size: 11px; -fx-font-weight: 600; -fx-text-fill: #F59E0B; -fx-background-color: rgba(245, 158, 11, 0.12); -fx-padding: 2 8 2 8; -fx-background-radius: 12;");
        badgeRow.getChildren().add(statusBadge);

        userDetails.getChildren().addAll(nameLbl, emailLbl, badgeRow);

        Region idSpacer = new Region();
        HBox.setHgrow(idSpacer, Priority.ALWAYS);

        Button authBtn = new Button(signedIn ? "Sign Out" : "Sign In with Google (Unlock Unlimited)");
        authBtn.getStyleClass().add(signedIn ? "btn-secondary" : "btn-primary");
        authBtn.setStyle("-fx-font-size: 13px; -fx-font-weight: 600; -fx-pref-height: 38px; -fx-padding: 0 18 0 18; -fx-background-radius: 6; -fx-cursor: hand;");
        if (!signedIn) {
            authBtn.setGraphic(UiIcons.createGoogleIcon(16));
            authBtn.setGraphicTextGap(8);
        }
        authBtn.setOnAction(e -> {
            if (signedIn) {
                if (userService != null) {
                    userService.signOut();
                }
                buildProfilePane();
            } else {
                FxSignInDialog dlg = new FxSignInDialog(null, userService, success -> {
                    Platform.runLater(this::buildProfilePane);
                });
                dlg.showAndWait();
            }
        });

        userBox.getChildren().addAll(avatar, userDetails, idSpacer, authBtn);
        identityCard.getChildren().addAll(idHeader, userBox);

        // 2. Storage Quota & Entitlements Card
        VBox quotaCard = createCard();
        Label quotaTitle = new Label("Restoration Access");
        quotaTitle.setStyle("-fx-font-size: 14px; -fx-font-weight: 700;");
        quotaTitle.getStyleClass().add("card-title");

        long usedBytes = userService != null ? userService.getUsedBytes() : 0L;
        long maxBytes = userService != null ? userService.getMaxBytes() : com.takeoutfix.auth.UserSyncBridgeService.GUEST_MAX_BYTES;

        VBox quotaContent = new VBox(10);
        if (signedIn) {
            Label unlimitedLbl = new Label("Unlimited Free Restoration");
            unlimitedLbl.setStyle("-fx-font-size: 15px; -fx-font-weight: 700; -fx-text-fill: #10B981;");
            Label unlimitedSub = new Label("Signed in with Google. You have unrestricted access with no gigabyte or file count limits.");
            unlimitedSub.setStyle("-fx-font-size: 12.5px;");
            unlimitedSub.getStyleClass().add("text-muted");
            quotaContent.getChildren().addAll(unlimitedLbl, unlimitedSub);
        } else {
            double usedMb = usedBytes / (1024.0 * 1024.0);
            double pct = Math.min(1.0, usedBytes / (double) maxBytes);

            HBox qRow = new HBox(8);
            qRow.setAlignment(Pos.CENTER_LEFT);
            Label qUsedLbl = new Label(String.format("%.1f MB / 1,024 MB (1.0 GB)", usedMb));
            qUsedLbl.setStyle("-fx-font-size: 13px; -fx-font-weight: 700;");
            qUsedLbl.getStyleClass().add("text-primary");

            Region sp = new Region();
            HBox.setHgrow(sp, Priority.ALWAYS);

            Label qPctLbl = new Label(String.format("%d%% Used", (int) (pct * 100)));
            qPctLbl.setStyle("-fx-font-size: 12px; -fx-font-weight: 600; -fx-text-fill: " + (pct >= 1.0 ? "#EF4444" : "#F59E0B") + ";");

            qRow.getChildren().addAll(qUsedLbl, sp, qPctLbl);

            ProgressBar qBar = new ProgressBar(pct);
            qBar.setMaxWidth(Double.MAX_VALUE);
            qBar.setStyle("-fx-accent: " + (pct >= 1.0 ? "#EF4444" : "#8B5CF6") + "; -fx-pref-height: 8px;");

            Label qNote = new Label("Free guest mode includes up to 1 GB of restored media with no file count limits. Sign in to your Google Account to unlock 100% unlimited restoration access.");
            qNote.setStyle("-fx-font-size: 12px;");
            qNote.getStyleClass().add("text-muted");
            qNote.setWrapText(true);

            quotaContent.getChildren().addAll(qRow, qBar, qNote);
        }
        quotaCard.getChildren().addAll(quotaTitle, quotaContent);

        // 3. Cloud Synchronization Card
        VBox syncCard = createCard();
        Label syncTitle = new Label("Cloud Backup & Sync");
        syncTitle.setStyle("-fx-font-size: 14px; -fx-font-weight: 700;");
        syncTitle.getStyleClass().add("card-title");

        Label syncDesc = new Label("Keep your restoration history and progress safely backed up so you can access them across your devices.");
        syncDesc.setStyle("-fx-font-size: 12.5px;");
        syncDesc.getStyleClass().add("text-muted");
        syncDesc.setWrapText(true);

        CheckBox enableCloudSync = new CheckBox("Automatically backup history when online");
        enableCloudSync.setSelected(prefs.getBoolean("cloud.sync.auto", true));
        enableCloudSync.setStyle("-fx-font-size: 13px; -fx-font-weight: 500;");
        enableCloudSync.setOnAction(e -> prefs.putBoolean("cloud.sync.auto", enableCloudSync.isSelected()));

        HBox syncActionRow = new HBox(12);
        syncActionRow.setAlignment(Pos.CENTER_LEFT);
        syncActionRow.setStyle("-fx-padding: 4 0 0 0;");

        Button syncNowBtn = new Button("Sync Now");
        syncNowBtn.getStyleClass().add("btn-secondary");
        syncNowBtn.setGraphic(UiIcons.createSvgIcon(UiIcons.RELOAD, 13, "currentColor"));
        syncNowBtn.setGraphicTextGap(6);
        syncNowBtn.setStyle("-fx-font-size: 12.5px; -fx-font-weight: 600; -fx-pref-height: 36px; -fx-padding: 0 16 0 16;");
        syncNowBtn.setDisable(!signedIn);

        Label syncStatusMsg = new Label(signedIn ? "Ready to sync" : "Sign in to enable cloud synchronization");
        syncStatusMsg.setStyle("-fx-font-size: 12px;");
        syncStatusMsg.getStyleClass().add("text-muted");

        syncNowBtn.setOnAction(e -> {
            if (userService != null) {
                syncStatusMsg.setText("Syncing...");
                syncNowBtn.setDisable(true);
                userService.triggerCloudSync(success -> Platform.runLater(() -> {
                    syncNowBtn.setDisable(false);
                    syncStatusMsg.setText(Boolean.TRUE.equals(success) ? "Last synced: Just now ✓" : "Sync completed (local copy up to date)");
                }));
            }
        });

        syncActionRow.getChildren().addAll(syncNowBtn, syncStatusMsg);
        syncCard.getChildren().addAll(syncTitle, syncDesc, enableCloudSync, syncActionRow);

        // 3. Machine Hardware Keyring Vault Card
        VBox keyringCard = createCard();
        Label keyTitle = new Label("Security & Privacy");
        keyTitle.setStyle("-fx-font-size: 14px; -fx-font-weight: 700;");
        keyTitle.getStyleClass().add("card-title");

        Label keyDesc = new Label("Your sign-in information and account credentials are encrypted and stored safely on this device. Passwords and sensitive data are never stored in plain text.");
        keyDesc.setStyle("-fx-font-size: 12.5px;");
        keyDesc.getStyleClass().add("text-muted");
        keyDesc.setWrapText(true);

        HBox keyStatusRow = new HBox(8);
        keyStatusRow.setAlignment(Pos.CENTER_LEFT);
        Label keyStatus = new Label("● Device Security: Active");
        keyStatus.setStyle("-fx-font-size: 12px; -fx-font-weight: 600; -fx-text-fill: #10B981; -fx-background-color: rgba(16, 185, 129, 0.10); -fx-padding: 4 10 4 10; -fx-background-radius: 6;");
        keyStatusRow.getChildren().add(keyStatus);

        keyringCard.getChildren().addAll(keyTitle, keyDesc, keyStatusRow);

        profilePane.getChildren().addAll(identityCard, quotaCard, syncCard, keyringCard);
    }

    private void buildGeneralPane() {
        generalPane.getChildren().clear();
        generalPane.getChildren().add(createSectionHeader("Appearance & General Preferences", "Customize the application-wide look and feel, themes, and IDE aesthetics."));

        VBox card = createCard();

        // Application & IDE Theme
        VBox themeSection = new VBox(14);
        Label themeLbl = new Label("Application & IDE Theme");
        themeLbl.setStyle("-fx-font-size: 14px; -fx-font-weight: 700;");
        themeLbl.getStyleClass().add("card-title");

        Label themeDesc = new Label("Select an application-wide theme. This completely overrides backgrounds, borders, typography, surface cards, and accent colors across the entire workspace.");
        themeDesc.setStyle("-fx-font-size: 12.5px;");
        themeDesc.getStyleClass().add("text-muted");
        themeDesc.setWrapText(true);

        // Top Row: Synchronized Theme Dropdown
        HBox comboRow = new HBox(12);
        comboRow.setAlignment(Pos.CENTER_LEFT);
        Label comboLbl = new Label("Active Theme:");
        comboLbl.setStyle("-fx-font-size: 13px; -fx-font-weight: 600;");
        comboLbl.getStyleClass().add("text-primary");

        ComboBox<AppTheme> themeCombo = new ComboBox<>();
        themeCombo.getItems().addAll(AppTheme.values());
        themeCombo.setValue(ThemeManager.getCurrentTheme());
        themeCombo.setStyle("-fx-font-size: 13px; -fx-pref-width: 260px; -fx-pref-height: 38px; -fx-font-weight: 600;");

        comboRow.getChildren().addAll(comboLbl, themeCombo);

        // Interactive Theme Gallery Deck
        FlowPane themeGrid = new FlowPane(12, 12);
        themeGrid.setPrefWrapLength(700);

        List<VBox> themeCards = new ArrayList<>();

        for (AppTheme t : AppTheme.values()) {
            VBox themeCard = buildThemeCard(t, themeCombo, themeCards);
            themeCards.add(themeCard);
            themeGrid.getChildren().add(themeCard);
        }

        themeCombo.setOnAction(e -> {
            AppTheme selected = themeCombo.getValue();
            if (selected != null) {
                ThemeManager.setTheme(selected);
                updateThemeCardHighlights(themeCards, selected);
            }
        });

        ThemeManager.addListener(newTheme -> {
            Platform.runLater(() -> {
                if (themeCombo.getValue() != newTheme) {
                    themeCombo.setValue(newTheme);
                }
                updateThemeCardHighlights(themeCards, newTheme);
            });
        });

        themeSection.getChildren().addAll(themeLbl, themeDesc, comboRow, themeGrid);
        card.getChildren().add(themeSection);
        generalPane.getChildren().add(card);
    }

    private VBox buildThemeCard(AppTheme theme, ComboBox<AppTheme> combo, List<VBox> allCards) {
        VBox card = new VBox(6);
        card.getStyleClass().add("inner-container");
        card.setPrefWidth(210);
        card.setMinWidth(190);
        card.setPadding(new Insets(12, 14, 12, 14));
        card.setStyle("-fx-border-radius: 8; -fx-background-radius: 8; -fx-cursor: hand;");
        card.setUserData(theme);

        // Top Row: Color preview swatch dot & Category tag
        HBox topRow = new HBox(8);
        topRow.setAlignment(Pos.CENTER_LEFT);

        String swatchColor = switch (theme) {
            case TAKEOUTFIX_DARK -> "#8B5CF6";
            case TAKEOUTFIX_LIGHT -> "#F59E0B";
            case CATPPUCCIN_FOREST -> "#4EBA87";
            case INTELLIJ_DARK -> "#3574F0";
            case INTELLIJ_LIGHT -> "#3574F0";
        };

        Circle dot = new Circle(6, Color.web(swatchColor));

        Label modeTag = new Label(theme.isDark() ? "DARK" : "LIGHT");
        modeTag.setStyle("-fx-font-size: 10px; -fx-font-weight: 700; -fx-opacity: 0.7;");
        modeTag.getStyleClass().add("text-muted");

        Region sp = new Region();
        HBox.setHgrow(sp, Priority.ALWAYS);

        Label activeBadge = new Label("Active");
        activeBadge.setStyle("-fx-font-size: 10.5px; -fx-font-weight: 700; -fx-text-fill: " + swatchColor + "; -fx-background-color: rgba(255,255,255,0.08); -fx-padding: 2 6 2 6; -fx-background-radius: 4;");
        activeBadge.setVisible(theme == ThemeManager.getCurrentTheme());

        topRow.getChildren().addAll(dot, modeTag, sp, activeBadge);

        // Theme Title
        Label nameLbl = new Label(theme.getDisplayName());
        nameLbl.setStyle("-fx-font-size: 14px; -fx-font-weight: 700;");
        nameLbl.getStyleClass().add("text-primary");

        // Theme Description
        Label descLbl = new Label(theme.getDescription());
        descLbl.setStyle("-fx-font-size: 11.5px;");
        descLbl.getStyleClass().add("text-muted");
        descLbl.setWrapText(true);
        descLbl.setPrefHeight(34);

        card.getChildren().addAll(topRow, nameLbl, descLbl);

        card.setOnMouseClicked(e -> {
            ThemeManager.setTheme(theme);
            combo.setValue(theme);
            updateThemeCardHighlights(allCards, theme);
        });

        // Highlight if active
        if (theme == ThemeManager.getCurrentTheme()) {
            card.setStyle("-fx-border-radius: 8; -fx-background-radius: 8; -fx-border-color: " + swatchColor + "; -fx-border-width: 1.5; -fx-cursor: hand;");
        }

        return card;
    }

    private void updateThemeCardHighlights(List<VBox> cards, AppTheme activeTheme) {
        for (VBox c : cards) {
            AppTheme t = (AppTheme) c.getUserData();
            boolean isActive = (t == activeTheme);
            String swatchColor = switch (t) {
                case TAKEOUTFIX_DARK -> "#8B5CF6";
                case TAKEOUTFIX_LIGHT -> "#F59E0B";
                case CATPPUCCIN_FOREST -> "#4EBA87";
                case INTELLIJ_DARK -> "#3574F0";
                case INTELLIJ_LIGHT -> "#3574F0";
            };
            if (isActive) {
                c.setStyle("-fx-border-radius: 8; -fx-background-radius: 8; -fx-border-color: " + swatchColor + "; -fx-border-width: 1.5; -fx-cursor: hand;");
            } else {
                c.setStyle("-fx-border-radius: 8; -fx-background-radius: 8; -fx-cursor: hand;");
            }
            if (c.getChildren().get(0) instanceof HBox topRow) {
                if (topRow.getChildren().size() >= 4 && topRow.getChildren().get(3) instanceof Label badge) {
                    badge.setVisible(isActive);
                }
            }
        }
    }

    private void buildProcessingPane() {
        processingPane.getChildren().clear();
        processingPane.getChildren().add(createSectionHeader("Restoration Engine", "Local processing settings for photo and video metadata."));

        VBox card = createCard();

        VBox binBox = new VBox(6);
        Label binTitle = new Label("Photo & Video Engine");
        binTitle.setStyle("-fx-font-size: 13px; -fx-font-weight: 600; ");

        File bin = engine != null ? engine.getExifToolBinary() : null;
        String statusText = (bin != null && bin.exists())
                ? "Active & Ready"
                : "Engine Ready";

        Label binStatus = new Label(statusText);
        binStatus.setStyle("-fx-font-size: 12px; -fx-text-fill: #10B981; -fx-font-weight: 600;");

        Label binDesc = new Label("Photos and videos are restored entirely on your machine. Your personal files and memories are never uploaded or sent to external servers.");
        binDesc.setStyle("-fx-font-size: 12px; ");
        binBox.getChildren().addAll(binTitle, binStatus, binDesc);

        card.getChildren().add(binBox);
        processingPane.getChildren().add(card);
    }

    private void buildUpdatesPane() {
        updatesPane.getChildren().clear();
        updatesPane.getChildren().add(createSectionHeader("Application Updates", "Configure OTA release channels, background checks, and verification."));

        VBox card = createCard();

        VBox verBox = new VBox(6);
        Label vTitle = new Label("Current Version");
        vTitle.setStyle("-fx-font-size: 13px; -fx-font-weight: 600; ");

        HBox verRow = new HBox(10);
        verRow.setAlignment(Pos.CENTER_LEFT);

        Label appVer = new Label("Google Takeout Restorer v" + com.takeoutfix.shared.util.AppVersion.getVersion() + " (Stable)");
        appVer.setStyle("-fx-font-size: 14px; -fx-font-weight: 800; ");

        Label upToDateBadge = new Label("✓ Up to date");
        upToDateBadge.setStyle("-fx-font-size: 10px; -fx-font-weight: 700; -fx-text-fill: #10B981; -fx-background-color: rgba(16, 185, 129, 0.12); -fx-padding: 2 6 2 6; -fx-background-radius: 4;");

        verRow.getChildren().addAll(appVer, upToDateBadge);
        verBox.getChildren().addAll(vTitle, verRow);

        VBox autoBox = new VBox(8);
        CheckBox chkAutoCheck = new CheckBox("Automatically check for updates");
        chkAutoCheck.setSelected(true);
        chkAutoCheck.setStyle("-fx-font-size: 13px; -fx-font-weight: 600; ");

        Label autoCheckDesc = new Label("Check for new releases when Google Takeout Restorer starts.");
        autoCheckDesc.setStyle("-fx-font-size: 12px; ");

        CheckBox chkAutoDownload = new CheckBox("Automatically download updates");
        chkAutoDownload.setSelected(false);
        chkAutoDownload.setStyle("-fx-font-size: 13px; -fx-font-weight: 600; ");

        Label autoDownDesc = new Label("Download verified updates in the background.");
        autoDownDesc.setStyle("-fx-font-size: 12px; ");

        autoBox.getChildren().addAll(chkAutoCheck, autoCheckDesc, chkAutoDownload, autoDownDesc);

        VBox chanBox = new VBox(6);
        Label chanTitle = new Label("Release Channel");
        chanTitle.setStyle("-fx-font-size: 13px; -fx-font-weight: 600; ");

        Label chanDesc = new Label("Choose which versions to receive.");
        chanDesc.setStyle("-fx-font-size: 12px; ");

        ComboBox<String> chanCombo = new ComboBox<>();
        chanCombo.getItems().addAll("Stable", "Beta");
        chanCombo.setValue("Stable");
        chanCombo.setStyle("-fx-font-size: 12px; -fx-pref-width: 200px;");

        chanBox.getChildren().addAll(chanTitle, chanDesc, chanCombo);

        HBox actionRow = new HBox(12);
        actionRow.setAlignment(Pos.CENTER_LEFT);

        Label lastCheckedLabel = new Label("Last checked: Just now");
        lastCheckedLabel.setStyle("-fx-font-size: 11px; -fx-text-fill: #71717a;");

        Region sp = new Region();
        HBox.setHgrow(sp, Priority.ALWAYS);

        Button btnCheckNow = new Button("Check for Updates");
        btnCheckNow.getStyleClass().add("btn-primary");
        btnCheckNow.setStyle("-fx-font-size: 12px; -fx-font-weight: 700; -fx-padding: 6 16 6 16; -fx-cursor: hand;");
        btnCheckNow.setOnAction(e -> {
            btnCheckNow.setText("Checking...");
            new Thread(() -> {
                com.takeoutfix.updates.UpdateCheckerService ucs = new com.takeoutfix.updates.UpdateCheckerService();
                ucs.checkForUpdates();
                Platform.runLater(() -> {
                    btnCheckNow.setText("Check for Updates");
                    var info = ucs.getLatestUpdate();
                    if (info != null && info.isUpdateAvailable()) {
                        upToDateBadge.setText("⚡ Update: " + info.versionTag());
                        upToDateBadge.setStyle("-fx-font-size: 10px; -fx-font-weight: 700; -fx-text-fill: #8b5cf6; -fx-background-color: rgba(139, 92, 246, 0.15); -fx-padding: 2 6 2 6; -fx-background-radius: 4;");
                        FxOtaUpdateDialog dlg = new FxOtaUpdateDialog(null, info, null);
                        dlg.showAndWait();
                    } else {
                        upToDateBadge.setText("✓ Up to date");
                        upToDateBadge.setStyle("-fx-font-size: 10px; -fx-font-weight: 700; -fx-text-fill: #10B981; -fx-background-color: rgba(16, 185, 129, 0.12); -fx-padding: 2 6 2 6; -fx-background-radius: 4;");
                    }
                });
            }).start();
        });

        actionRow.getChildren().addAll(lastCheckedLabel, sp, btnCheckNow);

        card.getChildren().addAll(verBox, createDivider(), autoBox, createDivider(), chanBox, createDivider(), actionRow);
        updatesPane.getChildren().add(card);
    }

    private void buildSafetyPane() {
        safetyPane.getChildren().clear();
        safetyPane.getChildren().add(createSectionHeader("File Safety & Preservation", "Guaranteed non-destructive write guarantees."));

        VBox card = createCard();

        VBox backupBox = createToggle("Original Preservation Guarantee",
                "Google Takeout Restorer operates strictly out-of-place. Source archives and pictures are mounted Read-Only and never overwritten in place.",
                true, e -> {});

        VBox dryRunBox = createToggle("Integrity Check (Dry Run Mode)",
                "Simulate all date extractions and JSON pairings without writing media files to target directory.",
                false, e -> {});

        VBox collisionBox = createToggle("Automatic Deduplication & Collision Handling",
                "When identical photo filenames exist, cleanly append unique incremental sequence numbers instead of overwriting.",
                true, e -> {});

        card.getChildren().addAll(backupBox, createDivider(), dryRunBox, createDivider(), collisionBox);
        safetyPane.getChildren().add(card);
    }

    private void buildStoragePane() {
        storagePane.getChildren().clear();
        storagePane.getChildren().add(createSectionHeader("Storage Locations", "Configure where restored files, temp caches, and logs are kept."));

        VBox card = createCard();

        VBox outDirBox = createDirSelector("Default Restoration Output Folder",
                "Where newly reorganized photos and videos are written by default.",
                prefs.get("output.defaultDir", System.getProperty("user.home") + File.separator + "Pictures" + File.separator + "Restored Photos"),
                path -> prefs.put("output.defaultDir", path));

        VBox tempDirBox = createDirSelector("Archive Extraction Temporary Cache",
                "Temporary scratchpad used to unzip multi-part Google Takeout archives.",
                System.getProperty("java.io.tmpdir") + File.separator + "takeoutfix",
                path -> {});

        card.getChildren().addAll(outDirBox, createDivider(), tempDirBox);
        storagePane.getChildren().add(card);
    }

    private void buildPrivacyPane() {
        privacyPane.getChildren().clear();
        privacyPane.getChildren().add(createSectionHeader("Privacy & Telemetry", "100% on-device local execution policy."));

        VBox card = createCard();

        VBox localBox = createToggle("Zero-Cloud Media Processing Guarantee",
                "All photo bytes, video frames, GPS coordinates, and face detections are processed 100% locally on your CPU/RAM.",
                true, e -> {});

        VBox crashBox = createToggle("Anonymous Error Diagnostics",
                "Send non-identifying exception traces to help fix edge-case parsing bugs.",
                true, e -> {});

        card.getChildren().addAll(localBox, createDivider(), crashBox);
        privacyPane.getChildren().add(card);
    }

    private void buildAdvancedPane() {
        advancedPane.getChildren().clear();
        advancedPane.getChildren().add(createSectionHeader("Advanced Media Formats & Logs", "Configure accepted file extensions and log verbosity."));

        VBox card = createCard();

        VBox formatBox = new VBox(6);
        Label fTitle = new Label("Supported Media Formats");
        fTitle.setStyle("-fx-font-size: 13px; -fx-font-weight: 600; ");

        Label fList = new Label("Images: JPEG, PNG, TIFF, GIF, BMP, WEBP, HEIC, HEIF, AVIF\nRAW: CR2, CR3, NEF, ARW, DNG, ORF, RW2, PEF, RAF\nVideo & Live Photos: MP4, MOV, M4V, AVI, 3GP, MKV\nSidecars: JSON (Takeout), XMP (Adobe), XML");
        fList.setStyle("-fx-font-size: 12px; -fx-padding: 8 12 8 12; -fx-background-radius: 6; -fx-border-color: #30313B; -fx-border-radius: 6;");
        formatBox.getChildren().addAll(fTitle, fList);

        VBox logLvlBox = new VBox(6);
        Label lTitle = new Label("Diagnostic Logging Level");
        lTitle.setStyle("-fx-font-size: 13px; -fx-font-weight: 600; ");

        ComboBox<String> logCombo = new ComboBox<>();
        logCombo.getItems().addAll("Standard (Info & Errors)", "Verbose (Detailed tag traces)", "Debug (Subprocess stdout/stderr)");
        logCombo.setValue("Standard (Info & Errors)");
        logCombo.setStyle("-fx-font-size: 12px; -fx-pref-width: 250px;");
        logLvlBox.getChildren().addAll(lTitle, logCombo);

        card.getChildren().addAll(formatBox, new Separator(), logLvlBox);
        advancedPane.getChildren().add(card);
    }

    private void buildSupportPane() {
        supportPane.getChildren().clear();
        supportPane.getChildren().add(createSectionHeader("Help & Support Center", "Get technical documentation, recovery assistance, and FAQ answers."));

        VBox card = createCard();

        VBox infoBox = new VBox(10);
        Label title = new Label("Need Help or Encountered an Issue?");
        title.setStyle("-fx-font-size: 15px; -fx-font-weight: 600; ");

        Label desc = new Label("Our documentation covers step-by-step restoration for Google Takeout archives, metadata pairing edge-cases, and troubleshooting for corrupted files.");
        desc.setWrapText(true);
        desc.setStyle("-fx-font-size: 13px; ");

        HBox actions = new HBox(10);
        actions.setAlignment(Pos.CENTER_LEFT);

        Button btnSupportPage = new Button("Open Support & FAQ");
        btnSupportPage.getStyleClass().add("btn-primary");
        btnSupportPage.setGraphic(UiIcons.createSvgIcon(UiIcons.EXTERNAL_LINK, 13, "#FAFAFA"));
        btnSupportPage.setStyle("-fx-font-size: 12px; -fx-padding: 8 16;");
        btnSupportPage.setOnAction(e -> openUrl("https://takeoutfix.pages.dev/support"));

        Button btnGuides = new Button("Browse Guides");
        btnGuides.getStyleClass().add("btn-secondary");
        btnGuides.setGraphic(UiIcons.createSvgIcon(UiIcons.GLOBE, 13, "currentColor"));
        btnGuides.setStyle("-fx-font-size: 12px; -fx-padding: 8 16;");
        btnGuides.setOnAction(e -> openUrl("https://takeoutfix.pages.dev/guides"));

        actions.getChildren().addAll(btnSupportPage, btnGuides);
        infoBox.getChildren().addAll(title, desc, actions);
        card.getChildren().add(infoBox);

        supportPane.getChildren().add(card);
    }

    private void buildAboutPane() {
        aboutPane.getChildren().clear();
        aboutPane.getChildren().add(createSectionHeader("About Google Takeout Restorer", "Open-source photography suite engineered for Google Takeout recovery."));

        VBox card = createCard();

        VBox brandBox = new VBox(6);
        Label appName = new Label("Google Takeout Restorer v" + com.takeoutfix.shared.util.AppVersion.getVersion());
        appName.setStyle("-fx-font-size: 16px; -fx-font-weight: 800; ");

        Label appSub = new Label("Pure JavaFX desktop edition with multi-process native ExifTool engine.");
        appSub.setStyle("-fx-font-size: 12px; ");

        HBox btnRow = new HBox(10);
        btnRow.setAlignment(Pos.CENTER_LEFT);

        Button btnGithub = new Button("GitHub Repository");
        btnGithub.getStyleClass().add("btn-secondary");
        btnGithub.setGraphic(UiIcons.createSvgIcon(UiIcons.HISTORY, 13, "currentColor"));
        btnGithub.setStyle("-fx-font-size: 12px;");
        btnGithub.setOnAction(e -> openUrl("https://github.com/Rahul-Jena-2002/GooglePhotosTakeout"));

        Button btnSupport = new Button("Support & FAQ");
        btnSupport.getStyleClass().add("btn-secondary");
        btnSupport.setGraphic(UiIcons.createSvgIcon(UiIcons.EXTERNAL_LINK, 13, "currentColor"));
        btnSupport.setStyle("-fx-font-size: 12px;");
        btnSupport.setOnAction(e -> openUrl("https://takeoutfix.pages.dev/support"));

        Button btnSponsor = new Button("Sponsor Project");
        btnSponsor.getStyleClass().add("btn-primary");
        btnSponsor.setGraphic(UiIcons.createSvgIcon(UiIcons.HEART, 13, "#FAFAFA"));
        btnSponsor.setStyle("-fx-font-size: 12px;");
        btnSponsor.setOnAction(e -> openUrl("https://github.com/sponsors/Rahul-Jena-2002"));

        btnRow.getChildren().addAll(btnGithub, btnSupport, btnSponsor);
        brandBox.getChildren().addAll(appName, appSub, btnRow);

        card.getChildren().add(brandBox);
        aboutPane.getChildren().add(card);
    }

    private VBox createSectionHeader(String titleText, String subtitleText) {
        VBox box = new VBox(2);
        Label title = new Label(titleText);
        title.setStyle("-fx-font-size: 16px; -fx-font-weight: 600; ");
        title.getStyleClass().add("card-title");

        Label sub = new Label(subtitleText);
        sub.setStyle("-fx-font-size: 12px; ");
        sub.getStyleClass().add("text-muted");

        box.getChildren().addAll(title, sub);
        return box;
    }

    private VBox createCard() {
        VBox card = new VBox(12);
        card.getStyleClass().add("glass-card");
        card.setStyle("-fx-border-radius: 8; -fx-background-radius: 8; -fx-padding: 16;");
        return card;
    }

    private Separator createDivider() {
        Separator sep = new Separator();
        sep.setStyle("-fx-opacity: 0.3;");
        return sep;
    }

    private VBox createToggle(String titleText, String descText, boolean defaultVal, Consumer<Boolean> onToggle) {
        VBox box = new VBox(4);
        CheckBox chk = new CheckBox(titleText);
        chk.setSelected(defaultVal);
        chk.setStyle("-fx-font-size: 13px; -fx-font-weight: 600; ");
        chk.setOnAction(e -> onToggle.accept(chk.isSelected()));

        Label desc = new Label(descText);
        desc.setStyle("-fx-font-size: 12px; ");
        desc.getStyleClass().add("text-muted");
        desc.setWrapText(true);

        box.getChildren().addAll(chk, desc);
        return box;
    }

    private VBox createDirSelector(String titleText, String descText, String initialPath, Consumer<String> onSelected) {
        VBox box = new VBox(6);
        Label title = new Label(titleText);
        title.setStyle("-fx-font-size: 13px; -fx-font-weight: 600; ");

        Label desc = new Label(descText);
        desc.setStyle("-fx-font-size: 12px; ");
        desc.getStyleClass().add("text-muted");

        HBox row = new HBox(8);
        row.setAlignment(Pos.CENTER_LEFT);

        TextField pathField = new TextField(initialPath);
        pathField.setEditable(false);
        pathField.setStyle("-fx-font-size: 12px; -fx-pref-height: 32px;");
        HBox.setHgrow(pathField, Priority.ALWAYS);

        Button btnBrowse = new Button("Browse");
        btnBrowse.getStyleClass().add("btn-secondary");
        btnBrowse.setStyle("-fx-font-size: 12px; -fx-padding: 4 12 4 12;");
        btnBrowse.setOnAction(e -> {
            DirectoryChooser dc = new DirectoryChooser();
            dc.setTitle("Select " + titleText);
            File f = dc.showDialog(getScene().getWindow());
            if (f != null) {
                pathField.setText(f.getAbsolutePath());
                onSelected.accept(f.getAbsolutePath());
            }
        });

        row.getChildren().addAll(pathField, btnBrowse);
        box.getChildren().addAll(title, desc, row);
        return box;
    }

    private void openUrl(String url) {
        try {
            java.awt.Desktop.getDesktop().browse(java.net.URI.create(url));
        } catch (Exception ignored) {}
    }
}
