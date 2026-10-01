package com.takeoutfix.ui.fx;

import com.takeoutfix.culling.BurstGroup;
import com.takeoutfix.culling.CullingScanService;
import com.takeoutfix.culling.OpenCvBridge;
import com.takeoutfix.restore.infrastructure.NativeExifToolEngine;
import com.takeoutfix.shared.task.CancellationToken;
import javafx.application.Platform;
import javafx.concurrent.Task;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Node;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.stage.DirectoryChooser;
import javafx.stage.Stage;

import java.io.File;
import java.nio.file.Path;
import java.util.List;
import java.util.function.Consumer;

/**
 * AI Photo Picker workspace — Phase 1 scaffold.
 * Provides folder selection, scan trigger with pause/cancel, and a summary list of detected burst groups.
 * Uses only existing CSS classes from takeoutfix-dark.css / takeoutfix-light.css — no theme changes.
 *
 * Full three-panel UI (contact sheet + quality panel + ranking) is built in Phase 3.
 */
public class PhotoCullingView extends VBox {

    private final Stage stage;
    private final NativeExifToolEngine exifEngine;
    private final Consumer<WorkspaceType> onNavigate;

    private final Label folderLabel   = new Label("No folder selected");
    private final Button btnChoose    = new Button("Choose Folder");
    private final Button btnScan      = new Button("Scan for Bursts");
    private final Button btnPause     = new Button("Pause");
    private final Button btnCancel    = new Button("Cancel");
    private final ProgressBar progress = new ProgressBar(0);
    private final Label statusLabel   = new Label("");
    private final VBox  resultsBox    = new VBox(8);
    private final ScrollPane scroller  = new ScrollPane(resultsBox);

    private Path selectedDir;
    private volatile CancellationToken currentToken;
    private Thread scanThread;

    public PhotoCullingView(Stage stage, NativeExifToolEngine exifEngine, Consumer<WorkspaceType> onNavigate) {
        this.stage = stage;
        this.exifEngine = exifEngine;
        this.onNavigate = onNavigate;
        getStyleClass().add("workspace-content");
        setPadding(new Insets(24));
        setSpacing(16);
        setFillWidth(true);
        buildUI();
    }

    // ------------------------------------------------------------------
    // Layout
    // ------------------------------------------------------------------

    private void buildUI() {
        // ── Page header ──────────────────────────────────────────────────
        Label title = new Label("AI Photo Picker");
        title.getStyleClass().add("page-title");

        Label subtitle = new Label("Group burst shots and find the best keeper — 100% local, no cloud.");
        subtitle.getStyleClass().addAll("page-description", "text-muted");
        subtitle.setWrapText(true);

        // ── Folder picker card ───────────────────────────────────────────
        HBox pickerRow = new HBox(10, folderLabel, btnChoose);
        pickerRow.setAlignment(Pos.CENTER_LEFT);
        HBox.setHgrow(folderLabel, Priority.ALWAYS);
        folderLabel.getStyleClass().add("text-muted");
        folderLabel.setMaxWidth(Double.MAX_VALUE);

        btnChoose.getStyleClass().add("btn-secondary");
        btnChoose.setOnAction(e -> chooseFolder());

        // ── Control bar ──────────────────────────────────────────────────
        btnScan.getStyleClass().add("btn-primary");
        btnScan.setDisable(true);
        btnScan.setOnAction(e -> startScan());

        btnPause.getStyleClass().add("btn-secondary");
        btnPause.setVisible(false);
        btnPause.setManaged(false);
        btnPause.setOnAction(e -> togglePause());

        btnCancel.getStyleClass().add("btn-danger");
        btnCancel.setVisible(false);
        btnCancel.setManaged(false);
        btnCancel.setOnAction(e -> cancelScan());

        HBox controlBar = new HBox(8, btnScan, btnPause, btnCancel);
        controlBar.setAlignment(Pos.CENTER_LEFT);

        // ── Progress row ─────────────────────────────────────────────────
        progress.setMaxWidth(Double.MAX_VALUE);
        progress.setVisible(false);
        progress.setManaged(false);
        statusLabel.getStyleClass().add("text-muted");

        VBox progressRow = new VBox(4, progress, statusLabel);

        // ── OpenCV badge ─────────────────────────────────────────────────
        Node cvBadge = buildCvBadge();

        // ── Folder picker + controls card ────────────────────────────────
        VBox scanCard = new VBox(12, pickerRow, controlBar, progressRow);
        scanCard.getStyleClass().add("glass-card");
        scanCard.setPadding(new Insets(16));

        // ── Results area ─────────────────────────────────────────────────
        Label resultsHeader = new Label("Burst Groups");
        resultsHeader.getStyleClass().add("header-title");

        resultsBox.setPadding(new Insets(4));
        scroller.setFitToWidth(true);
        scroller.setPrefHeight(420);
        scroller.getStyleClass().add("edge-to-edge");

        VBox.setVgrow(scroller, Priority.ALWAYS);
        getChildren().addAll(title, subtitle, cvBadge, scanCard, resultsHeader, scroller);
    }

    private Node buildCvBadge() {
        boolean cvAvail = OpenCvBridge.isAvailable();
        Label badge = new Label(cvAvail
                ? "✓  ORB+RANSAC verification enabled (OpenCV)"
                : "⚠  OpenCV not loaded — using stricter dHash fallback (Hamming ≤ 6)");
        badge.getStyleClass().addAll("trust-badge", cvAvail ? "trust-badge-positive" : "trust-badge-warning");
        badge.setPadding(new Insets(4, 10, 4, 10));
        badge.setWrapText(true);
        return badge;
    }

    // ------------------------------------------------------------------
    // Folder chooser
    // ------------------------------------------------------------------

    private void chooseFolder() {
        DirectoryChooser chooser = new DirectoryChooser();
        chooser.setTitle("Select Photo Folder to Scan");
        File dir = chooser.showDialog(stage);
        if (dir != null && dir.isDirectory()) {
            selectedDir = dir.toPath();
            folderLabel.setText(dir.getAbsolutePath());
            btnScan.setDisable(false);
            resultsBox.getChildren().clear();
            setStatus("");
        }
    }

    // ------------------------------------------------------------------
    // Scan lifecycle
    // ------------------------------------------------------------------

    private void startScan() {
        if (selectedDir == null) return;

        currentToken = new CancellationToken();
        setScanningState(true);
        resultsBox.getChildren().clear();
        setStatus("Scanning…");
        progress.setProgress(ProgressIndicator.INDETERMINATE_PROGRESS);

        CullingScanService service = new CullingScanService(
                exifEngine,
                com.takeoutfix.task.TaskManager.getInstance().getResourceManager().getCpuExecutor());

        Task<List<BurstGroup>> task = new Task<>() {
            @Override
            protected List<BurstGroup> call() throws Exception {
                return service.scan(selectedDir, currentToken);
            }
        };

        task.setOnSucceeded(e -> {
            List<BurstGroup> groups = task.getValue();
            setScanningState(false);
            showResults(groups);
        });

        task.setOnFailed(e -> {
            setScanningState(false);
            Throwable ex = task.getException();
            if (ex instanceof CancellationToken.OperationCancelledException) {
                setStatus("Scan cancelled.");
            } else {
                setStatus("Error: " + (ex != null ? ex.getMessage() : "Unknown error"));
            }
        });

        task.setOnCancelled(e -> {
            setScanningState(false);
            setStatus("Scan cancelled.");
        });

        scanThread = new Thread(task, "culling-scan");
        scanThread.setDaemon(true);
        scanThread.start();
    }

    private void togglePause() {
        if (currentToken == null) return;
        if (currentToken.isPaused()) {
            currentToken.resume();
            btnPause.setText("Pause");
            setStatus("Resuming…");
        } else {
            currentToken.pause();
            btnPause.setText("Resume");
            setStatus("Paused — click Resume to continue.");
        }
    }

    private void cancelScan() {
        if (currentToken != null) currentToken.cancel();
        setStatus("Cancelling…");
    }

    private void setScanningState(boolean scanning) {
        Platform.runLater(() -> {
            btnScan.setDisable(scanning);
            btnChoose.setDisable(scanning);
            btnPause.setVisible(scanning);
            btnPause.setManaged(scanning);
            btnPause.setText("Pause");
            btnCancel.setVisible(scanning);
            btnCancel.setManaged(scanning);
            progress.setVisible(scanning);
            progress.setManaged(scanning);
            if (!scanning) {
                progress.setProgress(1.0);
            }
        });
    }

    // ------------------------------------------------------------------
    // Results rendering
    // ------------------------------------------------------------------

    private void showResults(List<BurstGroup> groups) {
        Platform.runLater(() -> {
            resultsBox.getChildren().clear();
            if (groups.isEmpty()) {
                Label empty = new Label("No burst groups found. Try a folder with repeated shots taken in quick succession.");
                empty.getStyleClass().add("text-muted");
                empty.setWrapText(true);
                resultsBox.getChildren().add(empty);
                setStatus("Scan complete — 0 groups found.");
                return;
            }

            for (BurstGroup group : groups) {
                resultsBox.getChildren().add(buildGroupCard(group));
            }

            setStatus(String.format("Found %d burst group%s across %d photos.",
                    groups.size(), groups.size() == 1 ? "" : "s",
                    groups.stream().mapToInt(BurstGroup::size).sum()));
        });
    }

    private Node buildGroupCard(BurstGroup group) {
        // Group label
        Label groupTitle = new Label(
                String.format("Burst (%d photos) — %s … %s",
                        group.size(),
                        group.getPhotos().get(0).getFile().getName(),
                        group.getPhotos().get(group.size() - 1).getFile().getName()));
        groupTitle.getStyleClass().add("header-title");

        // Member list (filenames)
        VBox members = new VBox(2);
        for (int i = 0; i < group.size(); i++) {
            var entry = group.getPhotos().get(i);
            boolean isKeeper = (i == group.getRecommendedIndex());
            Label lbl = new Label((isKeeper ? "★  " : "     ") + entry.getFile().getName()
                    + "  —  " + entry.getFile().getParent());
            lbl.getStyleClass().add(isKeeper ? "text-primary" : "text-muted");
            lbl.setWrapText(true);
            members.getChildren().add(lbl);
        }

        VBox card = new VBox(6, groupTitle, members);
        card.getStyleClass().add("glass-card");
        card.setPadding(new Insets(12));
        return card;
    }

    private void setStatus(String text) {
        Platform.runLater(() -> statusLabel.setText(text));
    }
}
