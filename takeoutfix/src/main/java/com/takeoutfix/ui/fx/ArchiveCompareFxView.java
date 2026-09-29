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
import javafx.geometry.Pos;
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
import java.util.Iterator;
import java.util.List;
import java.util.Optional;
import java.util.function.Consumer;
import java.util.stream.Stream;

/**
 * Pure JavaFX Archive & Collection Comparison Tool.
 * Delegates comparison and safe-copy operations to ArchiveCompareService.
 */
public class ArchiveCompareFxView extends VBox {

    private final Stage stage;
    private final Consumer<WorkspaceType> onNavigate;
    private final ArchiveCompareService compareService = new ArchiveCompareService();

    private final Label sourceAPathLabel = new Label("No Source A folder selected");
    private final Label sourceBPathLabel = new Label("No Source B folder selected");
    private final Label sourceAStatsLabel = new Label("0 files · 0.0 MB");
    private final Label sourceBStatsLabel = new Label("0 files · 0.0 MB");

    private File folderA = null;
    private File folderB = null;

    // KPI Summary Labels
    private final Label countExact = new Label("0");
    private final Label countMissing = new Label("0");
    private final Label countAdditional = new Label("0");
    private final Label countModified = new Label("0");

    private final Button btnCompare = new Button("Compare Collections");
    private final ProgressBar progressBar = new ProgressBar(0.0);
    private final Label statusProgressLabel = new Label("Ready to compare");
    private final Button btnSafeCopy = new Button("Copy Missing to Source B");

    private final ObservableList<CompareRecord> masterItems = FXCollections.observableArrayList();
    private final FilteredList<CompareRecord> filteredItems = new FilteredList<>(masterItems, p -> true);
    private final TableView<CompareRecord> tableView = new TableView<>(filteredItems);

    private DiffType activeFilter = null; // null represents ALL

    public ArchiveCompareFxView(Stage stage, Consumer<WorkspaceType> onNavigate) {
        this.stage = stage;
        this.onNavigate = onNavigate;

        setSpacing(12);
        setPadding(new Insets(14, 18, 14, 18));
        VBox.setVgrow(this, Priority.ALWAYS);

        // 1. Header
        getChildren().add(buildHeaderRow());

        // 2. Dual Sources Picker Card
        getChildren().add(buildDualPickerCard());

        // 3. KPI Summary Deck
        getChildren().add(buildKpiDeck());

        // 4. Comparison Table Card with Filter Bar & Actions
        VBox tableCard = buildTableCard();
        VBox.setVgrow(tableCard, Priority.ALWAYS);
        getChildren().add(tableCard);
    }

    private HBox buildHeaderRow() {
        HBox header = new HBox(12);
        header.setAlignment(Pos.CENTER_LEFT);

        VBox titleBox = new VBox(2);
        Label title = new Label("COMPARE ARCHIVES");
        title.setStyle("-fx-font-size: 15px; -fx-font-weight: 800;");

        Label subtitle = new Label("Compare photo collections (Original vs Backup) to detect missing, added, modified, or exact matches.");
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

    private VBox buildDualPickerCard() {
        VBox card = new VBox(10);
        card.getStyleClass().add("glass-card");
        card.setPadding(new Insets(12, 14, 12, 14));

        HBox split = new HBox(16);

        // Left Source A
        VBox left = new VBox(6);
        HBox.setHgrow(left, Priority.ALWAYS);
        Label aTitle = new Label("SOURCE A: ORIGINAL PHOTO COLLECTION");
        aTitle.setStyle("-fx-font-size: 10px; -fx-font-weight: 800; -fx-text-fill: #71717a;");

        HBox aRow = new HBox(8);
        aRow.setAlignment(Pos.CENTER_LEFT);
        Button btnBrowseA = new Button("Browse Source A");
        btnBrowseA.getStyleClass().add("btn-primary");
        btnBrowseA.setGraphic(UiIcons.createSvgIcon(UiIcons.FOLDER, 12, "currentColor"));
        btnBrowseA.setOnAction(e -> chooseFolderA());

        sourceAPathLabel.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-text-fill: #71717a;");
        HBox.setHgrow(sourceAPathLabel, Priority.ALWAYS);
        aRow.getChildren().addAll(btnBrowseA, sourceAPathLabel);

        sourceAStatsLabel.setStyle("-fx-font-size: 10px; -fx-text-fill: #71717a;");
        left.getChildren().addAll(aTitle, aRow, sourceAStatsLabel);

        // Right Source B
        VBox right = new VBox(6);
        HBox.setHgrow(right, Priority.ALWAYS);
        Label bTitle = new Label("SOURCE B: BACKUP / EXPORT ARCHIVE");
        bTitle.setStyle("-fx-font-size: 10px; -fx-font-weight: 800; -fx-text-fill: #71717a;");

        HBox bRow = new HBox(8);
        bRow.setAlignment(Pos.CENTER_LEFT);
        Button btnBrowseB = new Button("Browse Source B");
        btnBrowseB.getStyleClass().add("btn-secondary");
        btnBrowseB.setGraphic(UiIcons.createSvgIcon(UiIcons.OUTPUT_FOLDER, 12, "currentColor"));
        btnBrowseB.setOnAction(e -> chooseFolderB());

        sourceBPathLabel.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-text-fill: #71717a;");
        HBox.setHgrow(sourceBPathLabel, Priority.ALWAYS);
        bRow.getChildren().addAll(btnBrowseB, sourceBPathLabel);

        sourceBStatsLabel.setStyle("-fx-font-size: 10px; -fx-text-fill: #71717a;");
        right.getChildren().addAll(bTitle, bRow, sourceBStatsLabel);

        split.getChildren().addAll(left, new Separator(javafx.geometry.Orientation.VERTICAL), right);

        // Compare Action Row
        HBox actRow = new HBox(12);
        actRow.setAlignment(Pos.CENTER_LEFT);

        btnCompare.getStyleClass().add("btn-primary");
        btnCompare.setGraphic(UiIcons.createSvgIcon(UiIcons.DIFF, 13, "currentColor"));
        btnCompare.setOnAction(e -> runComparison());

        progressBar.setProgress(0.0);
        progressBar.setPrefWidth(180);
        progressBar.setVisible(false);

        statusProgressLabel.setStyle("-fx-font-size: 11px; -fx-text-fill: #71717a;");

        actRow.getChildren().addAll(btnCompare, progressBar, statusProgressLabel);
        card.getChildren().addAll(split, new Separator(), actRow);
        return card;
    }

    private HBox buildKpiDeck() {
        HBox deck = new HBox(10);
        deck.setAlignment(Pos.CENTER);

        VBox cExact = createKpiCard("EXACT MATCHES", countExact, "Identical content & hash", "#059669", "rgba(5, 150, 105, 0.08)");
        VBox cMissing = createKpiCard("MISSING IN B", countMissing, "Only present in Source A", "#d97706", "rgba(217, 119, 6, 0.08)");
        VBox cAdd = createKpiCard("ADDITIONAL IN B", countAdditional, "Only present in Source B", "#2563eb", "rgba(37, 99, 235, 0.08)");
        VBox cMod = createKpiCard("MODIFIED / DIFF", countModified, "Same path, different bytes", "#e11d48", "rgba(225, 29, 72, 0.08)");

        HBox.setHgrow(cExact, Priority.ALWAYS);
        HBox.setHgrow(cMissing, Priority.ALWAYS);
        HBox.setHgrow(cAdd, Priority.ALWAYS);
        HBox.setHgrow(cMod, Priority.ALWAYS);

        deck.getChildren().addAll(cExact, cMissing, cAdd, cMod);
        return deck;
    }

    private VBox createKpiCard(String title, Label valLabel, String sub, String accentColor, String bgTint) {
        VBox card = new VBox(3);
        card.getStyleClass().add("glass-card");
        card.setStyle(String.format("-fx-background-color: %s; -fx-border-color: %s; -fx-border-width: 1px; -fx-border-radius: 8; -fx-background-radius: 8; -fx-padding: 12 16 12 16;", bgTint, accentColor));

        Label t = new Label(title);
        t.setStyle(String.format("-fx-font-size: 10px; -fx-font-weight: 800; -fx-text-fill: %s; -fx-letter-spacing: 0.5px;", accentColor));

        valLabel.setStyle(String.format("-fx-font-size: 22px; -fx-font-weight: 800; -fx-text-fill: %s;", accentColor));

        Label s = new Label(sub);
        s.setStyle("-fx-font-size: 10px; -fx-text-fill: #71717a;");

        card.getChildren().addAll(t, valLabel, s);
        return card;
    }

    private VBox buildTableCard() {
        VBox card = new VBox(10);
        card.getStyleClass().add("glass-card");
        card.setPadding(new Insets(10, 12, 10, 12));
        VBox.setVgrow(card, Priority.ALWAYS);

        // Filter Bar & Action buttons
        HBox topRow = new HBox(10);
        topRow.setAlignment(Pos.CENTER_LEFT);

        HBox filterGroup = new HBox(6);
        filterGroup.setAlignment(Pos.CENTER_LEFT);

        Button fAll = createFilterBtn("All", null);
        Button fExact = createFilterBtn("Exact Matches", DiffType.EXACT);
        Button fMissing = createFilterBtn("Missing in B", DiffType.MISSING_IN_B);
        Button fAdd = createFilterBtn("Additional in B", DiffType.ADDITIONAL_IN_B);
        Button fMod = createFilterBtn("Modified", DiffType.MODIFIED);

        filterGroup.getChildren().addAll(fAll, fExact, fMissing, fAdd, fMod);

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        // Safe Copy & Export
        btnSafeCopy.getStyleClass().add("btn-secondary");
        btnSafeCopy.setStyle("-fx-font-size: 11px; -fx-padding: 4 10 4 10;");
        btnSafeCopy.setOnAction(e -> handleSafeCopy());

        Button btnExportCsv = new Button("Export CSV");
        btnExportCsv.getStyleClass().add("btn-ghost");
        btnExportCsv.setStyle("-fx-font-size: 11px; -fx-padding: 4 8 4 8;");
        btnExportCsv.setOnAction(e -> exportToCsv());

        Button btnExportJson = new Button("Export JSON");
        btnExportJson.getStyleClass().add("btn-ghost");
        btnExportJson.setStyle("-fx-font-size: 11px; -fx-padding: 4 8 4 8;");
        btnExportJson.setOnAction(e -> exportToJson());

        topRow.getChildren().addAll(filterGroup, spacer, btnSafeCopy, btnExportCsv, btnExportJson);

        // TableView setup
        TableColumn<CompareRecord, String> pathCol = new TableColumn<>("File Name / Relative Path");
        pathCol.setCellValueFactory(d -> new javafx.beans.property.SimpleStringProperty(d.getValue().getRelativePath()));
        pathCol.setPrefWidth(300);

        TableColumn<CompareRecord, String> aCol = new TableColumn<>("Source A (Original)");
        aCol.setCellValueFactory(d -> new javafx.beans.property.SimpleStringProperty(d.getValue().getSourceAInfo()));
        aCol.setPrefWidth(180);

        TableColumn<CompareRecord, String> bCol = new TableColumn<>("Source B (Backup)");
        bCol.setCellValueFactory(d -> new javafx.beans.property.SimpleStringProperty(d.getValue().getSourceBInfo()));
        bCol.setPrefWidth(180);

        TableColumn<CompareRecord, DiffType> statusCol = new TableColumn<>("Comparison Status");
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
                    Label badge = new Label(item.getLabel());
                    badge.setStyle("-fx-font-size: 10px; -fx-font-weight: 700; -fx-padding: 2 6 2 6; -fx-background-radius: 4;");
                    switch (item) {
                        case EXACT -> badge.setStyle(badge.getStyle() + "; -fx-text-fill: #10b981; -fx-background-color: rgba(16, 185, 129, 0.12);");
                        case MISSING_IN_B -> badge.setStyle(badge.getStyle() + "; -fx-text-fill: #d97706; -fx-background-color: rgba(217, 119, 6, 0.12);");
                        case ADDITIONAL_IN_B -> badge.setStyle(badge.getStyle() + "; -fx-text-fill: #2563eb; -fx-background-color: rgba(37, 99, 235, 0.12);");
                        case MODIFIED -> badge.setStyle(badge.getStyle() + "; -fx-text-fill: #e11d48; -fx-background-color: rgba(225, 29, 72, 0.12);");
                        default -> badge.setStyle(badge.getStyle() + "; -fx-text-fill: #71717a; -fx-background-color: rgba(113, 113, 122, 0.12);");
                    }
                    setGraphic(badge);
                    setText(null);
                }
            }
        });

        tableView.getColumns().clear();
        tableView.getColumns().add(pathCol);
        tableView.getColumns().add(aCol);
        tableView.getColumns().add(bCol);
        tableView.getColumns().add(statusCol);
        tableView.setColumnResizePolicy(TableView.CONSTRAINED_RESIZE_POLICY);
        VBox.setVgrow(tableView, Priority.ALWAYS);

        card.getChildren().addAll(topRow, tableView);
        return card;
    }

    private Button createFilterBtn(String text, DiffType type) {
        Button btn = new Button(text);
        btn.getStyleClass().add("btn-secondary");
        btn.setStyle("-fx-font-size: 10px; -fx-padding: 3 8 3 8;");
        btn.setOnAction(e -> applyFilter(type));
        return btn;
    }

    private void applyFilter(DiffType type) {
        this.activeFilter = type;
        filteredItems.setPredicate(item -> {
            if (type == null) return true;
            return item.getDiffType() == type;
        });
    }

    private void chooseFolderA() {
        DirectoryChooser dc = new DirectoryChooser();
        dc.setTitle("Select Source A: Original Photo Collection");
        File dir = dc.showDialog(stage);
        if (dir != null) {
            folderA = dir;
            sourceAPathLabel.setText(dir.getName() + " (" + dir.getAbsolutePath() + ")");
            scanCollectionQuickStats(dir, sourceAStatsLabel);
        }
    }

    private void chooseFolderB() {
        DirectoryChooser dc = new DirectoryChooser();
        dc.setTitle("Select Source B: Backup / Export Archive");
        File dir = dc.showDialog(stage);
        if (dir != null) {
            folderB = dir;
            sourceBPathLabel.setText(dir.getName() + " (" + dir.getAbsolutePath() + ")");
            scanCollectionQuickStats(dir, sourceBStatsLabel);
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
                    return String.format("%d media files · %.2f GB", count, gb);
                } else {
                    return String.format("%d media files · %.1f MB", count, totalBytes / (1024.0 * 1024.0));
                }
            }
        };
        task.setOnSucceeded(e -> targetLabel.setText(task.getValue()));
        Thread t = new Thread(task, "quick-stats-scanner");
        t.setDaemon(true);
        t.start();
    }

    private void runComparison() {
        if (folderA == null || folderB == null) {
            Alert alert = new Alert(Alert.AlertType.WARNING, "Please select both Source A and Source B collections to run comparison.", ButtonType.OK);
            alert.show();
            return;
        }

        btnCompare.setDisable(true);
        progressBar.setVisible(true);
        progressBar.setProgress(ProgressIndicator.INDETERMINATE_PROGRESS);
        statusProgressLabel.setText("Scanning and indexing collections...");
        masterItems.clear();

        Task<ComparisonResult> task = new Task<>() {
            @Override
            protected ComparisonResult call() throws Exception {
                return compareService.compare(folderA.toPath(), folderB.toPath());
            }
        };

        task.setOnSucceeded(e -> {
            ComparisonResult res = task.getValue();
            masterItems.addAll(res.getRecords());

            countExact.setText(String.valueOf(res.getExactCount()));
            countMissing.setText(String.valueOf(res.getMissingCount()));
            countAdditional.setText(String.valueOf(res.getAdditionalCount()));
            countModified.setText(String.valueOf(res.getModifiedCount()));

            btnCompare.setDisable(false);
            progressBar.setVisible(false);
            statusProgressLabel.setText(String.format("Comparison complete (%d total files compared)", res.getRecords().size()));

            Alert alert = new Alert(Alert.AlertType.INFORMATION);
            alert.initOwner(stage);
            alert.setTitle("Comparison Finished");
            alert.setHeaderText("Archive Comparison Complete");
            alert.setContentText(String.format(
                    "Comparison completed for %d total media items.\n\n"
                    + "• Exact Matches: %d\n"
                    + "• Missing in Backup: %d\n"
                    + "• Additional in Backup: %d\n"
                    + "• Modified Content: %d",
                    res.getRecords().size(),
                    res.getExactCount(),
                    res.getMissingCount(),
                    res.getAdditionalCount(),
                    res.getModifiedCount()
            ));
            alert.show();
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
            Alert alert = new Alert(Alert.AlertType.INFORMATION, "No missing files found to copy into Source B.", ButtonType.OK);
            alert.show();
            return;
        }

        Alert confirm = new Alert(Alert.AlertType.CONFIRMATION);
        confirm.setTitle("Safe Copy Verification");
        confirm.setHeaderText(String.format("Copy %d missing files to Source B?", missingItems.size()));
        confirm.setContentText("This will copy missing files from Source A directly into their matching subdirectories in Source B.\nExisting files in Source B will NEVER be overwritten.");

        Optional<ButtonType> opt = confirm.showAndWait();
        if (opt.isPresent() && opt.get() == ButtonType.OK) {
            try {
                int copied = compareService.safeCopyMissing(missingItems, folderB.toPath());
                Alert info = new Alert(Alert.AlertType.INFORMATION, String.format("Successfully copied %d files into Source B.", copied), ButtonType.OK);
                info.show();
                runComparison();
            } catch (Exception ex) {
                Alert error = new Alert(Alert.AlertType.ERROR, "Safe copy error: " + ex.getMessage(), ButtonType.OK);
                error.show();
            }
        }
    }

    private void exportToCsv() {
        if (masterItems.isEmpty()) return;
        FileChooser chooser = new FileChooser();
        chooser.setTitle("Save Comparison Report CSV");
        chooser.getExtensionFilters().add(new FileChooser.ExtensionFilter("CSV File (*.csv)", "*.csv"));
        chooser.setInitialFileName("collection_compare_report.csv");
        File dest = chooser.showSaveDialog(stage);
        if (dest != null) {
            try (PrintWriter pw = new PrintWriter(dest, StandardCharsets.UTF_8)) {
                pw.write(compareService.exportCsv(masterItems));
            } catch (Exception ignored) {}
        }
    }

    private void exportToJson() {
        if (masterItems.isEmpty()) return;
        FileChooser chooser = new FileChooser();
        chooser.setTitle("Save Comparison Report JSON");
        chooser.getExtensionFilters().add(new FileChooser.ExtensionFilter("JSON File (*.json)", "*.json"));
        chooser.setInitialFileName("collection_compare_report.json");
        File dest = chooser.showSaveDialog(stage);
        if (dest != null) {
            try (PrintWriter pw = new PrintWriter(dest, StandardCharsets.UTF_8)) {
                pw.write(compareService.exportJson(masterItems));
            } catch (Exception ignored) {}
        }
    }
}
