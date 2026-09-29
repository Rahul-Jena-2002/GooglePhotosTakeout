package com.takeoutfix.ui.fx;

import com.takeoutfix.shared.util.AppVersion;
import com.takeoutfix.updates.UpdateCheckerService;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Scene;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.ScrollPane;
import javafx.scene.image.Image;
import javafx.scene.layout.*;
import javafx.scene.text.Text;
import javafx.scene.text.TextFlow;
import javafx.stage.Modality;
import javafx.stage.Stage;
import javafx.stage.StageStyle;

import java.awt.Desktop;
import java.net.URI;

/**
 * Modern JavaFX In-App OTA Update Dialog for TakeoutFix Studio.
 * Matches the shadcn minimal SaaS aesthetic:
 * - Highlights tag & version comparison (Current vs New)
 * - Formatted changelog release notes
 * - One-click OTA installation trigger
 * - GitHub release link
 */
public class FxOtaUpdateDialog extends Stage {

    public FxOtaUpdateDialog(Stage owner, UpdateCheckerService.UpdateInfo updateInfo, Runnable onDismiss) {
        initOwner(owner);
        initModality(Modality.APPLICATION_MODAL);
        initStyle(StageStyle.DECORATED);
        setTitle("TakeoutFix Studio — Software Update Available");
        setResizable(false);
        applyWindowIcons();

        VBox root = new VBox(16);
        root.setPadding(new Insets(24, 28, 20, 28));
        root.getStyleClass().add("card");
        root.setPrefWidth(500);
        root.setPrefHeight(480);

        // 1. Header with Badge & Version
        VBox header = new VBox(6);
        header.setAlignment(Pos.CENTER_LEFT);

        HBox badgeRow = new HBox(6);
        badgeRow.setAlignment(Pos.CENTER_LEFT);

        Label badge = new Label("⚡ UPDATE AVAILABLE");
        badge.setStyle("-fx-font-size: 10px; -fx-font-weight: 800; -fx-text-fill: #10b981; -fx-background-color: rgba(16, 185, 129, 0.15); -fx-padding: 3 8 3 8; -fx-background-radius: 12; -fx-border-color: rgba(16, 185, 129, 0.3); -fx-border-radius: 12;");
        badgeRow.getChildren().add(badge);

        Label title = new Label("TakeoutFix Studio " + (updateInfo != null ? updateInfo.versionTag() : ""));
        title.setStyle("-fx-font-size: 19px; -fx-font-weight: 800;");

        Label sub = new Label("Current Version: v" + AppVersion.getVersion() + " • A new high-performance build is ready.");
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
                : "• Critical performance improvements and high-throughput EXIF engine updates.\n• Batch Photo Studio remediation tools.\n• Seamless local restoration and stability fixes.";

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

        // 3. Action Buttons
        HBox actions = new HBox(10);
        actions.setAlignment(Pos.CENTER_RIGHT);

        Button btnGithub = new Button("View on GitHub ↗");
        btnGithub.getStyleClass().add("btn-ghost");
        btnGithub.setStyle("-fx-font-size: 11px; -fx-font-weight: 600;");
        btnGithub.setOnAction(e -> {
            if (updateInfo != null && updateInfo.htmlUrl() != null) {
                openUrl(updateInfo.htmlUrl());
            }
        });

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        Button btnLater = new Button("Later");
        btnLater.getStyleClass().add("btn-secondary");
        btnLater.setStyle("-fx-font-size: 11px; -fx-font-weight: 600; -fx-padding: 6 14 6 14;");
        btnLater.setOnAction(e -> {
            close();
            if (onDismiss != null) onDismiss.run();
        });

        Button btnInstall = new Button("Install OTA Update");
        btnInstall.getStyleClass().add("btn-primary");
        btnInstall.setStyle("-fx-font-size: 12px; -fx-font-weight: 700; -fx-padding: 6 18 6 18; -fx-background-color: #10b981; -fx-text-fill: white;");
        btnInstall.setOnAction(e -> {
            close();
            if (updateInfo != null) {
                UpdateCheckerService.startOtaDownload(null, updateInfo);
            }
        });

        actions.getChildren().addAll(btnGithub, spacer, btnLater, btnInstall);
        root.getChildren().add(actions);

        Scene scene = new Scene(root);
        setScene(scene);
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
