package com.photovault.ui;

import com.photovault.ui.common.UiFactory;
import com.photovault.ui.theme.ThemeColors;

import javax.swing.*;
import javax.swing.border.EmptyBorder;
import java.awt.*;

/**
 * Real-time progress meter and live throughput monitor with cancellation control.
 * Styled with TakeoutFix glass card and antialiased slim progress bar.
 */
public class VerificationProgressBar extends JPanel {

    private final JLabel phaseLabel;
    private final JProgressBar progressBar;
    private final JLabel telemetryLabel;
    private final JButton cancelButton;
    private Runnable onCancelRequested;

    public VerificationProgressBar() {
        setLayout(new BorderLayout(0, 10));
        setOpaque(false);
        setBorder(new EmptyBorder(14, 18, 14, 18));

        // Top line: Phase and Cancel button
        JPanel topPanel = new JPanel(new BorderLayout(8, 0));
        topPanel.setOpaque(false);

        phaseLabel = new JLabel("Preparing verification...");
        phaseLabel.setFont(new Font("Segoe UI", Font.BOLD, 13));
        phaseLabel.setForeground(ThemeColors.textPrimary());

        cancelButton = UiFactory.createSecondaryButton("Cancel");
        cancelButton.addActionListener(e -> {
            if (onCancelRequested != null) {
                cancelButton.setEnabled(false);
                cancelButton.setText("Cancelling...");
                onCancelRequested.run();
            }
        });

        topPanel.add(phaseLabel, BorderLayout.WEST);
        topPanel.add(cancelButton, BorderLayout.EAST);

        // Slim Antialiased Progress Bar
        progressBar = UiFactory.createSlimProgressBar();
        progressBar.setPreferredSize(new Dimension(200, 10));

        // Telemetry readout
        telemetryLabel = new JLabel("0 MB / 0 MB (0.0 MB/s) — 0 files");
        telemetryLabel.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        telemetryLabel.setForeground(ThemeColors.textMuted());

        add(topPanel, BorderLayout.NORTH);
        add(progressBar, BorderLayout.CENTER);
        add(telemetryLabel, BorderLayout.SOUTH);

        setVisible(false);
    }

    @Override
    protected void paintComponent(Graphics g) {
        Graphics2D g2 = (Graphics2D) g.create();
        g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        int w = getWidth();
        int h = getHeight();
        if (w > 4 && h > 4) {
            boolean isDark = ThemeColors.isDark();
            int arc = 14;
            int shadowOffset = 3;

            // Ambient Shadow
            Color sColor1 = isDark ? new Color(0, 0, 0, 75) : new Color(15, 23, 42, 12);
            g2.setColor(sColor1);
            g2.fillRoundRect(2, shadowOffset + 1, w - 4, h - shadowOffset - 2, arc + 2, arc + 2);

            // Translucent Glass Surface
            Color topGlass = isDark ? new Color(22, 28, 42, 240) : new Color(255, 255, 255, 238);
            Color bottomGlass = isDark ? new Color(14, 18, 28, 235) : new Color(248, 250, 252, 220);
            GradientPaint glassGradient = new GradientPaint(0, 0, topGlass, 0, h, bottomGlass);
            g2.setPaint(glassGradient);
            g2.fillRoundRect(1, 1, w - 2, h - shadowOffset - 1, arc, arc);

            // Specular border
            Color topBorder = isDark ? new Color(255, 255, 255, 45) : new Color(255, 255, 255, 235);
            Color bottomBorder = isDark ? new Color(42, 54, 76, 200) : new Color(203, 213, 225, 140);
            GradientPaint borderGradient = new GradientPaint(0, 0, topBorder, 0, h, bottomBorder);
            g2.setPaint(borderGradient);
            g2.drawRoundRect(1, 1, w - 3, h - shadowOffset - 2, arc, arc);
        }
        g2.dispose();
        super.paintComponent(g);
    }

    public void setPhase(String phase) {
        phaseLabel.setText(phase);
    }

    public void updateProgress(long currentBytes, long totalBytes, double mbPerSec, int completedFiles, int totalFiles) {
        int percent = totalBytes > 0 ? (int) Math.min(100, (currentBytes * 100) / totalBytes) : 0;
        progressBar.setValue(percent);

        double currentGb = currentBytes / (1024.0 * 1024.0 * 1024.0);
        double totalGb = totalBytes / (1024.0 * 1024.0 * 1024.0);

        String sizeText;
        if (totalGb >= 1.0) {
            sizeText = String.format("%.2f GB / %.2f GB", currentGb, totalGb);
        } else {
            double currentMb = currentBytes / (1024.0 * 1024.0);
            double totalMb = totalBytes / (1024.0 * 1024.0);
            sizeText = String.format("%.1f MB / %.1f MB", currentMb, totalMb);
        }

        telemetryLabel.setText(String.format("%s (%d%%) • %.1f MB/s • %d / %d files",
                sizeText, percent, mbPerSec, completedFiles, totalFiles));
    }

    public void reset() {
        progressBar.setValue(0);
        cancelButton.setEnabled(true);
        cancelButton.setText("Cancel");
        telemetryLabel.setText("0 MB / 0 MB (0.0 MB/s) — 0 files");
        phaseLabel.setText("Preparing verification...");
    }

    public void setOnCancelRequested(Runnable listener) {
        this.onCancelRequested = listener;
    }
}
