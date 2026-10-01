package com.takeoutfix.ui.fx;

import com.takeoutfix.restore.infrastructure.NativeExifToolEngine;
import com.takeoutfix.studio.*;
import javafx.application.Platform;
import javafx.beans.property.SimpleStringProperty;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Node;
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
    private final Label queueSummaryLabel = new Label("0 photos queued");
    private final CheckBox selectAllCheck = new CheckBox();

    // Date Controls
    private final ToggleGroup dateModeGroup = new ToggleGroup();
    private final RadioButton rbTimeShift = new RadioButton("Shift Dates");
    private final RadioButton rbFixedIncrement = new RadioButton("Set Start Date & Increment");
    private final RadioButton rbKeepOriginal = new RadioButton("Keep Dates Unchanged");

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
    private final VBox keepOriginalNoticeBox = new VBox(6);
    private final Label lblOperationSummary = new Label("Summary: Move dates forward by 0 days, 0 hours");

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
    private final CheckBox chkSafeExport = new CheckBox("Save Edited Copies");
    private final CheckBox chkSyncOsTime = new CheckBox("Also Update File Timestamps");
    private File customOutputDir;
    private File sourceDir;
    private boolean userCustomizedOutputDir = false;
    private String currentTab = "Dates";
    private final Label lblOutputDir = new Label();
    private Button btnResetDir;

    private final ProgressBar progressBar = new ProgressBar(0);
    private final Label progressLabel = new Label("Add photos to get started.");
    private final Button btnExecute = new Button("Apply Changes");
    private final Button btnDryRun = new Button("Preview Changes");
    private final Button btnCancel = new Button("Cancel");
    private final AtomicBoolean cancelToken = new AtomicBoolean(false);
    private final com.takeoutfix.auth.UserSyncBridgeService userService;

    public PhotoStudioFxView(Stage stage, NativeExifToolEngine exifEngine, com.takeoutfix.auth.UserSyncBridgeService userService, Consumer<WorkspaceType> onNavigate) {
        this.stage = stage;
        this.userService = userService;
        this.onNavigate = onNavigate;
        this.studioService = new PhotoStudioService(exifEngine);

        getStyleClass().add("workspace-view");
        setSpacing(16);
        setPadding(new Insets(24));

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

        // Destination is initially blank until photos are added or user browses
        customOutputDir = null;
        userCustomizedOutputDir = false;
        sourceDir = null;
        lblOutputDir.setText("Auto-managed: [source]/TakeoutFix_Studio_Export");

        // Setup listeners to refresh previews in real time
        setupLivePreviewListeners();
        updateQueueCount();
    }

    private void buildHeader() {
        HBox header = new HBox(12);
        header.setAlignment(Pos.CENTER_LEFT);

        StackPane iconTile = new StackPane(UiIcons.createSvgIcon(UiIcons.SLIDERS, 16, "currentColor"));
        iconTile.getStyleClass().add("header-icon-tile");

        VBox titleBox = new VBox(2);
        Label title = new Label("Edit Metadata");
        title.getStyleClass().addAll("page-title", "header-title");

        Label subtitle = new Label("Batch-adjust photo dates, correct time zones, update GPS information and manage metadata across multiple files.");
        subtitle.getStyleClass().addAll("page-description", "header-subtitle");

        titleBox.getChildren().addAll(title, subtitle);
        header.getChildren().addAll(iconTile, titleBox);

        getChildren().add(header);
    }

    private VBox buildEmptyState() {
        VBox box = new VBox(12);
        box.setAlignment(Pos.CENTER);
        box.setPadding(new Insets(36, 20, 36, 20));

        Node uploadIcon = UiIcons.createSvgIcon(UiIcons.UPLOAD, 44, "#A78BFA");

        Label title = new Label("Drop photos here");
        title.setStyle("-fx-font-size: 16px; -fx-font-weight: 700;"); title.getStyleClass().add("empty-state-title");

        Label subtitle = new Label("Drag and drop photos or folders here to begin batch editing.");
        subtitle.setStyle("-fx-font-size: 13px;");

        Button btnBrowse = new Button("Browse Photos");
        btnBrowse.getStyleClass().add("btn-secondary");
        btnBrowse.setGraphic(UiIcons.createSvgIcon(UiIcons.FOLDER, 14, "currentColor"));
        btnBrowse.setGraphicTextGap(7);
        btnBrowse.setStyle("-fx-font-size: 13px; -fx-font-weight: 600; -fx-pref-height: 36px; -fx-padding: 8 16 8 16; -fx-cursor: hand;");
        btnBrowse.setOnAction(e -> handleAddFiles());

        box.getChildren().addAll(uploadIcon, title, subtitle, btnBrowse);

        box.setOnDragOver(event -> {
            if (event.getGestureSource() != box && event.getDragboard().hasFiles()) {
                event.acceptTransferModes(TransferMode.COPY_OR_MOVE);
            }
            event.consume();
        });

        box.setOnDragDropped(event -> {
            Dragboard db = event.getDragboard();
            boolean success = false;
            if (db.hasFiles() && !db.getFiles().isEmpty()) {
                File first = db.getFiles().get(0);
                sourceDir = first.isDirectory() ? first : first.getParentFile();
                if (!userCustomizedOutputDir) {
                    updateAutoOutputDir();
                }
                addFilesAsync(db.getFiles());
                success = true;
            }
            event.setDropCompleted(success);
            event.consume();
        });

        return box;
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
        btnAddFiles.setGraphicTextGap(6);
        btnAddFiles.setStyle("-fx-font-size: 13px; -fx-pref-height: 34px;");
        btnAddFiles.setOnAction(e -> handleAddFiles());

        Button btnAddFolder = new Button("Add Folder");
        btnAddFolder.getStyleClass().add("btn-secondary");
        btnAddFolder.setGraphic(UiIcons.createSvgIcon(UiIcons.OUTPUT_FOLDER, 14, "currentColor"));
        btnAddFolder.setGraphicTextGap(6);
        btnAddFolder.setStyle("-fx-font-size: 13px; -fx-pref-height: 34px;");
        btnAddFolder.setOnAction(e -> handleAddFolder());

        Button btnClear = new Button("Clear");
        btnClear.getStyleClass().add("btn-ghost");
        btnClear.setGraphic(UiIcons.createSvgIcon(UiIcons.TRASH, 14, "currentColor"));
        btnClear.setGraphicTextGap(6);
        btnClear.setStyle("-fx-font-size: 13px; -fx-pref-height: 34px;");
        btnClear.setOnAction(e -> {
            queueItems.clear();
            updateQueueCount();
        });

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        queueSummaryLabel.setStyle("-fx-font-size: 12.5px; -fx-font-weight: 700;"); queueSummaryLabel.getStyleClass().add("brand-accent");

        toolbar.getChildren().addAll(btnAddFiles, btnAddFolder, btnClear, spacer, queueSummaryLabel);

        // Table
        setupTable();
        VBox.setVgrow(tableView, Priority.ALWAYS);

        panel.getChildren().addAll(toolbar, tableView);
        return panel;
    }

    private void setupTable() {
        tableView.setItems(queueItems);
        tableView.setPlaceholder(buildEmptyState());
        tableView.getSelectionModel().setSelectionMode(SelectionMode.MULTIPLE);

        // 1. Select All Checkbox Column
        selectAllCheck.setSelected(true);
        selectAllCheck.setOnAction(e -> {
            boolean sel = selectAllCheck.isSelected();
            for (StudioFileItem item : queueItems) {
                item.setSelected(sel);
            }
            tableView.refresh();
            updateQueueCount();
        });

        TableColumn<StudioFileItem, Boolean> colSelect = new TableColumn<>();
        colSelect.setGraphic(selectAllCheck);
        colSelect.setPrefWidth(40);
        colSelect.setSortable(false);
        colSelect.setCellFactory(col -> new TableCell<>() {
            private final CheckBox check = new CheckBox();
            {
                check.setOnAction(e -> {
                    StudioFileItem item = getTableRow() != null ? getTableRow().getItem() : null;
                    if (item != null) {
                        item.setSelected(check.isSelected());
                        updateQueueCount();
                    }
                });
            }
            @Override
            protected void updateItem(Boolean item, boolean empty) {
                super.updateItem(item, empty);
                if (empty || getTableRow() == null || getTableRow().getItem() == null) {
                    setGraphic(null);
                } else {
                    StudioFileItem fileItem = getTableRow().getItem();
                    check.setSelected(fileItem.isSelected());
                    setGraphic(check);
                }
            }
        });

        // 2. File Column with Vector Icon
        TableColumn<StudioFileItem, String> colName = new TableColumn<>("File");
        colName.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().getFileName()));
        colName.setPrefWidth(200);
        colName.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(String item, boolean empty) {
                super.updateItem(item, empty);
                if (empty || item == null) {
                    setText(null);
                    setGraphic(null);
                } else {
                    setText(item);
                    setGraphic(UiIcons.createSvgIcon(UiIcons.CAMERA, 13, "#A78BFA"));
                    setGraphicTextGap(7);
                    setStyle("-fx-font-weight: 600; -fx-font-size: 13px;"); getStyleClass().add("text-primary");
                }
            }
        });

        // 3. Size Column (Numeric Sorting)
        TableColumn<StudioFileItem, Number> colSize = new TableColumn<>("Size");
        colSize.setCellValueFactory(d -> new javafx.beans.property.SimpleLongProperty(d.getValue().getFileSize()));
        colSize.setPrefWidth(85);
        colSize.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(Number item, boolean empty) {
                super.updateItem(item, empty);
                if (empty || getTableRow() == null || getTableRow().getItem() == null) {
                    setText(null);
                } else {
                    setText(getTableRow().getItem().getFormattedSize());
                    setStyle("-fx-font-size: 12px;"); getStyleClass().add("text-secondary");
                }
            }
        });

        // 4. Original Date Column (Chronological Sorting)
        TableColumn<StudioFileItem, LocalDateTime> colOrig = new TableColumn<>("Original Date");
        colOrig.setCellValueFactory(d -> new javafx.beans.property.SimpleObjectProperty<>(d.getValue().getOriginalDate()));
        colOrig.setPrefWidth(165);
        colOrig.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(LocalDateTime item, boolean empty) {
                super.updateItem(item, empty);
                if (empty || item == null) {
                    setText(empty ? null : "No timestamp");
                    setStyle("-fx-text-fill: #A1A1AA; -fx-font-style: italic; -fx-font-size: 12px;");
                } else {
                    setText(DateShiftCalculator.toDisplayString(item));
                    setStyle("-fx-font-size: 12px;"); getStyleClass().add("text-secondary");
                }
            }
        });

        // 5. Proposed New Date Column
        TableColumn<StudioFileItem, LocalDateTime> colNew = new TableColumn<>("➔ Proposed New Date");
        colNew.setCellValueFactory(d -> new javafx.beans.property.SimpleObjectProperty<>(d.getValue().getNewDate()));
        colNew.setPrefWidth(180);
        colNew.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(LocalDateTime item, boolean empty) {
                super.updateItem(item, empty);
                if (empty) {
                    setText(null);
                    setStyle("");
                } else {
                    StudioFileItem rowItem = getTableRow() != null ? getTableRow().getItem() : null;
                    if (item == null) {
                        setText("—");
                        setStyle("-fx-text-fill: #A1A1AA; -fx-font-size: 12px;");
                    } else {
                        setText(DateShiftCalculator.toDisplayString(item));
                        if (rowItem != null && rowItem.getOriginalDate() != null &&
                                !rowItem.getOriginalDate().equals(item)) {
                            setStyle("-fx-font-weight: 700; -fx-text-fill: #22C55E; -fx-font-size: 12px;");
                        } else {
                            setStyle("-fx-font-size: 12px;"); getStyleClass().add("text-secondary");
                        }
                    }
                }
            }
        });

        // 6. Status Column
        TableColumn<StudioFileItem, String> colStatus = new TableColumn<>("Status");
        colStatus.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().getStatus()));
        colStatus.setPrefWidth(95);
        colStatus.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(String item, boolean empty) {
                super.updateItem(item, empty);
                if (empty || item == null) {
                    setText(null);
                    setStyle("");
                } else {
                    setText(item);
                    if ("Success".equalsIgnoreCase(item) || "Updated".equalsIgnoreCase(item)) {
                        setStyle("-fx-text-fill: #22C55E; -fx-font-weight: 700; -fx-font-size: 12px;");
                    } else if ("Failed".equalsIgnoreCase(item)) {
                        setStyle("-fx-text-fill: #EF4444; -fx-font-weight: 700; -fx-font-size: 12px;");
                    } else if ("Previewed".equalsIgnoreCase(item)) {
                        setStyle("-fx-text-fill: #A78BFA; -fx-font-weight: 700; -fx-font-size: 12px;");
                    } else {
                        setStyle("-fx-font-size: 12px;"); getStyleClass().add("text-secondary");
                    }
                }
            }
        });

        tableView.getColumns().addAll(colSelect, colName, colSize, colOrig, colNew, colStatus);

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
            if (db.hasFiles() && !db.getFiles().isEmpty()) {
                File first = db.getFiles().get(0);
                sourceDir = first.isDirectory() ? first : first.getParentFile();
                if (!userCustomizedOutputDir) {
                    updateAutoOutputDir();
                }
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
        Button tabCreator = createTabButton("Creator & Copyright", false);
        Button tabLocation = createTabButton("GPS & Location", false);

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
            currentTab = "Dates";
            activateTab(tabDate, tabCreator, tabLocation);
            cardDate.setVisible(true); cardDate.setManaged(true);
            cardPresets.setVisible(false); cardPresets.setManaged(false);
            cardLocation.setVisible(false); cardLocation.setManaged(false);
            updateAutoOutputDir();
        });

        tabCreator.setOnAction(e -> {
            currentTab = "Creator & Copyright";
            activateTab(tabCreator, tabDate, tabLocation);
            cardDate.setVisible(false); cardDate.setManaged(false);
            cardPresets.setVisible(true); cardPresets.setManaged(true);
            cardLocation.setVisible(false); cardLocation.setManaged(false);
            updateAutoOutputDir();
        });

        tabLocation.setOnAction(e -> {
            currentTab = "GPS & Location";
            activateTab(tabLocation, tabDate, tabCreator);
            cardDate.setVisible(false); cardDate.setManaged(false);
            cardPresets.setVisible(false); cardPresets.setManaged(false);
            cardLocation.setVisible(true); cardLocation.setManaged(true);
            updateAutoOutputDir();
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
        btn.setStyle("-fx-font-size: 12px; -fx-font-weight: 700; -fx-padding: 7 12; -fx-background-radius: 6;");
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
        VBox card = new VBox(12);
        card.getStyleClass().add("glass-card");
        card.setPadding(new Insets(14, 16, 14, 16));

        HBox titleBox = new HBox(8);
        titleBox.setAlignment(Pos.CENTER_LEFT);
        var icon = UiIcons.createSvgIcon(UiIcons.CALENDAR, 16, "#A78BFA");
        Label lblTitle = new Label("Adjust Photo Dates");
        lblTitle.getStyleClass().addAll("card-title", "section-title");
        lblTitle.setStyle("-fx-font-size: 15px; -fx-font-weight: 700;"); lblTitle.getStyleClass().add("card-title");
        titleBox.getChildren().addAll(icon, lblTitle);

        Label lblSub = new Label("Choose how you want to update the dates of your photos.");
        lblSub.getStyleClass().add("card-subtitle");
        lblSub.setStyle("-fx-font-size: 12px;"); lblSub.getStyleClass().add("text-muted");

        // Radio selectors with descriptive sub-labels
        rbTimeShift.setToggleGroup(dateModeGroup);
        rbFixedIncrement.setToggleGroup(dateModeGroup);
        rbKeepOriginal.setToggleGroup(dateModeGroup);
        rbTimeShift.setSelected(true);

        VBox modeSelectBox = new VBox(8);

        VBox item1 = new VBox(2);
        rbTimeShift.setStyle("-fx-font-size: 13px; -fx-font-weight: 700;"); rbTimeShift.getStyleClass().add("text-primary");
        Label sub1 = new Label("Move all selected photo dates forward or backward.");
        sub1.setStyle("-fx-font-size: 12px; -fx-padding: 0 0 0 22;"); sub1.getStyleClass().add("text-secondary");
        item1.getChildren().addAll(rbTimeShift, sub1);

        VBox item2 = new VBox(2);
        rbFixedIncrement.setStyle("-fx-font-size: 13px; -fx-font-weight: 700;"); rbFixedIncrement.getStyleClass().add("text-primary");
        Label sub2 = new Label("Assign a starting date and increment timestamps for each photo.");
        sub2.setStyle("-fx-font-size: 12px; -fx-padding: 0 0 0 22;"); sub2.getStyleClass().add("text-secondary");
        item2.getChildren().addAll(rbFixedIncrement, sub2);

        VBox item3 = new VBox(2);
        rbKeepOriginal.setStyle("-fx-font-size: 13px; -fx-font-weight: 700;"); rbKeepOriginal.getStyleClass().add("text-primary");
        Label sub3 = new Label("Preserve existing date metadata.");
        sub3.setStyle("-fx-font-size: 12px; -fx-padding: 0 0 0 22;"); sub3.getStyleClass().add("text-secondary");
        item3.getChildren().addAll(rbKeepOriginal, sub3);

        modeSelectBox.getChildren().addAll(item1, item2, item3);

        // 1. Time Shift Box
        cbShiftDirection.getItems().setAll("+ Advance Time (Add)", "- Delay Time (Subtract)");
        cbShiftDirection.setValue("+ Advance Time (Add)");
        cbShiftDirection.setMaxWidth(Double.MAX_VALUE);
        cbShiftDirection.setStyle("-fx-font-size: 13px; -fx-pref-height: 34px;");

        GridPane gridSpinners = new GridPane();
        gridSpinners.setHgap(8);
        gridSpinners.setVgap(6);

        Label lblD = new Label("Days:"); lblD.setStyle("-fx-font-size: 12px;"); lblD.getStyleClass().add("text-secondary");
        Label lblH = new Label("Hours:"); lblH.setStyle("-fx-font-size: 12px;"); lblH.getStyleClass().add("text-secondary");
        Label lblM = new Label("Mins:"); lblM.setStyle("-fx-font-size: 12px;"); lblM.getStyleClass().add("text-secondary");
        Label lblS = new Label("Secs:"); lblS.setStyle("-fx-font-size: 12px;"); lblS.getStyleClass().add("text-secondary");

        spDays.setStyle("-fx-pref-height: 32px;");
        spHours.setStyle("-fx-pref-height: 32px;");
        spMinutes.setStyle("-fx-pref-height: 32px;");
        spSeconds.setStyle("-fx-pref-height: 32px;");

        gridSpinners.add(lblD, 0, 0);
        gridSpinners.add(spDays, 1, 0);
        gridSpinners.add(lblH, 2, 0);
        gridSpinners.add(spHours, 3, 0);

        gridSpinners.add(lblM, 0, 1);
        gridSpinners.add(spMinutes, 1, 1);
        gridSpinners.add(lblS, 2, 1);
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

        Label shiftHeader = new Label("Time Adjustment:");
        shiftHeader.setStyle("-fx-font-size: 12px; -fx-font-weight: 700; -fx-text-transform: uppercase;"); shiftHeader.getStyleClass().add("section-sub-title");
        shiftControlBox.getChildren().setAll(shiftHeader, cbShiftDirection, gridSpinners, presetsBox);

        // 2. Fixed Increment Box
        cbIncrementInterval.getItems().setAll("+10 seconds", "+30 seconds", "+1 minute (Scanned Albums)", "+2 minutes", "+5 minutes");
        cbIncrementInterval.setValue("+1 minute (Scanned Albums)");
        cbIncrementInterval.setMaxWidth(Double.MAX_VALUE);
        cbIncrementInterval.setStyle("-fx-font-size: 13px; -fx-pref-height: 34px;");

        dpBaseDate.setMaxWidth(Double.MAX_VALUE);
        dpBaseDate.setStyle("-fx-pref-height: 34px;");

        HBox timeSpinners = new HBox(6, spBaseHour, new Label(":"), spBaseMinute, new Label(":"), spBaseSecond);
        timeSpinners.setAlignment(Pos.CENTER_LEFT);

        Label fixedHeader = new Label("Base Starting Date & Interval:");
        fixedHeader.setStyle("-fx-font-size: 12px; -fx-font-weight: 700; -fx-text-transform: uppercase;"); fixedHeader.getStyleClass().add("section-sub-title");

        Label lblBaseD = new Label("Base Starting Date:"); lblBaseD.setStyle("-fx-font-size: 12px;"); lblBaseD.getStyleClass().add("text-secondary");
        Label lblBaseT = new Label("Base Starting Time:"); lblBaseT.setStyle("-fx-font-size: 12px;"); lblBaseT.getStyleClass().add("text-secondary");
        Label lblInc = new Label("Auto-Increment Interval:"); lblInc.setStyle("-fx-font-size: 12px;"); lblInc.getStyleClass().add("text-secondary");

        fixedControlBox.getChildren().setAll(
                fixedHeader,
                lblBaseD,
                dpBaseDate,
                lblBaseT,
                timeSpinners,
                lblInc,
                cbIncrementInterval
        );
        fixedControlBox.setVisible(false);
        fixedControlBox.setManaged(false);

        // 3. Keep Original Notice Box
        keepOriginalNoticeBox.setStyle("-fx-background-color: rgba(167, 139, 250, 0.08); -fx-border-color: rgba(167, 139, 250, 0.25); -fx-border-radius: 6; -fx-background-radius: 6; -fx-padding: 10;");
        Label noticeTitle = new Label("Existing Dates Preserved");
        noticeTitle.setStyle("-fx-font-size: 12.5px; -fx-font-weight: 700;"); noticeTitle.getStyleClass().add("brand-accent");
        Label noticeText = new Label("Existing photo dates will be preserved. Other selected metadata fields (Creator, Copyright, GPS) can still be edited.");
        noticeText.setWrapText(true);
        noticeText.setStyle("-fx-font-size: 12px;"); noticeText.getStyleClass().add("text-secondary");
        keepOriginalNoticeBox.getChildren().setAll(noticeTitle, noticeText);
        keepOriginalNoticeBox.setVisible(false);
        keepOriginalNoticeBox.setManaged(false);

        // 4. Live Operation Summary
        HBox summaryBox = new HBox(8);
        summaryBox.setAlignment(Pos.CENTER_LEFT);
        summaryBox.setStyle("-fx-background-color: rgba(167, 139, 250, 0.1); -fx-border-color: rgba(167, 139, 250, 0.25); -fx-border-radius: 6; -fx-background-radius: 6; -fx-padding: 8 10 8 10;");
        lblOperationSummary.setWrapText(true);
        lblOperationSummary.setStyle("-fx-font-size: 12.5px; -fx-font-weight: 600;"); lblOperationSummary.getStyleClass().add("brand-accent");
        summaryBox.getChildren().addAll(UiIcons.createSvgIcon(UiIcons.HISTORY, 13, "#A78BFA"), lblOperationSummary);

        // Mode switch listener
        dateModeGroup.selectedToggleProperty().addListener((obs, oldVal, newVal) -> {
            boolean isShift = rbTimeShift.isSelected();
            boolean isFixed = rbFixedIncrement.isSelected();
            boolean isKeep = rbKeepOriginal.isSelected();

            shiftControlBox.setVisible(isShift);
            shiftControlBox.setManaged(isShift);

            fixedControlBox.setVisible(isFixed);
            fixedControlBox.setManaged(isFixed);

            keepOriginalNoticeBox.setVisible(isKeep);
            keepOriginalNoticeBox.setManaged(isKeep);

            updateOperationSummary();
            recalculatePreviews();
        });

        card.getChildren().addAll(titleBox, lblSub, modeSelectBox, new Separator(), shiftControlBox, fixedControlBox, keepOriginalNoticeBox, summaryBox);
        updateOperationSummary();
        return card;
    }

    private VBox buildPresetsCard() {
        VBox card = new VBox(12);
        card.getStyleClass().add("glass-card");

        HBox titleBox = new HBox(8);
        titleBox.setAlignment(Pos.CENTER_LEFT);
        var icon = UiIcons.createSvgIcon(UiIcons.USER, 18, "#3b82f6");
        Label lblTitle = new Label("Creator & Copyright");
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
        lblArtist.setStyle("-fx-font-size: 12px; -fx-font-weight: 600;"); lblArtist.getStyleClass().add("text-secondary");
        txtArtist.setPromptText("Enter your custom name or studio (e.g. John Doe)");
        txtArtist.setStyle("-fx-padding: 8 10; -fx-background-radius: 6;");

        // Copyright
        Label lblCopyright = new Label("Copyright Notice:");
        lblCopyright.setStyle("-fx-font-size: 12px; -fx-font-weight: 600;"); lblCopyright.getStyleClass().add("text-secondary");
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
        lblDesc.setStyle("-fx-font-size: 12px; -fx-font-weight: 600;"); lblDesc.getStyleClass().add("text-secondary");
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
        Label lblTitle = new Label("GPS & Location");
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
        footer.setPadding(new Insets(12, 16, 12, 16));

        // Output section header and safety options
        Label lblOutputHeader = new Label("OUTPUT & SAFE EXPORT");
        lblOutputHeader.setStyle("-fx-font-size: 12px; -fx-font-weight: 700; -fx-letter-spacing: 0.5px;"); lblOutputHeader.getStyleClass().add("section-sub-title");

        chkSafeExport.setSelected(true);
        chkSafeExport.setStyle("-fx-font-size: 13px; -fx-font-weight: 600;"); chkSafeExport.getStyleClass().add("text-primary");
        chkSafeExport.setOnAction(e -> {
            if (!chkSafeExport.isSelected()) {
                Alert confirm = new Alert(Alert.AlertType.CONFIRMATION);
                confirm.setTitle("Confirm In-Place Overwrite");
                confirm.setHeaderText("Warning: Destructive In-Place Edit");
                confirm.setContentText("You have deselected 'Save Edited Copies'. This will overwrite original files in place. Are you sure you want to proceed?");
                var res = confirm.showAndWait();
                if (res.isEmpty() || res.get() != ButtonType.OK) {
                    chkSafeExport.setSelected(true);
                }
            }
        });

        chkSyncOsTime.setSelected(true);
        chkSyncOsTime.setStyle("-fx-font-size: 13px;"); chkSyncOsTime.getStyleClass().add("text-secondary");

        HBox outputOptionsRow = new HBox(20, lblOutputHeader, chkSafeExport, chkSyncOsTime);
        outputOptionsRow.setAlignment(Pos.CENTER_LEFT);

        // Compact Destination Row
        HBox outDirRow = new HBox(10);
        outDirRow.setAlignment(Pos.CENTER_LEFT);

        chkSafeExport.selectedProperty().addListener((o, oldV, newV) -> {
            outDirRow.setVisible(newV);
            outDirRow.setManaged(newV);
        });

        Label lblDest = new Label("Destination Folder:");
        lblDest.setStyle("-fx-font-size: 12px; -fx-font-weight: 600;"); lblDest.getStyleClass().add("text-secondary");

        lblOutputDir.setStyle("-fx-font-size: 12px; -fx-padding: 4 10; -fx-background-radius: 6; -fx-min-height: 28px; -fx-pref-height: 28px;");
        lblOutputDir.getStyleClass().add("badge-neutral");
        lblOutputDir.setMaxWidth(Double.MAX_VALUE);
        HBox.setHgrow(lblOutputDir, Priority.ALWAYS);

        Button btnChooseDir = new Button("Browse");
        btnChooseDir.getStyleClass().add("btn-secondary");
        btnChooseDir.setStyle("-fx-font-size: 12px; -fx-padding: 4 12;");
        btnChooseDir.setOnAction(e -> {
            DirectoryChooser dc = new DirectoryChooser();
            dc.setTitle("Select Studio Export Destination Folder");
            if (customOutputDir != null && customOutputDir.exists()) {
                dc.setInitialDirectory(customOutputDir);
            } else if (sourceDir != null && sourceDir.exists()) {
                dc.setInitialDirectory(sourceDir);
            }
            File sel = dc.showDialog(stage);
            if (sel != null) {
                customOutputDir = sel;
                userCustomizedOutputDir = true;
                lblOutputDir.setText(sel.getAbsolutePath());
                if (btnResetDir != null) {
                    btnResetDir.setVisible(true);
                    btnResetDir.setManaged(true);
                }
            }
        });

        btnResetDir = new Button("Auto");
        btnResetDir.getStyleClass().add("btn-ghost");
        btnResetDir.setStyle("-fx-font-size: 11.5px; -fx-padding: 4 8; -fx-cursor: hand;");
        btnResetDir.setTooltip(new Tooltip("Reset destination to auto-managed path: [source]\\TakeoutFix_Studio_Export\\[tool_type]"));
        btnResetDir.setVisible(false);
        btnResetDir.setManaged(false);
        btnResetDir.setOnAction(e -> {
            userCustomizedOutputDir = false;
            if (btnResetDir != null) {
                btnResetDir.setVisible(false);
                btnResetDir.setManaged(false);
            }
            updateAutoOutputDir();
        });

        outDirRow.getChildren().addAll(lblDest, lblOutputDir, btnChooseDir, btnResetDir);

        // Progress bar
        progressBar.setMaxWidth(Double.MAX_VALUE);
        progressBar.setVisible(false);

        // Action row
        HBox actionRow = new HBox(10);
        actionRow.setAlignment(Pos.CENTER_RIGHT);

        progressLabel.setStyle("-fx-font-size: 12px;"); progressLabel.getStyleClass().add("text-secondary");

        btnDryRun.getStyleClass().add("btn-secondary");
        btnDryRun.setGraphic(UiIcons.createSvgIcon(UiIcons.EYE, 14, "currentColor"));
        btnDryRun.setGraphicTextGap(7);
        btnDryRun.setStyle("-fx-font-size: 13px; -fx-font-weight: 600; -fx-pref-height: 36px; -fx-padding: 6 16;");
        btnDryRun.setOnAction(e -> handleDryRun());

        btnExecute.getStyleClass().add("btn-primary");
        btnExecute.setGraphic(UiIcons.createSvgIcon(UiIcons.PLAY, 14, "currentColor"));
        btnExecute.setGraphicTextGap(7);
        btnExecute.setStyle("-fx-font-size: 13px; -fx-font-weight: 700; -fx-pref-height: 36px; -fx-padding: 6 20;");
        btnExecute.setOnAction(e -> handleExecute());

        btnCancel.getStyleClass().add("btn-ghost");
        btnCancel.setVisible(false);
        btnCancel.setOnAction(e -> cancelToken.set(true));

        actionRow.getChildren().addAll(progressLabel, new Region(), btnDryRun, btnExecute, btnCancel);
        HBox.setHgrow(actionRow.getChildren().get(1), Priority.ALWAYS);

        footer.getChildren().addAll(outputOptionsRow, outDirRow, progressBar, actionRow);
        return footer;
    }

    private Button createSmallPill(String text, Runnable action) {
        Button btn = new Button(text);
        btn.getStyleClass().addAll("btn-secondary", "filter-pill");
        btn.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-padding: 2 10 2 10; -fx-min-height: 28px; -fx-pref-height: 28px; -fx-max-height: 28px; -fx-cursor: hand;");
        btn.setOnAction(e -> {
            if (action != null) action.run();
            updateOperationSummary();
            recalculatePreviews();
        });
        return btn;
    }

    private void setupLivePreviewListeners() {
        rbTimeShift.selectedProperty().addListener((o, oldV, newV) -> {
            if (newV) {
                updateAutoOutputDir();
                updateOperationSummary();
                recalculatePreviews();
            }
        });
        rbFixedIncrement.selectedProperty().addListener((o, oldV, newV) -> {
            if (newV) {
                updateAutoOutputDir();
                updateOperationSummary();
                recalculatePreviews();
            }
        });
        rbKeepOriginal.selectedProperty().addListener((o, oldV, newV) -> {
            if (newV) {
                updateAutoOutputDir();
                updateOperationSummary();
                recalculatePreviews();
            }
        });

        spDays.valueProperty().addListener((o, oldV, newV) -> { updateOperationSummary(); recalculatePreviews(); });
        spHours.valueProperty().addListener((o, oldV, newV) -> { updateOperationSummary(); recalculatePreviews(); });
        spMinutes.valueProperty().addListener((o, oldV, newV) -> { updateOperationSummary(); recalculatePreviews(); });
        spSeconds.valueProperty().addListener((o, oldV, newV) -> { updateOperationSummary(); recalculatePreviews(); });
        cbShiftDirection.valueProperty().addListener((o, oldV, newV) -> { updateOperationSummary(); recalculatePreviews(); });

        dpBaseDate.valueProperty().addListener((o, oldV, newV) -> { updateOperationSummary(); recalculatePreviews(); });
        spBaseHour.valueProperty().addListener((o, oldV, newV) -> { updateOperationSummary(); recalculatePreviews(); });
        spBaseMinute.valueProperty().addListener((o, oldV, newV) -> { updateOperationSummary(); recalculatePreviews(); });
        spBaseSecond.valueProperty().addListener((o, oldV, newV) -> { updateOperationSummary(); recalculatePreviews(); });
        cbIncrementInterval.valueProperty().addListener((o, oldV, newV) -> { updateOperationSummary(); recalculatePreviews(); });
    }

    private void updateOperationSummary() {
        if (rbKeepOriginal.isSelected()) {
            lblOperationSummary.setText("Summary: Dates will remain unchanged. Other metadata edits will still be applied.");
        } else if (rbTimeShift.isSelected()) {
            boolean isAdd = cbShiftDirection.getValue() != null && !cbShiftDirection.getValue().startsWith("-");
            int d = spDays.getValue() != null ? spDays.getValue() : 0;
            int h = spHours.getValue() != null ? spHours.getValue() : 0;
            int m = spMinutes.getValue() != null ? spMinutes.getValue() : 0;
            int s = spSeconds.getValue() != null ? spSeconds.getValue() : 0;
            List<String> parts = new ArrayList<>();
            if (d > 0) parts.add(d + (d == 1 ? " day" : " days"));
            if (h > 0) parts.add(h + (h == 1 ? " hour" : " hours"));
            if (m > 0) parts.add(m + (m == 1 ? " min" : " mins"));
            if (s > 0) parts.add(s + (s == 1 ? " sec" : " secs"));
            String span = parts.isEmpty() ? "0 hours" : String.join(", ", parts);
            lblOperationSummary.setText(String.format("Summary: Shift all photo dates %s by %s.", isAdd ? "forward" : "backward", span));
        } else if (rbFixedIncrement.isSelected()) {
            LocalDate d = dpBaseDate.getValue() != null ? dpBaseDate.getValue() : LocalDate.now();
            int h = spBaseHour.getValue() != null ? spBaseHour.getValue() : 12;
            int m = spBaseMinute.getValue() != null ? spBaseMinute.getValue() : 0;
            int s = spBaseSecond.getValue() != null ? spBaseSecond.getValue() : 0;
            String interval = cbIncrementInterval.getValue() != null ? cbIncrementInterval.getValue() : "+1 minute";
            lblOperationSummary.setText(String.format("Summary: Start at %s %02d:%02d:%02d and auto-increment by %s per photo.", d, h, m, s, interval));
        }
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
        int previewCount = 0;
        for (StudioFileItem item : queueItems) {
            if (item.isSelected()) {
                item.setStatus("Previewed");
                previewCount++;
            }
        }
        tableView.refresh();
        progressLabel.setText(String.format("Preview refreshed for %d selected photos.", previewCount));
    }

    private void handleExecute() {
        List<StudioFileItem> selectedFiles = queueItems.stream().filter(StudioFileItem::isSelected).toList();
        if (selectedFiles.isEmpty()) {
            showAlert("No Photos Selected", "Please select at least one photo in the queue to apply changes.");
            return;
        }

        if (chkSafeExport.isSelected()) {
            if (customOutputDir == null) {
                showAlert("Destination Required", "Please choose a destination folder or add photos to set the default export path.");
                return;
            }
            if (!customOutputDir.exists()) {
                customOutputDir.mkdirs();
            }
        }

        StudioEditRequest req = buildCurrentRequest();
        btnExecute.setDisable(true);
        btnDryRun.setDisable(true);
        btnCancel.setVisible(true);
        progressBar.setVisible(true);
        progressBar.setProgress(0);
        cancelToken.set(false);

        List<StudioFileItem> snapshot = new ArrayList<>(selectedFiles);

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
                            "Edit Metadata",
                            result.getFailed() == 0 ? "SUCCESS" : "WARNING",
                            null,
                            java.time.Instant.now(),
                            result.getSuccessful(),
                            0,
                            String.format("Batch metadata edit: %d updated, %d failed.", result.getSuccessful(), result.getFailed())
                    );
                } catch (Exception ignored) {}

                Alert alert = new Alert(Alert.AlertType.INFORMATION);
                alert.setTitle("TakeoutFix — Edit Metadata Complete");
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
            File parent = files.get(0).getParentFile();
            if (parent != null) {
                sourceDir = parent;
            }
            if (!userCustomizedOutputDir) {
                updateAutoOutputDir();
            }
            addFilesAsync(files);
        }
    }

    private void handleAddFolder() {
        DirectoryChooser dc = new DirectoryChooser();
        dc.setTitle("Select Folder of Photos to Edit");
        File dir = dc.showDialog(stage);
        if (dir != null && dir.isDirectory()) {
            sourceDir = dir;
            if (!userCustomizedOutputDir) {
                updateAutoOutputDir();
            }
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
        if (files == null || files.isEmpty()) return;
        if (sourceDir == null) {
            File first = files.get(0);
            sourceDir = first.isDirectory() ? first : first.getParentFile();
        }
        if (!userCustomizedOutputDir) {
            Platform.runLater(this::updateAutoOutputDir);
        }
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
                updateAutoOutputDir();
                recalculatePreviews();
                progressLabel.setText("Loaded " + files.size() + " files.");
            });
        }).start();
    }

    private void updateQueueCount() {
        long selectedCount = queueItems.stream().filter(StudioFileItem::isSelected).count();
        int totalCount = queueItems.size();
        if (totalCount == 0) {
            queueSummaryLabel.setText("0 photos queued");
            btnExecute.setText("Apply Changes");
            btnExecute.setDisable(true);
            btnDryRun.setDisable(true);
            if (!userCustomizedOutputDir) {
                sourceDir = null;
                customOutputDir = null;
                if (lblOutputDir != null) lblOutputDir.setText("");
                if (btnResetDir != null) {
                    btnResetDir.setVisible(false);
                    btnResetDir.setManaged(false);
                }
            }
        } else {
            queueSummaryLabel.setText(String.format("%d of %d photos selected", selectedCount, totalCount));
            btnExecute.setText(selectedCount > 0 ? String.format("Apply Changes (%d)", selectedCount) : "Apply Changes");
            btnExecute.setDisable(selectedCount == 0);
            btnDryRun.setDisable(false);
        }
    }

    private String getActiveToolType() {
        if ("Creator & Copyright".equals(currentTab)) {
            return "Creator_Copyright";
        } else if ("GPS & Location".equals(currentTab)) {
            return "Location";
        } else {
            // Dates tab
            if (rbFixedIncrement != null && rbFixedIncrement.isSelected()) {
                return "Fixed_Increment";
            } else if (rbTimeShift != null && rbTimeShift.isSelected()) {
                return "Time_Shift";
            } else {
                return "Dates";
            }
        }
    }

    private void updateAutoOutputDir() {
        if (userCustomizedOutputDir) {
            return;
        }
        if (sourceDir == null || queueItems.isEmpty()) {
            customOutputDir = null;
            if (lblOutputDir != null) {
                lblOutputDir.setText("");
            }
            if (btnResetDir != null) {
                btnResetDir.setVisible(false);
                btnResetDir.setManaged(false);
            }
            return;
        }
        String toolType = getActiveToolType();
        File studioExportBase = new File(sourceDir, "TakeoutFix_Studio_Export");
        customOutputDir = new File(studioExportBase, toolType);
        if (lblOutputDir != null) {
            lblOutputDir.setText(customOutputDir.getAbsolutePath());
        }
        if (btnResetDir != null) {
            btnResetDir.setVisible(false);
            btnResetDir.setManaged(false);
        }
    }

    private void showAlert(String title, String message) {
        Alert alert = new Alert(Alert.AlertType.WARNING);
        alert.setTitle(title);
        alert.setHeaderText(null);
        alert.setContentText(message);
        alert.showAndWait();
    }
}
