package com.takeoutfix.ui.fx;

import com.takeoutfix.shared.util.AppVersion;
import com.takeoutfix.updates.UpdateCheckerService;
import com.takeoutfix.updates.UpdateDownloader;
import com.takeoutfix.updates.UpdateInstaller;
import com.takeoutfix.updates.UpdateVerifier;
import javafx.application.Platform;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Scene;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.ProgressBar;
import javafx.scene.control.ScrollPane;
import javafx.scene.image.Image;
import javafx.scene.layout.*;
import javafx.scene.text.Text;
import javafx.scene.text.TextFlow;
import javafx.stage.Modality;
import javafx.stage.Stage;
import javafx.stage.StageStyle;

import java.awt.Desktop;
import java.io.File;
import java.net.URI;
import java.util.Locale;

/**
 * Modern JavaFX In-App OTA Update Dialog for TakeoutFix.
 * Implements the full background download, SHA-256 verification, and external installer restart flow.
 *
 * Safe engineering policy: OTA updates only modify application binaries.
 * User photo libraries, duplicate quarantine vaults, metadata backups, and user settings
 * in ~/.takeoutfix remain completely untouched.
 */
public class FxOtaUpdateDialog extends Stage {

    private final UpdateCheckerService.UpdateInfo updateInfo;
    private final UpdateDownloader downloader = new UpdateDownloader();

    private File downloadedFile = null;
    private boolean isDownloading = false;

    // UI Controls
    private final VBox downloadProgressBox = new VBox(8);
    private final ProgressBar progressBar = new ProgressBar(0);
    private final Label progressStatusLabel = new Label("Downloading update... 0%");
    private final Label speedLabel = new Label("");
    private final Button btnPrimaryAction = new Button("Download & Install Update");
    private final Button btnLater = new Button("Later");
    private final Button btnGithub = new Button("View on GitHub ↗");

    public FxOtaUpdateDialog(Stage owner, UpdateCheckerService.UpdateInfo updateInfo, Runnable onDismiss) {
        this.updateInfo = updateInfo;

        initOwner(owner);
        initModality(Modality.APPLICATION_MODAL);
        initStyle(StageStyle.DECORATED);
        setTitle("TakeoutFix Software Update");
        setResizable(false);
        applyWindowIcons();

        VBox root = new VBox(16);
        root.setPadding(new Insets(24, 28, 20, 28));
        root.getStyleClass().add("card");
        root.setPrefWidth(520);
        root.setPrefHeight(490);

        // 1. Header with Badge & Version
        VBox header = new VBox(6);
        header.setAlignment(Pos.CENTER_LEFT);

        HBox badgeRow = new HBox(8);
        badgeRow.setAlignment(Pos.CENTER_LEFT);

        Label badge = new Label("⚡ A NEW VERSION IS AVAILABLE");
        badge.setStyle("-fx-font-size: 10px; -fx-font-weight: 800; -fx-text-fill: #10b981; -fx-background-color: rgba(16, 185, 129, 0.15); -fx-padding: 3 8 3 8; -fx-background-radius: 12; -fx-border-color: rgba(16, 185, 129, 0.3); -fx-border-radius: 12;");

        badgeRow.getChildren().add(badge);

        String verTitle = "TakeoutFix " + (updateInfo != null ? updateInfo.versionTag() : "vNext");
        if (updateInfo != null && updateInfo.sizeBytes() > 0) {
            verTitle += String.format(Locale.US, " · %.0f MB", updateInfo.sizeBytes() / (1024.0 * 1024.0));
        }

        Label title = new Label(verTitle);
        title.setStyle("-fx-font-size: 19px; -fx-font-weight: 800;");

        Label sub = new Label("Current Version: v" + AppVersion.getVersion() + " • Local photo libraries and settings stay untouched");
        sub.setStyle("-fx-font-size: 12px; -fx-text-fill: #71717a;");

        header.getChildren().addAll(badgeRow, title, sub);
        root.getChildren().add(header);

        // 2. Changelog / Release Notes
        VBox notesBox = new VBox(8);
        notesBox.setPadding(new Insets(12, 14, 12, 14));
        notesBox.setStyle("-fx-background-color: rgba(113, 113, 122, 0.06); -fx-border-color: rgba(113, 113, 122, 0.18); -fx-border-radius: 6; -fx-background-radius: 6;");

        Label notesTitle = new Label("What's New in this Release:");
        notesTitle.setStyle("-fx-font-size: 12px; -fx-font-weight: 700;");
        notesBox.getChildren().add(notesTitle);

        TextFlow textFlow = new TextFlow();
        String rawNotes = (updateInfo != null && updateInfo.releaseNotes() != null && !updateInfo.releaseNotes().isBlank())
                ? updateInfo.releaseNotes()
                : "• Bug fixes, improved duplicate detection and UI enhancements.\n• Background task manager and system resource coordinator.\n• High-throughput EXIF engine updates.";

        String[] lines = rawNotes.split("\r?\n");
        for (String line : lines) {
            String trimmed = line.trim();
            if (trimmed.isEmpty()) continue;
            Text lineText;
            if (trimmed.startsWith("#") || trimmed.startsWith("###")) {
                lineText = new Text("\n" + trimmed.replaceFirst("^#+\\s*", "") + "\n");
                lineText.setStyle("-fx-font-weight: bold; -fx-fill: #8b5cf6; -fx-font-size: 12px;");
            } else {
                lineText = new Text(trimmed + "\n");
                lineText.setStyle("-fx-fill: #94a3b8; -fx-font-size: 11px;");
            }
            textFlow.getChildren().add(lineText);
        }

        ScrollPane scrollPane = new ScrollPane(textFlow);
        scrollPane.setFitToWidth(true);
        scrollPane.setStyle("-fx-background-color: transparent; -fx-background: transparent;");
        VBox.setVgrow(scrollPane, Priority.ALWAYS);
        notesBox.getChildren().add(scrollPane);

        VBox.setVgrow(notesBox, Priority.ALWAYS);
        root.getChildren().add(notesBox);

        // 3. Download Progress Box (Hidden until started)
        setupDownloadProgressBox();
        root.getChildren().add(downloadProgressBox);

        // 4. Action Buttons Row
        HBox actions = new HBox(10);
        actions.setAlignment(Pos.CENTER_RIGHT);

        btnGithub.getStyleClass().add("btn-ghost");
        btnGithub.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-cursor: hand;");
        btnGithub.setOnAction(e -> {
            if (updateInfo != null && updateInfo.htmlUrl() != null) {
                openUrl(updateInfo.htmlUrl());
            }
        });

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        btnLater.getStyleClass().add("btn-secondary");
        btnLater.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-padding: 7 16 7 16; -fx-cursor: hand;");
        btnLater.setOnAction(e -> {
            if (isDownloading) {
                downloader.cancel();
            }
            close();
            if (onDismiss != null) onDismiss.run();
        });

        btnPrimaryAction.getStyleClass().add("btn-primary");
        btnPrimaryAction.setStyle("-fx-font-size: 12px; -fx-font-weight: 700; -fx-padding: 7 18 7 18; -fx-background-color: #10b981; -fx-text-fill: white; -fx-cursor: hand;");
        btnPrimaryAction.setOnAction(e -> handlePrimaryAction());

        actions.getChildren().addAll(btnGithub, spacer, btnLater, btnPrimaryAction);
        root.getChildren().add(actions);

        Scene scene = new Scene(root);
        setScene(scene);
    }

    private void setupDownloadProgressBox() {
        downloadProgressBox.setManaged(false);
        downloadProgressBox.setVisible(false);
        downloadProgressBox.setPadding(new Insets(8, 12, 8, 12));
        downloadProgressBox.setStyle("-fx-background-color: rgba(16, 185, 129, 0.08); -fx-border-color: rgba(16, 185, 129, 0.25); -fx-border-radius: 6; -fx-background-radius: 6;");

        HBox labels = new HBox(8);
        labels.setAlignment(Pos.CENTER_LEFT);
        progressStatusLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: 700; -fx-text-fill: #10b981;");
        speedLabel.setStyle("-fx-font-size: 11px; -fx-text-fill: #71717a;");

        Region sp = new Region();
        HBox.setHgrow(sp, Priority.ALWAYS);
        labels.getChildren().addAll(progressStatusLabel, sp, speedLabel);

        progressBar.setMaxWidth(Double.MAX_VALUE);
        progressBar.setStyle("-fx-accent: #10b981; -fx-pref-height: 8px;");

        downloadProgressBox.getChildren().addAll(labels, progressBar);
    }

    private void handlePrimaryAction() {
        if (downloadedFile != null && downloadedFile.exists()) {
            // Already downloaded and verified! Restart to update.
            try {
                UpdateInstaller.launchAndExit(downloadedFile);
            } catch (Exception ex) {
                progressStatusLabel.setText("Failed to launch updater: " + ex.getMessage());
                progressStatusLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: 700; -fx-text-fill: #ef4444;");
            }
            return;
        }

        if (updateInfo == null || updateInfo.downloadUrl() == null || updateInfo.downloadUrl().isBlank()) {
            // Fallback to github releases page if no binary URL
            if (updateInfo != null && updateInfo.htmlUrl() != null) {
                openUrl(updateInfo.htmlUrl());
            }
            close();
            return;
        }

        // Start OTA Background Download
        isDownloading = true;
        downloadProgressBox.setManaged(true);
        downloadProgressBox.setVisible(true);
        btnPrimaryAction.setDisable(true);
        btnPrimaryAction.setText("Downloading...");
        btnLater.setText("Cancel");

        String downloadUrl = updateInfo.downloadUrl();
        String fileName = extractFileName(downloadUrl, updateInfo.versionTag());

        downloader.downloadAsync(downloadUrl, fileName, (read, total, pct, speed) -> {
            Platform.runLater(() -> {
                if (pct >= 0) {
                    progressBar.setProgress(pct);
                    progressStatusLabel.setText(String.format(Locale.US, "Downloading update... %d%%", (int) (pct * 100)));
                } else {
                    progressBar.setProgress(ProgressBar.INDETERMINATE_PROGRESS);
                    progressStatusLabel.setText("Downloading update...");
                }
                if (speed > 0) {
                    speedLabel.setText(String.format(Locale.US, "%.1f MB/s", speed));
                }
            });
        }).thenAccept(file -> {
            Platform.runLater(() -> {
                isDownloading = false;
                // Verify integrity with SHA-256
                progressStatusLabel.setText("Verifying SHA-256 integrity...");
                speedLabel.setText("");
                progressBar.setProgress(ProgressBar.INDETERMINATE_PROGRESS);

                boolean valid = UpdateVerifier.verifyFile(file, updateInfo.sha256());
                if (!valid) {
                    file.delete();
                    progressStatusLabel.setText("SHA-256 verification failed (checksum mismatch).");
                    progressStatusLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: 700; -fx-text-fill: #ef4444;");
                    btnPrimaryAction.setDisable(false);
                    btnPrimaryAction.setText("Retry Download");
                    btnLater.setText("Close");
                    return;
                }

                // Verification passed!
                downloadedFile = file;
                progressBar.setProgress(1.0);
                progressStatusLabel.setText("Update verified & ready to install.");
                progressStatusLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: 700; -fx-text-fill: #10b981;");
                btnPrimaryAction.setDisable(false);
                btnPrimaryAction.setText("Restart to update");
                btnPrimaryAction.setStyle("-fx-font-size: 12px; -fx-font-weight: 800; -fx-padding: 7 20 7 20; -fx-background-color: #8b5cf6; -fx-text-fill: white; -fx-cursor: hand;");
                btnLater.setText("Later");
            });
        }).exceptionally(ex -> {
            Platform.runLater(() -> {
                isDownloading = false;
                progressStatusLabel.setText("Download failed: " + ex.getMessage());
                progressStatusLabel.setStyle("-fx-font-size: 12px; -fx-font-weight: 700; -fx-text-fill: #ef4444;");
                btnPrimaryAction.setDisable(false);
                btnPrimaryAction.setText("Open Release Page ↗");
                btnPrimaryAction.setOnAction(e -> {
                    openUrl(updateInfo.htmlUrl());
                    close();
                });
                btnLater.setText("Close");
            });
            return null;
        });
    }

    private String extractFileName(String url, String tag) {
        try {
            int lastSlash = url.lastIndexOf('/');
            if (lastSlash != -1 && lastSlash < url.length() - 1) {
                String candidate = url.substring(lastSlash + 1);
                if (candidate.contains(".")) {
                    return candidate;
                }
            }
        } catch (Exception ignored) {}
        return "TakeoutFix-" + tag + ".msi";
    }

    private void openUrl(String url) {
        try {
            if (Desktop.isDesktopSupported() && Desktop.getDesktop().isSupported(Desktop.Action.BROWSE)) {
                Desktop.getDesktop().browse(new URI(url));
            }
        } catch (Exception ignored) {}
    }

    private void applyWindowIcons() {
        try {
            var stream = getClass().getResourceAsStream("/icons/icon.png");
            if (stream != null) {
                getIcons().add(new Image(stream));
            }
        } catch (Exception ignored) {}
    }
}
