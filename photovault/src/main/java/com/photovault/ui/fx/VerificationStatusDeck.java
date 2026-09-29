package com.photovault.ui.fx;

import com.photovault.model.VerificationResult;
import com.photovault.model.VerificationState;
import javafx.geometry.Pos;
import javafx.scene.Node;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.ProgressBar;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.Region;
import javafx.scene.layout.StackPane;
import javafx.scene.layout.VBox;

/**
 * Manages the right-column status view across Idle, In-Progress, and Result states.
 */
public class VerificationStatusDeck extends StackPane {

    private final VBox idleCard;
    private final VBox progressCard;
    private final VBox resultCard;

    private final Label phaseLabel;
    private final Label telemetryLabel;
    private final ProgressBar progressBar;

    private final Label resultBadge;
    private final Label resultSummary;
    private final Button exportHtmlBtn;
    private final Button exportTxtBtn;

    public VerificationStatusDeck(Runnable onExportHtml, Runnable onExportTxt) {
        // 1. Idle Card
        idleCard = createIdleCard();

        // 2. Progress Card
        progressCard = new VBox(10);
        progressCard.getStyleClass().add("glass-card");

        HBox progTop = new HBox(8);
        progTop.setAlignment(Pos.CENTER_LEFT);
        phaseLabel = new Label("Ready to verify...");
        phaseLabel.getStyleClass().add("text-primary");
        phaseLabel.setStyle("-fx-font-size: 13px;");

        Region sp1 = new Region();
        HBox.setHgrow(sp1, Priority.ALWAYS);

        telemetryLabel = new Label("0 MB/s • 0% complete");
        telemetryLabel.getStyleClass().add("text-muted");
        telemetryLabel.setStyle("-fx-font-size: 11px;");

        progTop.getChildren().addAll(phaseLabel, sp1, telemetryLabel);

        progressBar = new ProgressBar(0);
        progressBar.setMaxWidth(Double.MAX_VALUE);
        progressBar.setPrefHeight(10);

        progressCard.getChildren().addAll(progTop, progressBar);

        // 3. Result Card
        resultCard = new VBox(10);
        resultCard.getStyleClass().add("glass-card");

        HBox resTop = new HBox(10);
        resTop.setAlignment(Pos.CENTER_LEFT);

        resultBadge = new Label("VERIFIED 100%");
        resultBadge.setStyle("-fx-font-size: 11px; -fx-font-weight: bold; -fx-padding: 3 8 3 8; -fx-background-radius: 6;");

        resultSummary = new Label("All files matched bit-for-bit.");
        resultSummary.getStyleClass().add("text-secondary");
        resultSummary.setStyle("-fx-font-size: 12px;");

        Region sp2 = new Region();
        HBox.setHgrow(sp2, Priority.ALWAYS);

        exportHtmlBtn = new Button("Export HTML Report");
        exportHtmlBtn.getStyleClass().add("btn-secondary");
        exportHtmlBtn.setOnAction(e -> {
            if (onExportHtml != null) onExportHtml.run();
        });

        exportTxtBtn = new Button("Export TXT Receipt");
        exportTxtBtn.getStyleClass().add("btn-secondary");
        exportTxtBtn.setOnAction(e -> {
            if (onExportTxt != null) onExportTxt.run();
        });

        resTop.getChildren().addAll(resultBadge, resultSummary, sp2, exportHtmlBtn, exportTxtBtn);
        resultCard.getChildren().add(resTop);

        getChildren().addAll(idleCard, progressCard, resultCard);
        showIdle();
    }

    public void showIdle() {
        idleCard.setVisible(true);
        idleCard.setManaged(true);
        progressCard.setVisible(false);
        progressCard.setManaged(false);
        resultCard.setVisible(false);
        resultCard.setManaged(false);
    }

    public void showProgress(String phase, double pct, String telemetry) {
        idleCard.setVisible(false);
        idleCard.setManaged(false);
        progressCard.setVisible(true);
        progressCard.setManaged(true);
        resultCard.setVisible(false);
        resultCard.setManaged(false);

        if (phase != null) phaseLabel.setText(phase);
        progressBar.setProgress(pct);
        if (telemetry != null) telemetryLabel.setText(telemetry);
    }

    public void showResult(VerificationResult result) {
        idleCard.setVisible(false);
        idleCard.setManaged(false);
        progressCard.setVisible(false);
        progressCard.setManaged(false);
        resultCard.setVisible(true);
        resultCard.setManaged(true);

        if (result == null) return;

        long totalFiles = result.originalInventory().totalFiles();
        int issueCount = result.discrepancies().size();
        long matched = Math.max(0, totalFiles - issueCount);

        if (result.state() == VerificationState.VERIFIED) {
            resultBadge.setText("100% BIT-FOR-BIT IDENTICAL");
            resultBadge.setStyle("-fx-background-color: rgba(16, 185, 129, 0.2); -fx-border-color: #10b981; -fx-text-fill: #34d399; -fx-font-weight: bold; -fx-font-size: 11px; -fx-padding: 3 8 3 8; -fx-background-radius: 6; -fx-border-radius: 6;");
            resultSummary.setText(String.format("All %d files verified bit-for-bit. Zero corruption, zero missing files.", matched));
        } else if (result.state() == VerificationState.DIFFERENCES_FOUND) {
            resultBadge.setText("ISSUES DETECTED");
            resultBadge.setStyle("-fx-background-color: rgba(239, 68, 68, 0.2); -fx-border-color: #ef4444; -fx-text-fill: #fca5a5; -fx-font-weight: bold; -fx-font-size: 11px; -fx-padding: 3 8 3 8; -fx-background-radius: 6; -fx-border-radius: 6;");
            resultSummary.setText(String.format("%d issues detected out of %d files checked. Review audit table below.", issueCount, totalFiles));
        } else {
            resultBadge.setText("INCOMPLETE / CANCELLED");
            resultBadge.setStyle("-fx-background-color: rgba(245, 158, 11, 0.2); -fx-border-color: #f59e0b; -fx-text-fill: #fcd34d; -fx-font-weight: bold; -fx-font-size: 11px; -fx-padding: 3 8 3 8; -fx-background-radius: 6; -fx-border-radius: 6;");
            resultSummary.setText("Verification was interrupted before all files could be verified.");
        }
    }

    private VBox createIdleCard() {
        VBox card = new VBox(10);
        card.getStyleClass().add("glass-card");

        HBox header = new HBox(8);
        header.setAlignment(Pos.CENTER_LEFT);
        Node shield = UiIcons.createSvgIcon(UiIcons.SHIELD, 16, "#6366f1");
        Label title = new Label("Bit-for-Bit Backup Integrity Verification");
        title.getStyleClass().add("text-primary");
        title.setStyle("-fx-font-size: 14px;");
        header.getChildren().addAll(shield, title);

        Label desc = new Label("PhotoVault computes cryptographic SHA-256 digests across both directories to detect silent bit-rot, missing files, corrupted exports, and incomplete transfers.");
        desc.getStyleClass().add("text-secondary");
        desc.setStyle("-fx-font-size: 12px; -fx-wrap-text: true;");

        HBox steps = new HBox(12);
        steps.getChildren().addAll(
                createStepPill("1. Pick Folders", "Select original & backup roots"),
                createStepPill("2. Stream Hash", "Hardware-accelerated SHA-256"),
                createStepPill("3. Audit Receipt", "Export certified audit report")
        );

        card.getChildren().addAll(header, desc, steps);
        return card;
    }

    private VBox createStepPill(String titleText, String subText) {
        VBox box = new VBox(2);
        box.getStyleClass().add("inner-container");
        HBox.setHgrow(box, Priority.ALWAYS);
        Label t = new Label(titleText);
        t.getStyleClass().add("text-primary");
        t.setStyle("-fx-font-size: 11px;");
        Label s = new Label(subText);
        s.getStyleClass().add("text-muted");
        s.setStyle("-fx-font-size: 10px;");
        box.getChildren().addAll(t, s);
        return box;
    }
}
