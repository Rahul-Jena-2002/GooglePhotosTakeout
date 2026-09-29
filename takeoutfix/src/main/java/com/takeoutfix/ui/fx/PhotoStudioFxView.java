package com.takeoutfix.ui.fx;

import com.takeoutfix.restore.infrastructure.NativeExifToolEngine;
import com.takeoutfix.studio.*;
import javafx.application.Platform;
import javafx.beans.property.SimpleStringProperty;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.*;
import javafx.scene.input.Dragboard;
import javafx.scene.input.TransferMode;
import javafx.scene.layout.*;
import javafx.stage.DirectoryChooser;
import javafx.stage.FileChooser;
import javafx.stage.Stage;

import java.io.File;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;

/**
 * Modern JavaFX Photo Studio Suite: All-in-One Batch EXIF and Metadata Editor.
 * Focuses on high-accuracy Batch Date Remediation (time shift, timezone offsets, scanned album sequencing),
 * supplemented by optional Geotagging and Creator Presets.
 */
public class PhotoStudioFxView extends VBox {

    private final Stage stage;
    private final Consumer<WorkspaceType> onNavigate;
    private final PhotoStudioService studioService;

    // File Queue & Table
    private final ObservableList<StudioFileItem> queueItems = FXCollections.observableArrayList();
    private final TableView<StudioFileItem> tableView = new TableView<>();
    private final Label queueSummaryLabel = new Label("0 files queued");

    // Date Controls
    private final ToggleGroup dateModeGroup = new ToggleGroup();
    private final RadioButton rbTimeShift = new RadioButton("Time Shift (± Offset)");
    private final RadioButton rbFixedIncrement = new RadioButton("Fixed Date + Auto-Increment");
    private final RadioButton rbKeepOriginal = new RadioButton("Keep Original Dates");

    private final ComboBox<String> cbShiftDirection = new ComboBox<>();
    private final Spinner<Integer> spDays = new Spinner<>(0, 365, 0);
    private final Spinner<Integer> spHours = new Spinner<>(0, 23, 0);
    private final Spinner<Integer> spMinutes = new Spinner<>(0, 59, 0);
    private final Spinner<Integer> spSeconds = new Spinner<>(0, 59, 0);

    private final DatePicker dpBaseDate = new DatePicker(LocalDate.now());
    private final Spinner<Integer> spBaseHour = new Spinner<>(0, 23, 12);
    private final Spinner<Integer> spBaseMinute = new Spinner<>(0, 59, 0);
    private final Spinner<Integer> spBaseSecond = new Spinner<>(0, 59, 0);
    private final ComboBox<String> cbIncrementInterval = new ComboBox<>();

    private final VBox shiftControlBox = new VBox(8);
    private final VBox fixedControlBox = new VBox(8);

    // Location Controls
    private final CheckBox chkEnableLocation = new CheckBox("Enable Geotagging");
    private final CheckBox chkStripGps = new CheckBox("Strip All GPS (Privacy Mode)");
    private final TextField txtLatitude = new TextField();
    private final TextField txtLongitude = new TextField();

    // Presets Controls
    private final CheckBox chkEnablePresets = new CheckBox("Apply Creator Metadata");
    private final TextField txtArtist = new TextField();
    private final TextField txtCopyright = new TextField();
    private final TextField txtDescription = new TextField();

    // Output & Execution
    private final CheckBox chkSafeExport = new CheckBox("Export to separate folder (Safe Non-Destructive)");
    private final CheckBox chkSyncOsTime = new CheckBox("Synchronize OS File Creation & Modified Times");
    private File customOutputDir;
    private final Label lblOutputDir = new Label("TakeoutFix_Studio_Export");

    private final ProgressBar progressBar = new ProgressBar(0);
    private final Label progressLabel = new Label("Ready to edit.");
    private final Button btnExecute = new Button("Execute Batch Edit");
    private final Button btnDryRun = new Button("Dry Run Preview");
    private final Button btnCancel = new Button("Cancel");
    private final AtomicBoolean cancelToken = new AtomicBoolean(false);
    private final com.takeoutfix.auth.UserSyncBridgeService userService;

    public PhotoStudioFxView(Stage stage, NativeExifToolEngine exifEngine, com.takeoutfix.auth.UserSyncBridgeService userService, Consumer<WorkspaceType> onNavigate) {
        this.stage = stage;
        this.userService = userService;
        this.onNavigate = onNavigate;
        this.studioService = new PhotoStudioService(exifEngine);

        getStyleClass().add("workspace-view");
        setSpacing(14);
        setPadding(new Insets(16, 20, 16, 20));

        // 1. Header
        buildHeader();

        // 2. Main Content (Left: Table / Right: Controls)
        SplitPane splitPane = new SplitPane();
        splitPane.getItems().addAll(buildQueuePanel(), buildControlSidebar());
        splitPane.setDividerPositions(0.62);
        VBox.setVgrow(splitPane, Priority.ALWAYS);

        // 3. Execution Footer
        VBox footer = buildExecutionFooter();

        getChildren().addAll(splitPane, footer);

        // Setup default output dir
        customOutputDir = new File(System.getProperty("user.home"), "TakeoutFix_Studio_Export");
        lblOutputDir.setText(customOutputDir.getAbsolutePath());

        // Setup listeners to refresh previews in real time
        setupLivePreviewListeners();
    }

    private void buildHeader() {
        HBox header = new HBox(12);
        header.setAlignment(Pos.CENTER_LEFT);

        var icon = UiIcons.createSvgIcon(UiIcons.SLIDERS, 24, "#8b5cf6");

        VBox titleBox = new VBox(2);
        Label title = new Label("Edit Photo Details");
        title.setStyle("-fx-font-size: 18px; -fx-font-weight: 700;");

        Label subtitle = new Label("Batch correct photo timestamps, shift timezones, update locations, and edit photo metadata.");
        subtitle.setStyle("-fx-font-size: 12px; -fx-text-fill: #71717a;");

        titleBox.getChildren().addAll(title, subtitle);
        header.getChildren().addAll(icon, titleBox);

        getChildren().add(header);
    }

    private VBox buildQueuePanel() {
        VBox panel = new VBox(10);
        panel.setPadding(new Insets(10));

        // Top Toolbar
        HBox toolbar = new HBox(8);
        toolbar.setAlignment(Pos.CENTER_LEFT);

        Button btnAddFiles = new Button("Add Photos");
        btnAddFiles.getStyleClass().add("btn-secondary");
        btnAddFiles.setGraphic(UiIcons.createSvgIcon(UiIcons.FOLDER, 14, "currentColor"));
        btnAddFiles.setOnAction(e -> handleAddFiles());

        Button btnAddFolder = new Button("Add Folder");
        btnAddFolder.getStyleClass().add("btn-secondary");
        btnAddFolder.setGraphic(UiIcons.createSvgIcon(UiIcons.OUTPUT_FOLDER, 14, "currentColor"));
        btnAddFolder.setOnAction(e -> handleAddFolder());

        Button btnClear = new Button("Clear");
        btnClear.getStyleClass().add("btn-ghost");
        btnClear.setGraphic(UiIcons.createSvgIcon(UiIcons.TRASH, 14, "currentColor"));
        btnClear.setOnAction(e -> {
            queueItems.clear();
            updateQueueCount();
        });

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        queueSummaryLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: 600; -fx-text-fill: #8b5cf6;");

        toolbar.getChildren().addAll(btnAddFiles, btnAddFolder, btnClear, spacer, queueSummaryLabel);

        // Table
        setupTable();
        VBox.setVgrow(tableView, Priority.ALWAYS);

        panel.getChildren().addAll(toolbar, tableView);
        return panel;
    }

    private void setupTable() {
        tableView.setItems(queueItems);
        tableView.setPlaceholder(new Label("Drag and drop photos or folders here to begin batch editing."));

        TableColumn<StudioFileItem, String> colName = new TableColumn<>("File");
        colName.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().getFileName()));
        colName.setPrefWidth(220);

        TableColumn<StudioFileItem, String> colSize = new TableColumn<>("Size");
        colSize.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().getFormattedSize()));
        colSize.setPrefWidth(80);

        TableColumn<StudioFileItem, String> colOrig = new TableColumn<>("Original Date");
        colOrig.setCellValueFactory(d -> new SimpleStringProperty(
                DateShiftCalculator.toDisplayString(d.getValue().getOriginalDate())));
        colOrig.setPrefWidth(160);

        TableColumn<StudioFileItem, String> colNew = new TableColumn<>("➔ New Date Preview");
        colNew.setCellValueFactory(d -> new SimpleStringProperty(
                DateShiftCalculator.toDisplayString(d.getValue().getNewDate())));
        colNew.setPrefWidth(170);
        colNew.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(String item, boolean empty) {
                super.updateItem(item, empty);
                if (empty || item == null) {
                    setText(null);
                    setStyle("");
                } else {
                    setText(item);
                    StudioFileItem rowItem = getTableRow() != null ? getTableRow().getItem() : null;
                    if (rowItem != null && rowItem.getOriginalDate() != null && rowItem.getNewDate() != null &&
                            !rowItem.getOriginalDate().equals(rowItem.getNewDate())) {
                        setStyle("-fx-font-weight: 700; -fx-text-fill: #8b5cf6;");
                    } else {
                        setStyle("");
                    }
                }
            }
        });

        TableColumn<StudioFileItem, String> colStatus = new TableColumn<>("Status");
        colStatus.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().getStatus()));
        colStatus.setPrefWidth(100);

        tableView.getColumns().addAll(colName, colSize, colOrig, colNew, colStatus);

        // Drag & Drop
        tableView.setOnDragOver(event -> {
            if (event.getGestureSource() != tableView && event.getDragboard().hasFiles()) {
                event.acceptTransferModes(TransferMode.COPY_OR_MOVE);
            }
            event.consume();
        });

        tableView.setOnDragDropped(event -> {
            Dragboard db = event.getDragboard();
            boolean success = false;
            if (db.hasFiles()) {
                addFilesAsync(db.getFiles());
                success = true;
            }
            event.setDropCompleted(success);
            event.consume();
        });
    }

    private ScrollPane buildControlSidebar() {
        VBox sidebar = new VBox(10);
        sidebar.setPadding(new Insets(10));
        sidebar.setPrefWidth(390);

        // Segmented Tab Switcher for Sidebar
        HBox tabSwitcher = new HBox(4);
        tabSwitcher.setAlignment(Pos.CENTER);
        tabSwitcher.getStyleClass().add("inner-container");
        tabSwitcher.setStyle("-fx-padding: 4; -fx-background-radius: 8;");

        Button tabDate = createTabButton("Dates", true);
        Button tabCreator = createTabButton("Creator & Presets", false);
        Button tabLocation = createTabButton("Location", false);

        tabSwitcher.getChildren().addAll(tabDate, tabCreator, tabLocation);

        // Panels
        VBox cardDate = buildDateRemediationCard();
        VBox cardPresets = buildPresetsCard();
        VBox cardLocation = buildLocationCard();

        cardPresets.setVisible(false);
        cardPresets.setManaged(false);
        cardLocation.setVisible(false);
        cardLocation.setManaged(false);

        tabDate.setOnAction(e -> {
            activateTab(tabDate, tabCreator, tabLocation);
            cardDate.setVisible(true); cardDate.setManaged(true);
            cardPresets.setVisible(false); cardPresets.setManaged(false);
            cardLocation.setVisible(false); cardLocation.setManaged(false);
        });

        tabCreator.setOnAction(e -> {
            activateTab(tabCreator, tabDate, tabLocation);
            cardDate.setVisible(false); cardDate.setManaged(false);
            cardPresets.setVisible(true); cardPresets.setManaged(true);
            cardLocation.setVisible(false); cardLocation.setManaged(false);
        });

        tabLocation.setOnAction(e -> {
            activateTab(tabLocation, tabDate, tabCreator);
            cardDate.setVisible(false); cardDate.setManaged(false);
            cardPresets.setVisible(false); cardPresets.setManaged(false);
            cardLocation.setVisible(true); cardLocation.setManaged(true);
        });

        // Add controls to sidebar
        sidebar.getChildren().addAll(tabSwitcher, cardDate, cardPresets, cardLocation);

        ScrollPane scroll = new ScrollPane(sidebar);
        scroll.setFitToWidth(true);
        scroll.setStyle("-fx-background-color: transparent; -fx-border-color: transparent;");
        return scroll;
    }

    private Button createTabButton(String text, boolean active) {
        Button btn = new Button(text);
        btn.setMaxWidth(Double.MAX_VALUE);
        HBox.setHgrow(btn, Priority.ALWAYS);
        btn.getStyleClass().add(active ? "btn-secondary" : "btn-ghost");
        btn.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-padding: 6 10; -fx-background-radius: 6;");
        return btn;
    }

    private void activateTab(Button active, Button other1, Button other2) {
        active.getStyleClass().removeAll("btn-ghost", "btn-secondary");
        active.getStyleClass().add("btn-secondary");
        other1.getStyleClass().removeAll("btn-ghost", "btn-secondary");
        other1.getStyleClass().add("btn-ghost");
        other2.getStyleClass().removeAll("btn-ghost", "btn-secondary");
        other2.getStyleClass().add("btn-ghost");
    }

    private VBox buildDateRemediationCard() {
        VBox card = new VBox(10);
        card.getStyleClass().add("glass-card");

        HBox titleBox = new HBox(8);
        titleBox.setAlignment(Pos.CENTER_LEFT);
        var icon = UiIcons.createSvgIcon(UiIcons.CALENDAR, 16, "#8b5cf6");
        Label lblTitle = new Label("Batch Date Remediation");
        lblTitle.getStyleClass().add("card-title");
        titleBox.getChildren().addAll(icon, lblTitle);

        Label lblSub = new Label("Shift relative time, fix timezones, or auto-increment scanned photos.");
        lblSub.getStyleClass().add("card-subtitle");

        // Radio selectors
        rbTimeShift.setToggleGroup(dateModeGroup);
        rbFixedIncrement.setToggleGroup(dateModeGroup);
        rbKeepOriginal.setToggleGroup(dateModeGroup);
        rbTimeShift.setSelected(true);

        VBox modeSelectBox = new VBox(6, rbTimeShift, rbFixedIncrement, rbKeepOriginal);

        // 1. Time Shift Box
        cbShiftDirection.getItems().addAll("+ Advance Time (Add)", "- Delay Time (Subtract)");
        cbShiftDirection.setValue("+ Advance Time (Add)");
        cbShiftDirection.setMaxWidth(Double.MAX_VALUE);

        GridPane gridSpinners = new GridPane();
        gridSpinners.setHgap(8);
        gridSpinners.setVgap(6);

        gridSpinners.add(new Label("Days:"), 0, 0);
        gridSpinners.add(spDays, 1, 0);
        gridSpinners.add(new Label("Hours:"), 2, 0);
        gridSpinners.add(spHours, 3, 0);

        gridSpinners.add(new Label("Mins:"), 0, 1);
        gridSpinners.add(spMinutes, 1, 1);
        gridSpinners.add(new Label("Secs:"), 2, 1);
        gridSpinners.add(spSeconds, 3, 1);

        HBox presetsBox = new HBox(6);
        presetsBox.setAlignment(Pos.CENTER_LEFT);
        Button btnDstPlus = createSmallPill("+1 Hr (DST)", () -> { spHours.getValueFactory().setValue(1); cbShiftDirection.setValue("+ Advance Time (Add)"); });
        Button btnDstMinus = createSmallPill("-1 Hr", () -> { spHours.getValueFactory().setValue(1); cbShiftDirection.setValue("- Delay Time (Subtract)"); });
        Button btnIst = createSmallPill("+5:30 IST", () -> { spHours.getValueFactory().setValue(5); spMinutes.getValueFactory().setValue(30); cbShiftDirection.setValue("+ Advance Time (Add)"); });
        Button btnReset = createSmallPill("Reset", () -> {
            spDays.getValueFactory().setValue(0);
            spHours.getValueFactory().setValue(0);
            spMinutes.getValueFactory().setValue(0);
            spSeconds.getValueFactory().setValue(0);
        });
        presetsBox.getChildren().addAll(btnDstPlus, btnDstMinus, btnIst, btnReset);

        shiftControlBox.getChildren().addAll(new Label("Direction & Offsets:"), cbShiftDirection, gridSpinners, presetsBox);

        // 2. Fixed Increment Box
        cbIncrementInterval.getItems().addAll("+10 seconds", "+30 seconds", "+1 minute (Scanned Albums)", "+2 minutes", "+5 minutes");
        cbIncrementInterval.setValue("+1 minute (Scanned Albums)");
        cbIncrementInterval.setMaxWidth(Double.MAX_VALUE);

        HBox timeSpinners = new HBox(6, spBaseHour, new Label(":"), spBaseMinute, new Label(":"), spBaseSecond);
        timeSpinners.setAlignment(Pos.CENTER_LEFT);

        fixedControlBox.getChildren().addAll(
                new Label("Base Starting Date:"),
                dpBaseDate,
                new Label("Base Starting Time:"),
                timeSpinners,
                new Label("Auto-Increment Interval:"),
                cbIncrementInterval
        );
        fixedControlBox.setVisible(false);
        fixedControlBox.setManaged(false);

        // Mode switch listener
        dateModeGroup.selectedToggleProperty().addListener((obs, oldVal, newVal) -> {
            boolean isShift = rbTimeShift.isSelected();
            boolean isFixed = rbFixedIncrement.isSelected();
            shiftControlBox.setVisible(isShift);
            shiftControlBox.setManaged(isShift);
            fixedControlBox.setVisible(isFixed);
            fixedControlBox.setManaged(isFixed);
            recalculatePreviews();
        });

        card.getChildren().addAll(titleBox, lblSub, modeSelectBox, new Separator(), shiftControlBox, fixedControlBox);
        return card;
    }

    private VBox buildPresetsCard() {
        VBox card = new VBox(12);
        card.getStyleClass().add("glass-card");

        HBox titleBox = new HBox(8);
        titleBox.setAlignment(Pos.CENTER_LEFT);
        var icon = UiIcons.createSvgIcon(UiIcons.USER, 18, "#3b82f6");
        Label lblTitle = new Label("Creator & Copyright Presets");
        lblTitle.getStyleClass().add("card-title");
        titleBox.getChildren().addAll(icon, lblTitle);

        Label lblSub = new Label("Embed your artist credentials and copyright protection directly into EXIF/IPTC/XMP.");
        lblSub.getStyleClass().add("card-subtitle");

        chkEnablePresets.setSelected(true);
        chkEnablePresets.setText("Apply this metadata to queued batch");
        chkEnablePresets.setStyle("-fx-font-weight: 600; -fx-text-fill: #3b82f6;");

        VBox fieldsBox = new VBox(10);

        // Load saved preferences
        java.util.prefs.Preferences prefs = java.util.prefs.Preferences.userNodeForPackage(PhotoStudioFxView.class);
        String savedArtist = prefs.get("studio_artist", "");
        String savedCopyright = prefs.get("studio_copyright", "");
        String savedDesc = prefs.get("studio_description", "");

        if (!savedArtist.isBlank()) txtArtist.setText(savedArtist);
        if (!savedCopyright.isBlank()) txtCopyright.setText(savedCopyright);
        if (!savedDesc.isBlank()) txtDescription.setText(savedDesc);

        // Artist
        Label lblArtist = new Label("Photographer / Artist Name:");
        lblArtist.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-text-fill: #a1a1aa;");
        txtArtist.setPromptText("Enter your custom name or studio (e.g. John Doe)");
        txtArtist.setStyle("-fx-padding: 8 10; -fx-background-radius: 6;");

        // Copyright
        Label lblCopyright = new Label("Copyright Notice:");
        lblCopyright.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-text-fill: #a1a1aa;");
        txtCopyright.setPromptText("© 2026 Your Name. All rights reserved.");
        txtCopyright.setStyle("-fx-padding: 8 10; -fx-background-radius: 6;");

        HBox quickStamps = new HBox(6);
        Button btnStampAllRights = createSmallPill("© All Rights Reserved", () -> {
            String author = txtArtist.getText().isBlank() ? "Photographer" : txtArtist.getText().trim();
            txtCopyright.setText("© " + LocalDate.now().getYear() + " " + author + ". All rights reserved.");
            chkEnablePresets.setSelected(true);
        });
        Button btnCcBy = createSmallPill("CC BY 4.0", () -> {
            String author = txtArtist.getText().isBlank() ? "Author" : txtArtist.getText().trim();
            txtCopyright.setText("Licensed under Creative Commons Attribution 4.0 by " + author + ".");
            chkEnablePresets.setSelected(true);
        });
        Button btnCc0 = createSmallPill("CC0 (Public Domain)", () -> {
            txtCopyright.setText("Dedicated to the Public Domain (CC0 1.0).");
            chkEnablePresets.setSelected(true);
        });
        Button btnClearPresets = createSmallPill("Clear", () -> {
            txtArtist.clear();
            txtCopyright.clear();
            txtDescription.clear();
        });
        quickStamps.getChildren().addAll(btnStampAllRights, btnCcBy, btnCc0, btnClearPresets);

        // Description
        Label lblDesc = new Label("Image Caption / Description:");
        lblDesc.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-text-fill: #a1a1aa;");
        txtDescription.setPromptText("Optional shoot notes, client code, or photo description...");
        txtDescription.setStyle("-fx-padding: 8 10; -fx-background-radius: 6;");

        // Save Custom Defaults Row
        HBox saveRow = new HBox(8);
        saveRow.setAlignment(Pos.CENTER_LEFT);
        Button btnSaveDefault = new Button("Save as My Default Preset");
        btnSaveDefault.getStyleClass().add("btn-secondary");
        btnSaveDefault.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-padding: 5 10; -fx-background-radius: 6;");
        Label lblSavedFeedback = new Label();
        lblSavedFeedback.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-text-fill: #10b981;");

        btnSaveDefault.setOnAction(e -> {
            prefs.put("studio_artist", txtArtist.getText().trim());
            prefs.put("studio_copyright", txtCopyright.getText().trim());
            prefs.put("studio_description", txtDescription.getText().trim());
            lblSavedFeedback.setText("✓ Saved as your default preset");
        });
        saveRow.getChildren().addAll(btnSaveDefault, lblSavedFeedback);

        fieldsBox.getChildren().addAll(
                lblArtist, txtArtist,
                lblCopyright, txtCopyright, quickStamps,
                lblDesc, txtDescription,
                saveRow
        );

        chkEnablePresets.setOnAction(e -> fieldsBox.setDisable(!chkEnablePresets.isSelected()));

        card.getChildren().addAll(titleBox, lblSub, chkEnablePresets, new Separator(), fieldsBox);
        return card;
    }

    private VBox buildLocationCard() {
        VBox card = new VBox(12);
        card.getStyleClass().add("glass-card");

        HBox titleBox = new HBox(8);
        titleBox.setAlignment(Pos.CENTER_LEFT);
        var icon = UiIcons.createSvgIcon(UiIcons.GLOBE, 18, "#10b981");
        Label lblTitle = new Label("Location & Geotagging");
        lblTitle.getStyleClass().add("card-title");
        titleBox.getChildren().addAll(icon, lblTitle);

        Label lblSub = new Label("Inject GPS coordinates or strip all location metadata for privacy.");
        lblSub.getStyleClass().add("card-subtitle");

        chkEnableLocation.setSelected(false);
        chkEnableLocation.setText("Enable Geotag Coordinates");
        chkEnableLocation.setStyle("-fx-font-weight: 600; -fx-text-fill: #10b981;");

        chkStripGps.setSelected(false);
        chkStripGps.setText("Strip All GPS Tags (Privacy Mode)");
        chkStripGps.setStyle("-fx-font-weight: 600; -fx-text-fill: #f87171;");

        VBox fieldsBox = new VBox(8);
        txtLatitude.setPromptText("Latitude (e.g. 35.6762)");
        txtLongitude.setPromptText("Longitude (e.g. 139.6503)");
        txtLatitude.setStyle("-fx-padding: 8 10; -fx-background-radius: 6;");
        txtLongitude.setStyle("-fx-padding: 8 10; -fx-background-radius: 6;");

        HBox quickCities = new HBox(6);
        quickCities.getChildren().addAll(
                createSmallPill("Tokyo", () -> { txtLatitude.setText("35.6762"); txtLongitude.setText("139.6503"); chkEnableLocation.setSelected(true); }),
                createSmallPill("New York", () -> { txtLatitude.setText("40.7128"); txtLongitude.setText("-74.0060"); chkEnableLocation.setSelected(true); }),
                createSmallPill("London", () -> { txtLatitude.setText("51.5074"); txtLongitude.setText("-0.1278"); chkEnableLocation.setSelected(true); }),
                createSmallPill("Mumbai", () -> { txtLatitude.setText("19.0760"); txtLongitude.setText("72.8777"); chkEnableLocation.setSelected(true); })
        );

        fieldsBox.getChildren().addAll(new Label("Coordinates (Decimal Degrees):"), txtLatitude, txtLongitude, quickCities);
        fieldsBox.setDisable(true);

        chkEnableLocation.setOnAction(e -> {
            boolean enabled = chkEnableLocation.isSelected();
            fieldsBox.setDisable(!enabled);
            if (enabled) chkStripGps.setSelected(false);
        });

        chkStripGps.setOnAction(e -> {
            if (chkStripGps.isSelected()) {
                chkEnableLocation.setSelected(false);
                fieldsBox.setDisable(true);
            }
        });

        card.getChildren().addAll(titleBox, lblSub, chkEnableLocation, chkStripGps, new Separator(), fieldsBox);
        return card;
    }

    private VBox buildExecutionFooter() {
        VBox footer = new VBox(10);
        footer.getStyleClass().add("glass-card");

        // Settings row
        chkSafeExport.setSelected(true);
        chkSyncOsTime.setSelected(true);

        HBox outDirRow = new HBox(8);
        outDirRow.setAlignment(Pos.CENTER_LEFT);
        Button btnChooseDir = new Button("Browse Destination");
        btnChooseDir.getStyleClass().add("btn-secondary");
        btnChooseDir.setOnAction(e -> {
            DirectoryChooser dc = new DirectoryChooser();
            dc.setTitle("Select Studio Export Destination Folder");
            File sel = dc.showDialog(stage);
            if (sel != null) {
                customOutputDir = sel;
                lblOutputDir.setText(sel.getAbsolutePath());
            }
        });
        lblOutputDir.setStyle("-fx-font-size: 11px; -fx-text-fill: #71717a;");
        outDirRow.getChildren().addAll(btnChooseDir, lblOutputDir);

        HBox settingsRow = new HBox(16, chkSafeExport, chkSyncOsTime);
        settingsRow.setAlignment(Pos.CENTER_LEFT);

        // Progress bar and actions
        progressBar.setMaxWidth(Double.MAX_VALUE);
        progressBar.setVisible(false);

        HBox actionRow = new HBox(10);
        actionRow.setAlignment(Pos.CENTER_RIGHT);

        btnDryRun.getStyleClass().add("btn-secondary");
        btnDryRun.setOnAction(e -> handleDryRun());

        btnExecute.getStyleClass().add("btn-primary");
        btnExecute.setGraphic(UiIcons.createSvgIcon(UiIcons.PLAY, 14, "currentColor"));
        btnExecute.setOnAction(e -> handleExecute());

        btnCancel.getStyleClass().add("btn-ghost");
        btnCancel.setVisible(false);
        btnCancel.setOnAction(e -> cancelToken.set(true));

        actionRow.getChildren().addAll(progressLabel, new Region(), btnDryRun, btnExecute, btnCancel);
        HBox.setHgrow(actionRow.getChildren().get(1), Priority.ALWAYS);

        footer.getChildren().addAll(settingsRow, outDirRow, progressBar, actionRow);
        return footer;
    }

    private Button createSmallPill(String text, Runnable action) {
        Button btn = new Button(text);
        btn.getStyleClass().add("btn-ghost");
        btn.setStyle("-fx-font-size: 10px; -fx-padding: 3 8 3 8; -fx-background-radius: 4; -fx-border-color: #27272a; -fx-border-radius: 4;");
        btn.setOnAction(e -> {
            if (action != null) action.run();
            recalculatePreviews();
        });
        return btn;
    }

    private void setupLivePreviewListeners() {
        spDays.valueProperty().addListener((o, oldV, newV) -> recalculatePreviews());
        spHours.valueProperty().addListener((o, oldV, newV) -> recalculatePreviews());
        spMinutes.valueProperty().addListener((o, oldV, newV) -> recalculatePreviews());
        spSeconds.valueProperty().addListener((o, oldV, newV) -> recalculatePreviews());
        cbShiftDirection.valueProperty().addListener((o, oldV, newV) -> recalculatePreviews());

        dpBaseDate.valueProperty().addListener((o, oldV, newV) -> recalculatePreviews());
        spBaseHour.valueProperty().addListener((o, oldV, newV) -> recalculatePreviews());
        spBaseMinute.valueProperty().addListener((o, oldV, newV) -> recalculatePreviews());
        spBaseSecond.valueProperty().addListener((o, oldV, newV) -> recalculatePreviews());
        cbIncrementInterval.valueProperty().addListener((o, oldV, newV) -> recalculatePreviews());
    }

    private StudioEditRequest buildCurrentRequest() {
        StudioEditRequest req = new StudioEditRequest();

        // 1. Date Mode
        if (rbKeepOriginal.isSelected()) {
            req.setDateMode(StudioEditRequest.DateMode.NONE);
        } else if (rbTimeShift.isSelected()) {
            req.setDateMode(StudioEditRequest.DateMode.RELATIVE_SHIFT);
            int multiplier = cbShiftDirection.getValue() != null && cbShiftDirection.getValue().startsWith("-") ? -1 : 1;
            req.setShiftDays(spDays.getValue() * multiplier);
            req.setShiftHours(spHours.getValue() * multiplier);
            req.setShiftMinutes(spMinutes.getValue() * multiplier);
            req.setShiftSeconds(spSeconds.getValue() * multiplier);
        } else if (rbFixedIncrement.isSelected()) {
            req.setDateMode(StudioEditRequest.DateMode.FIXED_INCREMENT);
            LocalDate date = dpBaseDate.getValue() != null ? dpBaseDate.getValue() : LocalDate.now();
            LocalTime time = LocalTime.of(spBaseHour.getValue(), spBaseMinute.getValue(), spBaseSecond.getValue());
            req.setBaseDateTime(LocalDateTime.of(date, time));

            String intervalStr = cbIncrementInterval.getValue();
            int intervalSec = 60;
            if (intervalStr != null) {
                if (intervalStr.contains("10 sec")) intervalSec = 10;
                else if (intervalStr.contains("30 sec")) intervalSec = 30;
                else if (intervalStr.contains("1 min")) intervalSec = 60;
                else if (intervalStr.contains("2 min")) intervalSec = 120;
                else if (intervalStr.contains("5 min")) intervalSec = 300;
            }
            req.setIncrementSeconds(intervalSec);
        }

        // 2. Location
        req.setUpdateLocation(chkEnableLocation.isSelected());
        req.setStripGps(chkStripGps.isSelected());
        try {
            if (!txtLatitude.getText().isBlank()) req.setLatitude(Double.parseDouble(txtLatitude.getText().trim()));
            if (!txtLongitude.getText().isBlank()) req.setLongitude(Double.parseDouble(txtLongitude.getText().trim()));
        } catch (NumberFormatException ignored) {}

        // 3. Presets
        req.setUpdatePresets(chkEnablePresets.isSelected());
        req.setArtist(txtArtist.getText());
        req.setCopyright(txtCopyright.getText());
        req.setDescription(txtDescription.getText());

        // 4. Output Safety
        req.setInPlace(!chkSafeExport.isSelected());
        req.setOutputDirectory(customOutputDir);
        req.setSyncOsTimestamps(chkSyncOsTime.isSelected());

        return req;
    }

    private void recalculatePreviews() {
        StudioEditRequest req = buildCurrentRequest();
        for (int i = 0; i < queueItems.size(); i++) {
            StudioFileItem item = queueItems.get(i);
            LocalDateTime newDate = DateShiftCalculator.calculateNewDate(item.getOriginalDate(), req, i);
            item.setNewDate(newDate);
        }
        tableView.refresh();
    }

    private void handleDryRun() {

        recalculatePreviews();
        for (StudioFileItem item : queueItems) {
            item.setStatus("Previewed");
        }
        tableView.refresh();
        progressLabel.setText("Dry run preview refreshed for " + queueItems.size() + " files.");
    }

    private void handleExecute() {

        if (queueItems.isEmpty()) {
            showAlert("No Files Queued", "Please add photos or folders before executing batch edit.");
            return;
        }

        StudioEditRequest req = buildCurrentRequest();
        btnExecute.setDisable(true);
        btnDryRun.setDisable(true);
        btnCancel.setVisible(true);
        progressBar.setVisible(true);
        progressBar.setProgress(0);
        cancelToken.set(false);

        List<StudioFileItem> snapshot = new ArrayList<>(queueItems);

        studioService.executeBatchAsync(snapshot, req, (current, total, item) -> {
            Platform.runLater(() -> {
                progressBar.setProgress((double) current / total);
                progressLabel.setText(String.format("Processing %d of %d: %s", current, total, item.getFileName()));
                tableView.refresh();
            });
        }, cancelToken).thenAccept(result -> {
            Platform.runLater(() -> {
                btnExecute.setDisable(false);
                btnDryRun.setDisable(false);
                btnCancel.setVisible(false);
                progressBar.setVisible(false);
                progressLabel.setText(String.format("Batch complete: %d succeeded, %d failed.",
                        result.getSuccessful(), result.getFailed()));
                try {
                    new com.takeoutfix.shared.history.OperationHistoryService().recordOperation(
                            "Edit Photo Details",
                            result.getFailed() == 0 ? "SUCCESS" : "WARNING",
                            null,
                            java.time.Instant.now(),
                            result.getSuccessful(),
                            0,
                            String.format("Batch metadata edit: %d updated, %d failed.", result.getSuccessful(), result.getFailed())
                    );
                } catch (Exception ignored) {}

                Alert alert = new Alert(Alert.AlertType.INFORMATION);
                alert.setTitle("Photo Studio — Batch Edit Complete");
                alert.setHeaderText("Batch Execution Finished");
                alert.setContentText(String.format("Successfully updated %d photos.\nFailed: %d\nDestination: %s",
                        result.getSuccessful(), result.getFailed(),
                        req.isInPlace() ? "Modified in place" : req.getOutputDirectory().getAbsolutePath()));
                alert.showAndWait();
            });
        });
    }

    private void handleAddFiles() {
        FileChooser fc = new FileChooser();
        fc.setTitle("Select Photos or Videos to Edit");
        fc.getExtensionFilters().add(new FileChooser.ExtensionFilter("Media Files",
                "*.jpg", "*.jpeg", "*.png", "*.heic", "*.mp4", "*.mov", "*.dng", "*.cr2", "*.nef"));
        List<File> files = fc.showOpenMultipleDialog(stage);
        if (files != null && !files.isEmpty()) {
            addFilesAsync(files);
        }
    }

    private void handleAddFolder() {
        DirectoryChooser dc = new DirectoryChooser();
        dc.setTitle("Select Folder of Photos to Edit");
        File dir = dc.showDialog(stage);
        if (dir != null && dir.isDirectory()) {
            List<File> files = new ArrayList<>();
            scanDir(dir, files);
            addFilesAsync(files);
        }
    }

    private void scanDir(File dir, List<File> accumulator) {
        File[] files = dir.listFiles();
        if (files == null) return;
        for (File f : files) {
            if (f.isDirectory()) {
                scanDir(f, accumulator);
            } else {
                String name = f.getName().toLowerCase();
                if (name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".png") ||
                        name.endsWith(".heic") || name.endsWith(".mp4") || name.endsWith(".mov") ||
                        name.endsWith(".dng") || name.endsWith(".cr2") || name.endsWith(".nef")) {
                    accumulator.add(f);
                }
            }
        }
    }

    private void addFilesAsync(List<File> files) {
        progressLabel.setText("Inspecting original metadata for " + files.size() + " files...");
        new Thread(() -> {
            List<StudioFileItem> loaded = new ArrayList<>();
            for (File f : files) {
                LocalDateTime orig = studioService.readOriginalDate(f);
                loaded.add(new StudioFileItem(f, orig));
            }
            Platform.runLater(() -> {
                queueItems.addAll(loaded);
                updateQueueCount();
                recalculatePreviews();
                progressLabel.setText("Loaded " + files.size() + " files.");
            });
        }).start();
    }

    private void updateQueueCount() {
        queueSummaryLabel.setText(queueItems.size() + " files queued");
    }

    private void showAlert(String title, String message) {
        Alert alert = new Alert(Alert.AlertType.WARNING);
        alert.setTitle(title);
        alert.setHeaderText(null);
        alert.setContentText(message);
        alert.showAndWait();
    }
}
