package com.takeoutfix.ui.fx;

import com.takeoutfix.restore.infrastructure.NativeExifToolEngine;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.*;
import javafx.scene.layout.*;

import java.io.File;

/**
 * Modern JavaFX workspace for application settings, ExifTool engine diagnostics, and concurrency preferences.
 */
public class SettingsView extends VBox {

    public SettingsView(NativeExifToolEngine engine) {
        setSpacing(14);
        setPadding(new Insets(16, 20, 16, 20));

        // Header
        VBox header = new VBox(4);
        Label title = new Label("Preferences & Processing Engine");
        title.getStyleClass().add("card-title");
        Label subtitle = new Label("Configure local ExifTool daemon, concurrency limits, and safety defaults");
        subtitle.getStyleClass().add("card-subtitle");
        header.getChildren().addAll(title, subtitle);
        getChildren().add(header);

        // Settings Cards
        VBox engineCard = new VBox(12);
        engineCard.getStyleClass().add("glass-card");

        Label engineTitle = new Label("ExifTool Engine Status");
        engineTitle.getStyleClass().add("text-primary");

        File bin = engine != null ? engine.getExifToolBinary() : null;
        String statusText = (bin != null && bin.exists())
                ? "Active & Ready: " + bin.getAbsolutePath()
                : "Engine extracting / managed automatically";

        Label binLabel = new Label("Binary Path: " + statusText);
        binLabel.getStyleClass().add("text-secondary");

        int cores = Runtime.getRuntime().availableProcessors();
        Label cpuLabel = new Label(String.format("Available CPU Cores: %d • Parallel Workers: %d",
                cores, Math.max(12, Math.min(32, (int) Math.round(cores * 1.5)))));
        cpuLabel.getStyleClass().add("text-secondary");

        engineCard.getChildren().addAll(engineTitle, binLabel, cpuLabel);

        // Safety Defaults Card
        VBox safetyCard = new VBox(12);
        safetyCard.getStyleClass().add("glass-card");

        Label safetyTitle = new Label("Default Safety Policies");
        safetyTitle.getStyleClass().add("text-primary");

        CheckBox rawImmutableCheck = new CheckBox("Camera RAW files are strictly read-only (enforced by WriteSafetyService)");
        rawImmutableCheck.setSelected(true);
        rawImmutableCheck.setDisable(true); // Locked for safety

        CheckBox backupBeforeWriteCheck = new CheckBox("Automatically create .original backups before modifying destination JPEGs");
        backupBeforeWriteCheck.setSelected(true);

        safetyCard.getChildren().addAll(safetyTitle, rawImmutableCheck, backupBeforeWriteCheck);

        getChildren().addAll(engineCard, safetyCard);
    }
}
