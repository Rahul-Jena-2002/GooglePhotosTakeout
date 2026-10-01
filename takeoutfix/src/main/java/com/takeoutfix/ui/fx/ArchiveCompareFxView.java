package com.takeoutfix.ui.fx;

import com.takeoutfix.compare.ArchiveCompareService;
import com.takeoutfix.compare.ArchiveCompareService.CompareRecord;
import com.takeoutfix.compare.ArchiveCompareService.ComparisonResult;
import com.takeoutfix.compare.ArchiveCompareService.DiffType;
import javafx.application.Platform;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.collections.transformation.FilteredList;
import javafx.concurrent.Task;
import javafx.geometry.Insets;
import javafx.geometry.Orientation;
import javafx.geometry.Pos;
import javafx.scene.Node;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.stage.DirectoryChooser;
import javafx.stage.FileChooser;
import javafx.stage.Stage;

import java.io.File;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Optional;
import java.util.function.Consumer;
import java.util.stream.Stream;

/**
 * Modern Compare Collections (Archive Comparison) Workspace.
 * Features:
 * 1. Prominent Dual Collection Pickers (Original vs Backup) with folder counts and full path tooltips.
 * 2. High-visibility neutral metric cards with semantic color accents (Identical, Missing, Additional, Modified).
 * 3. Searchable and category-filtered differences table with 42px row height and status badges.
 * 4. Contextual empty states (Pre-scan instructions vs Post-scan 'Collections are identical' green confirmation).
 * 5. Safe non-destructive file restoration and CSV/JSON export.
 */
public class ArchiveCompareFxView extends VBox {

    private final Stage stage;
    private final Consumer<WorkspaceType> onNavigate;
    private final ArchiveCompareService compareService = new ArchiveCompareService();

    // Source Selection Controls
    private final Label sourceANameLabel = new Label("No folder selected");
    private final Label sourceBNameLabel = new Label("No folder selected");
    private final Label sourceAStatsLabel = new Label("0 files · 0 MB");
    private final Label sourceBStatsLabel = new Label("0 files · 0 MB");

    private File folderA = null;
    private File folderB = null;

    // Metric Summary Labels
    private final Label countExact = new Label("0");
    private final Label countMissing = new Label("0");
    private final Label countAdditional = new Label("0");
    private final Label countModified = new Label("0");

    private final Button btnCompare = new Button("Compare Files");
    private final ProgressBar progressBar = new ProgressBar(0.0);
    private final Label statusProgressLabel = new Label("Select two folders to begin");
    private final Button btnSafeCopy = new Button("Restore Missing Files to Backup");
    private final Button btnExportCsv = new Button("Export CSV");
    private final Button btnExportJson = new Button("Export JSON");

    // Table & Filter
    private final TextField searchField = new TextField();
    private final Label tableCountLabel = new Label("0 files");
    private final ObservableList<CompareRecord> masterItems = FXCollections.observableArrayList();
    private final FilteredList<CompareRecord> filteredItems = new FilteredList<>(masterItems, p -> true);
    private final TableView<CompareRecord> tableView = new TableView<>(filteredItems);

    private DiffType activeFilter = null; // null represents ALL
    private boolean hasCompared = false;

    public ArchiveCompareFxView(Stage stage, Consumer<WorkspaceType> onNavigate) {
        this.stage = stage;
        this.onNavigate = onNavigate;

        getStyleClass().add("workspace-view");
        setSpacing(16);
        setPadding(new Insets(24));
        VBox.setVgrow(this, Priority.ALWAYS);

        // 1. Header
        getChildren().add(buildHeaderRow());

        // 2. Resizable Vertical SplitPane: Top (Dual Pickers & KPIs) | Bottom (Comparison Results Table)
        SplitPane splitPane = new SplitPane();
        splitPane.setOrientation(Orientation.VERTICAL);
        VBox.setVgrow(splitPane, Priority.ALWAYS);

        VBox topSection = new VBox(12, buildDualPickerCard(), buildKpiDeck());
        SplitPane.setResizableWithParent(topSection, false);
        VBox tableCard = buildTableCard();
        VBox.setVgrow(tableCard, Priority.ALWAYS);

        splitPane.getItems().addAll(topSection, tableCard);
        splitPane.setDividerPositions(0.38);
        getChildren().add(splitPane);

        updateEmptyState();
    }

    private HBox buildHeaderRow() {
        HBox header = new HBox(12);
        header.setAlignment(Pos.CENTER_LEFT);

        StackPane iconTile = new StackPane(UiIcons.createSvgIcon(UiIcons.DIFF, 16, "currentColor"));
        iconTile.getStyleClass().add("header-icon-tile");

        VBox titleBox = new VBox(2);
        Label title = new Label("Compare Collections");
        title.getStyleClass().addAll("page-title", "header-title");

        Label subtitle = new Label("Find missing, additional, and modified photos between two collections.");
        subtitle.getStyleClass().addAll("page-description", "header-subtitle");
        titleBox.getChildren().addAll(title, subtitle);

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        header.getChildren().addAll(iconTile, titleBox, spacer);
        return header;
    }

    private VBox buildDualPickerCard() {
        VBox card = new VBox(12);
        card.getStyleClass().add("glass-card");
        card.setPadding(new Insets(14, 16, 14, 16));

        HBox split = new HBox(20);
        split.setAlignment(Pos.CENTER_LEFT);

        // Left: Original Collection
        VBox left = new VBox(6);
        HBox.setHgrow(left, Priority.ALWAYS);

        Label aTitle = new Label("ORIGINAL COLLECTION");
        aTitle.setStyle("-fx-font-size: 12px; -fx-font-weight: 700; -fx-letter-spacing: 0.5px;"); aTitle.getStyleClass().add("section-sub-title");

        HBox aRow = new HBox(10);
        aRow.setAlignment(Pos.CENTER_LEFT);
        Button btnBrowseA = new Button("Choose Original");
        btnBrowseA.getStyleClass().add("btn-primary");
        btnBrowseA.setGraphic(UiIcons.createSvgIcon(UiIcons.FOLDER, 13, "currentColor"));
        btnBrowseA.setGraphicTextGap(6);
        btnBrowseA.setStyle("-fx-font-size: 12px; -fx-font-weight: 600; -fx-pref-height: 34px; -fx-padding: 6 14;");
        btnBrowseA.setOnAction(e -> chooseFolderA());

        sourceANameLabel.setStyle("-fx-font-size: 14px; -fx-font-weight: 700;"); sourceANameLabel.getStyleClass().add("text-primary");
        sourceANameLabel.setMaxWidth(Double.MAX_VALUE);
        HBox.setHgrow(sourceANameLabel, Priority.ALWAYS);
        aRow.getChildren().addAll(btnBrowseA, sourceANameLabel);

        HBox aStatsRow = new HBox(6);
        aStatsRow.setAlignment(Pos.CENTER_LEFT);
        sourceAStatsLabel.setStyle("-fx-font-size: 12.5px; -fx-font-weight: 500;"); sourceAStatsLabel.getStyleClass().add("text-secondary");
        aStatsRow.getChildren().addAll(UiIcons.createSvgIcon(UiIcons.CAMERA, 12, "currentColor"), sourceAStatsLabel);

        left.getChildren().addAll(aTitle, aRow, aStatsRow);

        // Subtle Vertical Divider
        Separator vSep = new Separator(Orientation.VERTICAL);

        // Right: Backup Collection
        VBox right = new VBox(6);
        HBox.setHgrow(right, Priority.ALWAYS);

        Label bTitle = new Label("BACKUP COLLECTION");
        bTitle.setStyle("-fx-font-size: 12px; -fx-font-weight: 700; -fx-letter-spacing: 0.5px;"); bTitle.getStyleClass().add("section-sub-title");

        HBox bRow = new HBox(10);
        bRow.setAlignment(Pos.CENTER_LEFT);
        Button btnBrowseB = new Button("Choose Backup");
        btnBrowseB.getStyleClass().add("btn-secondary");
        btnBrowseB.setGraphic(UiIcons.createSvgIcon(UiIcons.OUTPUT_FOLDER, 13, "currentColor"));
        btnBrowseB.setGraphicTextGap(6);
        btnBrowseB.setStyle("-fx-font-size: 12px; -fx-font-weight: 600; -fx-pref-height: 34px; -fx-padding: 6 14;");
        btnBrowseB.setOnAction(e -> chooseFolderB());

        sourceBNameLabel.setStyle("-fx-font-size: 14px; -fx-font-weight: 700;"); sourceBNameLabel.getStyleClass().add("text-primary");
        sourceBNameLabel.setMaxWidth(Double.MAX_VALUE);
        HBox.setHgrow(sourceBNameLabel, Priority.ALWAYS);
        bRow.getChildren().addAll(btnBrowseB, sourceBNameLabel);

        HBox bStatsRow = new HBox(6);
        bStatsRow.setAlignment(Pos.CENTER_LEFT);
        sourceBStatsLabel.setStyle("-fx-font-size: 12.5px; -fx-font-weight: 500;"); sourceBStatsLabel.getStyleClass().add("text-secondary");
        bStatsRow.getChildren().addAll(UiIcons.createSvgIcon(UiIcons.CAMERA, 12, "currentColor"), sourceBStatsLabel);

        right.getChildren().addAll(bTitle, bRow, bStatsRow);

        split.getChildren().addAll(left, vSep, right);

        // Action Toolbar
        HBox actRow = new HBox(12);
        actRow.setAlignment(Pos.CENTER_LEFT);
        actRow.setPadding(new Insets(4, 0, 0, 0));

        btnCompare.getStyleClass().add("btn-primary");
        btnCompare.setGraphic(UiIcons.createSvgIcon(UiIcons.DIFF, 14, "currentColor"));
        btnCompare.setGraphicTextGap(7);
        btnCompare.setStyle("-fx-font-size: 13px; -fx-font-weight: 700; -fx-pref-height: 36px; -fx-padding: 6 18;");
        btnCompare.setDisable(true);
        btnCompare.setOnAction(e -> runComparison());

        progressBar.setProgress(0.0);
        progressBar.setPrefWidth(200);
        progressBar.setVisible(false);

        statusProgressLabel.setStyle("-fx-font-size: 12.5px; -fx-font-weight: 500;"); statusProgressLabel.getStyleClass().add("text-secondary");

        actRow.getChildren().addAll(btnCompare, progressBar, statusProgressLabel);
        card.getChildren().addAll(split, new Separator(), actRow);
        return card;
    }

    private HBox buildKpiDeck() {
        HBox deck = new HBox(12);
        deck.setAlignment(Pos.CENTER);

        VBox cExact = createMetricCard("IDENTICAL", countExact, "Identical content & hash", "#10B981");
        VBox cMissing = createMetricCard("MISSING", countMissing, "Missing from backup", "#F59E0B");
        VBox cAdd = createMetricCard("ADDITIONAL", countAdditional, "Only in backup", null);
        VBox cMod = createMetricCard("MODIFIED", countModified, "Content differences", "#F43F5E");

        HBox.setHgrow(cExact, Priority.ALWAYS);
        HBox.setHgrow(cMissing, Priority.ALWAYS);
        HBox.setHgrow(cAdd, Priority.ALWAYS);
        HBox.setHgrow(cMod, Priority.ALWAYS);

        deck.getChildren().addAll(cExact, cMissing, cAdd, cMod);
        return deck;
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
                    int v = Integer.parseInt(newVal.replaceAll("[^0-9]", ""));
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

    private VBox buildTableCard() {
        VBox card = new VBox(10);
        card.getStyleClass().add("glass-card");
        card.setPadding(new Insets(14, 14, 14, 14));
        VBox.setVgrow(card, Priority.ALWAYS);

        // Filter Pills & Search Row
        HBox topRow = new HBox(12);
        topRow.setAlignment(Pos.CENTER_LEFT);

        HBox filterGroup = new HBox(6);
        filterGroup.setAlignment(Pos.CENTER_LEFT);

        List<Button> filterButtons = new ArrayList<>();
        Button fAll = createFilterBtn("All", null, filterButtons, true);
        Button fExact = createFilterBtn("Identical", DiffType.EXACT, filterButtons, false);
        Button fMissing = createFilterBtn("Missing", DiffType.MISSING_IN_B, filterButtons, false);
        Button fAdd = createFilterBtn("Additional", DiffType.ADDITIONAL_IN_B, filterButtons, false);
        Button fMod = createFilterBtn("Modified", DiffType.MODIFIED, filterButtons, false);
        filterGroup.getChildren().addAll(fAll, fExact, fMissing, fAdd, fMod);

        searchField.setPromptText("Search files (filename or relative path)...");
        searchField.setStyle("-fx-font-size: 12px; -fx-pref-height: 32px; -fx-padding: 0 10;");
        searchField.textProperty().addListener((obs, oldVal, newVal) -> updateTableFilter());
        HBox.setHgrow(searchField, Priority.ALWAYS);

        tableCountLabel.setStyle("-fx-font-size: 12.5px; -fx-font-weight: 700; -fx-min-width: 50px;"); tableCountLabel.getStyleClass().add("brand-accent");

        topRow.getChildren().addAll(filterGroup, searchField, tableCountLabel);

        // Setup Table
        setupTableView();

        // Footer Strip (Safe Restore & Export)
        HBox footerStrip = new HBox(10);
        footerStrip.setAlignment(Pos.CENTER_RIGHT);
        footerStrip.setPadding(new Insets(4, 0, 0, 0));

        btnSafeCopy.getStyleClass().add("btn-primary");
        btnSafeCopy.setGraphic(UiIcons.createSvgIcon(UiIcons.SYNC, 13, "currentColor"));
        btnSafeCopy.setGraphicTextGap(6);
        btnSafeCopy.setStyle("-fx-font-size: 12px; -fx-font-weight: 700; -fx-padding: 6 16;");
        btnSafeCopy.setDisable(true);
        btnSafeCopy.setOnAction(e -> handleSafeCopy());

        btnExportCsv.getStyleClass().add("btn-secondary");
        btnExportCsv.setGraphic(UiIcons.createSvgIcon(UiIcons.DOWNLOAD, 12, "currentColor"));
        btnExportCsv.setGraphicTextGap(6);
        btnExportCsv.setStyle("-fx-font-size: 12px; -fx-font-weight: 600; -fx-padding: 6 14;");
        btnExportCsv.setDisable(true);
        btnExportCsv.setOnAction(e -> exportToCsv());

        btnExportJson.getStyleClass().add("btn-secondary");
        btnExportJson.setGraphic(UiIcons.createSvgIcon(UiIcons.DOWNLOAD, 12, "currentColor"));
        btnExportJson.setGraphicTextGap(6);
        btnExportJson.setStyle("-fx-font-size: 12px; -fx-font-weight: 600; -fx-padding: 6 14;");
        btnExportJson.setDisable(true);
        btnExportJson.setOnAction(e -> exportToJson());

        Region fSpacer = new Region();
        HBox.setHgrow(fSpacer, Priority.ALWAYS);

        footerStrip.getChildren().addAll(fSpacer, btnExportCsv, btnExportJson, btnSafeCopy);

        card.getChildren().addAll(topRow, tableView, footerStrip);
        return card;
    }

    private void setupTableView() {
        TableColumn<CompareRecord, String> pathCol = new TableColumn<>("File Name / Relative Path");
        pathCol.setCellValueFactory(d -> new javafx.beans.property.SimpleStringProperty(d.getValue().getRelativePath()));
        pathCol.setPrefWidth(320);
        pathCol.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(String item, boolean empty) {
                super.updateItem(item, empty);
                if (empty || item == null) {
                    setText(null);
                    setGraphic(null);
                } else {
                    setText(item);
                    setGraphic(UiIcons.createSvgIcon(UiIcons.CAMERA, 13, "#A78BFA"));
                    setGraphicTextGap(8);
                    setStyle("-fx-font-size: 13px; -fx-font-weight: 600;"); getStyleClass().add("text-primary");
                }
            }
        });

        TableColumn<CompareRecord, String> aCol = new TableColumn<>("Original (Source A)");
        aCol.setCellValueFactory(d -> new javafx.beans.property.SimpleStringProperty(d.getValue().getSourceAInfo()));
        aCol.setPrefWidth(200);
        aCol.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(String item, boolean empty) {
                super.updateItem(item, empty);
                if (empty || item == null) {
                    setText(null);
                } else {
                    setText(item);
                    setStyle("-fx-font-size: 12px;"); getStyleClass().add("text-secondary");
                }
            }
        });

        TableColumn<CompareRecord, String> bCol = new TableColumn<>("Backup (Source B)");
        bCol.setCellValueFactory(d -> new javafx.beans.property.SimpleStringProperty(d.getValue().getSourceBInfo()));
        bCol.setPrefWidth(200);
        bCol.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(String item, boolean empty) {
                super.updateItem(item, empty);
                if (empty || item == null) {
                    setText(null);
                } else {
                    setText(item);
                    setStyle("-fx-font-size: 12px;"); getStyleClass().add("text-secondary");
                }
            }
        });

        TableColumn<CompareRecord, DiffType> statusCol = new TableColumn<>("Status");
        statusCol.setCellValueFactory(d -> new javafx.beans.property.SimpleObjectProperty<>(d.getValue().getDiffType()));
        statusCol.setPrefWidth(160);
        statusCol.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(DiffType item, boolean empty) {
                super.updateItem(item, empty);
                if (empty || item == null) {
                    setText(null);
                    setGraphic(null);
                } else {
                    Label badge = new Label();
                    badge.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-padding: 3 8; -fx-background-radius: 4;");
                    switch (item) {
                        case EXACT -> {
                            badge.setText("Identical");
                            badge.setStyle(badge.getStyle() + "; -fx-text-fill: #10B981; -fx-background-color: rgba(16, 185, 129, 0.15);");
                        }
                        case MISSING_IN_B -> {
                            badge.setText("Missing from Backup");
                            badge.setStyle(badge.getStyle() + "; -fx-text-fill: #F59E0B; -fx-background-color: rgba(245, 158, 11, 0.15);");
                        }
                        case ADDITIONAL_IN_B -> {
                            badge.setText("Only in Backup");
                            badge.setStyle(badge.getStyle() + "; -fx-text-fill: #3B82F6; -fx-background-color: rgba(59, 130, 246, 0.15);");
                        }
                        case MODIFIED -> {
                            badge.setText("Content Differences");
                            badge.setStyle(badge.getStyle() + "; -fx-text-fill: #F43F5E; -fx-background-color: rgba(244, 63, 94, 0.15);");
                        }
                    }
                    setGraphic(badge);
                    setText(null);
                }
            }
        });

        tableView.getColumns().clear();
        tableView.getColumns().addAll(pathCol, aCol, bCol, statusCol);
        tableView.setColumnResizePolicy(TableView.CONSTRAINED_RESIZE_POLICY);
        tableView.setStyle("-fx-cell-size: 42px;");
        VBox.setVgrow(tableView, Priority.ALWAYS);

        // Double-click row inspector for modified or detailed view
        tableView.setRowFactory(tv -> {
            TableRow<CompareRecord> row = new TableRow<>();
            row.setOnMouseClicked(event -> {
                if (event.getClickCount() == 2 && (!row.isEmpty())) {
                    showItemDetails(row.getItem());
                }
            });
            return row;
        });
    }

    private void showItemDetails(CompareRecord rec) {
        if (rec == null) return;
        Alert detail = new Alert(Alert.AlertType.INFORMATION);
        detail.setTitle("File Comparison Details");
        detail.setHeaderText(rec.getRelativePath());
        detail.setContentText(String.format(
                "Status: %s\n\nOriginal (Source A):\n• %s\n• Path: %s\n\nBackup (Source B):\n• %s\n• Path: %s",
                rec.getDiffType().getLabel(),
                rec.getSourceAInfo(),
                rec.getFileA() != null ? rec.getFileA().getAbsolutePath() : "Not present",
                rec.getSourceBInfo(),
                rec.getFileB() != null ? rec.getFileB().getAbsolutePath() : "Not present"
        ));
        detail.showAndWait();
    }

    private Button createFilterBtn(String text, DiffType type, List<Button> group, boolean active) {
        Button btn = new Button(text);
        btn.getStyleClass().add(active ? "btn-secondary" : "btn-ghost");
        btn.setStyle("-fx-font-size: 12px; -fx-font-weight: 600; -fx-padding: 4 10; -fx-background-radius: 6;");
        btn.setOnAction(e -> {
            activeFilter = type;
            for (Button b : group) {
                b.getStyleClass().removeAll("btn-ghost", "btn-secondary");
                b.getStyleClass().add(b == btn ? "btn-secondary" : "btn-ghost");
            }
            updateTableFilter();
        });
        group.add(btn);
        return btn;
    }

    private void updateTableFilter() {
        String q = searchField.getText() != null ? searchField.getText().toLowerCase().trim() : "";
        filteredItems.setPredicate(item -> {
            if (activeFilter != null && item.getDiffType() != activeFilter) {
                return false;
            }
            if (q.isEmpty()) return true;
            return (item.getRelativePath() != null && item.getRelativePath().toLowerCase().contains(q)) ||
                   (item.getSourceAInfo() != null && item.getSourceAInfo().toLowerCase().contains(q)) ||
                   (item.getSourceBInfo() != null && item.getSourceBInfo().toLowerCase().contains(q));
        });

        int size = filteredItems.size();
        tableCountLabel.setText(size + (size == 1 ? " file" : " files"));
        updateEmptyState();
    }

    private void updateEmptyState() {
        VBox emptyBox = new VBox(10);
        emptyBox.setAlignment(Pos.CENTER);
        emptyBox.setPadding(new Insets(36, 20, 36, 20));

        if (!hasCompared) {
            Node icon = UiIcons.createSvgIcon(UiIcons.DIFF, 36, "#A78BFA");
            Label title = new Label("No comparison results yet");
            title.setStyle("-fx-font-size: 15px; -fx-font-weight: 700;"); title.getStyleClass().add("empty-state-title");
            Label sub = new Label("Choose two collections and compare their files to see differences here.");
            sub.setStyle("-fx-font-size: 13px;"); sub.getStyleClass().add("empty-state-sub");
            emptyBox.getChildren().addAll(icon, title, sub);
        } else if (masterItems.isEmpty() || (filteredItems.isEmpty() && activeFilter == null)) {
            Node icon = UiIcons.createSvgIcon(UiIcons.CHECK_CIRCLE, 36, "#10B981");
            Label title = new Label("Collections are identical");
            title.setStyle("-fx-font-size: 15px; -fx-font-weight: 700; -fx-text-fill: #10B981;");
            Label sub = new Label("All scanned files have matching content and checksums.");
            sub.setStyle("-fx-font-size: 13px;"); sub.getStyleClass().add("empty-state-sub");
            emptyBox.getChildren().addAll(icon, title, sub);
        } else {
            Node icon = UiIcons.createSvgIcon(UiIcons.SEARCH, 32, "#71717A");
            Label title = new Label("No matching files found");
            title.setStyle("-fx-font-size: 14px; -fx-font-weight: 700;"); title.getStyleClass().add("empty-state-title");
            Label sub = new Label("Try changing your filter or clearing the search box.");
            sub.setStyle("-fx-font-size: 13px;"); sub.getStyleClass().add("empty-state-sub");
            emptyBox.getChildren().addAll(icon, title, sub);
        }

        tableView.setPlaceholder(emptyBox);
    }

    private void chooseFolderA() {
        DirectoryChooser dc = new DirectoryChooser();
        dc.setTitle("Select Original Photo Collection (Source A)");
        File dir = dc.showDialog(stage);
        if (dir != null) {
            folderA = dir;
            sourceANameLabel.setText(dir.getName());
            Tooltip.install(sourceANameLabel, new Tooltip(dir.getAbsolutePath()));
            scanCollectionQuickStats(dir, sourceAStatsLabel);
            checkReadyState();
        }
    }

    private void chooseFolderB() {
        DirectoryChooser dc = new DirectoryChooser();
        dc.setTitle("Select Backup Collection (Source B)");
        File dir = dc.showDialog(stage);
        if (dir != null) {
            folderB = dir;
            sourceBNameLabel.setText(dir.getName());
            Tooltip.install(sourceBNameLabel, new Tooltip(dir.getAbsolutePath()));
            scanCollectionQuickStats(dir, sourceBStatsLabel);
            checkReadyState();
        }
    }

    private void checkReadyState() {
        boolean ready = (folderA != null && folderB != null);
        btnCompare.setDisable(!ready);
        if (ready) {
            statusProgressLabel.setText("Ready to compare. Click 'Compare Files' to begin.");
        } else {
            statusProgressLabel.setText("Select two folders to begin.");
        }
    }

    private void scanCollectionQuickStats(File dir, Label targetLabel) {
        Task<String> task = new Task<>() {
            @Override
            protected String call() {
                long totalBytes = 0;
                int count = 0;
                try (Stream<Path> stream = Files.walk(dir.toPath())) {
                    Iterator<Path> it = stream.iterator();
                    while (it.hasNext()) {
                        Path p = it.next();
                        if (Files.isRegularFile(p) && ArchiveCompareService.isMediaFile(p)) {
                            count++;
                            totalBytes += Files.size(p);
                        }
                    }
                } catch (Exception ignored) {}
                double gb = totalBytes / (1024.0 * 1024.0 * 1024.0);
                if (gb >= 1.0) {
                    return String.format("%d files · %.2f GB", count, gb);
                } else {
                    return String.format("%d files · %.1f MB", count, totalBytes / (1024.0 * 1024.0));
                }
            }
        };
        task.setOnSucceeded(e -> targetLabel.setText(task.getValue()));
        Thread t = new Thread(task, "quick-stats-scanner");
        t.setDaemon(true);
        t.start();
    }

    private void runComparison() {
        if (folderA == null || folderB == null) return;

        btnCompare.setDisable(true);
        progressBar.setVisible(true);
        progressBar.setProgress(ProgressIndicator.INDETERMINATE_PROGRESS);
        statusProgressLabel.setText("Scanning and indexing collections...");
        masterItems.clear();
        hasCompared = false;

        Task<ComparisonResult> task = new Task<>() {
            @Override
            protected ComparisonResult call() throws Exception {
                return compareService.compare(folderA.toPath(), folderB.toPath());
            }
        };

        task.setOnSucceeded(e -> {
            ComparisonResult res = task.getValue();
            masterItems.addAll(res.getRecords());
            hasCompared = true;

            countExact.setText(String.valueOf(res.getExactCount()));
            countMissing.setText(String.valueOf(res.getMissingCount()));
            countAdditional.setText(String.valueOf(res.getAdditionalCount()));
            countModified.setText(String.valueOf(res.getModifiedCount()));

            btnCompare.setDisable(false);
            progressBar.setVisible(false);
            btnExportCsv.setDisable(masterItems.isEmpty());
            btnExportJson.setDisable(masterItems.isEmpty());
            btnSafeCopy.setDisable(res.getMissingCount() == 0);

            statusProgressLabel.setText(String.format("Comparison complete: %d total files analyzed.", res.getRecords().size()));
            updateTableFilter();
        });

        task.setOnFailed(e -> {
            btnCompare.setDisable(false);
            progressBar.setVisible(false);
            statusProgressLabel.setText("Comparison failed: " + task.getException().getMessage());
        });

        Thread t = new Thread(task, "archive-compare-engine");
        t.setDaemon(true);
        t.start();
    }

    private void handleSafeCopy() {
        if (folderB == null) return;
        List<CompareRecord> missingItems = masterItems.stream()
                .filter(i -> i.getDiffType() == DiffType.MISSING_IN_B && i.getFileA() != null)
                .toList();

        if (missingItems.isEmpty()) {
            Alert alert = new Alert(Alert.AlertType.INFORMATION, "No missing files found to copy into Backup Collection.", ButtonType.OK);
            alert.show();
            return;
        }

        Alert confirm = new Alert(Alert.AlertType.CONFIRMATION);
        confirm.setTitle("Safe File Restoration");
        confirm.setHeaderText(String.format("Restore %d missing files to Backup Collection?", missingItems.size()));
        confirm.setContentText("This will copy missing files from Original into their corresponding folder paths in Backup.\nExisting files in Backup will NEVER be overwritten.");

        Optional<ButtonType> opt = confirm.showAndWait();
        if (opt.isPresent() && opt.get() == ButtonType.OK) {
            try {
                int copied = compareService.safeCopyMissing(missingItems, folderB.toPath());
                Alert info = new Alert(Alert.AlertType.INFORMATION, String.format("Successfully restored %d files into Backup.", copied), ButtonType.OK);
                info.show();
                runComparison();
            } catch (Exception ex) {
                Alert error = new Alert(Alert.AlertType.ERROR, "Safe restoration error: " + ex.getMessage(), ButtonType.OK);
                error.show();
            }
        }
    }

    private void exportToCsv() {
        if (filteredItems.isEmpty()) return;
        FileChooser chooser = new FileChooser();
        chooser.setTitle("Save Comparison Report CSV");
        chooser.getExtensionFilters().add(new FileChooser.ExtensionFilter("CSV File (*.csv)", "*.csv"));
        chooser.setInitialFileName("collection_compare_report.csv");
        File dest = chooser.showSaveDialog(stage);
        if (dest != null) {
            try (PrintWriter pw = new PrintWriter(dest, StandardCharsets.UTF_8)) {
                pw.write(compareService.exportCsv(filteredItems));
            } catch (Exception ignored) {}
        }
    }

    private void exportToJson() {
        if (filteredItems.isEmpty()) return;
        FileChooser chooser = new FileChooser();
        chooser.setTitle("Save Comparison Report JSON");
        chooser.getExtensionFilters().add(new FileChooser.ExtensionFilter("JSON File (*.json)", "*.json"));
        chooser.setInitialFileName("collection_compare_report.json");
        File dest = chooser.showSaveDialog(stage);
        if (dest != null) {
            try (PrintWriter pw = new PrintWriter(dest, StandardCharsets.UTF_8)) {
                pw.write(compareService.exportJson(filteredItems));
            } catch (Exception ignored) {}
        }
    }
}
