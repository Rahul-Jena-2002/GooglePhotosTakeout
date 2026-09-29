package com.photovault.ui.fx;

import javafx.geometry.Pos;
import javafx.scene.Node;
import javafx.scene.control.Label;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.VBox;

/**
 * Top row of 4 operational KPI stat cards.
 * Displays real-time inspection throughput, file counts, and safety status.
 */
public class KpiCardsRow extends HBox {

    private final Label totalFilesLabel;
    private final Label safeMatchedLabel;
    private final Label issuesDetectedLabel;
    private final Label throughputLabel;

    public KpiCardsRow() {
        super(12);

        // 1. Total Files
        VBox card1 = createKpiCard("TOTAL FILES INSPECTED", "-", "Across selected directories", "#6366f1", UiIcons.FILES);
        totalFilesLabel = (Label) card1.getChildren().get(1);

        // 2. Verified Safe
        VBox card2 = createKpiCard("VERIFIED 100% SAFE", "-", "Bit-for-bit SHA-256 match", "#10b981", UiIcons.CHECK);
        safeMatchedLabel = (Label) card2.getChildren().get(1);

        // 3. Issues Detected
        VBox card3 = createKpiCard("ISSUES DETECTED", "-", "Missing, altered, or corrupted", "#ef4444", UiIcons.ALERT);
        issuesDetectedLabel = (Label) card3.getChildren().get(1);

        // 4. Real-time Throughput Speed
        VBox card4 = createKpiCard("VERIFICATION SPEED", "-", "Real-time streaming throughput", "#38bdf8", UiIcons.SPEED);
        throughputLabel = (Label) card4.getChildren().get(1);

        getChildren().addAll(card1, card2, card3, card4);
    }

    public void updateStats(long totalFiles, long safeMatched, int issuesDetected, double throughputMbPerSec) {
        totalFilesLabel.setText(String.valueOf(totalFiles));
        safeMatchedLabel.setText(String.valueOf(safeMatched));
        issuesDetectedLabel.setText(String.valueOf(issuesDetected));
        throughputLabel.setText(String.format("%.1f MB/s", throughputMbPerSec));
    }

    public void reset() {
        totalFilesLabel.setText("-");
        safeMatchedLabel.setText("-");
        issuesDetectedLabel.setText("-");
        throughputLabel.setText("-");
    }

    private VBox createKpiCard(String label, String initialValue, String subtext, String iconColor, String svgPath) {
        VBox card = new VBox(4);
        card.getStyleClass().add("kpi-card");
        HBox.setHgrow(card, Priority.ALWAYS);

        HBox topRow = new HBox(8);
        topRow.setAlignment(Pos.CENTER_LEFT);
        Node icon = UiIcons.createSvgIcon(svgPath, 14, iconColor);
        Label title = new Label(label);
        title.getStyleClass().add("kpi-label");
        topRow.getChildren().addAll(icon, title);

        Label val = new Label(initialValue);
        val.getStyleClass().add("kpi-value");

        Label sub = new Label(subtext);
        sub.getStyleClass().add("kpi-sub");

        card.getChildren().addAll(topRow, val, sub);
        return card;
    }
}
