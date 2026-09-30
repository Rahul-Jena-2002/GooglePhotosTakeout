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
 * Enables photographers to compare, inspect, and synchronize metadata across RAW, JPEG and XMP sidecars.
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
    private final Label kpiStatus = new Label("Ready");

    // Options & Action controls
    private final CheckBox inPlaceBackupCheck = new CheckBox("Edit JPEGs in-place (creates .original backup)");
    private final Label safetyModeLabel = new Label("Non-destructive: Export metadata to a separate destination, leaving source files unchanged.");
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
        VBox.setVgrow(this, Priority.ALWAYS);

        explorerCard = new PairExplorerCard(stage, syncService.getPairingService());

        // 1. Header
        getChildren().add(buildHeaderRow());

        // 2. KPI Cards Row
        getChildren().add(buildKpiRow());

        // 3. Resizable Split: Left Pair Explorer | Right Tag Diff & Sync Panel
        SplitPane splitPane = new SplitPane();
        splitPane.setStyle("-fx-box-border: transparent; -fx-background-color: transparent;");
        VBox.setVgrow(splitPane, Priority.ALWAYS);

        VBox rightColumn = buildRightDiffColumn();

        splitPane.getItems().addAll(explorerCard, rightColumn);
        splitPane.setDividerPositions(0.35);

        getChildren().add(splitPane);

        explorerCard.setOnPairSelected(this::inspectPair);
    }

    private HBox buildHeaderRow() {
        HBox header = new HBox(14);
        header.setAlignment(Pos.CENTER_LEFT);

        VBox titleBox = new VBox(3);
        HBox titleRow = new HBox(10);
        titleRow.setAlignment(Pos.CENTER_LEFT);

        Label title = new Label("Metadata Sync");
        title.setStyle("-fx-font-size: 22px; -fx-font-weight: 700; -fx-text-fill: #E6E7ED;");

        Label badge = new Label("Safe copy enabled");
        badge.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-text-fill: #10B981; -fx-background-color: rgba(16, 185, 129, 0.12); -fx-padding: 3 8 3 8; -fx-background-radius: 6;");

        titleRow.getChildren().addAll(title, badge);

        Label subtitle = new Label("Transfer selected metadata from RAW originals to JPEG or XMP exports.");
        subtitle.setStyle("-fx-font-size: 13px; -fx-text-fill: #989BA8;");
        titleBox.getChildren().addAll(titleRow, subtitle);

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        header.getChildren().addAll(titleBox, spacer);
        return header;
    }

    private HBox buildKpiRow() {
        HBox row = new HBox(12);

        VBox card1 = createNeutralKpiCard("MATCHED PAIRS", kpiPairs, "RAW + JPEG / XMP pairs", "#3B82F6");
        VBox card2 = createNeutralKpiCard("DIFFERENCES", kpiDiffs, "Detected tag differences", "#F59E0B");
        VBox card3 = createNeutralKpiCard("SELECTED TAGS", kpiSelected, "Queued for synchronization", "#9B78F5");
        VBox card4 = createNeutralKpiCard("SYNC STATUS", kpiStatus, "Current engine state", "#10B981");

        HBox.setHgrow(card1, Priority.ALWAYS);
        HBox.setHgrow(card2, Priority.ALWAYS);
        HBox.setHgrow(card3, Priority.ALWAYS);
        HBox.setHgrow(card4, Priority.ALWAYS);

        row.getChildren().addAll(card1, card2, card3, card4);
        return row;
    }

    private VBox createNeutralKpiCard(String title, Label valLabel, String sub, String accentColor) {
        VBox card = new VBox(4);
        card.getStyleClass().add("glass-card");
        card.setStyle("-fx-background-color: #191A22; -fx-border-color: #30313B; -fx-border-radius: 8; -fx-background-radius: 8; -fx-padding: 12 16 12 16;");

        Label t = new Label(title);
        t.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-text-fill: #989BA8; -fx-letter-spacing: 0.5px;");

        valLabel.setStyle(String.format("-fx-font-size: 26px; -fx-font-weight: 800; -fx-text-fill: %s;", accentColor));

        Label s = new Label(sub);
        s.setStyle("-fx-font-size: 12px; -fx-text-fill: #989BA8;");

        card.getChildren().addAll(t, valLabel, s);
        return card;
    }

    private VBox buildRightDiffColumn() {
        VBox col = new VBox(12);
        col.setPadding(new Insets(0, 0, 0, 10));
        VBox.setVgrow(col, Priority.ALWAYS);

        // Diff Table Card
        VBox diffCard = new VBox(10);
        diffCard.getStyleClass().add("glass-card");
        diffCard.setStyle("-fx-background-color: #191A22; -fx-border-color: #30313B; -fx-border-radius: 8; -fx-background-radius: 8; -fx-padding: 14;");
        VBox.setVgrow(diffCard, Priority.ALWAYS);

        // Table toolbar & filter pills
        HBox toolbar = new HBox(8);
        toolbar.setAlignment(Pos.CENTER_LEFT);

        Label tableTitle = new Label("Metadata comparison");
        tableTitle.setStyle("-fx-font-size: 15px; -fx-font-weight: 700; -fx-text-fill: #E6E7ED;");

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        // Filter pills: All, Differences, Missing
        ToggleGroup filterGroup = new ToggleGroup();
        ToggleButton pillAll = createFilterPill("All", "ALL", filterGroup, true);
        ToggleButton pillDiff = createFilterPill("Differences", "DIFFERENCES", filterGroup, false);
        ToggleButton pillMiss = createFilterPill("Missing", "MISSING", filterGroup, false);
        ToggleButton pillMatch = createFilterPill("Matching", "MATCHING", filterGroup, false);

        Button selectAllBtn = new Button("Select Diffs");
        selectAllBtn.getStyleClass().add("btn-ghost");
        selectAllBtn.setStyle("-fx-font-size: 12px;");
        selectAllBtn.setOnAction(e -> {
            diffTable.selectAll(true);
            updateSelectedCount();
        });

        Button clearBtn = new Button("Deselect All");
        clearBtn.getStyleClass().add("btn-ghost");
        clearBtn.setStyle("-fx-font-size: 12px;");
        clearBtn.setOnAction(e -> {
            diffTable.selectAll(false);
            updateSelectedCount();
        });

        toolbar.getChildren().addAll(tableTitle, pillAll, pillDiff, pillMiss, pillMatch, spacer, selectAllBtn, clearBtn);

        VBox.setVgrow(diffTable, Priority.ALWAYS);

        diffCard.getChildren().addAll(toolbar, diffTable);

        // Synchronization Action Card
        VBox actionCard = new VBox(10);
        actionCard.getStyleClass().add("glass-card");
        actionCard.setStyle("-fx-background-color: #191A22; -fx-border-color: #30313B; -fx-border-radius: 8; -fx-background-radius: 8; -fx-padding: 14;");

        HBox safetyHeader = new HBox(8);
        safetyHeader.setAlignment(Pos.CENTER_LEFT);
        Label syncTitle = new Label("Synchronization");
        syncTitle.setStyle("-fx-font-size: 14px; -fx-font-weight: 700; -fx-text-fill: #E6E7ED;");
        Label modeBadge = new Label("Non-destructive");
        modeBadge.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-text-fill: #10B981; -fx-background-color: rgba(16, 185, 129, 0.12); -fx-padding: 2 6 2 6; -fx-background-radius: 4;");
        safetyHeader.getChildren().addAll(syncTitle, modeBadge);

        safetyModeLabel.setStyle("-fx-font-size: 12px; -fx-text-fill: #989BA8;");

        inPlaceBackupCheck.setStyle("-fx-font-size: 12px; -fx-text-fill: #E6E7ED;");
        inPlaceBackupCheck.setOnAction(e -> {
            if (inPlaceBackupCheck.isSelected()) {
                modeBadge.setText("In-Place Editing (.original backup)");
                modeBadge.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-text-fill: #F59E0B; -fx-background-color: rgba(245, 158, 11, 0.12); -fx-padding: 2 6 2 6; -fx-background-radius: 4;");
                safetyModeLabel.setText("Caution: Modifies target files directly. A safe '.original' backup is created before write.");
            } else {
                modeBadge.setText("Non-destructive");
                modeBadge.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-text-fill: #10B981; -fx-background-color: rgba(16, 185, 129, 0.12); -fx-padding: 2 6 2 6; -fx-background-radius: 4;");
                safetyModeLabel.setText("Non-destructive: Export metadata to a separate destination, leaving source files unchanged.");
            }
        });

        HBox btnRow = new HBox(10);
        btnRow.setAlignment(Pos.CENTER_LEFT);

        syncCurrentBtn.getStyleClass().add("btn-primary");
        syncCurrentBtn.setStyle("-fx-font-size: 13px; -fx-padding: 7 16 7 16;");
        syncCurrentBtn.setGraphic(UiIcons.createSvgIcon(UiIcons.PLAY, 13, "currentColor"));
        syncCurrentBtn.setDisable(true);
        syncCurrentBtn.setOnAction(e -> executeSyncCurrent());

        syncAllBtn.getStyleClass().add("btn-secondary");
        syncAllBtn.setStyle("-fx-font-size: 13px; -fx-padding: 7 14 7 14;");
        syncAllBtn.setGraphic(UiIcons.createSvgIcon(UiIcons.SYNC, 13, "currentColor"));
        syncAllBtn.setOnAction(e -> executeSyncBatch());

        statusLabel.setStyle("-fx-font-size: 12px; -fx-text-fill: #989BA8;");

        btnRow.getChildren().addAll(syncCurrentBtn, syncAllBtn, statusLabel);

        progressBar.setMaxWidth(Double.MAX_VALUE);
        progressBar.setStyle("-fx-pref-height: 4px;");

        actionCard.getChildren().addAll(safetyHeader, safetyModeLabel, inPlaceBackupCheck, btnRow, progressBar);

        col.getChildren().addAll(diffCard, actionCard);
        return col;
    }

    private ToggleButton createFilterPill(String text, String tag, ToggleGroup group, boolean selected) {
        ToggleButton btn = new ToggleButton(text);
        btn.setToggleGroup(group);
        btn.setSelected(selected);
        btn.setStyle("-fx-font-size: 11px; -fx-padding: 3 8 3 8; -fx-background-radius: 12;");
        btn.setOnAction(e -> {
            if (btn.isSelected()) {
                diffTable.applyFilter(tag);
            } else {
                btn.setSelected(true);
            }
        });
        return btn;
    }

    private void inspectPair(PhotoPair pair) {
        this.activePair = pair;
        if (pair == null) return;

        statusLabel.setText("Inspecting tags for " + pair.getBaseName() + "...");
        kpiStatus.setText("Inspecting");
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
            diffTable.setTagDifferences(pair.getDifferences());
            statusLabel.setText("Comparison complete for " + pair.getBaseName());
            kpiStatus.setText("Ready");
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
            kpiStatus.setText("Error");
            statusLabel.setText("Error reading metadata: " + task.getException().getMessage());
        });

        Thread th = new Thread(task, "MetaSync-Inspect-Worker");
        th.setDaemon(true);
        th.start();
    }

    private void updateSelectedCount() {
        if (diffTable.getAllItems() != null) {
            long count = diffTable.getAllItems().stream().filter(TagDifference::isSelected).count();
            kpiSelected.setText(String.valueOf(count));
        }
    }

    private void executeSyncCurrent() {
        if (activePair == null || !activePair.isPaired()) return;

        boolean inPlace = inPlaceBackupCheck.isSelected();
        File safeOut = new File(activePair.getDestFile().getParentFile(), "MetaSync_Repaired");

        statusLabel.setText("Writing synchronized metadata to " + activePair.getBaseName() + "...");
        kpiStatus.setText("Syncing");
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
            kpiStatus.setText("Completed");
            statusLabel.setText("Successfully synchronized " + activePair.getBaseName() + "!");
            inspectPair(activePair);
            showAlert("Sync Complete", "Successfully synchronized metadata tags for " + activePair.getBaseName() + "!");
        });

        task.setOnFailed(e -> {
            progressBar.setProgress(0.0);
            kpiStatus.setText("Failed");
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
        kpiStatus.setText("Batch Syncing");
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
            kpiStatus.setText("Completed");
            statusLabel.setText("Batch synchronization completed successfully!");
            if (activePair != null) inspectPair(activePair);
            showAlert("Batch Sync Complete", String.format("Batch metadata synchronization completed successfully for %d photo pairs!", pairs.size()));
        });

        task.setOnFailed(e -> {
            progressBar.setProgress(0.0);
            kpiStatus.setText("Failed");
            statusLabel.setText("Batch synchronization error: " + task.getException().getMessage());
        });

        Thread th = new Thread(task, "MetaSync-Batch-Worker");
        th.setDaemon(true);
        th.start();
    }

    private void showAlert(String title, String content) {
        Alert alert = new Alert(Alert.AlertType.INFORMATION, content, ButtonType.OK);
        alert.initOwner(stage);
        alert.setTitle(title);
        alert.setHeaderText(null);
        alert.show();
    }
}
