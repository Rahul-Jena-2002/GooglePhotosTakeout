package com.photovault.ui.fx;

import javafx.geometry.Pos;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.OverrunStyle;
import javafx.scene.control.Tooltip;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.VBox;
import javafx.stage.DirectoryChooser;
import javafx.stage.Window;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Source and Backup directory selection cards.
 * Displays selected folder paths and real-time disk drive capacity.
 */
public class FolderSelectionCards extends VBox {

    private final Label originalPathLabel;
    private final Label originalCapacityLabel;
    private final Label backupPathLabel;
    private final Label backupCapacityLabel;

    private Path originalPath;
    private Path backupPath;
    private java.util.function.BiConsumer<String, Path> onFolderSelected;

    public void setOnFolderSelected(java.util.function.BiConsumer<String, Path> callback) {
        this.onFolderSelected = callback;
    }

    public FolderSelectionCards(Window ownerWindow) {
        super(10);

        // Card 1: Source (Original)
        VBox srcCard = new VBox(8);
        srcCard.getStyleClass().add("glass-card");

        HBox srcHeader = new HBox(8);
        srcHeader.setAlignment(Pos.CENTER_LEFT);
        Label srcBadge = new Label("SOURCE");
        srcBadge.getStyleClass().add("badge-source");
        Label srcTitle = new Label("Original Photo Library");
        srcTitle.getStyleClass().add("text-primary");
        srcTitle.setStyle("-fx-font-size: 13px; -fx-font-weight: 600;");
        srcHeader.getChildren().addAll(srcBadge, srcTitle);

        Label srcHint = new Label("Primary photo library, Takeout folder, or SD card");
        srcHint.getStyleClass().add("text-muted");
        srcHint.setStyle("-fx-font-size: 11px;");

        HBox srcPathBox = new HBox(8);
        srcPathBox.setAlignment(Pos.CENTER_LEFT);
        srcPathBox.getStyleClass().add("inner-container");

        Button srcBrowseBtn = new Button("Browse...");
        srcBrowseBtn.getStyleClass().add("btn-secondary");
        srcBrowseBtn.setGraphic(UiIcons.createSvgIcon(UiIcons.FOLDER, 13, "#818cf8"));
        srcBrowseBtn.setGraphicTextGap(6);
        srcBrowseBtn.setOnAction(e -> {
            DirectoryChooser chooser = new DirectoryChooser();
            chooser.setTitle("Select Original Photo Directory");
            File dir = chooser.showDialog(ownerWindow);
            if (dir != null) {
                setOriginalPath(dir.toPath());
            }
        });

        originalPathLabel = new Label("No folder selected");
        originalPathLabel.getStyleClass().add("text-secondary");
        originalPathLabel.setStyle("-fx-font-size: 11px;");
        originalPathLabel.setTextOverrun(OverrunStyle.CENTER_ELLIPSIS);
        originalPathLabel.setTooltip(new Tooltip("No folder selected"));
        originalPathLabel.setMaxWidth(Double.MAX_VALUE);
        HBox.setHgrow(originalPathLabel, Priority.ALWAYS);

        srcPathBox.getChildren().addAll(srcBrowseBtn, originalPathLabel);

        originalCapacityLabel = new Label("Drive storage: Not computed");
        originalCapacityLabel.getStyleClass().add("text-muted");
        originalCapacityLabel.setStyle("-fx-font-size: 10px;");

        srcCard.getChildren().addAll(srcHeader, srcHint, srcPathBox, originalCapacityLabel);

        // Card 2: Backup Destination
        VBox bakCard = new VBox(8);
        bakCard.getStyleClass().add("glass-card");

        HBox bakHeader = new HBox(8);
        bakHeader.setAlignment(Pos.CENTER_LEFT);
        Label bakBadge = new Label("BACKUP");
        bakBadge.getStyleClass().add("badge-backup");
        Label bakTitle = new Label("Backup Destination Copy");
        bakTitle.getStyleClass().add("text-primary");
        bakTitle.setStyle("-fx-font-size: 13px; -fx-font-weight: 600;");
        bakHeader.getChildren().addAll(bakBadge, bakTitle);

        Label bakHint = new Label("External SSD, HDD, NAS, or secondary backup disk");
        bakHint.getStyleClass().add("text-muted");
        bakHint.setStyle("-fx-font-size: 11px;");

        HBox bakPathBox = new HBox(8);
        bakPathBox.setAlignment(Pos.CENTER_LEFT);
        bakPathBox.getStyleClass().add("inner-container");

        Button bakBrowseBtn = new Button("Browse...");
        bakBrowseBtn.getStyleClass().add("btn-secondary");
        bakBrowseBtn.setGraphic(UiIcons.createSvgIcon(UiIcons.FOLDER, 13, "#34d399"));
        bakBrowseBtn.setGraphicTextGap(6);
        bakBrowseBtn.setOnAction(e -> {
            DirectoryChooser chooser = new DirectoryChooser();
            chooser.setTitle("Select Backup Directory");
            File dir = chooser.showDialog(ownerWindow);
            if (dir != null) {
                setBackupPath(dir.toPath());
            }
        });

        backupPathLabel = new Label("No folder selected");
        backupPathLabel.getStyleClass().add("text-secondary");
        backupPathLabel.setStyle("-fx-font-size: 11px;");
        backupPathLabel.setTextOverrun(OverrunStyle.CENTER_ELLIPSIS);
        backupPathLabel.setTooltip(new Tooltip("No folder selected"));
        backupPathLabel.setMaxWidth(Double.MAX_VALUE);
        HBox.setHgrow(backupPathLabel, Priority.ALWAYS);

        bakPathBox.getChildren().addAll(bakBrowseBtn, backupPathLabel);

        backupCapacityLabel = new Label("Drive storage: Not computed");
        backupCapacityLabel.getStyleClass().add("text-muted");
        backupCapacityLabel.setStyle("-fx-font-size: 10px;");

        bakCard.getChildren().addAll(bakHeader, bakHint, bakPathBox, backupCapacityLabel);

        getChildren().addAll(srcCard, bakCard);
    }

    public Path getOriginalPath() {
        return originalPath;
    }

    public void setOriginalPath(Path path) {
        this.originalPath = path;
        if (path != null) {
            String absPath = path.toAbsolutePath().toString();
            if (Files.exists(path)) {
                originalPathLabel.setText(absPath);
                originalPathLabel.getTooltip().setText(absPath);
                updateDiskSpace(path, originalCapacityLabel);
            } else {
                originalPathLabel.setText(absPath + " (not mounted)");
                originalPathLabel.getTooltip().setText(absPath + " (not mounted)");
                originalCapacityLabel.setText("Drive storage: Offline / Unmounted");
            }
            originalPathLabel.getStyleClass().removeAll("text-secondary", "text-primary");
            originalPathLabel.getStyleClass().add("text-primary");
            if (onFolderSelected != null) {
                onFolderSelected.accept("SOURCE", path);
            }
        } else {
            originalPathLabel.setText("No folder selected");
            originalPathLabel.getTooltip().setText("No folder selected");
            originalPathLabel.getStyleClass().removeAll("text-secondary", "text-primary");
            originalPathLabel.getStyleClass().add("text-secondary");
            originalCapacityLabel.setText("Drive storage: Not computed");
        }
    }

    public Path getBackupPath() {
        return backupPath;
    }

    public void setBackupPath(Path path) {
        this.backupPath = path;
        if (path != null) {
            String absPath = path.toAbsolutePath().toString();
            if (Files.exists(path)) {
                backupPathLabel.setText(absPath);
                backupPathLabel.getTooltip().setText(absPath);
                updateDiskSpace(path, backupCapacityLabel);
            } else {
                backupPathLabel.setText(absPath + " (not mounted)");
                backupPathLabel.getTooltip().setText(absPath + " (not mounted)");
                backupCapacityLabel.setText("Drive storage: Offline / Unmounted");
            }
            backupPathLabel.getStyleClass().removeAll("text-secondary", "text-primary");
            backupPathLabel.getStyleClass().add("text-primary");
            if (onFolderSelected != null) {
                onFolderSelected.accept("BACKUP", path);
            }
        } else {
            backupPathLabel.setText("No folder selected");
            backupPathLabel.getTooltip().setText("No folder selected");
            backupPathLabel.getStyleClass().removeAll("text-secondary", "text-primary");
            backupPathLabel.getStyleClass().add("text-secondary");
            backupCapacityLabel.setText("Drive storage: Not computed");
        }
    }

    private void updateDiskSpace(Path path, Label targetLabel) {
        try {
            File f = path.toFile();
            long free = f.getUsableSpace();
            long total = f.getTotalSpace();
            targetLabel.setText(String.format("Storage: %s free / %s total",
                    FormatUtils.formatBytes(free), FormatUtils.formatBytes(total)));
        } catch (Exception e) {
            targetLabel.setText("Drive storage: Available");
        }
    }
}
