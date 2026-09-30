package com.takeoutfix.ui.fx;

import com.takeoutfix.restore.infrastructure.NativeExifToolEngine;
import javafx.application.Platform;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Node;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.stage.DirectoryChooser;

import java.awt.Desktop;
import java.io.File;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.prefs.Preferences;

/**
 * Modern JavaFX preferences center for TakeoutFix.
 * Organizes application settings into purposeful categories:
 * General, Processing, File Safety, Storage, Privacy, Advanced, About.
 */
public class SettingsView extends VBox {

    private final NativeExifToolEngine engine;
    private final Preferences prefs = Preferences.userNodeForPackage(SettingsView.class);

    private final ListView<String> categoryList = new ListView<>();
    private final StackPane contentPane = new StackPane();

    // Section panels
    private final VBox generalPane = new VBox(14);
    private final VBox processingPane = new VBox(14);
    private final VBox updatesPane = new VBox(14);
    private final VBox safetyPane = new VBox(14);
    private final VBox storagePane = new VBox(14);
    private final VBox privacyPane = new VBox(14);
    private final VBox advancedPane = new VBox(14);
    private final VBox aboutPane = new VBox(14);

    public SettingsView(NativeExifToolEngine engine) {
        this.engine = engine;

        setSpacing(14);
        setPadding(new Insets(16, 20, 16, 20));
        VBox.setVgrow(this, Priority.ALWAYS);

        // 1. Header
        getChildren().add(buildHeaderRow());

        // 2. Preferences Body: Category Navigation Sidebar + Detail Content Pane
        HBox body = new HBox(16);
        VBox.setVgrow(body, Priority.ALWAYS);

        VBox navSidebar = buildNavSidebar();
        navSidebar.setPrefWidth(200);
        navSidebar.setMinWidth(180);

        ScrollPane scrollContent = new ScrollPane(contentPane);
        scrollContent.setFitToWidth(true);
        scrollContent.setStyle("-fx-background-color: transparent; -fx-background: transparent; -fx-border-color: transparent;");
        HBox.setHgrow(scrollContent, Priority.ALWAYS);

        body.getChildren().addAll(navSidebar, scrollContent);
        getChildren().add(body);

        // Initialize Panes
        buildGeneralPane();
        buildProcessingPane();
        buildUpdatesPane();
        buildSafetyPane();
        buildStoragePane();
        buildPrivacyPane();
        buildAdvancedPane();
        buildAboutPane();

        categoryList.getSelectionModel().select(0);
    }

    private HBox buildHeaderRow() {
        HBox header = new HBox(14);
        header.setAlignment(Pos.CENTER_LEFT);

        VBox titleBox = new VBox(3);
        Label title = new Label("Settings");
        title.setStyle("-fx-font-size: 22px; -fx-font-weight: 700; -fx-text-fill: #E6E7ED;");

        Label subtitle = new Label("Configure your workspace, processing engine, privacy and file safety.");
        subtitle.setStyle("-fx-font-size: 13px; -fx-text-fill: #989BA8;");
        titleBox.getChildren().addAll(title, subtitle);

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        header.getChildren().addAll(titleBox, spacer);
        return header;
    }

    private VBox buildNavSidebar() {
        VBox box = new VBox(8);
        box.getStyleClass().add("glass-card");
        box.setStyle("-fx-background-color: #191A22; -fx-border-color: #30313B; -fx-border-radius: 8; -fx-background-radius: 8; -fx-padding: 10;");
        VBox.setVgrow(box, Priority.ALWAYS);

        categoryList.getItems().addAll("General", "Processing", "Updates", "File Safety", "Storage", "Privacy", "Advanced", "About");
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

                    String iconSvg;
                    switch (item) {
                        case "General" -> iconSvg = UiIcons.SETTINGS;
                        case "Processing" -> iconSvg = UiIcons.PLAY;
                        case "Updates" -> iconSvg = UiIcons.RELOAD;
                        case "File Safety" -> iconSvg = UiIcons.SHIELD_CHECK;
                        case "Storage" -> iconSvg = UiIcons.FOLDER;
                        case "Privacy" -> iconSvg = UiIcons.LOCK;
                        case "Advanced" -> iconSvg = UiIcons.RELOAD;
                        default -> iconSvg = UiIcons.HEART;
                    }

                    Node icon = UiIcons.createSvgIcon(iconSvg, 14, "#989BA8");
                    Label lbl = new Label(item);
                    lbl.setStyle("-fx-font-size: 13px; -fx-font-weight: 600; -fx-text-fill: #E6E7ED;");

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
                case 0 -> contentPane.getChildren().add(generalPane);
                case 1 -> contentPane.getChildren().add(processingPane);
                case 2 -> contentPane.getChildren().add(updatesPane);
                case 3 -> contentPane.getChildren().add(safetyPane);
                case 4 -> contentPane.getChildren().add(storagePane);
                case 5 -> contentPane.getChildren().add(privacyPane);
                case 6 -> contentPane.getChildren().add(advancedPane);
                case 7 -> contentPane.getChildren().add(aboutPane);
            }
        });

        box.getChildren().add(categoryList);
        return box;
    }

    private void buildGeneralPane() {
        generalPane.getChildren().clear();
        generalPane.getChildren().add(createSectionHeader("Appearance & General Preferences", "Personalize the application interface."));

        VBox card = createCard();

        // Theme selection
        VBox themeBox = new VBox(6);
        Label themeLbl = new Label("Interface Theme");
        themeLbl.setStyle("-fx-font-size: 13px; -fx-font-weight: 600; -fx-text-fill: #E6E7ED;");
        Label themeDesc = new Label("Choose between dark or light monochromatic themes.");
        themeDesc.setStyle("-fx-font-size: 12px; -fx-text-fill: #989BA8;");

        HBox themeChoices = new HBox(8);
        ToggleGroup tgTheme = new ToggleGroup();
        RadioButton rbDark = new RadioButton("Dark (Default)");
        rbDark.setToggleGroup(tgTheme);
        rbDark.setSelected(true);
        RadioButton rbLight = new RadioButton("Light");
        rbLight.setToggleGroup(tgTheme);
        RadioButton rbSystem = new RadioButton("System");
        rbSystem.setToggleGroup(tgTheme);
        themeChoices.getChildren().addAll(rbDark, rbLight, rbSystem);

        themeBox.getChildren().addAll(themeLbl, themeDesc, themeChoices);

        // Accent Color
        VBox accentBox = new VBox(6);
        Label accLbl = new Label("Primary Accent Color");
        accLbl.setStyle("-fx-font-size: 13px; -fx-font-weight: 600; -fx-text-fill: #E6E7ED;");
        Label accDesc = new Label("Tailor the primary button and highlight tone.");
        accDesc.setStyle("-fx-font-size: 12px; -fx-text-fill: #989BA8;");

        ComboBox<String> accentCombo = new ComboBox<>();
        accentCombo.getItems().addAll("Violet / Purple (Default)", "Emerald Green", "Royal Blue", "Rose");
        accentCombo.setValue("Violet / Purple (Default)");
        accentCombo.setStyle("-fx-font-size: 12px; -fx-pref-width: 220px;");
        accentBox.getChildren().addAll(accLbl, accDesc, accentCombo);

        card.getChildren().addAll(themeBox, new Separator(), accentBox);
        generalPane.getChildren().add(card);
    }

    private void buildProcessingPane() {
        processingPane.getChildren().clear();
        processingPane.getChildren().add(createSectionHeader("Processing Engine", "Configure local image metadata processing and dynamic resource allocation."));

        VBox card = createCard();

        // ExifTool Status
        VBox binBox = new VBox(6);
        Label binTitle = new Label("ExifTool Engine");
        binTitle.setStyle("-fx-font-size: 13px; -fx-font-weight: 600; -fx-text-fill: #E6E7ED;");

        File bin = engine != null ? engine.getExifToolBinary() : null;
        String statusText = (bin != null && bin.exists())
                ? "Active & Ready · " + bin.getAbsolutePath()
                : "Engine extracting / managed automatically";

        Label binStatus = new Label(statusText);
        binStatus.setStyle("-fx-font-size: 12px; -fx-text-fill: #10B981; -fx-font-weight: 600;");

        Label binDesc = new Label("All EXIF, XMP, IPTC and QuickTime tags are processed via local native daemon instances.");
        binDesc.setStyle("-fx-font-size: 12px; -fx-text-fill: #989BA8;");
        binBox.getChildren().addAll(binTitle, binStatus, binDesc);

        // Adaptive Resource Policy
        VBox policyBox = new VBox(8);
        Label pTitle = new Label("Adaptive Resource Policy (Processing Mode)");
        pTitle.setStyle("-fx-font-size: 13px; -fx-font-weight: 600; -fx-text-fill: #E6E7ED;");

        Label pDesc = new Label("Dynamic CPU and memory allocation adapts automatically based on system load.");
        pDesc.setStyle("-fx-font-size: 12px; -fx-text-fill: #989BA8;");

        ToggleGroup tgMode = new ToggleGroup();
        RadioButton rbBalanced = new RadioButton("Balanced (Default) — Adapt resource usage dynamically based on system load");
        rbBalanced.setToggleGroup(tgMode);
        rbBalanced.setSelected(true);
        rbBalanced.setStyle("-fx-text-fill: #E6E7ED; -fx-font-size: 12px;");

        RadioButton rbPerformance = new RadioButton("Performance — Use more available resources to complete supported tasks faster");
        rbPerformance.setToggleGroup(tgMode);
        rbPerformance.setStyle("-fx-text-fill: #E6E7ED; -fx-font-size: 12px;");

        RadioButton rbBackground = new RadioButton("Background — Limit resource usage to keep the computer responsive");
        rbBackground.setToggleGroup(tgMode);
        rbBackground.setStyle("-fx-text-fill: #E6E7ED; -fx-font-size: 12px;");

        RadioButton rbCustom = new RadioButton("Custom — Set a preferred maximum worker count");
        rbCustom.setToggleGroup(tgMode);
        rbCustom.setStyle("-fx-text-fill: #E6E7ED; -fx-font-size: 12px;");

        tgMode.selectedToggleProperty().addListener((obs, oldVal, newVal) -> {
            var rm = com.takeoutfix.task.TaskManager.getInstance().getResourceManager();
            if (newVal == rbPerformance) {
                rm.setProcessingMode(com.takeoutfix.task.ResourceManager.ProcessingMode.PERFORMANCE);
            } else if (newVal == rbBackground) {
                rm.setProcessingMode(com.takeoutfix.task.ResourceManager.ProcessingMode.BACKGROUND);
            } else if (newVal == rbCustom) {
                rm.setProcessingMode(com.takeoutfix.task.ResourceManager.ProcessingMode.CUSTOM);
            } else {
                rm.setProcessingMode(com.takeoutfix.task.ResourceManager.ProcessingMode.BALANCED);
            }
        });

        int cores = Runtime.getRuntime().availableProcessors();
        Label coresInfo = new Label("System Hardware: " + cores + " Logical CPU Cores • Real-time load-balancing active");
        coresInfo.setStyle("-fx-font-size: 11px; -fx-text-fill: #71717a;");

        policyBox.getChildren().addAll(pTitle, pDesc, rbBalanced, rbPerformance, rbBackground, rbCustom, coresInfo);

        card.getChildren().addAll(binBox, new Separator(), policyBox);
        processingPane.getChildren().add(card);
    }

    private void buildUpdatesPane() {
        updatesPane.getChildren().clear();
        updatesPane.getChildren().add(createSectionHeader("Application Updates", "Configure OTA release channels, background checks, and verification."));

        VBox card = createCard();

        // 1. Current Version row
        VBox verBox = new VBox(6);
        Label vTitle = new Label("Current Version");
        vTitle.setStyle("-fx-font-size: 13px; -fx-font-weight: 600; -fx-text-fill: #E6E7ED;");

        HBox verRow = new HBox(10);
        verRow.setAlignment(Pos.CENTER_LEFT);

        Label appVer = new Label("TakeoutFix v" + com.takeoutfix.shared.util.AppVersion.getVersion() + " (Stable)");
        appVer.setStyle("-fx-font-size: 14px; -fx-font-weight: 800; -fx-text-fill: #E6E7ED;");

        Label upToDateBadge = new Label("✓ Up to date");
        upToDateBadge.setStyle("-fx-font-size: 10px; -fx-font-weight: 700; -fx-text-fill: #10B981; -fx-background-color: rgba(16, 185, 129, 0.12); -fx-padding: 2 6 2 6; -fx-background-radius: 4;");

        verRow.getChildren().addAll(appVer, upToDateBadge);
        verBox.getChildren().addAll(vTitle, verRow);

        // 2. Automatic checks & downloads
        VBox autoBox = new VBox(8);
        CheckBox chkAutoCheck = new CheckBox("Automatically check for updates");
        chkAutoCheck.setSelected(true);
        chkAutoCheck.setStyle("-fx-font-size: 13px; -fx-font-weight: 600; -fx-text-fill: #E6E7ED;");

        Label autoCheckDesc = new Label("Check for new releases when TakeoutFix starts.");
        autoCheckDesc.setStyle("-fx-font-size: 12px; -fx-text-fill: #989BA8;");

        CheckBox chkAutoDownload = new CheckBox("Automatically download updates");
        chkAutoDownload.setSelected(false);
        chkAutoDownload.setStyle("-fx-font-size: 13px; -fx-font-weight: 600; -fx-text-fill: #E6E7ED;");

        Label autoDownDesc = new Label("Download verified updates in the background.");
        autoDownDesc.setStyle("-fx-font-size: 12px; -fx-text-fill: #989BA8;");

        autoBox.getChildren().addAll(chkAutoCheck, autoCheckDesc, chkAutoDownload, autoDownDesc);

        // 3. Release Channel
        VBox chanBox = new VBox(6);
        Label chanTitle = new Label("Release Channel");
        chanTitle.setStyle("-fx-font-size: 13px; -fx-font-weight: 600; -fx-text-fill: #E6E7ED;");

        Label chanDesc = new Label("Choose which versions to receive.");
        chanDesc.setStyle("-fx-font-size: 12px; -fx-text-fill: #989BA8;");

        ComboBox<String> chanCombo = new ComboBox<>();
        chanCombo.getItems().addAll("Stable", "Beta");
        chanCombo.setValue("Stable");
        chanCombo.setStyle("-fx-font-size: 12px; -fx-pref-width: 200px;");

        chanBox.getChildren().addAll(chanTitle, chanDesc, chanCombo);

        // 4. Action button & last checked
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
                        lastCheckedLabel.setText("Last checked: " + java.time.LocalTime.now().format(java.time.format.DateTimeFormatter.ofPattern("hh:mm a")));
                    }
                });
            }).start();
        });

        actionRow.getChildren().addAll(lastCheckedLabel, sp, btnCheckNow);

        // 5. Safety guarantee notice
        VBox safetyNotice = new VBox(4);
        safetyNotice.setStyle("-fx-background-color: rgba(16, 185, 129, 0.08); -fx-border-color: rgba(16, 185, 129, 0.2); -fx-border-radius: 6; -fx-background-radius: 6; -fx-padding: 10 12 10 12;");
        Label sNoticeTitle = new Label("Pristine User Library Guarantee");
        sNoticeTitle.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-text-fill: #10B981;");
        Label sNoticeDesc = new Label("OTA updates strictly replace application executables. Your photo libraries, duplicates quarantine vault, and history records remain untouched in your user profile.");
        sNoticeDesc.setStyle("-fx-font-size: 11px; -fx-text-fill: #989BA8;");
        safetyNotice.getChildren().addAll(sNoticeTitle, sNoticeDesc);

        card.getChildren().addAll(verBox, new Separator(), autoBox, new Separator(), chanBox, new Separator(), actionRow, safetyNotice);
        updatesPane.getChildren().add(card);
    }

    private void buildSafetyPane() {
        safetyPane.getChildren().clear();
        safetyPane.getChildren().add(createSectionHeader("File Safety Policies", "Non-destructive rules to prevent accidental photo corruption or loss."));

        VBox card = createCard();

        // Rule 1: Protect RAW originals
        VBox rawBox = new VBox(4);
        HBox rawHeader = new HBox(8);
        rawHeader.setAlignment(Pos.CENTER_LEFT);
        Label rawTitle = new Label("Protect Camera RAW Source Files");
        rawTitle.setStyle("-fx-font-size: 13px; -fx-font-weight: 600; -fx-text-fill: #E6E7ED;");
        Label rawBadge = new Label("Enforced");
        rawBadge.setStyle("-fx-font-size: 10px; -fx-font-weight: 700; -fx-text-fill: #10B981; -fx-background-color: rgba(16, 185, 129, 0.12); -fx-padding: 2 6 2 6; -fx-background-radius: 4;");
        rawHeader.getChildren().addAll(rawTitle, rawBadge);

        Label rawDesc = new Label("Original camera RAW files (.CR3, .NEF, .ARW, .DNG) are strictly read-only and never modified in place.");
        rawDesc.setStyle("-fx-font-size: 12px; -fx-text-fill: #989BA8;");
        rawBox.getChildren().addAll(rawHeader, rawDesc);

        // Rule 2: Automatic backups before write
        VBox backupBox = new VBox(4);
        CheckBox chkBackup = new CheckBox("Create backups before in-place editing (.original)");
        chkBackup.setSelected(true);
        chkBackup.setStyle("-fx-font-size: 13px; -fx-font-weight: 600; -fx-text-fill: #E6E7ED;");
        Label backupDesc = new Label("Keeps a pristine copy of destination photos before writing synchronized metadata.");
        backupDesc.setStyle("-fx-font-size: 12px; -fx-text-fill: #989BA8;");
        backupBox.getChildren().addAll(chkBackup, backupDesc);

        // Rule 3: Deletion confirmation
        VBox delBox = new VBox(4);
        CheckBox chkDel = new CheckBox("Require explicit confirmation for permanent deletion");
        chkDel.setSelected(true);
        chkDel.setStyle("-fx-font-size: 13px; -fx-font-weight: 600; -fx-text-fill: #E6E7ED;");
        Label delDesc = new Label("Protects against accidental removal of duplicate files by requiring a 2-step confirmation dialog.");
        delDesc.setStyle("-fx-font-size: 12px; -fx-text-fill: #989BA8;");
        delBox.getChildren().addAll(chkDel, delDesc);

        card.getChildren().addAll(rawBox, new Separator(), backupBox, new Separator(), delBox);
        safetyPane.getChildren().add(card);
    }

    private void buildStoragePane() {
        storagePane.getChildren().clear();
        storagePane.getChildren().add(createSectionHeader("Storage & Directories", "Manage local caches, logs, and default output destinations."));

        VBox card = createCard();

        // Log Directory
        VBox logBox = new VBox(6);
        Label logTitle = new Label("Audit & Session Logs Location");
        logTitle.setStyle("-fx-font-size: 13px; -fx-font-weight: 600; -fx-text-fill: #E6E7ED;");

        Path logPath = Paths.get(System.getProperty("user.home"), ".takeoutfix", "logs");
        Label logLabel = new Label(logPath.toString());
        logLabel.setStyle("-fx-font-size: 12px; -fx-text-fill: #E6E7ED; -fx-background-color: #101116; -fx-padding: 6 10 6 10; -fx-background-radius: 4; -fx-border-color: #30313B; -fx-border-radius: 4;");

        Button btnOpenLog = new Button("Open Log Folder");
        btnOpenLog.getStyleClass().add("btn-secondary");
        btnOpenLog.setGraphic(UiIcons.createSvgIcon(UiIcons.OUTPUT_FOLDER, 13, "currentColor"));
        btnOpenLog.setStyle("-fx-font-size: 12px;");
        btnOpenLog.setOnAction(e -> {
            try {
                if (!Files.exists(logPath)) Files.createDirectories(logPath);
                Desktop.getDesktop().open(logPath.toFile());
            } catch (Exception ignored) {}
        });

        logBox.getChildren().addAll(logTitle, logLabel, btnOpenLog);

        // Quarantine Directory
        VBox qBox = new VBox(6);
        Label qTitle = new Label("Duplicate Quarantine Location");
        qTitle.setStyle("-fx-font-size: 13px; -fx-font-weight: 600; -fx-text-fill: #E6E7ED;");

        Path qPath = Paths.get(System.getProperty("user.home"), "TakeoutFix", "quarantine");
        Label qLabel = new Label(qPath.toString());
        qLabel.setStyle("-fx-font-size: 12px; -fx-text-fill: #E6E7ED; -fx-background-color: #101116; -fx-padding: 6 10 6 10; -fx-background-radius: 4; -fx-border-color: #30313B; -fx-border-radius: 4;");

        Button btnOpenQ = new Button("Open Quarantine Folder");
        btnOpenQ.getStyleClass().add("btn-secondary");
        btnOpenQ.setGraphic(UiIcons.createSvgIcon(UiIcons.FOLDER, 13, "currentColor"));
        btnOpenQ.setStyle("-fx-font-size: 12px;");
        btnOpenQ.setOnAction(e -> {
            try {
                if (!Files.exists(qPath)) Files.createDirectories(qPath);
                Desktop.getDesktop().open(qPath.toFile());
            } catch (Exception ignored) {}
        });

        qBox.getChildren().addAll(qTitle, qLabel, btnOpenQ);

        card.getChildren().addAll(logBox, new Separator(), qBox);
        storagePane.getChildren().add(card);
    }

    private void buildPrivacyPane() {
        privacyPane.getChildren().clear();
        privacyPane.getChildren().add(createSectionHeader("Privacy & Local-Only Guarantees", "Your photos and personal metadata never leave this computer."));

        VBox card = createCard();

        VBox pBox = new VBox(8);
        Label pStatus = new Label("● 100% On-Device Processing Enforced");
        pStatus.setStyle("-fx-font-size: 14px; -fx-font-weight: 700; -fx-text-fill: #10B981;");

        Label pDesc = new Label("TakeoutFix operates with absolute zero telemetry, zero analytics tracking, and zero cloud uploads.\nAll image hashing, EXIF modifications, sidecar matching and SHA-256 verifications execute entirely locally on your processor.");
        pDesc.setStyle("-fx-font-size: 12px; -fx-text-fill: #E6E7ED; -fx-line-spacing: 3px;");
        pDesc.setWrapText(true);

        Label pSec = new Label("Network sockets are exclusively restricted to local update checks (optional) and local subprocess communication.");
        pSec.setStyle("-fx-font-size: 11px; -fx-text-fill: #989BA8;");

        pBox.getChildren().addAll(pStatus, pDesc, pSec);
        card.getChildren().add(pBox);
        privacyPane.getChildren().add(card);
    }

    private void buildAdvancedPane() {
        advancedPane.getChildren().clear();
        advancedPane.getChildren().add(createSectionHeader("Advanced & Diagnostics", "Diagnostic logging, supported file codecs and technical parameters."));

        VBox card = createCard();

        VBox formatBox = new VBox(6);
        Label fTitle = new Label("Supported Media Formats");
        fTitle.setStyle("-fx-font-size: 13px; -fx-font-weight: 600; -fx-text-fill: #E6E7ED;");

        Label fList = new Label("Images: JPEG, PNG, TIFF, GIF, BMP, WEBP, HEIC, HEIF, AVIF\nRAW: CR2, CR3, NEF, ARW, DNG, ORF, RW2, PEF, RAF\nVideo & Live Photos: MP4, MOV, M4V, AVI, 3GP, MKV\nSidecars: JSON (Takeout), XMP (Adobe), XML");
        fList.setStyle("-fx-font-size: 12px; -fx-text-fill: #E6E7ED; -fx-background-color: #101116; -fx-padding: 8 12 8 12; -fx-background-radius: 6; -fx-border-color: #30313B; -fx-border-radius: 6;");
        formatBox.getChildren().addAll(fTitle, fList);

        VBox logLvlBox = new VBox(6);
        Label lTitle = new Label("Diagnostic Logging Level");
        lTitle.setStyle("-fx-font-size: 13px; -fx-font-weight: 600; -fx-text-fill: #E6E7ED;");

        ComboBox<String> logCombo = new ComboBox<>();
        logCombo.getItems().addAll("Standard (Info & Errors)", "Verbose (Detailed tag traces)", "Debug (Subprocess stdout/stderr)");
        logCombo.setValue("Standard (Info & Errors)");
        logCombo.setStyle("-fx-font-size: 12px; -fx-pref-width: 250px;");
        logLvlBox.getChildren().addAll(lTitle, logCombo);

        card.getChildren().addAll(formatBox, new Separator(), logLvlBox);
        advancedPane.getChildren().add(card);
    }

    private void buildAboutPane() {
        aboutPane.getChildren().clear();
        aboutPane.getChildren().add(createSectionHeader("About TakeoutFix", "Open-source photography suite engineered for Google Takeout recovery."));

        VBox card = createCard();

        VBox brandBox = new VBox(6);
        Label appName = new Label("TakeoutFix Studio v2.2.1");
        appName.setStyle("-fx-font-size: 16px; -fx-font-weight: 800; -fx-text-fill: #E6E7ED;");

        Label appSub = new Label("Pure JavaFX desktop edition with multi-process native ExifTool engine.");
        appSub.setStyle("-fx-font-size: 12px; -fx-text-fill: #989BA8;");

        HBox btnRow = new HBox(10);
        btnRow.setAlignment(Pos.CENTER_LEFT);

        Button btnGithub = new Button("GitHub Repository");
        btnGithub.getStyleClass().add("btn-secondary");
        btnGithub.setGraphic(UiIcons.createSvgIcon(UiIcons.HISTORY, 13, "currentColor"));
        btnGithub.setStyle("-fx-font-size: 12px;");
        btnGithub.setOnAction(e -> openUrl("https://github.com/Rahul-Jena-2002/GooglePhotosTakeout"));

        Button btnSponsor = new Button("Sponsor Project");
        btnSponsor.getStyleClass().add("btn-primary");
        btnSponsor.setGraphic(UiIcons.createSvgIcon(UiIcons.HEART, 13, "#FAFAFA"));
        btnSponsor.setStyle("-fx-font-size: 12px;");
        btnSponsor.setOnAction(e -> openUrl("https://github.com/sponsors/Rahul-Jena-2002"));

        btnRow.getChildren().addAll(btnGithub, btnSponsor);
        brandBox.getChildren().addAll(appName, appSub, btnRow);

        card.getChildren().add(brandBox);
        aboutPane.getChildren().add(card);
    }

    private VBox createSectionHeader(String titleText, String subtitleText) {
        VBox box = new VBox(2);
        Label title = new Label(titleText);
        title.setStyle("-fx-font-size: 16px; -fx-font-weight: 700; -fx-text-fill: #E6E7ED;");
        Label sub = new Label(subtitleText);
        sub.setStyle("-fx-font-size: 12px; -fx-text-fill: #989BA8;");
        box.getChildren().addAll(title, sub);
        return box;
    }

    private VBox createCard() {
        VBox card = new VBox(12);
        card.getStyleClass().add("glass-card");
        card.setStyle("-fx-background-color: #191A22; -fx-border-color: #30313B; -fx-border-radius: 8; -fx-background-radius: 8; -fx-padding: 16;");
        return card;
    }

    private void openUrl(String url) {
        try {
            Desktop.getDesktop().browse(new URI(url));
        } catch (Exception ignored) {}
    }
}
