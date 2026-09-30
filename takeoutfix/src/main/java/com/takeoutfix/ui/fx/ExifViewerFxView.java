package com.takeoutfix.ui.fx;

import com.takeoutfix.restore.infrastructure.NativeExifToolEngine;
import javafx.application.Platform;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.collections.transformation.FilteredList;
import javafx.concurrent.Task;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Node;
import javafx.scene.control.*;
import javafx.scene.image.Image;
import javafx.scene.image.ImageView;
import javafx.scene.input.Clipboard;
import javafx.scene.input.ClipboardContent;
import javafx.scene.input.Dragboard;
import javafx.scene.input.TransferMode;
import javafx.scene.layout.*;
import javafx.scene.shape.Rectangle;
import javafx.stage.FileChooser;
import javafx.stage.Stage;

import java.awt.Desktop;
import java.io.File;
import java.net.URI;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

/**
 * Modern Photo Details & EXIF Metadata Inspection Workspace.
 * Features:
 * 1. Image preview with zoom controls (+, -, Fit), file dimensions, format, and size.
 * 2. Visual drag-and-drop empty state with prominent browsing actions.
 * 3. Prominent camera specification cards (Camera, Lens, Capture Date, GPS) with 16-18px values.
 * 4. Categorized metadata filtering (All, Camera, Exposure, Date & Time, GPS, Image, IPTC/XMP).
 * 5. Searchable & filterable tags table with contextual copy actions and clean empty states.
 * 6. One-click CSV and JSON exports for filtered metadata.
 */
public class ExifViewerFxView extends VBox {

    public static class ExifTagRow {
        private final String group;
        private final String tagName;
        private final String value;

        public ExifTagRow(String group, String tagName, String value) {
            this.group = group != null ? group : "System";
            this.tagName = tagName != null ? tagName : "";
            this.value = value != null ? value : "";
        }

        public String getGroup() { return group; }
        public String getTagName() { return tagName; }
        public String getValue() { return value; }
    }

    private final Stage stage;
    private final NativeExifToolEngine exifToolEngine;
    private final Consumer<WorkspaceType> onNavigate;

    // Header & Summary Labels
    private final Label cameraVal = new Label("—");
    private final Label lensVal = new Label("—");
    private final Label dateVal = new Label("—");
    private final Label gpsVal = new Label("—");
    private final Button btnOpenMaps = new Button("View on Maps");

    // Preview Pane
    private final StackPane previewContainer = new StackPane();
    private final ImageView previewImageView = new ImageView();
    private final VBox emptyPreviewBox;
    private final Label previewNameLabel = new Label("No image selected");
    private final Label previewMetaLabel = new Label("Select a photo to inspect its details.");
    private final Label badgeExif = createBadge("EXIF —", false);
    private final Label badgeGps = createBadge("GPS —", false);
    private final Label badgeIptc = createBadge("IPTC —", false);

    // Zoom State
    private double currentZoom = 1.0;
    private final Label zoomLevelLabel = new Label("100%");
    private final Button btnZoomIn = new Button("+");
    private final Button btnZoomOut = new Button("-");
    private final Button btnZoomFit = new Button("Fit");

    // Table & Filtering
    private final TextField searchField = new TextField();
    private final Label tagCountLabel = new Label("0 tags");
    private final ObservableList<ExifTagRow> masterData = FXCollections.observableArrayList();
    private final FilteredList<ExifTagRow> filteredData = new FilteredList<>(masterData, p -> true);
    private final TableView<ExifTagRow> tableView = new TableView<>(filteredData);
    private String selectedCategory = "All";

    // Export & Action Buttons
    private final Button btnCsv = new Button("Export CSV");
    private final Button btnJson = new Button("Export JSON");

    private double currentLat = 0.0;
    private double currentLon = 0.0;
    private boolean hasGps = false;
    private File currentSelectedFile = null;

    public ExifViewerFxView(Stage stage, NativeExifToolEngine exifToolEngine, Consumer<WorkspaceType> onNavigate) {
        this.stage = stage;
        this.exifToolEngine = exifToolEngine;
        this.onNavigate = onNavigate;
        this.emptyPreviewBox = buildEmptyPreview();

        getStyleClass().add("workspace-view");
        setSpacing(14);
        setPadding(new Insets(16, 20, 16, 20));
        VBox.setVgrow(this, Priority.ALWAYS);

        // 1. Header
        getChildren().add(buildHeaderRow());

        // 2. Main Workspace Split: Left (Image & File Details) | Right (Key Info & Metadata Table)
        HBox mainSplit = new HBox(16);
        VBox.setVgrow(mainSplit, Priority.ALWAYS);

        VBox previewPane = buildPreviewCard();
        previewPane.setPrefWidth(350);
        previewPane.setMinWidth(320);
        previewPane.setMaxWidth(380);

        VBox rightPane = new VBox(12);
        HBox.setHgrow(rightPane, Priority.ALWAYS);
        rightPane.getChildren().addAll(buildQuickStatsGrid(), buildTableCard());

        mainSplit.getChildren().addAll(previewPane, rightPane);
        getChildren().add(mainSplit);

        // Drag & drop on whole pane
        setupDragAndDrop();
    }

    private HBox buildHeaderRow() {
        HBox header = new HBox(12);
        header.setAlignment(Pos.CENTER_LEFT);

        Node icon = UiIcons.createSvgIcon(UiIcons.EYE, 22, "#A78BFA");

        VBox titleBox = new VBox(2);
        Label title = new Label("Photo Details");
        title.getStyleClass().addAll("page-title", "header-title");
        title.setStyle("-fx-font-size: 24px; -fx-font-weight: 700; -fx-text-fill: #FAFAFA;");

        Label subtitle = new Label("Inspect image properties, camera settings and metadata.");
        subtitle.getStyleClass().addAll("page-description", "header-subtitle");
        subtitle.setStyle("-fx-font-size: 13px; -fx-text-fill: #D4D4D8;");
        titleBox.getChildren().addAll(title, subtitle);

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        Button btnBrowse = new Button("Browse Photo");
        btnBrowse.getStyleClass().add("btn-primary");
        btnBrowse.setGraphic(UiIcons.createSvgIcon(UiIcons.FOLDER, 13, "currentColor"));
        btnBrowse.setGraphicTextGap(7);
        btnBrowse.setStyle("-fx-font-size: 13px; -fx-font-weight: 600; -fx-pref-height: 36px; -fx-padding: 6 16; -fx-cursor: hand;");
        btnBrowse.setOnAction(e -> chooseFile());

        header.getChildren().addAll(icon, titleBox, spacer, btnBrowse);
        return header;
    }

    private VBox buildPreviewCard() {
        VBox card = new VBox(12);
        card.getStyleClass().add("glass-card");
        card.setPadding(new Insets(14, 14, 14, 14));
        VBox.setVgrow(card, Priority.ALWAYS);

        // Header with Zoom Controls
        HBox previewHeader = new HBox(8);
        previewHeader.setAlignment(Pos.CENTER_LEFT);

        Label lblSection = new Label("IMAGE PREVIEW");
        lblSection.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-text-fill: #A78BFA; -fx-letter-spacing: 0.5px;");

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        HBox zoomControls = buildZoomControls();
        previewHeader.getChildren().addAll(lblSection, spacer, zoomControls);

        // Preview Box with Clipping Mask
        previewContainer.setMinHeight(240);
        previewContainer.setPrefHeight(270);
        previewContainer.setStyle("-fx-background-color: rgba(0,0,0,0.25); -fx-background-radius: 8; -fx-border-color: rgba(255,255,255,0.08); -fx-border-radius: 8;");
        previewContainer.setAlignment(Pos.CENTER);

        Rectangle clip = new Rectangle();
        clip.widthProperty().bind(previewContainer.widthProperty());
        clip.heightProperty().bind(previewContainer.heightProperty());
        clip.setArcWidth(16);
        clip.setArcHeight(16);
        previewContainer.setClip(clip);

        previewImageView.setPreserveRatio(true);
        previewImageView.setSmooth(true);
        previewImageView.fitWidthProperty().bind(previewContainer.widthProperty().subtract(20));
        previewImageView.fitHeightProperty().bind(previewContainer.heightProperty().subtract(20));
        previewImageView.setVisible(false);

        previewContainer.getChildren().addAll(emptyPreviewBox, previewImageView);

        // Image Information Below Preview
        VBox fileInfoBox = new VBox(4);
        previewNameLabel.setStyle("-fx-font-size: 14px; -fx-font-weight: 700; -fx-text-fill: #FAFAFA;");
        previewNameLabel.setWrapText(true);

        previewMetaLabel.setStyle("-fx-font-size: 12px; -fx-text-fill: #A1A1AA;");
        previewMetaLabel.setWrapText(true);
        fileInfoBox.getChildren().addAll(previewNameLabel, previewMetaLabel);

        // Completeness Badges Card
        VBox compBox = new VBox(6);
        Label compTitle = new Label("METADATA STATUS");
        compTitle.setStyle("-fx-font-size: 10px; -fx-font-weight: 700; -fx-text-fill: #71717A; -fx-letter-spacing: 0.5px;");

        HBox badgesBox = new HBox(6);
        badgesBox.getChildren().addAll(badgeExif, badgeGps, badgeIptc);
        compBox.getChildren().addAll(compTitle, badgesBox);

        card.getChildren().addAll(previewHeader, previewContainer, fileInfoBox, new Separator(), compBox);
        return card;
    }

    private VBox buildEmptyPreview() {
        VBox box = new VBox(10);
        box.setAlignment(Pos.CENTER);
        box.setPadding(new Insets(24, 16, 24, 16));

        Node uploadIcon = UiIcons.createSvgIcon(UiIcons.UPLOAD, 38, "#A78BFA");

        Label title = new Label("No image selected");
        title.setStyle("-fx-font-size: 15px; -fx-font-weight: 700; -fx-text-fill: #FAFAFA;");

        Label subtitle = new Label("Select a photo to inspect its details.");
        subtitle.setStyle("-fx-font-size: 12px; -fx-text-fill: #71717A;");
        subtitle.setWrapText(true);

        Button btnBrowse = new Button("Browse Photo");
        btnBrowse.getStyleClass().add("btn-secondary");
        btnBrowse.setGraphic(UiIcons.createSvgIcon(UiIcons.FOLDER, 13, "currentColor"));
        btnBrowse.setGraphicTextGap(6);
        btnBrowse.setStyle("-fx-font-size: 12px; -fx-font-weight: 600; -fx-padding: 6 14; -fx-cursor: hand;");
        btnBrowse.setOnAction(e -> chooseFile());

        box.getChildren().addAll(uploadIcon, title, subtitle, btnBrowse);
        return box;
    }

    private HBox buildZoomControls() {
        HBox box = new HBox(4);
        box.setAlignment(Pos.CENTER_RIGHT);

        btnZoomOut.getStyleClass().add("btn-ghost");
        btnZoomOut.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-padding: 2 7; -fx-background-radius: 4;");
        btnZoomOut.setDisable(true);
        btnZoomOut.setOnAction(e -> applyZoom(Math.max(0.5, currentZoom - 0.25)));

        zoomLevelLabel.setStyle("-fx-font-size: 10px; -fx-font-weight: 600; -fx-text-fill: #71717A; -fx-min-width: 34px; -fx-alignment: center;");

        btnZoomIn.getStyleClass().add("btn-ghost");
        btnZoomIn.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-padding: 2 7; -fx-background-radius: 4;");
        btnZoomIn.setDisable(true);
        btnZoomIn.setOnAction(e -> applyZoom(Math.min(3.0, currentZoom + 0.25)));

        btnZoomFit.getStyleClass().add("btn-ghost");
        btnZoomFit.setStyle("-fx-font-size: 10px; -fx-font-weight: 600; -fx-padding: 2 7; -fx-background-radius: 4;");
        btnZoomFit.setDisable(true);
        btnZoomFit.setOnAction(e -> applyZoom(1.0));

        box.getChildren().addAll(btnZoomOut, zoomLevelLabel, btnZoomIn, btnZoomFit);
        return box;
    }

    private void applyZoom(double zoom) {
        this.currentZoom = zoom;
        previewImageView.setScaleX(zoom);
        previewImageView.setScaleY(zoom);
        zoomLevelLabel.setText((int)(zoom * 100) + "%");
    }

    private static Label createBadge(String text, boolean active) {
        Label b = new Label(text);
        updateBadgeStyle(b, active, text);
        return b;
    }

    private static void updateBadgeStyle(Label b, boolean active, String text) {
        b.setText(text);
        if (active) {
            b.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-padding: 3 9; -fx-background-radius: 4; -fx-background-color: rgba(16, 185, 129, 0.15); -fx-text-fill: #10b981; -fx-border-color: rgba(16, 185, 129, 0.3); -fx-border-radius: 4;");
        } else {
            b.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-padding: 3 9; -fx-background-radius: 4; -fx-background-color: rgba(113, 113, 122, 0.10); -fx-text-fill: #71717A; -fx-border-color: rgba(113, 113, 122, 0.15); -fx-border-radius: 4;");
        }
    }

    private HBox buildQuickStatsGrid() {
        HBox grid = new HBox(10);
        grid.setAlignment(Pos.CENTER);

        VBox cardCamera = createStatCard("CAMERA", cameraVal, "Make & Model", UiIcons.CAMERA);
        VBox cardLens = createStatCard("LENS & EXPOSURE", lensVal, "Focal, f-stop, ISO", UiIcons.SLIDERS);
        VBox cardDate = createStatCard("CAPTURE DATE", dateVal, "Original Timestamp", UiIcons.CALENDAR);

        VBox cardGps = new VBox(4);
        cardGps.getStyleClass().add("glass-card");
        cardGps.setPadding(new Insets(12, 14, 12, 14));

        HBox topGps = new HBox(6);
        topGps.setAlignment(Pos.CENTER_LEFT);
        Label tGps = new Label("GPS LOCATION");
        tGps.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-text-fill: #71717A;");
        topGps.getChildren().addAll(UiIcons.createSvgIcon(UiIcons.GLOBE, 13, "#A78BFA"), tGps);

        gpsVal.setStyle("-fx-font-size: 16px; -fx-font-weight: 700; -fx-text-fill: #FAFAFA;");
        gpsVal.setWrapText(true);

        btnOpenMaps.getStyleClass().add("btn-secondary");
        btnOpenMaps.setStyle("-fx-font-size: 11px; -fx-padding: 3 10;");
        btnOpenMaps.setGraphic(UiIcons.createSvgIcon(UiIcons.EXTERNAL_LINK, 11, "currentColor"));
        btnOpenMaps.setGraphicTextGap(5);
        btnOpenMaps.setDisable(true);
        btnOpenMaps.setOnAction(e -> {
            if (hasGps) {
                openUrl(String.format("https://www.google.com/maps?q=%.6f,%.6f", currentLat, currentLon));
            }
        });

        cardGps.getChildren().addAll(topGps, gpsVal, btnOpenMaps);

        HBox.setHgrow(cardCamera, Priority.ALWAYS);
        HBox.setHgrow(cardLens, Priority.ALWAYS);
        HBox.setHgrow(cardDate, Priority.ALWAYS);
        HBox.setHgrow(cardGps, Priority.ALWAYS);

        grid.getChildren().addAll(cardCamera, cardLens, cardDate, cardGps);
        return grid;
    }

    private VBox createStatCard(String title, Label valLabel, String sub, String iconPath) {
        VBox card = new VBox(4);
        card.getStyleClass().add("glass-card");
        card.setPadding(new Insets(12, 14, 12, 14));

        HBox top = new HBox(6);
        top.setAlignment(Pos.CENTER_LEFT);
        Label t = new Label(title);
        t.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-text-fill: #71717A;");
        top.getChildren().addAll(UiIcons.createSvgIcon(iconPath, 13, "#A78BFA"), t);

        valLabel.setStyle("-fx-font-size: 16px; -fx-font-weight: 700; -fx-text-fill: #FAFAFA;");
        valLabel.setWrapText(true);

        Label s = new Label(sub);
        s.setStyle("-fx-font-size: 11px; -fx-text-fill: #71717A;");

        card.getChildren().addAll(top, valLabel, s);
        return card;
    }

    private VBox buildTableCard() {
        VBox card = new VBox(10);
        card.getStyleClass().add("glass-card");
        card.setPadding(new Insets(14, 14, 14, 14));
        VBox.setVgrow(card, Priority.ALWAYS);

        // Category Filter Pills Row
        HBox categoryRow = new HBox(6);
        categoryRow.setAlignment(Pos.CENTER_LEFT);

        String[] categories = {"All", "Camera", "Exposure", "Date & Time", "GPS", "Image", "IPTC / XMP"};
        List<Button> catButtons = new ArrayList<>();

        for (String cat : categories) {
            Button btn = new Button(cat);
            btn.getStyleClass().add(cat.equals("All") ? "btn-secondary" : "btn-ghost");
            btn.setStyle("-fx-font-size: 12px; -fx-font-weight: 600; -fx-padding: 5 12; -fx-background-radius: 6;");
            btn.setOnAction(e -> {
                selectedCategory = cat;
                for (Button b : catButtons) {
                    b.getStyleClass().removeAll("btn-ghost", "btn-secondary");
                    b.getStyleClass().add(b == btn ? "btn-secondary" : "btn-ghost");
                }
                updateFilter();
            });
            catButtons.add(btn);
            categoryRow.getChildren().add(btn);
        }

        // Search Bar and Tag Counter
        HBox searchRow = new HBox(10);
        searchRow.setAlignment(Pos.CENTER_LEFT);

        searchField.setPromptText("Search tags (e.g. ISO, Model, Shutter, GPS, Date, Make)...");
        searchField.setStyle("-fx-font-size: 13px; -fx-pref-height: 34px; -fx-padding: 0 10;");
        HBox.setHgrow(searchField, Priority.ALWAYS);
        searchField.textProperty().addListener((obs, oldVal, newVal) -> updateFilter());

        tagCountLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: 700; -fx-text-fill: #A78BFA; -fx-min-width: 60px;");
        searchRow.getChildren().addAll(searchField, tagCountLabel);

        // Setup TableView
        setupTableView();

        // Footer Action Strip (Local processing badge + Export CSV & JSON)
        HBox footerStrip = new HBox(12);
        footerStrip.setAlignment(Pos.CENTER_LEFT);
        footerStrip.setPadding(new Insets(4, 0, 0, 0));

        HBox localBadge = new HBox(6);
        localBadge.setAlignment(Pos.CENTER_LEFT);
        localBadge.getChildren().addAll(
                UiIcons.createSvgIcon(UiIcons.SHIELD_CHECK, 13, "#10b981"),
                new Label("100% Local ExifTool Inspection") {{
                    setStyle("-fx-font-size: 12px; -fx-text-fill: #71717A; -fx-font-weight: 600;");
                }}
        );

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        btnCsv.getStyleClass().add("btn-secondary");
        btnCsv.setGraphic(UiIcons.createSvgIcon(UiIcons.DOWNLOAD, 12, "currentColor"));
        btnCsv.setGraphicTextGap(6);
        btnCsv.setStyle("-fx-font-size: 12px; -fx-font-weight: 600; -fx-padding: 5 14;");
        btnCsv.setDisable(true);
        btnCsv.setOnAction(e -> exportToCsv());

        btnJson.getStyleClass().add("btn-secondary");
        btnJson.setGraphic(UiIcons.createSvgIcon(UiIcons.DOWNLOAD, 12, "currentColor"));
        btnJson.setGraphicTextGap(6);
        btnJson.setStyle("-fx-font-size: 12px; -fx-font-weight: 600; -fx-padding: 5 14;");
        btnJson.setDisable(true);
        btnJson.setOnAction(e -> exportToJson());

        footerStrip.getChildren().addAll(localBadge, spacer, btnCsv, btnJson);

        card.getChildren().addAll(categoryRow, searchRow, tableView, footerStrip);
        return card;
    }

    private void setupTableView() {
        TableColumn<ExifTagRow, String> tagCol = new TableColumn<>("Tag Name");
        tagCol.setCellValueFactory(data -> new javafx.beans.property.SimpleStringProperty(data.getValue().getTagName()));
        tagCol.setPrefWidth(220);
        tagCol.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(String item, boolean empty) {
                super.updateItem(item, empty);
                if (empty || item == null) {
                    setText(null);
                } else {
                    setText(item);
                    setStyle("-fx-font-weight: 600; -fx-text-fill: #FAFAFA; -fx-font-size: 13px;");
                }
            }
        });

        TableColumn<ExifTagRow, String> valCol = new TableColumn<>("Value");
        valCol.setCellValueFactory(data -> new javafx.beans.property.SimpleStringProperty(data.getValue().getValue()));
        valCol.setPrefWidth(360);
        valCol.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(String item, boolean empty) {
                super.updateItem(item, empty);
                if (empty || item == null) {
                    setText(null);
                } else {
                    setText(item);
                    setStyle("-fx-text-fill: #D4D4D8; -fx-font-size: 13px;");
                }
            }
        });

        TableColumn<ExifTagRow, String> groupCol = new TableColumn<>("Category");
        groupCol.setCellValueFactory(data -> new javafx.beans.property.SimpleStringProperty(data.getValue().getGroup()));
        groupCol.setPrefWidth(120);
        groupCol.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(String item, boolean empty) {
                super.updateItem(item, empty);
                if (empty || item == null) {
                    setText(null);
                    setGraphic(null);
                } else {
                    Label badge = new Label(item);
                    badge.setStyle("-fx-font-size: 10px; -fx-font-weight: 700; -fx-padding: 2 6; -fx-background-radius: 4; -fx-background-color: rgba(167, 139, 250, 0.12); -fx-text-fill: #A78BFA;");
                    setGraphic(badge);
                    setText(null);
                }
            }
        });

        tableView.getColumns().clear();
        tableView.getColumns().addAll(tagCol, valCol, groupCol);
        tableView.setColumnResizePolicy(TableView.CONSTRAINED_RESIZE_POLICY);
        tableView.setPlaceholder(buildEmptyTablePlaceholder());
        VBox.setVgrow(tableView, Priority.ALWAYS);

        // Context Menu for Copy Actions
        ContextMenu contextMenu = new ContextMenu();
        MenuItem copyVal = new MenuItem("Copy Value");
        copyVal.setOnAction(e -> copySelectedTagValue());

        MenuItem copyName = new MenuItem("Copy Tag Name");
        copyName.setOnAction(e -> copySelectedTagName());

        MenuItem copyBoth = new MenuItem("Copy Tag & Value");
        copyBoth.setOnAction(e -> copySelectedTagBoth());

        contextMenu.getItems().addAll(copyVal, copyName, copyBoth);
        tableView.setContextMenu(contextMenu);
    }

    private VBox buildEmptyTablePlaceholder() {
        VBox box = new VBox(8);
        box.setAlignment(Pos.CENTER);
        box.setPadding(new Insets(36, 20, 36, 20));

        Node searchIcon = UiIcons.createSvgIcon(UiIcons.SEARCH, 34, "#A78BFA");

        Label title = new Label("No metadata to display");
        title.setStyle("-fx-font-size: 15px; -fx-font-weight: 700; -fx-text-fill: #FAFAFA;");

        Label sub = new Label("Choose a photo to explore its metadata.");
        sub.setStyle("-fx-font-size: 12px; -fx-text-fill: #71717A;");

        box.getChildren().addAll(searchIcon, title, sub);
        return box;
    }

    private void updateFilter() {
        String query = searchField.getText() != null ? searchField.getText().toLowerCase().trim() : "";
        filteredData.setPredicate(row -> {
            boolean matchesCat = matchesCategory(row, selectedCategory);
            if (!matchesCat) return false;

            if (query.isEmpty()) return true;
            return (row.getTagName() != null && row.getTagName().toLowerCase().contains(query)) ||
                   (row.getValue() != null && row.getValue().toLowerCase().contains(query)) ||
                   (row.getGroup() != null && row.getGroup().toLowerCase().contains(query));
        });

        int size = filteredData.size();
        tagCountLabel.setText(size + (size == 1 ? " tag" : " tags"));
    }

    private boolean matchesCategory(ExifTagRow row, String category) {
        if ("All".equalsIgnoreCase(category)) return true;
        String g = row.getGroup() != null ? row.getGroup().toLowerCase() : "";
        String t = row.getTagName() != null ? row.getTagName().toLowerCase() : "";

        switch (category.toLowerCase()) {
            case "camera":
                return g.contains("camera") || t.contains("make") || t.contains("model") || t.contains("lens") ||
                       t.contains("serial") || t.contains("firmware") || t.contains("body") || t.contains("software");
            case "exposure":
                return t.contains("iso") || t.contains("aperture") || t.contains("shutter") || t.contains("exposure") ||
                       t.contains("fnumber") || t.contains("focal") || t.contains("flash") || t.contains("metering") ||
                       t.contains("whitebalance") || t.contains("lightsource");
            case "date & time":
                return g.contains("time") || t.contains("date") || t.contains("time") || t.contains("offset") || t.contains("zone");
            case "gps":
                return g.contains("gps") || t.contains("gps") || t.contains("lat") || t.contains("lon") || t.contains("alt");
            case "image":
                return g.contains("file") || g.contains("image") || t.contains("width") || t.contains("height") ||
                       t.contains("resolution") || t.contains("colorspace") || t.contains("bits") || t.contains("compression") ||
                       t.contains("orientation") || t.contains("size") || t.contains("format");
            case "iptc / xmp":
                return g.contains("iptc") || g.contains("xmp") || t.contains("artist") || t.contains("copyright") ||
                       t.contains("creator") || t.contains("description") || t.contains("caption") || t.contains("title") ||
                       t.contains("byline") || t.contains("credit") || t.contains("rights");
            default:
                return true;
        }
    }

    private void chooseFile() {
        FileChooser chooser = new FileChooser();
        chooser.setTitle("Select Photo or Video for EXIF Inspection");
        chooser.getExtensionFilters().add(new FileChooser.ExtensionFilter(
                "Media Files (*.jpg, *.jpeg, *.png, *.heic, *.mp4, *.mov, *.cr2, *.cr3, *.nef, *.arw, *.dng)",
                "*.jpg", "*.jpeg", "*.png", "*.heic", "*.mp4", "*.mov", "*.cr2", "*.cr3", "*.nef", "*.arw", "*.dng"
        ));

        File file = chooser.showOpenDialog(stage);
        if (file != null) {
            inspectFile(file);
        }
    }

    private void setupDragAndDrop() {
        setOnDragOver(e -> {
            if (e.getDragboard().hasFiles()) {
                e.acceptTransferModes(TransferMode.COPY);
            }
            e.consume();
        });

        setOnDragDropped(e -> {
            Dragboard db = e.getDragboard();
            if (db.hasFiles() && !db.getFiles().isEmpty()) {
                File file = db.getFiles().get(0);
                inspectFile(file);
                e.setDropCompleted(true);
            } else {
                e.setDropCompleted(false);
            }
            e.consume();
        });
    }

    public void inspectFile(File file) {
        if (file == null || !file.exists()) return;
        this.currentSelectedFile = file;
        previewNameLabel.setText(file.getName());

        // Load preview image
        loadPreviewImage(file);

        // Background ExifTool inspection
        Task<List<ExifTagRow>> task = new Task<>() {
            @Override
            protected List<ExifTagRow> call() {
                List<ExifTagRow> rows = new ArrayList<>();

                // System file stats
                rows.add(new ExifTagRow("System", "FileName", file.getName()));
                rows.add(new ExifTagRow("System", "FileSize", String.format("%.2f MB", file.length() / (1024.0 * 1024.0))));
                String lastMod = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")
                        .withZone(ZoneId.systemDefault())
                        .format(Instant.ofEpochMilli(file.lastModified()));
                rows.add(new ExifTagRow("System", "FileModifyDate", lastMod));

                if (exifToolEngine != null) {
                    try {
                        List<String> output = exifToolEngine.executeWithOutput(List.of("-s", "-G", file.getAbsolutePath()));
                        for (String line : output) {
                            if (line.startsWith("[") && line.contains("]")) {
                                int closeIdx = line.indexOf("]");
                                String group = line.substring(1, closeIdx).trim();
                                String rest = line.substring(closeIdx + 1).trim();
                                int colonIdx = rest.indexOf(":");
                                if (colonIdx > 0) {
                                    String tag = rest.substring(0, colonIdx).trim();
                                    String val = rest.substring(colonIdx + 1).trim();
                                    rows.add(new ExifTagRow(group, tag, val));
                                }
                            }
                        }
                    } catch (Exception ignored) {}
                }
                return rows;
            }
        };

        task.setOnSucceeded(e -> {
            List<ExifTagRow> result = task.getValue();
            masterData.clear();
            masterData.addAll(result);

            btnCsv.setDisable(masterData.isEmpty());
            btnJson.setDisable(masterData.isEmpty());

            updateFilter();

            // Update Quick Stats Cards
            String make = findTagValue(result, "Make");
            String model = findTagValue(result, "Model");
            if (!model.isEmpty()) {
                cameraVal.setText((make.isEmpty() ? "" : make + " ") + model);
            } else {
                cameraVal.setText(!make.isEmpty() ? make : "—");
            }

            String lens = findTagValue(result, "LensModel");
            String focal = findTagValue(result, "FocalLength");
            String fnum = findTagValue(result, "FNumber");
            String iso = findTagValue(result, "ISO");
            StringBuilder lensSb = new StringBuilder();
            if (!focal.isEmpty()) lensSb.append(focal).append(" ");
            if (!fnum.isEmpty()) lensSb.append("f/").append(fnum).append(" ");
            if (!iso.isEmpty()) lensSb.append("ISO ").append(iso);
            lensVal.setText(lensSb.length() > 0 ? lensSb.toString().trim() : (lens.isEmpty() ? "—" : lens));

            String dto = findTagValue(result, "DateTimeOriginal");
            if (dto.isEmpty()) dto = findTagValue(result, "CreateDate");
            dateVal.setText(dto.isEmpty() ? "—" : dto);

            // GPS parsing
            String latStr = findTagValue(result, "GPSLatitude");
            String lonStr = findTagValue(result, "GPSLongitude");
            if (!latStr.isEmpty() && !lonStr.isEmpty()) {
                try {
                    gpsVal.setText(latStr + ", " + lonStr);
                    btnOpenMaps.setDisable(false);
                    hasGps = true;
                    currentLat = parseGpsCoord(latStr);
                    currentLon = parseGpsCoord(lonStr);
                } catch (Exception ex) {
                    gpsVal.setText(latStr + ", " + lonStr);
                }
            } else {
                gpsVal.setText("—");
                btnOpenMaps.setDisable(true);
                hasGps = false;
            }

            // Update Completeness Badges
            boolean hasExif = result.stream().anyMatch(r -> "EXIF".equalsIgnoreCase(r.getGroup()) || r.getTagName().contains("Exif"));
            boolean hasIptc = result.stream().anyMatch(r -> "IPTC".equalsIgnoreCase(r.getGroup()) || "XMP".equalsIgnoreCase(r.getGroup()));
            updateBadgeStyle(badgeExif, hasExif, hasExif ? "EXIF Detected" : "EXIF —");
            updateBadgeStyle(badgeGps, hasGps, hasGps ? "GPS Embedded" : "GPS —");
            updateBadgeStyle(badgeIptc, hasIptc, hasIptc ? "IPTC / XMP" : "IPTC —");
        });

        Thread t = new Thread(task, "fx-exif-reader");
        t.setDaemon(true);
        t.start();
    }

    private void loadPreviewImage(File file) {
        String name = file.getName().toLowerCase();
        double mb = file.length() / (1024.0 * 1024.0);
        String ext = name.contains(".") ? name.substring(name.lastIndexOf('.') + 1).toUpperCase() : "MEDIA";

        if (name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".png") || name.endsWith(".gif") || name.endsWith(".bmp")) {
            try {
                Image img = new Image(file.toURI().toString(), 600, 600, true, true, true);
                img.progressProperty().addListener((obs, oldVal, newVal) -> {
                    if (newVal.doubleValue() >= 1.0 && !img.isError()) {
                        Platform.runLater(() -> {
                            previewImageView.setImage(img);
                            previewImageView.setVisible(true);
                            emptyPreviewBox.setVisible(false);
                            emptyPreviewBox.setManaged(false);

                            btnZoomIn.setDisable(false);
                            btnZoomOut.setDisable(false);
                            btnZoomFit.setDisable(false);
                            applyZoom(1.0);

                            int w = (int) img.getWidth();
                            int h = (int) img.getHeight();
                            previewMetaLabel.setText(String.format("%s · %d × %d · %.2f MB", ext, w, h, mb));
                        });
                    }
                });
                return;
            } catch (Exception ignored) {}
        }

        // Fallback for RAW or video formats without direct JavaFX image decoder
        previewImageView.setImage(null);
        previewImageView.setVisible(false);
        emptyPreviewBox.setVisible(true);
        emptyPreviewBox.setManaged(true);
        btnZoomIn.setDisable(true);
        btnZoomOut.setDisable(true);
        btnZoomFit.setDisable(true);
        previewMetaLabel.setText(String.format("%s · %.2f MB", ext, mb));
    }

    private void copySelectedTagValue() {
        ExifTagRow selected = tableView.getSelectionModel().getSelectedItem();
        if (selected != null && selected.getValue() != null) {
            Clipboard clipboard = Clipboard.getSystemClipboard();
            ClipboardContent content = new ClipboardContent();
            content.putString(selected.getValue());
            clipboard.setContent(content);
        }
    }

    private void copySelectedTagName() {
        ExifTagRow selected = tableView.getSelectionModel().getSelectedItem();
        if (selected != null && selected.getTagName() != null) {
            Clipboard clipboard = Clipboard.getSystemClipboard();
            ClipboardContent content = new ClipboardContent();
            content.putString(selected.getTagName());
            clipboard.setContent(content);
        }
    }

    private void copySelectedTagBoth() {
        ExifTagRow selected = tableView.getSelectionModel().getSelectedItem();
        if (selected != null) {
            Clipboard clipboard = Clipboard.getSystemClipboard();
            ClipboardContent content = new ClipboardContent();
            content.putString(selected.getTagName() + ": " + selected.getValue());
            clipboard.setContent(content);
        }
    }

    private void exportToCsv() {
        if (filteredData.isEmpty()) return;
        FileChooser chooser = new FileChooser();
        chooser.setTitle("Save Metadata CSV");
        chooser.getExtensionFilters().add(new FileChooser.ExtensionFilter("CSV File (*.csv)", "*.csv"));
        chooser.setInitialFileName((currentSelectedFile != null ? currentSelectedFile.getName() : "metadata") + ".csv");
        File dest = chooser.showSaveDialog(stage);
        if (dest != null) {
            try {
                List<com.takeoutfix.exif.ExifExportService.TagEntry> entries = filteredData.stream()
                        .map(r -> new com.takeoutfix.exif.ExifExportService.TagEntry(r.getGroup(), r.getTagName(), r.getValue()))
                        .toList();
                com.takeoutfix.exif.ExifExportService.exportCsv(entries, dest.toPath());
            } catch (Exception ignored) {}
        }
    }

    private void exportToJson() {
        if (filteredData.isEmpty()) return;
        FileChooser chooser = new FileChooser();
        chooser.setTitle("Save Metadata JSON");
        chooser.getExtensionFilters().add(new FileChooser.ExtensionFilter("JSON File (*.json)", "*.json"));
        chooser.setInitialFileName((currentSelectedFile != null ? currentSelectedFile.getName() : "metadata") + ".json");
        File dest = chooser.showSaveDialog(stage);
        if (dest != null) {
            try {
                List<com.takeoutfix.exif.ExifExportService.TagEntry> entries = filteredData.stream()
                        .map(r -> new com.takeoutfix.exif.ExifExportService.TagEntry(r.getGroup(), r.getTagName(), r.getValue()))
                        .toList();
                com.takeoutfix.exif.ExifExportService.exportJson(entries, dest.toPath());
            } catch (Exception ignored) {}
        }
    }

    private String findTagValue(List<ExifTagRow> list, String tagName) {
        for (ExifTagRow r : list) {
            if (r.getTagName().equalsIgnoreCase(tagName)) {
                return r.getValue();
            }
        }
        return "";
    }

    private double parseGpsCoord(String s) {
        try {
            return Double.parseDouble(s.replaceAll("[^0-9.-]", ""));
        } catch (Exception e) {
            return 0.0;
        }
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
