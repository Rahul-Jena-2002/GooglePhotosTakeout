package com.photovault.ui.fx;

import com.photovault.core.HistoryManager;
import com.photovault.core.HistoryManager.HistoryEntry;
import javafx.beans.property.SimpleStringProperty;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Node;
import javafx.scene.Scene;
import javafx.scene.control.*;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.Region;
import javafx.scene.layout.VBox;
import javafx.stage.Modality;
import javafx.stage.Stage;
import javafx.stage.Window;

import java.util.List;
import java.util.function.BiConsumer;

/**
 * Modal dialog displaying past verification runs and audited directories.
 */
public final class HistoryDialog {

    private HistoryDialog() {}

    public static void show(Window owner, boolean isDark, BiConsumer<String, String> onApplyFolders) {
        Stage dialog = new Stage();
        dialog.initModality(Modality.APPLICATION_MODAL);
        dialog.initOwner(owner);
        dialog.setTitle("Verification History & Checked Folders");

        VBox content = new VBox(14);
        content.setPadding(new Insets(20));
        content.setPrefWidth(850);
        content.setPrefHeight(520);
        content.getStyleClass().add("glass-card");

        // Header Row
        HBox header = new HBox(10);
        header.setAlignment(Pos.CENTER_LEFT);
        Node histIcon = UiIcons.createSvgIcon(UiIcons.HISTORY, 20, "#a855f7");
        Label title = new Label("Past Verification Runs");
        title.getStyleClass().add("text-primary");
        title.setStyle("-fx-font-size: 16px;");

        Region sp = new Region();
        HBox.setHgrow(sp, Priority.ALWAYS);

        List<HistoryEntry> entries = HistoryManager.load();
        Label countBadge = new Label(entries.size() + " RUNS RECORDED");
        countBadge.setStyle("-fx-font-size: 10px; -fx-font-weight: bold; -fx-padding: 3 8 3 8; -fx-background-color: rgba(168, 85, 247, 0.2); -fx-text-fill: #c084fc; -fx-border-color: #a855f7; -fx-border-radius: 6; -fx-background-radius: 6;");

        header.getChildren().addAll(histIcon, title, sp, countBadge);

        Label subtitle = new Label("Audited record of all folders checked and their verification status on this computer. Select an entry to restore folders.");
        subtitle.getStyleClass().add("text-secondary");
        subtitle.setStyle("-fx-font-size: 11px;");

        // Table
        TableView<HistoryEntry> table = new TableView<>();
        table.setColumnResizePolicy(TableView.CONSTRAINED_RESIZE_POLICY);
        VBox.setVgrow(table, Priority.ALWAYS);

        TableColumn<HistoryEntry, String> colDate = new TableColumn<>("Date & Time");
        colDate.setCellValueFactory(c -> new SimpleStringProperty(c.getValue().timestamp()));
        colDate.setPrefWidth(150);

        TableColumn<HistoryEntry, String> colStatus = new TableColumn<>("Result");
        colStatus.setCellValueFactory(c -> new SimpleStringProperty(c.getValue().status()));
        colStatus.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(String item, boolean empty) {
                super.updateItem(item, empty);
                if (empty || item == null) {
                    setText(null);
                    setGraphic(null);
                } else {
                    Label badge = new Label();
                    badge.setStyle("-fx-font-size: 10px; -fx-font-weight: bold; -fx-padding: 2 6 2 6; -fx-background-radius: 4; -fx-border-radius: 4;");
                    if ("VERIFIED".equalsIgnoreCase(item)) {
                        badge.setText("100% MATCH");
                        badge.setStyle(badge.getStyle() + "-fx-background-color: rgba(16, 185, 129, 0.2); -fx-text-fill: #34d399; -fx-border-color: #10b981;");
                    } else if ("ISSUES_FOUND".equalsIgnoreCase(item)) {
                        badge.setText("ISSUES FOUND");
                        badge.setStyle(badge.getStyle() + "-fx-background-color: rgba(239, 68, 68, 0.2); -fx-text-fill: #fca5a5; -fx-border-color: #ef4444;");
                    } else {
                        badge.setText("INCOMPLETE");
                        badge.setStyle(badge.getStyle() + "-fx-background-color: rgba(245, 158, 11, 0.2); -fx-text-fill: #fcd34d; -fx-border-color: #f59e0b;");
                    }
                    setGraphic(badge);
                    setText(null);
                }
            }
        });
        colStatus.setPrefWidth(110);

        TableColumn<HistoryEntry, String> colOrig = new TableColumn<>("Original Folder");
        colOrig.setCellValueFactory(c -> new SimpleStringProperty(c.getValue().originalPath()));
        colOrig.setPrefWidth(210);

        TableColumn<HistoryEntry, String> colBack = new TableColumn<>("Backup Folder");
        colBack.setCellValueFactory(c -> new SimpleStringProperty(c.getValue().backupPath()));
        colBack.setPrefWidth(210);

        TableColumn<HistoryEntry, String> colFiles = new TableColumn<>("Files / Matched");
        colFiles.setCellValueFactory(c -> new SimpleStringProperty(c.getValue().matchedFiles() + " / " + c.getValue().totalFiles()));
        colFiles.setPrefWidth(100);

        TableColumn<HistoryEntry, String> colIssues = new TableColumn<>("Issues");
        colIssues.setCellValueFactory(c -> new SimpleStringProperty(String.valueOf(c.getValue().issueCount())));
        colIssues.setPrefWidth(60);

        table.getColumns().addAll(colDate, colStatus, colOrig, colBack, colFiles, colIssues);
        ObservableList<HistoryEntry> data = FXCollections.observableArrayList(entries);
        table.setItems(data);

        Label emptyMsg = new Label("No verification history yet. Run a verification check to record results.");
        emptyMsg.getStyleClass().add("text-muted");
        table.setPlaceholder(emptyMsg);

        // Actions Bottom Bar
        HBox bottomBar = new HBox(10);
        bottomBar.setAlignment(Pos.CENTER_LEFT);

        Button useFoldersBtn = new Button("Use Selected Folders");
        useFoldersBtn.getStyleClass().add("btn-primary");
        useFoldersBtn.setDisable(true);

        table.getSelectionModel().selectedItemProperty().addListener((obs, oldV, newV) -> {
            useFoldersBtn.setDisable(newV == null);
        });

        useFoldersBtn.setOnAction(e -> {
            HistoryEntry selected = table.getSelectionModel().getSelectedItem();
            if (selected != null) {
                if (onApplyFolders != null) {
                    onApplyFolders.accept(selected.originalPath(), selected.backupPath());
                }
                dialog.close();
            }
        });

        Button clearHistoryBtn = new Button("Clear History");
        clearHistoryBtn.getStyleClass().add("btn-secondary");
        clearHistoryBtn.setOnAction(e -> {
            Alert confirm = new Alert(Alert.AlertType.CONFIRMATION, "Are you sure you want to clear all verification history?", ButtonType.YES, ButtonType.NO);
            confirm.setTitle("Clear History");
            confirm.showAndWait().ifPresent(res -> {
                if (res == ButtonType.YES) {
                    HistoryManager.clear();
                    data.clear();
                    countBadge.setText("0 RUNS RECORDED");
                }
            });
        });

        Region bottomSpacer = new Region();
        HBox.setHgrow(bottomSpacer, Priority.ALWAYS);

        Button closeBtn = new Button("Close");
        closeBtn.getStyleClass().add("btn-secondary");
        closeBtn.setOnAction(e -> dialog.close());

        bottomBar.getChildren().addAll(useFoldersBtn, clearHistoryBtn, bottomSpacer, closeBtn);

        content.getChildren().addAll(header, subtitle, table, bottomBar);

        Scene s = new Scene(content);
        String css = isDark ? "/css/photovault-dark.css" : "/css/photovault-light.css";
        var res = HistoryDialog.class.getResource(css);
        if (res != null) s.getStylesheets().add(res.toExternalForm());

        dialog.setScene(s);
        dialog.showAndWait();
    }
}
