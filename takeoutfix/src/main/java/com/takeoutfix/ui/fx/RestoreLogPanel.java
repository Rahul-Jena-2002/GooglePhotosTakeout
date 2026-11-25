package com.takeoutfix.ui.fx;

import javafx.application.Platform;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.geometry.Pos;
import javafx.scene.control.*;
import javafx.scene.input.Clipboard;
import javafx.scene.input.ClipboardContent;
import javafx.scene.layout.*;
import javafx.stage.FileChooser;
import javafx.stage.Stage;
import java.io.File;
import java.io.PrintWriter;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.function.BiConsumer;

final class RestoreLogPanel extends VBox {
    private final Stage stage;
    private final BiConsumer<String, String> showAlert;

    // Logs & Diagnostics Model
    private static class LogEntry {
        final String timestamp;
        final String level;
        final String message;

        LogEntry(String level, String message) {
            this.timestamp = LocalTime.now().format(DateTimeFormatter.ofPattern("HH:mm:ss"));
            this.level = level;
            this.message = message;
        }

        @Override
        public String toString() {
            return String.format("[%s] [%s] %s", timestamp, level, message);
        }
    }

    private final List<LogEntry> allLogs = new ArrayList<>();
    private final ObservableList<LogEntry> filteredLogs = FXCollections.observableArrayList();
    private final ListView<LogEntry> logListView = new ListView<>(filteredLogs);
    private final VBox logEmptyStateBox = new VBox(8);

    private String currentLogFilter = "ALL";
    private final TextField logSearchField = new TextField();
    private final Button tabAll = new Button("All (0)");
    private final Button tabRestored = new Button("Restored (0)");
    private final Button tabNeedsReview = new Button("Needs Review (0)");
    private final Button tabFailed = new Button("Failed (0)");

    RestoreLogPanel(Stage stage, BiConsumer<String, String> showAlert) {
        super(6);
        this.stage = stage;
        this.showAlert = showAlert;
        getStyleClass().add("glass-card");
        setStyle("-fx-background-radius: 8; -fx-border-radius: 8; -fx-border-width: 1; -fx-padding: 8 12 8 12;");

        FlowPane topRow = new FlowPane(8, 8);
        topRow.setAlignment(Pos.CENTER_LEFT);

        HBox filterTabs = new HBox(4);
        filterTabs.setAlignment(Pos.CENTER_LEFT);
        styleTabButton(tabAll, "ALL", true);
        styleTabButton(tabRestored, "RESTORED", false);
        styleTabButton(tabNeedsReview, "NEEDS REVIEW", false);
        styleTabButton(tabFailed, "FAILED", false);

        tabAll.setOnAction(e -> setLogFilter("ALL"));
        tabRestored.setOnAction(e -> setLogFilter("RESTORED"));
        tabNeedsReview.setOnAction(e -> setLogFilter("NEEDS_REVIEW"));
        tabFailed.setOnAction(e -> setLogFilter("FAILED"));

        filterTabs.getChildren().addAll(tabAll, tabRestored, tabNeedsReview, tabFailed);

        logSearchField.setPromptText("Filter logs...");
        logSearchField.getStyleClass().add("text-field");
        logSearchField.setStyle("-fx-font-size: 12.5px; -fx-pref-height: 28px; -fx-pref-width: 150px;");
        logSearchField.textProperty().addListener((obs, oldV, newV) -> applyLogFilter());

        Button btnExport = new Button("Export");
        btnExport.getStyleClass().add("btn-ghost");
        btnExport.setGraphic(UiIcons.createSvgIcon(UiIcons.DOWNLOAD, 12, "currentColor"));
        btnExport.setStyle("-fx-font-size: 12.5px; -fx-font-weight: 500; -fx-padding: 4 8 4 8; -fx-cursor: hand;");
        btnExport.setOnAction(e -> exportLogsToFile());

        Button btnCopy = new Button("Copy");
        btnCopy.getStyleClass().add("btn-ghost");
        btnCopy.setGraphic(UiIcons.createSvgIcon(UiIcons.COPY, 12, "currentColor"));
        btnCopy.setStyle("-fx-font-size: 12.5px; -fx-font-weight: 500; -fx-padding: 4 8 4 8; -fx-cursor: hand;");
        btnCopy.setOnAction(e -> copyLogsToClipboard());

        Button btnClear = new Button("Clear");
        btnClear.getStyleClass().add("btn-ghost");
        btnClear.setGraphic(UiIcons.createSvgIcon(UiIcons.TRASH, 12, "currentColor"));
        btnClear.setStyle("-fx-font-size: 12.5px; -fx-font-weight: 500; -fx-padding: 4 8 4 8; -fx-cursor: hand;");
        btnClear.setOnAction(e -> clearLogs());

        topRow.getChildren().addAll(filterTabs, logSearchField, btnExport, btnCopy, btnClear);

        logEmptyStateBox.getStyleClass().add("empty-state-box");
        logEmptyStateBox.setStyle("-fx-background-radius: 6; -fx-border-radius: 6; -fx-border-width: 1; -fx-padding: 18 16 18 16; -fx-alignment: center;");

        StackPane emptyIconCircle = new StackPane();
        emptyIconCircle.setStyle("-fx-background-color: rgba(167, 139, 250, 0.08); -fx-background-radius: 20; -fx-min-width: 40px; -fx-min-height: 40px; -fx-max-width: 40px; -fx-max-height: 40px;");
        emptyIconCircle.getChildren().add(UiIcons.createSvgIcon(UiIcons.TERMINAL, 18, "#A78BFA"));

        Label emptyTitle = new Label("No restoration activity yet");
        emptyTitle.getStyleClass().add("empty-state-title");
        emptyTitle.setStyle("-fx-font-size: 14.5px; -fx-font-weight: 600;");

        Label emptySub = new Label("Activity logs, file matching details, and processing status will appear here when restoration starts.");
        emptySub.getStyleClass().add("empty-state-sub");
        emptySub.setStyle("-fx-font-size: 13px; -fx-text-alignment: center;");

        logEmptyStateBox.getChildren().addAll(emptyIconCircle, emptyTitle, emptySub);

        logListView.getStyleClass().add("list-view");
        logListView.setStyle("-fx-border-radius: 6; -fx-background-radius: 6;");
        logListView.setCellFactory(lv -> new ListCell<>() {
            @Override
            protected void updateItem(LogEntry item, boolean empty) {
                super.updateItem(item, empty);
                if (empty || item == null) {
                    setText(null);
                    setGraphic(null);
                } else {
                    HBox row = new HBox(10);
                    row.setAlignment(Pos.CENTER_LEFT);

                    Label timeLabel = new Label(item.timestamp);
                    timeLabel.getStyleClass().add("timestamp");

                    Label badge = new Label(item.level.toUpperCase());
                    badge.getStyleClass().add("log-badge");
                    if ("SUCCESS".equalsIgnoreCase(item.level)) {
                        badge.getStyleClass().add("log-badge-success");
                    } else if ("ERROR".equalsIgnoreCase(item.level)) {
                        badge.getStyleClass().add("log-badge-error");
                    } else if ("WARN".equalsIgnoreCase(item.level)) {
                        badge.getStyleClass().add("log-badge-warn");
                    } else {
                        badge.getStyleClass().add("log-badge-info");
                    }

                    Label msgLabel = new Label(item.message);
                    msgLabel.getStyleClass().addAll("log-entry", "text-primary");
                    msgLabel.setWrapText(true);
                    HBox.setHgrow(msgLabel, Priority.ALWAYS);

                    row.getChildren().addAll(timeLabel, badge, msgLabel);
                    setGraphic(row);
                    setText(null);
                }
            }
        });

        VBox.setVgrow(logListView, Priority.ALWAYS);
        VBox.setVgrow(logEmptyStateBox, Priority.ALWAYS);

        StackPane contentStack = new StackPane(logEmptyStateBox, logListView);
        contentStack.setPrefHeight(160);
        contentStack.setMinHeight(80);
        VBox.setVgrow(contentStack, Priority.ALWAYS);

        getChildren().addAll(topRow, contentStack);
        updateLogViewVisibility();
    }

    private void updateLogViewVisibility() {
        boolean hasLogs = !allLogs.isEmpty();
        logEmptyStateBox.setVisible(!hasLogs);
        logEmptyStateBox.setManaged(!hasLogs);
        logListView.setVisible(hasLogs);
        logListView.setManaged(hasLogs);
    }

    private void styleTabButton(Button btn, String filterKey, boolean active) {
        btn.getStyleClass().removeAll("log-tab-btn-active");
        if (!btn.getStyleClass().contains("log-tab-btn")) {
            btn.getStyleClass().add("log-tab-btn");
        }
        if (active) {
            btn.getStyleClass().add("log-tab-btn-active");
        }
        btn.setStyle("");
    }

    private void setLogFilter(String filterKey) {
        this.currentLogFilter = filterKey;
        styleTabButton(tabAll, "ALL", "ALL".equals(filterKey));
        styleTabButton(tabRestored, "RESTORED", "RESTORED".equals(filterKey));
        styleTabButton(tabNeedsReview, "NEEDS_REVIEW", "NEEDS_REVIEW".equals(filterKey));
        styleTabButton(tabFailed, "FAILED", "FAILED".equals(filterKey));
        applyLogFilter();
    }

    private void applyLogFilter() {
        String query = logSearchField.getText() != null ? logSearchField.getText().trim().toLowerCase() : "";
        filteredLogs.clear();
        for (LogEntry e : allLogs) {
            boolean matchesCategory = switch (currentLogFilter) {
                case "RESTORED" -> "SUCCESS".equalsIgnoreCase(e.level);
                case "NEEDS_REVIEW" -> "WARN".equalsIgnoreCase(e.level);
                case "FAILED" -> "ERROR".equalsIgnoreCase(e.level);
                default -> true;
            };

            boolean matchesSearch = query.isEmpty() || e.message.toLowerCase().contains(query);
            if (matchesCategory && matchesSearch) {
                filteredLogs.add(e);
            }
        }
        updateLogViewVisibility();
    }

    void appendLog(String level, String message) {
        Platform.runLater(() -> {
            LogEntry entry = new LogEntry(level, message);
            allLogs.add(entry);

            applyLogFilter();
            if (!filteredLogs.isEmpty()) {
                logListView.scrollTo(filteredLogs.size() - 1);
            }

            int allCount = allLogs.size();
            long succCount = allLogs.stream().filter(l -> "SUCCESS".equalsIgnoreCase(l.level)).count();
            long warnCount = allLogs.stream().filter(l -> "WARN".equalsIgnoreCase(l.level)).count();
            long errCount = allLogs.stream().filter(l -> "ERROR".equalsIgnoreCase(l.level)).count();

            tabAll.setText("All (" + allCount + ")");
            tabRestored.setText("Restored (" + succCount + ")");
            tabNeedsReview.setText("Needs Review (" + warnCount + ")");
            tabFailed.setText("Failed (" + errCount + ")");
        });
    }

    private void copyLogsToClipboard() {
        StringBuilder sb = new StringBuilder();
        for (LogEntry e : allLogs) {
            sb.append(e.toString()).append("\n");
        }
        Clipboard clipboard = Clipboard.getSystemClipboard();
        ClipboardContent content = new ClipboardContent();
        content.putString(sb.toString());
        clipboard.setContent(content);
        appendLog("INFO", "Copied " + allLogs.size() + " logs to clipboard.");
    }

    private void exportLogsToFile() {
        FileChooser chooser = new FileChooser();
        chooser.setTitle("Export Diagnostic Logs");
        chooser.setInitialFileName("takeoutfix-restore-log.txt");
        chooser.getExtensionFilters().add(new FileChooser.ExtensionFilter("Text Log (*.txt)", "*.txt"));
        File file = chooser.showSaveDialog(stage);
        if (file != null) {
            try (PrintWriter writer = new PrintWriter(file)) {
                for (LogEntry e : allLogs) {
                    writer.println(e.toString());
                }
                appendLog("SUCCESS", "Diagnostic logs successfully exported to " + file.getName());
            } catch (Exception ex) {
                showAlert.accept("Export Failed", "Could not export logs: " + ex.getMessage());
            }
        }
    }

    private void clearLogs() {
        allLogs.clear();
        filteredLogs.clear();
        tabAll.setText("All (0)");
        tabRestored.setText("Restored (0)");
        tabNeedsReview.setText("Needs Review (0)");
        tabFailed.setText("Failed (0)");
        updateLogViewVisibility();
    }
}
