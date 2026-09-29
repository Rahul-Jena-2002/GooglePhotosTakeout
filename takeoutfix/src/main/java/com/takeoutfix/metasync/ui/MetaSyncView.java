package com.takeoutfix.metasync.ui;

import com.takeoutfix.metasync.core.MetadataSyncService;
import com.takeoutfix.metasync.model.PhotoPair;
import com.takeoutfix.metasync.model.TagDifference;
import com.takeoutfix.ui.fx.UiIcons;
import javafx.application.Platform;
import javafx.concurrent.Task;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.stage.Stage;

import java.io.File;
import java.util.List;

/**
 * Modern JavaFX workspace for MetaSync.
 * Enables photographers to compare, copy, and synchronize metadata across RAW, JPEG and XMP sidecars.
 */
public class MetaSyncView extends VBox {

    private final Stage stage;
    private final MetadataSyncService syncService;

    // Components
    private final PairExplorerCard explorerCard;
    private final MetadataDiffTable diffTable = new MetadataDiffTable();

    // KPI Metrics
    private final Label kpiPairs = new Label("0");
    private final Label kpiDiffs = new Label("0");
    private final Label kpiSelected = new Label("0");
    private final Label kpiSafety = new Label("Safe Copy");

    // Options
    private final CheckBox inPlaceBackupCheck = new CheckBox("Edit JPEGs in-place (creates .original backup)");
    private final Button syncCurrentBtn = new Button("Sync Selected Tags");
    private final Button syncAllBtn = new Button("Batch Sync All Pairs");
    private final ProgressBar progressBar = new ProgressBar(0.0);
    private final Label statusLabel = new Label("Select photo folders to begin comparison");

    private PhotoPair activePair;

    public MetaSyncView(Stage stage, MetadataSyncService syncService) {
        this.stage = stage;
        this.syncService = syncService;

        setSpacing(14);
        setPadding(new Insets(16, 20, 16, 20));

        explorerCard = new PairExplorerCard(stage, syncService.getPairingService());

        // 1. KPI Cards Row
        getChildren().add(buildKpiRow());

        // 2. Main Two-Column Workflow
        HBox mainGrid = new HBox(16);
        VBox.setVgrow(mainGrid, Priority.ALWAYS);

        VBox rightColumn = buildRightDiffColumn();
        HBox.setHgrow(rightColumn, Priority.ALWAYS);

        mainGrid.getChildren().addAll(explorerCard, rightColumn);
        getChildren().add(mainGrid);

        explorerCard.setOnPairSelected(this::inspectPair);
    }

    private HBox buildKpiRow() {
        HBox row = new HBox(12);
        VBox card1 = createSemanticKpiCard("Matched Pairs", kpiPairs, "RAW + JPEG / XMP groups", "#2563eb", "rgba(37, 99, 235, 0.08)");
        VBox card2 = createSemanticKpiCard("Tag Differences", kpiDiffs, "Detected tag discrepancies", "#d97706", "rgba(217, 119, 6, 0.08)");
        VBox card3 = createSemanticKpiCard("Selected to Sync", kpiSelected, "Tags queued for transfer", "#7c3aed", "rgba(124, 58, 237, 0.08)");
        VBox card4 = createSemanticKpiCard("Write Safety", kpiSafety, "Safe copy vs in-place", "#059669", "rgba(5, 150, 105, 0.08)");

        HBox.setHgrow(card1, Priority.ALWAYS);
        HBox.setHgrow(card2, Priority.ALWAYS);
        HBox.setHgrow(card3, Priority.ALWAYS);
        HBox.setHgrow(card4, Priority.ALWAYS);

        row.getChildren().addAll(card1, card2, card3, card4);
        return row;
    }

    private VBox createSemanticKpiCard(String labelText, Label valLabel, String subText, String accentColor, String bgTint) {
        VBox card = new VBox(4);
        card.getStyleClass().add("kpi-card");
        card.setStyle(String.format(
                "-fx-background-color: %s; -fx-border-color: %s; -fx-border-width: 1px; -fx-background-radius: 8; -fx-border-radius: 8; -fx-padding: 12 16 12 16;",
                bgTint, accentColor
        ));

        Label lbl = new Label(labelText);
        lbl.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-text-fill: #64748b;");

        valLabel.setStyle(String.format(
                "-fx-font-size: 22px; -fx-font-weight: 800; -fx-text-fill: %s;",
                accentColor
        ));

        Label sub = new Label(subText);
        sub.setStyle("-fx-font-size: 11px; -fx-text-fill: #94a3b8;");

        card.getChildren().addAll(lbl, valLabel, sub);
        return card;
    }

    private VBox buildRightDiffColumn() {
        VBox col = new VBox(12);

        // Diff Table Card
        VBox diffCard = new VBox(10);
        diffCard.getStyleClass().add("glass-card");
        VBox.setVgrow(diffCard, Priority.ALWAYS);

        // Table toolbar
        HBox toolbar = new HBox(10);
        toolbar.setAlignment(Pos.CENTER_LEFT);

        Label tableTitle = new Label("Metadata Tag Comparison");
        tableTitle.getStyleClass().add("card-title");

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        Button selectAllBtn = new Button("Select All Diffs");
        selectAllBtn.getStyleClass().add("btn-ghost");
        selectAllBtn.setOnAction(e -> {
            diffTable.selectAll(true);
            updateSelectedCount();
        });

        Button clearBtn = new Button("Deselect All");
        clearBtn.getStyleClass().add("btn-ghost");
        clearBtn.setOnAction(e -> {
            diffTable.selectAll(false);
            updateSelectedCount();
        });

        toolbar.getChildren().addAll(tableTitle, spacer, selectAllBtn, clearBtn);

        VBox.setVgrow(diffTable, Priority.ALWAYS);

        diffCard.getChildren().addAll(toolbar, diffTable);

        // Action & Sync Card
        VBox actionCard = new VBox(10);
        actionCard.getStyleClass().add("glass-card");

        inPlaceBackupCheck.setOnAction(e -> {
            kpiSafety.setText(inPlaceBackupCheck.isSelected() ? "In-Place Backup" : "Safe Copy");
        });

        syncCurrentBtn.getStyleClass().add("btn-primary");
        syncCurrentBtn.setGraphic(UiIcons.createSvgIcon(UiIcons.PLAY, 14, "currentColor"));
        syncCurrentBtn.setDisable(true);
        syncCurrentBtn.setOnAction(e -> executeSyncCurrent());

        syncAllBtn.getStyleClass().add("btn-secondary");
        syncAllBtn.setGraphic(UiIcons.createSvgIcon(UiIcons.SYNC, 14, "currentColor"));
        syncAllBtn.setOnAction(e -> executeSyncBatch());

        HBox btnRow = new HBox(10, syncCurrentBtn, syncAllBtn);

        progressBar.setMaxWidth(Double.MAX_VALUE);

        actionCard.getChildren().addAll(inPlaceBackupCheck, btnRow, statusLabel, progressBar);

        col.getChildren().addAll(diffCard, actionCard);
        return col;
    }

    private void inspectPair(PhotoPair pair) {
        this.activePair = pair;
        if (pair == null) return;

        statusLabel.setText("Inspecting tags for " + pair.getBaseName() + "...");
        progressBar.setProgress(ProgressIndicator.INDETERMINATE_PROGRESS);

        Task<Void> task = new Task<>() {
            @Override
            protected Void call() {
                syncService.analyzePair(pair);
                return null;
            }
        };

        task.setOnSucceeded(e -> {
            progressBar.setProgress(0.0);
            diffTable.getItems().setAll(pair.getDifferences());
            statusLabel.setText("Comparison complete for " + pair.getBaseName());
            kpiDiffs.setText(String.valueOf(pair.getDifferencesCount()));
            kpiPairs.setText(String.valueOf(explorerCard.getAllPairs().size()));

            for (TagDifference diff : pair.getDifferences()) {
                diff.selectedProperty().addListener((obs, oldV, newV) -> updateSelectedCount());
            }
            updateSelectedCount();

            syncCurrentBtn.setDisable(!pair.isPaired());
        });

        task.setOnFailed(e -> {
            progressBar.setProgress(0.0);
            statusLabel.setText("Error reading metadata: " + task.getException().getMessage());
        });

        Thread th = new Thread(task, "MetaSync-Inspect-Worker");
        th.setDaemon(true);
        th.start();
    }

    private void updateSelectedCount() {
        if (diffTable.getItems() != null) {
            long count = diffTable.getItems().stream().filter(TagDifference::isSelected).count();
            kpiSelected.setText(String.valueOf(count));
        }
    }

    private void executeSyncCurrent() {
        if (activePair == null || !activePair.isPaired()) return;

        boolean inPlace = inPlaceBackupCheck.isSelected();
        File safeOut = new File(activePair.getDestFile().getParentFile(), "MetaSync_Repaired");

        statusLabel.setText("Writing synchronized metadata to " + activePair.getBaseName() + "...");
        progressBar.setProgress(ProgressIndicator.INDETERMINATE_PROGRESS);

        Task<Void> task = new Task<>() {
            @Override
            protected Void call() throws Exception {
                syncService.executeBatchSync(List.of(activePair), inPlace, safeOut);
                return null;
            }
        };

        task.setOnSucceeded(e -> {
            progressBar.setProgress(1.0);
            statusLabel.setText("Successfully synchronized " + activePair.getBaseName() + "!");
            // Re-inspect to confirm match
            inspectPair(activePair);
            showAlert("Sync Complete", "Successfully synchronized metadata tags for " + activePair.getBaseName() + "!");
        });

        task.setOnFailed(e -> {
            progressBar.setProgress(0.0);
            statusLabel.setText("Synchronization failed: " + task.getException().getMessage());
        });

        Thread th = new Thread(task, "MetaSync-Writer-Worker");
        th.setDaemon(true);
        th.start();
    }

    private void executeSyncBatch() {
        List<PhotoPair> pairs = explorerCard.getAllPairs();
        if (pairs.isEmpty()) {
            showAlert("No Pairs", "Please scan and select a folder containing photo pairs first.");
            return;
        }

        boolean inPlace = inPlaceBackupCheck.isSelected();
        File safeOut = pairs.get(0).getDestFile() != null ?
                new File(pairs.get(0).getDestFile().getParentFile(), "MetaSync_Repaired") : null;

        statusLabel.setText("Starting batch synchronization for " + pairs.size() + " pairs...");
        progressBar.setProgress(0.0);

        Task<Void> task = new Task<>() {
            @Override
            protected Void call() {
                for (int i = 0; i < pairs.size(); i++) {
                    PhotoPair p = pairs.get(i);
                    final int currentIdx = i + 1;
                    final int totalPairs = pairs.size();
                    final double progress = (double) currentIdx / totalPairs;
                    Platform.runLater(() -> {
                        statusLabel.setText(String.format("Synchronizing (%d/%d): %s", currentIdx, totalPairs, p.getBaseName()));
                        progressBar.setProgress(progress);
                    });
                    syncService.analyzePair(p);
                    syncService.executeBatchSync(List.of(p), inPlace, safeOut);
                }
                return null;
            }
        };

        task.setOnSucceeded(e -> {
            progressBar.setProgress(1.0);
            statusLabel.setText("Batch synchronization completed successfully!");
            if (activePair != null) inspectPair(activePair);
            showAlert("Batch Sync Complete", String.format("Batch metadata synchronization completed successfully for %d photo pairs!", pairs.size()));
        });

        task.setOnFailed(e -> {
            progressBar.setProgress(0.0);
            statusLabel.setText("Batch synchronization error: " + task.getException().getMessage());
        });

        Thread th = new Thread(task, "MetaSync-Batch-Worker");
        th.setDaemon(true);
        th.start();
    }

    private void showAlert(String title, String content) {
        Alert alert = new Alert(Alert.AlertType.INFORMATION, content, ButtonType.OK);
        alert.setTitle(title);
        alert.setHeaderText(null);
        alert.showAndWait();
    }
}
