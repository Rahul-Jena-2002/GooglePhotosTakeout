package com.takeoutfix.ui.fx;

import javafx.application.Platform;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.collections.transformation.FilteredList;
import javafx.collections.transformation.SortedList;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Node;
import javafx.scene.control.*;
import javafx.scene.input.Clipboard;
import javafx.scene.input.ClipboardContent;
import javafx.scene.layout.*;
import javafx.stage.FileChooser;

import java.awt.Desktop;
import java.io.File;
import java.io.PrintWriter;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * Modern JavaFX workspace for Activity History & Operation Audit Records.
 * Parses session and quarantine logs into human-readable structured operation summaries,
 * with search, category filtering, structured details, and theme-adaptive raw log viewer.
 */
public class HistoryView extends VBox {

    public static class ActivityRecord {
        private final String id;
        private final String category; // RESTORE, DEDUP, METASYNC, VAULT, OTHER
        private final String title;
        private final String status;   // Completed, Needs Review, Failed
        private final String statusColor;
        private final String summary;
        private final String timestamp;
        private final String duration;
        private final String sizeText;
        private final File file;
        private final Map<String, String> metrics = new LinkedHashMap<>();
        private String rawContent = "";

        public ActivityRecord(String id, String category, String title, String status, String statusColor,
                              String summary, String timestamp, String duration, String sizeText, File file) {
            this.id = id;
            this.category = category;
            this.title = title;
            this.status = status;
            this.statusColor = statusColor;
            this.summary = summary;
            this.timestamp = timestamp;
            this.duration = duration;
            this.sizeText = sizeText;
            this.file = file;
        }

        public String getId() { return id; }
        public String getCategory() { return category; }
        public String getTitle() { return title; }
        public String getStatus() { return status; }
        public String getStatusColor() { return statusColor; }
        public String getSummary() { return summary; }
        public String getTimestamp() { return timestamp; }
        public String getDuration() { return duration; }
        public String getSizeText() { return sizeText; }
        public File getFile() { return file; }
        public Map<String, String> getMetrics() { return metrics; }
        public String getRawContent() { return rawContent; }
        public void setRawContent(String rawContent) { this.rawContent = rawContent; }
    }

    // KPI Labels
    private final Label kpiTotal = new Label("0");
    private final Label kpiSuccess = new Label("0");
    private final Label kpiReview = new Label("0");

    // Filter controls
    private final TextField searchField = new TextField();
    private String activeCategory = "ALL";
    private final Label recordsBadge = new Label("0 records");

    // Master-Detail Data
    private final ObservableList<ActivityRecord> masterList = FXCollections.observableArrayList();
    private final FilteredList<ActivityRecord> filteredList = new FilteredList<>(masterList, p -> true);
    private final ListView<ActivityRecord> recordListView = new ListView<>();

    // Detail Panel Components
    private final Label detailTitle = new Label("Select an operation record");
    private final Label detailBadge = new Label("—");
    private final Label detailMeta = new Label("Select an activity on the left to inspect structured metrics and logs.");
    private final VBox structuredSummaryPane = new VBox(12);
    private final TextArea rawLogArea = new TextArea();
    private final Button btnCopyLog = new Button("Copy Log");
    private final Button btnExportReport = new Button("Export");
    private final ToggleGroup viewModeGroup = new ToggleGroup();
    private final ToggleButton btnStructuredView = new ToggleButton("Overview");
    private final ToggleButton btnRawView = new ToggleButton("Raw Log");

    private ActivityRecord currentSelectedRecord = null;

    public HistoryView() {
        setSpacing(14);
        setPadding(new Insets(16, 20, 16, 20));
        VBox.setVgrow(this, Priority.ALWAYS);

        // 1. Header
        getChildren().add(buildHeaderRow());

        // 2. KPI Metrics Deck
        getChildren().add(buildKpiCardsDeck());

        // 3. Main Split Pane: Operation Records List | Operation Detail Panel
        HBox mainSplit = new HBox(16);
        VBox.setVgrow(mainSplit, Priority.ALWAYS);

        VBox listColumn = buildListColumn();
        HBox.setHgrow(listColumn, Priority.NEVER);
        listColumn.setPrefWidth(380);

        VBox detailColumn = buildDetailColumn();
        HBox.setHgrow(detailColumn, Priority.ALWAYS);

        mainSplit.getChildren().addAll(listColumn, detailColumn);
        getChildren().add(mainSplit);

        loadActivityHistory();
    }

    private HBox buildHeaderRow() {
        HBox header = new HBox(14);
        header.setAlignment(Pos.CENTER_LEFT);

        VBox titleBox = new VBox(3);
        HBox titleRow = new HBox(10);
        titleRow.setAlignment(Pos.CENTER_LEFT);

        Label title = new Label("Activity History");
        title.setStyle("-fx-font-size: 22px; -fx-font-weight: 700; -fx-text-fill: #E6E7ED;");

        Label badge = new Label("Local audit trail");
        badge.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-text-fill: #10B981; -fx-background-color: rgba(16, 185, 129, 0.12); -fx-padding: 3 8 3 8; -fx-background-radius: 6;");

        titleRow.getChildren().addAll(title, badge);

        Label subtitle = new Label("Review and manage your recent operations.");
        subtitle.setStyle("-fx-font-size: 13px; -fx-text-fill: #989BA8;");
        titleBox.getChildren().addAll(titleRow, subtitle);

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        Button btnRefresh = new Button("Refresh");
        btnRefresh.getStyleClass().add("btn-secondary");
        btnRefresh.setGraphic(UiIcons.createSvgIcon(UiIcons.RELOAD, 13, "currentColor"));
        btnRefresh.setOnAction(e -> loadActivityHistory());

        Button btnOpenFolder = new Button("Open Log Directory");
        btnOpenFolder.getStyleClass().add("btn-secondary");
        btnOpenFolder.setGraphic(UiIcons.createSvgIcon(UiIcons.OUTPUT_FOLDER, 13, "currentColor"));
        btnOpenFolder.setOnAction(e -> openLogsDirectory());

        header.getChildren().addAll(titleBox, spacer, btnRefresh, btnOpenFolder);
        return header;
    }

    private HBox buildKpiCardsDeck() {
        HBox deck = new HBox(12);
        deck.setAlignment(Pos.CENTER_LEFT);

        VBox card1 = createNeutralKpiCard("TOTAL OPERATIONS", kpiTotal, "Recorded sessions", "#E6E7ED");
        VBox card2 = createNeutralKpiCard("SUCCESSFUL", kpiSuccess, "Completed without errors", "#10B981");
        VBox card3 = createNeutralKpiCard("NEEDS REVIEW", kpiReview, "Warnings or skipped items", "#F59E0B");

        HBox.setHgrow(card1, Priority.ALWAYS);
        HBox.setHgrow(card2, Priority.ALWAYS);
        HBox.setHgrow(card3, Priority.ALWAYS);

        deck.getChildren().addAll(card1, card2, card3);
        return deck;
    }

    private VBox createNeutralKpiCard(String labelText, Label valLabel, String subText, String accentColor) {
        VBox card = new VBox(4);
        card.getStyleClass().add("glass-card");
        card.setStyle("-fx-background-color: #191A22; -fx-border-color: #30313B; -fx-border-radius: 8; -fx-background-radius: 8; -fx-padding: 12 16 12 16;");

        Label lbl = new Label(labelText);
        lbl.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-text-fill: #989BA8; -fx-letter-spacing: 0.5px;");

        valLabel.setStyle(String.format("-fx-font-size: 26px; -fx-font-weight: 800; -fx-text-fill: %s;", accentColor));

        Label sub = new Label(subText);
        sub.setStyle("-fx-font-size: 12px; -fx-text-fill: #989BA8;");

        card.getChildren().addAll(lbl, valLabel, sub);
        return card;
    }

    private VBox buildListColumn() {
        VBox col = new VBox(10);
        col.getStyleClass().add("glass-card");
        col.setStyle("-fx-background-color: #191A22; -fx-border-color: #30313B; -fx-border-radius: 8; -fx-background-radius: 8; -fx-padding: 14;");
        VBox.setVgrow(col, Priority.ALWAYS);

        // Header with count badge & search
        HBox topRow = new HBox(8);
        topRow.setAlignment(Pos.CENTER_LEFT);

        Label title = new Label("Operations");
        title.setStyle("-fx-font-size: 15px; -fx-font-weight: 700; -fx-text-fill: #E6E7ED;");

        recordsBadge.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-text-fill: #989BA8; -fx-background-color: #20212B; -fx-padding: 2 8 2 8; -fx-background-radius: 10;");

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        searchField.setPromptText("Search operations...");
        searchField.setStyle("-fx-font-size: 12px; -fx-pref-width: 140px; -fx-background-color: #101116; -fx-text-fill: #E6E7ED; -fx-border-color: #30313B; -fx-border-radius: 6; -fx-background-radius: 6;");
        searchField.textProperty().addListener((obs, oldVal, newVal) -> applyFilter());

        topRow.getChildren().addAll(title, recordsBadge, spacer, searchField);

        // Filter Pills: All, Restore, Duplicate Finder, Metadata Sync, Vault
        HBox filterBar = new HBox(6);
        filterBar.setAlignment(Pos.CENTER_LEFT);
        ToggleGroup filterGroup = new ToggleGroup();
        filterBar.getChildren().addAll(
                createCategoryPill("All", "ALL", filterGroup, true),
                createCategoryPill("Restore", "RESTORE", filterGroup, false),
                createCategoryPill("Duplicates", "DEDUP", filterGroup, false),
                createCategoryPill("Metadata Sync", "METASYNC", filterGroup, false),
                createCategoryPill("Vault", "VAULT", filterGroup, false)
        );

        // Record List
        recordListView.setStyle("-fx-background-color: #101116; -fx-border-color: #30313B; -fx-border-radius: 6; -fx-background-radius: 6;");
        VBox.setVgrow(recordListView, Priority.ALWAYS);

        VBox emptyListPlaceholder = new VBox(6);
        emptyListPlaceholder.setAlignment(Pos.CENTER);
        emptyListPlaceholder.setPadding(new Insets(20));
        Label placeholderTitle = new Label("No operations recorded");
        placeholderTitle.setStyle("-fx-font-size: 13px; -fx-font-weight: 600; -fx-text-fill: #989BA8;");
        Label placeholderSub = new Label("Completed tasks will be recorded here.");
        placeholderSub.setStyle("-fx-font-size: 11px; -fx-text-fill: #6B7280;");
        emptyListPlaceholder.getChildren().addAll(placeholderTitle, placeholderSub);
        recordListView.setPlaceholder(emptyListPlaceholder);

        recordListView.setCellFactory(lv -> new ListCell<>() {
            private final VBox card = new VBox(4);
            private final HBox headerRow = new HBox(8);
            private final Label titleLbl = new Label();
            private final Region spacer = new Region();
            private final Label statusBadge = new Label();
            private final Label summaryLbl = new Label();
            private final Label metaLbl = new Label();

            {
                card.setPadding(new Insets(8, 10, 8, 10));
                headerRow.setAlignment(Pos.CENTER_LEFT);
                HBox.setHgrow(spacer, Priority.ALWAYS);

                titleLbl.setStyle("-fx-font-size: 13px; -fx-font-weight: 700; -fx-text-fill: #E6E7ED;");
                statusBadge.setStyle("-fx-font-size: 10px; -fx-font-weight: 700; -fx-padding: 2 6 2 6; -fx-background-radius: 4;");
                headerRow.getChildren().addAll(titleLbl, spacer, statusBadge);

                summaryLbl.setStyle("-fx-font-size: 12px; -fx-text-fill: #D4D4D8;");
                metaLbl.setStyle("-fx-font-size: 11px; -fx-text-fill: #989BA8;");

                card.getChildren().addAll(headerRow, summaryLbl, metaLbl);
            }

            @Override
            protected void updateItem(ActivityRecord item, boolean empty) {
                super.updateItem(item, empty);
                if (empty || item == null) {
                    setText(null);
                    setGraphic(null);
                } else {
                    titleLbl.setText(item.getTitle());
                    statusBadge.setText(item.getStatus());
                    statusBadge.setStyle(String.format("-fx-font-size: 10px; -fx-font-weight: 700; -fx-padding: 2 6 2 6; -fx-background-radius: 4; -fx-text-fill: %s; -fx-background-color: %s18;", item.getStatusColor(), item.getStatusColor()));

                    summaryLbl.setText(item.getSummary());
                    metaLbl.setText(item.getTimestamp() + " · " + item.getSizeText() + " · " + item.getDuration());

                    setGraphic(card);
                    setText(null);
                }
            }
        });

        recordListView.getSelectionModel().selectedItemProperty().addListener((obs, oldVal, newVal) -> {
            if (newVal != null) {
                displayRecord(newVal);
            }
        });

        SortedList<ActivityRecord> sortedList = new SortedList<>(filteredList);
        recordListView.setItems(sortedList);

        col.getChildren().addAll(topRow, filterBar, recordListView);
        return col;
    }

    private ToggleButton createCategoryPill(String text, String category, ToggleGroup group, boolean selected) {
        ToggleButton btn = new ToggleButton(text);
        btn.setToggleGroup(group);
        btn.setSelected(selected);
        btn.setStyle("-fx-font-size: 11px; -fx-padding: 3 8 3 8; -fx-background-radius: 12;");
        btn.setOnAction(e -> {
            if (btn.isSelected()) {
                activeCategory = category;
                applyFilter();
            } else {
                btn.setSelected(true);
            }
        });
        return btn;
    }

    private void applyFilter() {
        String q = searchField.getText() == null ? "" : searchField.getText().trim().toLowerCase();
        filteredList.setPredicate(rec -> {
            boolean matchesSearch = q.isEmpty()
                    || rec.getTitle().toLowerCase().contains(q)
                    || rec.getSummary().toLowerCase().contains(q)
                    || rec.getFile().getName().toLowerCase().contains(q);
            if (!matchesSearch) return false;

            if ("ALL".equalsIgnoreCase(activeCategory)) return true;
            return activeCategory.equalsIgnoreCase(rec.getCategory());
        });

        recordsBadge.setText(filteredList.size() + " records");
    }

    private VBox buildDetailColumn() {
        VBox col = new VBox(12);
        col.getStyleClass().add("glass-card");
        col.setStyle("-fx-background-color: #191A22; -fx-border-color: #30313B; -fx-border-radius: 8; -fx-background-radius: 8; -fx-padding: 16;");
        VBox.setVgrow(col, Priority.ALWAYS);

        // Header
        HBox headerRow = new HBox(10);
        headerRow.setAlignment(Pos.CENTER_LEFT);

        VBox titleBox = new VBox(2);
        HBox titleSub = new HBox(8);
        titleSub.setAlignment(Pos.CENTER_LEFT);
        detailTitle.setStyle("-fx-font-size: 16px; -fx-font-weight: 700; -fx-text-fill: #E6E7ED;");
        detailBadge.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-padding: 2 8 2 8; -fx-background-radius: 4; -fx-text-fill: #10B981; -fx-background-color: rgba(16, 185, 129, 0.12);");
        titleSub.getChildren().addAll(detailTitle, detailBadge);

        detailMeta.setStyle("-fx-font-size: 12px; -fx-text-fill: #989BA8;");
        titleBox.getChildren().addAll(titleSub, detailMeta);

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        // Segmented View Toggle: Overview vs Raw Log
        btnStructuredView.setToggleGroup(viewModeGroup);
        btnRawView.setToggleGroup(viewModeGroup);
        btnStructuredView.setSelected(true);
        btnStructuredView.setStyle("-fx-font-size: 12px; -fx-padding: 4 10 4 10;");
        btnRawView.setStyle("-fx-font-size: 12px; -fx-padding: 4 10 4 10;");

        HBox toggleBox = new HBox(btnStructuredView, btnRawView);

        btnExportReport.getStyleClass().add("btn-secondary");
        btnExportReport.setGraphic(UiIcons.createSvgIcon(UiIcons.DOWNLOAD, 13, "currentColor"));
        btnExportReport.setOnAction(e -> exportCurrentRecord());

        btnCopyLog.getStyleClass().add("btn-secondary");
        btnCopyLog.setGraphic(UiIcons.createSvgIcon(UiIcons.COPY, 13, "currentColor"));
        btnCopyLog.setOnAction(e -> copyCurrentLog());

        headerRow.getChildren().addAll(titleBox, spacer, toggleBox, btnExportReport, btnCopyLog);

        // Content Area: StackPane switching between Structured and Raw Log
        StackPane contentStack = new StackPane();
        VBox.setVgrow(contentStack, Priority.ALWAYS);

        // Pane 1: Structured Details
        structuredSummaryPane.setSpacing(12);
        VBox.setVgrow(structuredSummaryPane, Priority.ALWAYS);

        // Pane 2: Raw Log Viewer (theme-adaptive styling without hardcoded pale colors)
        rawLogArea.setEditable(false);
        rawLogArea.setWrapText(true);
        rawLogArea.setStyle(
                "-fx-font-family: 'Consolas', 'Courier New', monospace; " +
                "-fx-font-size: 12px; " +
                "-fx-border-color: #30313B; -fx-border-radius: 6; -fx-background-radius: 6;"
        );
        VBox.setVgrow(rawLogArea, Priority.ALWAYS);

        contentStack.getChildren().addAll(structuredSummaryPane, rawLogArea);
        rawLogArea.setVisible(false);

        btnStructuredView.setOnAction(e -> {
            structuredSummaryPane.setVisible(true);
            rawLogArea.setVisible(false);
        });

        btnRawView.setOnAction(e -> {
            structuredSummaryPane.setVisible(false);
            rawLogArea.setVisible(true);
        });

        col.getChildren().addAll(headerRow, new Separator(), contentStack);
        return col;
    }

    private void displayRecord(ActivityRecord rec) {
        this.currentSelectedRecord = rec;

        detailTitle.setText(rec.getTitle());
        detailBadge.setText(rec.getStatus());
        detailBadge.setStyle(String.format("-fx-font-size: 11px; -fx-font-weight: 700; -fx-padding: 2 8 2 8; -fx-background-radius: 4; -fx-text-fill: %s; -fx-background-color: %s18;", rec.getStatusColor(), rec.getStatusColor()));
        detailMeta.setText(String.format("Executed: %s · Size: %s · Duration: %s", rec.getTimestamp(), rec.getSizeText(), rec.getDuration()));

        // Populate Raw Log
        try {
            if (rec.getRawContent().isEmpty() && rec.getFile().exists()) {
                rec.setRawContent(Files.readString(rec.getFile().toPath()));
            }
            rawLogArea.setText(rec.getRawContent());
        } catch (Exception ex) {
            rawLogArea.setText("Error reading log: " + ex.getMessage());
        }

        // Populate Structured Overview
        structuredSummaryPane.getChildren().clear();

        // Summary Card
        VBox sumCard = new VBox(8);
        sumCard.setStyle("-fx-background-color: #20212B; -fx-background-radius: 8; -fx-padding: 14; -fx-border-color: #30313B; -fx-border-radius: 8;");
        Label sumTitle = new Label("Operation Outcome & Overview");
        sumTitle.setStyle("-fx-font-size: 13px; -fx-font-weight: 700; -fx-text-fill: #E6E7ED;");

        Label sumDesc = new Label(rec.getSummary());
        sumDesc.setStyle("-fx-font-size: 13px; -fx-text-fill: #E6E7ED;");

        HBox tagRow = new HBox(8);
        tagRow.getChildren().addAll(
                createTag("Category: " + rec.getCategory(), "#989BA8"),
                createTag("Local Operation", "#10B981"),
                createTag("100% On-Device", "#3B82F6")
        );

        sumCard.getChildren().addAll(sumTitle, sumDesc, tagRow);

        // Metrics Deck
        GridPane grid = new GridPane();
        grid.setHgap(12);
        grid.setVgap(12);

        int colIdx = 0;
        int rowIdx = 0;

        for (Map.Entry<String, String> entry : rec.getMetrics().entrySet()) {
            VBox mBox = new VBox(2);
            mBox.setStyle("-fx-background-color: #20212B; -fx-background-radius: 6; -fx-padding: 10 14 10 14; -fx-border-color: #30313B; -fx-border-radius: 6;");
            Label k = new Label(entry.getKey().toUpperCase());
            k.setStyle("-fx-font-size: 10px; -fx-font-weight: 700; -fx-text-fill: #989BA8;");
            Label v = new Label(entry.getValue());
            v.setStyle("-fx-font-size: 16px; -fx-font-weight: 800; -fx-text-fill: #E6E7ED;");
            mBox.getChildren().addAll(k, v);

            grid.add(mBox, colIdx, rowIdx);
            GridPane.setHgrow(mBox, Priority.ALWAYS);

            colIdx++;
            if (colIdx >= 3) {
                colIdx = 0;
                rowIdx++;
            }
        }

        // File Location Card
        VBox fileCard = new VBox(4);
        fileCard.setStyle("-fx-background-color: #20212B; -fx-background-radius: 6; -fx-padding: 10 12 10 12; -fx-border-color: #30313B; -fx-border-radius: 6;");
        Label fileTitle = new Label("Audit Log Location");
        fileTitle.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-text-fill: #989BA8;");
        Label filePath = new Label(rec.getFile().getAbsolutePath());
        filePath.setStyle("-fx-font-size: 12px; -fx-text-fill: #E6E7ED;");
        fileCard.getChildren().addAll(fileTitle, filePath);

        structuredSummaryPane.getChildren().addAll(sumCard, grid, fileCard);
    }

    private Label createTag(String text, String color) {
        Label l = new Label(text);
        l.setStyle(String.format("-fx-font-size: 11px; -fx-font-weight: 600; -fx-text-fill: %s; -fx-background-color: %s18; -fx-padding: 2 8 2 8; -fx-background-radius: 6;", color, color));
        return l;
    }

    private void loadActivityHistory() {
        masterList.clear();

        // 1. Load structured records from persistent OperationHistoryService
        com.takeoutfix.shared.history.OperationHistoryService historyService =
                new com.takeoutfix.shared.history.OperationHistoryService();
        List<com.takeoutfix.shared.history.OperationHistoryService.OperationRecord> opRecords =
                historyService.loadRecords();
        for (var op : opRecords) {
            masterList.add(mapOpRecordToActivity(op, historyService.getHistoryFile()));
        }

        // 2. Discover independent .log and .txt files (excluding .json database files)
        List<File> logFiles = new ArrayList<>();

        Path dotLogs = Paths.get(System.getProperty("user.home"), ".takeoutfix", "logs");
        if (Files.exists(dotLogs)) {
            File[] files = dotLogs.toFile().listFiles((dir, name) ->
                    name.endsWith(".log") || name.endsWith(".txt"));
            if (files != null) logFiles.addAll(List.of(files));
        }

        Path takeoutLogs = Paths.get(System.getProperty("user.home"), "TakeoutFix", "logs");
        if (Files.exists(takeoutLogs)) {
            File[] files = takeoutLogs.toFile().listFiles((dir, name) ->
                    name.endsWith(".log") || name.endsWith(".txt"));
            if (files != null) logFiles.addAll(List.of(files));
        }

        Path qManifest = Paths.get(System.getProperty("user.home"), "TakeoutFix", "quarantine", "quarantine_manifest.json");
        if (Files.exists(qManifest)) {
            logFiles.add(qManifest.toFile());
        }

        logFiles.sort((a, b) -> Long.compare(b.lastModified(), a.lastModified()));
        for (File f : logFiles) {
            masterList.add(parseFileToRecord(f));
        }

        int totalCount = masterList.size();
        int successCount = 0;
        int reviewCount = 0;

        for (ActivityRecord rec : masterList) {
            if ("Completed".equalsIgnoreCase(rec.getStatus())) {
                successCount++;
            } else {
                reviewCount++;
            }
        }

        kpiTotal.setText(String.valueOf(totalCount));
        kpiSuccess.setText(String.valueOf(successCount));
        kpiReview.setText(String.valueOf(reviewCount));

        applyFilter();

        if (!masterList.isEmpty()) {
            recordListView.getSelectionModel().select(0);
        } else {
            clearDetailPanel();
        }
    }

    private void clearDetailPanel() {
        this.currentSelectedRecord = null;
        detailTitle.setText("No operation selected");
        detailBadge.setText("—");
        detailBadge.setStyle("-fx-font-size: 11px; -fx-font-weight: 700; -fx-padding: 2 8 2 8; -fx-background-radius: 4; -fx-text-fill: #989BA8; -fx-background-color: rgba(152, 155, 168, 0.12);");
        detailMeta.setText("Select an activity on the left or run a tool to inspect structured metrics and logs.");
        structuredSummaryPane.getChildren().clear();
        rawLogArea.clear();

        VBox emptyCard = new VBox(8);
        emptyCard.setAlignment(Pos.CENTER);
        emptyCard.setStyle("-fx-background-color: #20212B; -fx-background-radius: 8; -fx-padding: 30; -fx-border-color: #30313B; -fx-border-radius: 8;");
        Label emptyTitle = new Label("No Operations Recorded Yet");
        emptyTitle.setStyle("-fx-font-size: 14px; -fx-font-weight: 700; -fx-text-fill: #E6E7ED;");
        Label emptyDesc = new Label("When you run operations such as Restore Metadata, Duplicate Cleanup, or Metadata Sync, your local-first audit records and logs will appear here.");
        emptyDesc.setWrapText(true);
        emptyDesc.setStyle("-fx-font-size: 12px; -fx-text-fill: #989BA8; -fx-text-alignment: center;");
        emptyCard.getChildren().addAll(emptyTitle, emptyDesc);
        structuredSummaryPane.getChildren().add(emptyCard);
    }

    private ActivityRecord mapOpRecordToActivity(com.takeoutfix.shared.history.OperationHistoryService.OperationRecord op, File auditFile) {
        String type = op.operationType() != null ? op.operationType() : "Operation";
        String cat = "RESTORE";
        String lower = type.toLowerCase(Locale.ROOT);
        if (lower.contains("dedup") || lower.contains("duplicate") || lower.contains("quarantine")) {
            cat = "DEDUP";
        } else if (lower.contains("meta") || lower.contains("sync")) {
            cat = "METASYNC";
        } else if (lower.contains("vault") || lower.contains("encrypt")) {
            cat = "VAULT";
        }

        String status = "Completed";
        String statusColor = "#10B981";
        if ("FAILED".equalsIgnoreCase(op.status())) {
            status = "Failed";
            statusColor = "#EF4444";
        } else if ("NEEDS_REVIEW".equalsIgnoreCase(op.status()) || "CANCELLED".equalsIgnoreCase(op.status())) {
            status = "Needs Review";
            statusColor = "#F59E0B";
        }

        String summary = (op.summary() != null && !op.summary().isBlank()) ? op.summary() : "Operation completed successfully.";
        String timestamp = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")
                .withZone(ZoneId.systemDefault())
                .format(op.startedAt());

        long durationSec = Math.max(0, java.time.Duration.between(op.startedAt(), op.completedAt()).toSeconds());
        String durationText = durationSec > 0 ? (durationSec + "s") : "< 1s";
        String sizeText = formatDataSize(op.bytesProcessed());

        ActivityRecord rec = new ActivityRecord(
                op.id(), cat, type, status, statusColor, summary, timestamp, durationText, sizeText, auditFile
        );

        rec.getMetrics().put("Items Processed", String.valueOf(op.itemsProcessed()));
        rec.getMetrics().put("Data Processed", sizeText);
        rec.getMetrics().put("Duration", durationText);
        rec.getMetrics().put("Started At", timestamp);
        rec.getMetrics().put("Status", status);

        rec.setRawContent(String.format("{\n  \"id\": \"%s\",\n  \"operation\": \"%s\",\n  \"status\": \"%s\",\n  \"startedAt\": \"%s\",\n  \"completedAt\": \"%s\",\n  \"itemsProcessed\": %d,\n  \"bytesProcessed\": %d,\n  \"summary\": \"%s\"\n}",
                op.id(), type, op.status(), op.startedAt(), op.completedAt(), op.itemsProcessed(), op.bytesProcessed(), summary.replace("\"", "\\\"")));

        return rec;
    }

    private static String formatDataSize(long bytes) {
        if (bytes <= 0) return "0 B";
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1024 * 1024) return String.format("%.1f KB", bytes / 1024.0);
        if (bytes < 1024 * 1024 * 1024) return String.format("%.1f MB", bytes / (1024.0 * 1024.0));
        return String.format("%.2f GB", bytes / (1024.0 * 1024.0 * 1024.0));
    }

    private ActivityRecord parseFileToRecord(File f) {
        String name = f.getName().toLowerCase();
        String cat = "RESTORE";
        String title = "Google Photos Restore";
        String status = "Completed";
        String statusColor = "#10B981";
        String summary = "Operation finished successfully";
        String duration = "—";
        String sizeText = String.format("%.1f KB", f.length() / 1024.0);
        String dateText = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")
                .withZone(ZoneId.systemDefault())
                .format(Instant.ofEpochMilli(f.lastModified()));

        if (name.contains("quarantine") || name.contains("dedup")) {
            cat = "DEDUP";
            title = "Duplicate Scan & Quarantine";
            summary = "Photos scanned and duplicate copies quarantined";
        } else if (name.contains("metasync") || name.contains("sync")) {
            cat = "METASYNC";
            title = "Metadata Synchronization";
            summary = "RAW and JPEG metadata tags synchronized";
        } else if (name.contains("vault") || name.contains("verify") || name.contains("audit")) {
            cat = "VAULT";
            title = "PhotoVault Verification";
            summary = "Bit-for-bit SHA-256 backup audit completed";
        }

        ActivityRecord rec = new ActivityRecord(
                f.getName(), cat, title, status, statusColor, summary, dateText, duration, sizeText, f
        );

        // Read preliminary lines for structured insights
        try {
            List<String> lines = Files.readAllLines(f.toPath());
            rec.getMetrics().put("Log Lines", String.valueOf(lines.size()));
            rec.getMetrics().put("File Size", sizeText);

            long errCount = lines.stream().filter(l -> l.toLowerCase().contains("error") || l.toLowerCase().contains("failed")).count();
            if (errCount > 0) {
                status = "Needs Review";
                statusColor = "#F59E0B";
                rec.getMetrics().put("Warnings/Errors", String.valueOf(errCount));
            } else {
                rec.getMetrics().put("Errors", "0");
            }

            rec.getMetrics().put("Last Modified", dateText);
        } catch (Exception ignored) {
            rec.getMetrics().put("Log Lines", "—");
        }

        return rec;
    }

    private void copyCurrentLog() {
        String text = rawLogArea.getText();
        if (text != null && !text.isEmpty()) {
            Clipboard clipboard = Clipboard.getSystemClipboard();
            ClipboardContent content = new ClipboardContent();
            content.putString(text);
            clipboard.setContent(content);

            btnCopyLog.setText("Copied!");
            new Thread(() -> {
                try { Thread.sleep(1500); } catch (InterruptedException ignored) {}
                Platform.runLater(() -> btnCopyLog.setText("Copy Log"));
            }).start();
        }
    }

    private void exportCurrentRecord() {
        if (currentSelectedRecord == null) return;
        FileChooser fc = new FileChooser();
        fc.setTitle("Export Operation Report");
        fc.setInitialFileName(currentSelectedRecord.getId() + "_Report.txt");
        File target = fc.showSaveDialog(null);
        if (target != null) {
            try (PrintWriter pw = new PrintWriter(target)) {
                pw.println("=================================================");
                pw.println("  TakeoutFix Operation Report");
                pw.println("=================================================");
                pw.println("Title:       " + currentSelectedRecord.getTitle());
                pw.println("Status:      " + currentSelectedRecord.getStatus());
                pw.println("Timestamp:   " + currentSelectedRecord.getTimestamp());
                pw.println("Summary:     " + currentSelectedRecord.getSummary());
                pw.println("Source Log:  " + currentSelectedRecord.getFile().getAbsolutePath());
                pw.println("-------------------------------------------------");
                pw.println("METRICS:");
                for (Map.Entry<String, String> m : currentSelectedRecord.getMetrics().entrySet()) {
                    pw.printf("• %s: %s%n", m.getKey(), m.getValue());
                }
                pw.println("-------------------------------------------------");
                pw.println("RAW LOG CONTENT:");
                pw.println(currentSelectedRecord.getRawContent());
                pw.println("=================================================");

                Alert alert = new Alert(Alert.AlertType.INFORMATION, "Report exported successfully to:\n" + target.getAbsolutePath(), ButtonType.OK);
                alert.show();
            } catch (Exception ex) {
                Alert alert = new Alert(Alert.AlertType.ERROR, "Failed to export report: " + ex.getMessage(), ButtonType.OK);
                alert.show();
            }
        }
    }

    private void openLogsDirectory() {
        Path dotLogs = Paths.get(System.getProperty("user.home"), ".takeoutfix", "logs");
        Path takeoutLogs = Paths.get(System.getProperty("user.home"), "TakeoutFix", "logs");

        Path target = Files.exists(takeoutLogs) ? takeoutLogs : (Files.exists(dotLogs) ? dotLogs : Paths.get(System.getProperty("user.home"), "TakeoutFix"));
        try {
            if (!Files.exists(target)) {
                Files.createDirectories(target);
            }
            Desktop.getDesktop().open(target.toFile());
        } catch (Exception ex) {
            Alert alert = new Alert(Alert.AlertType.ERROR, "Unable to open folder: " + ex.getMessage(), ButtonType.OK);
            alert.show();
        }
    }
}
