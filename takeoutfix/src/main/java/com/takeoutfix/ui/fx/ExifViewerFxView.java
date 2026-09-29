package com.takeoutfix.ui.fx;

import com.takeoutfix.restore.infrastructure.NativeExifToolEngine;
import javafx.application.Platform;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.collections.transformation.FilteredList;
import javafx.concurrent.Task;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.*;
import javafx.scene.image.Image;
import javafx.scene.image.ImageView;
import javafx.scene.input.Clipboard;
import javafx.scene.input.ClipboardContent;
import javafx.scene.input.Dragboard;
import javafx.scene.input.TransferMode;
import javafx.scene.layout.*;
import javafx.stage.FileChooser;
import javafx.stage.Stage;

import java.awt.Desktop;
import java.io.File;
import java.io.PrintWriter;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

/**
 * Pure JavaFX EXIF & Metadata Viewer.
 * Features:
 * 1. Image preview with dimensions, format, file size, and filename.
 * 2. Metadata completeness badges (EXIF, GPS, IPTC/XMP).
 * 3. Quick camera hardware stats (Make, Model, Lens, Aperture, Date, GPS coordinates).
 * 4. Searchable & filterable tags table with NativeExifToolEngine inspection.
 * 5. Metadata export to CSV and JSON formats, plus clipboard copy.
 */
public class ExifViewerFxView extends VBox {

    public static class ExifTagRow {
        private final String group;
        private final String tagName;
        private final String value;

        public ExifTagRow(String group, String tagName, String value) {
            this.group = group;
            this.tagName = tagName;
            this.value = value;
        }

        public String getGroup() { return group; }
        public String getTagName() { return tagName; }
        public String getValue() { return value; }
    }

    private final Stage stage;
    private final NativeExifToolEngine exifToolEngine;
    private final Consumer<WorkspaceType> onNavigate;

    private final Label filePathLabel = new Label("No photo or video file selected yet");
    private final Label cameraVal = new Label("—");
    private final Label lensVal = new Label("—");
    private final DateLabelWrapper dateVal = new DateLabelWrapper();
    private final Label gpsVal = new Label("—");
    private final Button btnOpenMaps = new Button("View on Google Maps");

    // Preview & Completeness Card
    private final ImageView previewImageView = new ImageView();
    private final Label previewNameLabel = new Label("No image selected");
    private final Label previewMetaLabel = new Label("Drag & drop or select a photo to preview");
    private final Label badgeExif = createBadge("EXIF detected", false);
    private final Label badgeGps = createBadge("GPS embedded", false);
    private final Label badgeXmp = createBadge("IPTC / XMP", false);

    private final TextField searchField = new TextField();
    private final ObservableList<ExifTagRow> masterData = FXCollections.observableArrayList();
    private final FilteredList<ExifTagRow> filteredData = new FilteredList<>(masterData, p -> true);
    private final TableView<ExifTagRow> tableView = new TableView<>(filteredData);

    private double currentLat = 0.0;
    private double currentLon = 0.0;
    private boolean hasGps = false;
    private File currentSelectedFile = null;

    private static class DateLabelWrapper {
        final Label label = new Label("—");
    }

    public ExifViewerFxView(Stage stage, NativeExifToolEngine exifToolEngine, Consumer<WorkspaceType> onNavigate) {
        this.stage = stage;
        this.exifToolEngine = exifToolEngine;
        this.onNavigate = onNavigate;

        setSpacing(12);
        setPadding(new Insets(14, 18, 14, 18));
        VBox.setVgrow(this, Priority.ALWAYS);

        // 1. Header Row
        getChildren().add(buildHeaderRow());

        // 2. File Selection Box (with Drag and Drop)
        getChildren().add(buildFilePickerCard());

        // 3. Main Split View: Left (Preview & Actions) | Right (Quick Stats & Table)
        HBox mainSplit = new HBox(14);
        VBox.setVgrow(mainSplit, Priority.ALWAYS);

        VBox previewCard = buildPreviewCard();
        previewCard.setPrefWidth(300);
        previewCard.setMinWidth(280);
        previewCard.setMaxWidth(340);

        VBox rightPane = new VBox(12);
        HBox.setHgrow(rightPane, Priority.ALWAYS);
        rightPane.getChildren().addAll(buildQuickStatsGrid(), buildTableCard());

        mainSplit.getChildren().addAll(previewCard, rightPane);
        getChildren().add(mainSplit);

        loadSampleTags();
    }

    private HBox buildHeaderRow() {
        HBox header = new HBox(12);
        header.setAlignment(Pos.CENTER_LEFT);

        VBox titleBox = new VBox(2);
        Label title = new Label("VIEW PHOTO DETAILS");
        title.setStyle("-fx-font-size: 15px; -fx-font-weight: 800;");

        Label subtitle = new Label("Inspect camera hardware specs, capture date, lens model, GPS coordinates, and raw photo details.");
        subtitle.setStyle("-fx-font-size: 11px; -fx-text-fill: #71717a;");
        titleBox.getChildren().addAll(title, subtitle);

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        Button btnBack = new Button("Back to Fix Google Photos");
        btnBack.getStyleClass().add("btn-secondary");
        btnBack.setGraphic(UiIcons.createSvgIcon(UiIcons.RESTORE, 12, "currentColor"));
        btnBack.setOnAction(e -> {
            if (onNavigate != null) onNavigate.accept(WorkspaceType.TAKEOUT_RESTORE);
        });

        header.getChildren().addAll(titleBox, spacer, btnBack);
        return header;
    }

    private VBox buildFilePickerCard() {
        VBox card = new VBox(8);
        card.getStyleClass().add("glass-card");
        card.setPadding(new Insets(10, 14, 10, 14));

        HBox row = new HBox(12);
        row.setAlignment(Pos.CENTER_LEFT);

        Button btnBrowse = new Button("Browse Photo / Video");
        btnBrowse.getStyleClass().add("btn-primary");
        btnBrowse.setGraphic(UiIcons.createSvgIcon(UiIcons.FOLDER, 13, "currentColor"));
        btnBrowse.setOnAction(e -> chooseFile());

        filePathLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: 600; -fx-text-fill: #71717a;");
        filePathLabel.setMaxWidth(Double.MAX_VALUE);
        HBox.setHgrow(filePathLabel, Priority.ALWAYS);

        row.getChildren().addAll(btnBrowse, filePathLabel);

        // Drag and Drop
        card.setOnDragOver(e -> {
            if (e.getDragboard().hasFiles()) {
                e.acceptTransferModes(TransferMode.COPY);
            }
            e.consume();
        });

        card.setOnDragDropped(e -> {
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

        card.getChildren().add(row);
        return card;
    }

    private VBox buildPreviewCard() {
        VBox card = new VBox(10);
        card.getStyleClass().add("glass-card");
        card.setPadding(new Insets(14, 14, 14, 14));
        VBox.setVgrow(card, Priority.ALWAYS);

        Label header = new Label("IMAGE PREVIEW & SPECS");
        header.setStyle("-fx-font-size: 10px; -fx-font-weight: 800; -fx-text-fill: #71717a; -fx-letter-spacing: 0.5px;");

        // Preview Box with fixed frame
        StackPane imgBox = new StackPane();
        imgBox.setMinHeight(200);
        imgBox.setPrefHeight(220);
        imgBox.setStyle("-fx-background-color: rgba(0,0,0,0.06); -fx-background-radius: 8; -fx-border-color: rgba(0,0,0,0.08); -fx-border-radius: 8;");

        previewImageView.setFitWidth(260);
        previewImageView.setFitHeight(200);
        previewImageView.setPreserveRatio(true);
        previewImageView.setSmooth(true);
        imgBox.getChildren().add(previewImageView);

        previewNameLabel.setStyle("-fx-font-size: 13px; -fx-font-weight: 700;");
        previewNameLabel.setWrapText(true);

        previewMetaLabel.setStyle("-fx-font-size: 11px; -fx-text-fill: #71717a;");
        previewMetaLabel.setWrapText(true);

        // Completeness Badges
        Label compTitle = new Label("METADATA COMPLETENESS");
        compTitle.setStyle("-fx-font-size: 9px; -fx-font-weight: 800; -fx-text-fill: #71717a; -fx-padding: 4 0 0 0;");

        HBox badgesBox = new HBox(6);
        badgesBox.getChildren().addAll(badgeExif, badgeGps, badgeXmp);

        // Export and Action buttons
        Separator sep = new Separator();
        VBox actionsBox = new VBox(6);
        Label actTitle = new Label("ACTIONS & EXPORT");
        actTitle.setStyle("-fx-font-size: 9px; -fx-font-weight: 800; -fx-text-fill: #71717a;");

        HBox exportRow = new HBox(6);
        Button btnCsv = new Button("Export CSV");
        btnCsv.getStyleClass().add("btn-secondary");
        btnCsv.setStyle("-fx-font-size: 11px; -fx-padding: 4 10 4 10;");
        btnCsv.setOnAction(e -> exportToCsv());

        Button btnJson = new Button("Export JSON");
        btnJson.getStyleClass().add("btn-secondary");
        btnJson.setStyle("-fx-font-size: 11px; -fx-padding: 4 10 4 10;");
        btnJson.setOnAction(e -> exportToJson());

        Button btnCopy = new Button("Copy Tag");
        btnCopy.getStyleClass().add("btn-ghost");
        btnCopy.setGraphic(UiIcons.createSvgIcon(UiIcons.COPY, 12, "currentColor"));
        btnCopy.setStyle("-fx-font-size: 11px; -fx-padding: 4 8 4 8;");
        btnCopy.setOnAction(e -> copySelectedTag());

        exportRow.getChildren().addAll(btnCsv, btnJson, btnCopy);
        actionsBox.getChildren().addAll(actTitle, exportRow);

        card.getChildren().addAll(header, imgBox, previewNameLabel, previewMetaLabel, compTitle, badgesBox, sep, actionsBox);
        return card;
    }

    private static Label createBadge(String text, boolean active) {
        Label b = new Label(text);
        updateBadgeStyle(b, active);
        return b;
    }

    private static void updateBadgeStyle(Label b, boolean active) {
        if (active) {
            b.setStyle("-fx-font-size: 10px; -fx-font-weight: 700; -fx-padding: 3 8 3 8; -fx-background-radius: 4; -fx-background-color: rgba(16, 185, 129, 0.15); -fx-text-fill: #10b981;");
        } else {
            b.setStyle("-fx-font-size: 10px; -fx-font-weight: 600; -fx-padding: 3 8 3 8; -fx-background-radius: 4; -fx-background-color: rgba(113, 113, 122, 0.12); -fx-text-fill: #71717a;");
        }
    }

    private HBox buildQuickStatsGrid() {
        HBox grid = new HBox(10);
        grid.setAlignment(Pos.CENTER);

        VBox card1 = createStatCard("CAMERA HARDWARE", cameraVal, "Make & Model");
        VBox card2 = createStatCard("LENS & APERTURE", lensVal, "Focal, f-stop, ISO");
        VBox card3 = createStatCard("CAPTURE DATE / TIME", dateVal.label, "EXIF DateTimeOriginal");

        VBox card4 = new VBox(4);
        card4.getStyleClass().add("glass-card");
        card4.setPadding(new Insets(10, 12, 10, 12));
        card4.setStyle(card4.getStyle() + "; -fx-border-left-color: #3b82f6; -fx-border-left-width: 3px;");

        Label t4 = new Label("GPS COORDINATES");
        t4.setStyle("-fx-font-size: 9px; -fx-font-weight: 800; -fx-text-fill: #71717a;");
        gpsVal.setStyle("-fx-font-size: 12px; -fx-font-weight: 700;");

        btnOpenMaps.getStyleClass().add("btn-secondary");
        btnOpenMaps.setStyle("-fx-font-size: 10px; -fx-padding: 3 8 3 8;");
        btnOpenMaps.setGraphic(UiIcons.createSvgIcon(UiIcons.GLOBE, 11, "currentColor"));
        btnOpenMaps.setDisable(true);
        btnOpenMaps.setOnAction(e -> {
            if (hasGps) {
                openUrl(String.format("https://www.google.com/maps?q=%.6f,%.6f", currentLat, currentLon));
            }
        });

        card4.getChildren().addAll(t4, gpsVal, btnOpenMaps);

        HBox.setHgrow(card1, Priority.ALWAYS);
        HBox.setHgrow(card2, Priority.ALWAYS);
        HBox.setHgrow(card3, Priority.ALWAYS);
        HBox.setHgrow(card4, Priority.ALWAYS);

        grid.getChildren().addAll(card1, card2, card3, card4);
        return grid;
    }

    private VBox createStatCard(String title, Label valLabel, String sub) {
        VBox card = new VBox(2);
        card.getStyleClass().add("glass-card");
        card.setPadding(new Insets(10, 12, 10, 12));

        Label t = new Label(title);
        t.setStyle("-fx-font-size: 9px; -fx-font-weight: 800; -fx-text-fill: #71717a;");

        valLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: 700;");

        Label s = new Label(sub);
        s.setStyle("-fx-font-size: 9px; -fx-text-fill: #71717a;");

        card.getChildren().addAll(t, valLabel, s);
        return card;
    }

    private VBox buildTableCard() {
        VBox card = new VBox(8);
        card.getStyleClass().add("glass-card");
        card.setPadding(new Insets(10, 12, 10, 12));
        VBox.setVgrow(card, Priority.ALWAYS);

        HBox searchRow = new HBox(8);
        searchRow.setAlignment(Pos.CENTER_LEFT);

        Label searchLbl = new Label("Filter Tags:");
        searchLbl.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-text-fill: #71717a;");

        searchField.setPromptText("Search tags (e.g. ISO, Model, Shutter, GPS, Date, Make)...");
        searchField.setStyle("-fx-font-size: 11px; -fx-pref-height: 30px;");
        HBox.setHgrow(searchField, Priority.ALWAYS);

        searchField.textProperty().addListener((obs, oldVal, newVal) -> {
            filteredData.setPredicate(row -> {
                if (newVal == null || newVal.isBlank()) return true;
                String q = newVal.toLowerCase().trim();
                return (row.getTagName() != null && row.getTagName().toLowerCase().contains(q)) ||
                       (row.getValue() != null && row.getValue().toLowerCase().contains(q)) ||
                       (row.getGroup() != null && row.getGroup().toLowerCase().contains(q));
            });
        });

        searchRow.getChildren().addAll(searchLbl, searchField);

        // Setup TableView
        TableColumn<ExifTagRow, String> tagCol = new TableColumn<>("Tag Name");
        tagCol.setCellValueFactory(data -> new javafx.beans.property.SimpleStringProperty(data.getValue().getTagName()));
        tagCol.setPrefWidth(200);

        TableColumn<ExifTagRow, String> valCol = new TableColumn<>("Value");
        valCol.setCellValueFactory(data -> new javafx.beans.property.SimpleStringProperty(data.getValue().getValue()));
        valCol.setPrefWidth(340);

        TableColumn<ExifTagRow, String> groupCol = new TableColumn<>("Category / Group");
        groupCol.setCellValueFactory(data -> new javafx.beans.property.SimpleStringProperty(data.getValue().getGroup()));
        groupCol.setPrefWidth(130);

        tableView.getColumns().clear();
        tableView.getColumns().add(tagCol);
        tableView.getColumns().add(valCol);
        tableView.getColumns().add(groupCol);
        tableView.setColumnResizePolicy(TableView.CONSTRAINED_RESIZE_POLICY);
        VBox.setVgrow(tableView, Priority.ALWAYS);

        card.getChildren().addAll(searchRow, tableView);
        return card;
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

    public void inspectFile(File file) {
        if (file == null || !file.exists()) return;
        this.currentSelectedFile = file;
        filePathLabel.setText(file.getAbsolutePath());
        previewNameLabel.setText(file.getName());

        // Load preview image
        loadPreviewImage(file);

        // Background ExifTool inspection
        Task<List<ExifTagRow>> task = new Task<>() {
            @Override
            protected List<ExifTagRow> call() {
                List<ExifTagRow> rows = new ArrayList<>();

                // Basic File metadata
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
                            // Format: [Group] TagName : Value
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

            // Update Quick Stats
            String make = findTagValue(result, "Make");
            String model = findTagValue(result, "Model");
            if (!model.isEmpty()) {
                cameraVal.setText((make.isEmpty() ? "" : make + " ") + model);
            } else {
                cameraVal.setText("—");
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
            dateVal.label.setText(dto.isEmpty() ? "—" : dto);

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
                gpsVal.setText("No GPS tags embedded");
                btnOpenMaps.setDisable(true);
                hasGps = false;
            }

            // Update Completeness Badges
            boolean hasExif = result.stream().anyMatch(r -> "EXIF".equalsIgnoreCase(r.getGroup()) || r.getTagName().contains("Exif"));
            boolean hasIptc = result.stream().anyMatch(r -> "IPTC".equalsIgnoreCase(r.getGroup()) || "XMP".equalsIgnoreCase(r.getGroup()));
            updateBadgeStyle(badgeExif, hasExif);
            updateBadgeStyle(badgeGps, hasGps);
            updateBadgeStyle(badgeXmp, hasIptc);
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
                Image img = new Image(file.toURI().toString(), 280, 220, true, true, true);
                img.progressProperty().addListener((obs, oldVal, newVal) -> {
                    if (newVal.doubleValue() >= 1.0 && !img.isError()) {
                        Platform.runLater(() -> {
                            previewImageView.setImage(img);
                            int w = (int) img.getWidth();
                            int h = (int) img.getHeight();
                            previewMetaLabel.setText(String.format("%s · %d × %d · %.2f MB", ext, w, h, mb));
                        });
                    }
                });
                return;
            } catch (Exception ignored) {}
        }

        // Fallback for RAW or unsupported video thumbnail
        previewImageView.setImage(null);
        previewMetaLabel.setText(String.format("%s · %.2f MB", ext, mb));
    }

    private void copySelectedTag() {
        ExifTagRow selected = tableView.getSelectionModel().getSelectedItem();
        if (selected != null && selected.getValue() != null) {
            Clipboard clipboard = Clipboard.getSystemClipboard();
            ClipboardContent content = new ClipboardContent();
            content.putString(selected.getValue());
            clipboard.setContent(content);
        }
    }

    private void exportToCsv() {
        if (masterData.isEmpty()) return;
        FileChooser chooser = new FileChooser();
        chooser.setTitle("Save Metadata CSV");
        chooser.getExtensionFilters().add(new FileChooser.ExtensionFilter("CSV File (*.csv)", "*.csv"));
        chooser.setInitialFileName((currentSelectedFile != null ? currentSelectedFile.getName() : "metadata") + ".csv");
        File dest = chooser.showSaveDialog(stage);
        if (dest != null) {
            try {
                List<com.takeoutfix.exif.ExifExportService.TagEntry> entries = masterData.stream()
                        .map(r -> new com.takeoutfix.exif.ExifExportService.TagEntry(r.getGroup(), r.getTagName(), r.getValue()))
                        .toList();
                com.takeoutfix.exif.ExifExportService.exportCsv(entries, dest.toPath());
            } catch (Exception ignored) {}
        }
    }

    private void exportToJson() {
        if (masterData.isEmpty()) return;
        FileChooser chooser = new FileChooser();
        chooser.setTitle("Save Metadata JSON");
        chooser.getExtensionFilters().add(new FileChooser.ExtensionFilter("JSON File (*.json)", "*.json"));
        chooser.setInitialFileName((currentSelectedFile != null ? currentSelectedFile.getName() : "metadata") + ".json");
        File dest = chooser.showSaveDialog(stage);
        if (dest != null) {
            try {
                List<com.takeoutfix.exif.ExifExportService.TagEntry> entries = masterData.stream()
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

    private void loadSampleTags() {
        masterData.add(new ExifTagRow("System", "Select a photo or video above to inspect EXIF metadata", "Ready"));
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
