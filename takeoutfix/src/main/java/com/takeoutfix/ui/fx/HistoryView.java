package com.takeoutfix.ui.fx;

import javafx.application.Platform;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.*;
import javafx.scene.input.Clipboard;
import javafx.scene.input.ClipboardContent;
import javafx.scene.layout.*;

import java.awt.Desktop;
import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

/**
 * Modern JavaFX workspace for reviewing past Takeout restoration and MetaSync audit history.
 * Shadcn-inspired minimal aesthetic with crisp typography and responsive empty state.
 */
public class HistoryView extends VBox {

    private final ListView<File> historyListView = new ListView<>();
    private final TextArea logDetailArea = new TextArea();
    private final Label currentLogTitle = new Label("Select a session log to inspect");
    private final Label currentLogMeta = new Label("—");
    private final Button btnCopyLog = new Button("Copy Log");
    private final Button btnOpenLogFolder = new Button("Open Log Folder");
    private final Label sessionCountBadge = new Label("0 SESSIONS");

    private final StackPane mainContainer = new StackPane();
    private final VBox emptyStateCard = new VBox(14);
    private final HBox masterDetailPane = new HBox(14);

    public HistoryView() {
        setSpacing(12);
        setPadding(new Insets(14, 18, 14, 18));
        VBox.setVgrow(this, Priority.ALWAYS);

        // 1. Header Row
        getChildren().add(buildHeaderRow());

        // 2. Main Content (Empty State or Master-Detail Pane)
        buildEmptyStateCard();
        buildMasterDetailPane();

        mainContainer.getChildren().addAll(emptyStateCard, masterDetailPane);
        VBox.setVgrow(mainContainer, Priority.ALWAYS);
        getChildren().add(mainContainer);

        loadLocalHistory();
    }

    private HBox buildHeaderRow() {
        HBox header = new HBox(12);
        header.setAlignment(Pos.CENTER_LEFT);

        VBox titleBox = new VBox(2);
        Label title = new Label("OPERATION HISTORY & AUDIT LOGS");
        title.setStyle("-fx-font-size: 15px; -fx-font-weight: 800;");

        Label subtitle = new Label("Review past Takeout restorations, duplicate quarantine actions, and metadata sync logs stored locally on this machine.");
        subtitle.setStyle("-fx-font-size: 11px; -fx-text-fill: #71717a;");
        titleBox.getChildren().addAll(title, subtitle);

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        Button btnRefresh = new Button("Refresh Logs");
        btnRefresh.getStyleClass().add("btn-secondary");
        btnRefresh.setGraphic(UiIcons.createSvgIcon(UiIcons.RELOAD, 12, "currentColor"));
        btnRefresh.setOnAction(e -> loadLocalHistory());

        Button btnOpenFolder = new Button("Open Log Directory");
        btnOpenFolder.getStyleClass().add("btn-secondary");
        btnOpenFolder.setGraphic(UiIcons.createSvgIcon(UiIcons.OUTPUT_FOLDER, 12, "currentColor"));
        btnOpenFolder.setOnAction(e -> openLogsDirectory());

        header.getChildren().addAll(titleBox, spacer, btnRefresh, btnOpenFolder);
        return header;
    }

    private void buildEmptyStateCard() {
        emptyStateCard.setAlignment(Pos.CENTER);
        emptyStateCard.getStyleClass().add("glass-card");
        emptyStateCard.setMaxWidth(600);
        emptyStateCard.setMaxHeight(360);
        emptyStateCard.setPadding(new Insets(32, 28, 32, 28));

        // Circular Icon Badge
        StackPane iconBadge = new StackPane();
        iconBadge.setStyle("-fx-background-color: rgba(139, 92, 246, 0.12); -fx-background-radius: 24; -fx-pref-width: 48px; -fx-pref-height: 48px; -fx-max-width: 48px; -fx-max-height: 48px;");
        var icon = UiIcons.createSvgIcon(UiIcons.HISTORY, 22, "#8b5cf6");
        iconBadge.getChildren().add(icon);

        Label emptyTitle = new Label("No Historical Sessions Recorded Yet");
        emptyTitle.setStyle("-fx-font-size: 15px; -fx-font-weight: 700;");

        Label emptyDesc = new Label("When you run Takeout photo restorations, duplicate quarantine, or MetaSync operations, tamper-evident audit receipts and diagnostic logs will automatically be saved and displayed here.");
        emptyDesc.setWrapText(true);
        emptyDesc.setTextAlignment(javafx.scene.text.TextAlignment.CENTER);
        emptyDesc.setStyle("-fx-font-size: 12px; -fx-text-fill: #71717a; -fx-max-width: 460px;");

        // Informational badges row
        HBox badges = new HBox(8);
        badges.setAlignment(Pos.CENTER);

        Label pillLocal = new Label("● 100% Local Device Storage");
        pillLocal.setStyle("-fx-background-color: rgba(16, 185, 129, 0.12); -fx-text-fill: #10b981; -fx-font-size: 10px; -fx-font-weight: 700; -fx-padding: 3 8 3 8; -fx-background-radius: 12;");

        Label pillPath = new Label("📁 ~/.takeoutfix/logs");
        pillPath.setStyle("-fx-background-color: rgba(113, 113, 122, 0.12); -fx-text-fill: #71717a; -fx-font-size: 10px; -fx-font-weight: 600; -fx-padding: 3 8 3 8; -fx-background-radius: 12;");

        badges.getChildren().addAll(pillLocal, pillPath);

        HBox actions = new HBox(10);
        actions.setAlignment(Pos.CENTER);
        actions.setPadding(new Insets(10, 0, 0, 0));

        Button btnBrowse = new Button("Browse Log Folder");
        btnBrowse.getStyleClass().add("btn-primary");
        btnBrowse.setGraphic(UiIcons.createSvgIcon(UiIcons.OUTPUT_FOLDER, 12, "currentColor"));
        btnBrowse.setOnAction(e -> openLogsDirectory());

        Button btnCheckAgain = new Button("Refresh");
        btnCheckAgain.getStyleClass().add("btn-secondary");
        btnCheckAgain.setGraphic(UiIcons.createSvgIcon(UiIcons.RELOAD, 12, "currentColor"));
        btnCheckAgain.setOnAction(e -> loadLocalHistory());

        actions.getChildren().addAll(btnBrowse, btnCheckAgain);

        emptyStateCard.getChildren().addAll(iconBadge, emptyTitle, emptyDesc, badges, actions);
    }

    private void buildMasterDetailPane() {
        masterDetailPane.setAlignment(Pos.TOP_LEFT);
        VBox.setVgrow(masterDetailPane, Priority.ALWAYS);

        // ── Left Column: Sessions List ──
        VBox leftCol = new VBox(8);
        leftCol.getStyleClass().add("glass-card");
        leftCol.setPrefWidth(340);
        leftCol.setMinWidth(300);
        leftCol.setPadding(new Insets(12, 14, 12, 14));
        VBox.setVgrow(leftCol, Priority.ALWAYS);

        HBox listHeader = new HBox(8);
        listHeader.setAlignment(Pos.CENTER_LEFT);
        Label listTitle = new Label("LOGGED SESSIONS");
        listTitle.setStyle("-fx-font-size: 11px; -fx-font-weight: 800; -fx-text-fill: #71717a;");

        Region lSpacer = new Region();
        HBox.setHgrow(lSpacer, Priority.ALWAYS);

        sessionCountBadge.setStyle("-fx-font-size: 10px; -fx-font-weight: 700; -fx-text-fill: #8b5cf6; -fx-background-color: rgba(139, 92, 246, 0.12); -fx-padding: 2 6 2 6; -fx-background-radius: 10;");
        listHeader.getChildren().addAll(listTitle, lSpacer, sessionCountBadge);

        historyListView.setStyle("-fx-background-color: transparent; -fx-border-color: rgba(113, 113, 122, 0.15); -fx-border-radius: 6;");
        VBox.setVgrow(historyListView, Priority.ALWAYS);

        historyListView.setCellFactory(lv -> new ListCell<>() {
            @Override
            protected void updateItem(File item, boolean empty) {
                super.updateItem(item, empty);
                if (empty || item == null) {
                    setText(null);
                    setGraphic(null);
                } else {
                    HBox cell = new HBox(8);
                    cell.setAlignment(Pos.CENTER_LEFT);

                    var icon = UiIcons.createSvgIcon(UiIcons.HISTORY, 13, "#71717a");

                    VBox info = new VBox(2);
                    Label nameLbl = new Label(item.getName());
                    nameLbl.setStyle("-fx-font-size: 11px; -fx-font-weight: 600;");

                    String sizeStr = String.format("%.1f KB · %s",
                            item.length() / 1024.0,
                            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")
                                    .withZone(ZoneId.systemDefault())
                                    .format(Instant.ofEpochMilli(item.lastModified()))
                    );
                    Label subLbl = new Label(sizeStr);
                    subLbl.setStyle("-fx-font-size: 10px; -fx-text-fill: #71717a;");

                    info.getChildren().addAll(nameLbl, subLbl);
                    cell.getChildren().addAll(icon, info);
                    setGraphic(cell);
                }
            }
        });

        historyListView.getSelectionModel().selectedItemProperty().addListener((obs, oldVal, selectedFile) -> {
            if (selectedFile != null) {
                displaySelectedLog(selectedFile);
            }
        });

        leftCol.getChildren().addAll(listHeader, historyListView);

        // ── Right Column: Receipt & Terminal Log Viewer ──
        VBox rightCol = new VBox(8);
        rightCol.getStyleClass().add("glass-card");
        rightCol.setPadding(new Insets(12, 14, 12, 14));
        HBox.setHgrow(rightCol, Priority.ALWAYS);
        VBox.setVgrow(rightCol, Priority.ALWAYS);

        HBox logHeader = new HBox(10);
        logHeader.setAlignment(Pos.CENTER_LEFT);

        VBox titleBox = new VBox(2);
        currentLogTitle.setStyle("-fx-font-size: 12px; -fx-font-weight: 700;");
        currentLogMeta.setStyle("-fx-font-size: 10px; -fx-text-fill: #71717a;");
        titleBox.getChildren().addAll(currentLogTitle, currentLogMeta);

        Region rSpacer = new Region();
        HBox.setHgrow(rSpacer, Priority.ALWAYS);

        btnCopyLog.getStyleClass().add("btn-secondary");
        btnCopyLog.setGraphic(UiIcons.createSvgIcon(UiIcons.COPY, 12, "currentColor"));
        btnCopyLog.setOnAction(e -> copyCurrentLog());

        logHeader.getChildren().addAll(titleBox, rSpacer, btnCopyLog);

        logDetailArea.setEditable(false);
        logDetailArea.setWrapText(true);
        logDetailArea.setStyle(
                "-fx-control-inner-background: #09090b; " +
                "-fx-background-color: #09090b; " +
                "-fx-text-fill: #e4e4e7; " +
                "-fx-font-family: 'Consolas', 'Courier New', monospace; " +
                "-fx-font-size: 11px; " +
                "-fx-border-color: rgba(113, 113, 122, 0.2); " +
                "-fx-border-radius: 6; -fx-background-radius: 6;"
        );
        VBox.setVgrow(logDetailArea, Priority.ALWAYS);

        rightCol.getChildren().addAll(logHeader, logDetailArea);

        masterDetailPane.getChildren().addAll(leftCol, rightCol);
    }

    private void displaySelectedLog(File f) {
        currentLogTitle.setText(f.getName());
        currentLogMeta.setText(String.format("Size: %.1f KB · Path: %s", f.length() / 1024.0, f.getAbsolutePath()));
        try {
            String content = Files.readString(f.toPath());
            logDetailArea.setText(content);
        } catch (Exception ex) {
            logDetailArea.setText("Error reading log file: " + ex.getMessage());
        }
    }

    private void copyCurrentLog() {
        String text = logDetailArea.getText();
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

    private void loadLocalHistory() {
        historyListView.getItems().clear();

        List<File> logFiles = new ArrayList<>();

        // Check ~/.takeoutfix/logs
        Path dotLogs = Paths.get(System.getProperty("user.home"), ".takeoutfix", "logs");
        if (Files.exists(dotLogs)) {
            File[] files = dotLogs.toFile().listFiles((dir, name) -> name.endsWith(".log") || name.endsWith(".txt") || name.endsWith(".json"));
            if (files != null) logFiles.addAll(List.of(files));
        }

        // Check ~/TakeoutFix/logs
        Path takeoutLogs = Paths.get(System.getProperty("user.home"), "TakeoutFix", "logs");
        if (Files.exists(takeoutLogs)) {
            File[] files = takeoutLogs.toFile().listFiles((dir, name) -> name.endsWith(".log") || name.endsWith(".txt") || name.endsWith(".json"));
            if (files != null) logFiles.addAll(List.of(files));
        }

        // Check ~/TakeoutFix/quarantine manifest
        Path qManifest = Paths.get(System.getProperty("user.home"), "TakeoutFix", "quarantine", "quarantine_manifest.json");
        if (Files.exists(qManifest)) {
            logFiles.add(qManifest.toFile());
        }

        if (logFiles.isEmpty()) {
            emptyStateCard.setVisible(true);
            emptyStateCard.setManaged(true);
            masterDetailPane.setVisible(false);
            masterDetailPane.setManaged(false);
        } else {
            emptyStateCard.setVisible(false);
            emptyStateCard.setManaged(false);
            masterDetailPane.setVisible(true);
            masterDetailPane.setManaged(true);

            // Sort most recent first
            logFiles.sort((a, b) -> Long.compare(b.lastModified(), a.lastModified()));
            historyListView.getItems().setAll(logFiles);
            sessionCountBadge.setText(logFiles.size() + (logFiles.size() == 1 ? " SESSION" : " SESSIONS"));

            historyListView.getSelectionModel().select(0);
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

