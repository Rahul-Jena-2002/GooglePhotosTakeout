package com.takeoutfix.ui.fx;

import com.takeoutfix.dedup.DuplicateScanService;
import com.takeoutfix.dedup.DuplicateScanService.DuplicateCluster;
import com.takeoutfix.dedup.DuplicateScanService.ScanResult;
import com.takeoutfix.dedup.QuarantineManager;
import javafx.application.Platform;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.concurrent.Task;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.*;
import javafx.scene.image.Image;
import javafx.scene.image.ImageView;
import javafx.scene.layout.*;
import javafx.stage.DirectoryChooser;
import javafx.stage.Stage;

import java.io.File;
import java.nio.file.Path;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.function.Consumer;

/**
 * Pure JavaFX Duplicate Photos & Videos Finder with Reversible Quarantine Architecture.
 * Delegates scanning to DuplicateScanService and quarantine safety to QuarantineManager.
 */
public class DuplicateFinderFxView extends VBox {

    public enum QuarantineStatus {
        PENDING_REVIEW("Pending Review"),
        QUARANTINED("Quarantined"),
        RESTORED("Restored"),
        PURGED("Purged");

        private final String label;
        QuarantineStatus(String label) { this.label = label; }
        public String getLabel() { return label; }
    }

    public static class DuplicateGroupItem {
        private final String groupId;
        private final File originalFile;
        private final File duplicateFile;
        private final long fileSize;
        private final String matchType;
        private final double similarityPercentage;
        private QuarantineStatus status;
        private File quarantinedFileRef;

        public DuplicateGroupItem(String groupId, File originalFile, File duplicateFile, long fileSize, String matchType, double similarityPercentage) {
            this.groupId = groupId;
            this.originalFile = originalFile;
            this.duplicateFile = duplicateFile;
            this.fileSize = fileSize;
            this.matchType = matchType;
            this.similarityPercentage = similarityPercentage;
            this.status = QuarantineStatus.PENDING_REVIEW;
        }

        public DuplicateGroupItem(String groupId, File originalFile, File duplicateFile, long fileSize, String matchType) {
            this(groupId, originalFile, duplicateFile, fileSize, matchType, 100.0);
        }

        public String getGroupId() { return groupId; }
        public File getOriginalFile() { return originalFile; }
        public File getDuplicateFile() { return duplicateFile; }
        public long getFileSize() { return fileSize; }
        public String getMatchType() { return matchType; }
        public double getSimilarityPercentage() { return similarityPercentage; }
        public QuarantineStatus getStatus() { return status; }
        public void setStatus(QuarantineStatus status) { this.status = status; }
        public File getQuarantinedFileRef() { return quarantinedFileRef; }
        public void setQuarantinedFileRef(File f) { this.quarantinedFileRef = f; }
    }

    private final Stage stage;
    private final Consumer<WorkspaceType> onNavigate;
    private final DuplicateScanService scanService = new DuplicateScanService();
    private final QuarantineManager quarantineManager = new QuarantineManager();

    private final Label folderPathLabel = new Label("No folder selected for duplicate scanning");
    private final Label scannedCountLabel = new Label("0");
    private final Label duplicateCountLabel = new Label("0");
    private final Label spaceSavedLabel = new Label("0.0 MB");

    private final Button btnStartScan = new Button("Start Duplicate Scan");
    private final ProgressBar progressBar = new ProgressBar(0.0);
    private final Label progressLabel = new Label("Select a photo folder to scan");

    private final ComboBox<DuplicateScanService.MatchStrategy> matchModeCombo = new ComboBox<>();
    private final ComboBox<String> sensitivityCombo = new ComboBox<>();

    private File selectedFolder = null;
    private final ObservableList<DuplicateGroupItem> groupsList = FXCollections.observableArrayList();
    private final TableView<DuplicateGroupItem> tableView = new TableView<>(groupsList);

    // Side-by-side Review Panel components
    private final Label reviewGroupTitle = new Label("SELECT A GROUP TO REVIEW");
    private final Label similarityBadge = new Label("SIMILARITY: —");
    private final ImageView origImgView = new ImageView();
    private final Label origNameLabel = new Label("—");
    private final Label origMetaLabel = new Label("—");
    private final RadioButton rbKeepOrig = new RadioButton("Keep this file (Recommended)");

    private final ImageView dupImgView = new ImageView();
    private final Label dupNameLabel = new Label("—");
    private final Label dupMetaLabel = new Label("—");
    private final RadioButton rbQuarantineDup = new RadioButton("Quarantine this duplicate");
    private final RadioButton rbKeepBoth = new RadioButton("Leave untouched");

    private final Button btnQuarantineAction = new Button("Quarantine Selected");
    private final Button btnRestoreAction = new Button("Restore Quarantined");
    private final Button btnPurgeAction = new Button("Delete Permanently");

    private DuplicateGroupItem currentSelectedItem = null;

    public DuplicateFinderFxView(Stage stage, Consumer<WorkspaceType> onNavigate) {
        this.stage = stage;
        this.onNavigate = onNavigate;

        setSpacing(12);
        setPadding(new Insets(14, 18, 14, 18));
        VBox.setVgrow(this, Priority.ALWAYS);

        // 1. Header
        getChildren().add(buildHeaderRow());

        // 2. Folder Selector Card
        getChildren().add(buildFolderSelectorCard());

        // 3. Metric KPI Deck
        getChildren().add(buildMetricGrid());

        // 4. Main Split: Duplicate Groups Table | Side-by-side Review & Quarantine
        HBox mainSplit = new HBox(14);
        VBox.setVgrow(mainSplit, Priority.ALWAYS);

        VBox tablePane = buildTablePane();
        HBox.setHgrow(tablePane, Priority.ALWAYS);
        tablePane.setPrefWidth(480);

        VBox reviewPane = buildReviewPane();
        HBox.setHgrow(reviewPane, Priority.ALWAYS);
        reviewPane.setPrefWidth(540);

        mainSplit.getChildren().addAll(tablePane, reviewPane);
        getChildren().add(mainSplit);

        // Initialize with clean empty state (no fake data)
        progressLabel.setText("Select a photo folder to start scanning");
    }

    private HBox buildHeaderRow() {
        HBox header = new HBox(12);
        header.setAlignment(Pos.CENTER_LEFT);

        VBox titleBox = new VBox(2);
        Label title = new Label("FIND DUPLICATES");
        title.setStyle("-fx-font-size: 15px; -fx-font-weight: 800;");

        Label subtitle = new Label("Scan photo libraries for exact or filename duplicates, review side-by-side, and quarantine reversibly.");
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

    private VBox buildFolderSelectorCard() {
        VBox card = new VBox(8);
        card.getStyleClass().add("glass-card");
        card.setPadding(new Insets(10, 14, 10, 14));

        HBox row = new HBox(10);
        row.setAlignment(Pos.CENTER_LEFT);

        Button btnBrowse = new Button("Select Folder");
        btnBrowse.getStyleClass().add("btn-secondary");
        btnBrowse.setGraphic(UiIcons.createSvgIcon(UiIcons.FOLDER, 13, "currentColor"));
        btnBrowse.setOnAction(e -> chooseFolder());

        folderPathLabel.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-text-fill: #71717a;");
        HBox.setHgrow(folderPathLabel, Priority.ALWAYS);

        // Matching Strategy Selector
        matchModeCombo.getItems().setAll(DuplicateScanService.MatchStrategy.values());
        matchModeCombo.setValue(DuplicateScanService.MatchStrategy.FILENAME);
        matchModeCombo.setConverter(new javafx.util.StringConverter<>() {
            @Override
            public String toString(DuplicateScanService.MatchStrategy object) {
                if (object == null) return "";
                switch (object) {
                    case FILENAME: return "Match: Filename";
                    case EXACT_HASH: return "Match: SHA-256 Exact";
                    case PERCEPTUAL_HASH: return "Match: Visual Similarity (pHash)";
                    case FEATURE_MATCH: return "Match: Feature Matching (ORB)";
                    default: return object.getLabel();
                }
            }
            @Override
            public DuplicateScanService.MatchStrategy fromString(String string) {
                return null;
            }
        });
        matchModeCombo.setStyle("-fx-font-size: 11px; -fx-pref-height: 28px;");

        // Similarity Sensitivity Selector (visible for perceptual/feature match)
        sensitivityCombo.getItems().setAll("95% (Strict)", "90% (Recommended)", "85% (Balanced)", "80% (Loose)");
        sensitivityCombo.setValue("90% (Recommended)");
        sensitivityCombo.setStyle("-fx-font-size: 11px; -fx-pref-height: 28px;");
        sensitivityCombo.setVisible(false);
        sensitivityCombo.setManaged(false);

        matchModeCombo.valueProperty().addListener((obs, oldVal, newVal) -> {
            boolean isVisual = (newVal == DuplicateScanService.MatchStrategy.PERCEPTUAL_HASH
                    || newVal == DuplicateScanService.MatchStrategy.FEATURE_MATCH);
            sensitivityCombo.setVisible(isVisual);
            sensitivityCombo.setManaged(isVisual);
        });

        btnStartScan.getStyleClass().add("btn-primary");
        btnStartScan.setGraphic(UiIcons.createSvgIcon(UiIcons.PLAY, 12, "currentColor"));
        btnStartScan.setOnAction(e -> startScan());

        progressBar.setPrefWidth(120);
        progressBar.setVisible(false);

        progressLabel.setStyle("-fx-font-size: 10px; -fx-text-fill: #71717a;");

        row.getChildren().addAll(btnBrowse, folderPathLabel, matchModeCombo, sensitivityCombo, progressBar, progressLabel, btnStartScan);
        card.getChildren().add(row);
        return card;
    }

    private HBox buildMetricGrid() {
        HBox grid = new HBox(10);
        grid.setAlignment(Pos.CENTER);

        VBox cScanned = createMetricCard("FILES SCANNED", scannedCountLabel, "Photos & videos indexed", "#2563eb", "rgba(37, 99, 235, 0.08)");
        VBox cGroups = createMetricCard("DUPLICATE GROUPS", duplicateCountLabel, "Identical content found", "#d97706", "rgba(217, 119, 6, 0.08)");
        VBox cSaved = createMetricCard("POTENTIAL SAVINGS", spaceSavedLabel, "Reclaimable storage space", "#059669", "rgba(5, 150, 105, 0.08)");

        HBox.setHgrow(cScanned, Priority.ALWAYS);
        HBox.setHgrow(cGroups, Priority.ALWAYS);
        HBox.setHgrow(cSaved, Priority.ALWAYS);

        grid.getChildren().addAll(cScanned, cGroups, cSaved);
        return grid;
    }

    private VBox createMetricCard(String title, Label valLabel, String sub, String accentColor, String bgTint) {
        VBox card = new VBox(2);
        card.getStyleClass().add("glass-card");
        card.setStyle(String.format("-fx-background-color: %s; -fx-border-left-color: %s; -fx-border-left-width: 4px; -fx-border-radius: 6; -fx-background-radius: 6; -fx-padding: 10 14 10 14;", bgTint, accentColor));

        Label t = new Label(title);
        t.setStyle(String.format("-fx-font-size: 10px; -fx-font-weight: 800; -fx-text-fill: %s; -fx-letter-spacing: 0.5px;", accentColor));

        valLabel.setStyle(String.format("-fx-font-size: 22px; -fx-font-weight: 800; -fx-text-fill: %s;", accentColor));

        Label s = new Label(sub);
        s.setStyle("-fx-font-size: 10px; -fx-text-fill: #71717a;");

        card.getChildren().addAll(t, valLabel, s);
        return card;
    }

    private VBox buildTablePane() {
        VBox card = new VBox(8);
        card.getStyleClass().add("glass-card");
        card.setPadding(new Insets(10, 12, 10, 12));
        VBox.setVgrow(card, Priority.ALWAYS);

        Label title = new Label("DUPLICATE GROUPS");
        title.setStyle("-fx-font-size: 10px; -fx-font-weight: 800; -fx-text-fill: #71717a; -fx-letter-spacing: 0.5px;");

        TableColumn<DuplicateGroupItem, String> groupCol = new TableColumn<>("Group");
        groupCol.setCellValueFactory(d -> new javafx.beans.property.SimpleStringProperty(d.getValue().getGroupId()));
        groupCol.setPrefWidth(70);

        TableColumn<DuplicateGroupItem, String> fileCol = new TableColumn<>("Original File");
        fileCol.setCellValueFactory(d -> new javafx.beans.property.SimpleStringProperty(d.getValue().getOriginalFile() != null ? d.getValue().getOriginalFile().getName() : "—"));
        fileCol.setPrefWidth(160);

        TableColumn<DuplicateGroupItem, String> dupCol = new TableColumn<>("Duplicate File");
        dupCol.setCellValueFactory(d -> new javafx.beans.property.SimpleStringProperty(d.getValue().getDuplicateFile() != null ? d.getValue().getDuplicateFile().getName() : "—"));
        dupCol.setPrefWidth(160);

        TableColumn<DuplicateGroupItem, Double> simCol = new TableColumn<>("Similarity");
        simCol.setCellValueFactory(d -> new javafx.beans.property.SimpleObjectProperty<>(d.getValue().getSimilarityPercentage()));
        simCol.setPrefWidth(90);
        simCol.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(Double sim, boolean empty) {
                super.updateItem(sim, empty);
                if (empty || sim == null) {
                    setText(null);
                    setGraphic(null);
                } else {
                    Label badge = new Label(String.format("%.0f%%", sim));
                    badge.setStyle("-fx-font-size: 9px; -fx-font-weight: 700; -fx-padding: 2 6 2 6; -fx-background-radius: 4;");
                    if (sim >= 99.9) {
                        badge.setText("100% Exact");
                        badge.setStyle(badge.getStyle() + "; -fx-text-fill: #2563eb; -fx-background-color: rgba(37, 99, 235, 0.12);");
                    } else if (sim >= 90.0) {
                        badge.setText(String.format("%.0f%% Visual", sim));
                        badge.setStyle(badge.getStyle() + "; -fx-text-fill: #10b981; -fx-background-color: rgba(16, 185, 129, 0.12);");
                    } else {
                        badge.setText(String.format("%.0f%% Edit", sim));
                        badge.setStyle(badge.getStyle() + "; -fx-text-fill: #d97706; -fx-background-color: rgba(217, 119, 6, 0.12);");
                    }
                    setGraphic(badge);
                    setText(null);
                }
            }
        });

        TableColumn<DuplicateGroupItem, QuarantineStatus> statusCol = new TableColumn<>("Status");
        statusCol.setCellValueFactory(d -> new javafx.beans.property.SimpleObjectProperty<>(d.getValue().getStatus()));
        statusCol.setPrefWidth(100);
        statusCol.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(QuarantineStatus item, boolean empty) {
                super.updateItem(item, empty);
                if (empty || item == null) {
                    setText(null);
                    setGraphic(null);
                } else {
                    Label badge = new Label(item.getLabel());
                    badge.setStyle("-fx-font-size: 9px; -fx-font-weight: 700; -fx-padding: 2 6 2 6; -fx-background-radius: 4;");
                    switch (item) {
                        case QUARANTINED -> badge.setStyle(badge.getStyle() + "; -fx-text-fill: #d97706; -fx-background-color: rgba(217, 119, 6, 0.12);");
                        case RESTORED -> badge.setStyle(badge.getStyle() + "; -fx-text-fill: #10b981; -fx-background-color: rgba(16, 185, 129, 0.12);");
                        case PURGED -> badge.setStyle(badge.getStyle() + "; -fx-text-fill: #ef4444; -fx-background-color: rgba(239, 68, 68, 0.12);");
                        default -> badge.setStyle(badge.getStyle() + "; -fx-text-fill: #2563eb; -fx-background-color: rgba(37, 99, 235, 0.12);");
                    }
                    setGraphic(badge);
                    setText(null);
                }
            }
        });

        tableView.getColumns().clear();
        tableView.getColumns().add(groupCol);
        tableView.getColumns().add(fileCol);
        tableView.getColumns().add(dupCol);
        tableView.getColumns().add(simCol);
        tableView.getColumns().add(statusCol);
        tableView.setColumnResizePolicy(TableView.CONSTRAINED_RESIZE_POLICY);
        VBox.setVgrow(tableView, Priority.ALWAYS);

        tableView.getSelectionModel().selectedItemProperty().addListener((obs, oldVal, newVal) -> {
            if (newVal != null) {
                loadGroupIntoReview(newVal);
            }
        });

        card.getChildren().addAll(title, tableView);
        return card;
    }

    private VBox buildReviewPane() {
        VBox card = new VBox(10);
        card.getStyleClass().add("glass-card");
        card.setPadding(new Insets(12, 14, 12, 14));
        VBox.setVgrow(card, Priority.ALWAYS);

        HBox reviewTitleBar = new HBox(10);
        reviewTitleBar.setAlignment(Pos.CENTER_LEFT);
        reviewGroupTitle.setStyle("-fx-font-size: 11px; -fx-font-weight: 800; -fx-text-fill: #71717a; -fx-letter-spacing: 0.5px;");
        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);
        similarityBadge.setStyle("-fx-font-size: 10px; -fx-font-weight: 800; -fx-padding: 3 8 3 8; -fx-background-radius: 4; -fx-text-fill: #2563eb; -fx-background-color: rgba(37, 99, 235, 0.12);");
        reviewTitleBar.getChildren().addAll(reviewGroupTitle, spacer, similarityBadge);

        // Side-by-side preview container
        HBox sideSplit = new HBox(12);
        sideSplit.setAlignment(Pos.CENTER);
        VBox.setVgrow(sideSplit, Priority.ALWAYS);

        // Box 1 Original
        VBox box1 = new VBox(8);
        box1.setStyle("-fx-background-color: rgba(0,0,0,0.04); -fx-background-radius: 8; -fx-padding: 10;");
        HBox.setHgrow(box1, Priority.ALWAYS);

        Label l1 = new Label("ORIGINAL PHOTO");
        l1.setStyle("-fx-font-size: 9px; -fx-font-weight: 800; -fx-text-fill: #10b981;");

        origImgView.setFitWidth(200);
        origImgView.setFitHeight(150);
        origImgView.setPreserveRatio(true);
        origImgView.setSmooth(true);

        origNameLabel.setStyle("-fx-font-size: 11px; -fx-font-weight: 700;");
        origMetaLabel.setStyle("-fx-font-size: 10px; -fx-text-fill: #71717a;");

        rbKeepOrig.setSelected(true);
        rbKeepOrig.setDisable(true); // Always keep original recommended

        box1.getChildren().addAll(l1, origImgView, origNameLabel, origMetaLabel, rbKeepOrig);

        // Box 2 Duplicate Candidate
        VBox box2 = new VBox(8);
        box2.setStyle("-fx-background-color: rgba(0,0,0,0.04); -fx-background-radius: 8; -fx-padding: 10;");
        HBox.setHgrow(box2, Priority.ALWAYS);

        Label l2 = new Label("DUPLICATE COPY");
        l2.setStyle("-fx-font-size: 9px; -fx-font-weight: 800; -fx-text-fill: #d97706;");

        dupImgView.setFitWidth(200);
        dupImgView.setFitHeight(150);
        dupImgView.setPreserveRatio(true);
        dupImgView.setSmooth(true);

        dupNameLabel.setStyle("-fx-font-size: 11px; -fx-font-weight: 700;");
        dupMetaLabel.setStyle("-fx-font-size: 10px; -fx-text-fill: #71717a;");

        ToggleGroup tg = new ToggleGroup();
        rbQuarantineDup.setToggleGroup(tg);
        rbKeepBoth.setToggleGroup(tg);
        rbQuarantineDup.setSelected(true);

        box2.getChildren().addAll(l2, dupImgView, dupNameLabel, dupMetaLabel, rbQuarantineDup, rbKeepBoth);

        sideSplit.getChildren().addAll(box1, box2);

        // Actions Bar
        HBox actBar = new HBox(8);
        actBar.setAlignment(Pos.CENTER_RIGHT);

        btnQuarantineAction.getStyleClass().add("btn-primary");
        btnQuarantineAction.setStyle("-fx-font-size: 11px; -fx-padding: 5 12 5 12;");
        btnQuarantineAction.setOnAction(e -> executeQuarantine());

        btnRestoreAction.getStyleClass().add("btn-secondary");
        btnRestoreAction.setStyle("-fx-font-size: 11px; -fx-padding: 5 12 5 12;");
        btnRestoreAction.setDisable(true);
        btnRestoreAction.setOnAction(e -> executeRestore());

        btnPurgeAction.getStyleClass().add("btn-danger");
        btnPurgeAction.setStyle("-fx-font-size: 11px; -fx-padding: 5 12 5 12;");
        btnPurgeAction.setDisable(true);
        btnPurgeAction.setOnAction(e -> executePurge());

        actBar.getChildren().addAll(btnRestoreAction, btnPurgeAction, btnQuarantineAction);

        card.getChildren().addAll(reviewTitleBar, sideSplit, new Separator(), actBar);
        return card;
    }

    private void chooseFolder() {
        DirectoryChooser dc = new DirectoryChooser();
        dc.setTitle("Select Photo Folder for Duplicate Scanning");
        File dir = dc.showDialog(stage);
        if (dir != null) {
            this.selectedFolder = dir;
            folderPathLabel.setText(dir.getName() + " (" + dir.getAbsolutePath() + ")");
        }
    }

    private void startScan() {
        if (selectedFolder == null) {
            Alert alert = new Alert(Alert.AlertType.WARNING, "Please select a photo directory first.", ButtonType.OK);
            alert.show();
            return;
        }

        btnStartScan.setDisable(true);
        progressBar.setVisible(true);
        progressBar.setProgress(ProgressIndicator.INDETERMINATE_PROGRESS);
        progressLabel.setText("Scanning directory and calculating hashes...");
        groupsList.clear();

        DuplicateScanService.MatchStrategy strategy = matchModeCombo.getValue() != null
                ? matchModeCombo.getValue()
                : DuplicateScanService.MatchStrategy.FILENAME;

        double threshold = 90.0;
        if (sensitivityCombo.getValue() != null) {
            String val = sensitivityCombo.getValue();
            if (val.contains("95%")) threshold = 95.0;
            else if (val.contains("90%")) threshold = 90.0;
            else if (val.contains("85%")) threshold = 85.0;
            else if (val.contains("80%")) threshold = 80.0;
        }
        final double scanThreshold = threshold;

        Task<ScanResult> task = new Task<>() {
            @Override
            protected ScanResult call() throws Exception {
                return scanService.scanDirectory(selectedFolder.toPath(), strategy, scanThreshold);
            }
        };

        task.setOnSucceeded(e -> {
            ScanResult res = task.getValue();
            scannedCountLabel.setText(String.valueOf(res.getTotalFilesScanned()));

            List<DuplicateGroupItem> items = new ArrayList<>();
            for (DuplicateCluster cluster : res.getClusters()) {
                for (File dup : cluster.getDuplicateCopies()) {
                    items.add(new DuplicateGroupItem(cluster.getGroupId(), cluster.getPrimaryFile(), dup, cluster.getFileSize(), cluster.getMatchType(), cluster.getSimilarityPercentage()));
                }
            }

            groupsList.addAll(items);
            duplicateCountLabel.setText(String.valueOf(items.size()));

            double mb = res.getTotalReclaimableBytes() / (1024.0 * 1024.0);
            spaceSavedLabel.setText(String.format("%.1f MB", mb));

            btnStartScan.setDisable(false);
            progressBar.setVisible(false);
            progressLabel.setText(String.format("Scan finished: %d duplicates found", items.size()));

            if (!items.isEmpty()) {
                tableView.getSelectionModel().select(0);
            }

            Alert alert = new Alert(Alert.AlertType.INFORMATION);
            alert.initOwner(stage);
            alert.setTitle("Duplicate Scan Finished");
            alert.setHeaderText("Scan Complete");
            alert.setContentText(String.format(
                    "Duplicate scan completed successfully!\n\n"
                    + "• Strategy: %s\n"
                    + "• Directory: %s\n"
                    + "• Total Files Scanned: %d\n"
                    + "• Duplicate Copies: %d\n"
                    + "• Duplicate Groups: %d\n"
                    + "• Potential Storage Reclaim: %.1f MB",
                    strategy.getLabel(),
                    selectedFolder != null ? selectedFolder.getName() : "",
                    res.getTotalFilesScanned(),
                    items.size(),
                    res.getClusters().size(),
                    mb
            ));
            alert.show();
        });

        task.setOnFailed(e -> {
            btnStartScan.setDisable(false);
            progressBar.setVisible(false);
            progressLabel.setText("Scan failed: " + task.getException().getMessage());
        });

        Thread t = new Thread(task, "duplicate-finder-engine");
        t.setDaemon(true);
        t.start();
    }

    private void loadGroupIntoReview(DuplicateGroupItem item) {
        this.currentSelectedItem = item;
        reviewGroupTitle.setText(String.format("GROUP %s REVIEW — MATCH TYPE: %s", item.getGroupId(), item.getMatchType()));

        double sim = item.getSimilarityPercentage();
        if (sim >= 99.9) {
            similarityBadge.setText("100% EXACT MATCH");
            similarityBadge.setStyle("-fx-font-size: 10px; -fx-font-weight: 800; -fx-padding: 3 8 3 8; -fx-background-radius: 4; -fx-text-fill: #2563eb; -fx-background-color: rgba(37, 99, 235, 0.12);");
        } else if (sim >= 90.0) {
            similarityBadge.setText(String.format("%.0f%% VISUAL MATCH", sim));
            similarityBadge.setStyle("-fx-font-size: 10px; -fx-font-weight: 800; -fx-padding: 3 8 3 8; -fx-background-radius: 4; -fx-text-fill: #10b981; -fx-background-color: rgba(16, 185, 129, 0.12);");
        } else {
            similarityBadge.setText(String.format("%.0f%% EDIT / CROP", sim));
            similarityBadge.setStyle("-fx-font-size: 10px; -fx-font-weight: 800; -fx-padding: 3 8 3 8; -fx-background-radius: 4; -fx-text-fill: #d97706; -fx-background-color: rgba(217, 119, 6, 0.12);");
        }

        // Load Original
        File fOrig = item.getOriginalFile();
        if (fOrig != null && fOrig.exists()) {
            origNameLabel.setText(fOrig.getName());
            origMetaLabel.setText(String.format("%.2f MB · Modified: %s",
                    fOrig.length() / (1024.0 * 1024.0),
                    formatDate(fOrig.lastModified())));
            loadThumb(fOrig, origImgView);
        } else {
            origNameLabel.setText("—");
            origMetaLabel.setText("File unavailable");
            origImgView.setImage(null);
        }

        // Load Duplicate
        File fDup = (item.getStatus() == QuarantineStatus.QUARANTINED && item.getQuarantinedFileRef() != null)
                ? item.getQuarantinedFileRef()
                : item.getDuplicateFile();

        if (fDup != null && fDup.exists()) {
            dupNameLabel.setText(fDup.getName());
            dupMetaLabel.setText(String.format("%.2f MB · Modified: %s",
                    fDup.length() / (1024.0 * 1024.0),
                    formatDate(fDup.lastModified())));
            loadThumb(fDup, dupImgView);
        } else {
            dupNameLabel.setText("—");
            dupMetaLabel.setText("File unavailable");
            dupImgView.setImage(null);
        }

        // Update button states depending on item status
        if (item.getStatus() == QuarantineStatus.QUARANTINED) {
            btnQuarantineAction.setDisable(true);
            btnRestoreAction.setDisable(false);
            btnPurgeAction.setDisable(false);
        } else if (item.getStatus() == QuarantineStatus.RESTORED || item.getStatus() == QuarantineStatus.PURGED) {
            btnQuarantineAction.setDisable(true);
            btnRestoreAction.setDisable(true);
            btnPurgeAction.setDisable(true);
        } else {
            btnQuarantineAction.setDisable(false);
            btnRestoreAction.setDisable(true);
            btnPurgeAction.setDisable(true);
        }
    }

    private void executeQuarantine() {
        if (currentSelectedItem == null) return;
        File dup = currentSelectedItem.getDuplicateFile();

        try {
            Path target = quarantineManager.quarantineFile(
                    dup,
                    selectedFolder != null ? selectedFolder.toPath() : null,
                    currentSelectedItem.getGroupId()
            );
            currentSelectedItem.setQuarantinedFileRef(target.toFile());
            currentSelectedItem.setStatus(QuarantineStatus.QUARANTINED);
            tableView.refresh();
            loadGroupIntoReview(currentSelectedItem);

            Alert alert = new Alert(Alert.AlertType.INFORMATION,
                    String.format("File safely moved to Quarantine preserving relative folder hierarchy:\n%s\n\nOriginal location can be restored at any time.", target),
                    ButtonType.OK);
            alert.show();
        } catch (Exception ex) {
            Alert alert = new Alert(Alert.AlertType.ERROR, "Failed to quarantine file: " + ex.getMessage(), ButtonType.OK);
            alert.show();
        }
    }

    private void executeRestore() {
        if (currentSelectedItem == null || currentSelectedItem.getQuarantinedFileRef() == null) return;
        File qFile = currentSelectedItem.getQuarantinedFileRef();
        File origDest = currentSelectedItem.getDuplicateFile();

        try {
            quarantineManager.restoreFile(qFile.toPath(), origDest.toPath());
            currentSelectedItem.setStatus(QuarantineStatus.RESTORED);
            tableView.refresh();
            loadGroupIntoReview(currentSelectedItem);

            Alert alert = new Alert(Alert.AlertType.INFORMATION, "File successfully restored to original path:\n" + origDest.getAbsolutePath(), ButtonType.OK);
            alert.show();
        } catch (Exception ex) {
            Alert alert = new Alert(Alert.AlertType.ERROR, "Failed to restore file: " + ex.getMessage(), ButtonType.OK);
            alert.show();
        }
    }

    private void executePurge() {
        if (currentSelectedItem == null || currentSelectedItem.getQuarantinedFileRef() == null) return;
        File qFile = currentSelectedItem.getQuarantinedFileRef();

        Alert confirm = new Alert(Alert.AlertType.CONFIRMATION);
        confirm.setTitle("Permanent Deletion Confirmation");
        confirm.setHeaderText("Permanently delete quarantined file?");
        confirm.setContentText("This action CANNOT be undone by TakeoutFix.\nFile: " + qFile.getAbsolutePath());

        Optional<ButtonType> opt = confirm.showAndWait();
        if (opt.isPresent() && opt.get() == ButtonType.OK) {
            try {
                quarantineManager.purgeFile(qFile.toPath());
                currentSelectedItem.setStatus(QuarantineStatus.PURGED);
                tableView.refresh();
                loadGroupIntoReview(currentSelectedItem);

                Alert alert = new Alert(Alert.AlertType.INFORMATION, "File permanently deleted from quarantine.", ButtonType.OK);
                alert.show();
            } catch (Exception ex) {
                Alert alert = new Alert(Alert.AlertType.ERROR, "Failed to purge file: " + ex.getMessage(), ButtonType.OK);
                alert.show();
            }
        }
    }

    private void loadThumb(File f, ImageView iv) {
        String name = f.getName().toLowerCase();
        if (name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".png") || name.endsWith(".bmp") || name.endsWith(".gif")) {
            try {
                Image img = new Image(f.toURI().toString(), 200, 150, true, true, true);
                iv.setImage(img);
                return;
            } catch (Exception ignored) {}
        }
        iv.setImage(null);
    }

    private String formatDate(long millis) {
        return DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")
                .withZone(ZoneId.systemDefault())
                .format(Instant.ofEpochMilli(millis));
    }
}
