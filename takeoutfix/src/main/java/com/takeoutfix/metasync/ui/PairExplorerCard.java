package com.takeoutfix.metasync.ui;

import com.takeoutfix.metasync.core.FilePairingService;
import com.takeoutfix.metasync.model.PhotoPair;
import com.takeoutfix.ui.fx.UiIcons;
import javafx.geometry.Pos;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.stage.DirectoryChooser;
import javafx.stage.Stage;

import java.io.File;
import java.util.List;
import java.util.function.Consumer;

/**
 * Folder selection and matched photo pairs explorer card for MetaSync.
 */
public class PairExplorerCard extends VBox {

    private final Stage stage;
    private final FilePairingService pairingService;
    private Consumer<PhotoPair> onPairSelected;

    private final TextField rawFolderField = new TextField();
    private final TextField exportFolderField = new TextField();
    private final ListView<PhotoPair> pairListView = new ListView<>();
    private final Label pairCountLabel = new Label("0 pairs found");

    public PairExplorerCard(Stage stage, FilePairingService pairingService) {
        this.stage = stage;
        this.pairingService = pairingService;

        getStyleClass().add("glass-card");
        setSpacing(10);
        setPrefWidth(380);
        setMinWidth(340);

        buildHeader();
        buildFolderPickers();
        buildPairList();
    }

    private void buildHeader() {
        HBox header = new HBox(8);
        header.setAlignment(Pos.CENTER_LEFT);

        Label title = new Label("Photo Libraries & Pairs");
        title.getStyleClass().add("card-title");

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        pairCountLabel.getStyleClass().add("text-secondary");
        header.getChildren().addAll(title, spacer, pairCountLabel);
        getChildren().add(header);
    }

    private void buildFolderPickers() {
        VBox pickers = new VBox(6);

        // RAW Folder
        Label rawLbl = new Label("RAW Originals Folder");
        rawLbl.getStyleClass().add("text-secondary");
        rawFolderField.setPromptText("Folder containing RAW files (.CR3, .NEF, .ARW)...");
        Button browseRawBtn = new Button("Browse");
        browseRawBtn.getStyleClass().add("btn-secondary");
        browseRawBtn.setGraphic(UiIcons.createSvgIcon(UiIcons.FOLDER, 13, "currentColor"));
        browseRawBtn.setOnAction(e -> chooseFolder(rawFolderField, true));

        HBox rawRow = new HBox(8, rawFolderField, browseRawBtn);
        HBox.setHgrow(rawFolderField, Priority.ALWAYS);

        // Export Folder
        Label expLbl = new Label("JPEG Exports Folder (or same folder)");
        expLbl.getStyleClass().add("text-secondary");
        exportFolderField.setPromptText("Folder containing exported JPEGs/XMPs...");
        Button browseExpBtn = new Button("Browse");
        browseExpBtn.getStyleClass().add("btn-secondary");
        browseExpBtn.setGraphic(UiIcons.createSvgIcon(UiIcons.OUTPUT_FOLDER, 13, "currentColor"));
        browseExpBtn.setOnAction(e -> chooseFolder(exportFolderField, false));

        HBox expRow = new HBox(8, exportFolderField, browseExpBtn);
        HBox.setHgrow(exportFolderField, Priority.ALWAYS);

        // Scan button
        Button scanBtn = new Button("Scan & Match Pairs");
        scanBtn.getStyleClass().add("btn-primary");
        scanBtn.setMaxWidth(Double.MAX_VALUE);
        scanBtn.setGraphic(UiIcons.createSvgIcon(UiIcons.SYNC, 14, "currentColor"));
        scanBtn.setOnAction(e -> scanPairs());

        pickers.getChildren().addAll(rawLbl, rawRow, expLbl, expRow, scanBtn);
        getChildren().add(pickers);
    }

    private void buildPairList() {
        Label listTitle = new Label("Matched Photo Pairs");
        listTitle.getStyleClass().add("card-title");

        pairListView.getStyleClass().add("inner-container");
        VBox.setVgrow(pairListView, Priority.ALWAYS);

        pairListView.setCellFactory(lv -> new ListCell<>() {
            @Override
            protected void updateItem(PhotoPair pair, boolean empty) {
                super.updateItem(pair, empty);
                if (empty || pair == null) {
                    setText(null);
                    setGraphic(null);
                } else {
                    HBox box = new HBox(8);
                    box.setAlignment(Pos.CENTER_LEFT);

                    Label nameLbl = new Label(pair.getBaseName());
                    nameLbl.setStyle("-fx-font-weight: 600; -fx-font-size: 13px;");

                    Region spacer = new Region();
                    HBox.setHgrow(spacer, Priority.ALWAYS);

                    Label badge = new Label();
                    badge.getStyleClass().add("badge");
                    if (pair.isPaired()) {
                        badge.setText("PAIRED");
                        badge.getStyleClass().add("badge-match");
                    } else if (pair.getSourceFile() != null) {
                        badge.setText("RAW ONLY");
                        badge.getStyleClass().add("badge-diff");
                    } else {
                        badge.setText("JPEG ONLY");
                        badge.getStyleClass().add("badge-neutral");
                    }

                    box.getChildren().addAll(nameLbl, spacer, badge);
                    setGraphic(box);
                }
            }
        });

        pairListView.getSelectionModel().selectedItemProperty().addListener((obs, oldVal, newVal) -> {
            if (newVal != null && onPairSelected != null) {
                onPairSelected.accept(newVal);
            }
        });

        getChildren().addAll(listTitle, pairListView);
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
        pairListView.getItems().setAll(pairs);
        pairCountLabel.setText(pairs.size() + " pairs found");

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

    public void setOnPairSelected(Consumer<PhotoPair> onPairSelected) {
        this.onPairSelected = onPairSelected;
    }

    public List<PhotoPair> getAllPairs() {
        return pairListView.getItems();
    }
}
