package com.rahul.gui.components;

import com.rahul.gui.theme.ThemeColors;

import javax.swing.*;
import javax.swing.border.EmptyBorder;
import javax.swing.border.LineBorder;
import java.awt.*;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Modern, clean bottom telemetry and status bar without any advertising or clutter.
 */
public class DealsRotatorBanner extends JPanel {

    private final JLabel engineStatusBadge;
    private final JLabel apiStatusLabel;
    private final JLabel telemetryLabel;
    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(1);

    public DealsRotatorBanner() {
        super(new BorderLayout(15, 0));
        updateBarTheme();

        // Left Status & Engine Telemetry
        JPanel leftPanel = new JPanel(new FlowLayout(FlowLayout.LEFT, 12, 0));
        leftPanel.setOpaque(false);

        engineStatusBadge = UiFactory.createBadge("READY", ThemeColors.successLight(), ThemeColors.success());
        leftPanel.add(engineStatusBadge);

        apiStatusLabel = new JLabel("TakeoutFix Engine v1.0.0  |  Local API: http://localhost:8081  |  Background Services Active");
        apiStatusLabel.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        apiStatusLabel.setForeground(ThemeColors.textSecondary());
        leftPanel.add(apiStatusLabel);

        // Right Resource Telemetry
        JPanel rightPanel = new JPanel(new FlowLayout(FlowLayout.RIGHT, 10, 0));
        rightPanel.setOpaque(false);

        telemetryLabel = new JLabel("System: Loading telemetry...");
        telemetryLabel.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        telemetryLabel.setForeground(ThemeColors.textMuted());
        rightPanel.add(telemetryLabel);

        add(leftPanel, BorderLayout.WEST);
        add(rightPanel, BorderLayout.EAST);

        ThemeColors.addThemeListener(() -> {
            updateBarTheme();
            apiStatusLabel.setForeground(ThemeColors.textSecondary());
            telemetryLabel.setForeground(ThemeColors.textMuted());
            repaint();
        });

        startTelemetryMonitor();
    }

    private void updateBarTheme() {
        setBackground(ThemeColors.cardBg());
        setBorder(BorderFactory.createCompoundBorder(
                BorderFactory.createMatteBorder(1, 0, 0, 0, ThemeColors.cardBorder()),
                new EmptyBorder(8, 20, 8, 20)
        ));
    }

    private void startTelemetryMonitor() {
        scheduler.scheduleAtFixedRate(() -> {
            try {
                int cores = Runtime.getRuntime().availableProcessors();
                long totalMemMB = Runtime.getRuntime().totalMemory() / (1024 * 1024);
                long freeMemMB = Runtime.getRuntime().freeMemory() / (1024 * 1024);
                long usedMemMB = totalMemMB - freeMemMB;
                int activeThreads = Thread.activeCount();

                SwingUtilities.invokeLater(() -> {
                    telemetryLabel.setText(String.format("Hardware: %d Cores | RAM %d MB / %d MB | Threads: %d", cores, usedMemMB, totalMemMB, activeThreads));
                });
            } catch (Exception ignored) {}
        }, 1, 2, TimeUnit.SECONDS);
    }
}
