package com.takeoutfix.ui.fx;

import javafx.geometry.Orientation;
import javafx.scene.control.SplitPane;

import com.takeoutfix.dedup.DuplicateScanService;
import com.takeoutfix.dedup.DuplicateScanService.DuplicateCluster;
import com.takeoutfix.dedup.DuplicateScanService.ScanResult;
import com.takeoutfix.dedup.QuarantineManager;
import javafx.application.Platform;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.collections.transformation.FilteredList;
import javafx.collections.transformation.SortedList;
import javafx.concurrent.Task;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Node;
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
 * Provides interactive side-by-side inspection, search, filter pills, zoomable previews,
 * and safe quarantine/restore workflows.
 */
public class DuplicateFinderFxView extends VBox {

    public enum QuarantineStatus {
        PENDING_REVIEW("Needs Review"),
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

    private final Label folderPathLabel = new Label("No folder selected");
    private final Label folderDetailsLabel = new Label("0 files · 0 MB");
    private final Label scannedCountLabel = new Label("0");
    private final Label duplicateCountLabel = new Label("0");
    private final Label spaceSavedLabel = new Label("0 MB");

    private final Button btnStartScan = new Button("Start Scan");
    private final Button btnPause = new Button("Pause");
    private final Button btnCancel = new Button("Cancel");
    private com.takeoutfix.shared.task.CancellationToken activeCancellationToken;
    private Task<ScanResult> activeScanTask;
    private final ProgressBar progressBar = new ProgressBar(0.0);
    private final Label progressLabel = new Label("Select photo folder to begin");

    private final ComboBox<DuplicateScanService.MatchStrategy> matchModeCombo = new ComboBox<>();
    private final ComboBox<String> sensitivityCombo = new ComboBox<>();

    private File selectedFolder = null;
    private final ObservableList<DuplicateGroupItem> masterList = FXCollections.observableArrayList();
    private final FilteredList<DuplicateGroupItem> filteredList = new FilteredList<>(masterList, p -> true);
    private final TableView<DuplicateGroupItem> tableView = new TableView<>();

    // Filter bar components
    private final TextField searchField = new TextField();
    private String activeFilter = "ALL";
    private final Label countBadge = new Label("0 groups");

    // Side-by-side Review Panel components
    private final StackPane reviewContainer = new StackPane();
    private final VBox reviewEmptyState = new VBox(12);
    private final VBox reviewContent = new VBox(10);

    private final Label reviewGroupTitle = new Label("GROUP REVIEW");
    private final Label similarityBadge = new Label("—");
    private final Slider zoomSlider = new Slider(1.0, 3.0, 1.0);
    private final Label zoomValueLabel = new Label("100%");

    private final ImageView origImgView = new ImageView();
    private final Label origNameLabel = new Label("—");
    private final Label origMetaLabel = new Label("—");
    private final Label origResLabel = new Label("—");
    private final RadioButton rbKeepOrig = new RadioButton("Keep this photo");

    private final ImageView dupImgView = new ImageView();
    private final Label dupNameLabel = new Label("—");
    private final Label dupMetaLabel = new Label("—");
    private final Label dupResLabel = new Label("—");
    private final RadioButton rbQuarantineDup = new RadioButton("Quarantine duplicate");
    private final RadioButton rbKeepBoth = new RadioButton("Keep both files");

    private final Label selectionSummaryLabel = new Label("1 duplicate selected · 0 MB");
    private final Button btnQuarantineAction = new Button("Quarantine");
    private final Button btnRestoreAction = new Button("Restore Quarantined");
    private final Button btnPurgeAction = new Button("Delete Permanently");

    private DuplicateGroupItem currentSelectedItem = null;

    public DuplicateFinderFxView(Stage stage, Consumer<WorkspaceType> onNavigate) {
        this.stage = stage;
        this.onNavigate = onNavigate;

        getStyleClass().add("workspace-view");
        setSpacing(16);
        setPadding(new Insets(24));
        VBox.setVgrow(this, Priority.ALWAYS);

        // 1. Header
        getChildren().add(buildHeaderRow());

        // 2. Scan Controls & Folder Selector
        getChildren().add(buildScanControlsCard());

        // 3. Metric KPI Deck (Neutral surfaces, bold numbers)
        getChildren().add(buildMetricGrid());

        // 4. Resizable Main Split: Duplicate Results Table | Side-by-side Visual Comparison
        SplitPane mainSplit = new SplitPane();
        mainSplit.setOrientation(Orientation.HORIZONTAL);
        VBox.setVgrow(mainSplit, Priority.ALWAYS);

        VBox tablePane = buildTablePane();
        tablePane.setPrefWidth(540);
        tablePane.setMinWidth(360);

        VBox reviewPane = buildReviewPane();
        reviewPane.setPrefWidth(600);
        reviewPane.setMinWidth(380);

        mainSplit.getItems().addAll(tablePane, reviewPane);
        mainSplit.setDividerPositions(0.48);
        getChildren().add(mainSplit);

        setupTableData();
    }

    private HBox buildHeaderRow() {
        HBox header = new HBox(12);
        header.setAlignment(Pos.CENTER_LEFT);

        StackPane iconTile = new StackPane(UiIcons.createSvgIcon(UiIcons.COPY, 16, "currentColor"));
        iconTile.getStyleClass().add("header-icon-tile");

        VBox titleBox = new VBox(2);
        HBox titleRow = new HBox(10);
        titleRow.setAlignment(Pos.CENTER_LEFT);

        Label title = new Label("Find Duplicates");
        title.getStyleClass().addAll("page-title", "header-title");

        Label badge = new Label("Local processing");
        badge.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-text-fill: #10B981; -fx-background-color: rgba(16, 185, 129, 0.12); -fx-padding: 3 8 3 8; -fx-background-radius: 6;");

        titleRow.getChildren().addAll(title, badge);

        Label subtitle = new Label("Find, review and safely quarantine duplicate photos.");
        subtitle.getStyleClass().addAll("page-description", "header-subtitle");
        titleBox.getChildren().addAll(titleRow, subtitle);

        header.getChildren().addAll(iconTile, titleBox);
        return header;
    }

    private VBox buildScanControlsCard() {
        VBox card = new VBox(10);
        card.getStyleClass().add("glass-card");
        card.setStyle("-fx-border-radius: 8; -fx-background-radius: 8; -fx-padding: 12 16 12 16;");

        HBox row = new HBox(12);
        row.setAlignment(Pos.CENTER_LEFT);

        // Folder selection block
        VBox folderBlock = new VBox(2);
        Label folderTitle = new Label("Folder");
        folderTitle.setStyle("-fx-font-size: 12.5px; -fx-font-weight: 700;"); folderTitle.getStyleClass().add("section-sub-title");

        HBox folderPickerRow = new HBox(8);
        folderPickerRow.setAlignment(Pos.CENTER_LEFT);

        Button btnBrowse = new Button("Select Folder");
        btnBrowse.getStyleClass().add("btn-secondary");
        btnBrowse.setGraphic(UiIcons.createSvgIcon(UiIcons.FOLDER, 14, "currentColor"));
        btnBrowse.setOnAction(e -> chooseFolder());

        VBox pathBox = new VBox(1);
        folderPathLabel.setStyle("-fx-font-size: 13px; -fx-font-weight: 600;"); folderPathLabel.getStyleClass().add("text-primary");
        folderDetailsLabel.setStyle("-fx-font-size: 12px;"); folderDetailsLabel.getStyleClass().add("text-secondary");
        pathBox.getChildren().addAll(folderPathLabel, folderDetailsLabel);

        folderPickerRow.getChildren().addAll(btnBrowse, pathBox);
        folderBlock.getChildren().addAll(folderTitle, folderPickerRow);
        HBox.setHgrow(folderBlock, Priority.ALWAYS);

        // Match method selector
        VBox methodBlock = new VBox(2);
        Label methodTitle = new Label("Match method");
        methodTitle.setStyle("-fx-font-size: 12.5px; -fx-font-weight: 700;"); methodTitle.getStyleClass().add("section-sub-title");

        matchModeCombo.getItems().setAll(DuplicateScanService.MatchStrategy.values());
        matchModeCombo.setValue(DuplicateScanService.MatchStrategy.EXACT_HASH);
        matchModeCombo.setConverter(new javafx.util.StringConverter<>() {
            @Override
            public String toString(DuplicateScanService.MatchStrategy object) {
                if (object == null) return "";
                switch (object) {
                    case EXACT_HASH: return "Exact content (SHA-256)";
                    case PERCEPTUAL_HASH: return "Visual similarity (pHash)";
                    case FEATURE_MATCH: return "Feature match (ORB)";
                    case FILENAME: return "Filename & Size";
                    default: return object.getLabel();
                }
            }
            @Override
            public DuplicateScanService.MatchStrategy fromString(String string) {
                return null;
            }
        });
        matchModeCombo.setStyle("-fx-font-size: 13px; -fx-pref-height: 32px;");
        methodBlock.getChildren().addAll(methodTitle, matchModeCombo);

        // Sensitivity selector
        VBox sensBlock = new VBox(2);
        Label sensTitle = new Label("Sensitivity");
        sensTitle.setStyle("-fx-font-size: 12.5px; -fx-font-weight: 700;"); sensTitle.getStyleClass().add("section-sub-title");
        sensitivityCombo.getItems().setAll("95% (Strict)", "90% (Recommended)", "85% (Balanced)", "80% (Loose)");
        sensitivityCombo.setValue("90% (Recommended)");
        sensitivityCombo.setStyle("-fx-font-size: 13px; -fx-pref-height: 32px;");
        sensBlock.getChildren().addAll(sensTitle, sensitivityCombo);
        sensBlock.setVisible(false);
        sensBlock.setManaged(false);

        matchModeCombo.valueProperty().addListener((obs, oldVal, newVal) -> {
            boolean isVisual = (newVal == DuplicateScanService.MatchStrategy.PERCEPTUAL_HASH
                    || newVal == DuplicateScanService.MatchStrategy.FEATURE_MATCH);
            sensBlock.setVisible(isVisual);
            sensBlock.setManaged(isVisual);
        });

        // Scan button & progress
        HBox actionBtnRow = new HBox(8);
        actionBtnRow.setAlignment(Pos.CENTER_RIGHT);

        btnStartScan.getStyleClass().add("btn-primary");
        btnStartScan.setGraphic(UiIcons.createSvgIcon(UiIcons.PLAY, 13, "currentColor"));
        btnStartScan.setStyle("-fx-font-size: 13px; -fx-padding: 7 16 7 16;");
        btnStartScan.setOnAction(e -> startScan());

        btnPause.getStyleClass().add("btn-secondary");
        btnPause.setGraphic(UiIcons.createSvgIcon(UiIcons.PAUSE, 12, "currentColor"));
        btnPause.setGraphicTextGap(6);
        btnPause.setStyle("-fx-font-size: 13px; -fx-padding: 7 14 7 14;");
        btnPause.setDisable(true);
        btnPause.setOnAction(e -> handlePause());

        btnCancel.getStyleClass().add("btn-secondary");
        btnCancel.setGraphic(UiIcons.createSvgIcon(UiIcons.STOP, 11, "currentColor"));
        btnCancel.setGraphicTextGap(6);
        btnCancel.setStyle("-fx-font-size: 13px; -fx-padding: 7 14 7 14;");
        btnCancel.setDisable(true);
        btnCancel.setOnAction(e -> handleCancel());

        actionBtnRow.getChildren().addAll(btnStartScan, btnPause, btnCancel);

        VBox actionBlock = new VBox(4);
        actionBlock.setAlignment(Pos.CENTER_RIGHT);

        progressBar.setPrefWidth(140);
        progressBar.setVisible(false);
        progressLabel.setStyle("-fx-font-size: 12px;"); progressLabel.getStyleClass().add("text-secondary");

        actionBlock.getChildren().addAll(actionBtnRow, progressLabel);

        row.getChildren().addAll(folderBlock, methodBlock, sensBlock, actionBlock);
        card.getChildren().addAll(row, progressBar);
        return card;
    }

    private HBox buildMetricGrid() {
        HBox grid = new HBox(12);
        grid.setAlignment(Pos.CENTER);

        VBox cScanned = createMetricCard("FILES SCANNED", scannedCountLabel, "Total indexed files", null);
        VBox cGroups = createMetricCard("DUPLICATE GROUPS", duplicateCountLabel, "Groups identified", "#F59E0B");
        VBox cSaved = createMetricCard("POTENTIAL SAVINGS", spaceSavedLabel, "Estimated reclaimable disk space", "#10B981");

        Tooltip savedTip = new Tooltip("Calculated by summing the size of all duplicate copies, excluding the primary keeper file in each group.");
        Tooltip.install(cSaved, savedTip);

        HBox.setHgrow(cScanned, Priority.ALWAYS);
        HBox.setHgrow(cGroups, Priority.ALWAYS);
        HBox.setHgrow(cSaved, Priority.ALWAYS);

        grid.getChildren().addAll(cScanned, cGroups, cSaved);
        return grid;
    }

    private VBox createMetricCard(String title, Label valLabel, String sub, String semanticColor) {
        VBox card = new VBox(2);
        card.getStyleClass().add("glass-card");
        card.setPadding(new Insets(10, 14, 10, 14));
        card.setMinHeight(88);
        card.setPrefHeight(88);
        card.setMaxHeight(88);

        Label t = new Label(title);
        t.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-letter-spacing: 0.5px;");
        t.getStyleClass().add("text-secondary");

        valLabel.setStyle("-fx-font-size: 24px; -fx-font-weight: 700;");
        valLabel.getStyleClass().add("text-primary");

        if (semanticColor != null && !semanticColor.isBlank()) {
            valLabel.textProperty().addListener((obs, oldVal, newVal) -> {
                try {
                    String digits = newVal.replaceAll("[^0-9]", "");
                    int v = digits.isEmpty() ? 0 : Integer.parseInt(digits);
                    if (v > 0) {
                        valLabel.setStyle(String.format("-fx-font-size: 24px; -fx-font-weight: 700; -fx-text-fill: %s;", semanticColor));
                    } else {
                        valLabel.setStyle("-fx-font-size: 24px; -fx-font-weight: 700;");
                    }
                } catch (Exception ignored) {
                    valLabel.setStyle("-fx-font-size: 24px; -fx-font-weight: 700;");
                }
            });
        }

        Label s = new Label(sub);
        s.setStyle("-fx-font-size: 12px; -fx-font-weight: 500;");
        s.getStyleClass().add("text-secondary");

        card.getChildren().addAll(t, valLabel, s);
        return card;
    }

    private VBox buildTablePane() {
        VBox card = new VBox(10);
        card.getStyleClass().add("glass-card");
        card.setStyle("-fx-border-radius: 8; -fx-background-radius: 8; -fx-padding: 14;");
        VBox.setVgrow(card, Priority.ALWAYS);

        // Header with count badge
        HBox titleRow = new HBox(8);
        titleRow.setAlignment(Pos.CENTER_LEFT);
        Label title = new Label("Duplicate groups");
        title.setStyle("-fx-font-size: 15px; -fx-font-weight: 700;"); title.getStyleClass().add("card-title");

        countBadge.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-padding: 2 8 2 8; -fx-background-radius: 10;"); countBadge.getStyleClass().add("badge-counter");

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        searchField.setPromptText("Search files or paths...");
        searchField.setStyle("-fx-font-size: 12px; -fx-pref-width: 170px;");

        titleRow.getChildren().addAll(title, countBadge, spacer, searchField);

        // Filter Pills: All, Exact matches, Similar photos, Reviewed, Unreviewed
        HBox filterBar = new HBox(6);
        filterBar.setAlignment(Pos.CENTER_LEFT);
        ToggleGroup filterGroup = new ToggleGroup();

        filterBar.getChildren().addAll(
                createFilterPill("All", "ALL", filterGroup, true),
                createFilterPill("Exact matches", "EXACT", filterGroup, false),
                createFilterPill("Similar photos", "SIMILAR", filterGroup, false),
                createFilterPill("Reviewed", "REVIEWED", filterGroup, false),
                createFilterPill("Unreviewed", "UNREVIEWED", filterGroup, false)
        );

        // Table definition
        setupTableColumns();

        card.getChildren().addAll(titleRow, filterBar, tableView);
        return card;
    }

    private ToggleButton createFilterPill(String text, String tag, ToggleGroup group, boolean selected) {
        ToggleButton btn = new ToggleButton(text);
        btn.setToggleGroup(group);
        btn.setSelected(selected);
        btn.setUserData(tag);
        btn.setStyle("-fx-font-size: 12px; -fx-padding: 3 10 3 10; -fx-background-radius: 12;");
        btn.setOnAction(e -> {
            if (btn.isSelected()) {
                activeFilter = tag;
                applyFilters();
            } else {
                btn.setSelected(true);
            }
        });
        return btn;
    }

    private void setupTableColumns() {
        TableColumn<DuplicateGroupItem, DuplicateGroupItem> fileCol = new TableColumn<>("Filename · Match · Status");
        fileCol.setCellValueFactory(d -> new javafx.beans.property.SimpleObjectProperty<>(d.getValue()));
        fileCol.setPrefWidth(320);
        fileCol.setCellFactory(col -> new TableCell<>() {
            private final HBox container = new HBox(10);
            private final ImageView thumbView = new ImageView();
            private final VBox textContainer = new VBox(2);
            private final Label nameLabel = new Label();
            private final Label metaLabel = new Label();

            {
                container.setAlignment(Pos.CENTER_LEFT);
                thumbView.setFitWidth(36);
                thumbView.setFitHeight(36);
                thumbView.setPreserveRatio(true);
                thumbView.setSmooth(true);
                thumbView.setStyle("-fx-background-radius: 4; -fx-clip-to-bounds: true;");

                nameLabel.setStyle("-fx-font-size: 13px; -fx-font-weight: 600; ");
                metaLabel.setStyle("-fx-font-size: 12px;"); metaLabel.getStyleClass().add("text-secondary");

                textContainer.getChildren().addAll(nameLabel, metaLabel);
                container.getChildren().addAll(thumbView, textContainer);
            }

            @Override
            protected void updateItem(DuplicateGroupItem item, boolean empty) {
                super.updateItem(item, empty);
                if (empty || item == null) {
                    setText(null);
                    setGraphic(null);
                } else {
                    File orig = item.getOriginalFile();
                    nameLabel.setText(orig != null ? orig.getName() : "Unknown");

                    double mb = item.getFileSize() / (1024.0 * 1024.0);
                    String matchText = item.getSimilarityPercentage() >= 99.9 ? "Exact match" : String.format("%.0f%% similar", item.getSimilarityPercentage());
                    metaLabel.setText(String.format("Group %s · %.1f MB · %s", item.getGroupId(), mb, matchText));

                    loadThumb(orig, thumbView, 36, 36);
                    setGraphic(container);
                    setText(null);
                }
            }
        });

        TableColumn<DuplicateGroupItem, Double> simCol = new TableColumn<>("Similarity");
        simCol.setCellValueFactory(d -> new javafx.beans.property.SimpleObjectProperty<>(d.getValue().getSimilarityPercentage()));
        simCol.setPrefWidth(85);
        simCol.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(Double sim, boolean empty) {
                super.updateItem(sim, empty);
                if (empty || sim == null) {
                    setText(null);
                    setGraphic(null);
                } else {
                    Label badge = new Label(sim >= 99.9 ? "100%" : String.format("%.0f%%", sim));
                    badge.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-padding: 2 6 2 6; -fx-background-radius: 4;");
                    if (sim >= 99.9) {
                        badge.setStyle(badge.getStyle() + "; -fx-text-fill: #10B981; -fx-background-color: rgba(16, 185, 129, 0.12);");
                    } else if (sim >= 90.0) {
                        badge.setStyle(badge.getStyle() + "; -fx-text-fill: #3B82F6; -fx-background-color: rgba(59, 130, 246, 0.12);");
                    } else {
                        badge.setStyle(badge.getStyle() + "; -fx-text-fill: #F59E0B; -fx-background-color: rgba(245, 158, 11, 0.12);");
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
                    badge.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-padding: 2 6 2 6; -fx-background-radius: 4;");
                    switch (item) {
                        case QUARANTINED -> badge.setStyle(badge.getStyle() + "; -fx-text-fill: #F59E0B; -fx-background-color: rgba(245, 158, 11, 0.12);");
                        case RESTORED -> badge.setStyle(badge.getStyle() + "; -fx-text-fill: #10B981; -fx-background-color: rgba(16, 185, 129, 0.12);");
                        case PURGED -> badge.setStyle(badge.getStyle() + "; -fx-text-fill: #F43F5E; -fx-background-color: rgba(244, 63, 94, 0.12);");
                        default -> badge.setStyle(badge.getStyle() + ";  -fx-background-color: rgba(152, 155, 168, 0.12);");
                    }
                    setGraphic(badge);
                    setText(null);
                }
            }
        });

        tableView.getColumns().clear();
        tableView.getColumns().addAll(fileCol, simCol, statusCol);
        tableView.setColumnResizePolicy(TableView.CONSTRAINED_RESIZE_POLICY);
        tableView.setFixedCellSize(44);
        VBox.setVgrow(tableView, Priority.ALWAYS);

        // Contextual table empty state
        VBox tableEmpty = new VBox(10);
        tableEmpty.setAlignment(Pos.CENTER);
        tableEmpty.setPadding(new Insets(30));
        Node emptyIcon = UiIcons.createSvgIcon(UiIcons.FOLDER, 36, "currentColor");
        Label emptyTitle = new Label("No duplicate groups found");
        emptyTitle.setStyle("-fx-font-size: 14px; -fx-font-weight: 600; ");
        Label emptyDesc = new Label("Select a photo folder and start scan to discover duplicates.");
        emptyDesc.setStyle("-fx-font-size: 13px;"); emptyDesc.getStyleClass().add("empty-state-sub");
        tableEmpty.getChildren().addAll(emptyIcon, emptyTitle, emptyDesc);
        tableView.setPlaceholder(tableEmpty);

        tableView.getSelectionModel().selectedItemProperty().addListener((obs, oldVal, newVal) -> {
            if (newVal != null) {
                loadGroupIntoReview(newVal);
            }
        });
    }

    private void setupTableData() {
        SortedList<DuplicateGroupItem> sortedData = new SortedList<>(filteredList);
        sortedData.comparatorProperty().bind(tableView.comparatorProperty());
        tableView.setItems(sortedData);

        searchField.textProperty().addListener((obs, oldVal, newVal) -> applyFilters());
    }

    private void applyFilters() {
        String query = searchField.getText() == null ? "" : searchField.getText().trim().toLowerCase();

        filteredList.setPredicate(item -> {
            // 1. Text Search
            boolean matchesSearch = query.isEmpty()
                    || (item.getOriginalFile() != null && item.getOriginalFile().getName().toLowerCase().contains(query))
                    || (item.getDuplicateFile() != null && item.getDuplicateFile().getName().toLowerCase().contains(query))
                    || item.getGroupId().toLowerCase().contains(query);

            if (!matchesSearch) return false;

            // 2. Filter Pill
            switch (activeFilter) {
                case "EXACT":
                    return item.getSimilarityPercentage() >= 99.9;
                case "SIMILAR":
                    return item.getSimilarityPercentage() < 99.9;
                case "REVIEWED":
                    return item.getStatus() != QuarantineStatus.PENDING_REVIEW;
                case "UNREVIEWED":
                    return item.getStatus() == QuarantineStatus.PENDING_REVIEW;
                case "ALL":
                default:
                    return true;
            }
        });

        countBadge.setText(filteredList.size() + " groups");
    }

    private VBox buildReviewPane() {
        VBox card = new VBox(10);
        card.getStyleClass().add("glass-card");
        card.setStyle("-fx-border-radius: 8; -fx-background-radius: 8; -fx-padding: 14;");
        VBox.setVgrow(card, Priority.ALWAYS);

        // Header
        HBox reviewHeader = new HBox(10);
        reviewHeader.setAlignment(Pos.CENTER_LEFT);

        VBox titleBox = new VBox(2);
        Label mainLabel = new Label("SIDE-BY-SIDE COMPARISON");
        mainLabel.setStyle("-fx-font-size: 11.5px; -fx-font-weight: 700; -fx-letter-spacing: 0.5px;"); mainLabel.getStyleClass().add("section-sub-title");
        reviewGroupTitle.setStyle("-fx-font-size: 14px; -fx-font-weight: 700; ");
        titleBox.getChildren().addAll(mainLabel, reviewGroupTitle);

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        // Zoom controls
        HBox zoomBox = new HBox(6);
        zoomBox.setAlignment(Pos.CENTER_RIGHT);
        Label zoomLabel = new Label("Zoom:");
        zoomLabel.setStyle("-fx-font-size: 11px; ");
        zoomSlider.setPrefWidth(90);
        zoomValueLabel.setStyle("-fx-font-size: 11px;  -fx-font-weight: 600;");
        zoomSlider.valueProperty().addListener((obs, oldVal, newVal) -> {
            double scale = newVal.doubleValue();
            zoomValueLabel.setText(String.format("%.0f%%", scale * 100));
            origImgView.setScaleX(scale);
            origImgView.setScaleY(scale);
            dupImgView.setScaleX(scale);
            dupImgView.setScaleY(scale);
        });
        zoomBox.getChildren().addAll(zoomLabel, zoomSlider, zoomValueLabel);

        similarityBadge.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-padding: 3 8 3 8; -fx-background-radius: 4; -fx-text-fill: #3B82F6; -fx-background-color: rgba(59, 130, 246, 0.12);");

        reviewHeader.getChildren().addAll(titleBox, spacer, zoomBox, similarityBadge);

        // Empty state for comparison
        reviewEmptyState.setAlignment(Pos.CENTER);
        reviewEmptyState.setPadding(new Insets(40));
        VBox.setVgrow(reviewEmptyState, Priority.ALWAYS);
        Node compIcon = UiIcons.createSvgIcon(UiIcons.EYE, 44, "currentColor");
        Label noSelTitle = new Label("Select a duplicate group to compare");
        noSelTitle.setStyle("-fx-font-size: 15px; -fx-font-weight: 600; ");
        Label noSelDesc = new Label("Choose a duplicate row on the left to inspect side-by-side previews, resolution and metadata.");
        noSelDesc.setStyle("-fx-font-size: 13px; -fx-text-alignment: center;"); noSelDesc.getStyleClass().add("empty-state-sub");
        noSelDesc.setWrapText(true);
        reviewEmptyState.getChildren().addAll(compIcon, noSelTitle, noSelDesc);

        // Content layout
        reviewContent.setSpacing(10);
        VBox.setVgrow(reviewContent, Priority.ALWAYS);

        // Side-by-side preview container
        HBox sideSplit = new HBox(12);
        sideSplit.setAlignment(Pos.CENTER);
        VBox.setVgrow(sideSplit, Priority.ALWAYS);

        // Box 1: Original photo
        VBox box1 = createPreviewCard("ORIGINAL PHOTO", "#10B981", origImgView, origNameLabel, origResLabel, origMetaLabel, rbKeepOrig);
        HBox.setHgrow(box1, Priority.ALWAYS);

        // Box 2: Duplicate copy
        VBox box2 = createPreviewCard("DUPLICATE COPY", "#F59E0B", dupImgView, dupNameLabel, dupResLabel, dupMetaLabel, rbQuarantineDup);
        box2.getChildren().add(rbKeepBoth);
        HBox.setHgrow(box2, Priority.ALWAYS);

        ToggleGroup keeperGroup = new ToggleGroup();
        rbQuarantineDup.setToggleGroup(keeperGroup);
        rbKeepBoth.setToggleGroup(keeperGroup);
        rbQuarantineDup.setSelected(true);

        rbKeepOrig.setSelected(true);
        rbKeepOrig.setDisable(true); // Original keeper default

        sideSplit.getChildren().addAll(box1, box2);

        // Bottom Action Bar
        HBox bottomBar = new HBox(10);
        bottomBar.setAlignment(Pos.CENTER_LEFT);
        bottomBar.setStyle("-fx-padding: 8 0 0 0;");

        selectionSummaryLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: 600; ");

        Region actSpacer = new Region();
        HBox.setHgrow(actSpacer, Priority.ALWAYS);

        btnQuarantineAction.getStyleClass().add("btn-primary");
        btnQuarantineAction.setStyle("-fx-font-size: 13px; -fx-padding: 6 16 6 16;");
        btnQuarantineAction.setOnAction(e -> executeQuarantine());

        btnRestoreAction.getStyleClass().add("btn-secondary");
        btnRestoreAction.setStyle("-fx-font-size: 13px; -fx-padding: 6 14 6 14;");
        btnRestoreAction.setDisable(true);
        btnRestoreAction.setOnAction(e -> executeRestore());

        btnPurgeAction.getStyleClass().add("btn-danger");
        btnPurgeAction.setStyle("-fx-font-size: 13px; -fx-padding: 6 14 6 14;");
        btnPurgeAction.setDisable(true);
        btnPurgeAction.setOnAction(e -> executePurge());

        bottomBar.getChildren().addAll(selectionSummaryLabel, actSpacer, btnRestoreAction, btnPurgeAction, btnQuarantineAction);

        reviewContent.getChildren().addAll(sideSplit, new Separator(), bottomBar);

        reviewContainer.getChildren().addAll(reviewEmptyState, reviewContent);
        reviewContent.setVisible(false);
        reviewEmptyState.setVisible(true);

        card.getChildren().addAll(reviewHeader, reviewContainer);
        return card;
    }

    private VBox createPreviewCard(String tag, String accentColor, ImageView iv, Label nameLbl, Label resLbl, Label metaLbl, RadioButton radio) {
        VBox box = new VBox(6);
        box.getStyleClass().add("inner-container");
        box.setStyle("-fx-background-radius: 8; -fx-padding: 12; -fx-border-radius: 8;");

        Label tagLbl = new Label(tag);
        tagLbl.setStyle(String.format("-fx-font-size: 10px; -fx-font-weight: 800; -fx-text-fill: %s; -fx-letter-spacing: 0.5px;", accentColor));

        StackPane imgFrame = new StackPane();
        imgFrame.setStyle(" -fx-background-radius: 6; -fx-padding: 6;");
        imgFrame.setPrefHeight(200);
        VBox.setVgrow(imgFrame, Priority.ALWAYS);

        iv.setFitWidth(230);
        iv.setFitHeight(180);
        iv.setPreserveRatio(true);
        iv.setSmooth(true);
        imgFrame.getChildren().add(iv);

        nameLbl.setStyle("-fx-font-size: 13px; -fx-font-weight: 700; ");
        resLbl.setStyle("-fx-font-size: 12px; -fx-font-weight: 600;"); resLbl.getStyleClass().add("text-secondary");
        metaLbl.setStyle("-fx-font-size: 12px;"); metaLbl.getStyleClass().add("text-secondary");

        radio.setStyle("-fx-font-size: 12px; ");

        box.getChildren().addAll(tagLbl, imgFrame, nameLbl, resLbl, metaLbl, radio);
        return box;
    }

    private void chooseFolder() {
        DirectoryChooser dc = new DirectoryChooser();
        dc.setTitle("Select Photo Folder for Duplicate Scanning");
        File dir = dc.showDialog(stage);
        if (dir != null) {
            this.selectedFolder = dir;
            folderPathLabel.setText(dir.getName());
            Tooltip.install(folderPathLabel, new Tooltip(dir.getAbsolutePath()));

            // Count files shallow
            File[] files = dir.listFiles();
            int cnt = files != null ? files.length : 0;
            folderDetailsLabel.setText(String.format("%d items in root folder", cnt));
            progressLabel.setText("Ready to scan");
        }
    }

    private void startScan() {
        if (selectedFolder == null) {
            Alert alert = new Alert(Alert.AlertType.WARNING, "Please select a photo directory first.", ButtonType.OK);
            alert.initOwner(stage);
            alert.show();
            return;
        }

        activeCancellationToken = new com.takeoutfix.shared.task.CancellationToken();
        btnStartScan.setDisable(true);
        btnPause.setDisable(false);
        btnPause.setText("Pause");
        btnPause.setGraphic(UiIcons.createSvgIcon(UiIcons.PAUSE, 12, "currentColor"));
        btnCancel.setDisable(false);
        progressBar.setVisible(true);
        progressBar.setProgress(ProgressIndicator.INDETERMINATE_PROGRESS);
        progressLabel.setText("Scanning directory and calculating hashes...");
        masterList.clear();

        DuplicateScanService.MatchStrategy strategy = matchModeCombo.getValue() != null
                ? matchModeCombo.getValue()
                : DuplicateScanService.MatchStrategy.EXACT_HASH;

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
                return scanService.scanDirectory(selectedFolder.toPath(), strategy, scanThreshold, activeCancellationToken);
            }
        };
        activeScanTask = task;

        task.setOnSucceeded(e -> {
            ScanResult res = task.getValue();
            scannedCountLabel.setText(String.valueOf(res.getTotalFilesScanned()));

            List<DuplicateGroupItem> items = new ArrayList<>();
            for (DuplicateCluster cluster : res.getClusters()) {
                for (File dup : cluster.getDuplicateCopies()) {
                    items.add(new DuplicateGroupItem(cluster.getGroupId(), cluster.getPrimaryFile(), dup, cluster.getFileSize(), cluster.getMatchType(), cluster.getSimilarityPercentage()));
                }
            }

            masterList.addAll(items);
            duplicateCountLabel.setText(String.valueOf(res.getClusters().size()));

            double mb = res.getTotalReclaimableBytes() / (1024.0 * 1024.0);
            spaceSavedLabel.setText(mb >= 1024.0 ? String.format("%.1f GB", mb / 1024.0) : String.format("%.1f MB", mb));

            btnStartScan.setDisable(false);
            btnPause.setDisable(true);
            btnCancel.setDisable(true);
            progressBar.setVisible(false);
            progressLabel.setText(String.format("Scan complete: %d duplicates in %d groups", items.size(), res.getClusters().size()));

            applyFilters();

            if (!items.isEmpty()) {
                tableView.getSelectionModel().select(0);
            } else {
                reviewContent.setVisible(false);
                reviewEmptyState.setVisible(true);
            }
        });

        task.setOnCancelled(e -> {
            btnStartScan.setDisable(false);
            btnPause.setDisable(true);
            btnCancel.setDisable(true);
            progressBar.setVisible(false);
            progressLabel.setText("Scan cancelled by user.");
        });

        task.setOnFailed(e -> {
            btnStartScan.setDisable(false);
            btnPause.setDisable(true);
            btnCancel.setDisable(true);
            progressBar.setVisible(false);
            if (activeCancellationToken != null && activeCancellationToken.isCancelled()) {
                progressLabel.setText("Scan cancelled by user.");
            } else {
                progressLabel.setText("Scan failed: " + task.getException().getMessage());
            }
        });

        Thread t = new Thread(task, "duplicate-finder-engine");
        t.setDaemon(true);
        t.start();
    }

    private void handlePause() {
        if (activeCancellationToken == null) return;
        if (activeCancellationToken.isPaused()) {
            activeCancellationToken.resume();
            btnPause.setText("Pause");
            btnPause.setGraphic(UiIcons.createSvgIcon(UiIcons.PAUSE, 12, "currentColor"));
            progressLabel.setText("Scanning directory and calculating hashes...");
        } else {
            activeCancellationToken.pause();
            btnPause.setText("Resume");
            btnPause.setGraphic(UiIcons.createSvgIcon(UiIcons.PLAY, 12, "currentColor"));
            progressLabel.setText("Scan paused.");
        }
    }

    private void handleCancel() {
        if (activeCancellationToken != null) {
            activeCancellationToken.cancel();
        }
        if (activeScanTask != null) {
            activeScanTask.cancel();
        }
        btnStartScan.setDisable(false);
        btnPause.setDisable(true);
        btnCancel.setDisable(true);
        progressBar.setVisible(false);
        progressLabel.setText("Scan cancelled by user.");
    }

    private void loadGroupIntoReview(DuplicateGroupItem item) {
        this.currentSelectedItem = item;
        reviewEmptyState.setVisible(false);
        reviewContent.setVisible(true);

        reviewGroupTitle.setText(String.format("Group %s · %s", item.getGroupId(), item.getMatchType()));

        double sim = item.getSimilarityPercentage();
        if (sim >= 99.9) {
            similarityBadge.setText("100% Identical content");
            similarityBadge.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-padding: 3 8 3 8; -fx-background-radius: 4; -fx-text-fill: #10B981; -fx-background-color: rgba(16, 185, 129, 0.12);");
        } else if (sim >= 90.0) {
            similarityBadge.setText(String.format("%.0f%% Visual match", sim));
            similarityBadge.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-padding: 3 8 3 8; -fx-background-radius: 4; -fx-text-fill: #3B82F6; -fx-background-color: rgba(59, 130, 246, 0.12);");
        } else {
            similarityBadge.setText(String.format("%.0f%% Edit / Crop", sim));
            similarityBadge.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-padding: 3 8 3 8; -fx-background-radius: 4; -fx-text-fill: #F59E0B; -fx-background-color: rgba(245, 158, 11, 0.12);");
        }

        // Reset zoom
        zoomSlider.setValue(1.0);

        // Load Original
        File fOrig = item.getOriginalFile();
        if (fOrig != null && fOrig.exists()) {
            origNameLabel.setText(fOrig.getName());
            origMetaLabel.setText(String.format("%.2f MB · Modified: %s",
                    fOrig.length() / (1024.0 * 1024.0),
                    formatDate(fOrig.lastModified())));
            loadFullImageAndResolution(fOrig, origImgView, origResLabel);
        } else {
            origNameLabel.setText("—");
            origResLabel.setText("—");
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
            loadFullImageAndResolution(fDup, dupImgView, dupResLabel);
        } else {
            dupNameLabel.setText("—");
            dupResLabel.setText("—");
            dupMetaLabel.setText("File unavailable");
            dupImgView.setImage(null);
        }

        double mb = item.getFileSize() / (1024.0 * 1024.0);
        selectionSummaryLabel.setText(String.format("1 duplicate selected · %.1f MB reclaimable", mb));

        // Update button states depending on item status
        if (item.getStatus() == QuarantineStatus.QUARANTINED) {
            btnQuarantineAction.setDisable(true);
            btnRestoreAction.setDisable(false);
            btnPurgeAction.setDisable(false);
            rbQuarantineDup.setSelected(true);
        } else if (item.getStatus() == QuarantineStatus.RESTORED || item.getStatus() == QuarantineStatus.PURGED) {
            btnQuarantineAction.setDisable(true);
            btnRestoreAction.setDisable(true);
            btnPurgeAction.setDisable(true);
        } else {
            btnQuarantineAction.setDisable(false);
            btnRestoreAction.setDisable(true);
            btnPurgeAction.setDisable(true);
            rbQuarantineDup.setSelected(true);
        }
    }

    private void loadFullImageAndResolution(File f, ImageView iv, Label resLbl) {
        String name = f.getName().toLowerCase();
        if (name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".png") || name.endsWith(".bmp") || name.endsWith(".gif")) {
            try {
                Image img = new Image(f.toURI().toString(), 600, 450, true, true, true);
                img.progressProperty().addListener((obs, oldVal, newVal) -> {
                    if (newVal.doubleValue() >= 1.0) {
                        Platform.runLater(() -> {
                            if (img.getWidth() > 0 && img.getHeight() > 0) {
                                resLbl.setText(String.format("%d × %d px", (int) img.getWidth(), (int) img.getHeight()));
                            }
                        });
                    }
                });
                iv.setImage(img);
                return;
            } catch (Exception ignored) {}
        }
        iv.setImage(null);
        resLbl.setText("Non-image file");
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
            alert.initOwner(stage);
            alert.show();
        } catch (Exception ex) {
            Alert alert = new Alert(Alert.AlertType.ERROR, "Failed to quarantine file: " + ex.getMessage(), ButtonType.OK);
            alert.initOwner(stage);
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
            alert.initOwner(stage);
            alert.show();
        } catch (Exception ex) {
            Alert alert = new Alert(Alert.AlertType.ERROR, "Failed to restore file: " + ex.getMessage(), ButtonType.OK);
            alert.initOwner(stage);
            alert.show();
        }
    }

    private void executePurge() {
        if (currentSelectedItem == null || currentSelectedItem.getQuarantinedFileRef() == null) return;
        File qFile = currentSelectedItem.getQuarantinedFileRef();

        Alert confirm = new Alert(Alert.AlertType.CONFIRMATION);
        confirm.initOwner(stage);
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
                alert.initOwner(stage);
                alert.show();
            } catch (Exception ex) {
                Alert alert = new Alert(Alert.AlertType.ERROR, "Failed to purge file: " + ex.getMessage(), ButtonType.OK);
                alert.initOwner(stage);
                alert.show();
            }
        }
    }

    private void loadThumb(File f, ImageView iv, double w, double h) {
        if (f == null) {
            iv.setImage(null);
            return;
        }
        String name = f.getName().toLowerCase();
        if (name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".png") || name.endsWith(".bmp") || name.endsWith(".gif")) {
            try {
                Image img = new Image(f.toURI().toString(), w, h, true, true, true);
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
