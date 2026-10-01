package com.takeoutfix.metasync.ui;

import com.takeoutfix.metasync.core.FilePairingService;
import com.takeoutfix.metasync.model.PhotoPair;
import com.takeoutfix.ui.fx.UiIcons;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.collections.transformation.FilteredList;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.*;
import javafx.scene.image.Image;
import javafx.scene.image.ImageView;
import javafx.scene.layout.*;
import javafx.stage.DirectoryChooser;
import javafx.stage.Stage;

import java.io.File;
import java.util.List;
import java.util.function.Consumer;

/**
 * Enhanced folder selection and matched photo pairs explorer card for MetaSync.
 * Supports thumbnail previews, real-time pair search, and match indicators.
 */
public class PairExplorerCard extends VBox {

    private final Stage stage;
    private final FilePairingService pairingService;
    private Consumer<PhotoPair> onPairSelected;

    private final TextField rawFolderField = new TextField();
    private final TextField exportFolderField = new TextField();
    private final TextField searchField = new TextField();

    private final ObservableList<PhotoPair> masterPairs = FXCollections.observableArrayList();
    private final FilteredList<PhotoPair> filteredPairs = new FilteredList<>(masterPairs, p -> true);
    private final ListView<PhotoPair> pairListView = new ListView<>(filteredPairs);
    private final Label pairCountLabel = new Label("0 pairs");

    public PairExplorerCard(Stage stage, FilePairingService pairingService) {
        this.stage = stage;
        this.pairingService = pairingService;

        getStyleClass().add("glass-card");
        setStyle("-fx-border-radius: 8; -fx-background-radius: 8; -fx-padding: 14;");
        setSpacing(10);
        setPrefWidth(380);
        setMinWidth(340);
        VBox.setVgrow(this, Priority.ALWAYS);

        buildHeader();
        buildFolderPickers();
        buildPairList();
    }

    private void buildHeader() {
        HBox header = new HBox(8);
        header.setAlignment(Pos.CENTER_LEFT);

        Label title = new Label("Photo Libraries & Pairs");
        title.setStyle("-fx-font-size: 15px; -fx-font-weight: 700; ");

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        pairCountLabel.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-padding: 2 8 2 8; -fx-background-radius: 10;"); pairCountLabel.getStyleClass().add("badge-counter");
        header.getChildren().addAll(title, spacer, pairCountLabel);
        getChildren().add(header);
    }

    private void buildFolderPickers() {
        VBox pickers = new VBox(8);

        // RAW Folder
        VBox rawBox = new VBox(2);
        Label rawLbl = new Label("RAW Originals Library");
        rawLbl.setStyle("-fx-font-size: 12px; -fx-font-weight: 600;"); rawLbl.getStyleClass().add("text-secondary");

        rawFolderField.setPromptText("Folder with RAW originals (.CR3, .NEF, .ARW)...");
        rawFolderField.setStyle("-fx-font-size: 12px;    -fx-border-radius: 6; -fx-background-radius: 6;");

        Button browseRawBtn = new Button("Browse");
        browseRawBtn.getStyleClass().add("btn-secondary");
        browseRawBtn.setStyle("-fx-font-size: 12px;");
        browseRawBtn.setGraphic(UiIcons.createSvgIcon(UiIcons.FOLDER, 13, "currentColor"));
        browseRawBtn.setOnAction(e -> chooseFolder(rawFolderField, true));

        HBox rawRow = new HBox(6, rawFolderField, browseRawBtn);
        HBox.setHgrow(rawFolderField, Priority.ALWAYS);
        rawBox.getChildren().addAll(rawLbl, rawRow);

        // Export Folder
        VBox expBox = new VBox(2);
        Label expLbl = new Label("Destination / Export Library");
        expLbl.setStyle("-fx-font-size: 12px; -fx-font-weight: 600;"); expLbl.getStyleClass().add("text-secondary");

        exportFolderField.setPromptText("Folder with JPEGs or XMPs...");
        exportFolderField.setStyle("-fx-font-size: 12px;    -fx-border-radius: 6; -fx-background-radius: 6;");

        Button browseExpBtn = new Button("Browse");
        browseExpBtn.getStyleClass().add("btn-secondary");
        browseExpBtn.setStyle("-fx-font-size: 12px;");
        browseExpBtn.setGraphic(UiIcons.createSvgIcon(UiIcons.OUTPUT_FOLDER, 13, "currentColor"));
        browseExpBtn.setOnAction(e -> chooseFolder(exportFolderField, false));

        HBox expRow = new HBox(6, exportFolderField, browseExpBtn);
        HBox.setHgrow(exportFolderField, Priority.ALWAYS);
        expBox.getChildren().addAll(expLbl, expRow);

        // Scan button
        Button scanBtn = new Button("Scan & Match Pairs");
        scanBtn.getStyleClass().add("btn-primary");
        scanBtn.setMaxWidth(Double.MAX_VALUE);
        scanBtn.setStyle("-fx-font-size: 13px; -fx-padding: 7 14 7 14;");
        scanBtn.setGraphic(UiIcons.createSvgIcon(UiIcons.SYNC, 14, "currentColor"));
        scanBtn.setOnAction(e -> scanPairs());

        pickers.getChildren().addAll(rawBox, expBox, scanBtn);
        getChildren().add(pickers);
    }

    private void buildPairList() {
        VBox listContainer = new VBox(8);
        VBox.setVgrow(listContainer, Priority.ALWAYS);

        // Search bar
        searchField.setPromptText("Search pairs...");
        searchField.setStyle("-fx-font-size: 12px;    -fx-border-radius: 6; -fx-background-radius: 6;");
        searchField.textProperty().addListener((obs, oldVal, newVal) -> {
            String q = newVal == null ? "" : newVal.trim().toLowerCase();
            filteredPairs.setPredicate(pair -> q.isEmpty() || pair.getBaseName().toLowerCase().contains(q));
            pairCountLabel.setText(filteredPairs.size() + " pairs");
        });

        pairListView.setStyle("  -fx-border-radius: 6; -fx-background-radius: 6;");
        VBox.setVgrow(pairListView, Priority.ALWAYS);

        pairListView.setCellFactory(lv -> new ListCell<>() {
            private final HBox row = new HBox(8);
            private final ImageView thumbView = new ImageView();
            private final VBox textCol = new VBox(2);
            private final Label nameLbl = new Label();
            private final Label typeLbl = new Label();
            private final Region spacer = new Region();
            private final Label badge = new Label();

            {
                row.setAlignment(Pos.CENTER_LEFT);
                row.setPadding(new Insets(4, 6, 4, 6));

                thumbView.setFitWidth(32);
                thumbView.setFitHeight(32);
                thumbView.setPreserveRatio(true);
                thumbView.setSmooth(true);

                nameLbl.setStyle("-fx-font-size: 13px; -fx-font-weight: 600; ");
                typeLbl.setStyle("-fx-font-size: 12px;"); typeLbl.getStyleClass().add("text-secondary");

                textCol.getChildren().addAll(nameLbl, typeLbl);
                HBox.setHgrow(spacer, Priority.ALWAYS);

                badge.setStyle("-fx-font-size: 10px; -fx-font-weight: 700; -fx-padding: 2 6 2 6; -fx-background-radius: 4;");
                row.getChildren().addAll(thumbView, textCol, spacer, badge);
            }

            @Override
            protected void updateItem(PhotoPair pair, boolean empty) {
                super.updateItem(pair, empty);
                if (empty || pair == null) {
                    setText(null);
                    setGraphic(null);
                } else {
                    nameLbl.setText(pair.getBaseName());

                    // Determine type and thumb
                    File thumbSource = pair.getDestFile() != null ? pair.getDestFile() : pair.getSourceFile();
                    loadThumb(thumbSource, thumbView);

                    if (pair.isPaired()) {
                        String destExt = pair.getDestFile() != null ? getExt(pair.getDestFile()).toUpperCase() : "EXPORT";
                        String srcExt = pair.getSourceFile() != null ? getExt(pair.getSourceFile()).toUpperCase() : "RAW";
                        typeLbl.setText(srcExt + " + " + destExt);

                        long diffs = pair.getDifferencesCount();
                        if (diffs > 0) {
                            badge.setText(diffs + " diffs");
                            badge.setStyle("-fx-font-size: 10px; -fx-font-weight: 700; -fx-padding: 2 6 2 6; -fx-background-radius: 4; -fx-text-fill: #F59E0B; -fx-background-color: rgba(245, 158, 11, 0.12);");
                        } else {
                            badge.setText("Matched");
                            badge.setStyle("-fx-font-size: 10px; -fx-font-weight: 700; -fx-padding: 2 6 2 6; -fx-background-radius: 4; -fx-text-fill: #10B981; -fx-background-color: rgba(16, 185, 129, 0.12);");
                        }
                    } else if (pair.getSourceFile() != null) {
                        typeLbl.setText(getExt(pair.getSourceFile()).toUpperCase() + " Only");
                        badge.setText("RAW Only");
                        badge.setStyle("-fx-font-size: 10px; -fx-font-weight: 700; -fx-padding: 2 6 2 6; -fx-background-radius: 4; -fx-text-fill: #3B82F6; -fx-background-color: rgba(59, 130, 246, 0.12);");
                    } else {
                        typeLbl.setText("JPEG/XMP Only");
                        badge.setText("Export Only");
                        badge.setStyle("-fx-font-size: 10px; -fx-font-weight: 700; -fx-padding: 2 6 2 6; -fx-background-radius: 4;  -fx-background-color: rgba(152, 155, 168, 0.12);");
                    }

                    setGraphic(row);
                    setText(null);
                }
            }
        });

        pairListView.getSelectionModel().selectedItemProperty().addListener((obs, oldVal, newVal) -> {
            if (newVal != null && onPairSelected != null) {
                onPairSelected.accept(newVal);
            }
        });

        listContainer.getChildren().addAll(searchField, pairListView);
        getChildren().add(listContainer);
    }

    private void chooseFolder(TextField target, boolean isRaw) {
        DirectoryChooser chooser = new DirectoryChooser();
        chooser.setTitle(isRaw ? "Select RAW Folder" : "Select Export Folder");
        File dir = chooser.showDialog(stage);
        if (dir != null) {
            target.setText(dir.getAbsolutePath());
            if (isRaw && exportFolderField.getText().isBlank()) {
                exportFolderField.setText(dir.getAbsolutePath());
            }
        }
    }

    public void scanPairs() {
        String rawPath = rawFolderField.getText().trim();
        String expPath = exportFolderField.getText().trim();

        if (rawPath.isEmpty()) {
            return;
        }

        File rawFolder = new File(rawPath);
        File expFolder = expPath.isEmpty() ? rawFolder : new File(expPath);

        List<PhotoPair> pairs = pairingService.pairFolders(rawFolder, expFolder);
        masterPairs.setAll(pairs);
        pairCountLabel.setText(pairs.size() + " pairs");

        if (!pairs.isEmpty()) {
            pairListView.getSelectionModel().select(0);
        }

        Alert alert = new Alert(Alert.AlertType.INFORMATION);
        alert.initOwner(stage);
        alert.setTitle("Pair Scan Complete");
        alert.setHeaderText("Scan Finished");
        alert.setContentText(String.format("Found %d photo pairs between RAW and Export directories.", pairs.size()));
        alert.show();
    }

    private void loadThumb(File f, ImageView iv) {
        if (f == null) {
            iv.setImage(null);
            return;
        }
        String name = f.getName().toLowerCase();
        if (name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".png") || name.endsWith(".bmp")) {
            try {
                Image img = new Image(f.toURI().toString(), 32, 32, true, true, true);
                iv.setImage(img);
                return;
            } catch (Exception ignored) {}
        }
        iv.setImage(null);
    }

    private String getExt(File f) {
        String name = f.getName();
        int idx = name.lastIndexOf('.');
        return idx > 0 ? name.substring(idx + 1) : "";
    }

    public void setOnPairSelected(Consumer<PhotoPair> onPairSelected) {
        this.onPairSelected = onPairSelected;
    }

    public List<PhotoPair> getAllPairs() {
        return masterPairs;
    }
}
