package com.takeoutfix.ads;
import com.takeoutfix.shared.ui.UiFactory;

import com.takeoutfix.network.SystemHardwareInfo;
import com.takeoutfix.shared.theme.ThemeColors;

import javax.swing.*;
import javax.swing.border.EmptyBorder;
import java.awt.*;
import java.io.File;
import java.util.Locale;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Clean, modern bottom status bar with storage health, engine status, and non-technical system vitals.
 * Translucent Apple-style glass footer with smooth curves and readable typography.
 */
public class DealsRotatorBanner extends JPanel {

    private final JLabel engineStatusBadge;
    private final JLabel engineLabel;
    private final JLabel storageLabel;
    private final JLabel telemetryLabel;
    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(1, r -> {
        Thread t = new Thread(r, "Footer-Telemetry");
        t.setDaemon(true);
        return t;
    });

    public DealsRotatorBanner() {
        super(new BorderLayout(15, 0));
        setOpaque(false);
        setBorder(new EmptyBorder(8, 20, 8, 20));

        // Left Panel: Engine status + Storage Health (non-technical)
        JPanel leftPanel = new JPanel(new FlowLayout(FlowLayout.LEFT, 12, 0));
        leftPanel.setOpaque(false);

        engineStatusBadge = UiFactory.createBadge("READY", ThemeColors.successLight(), ThemeColors.success());
        leftPanel.add(engineStatusBadge);

        engineLabel = new JLabel("TakeoutFix Engine v" + com.takeoutfix.shared.util.AppVersion.getVersion());
        engineLabel.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        engineLabel.setForeground(ThemeColors.textSecondary());
        leftPanel.add(engineLabel);

        JLabel dotSep = new JLabel("•");
        dotSep.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        dotSep.setForeground(ThemeColors.textMuted());
        leftPanel.add(dotSep);

        storageLabel = new JLabel("Available Storage: Calculating...");
        storageLabel.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        storageLabel.setForeground(ThemeColors.textSecondary());
        leftPanel.add(storageLabel);

        // Right Panel: Non-technical system vitals
        JPanel rightPanel = new JPanel(new FlowLayout(FlowLayout.RIGHT, 10, 0));
        rightPanel.setOpaque(false);

        telemetryLabel = new JLabel("System Status: Optimal");
        telemetryLabel.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        telemetryLabel.setForeground(ThemeColors.textMuted());
        rightPanel.add(telemetryLabel);

        add(leftPanel, BorderLayout.WEST);
        add(rightPanel, BorderLayout.EAST);

        ThemeColors.addThemeListener(() -> {
            engineLabel.setForeground(ThemeColors.textSecondary());
            dotSep.setForeground(ThemeColors.textMuted());
            storageLabel.setForeground(ThemeColors.textSecondary());
            telemetryLabel.setForeground(ThemeColors.textMuted());
            repaint();
        });

        updateStorageInfo();
        startTelemetryMonitor();
    }

    private void updateStorageInfo() {
        try {
            File userHome = new File(System.getProperty("user.home", "."));
            long freeBytes = userHome.getUsableSpace();
            long totalBytes = userHome.getTotalSpace();
            if (totalBytes <= 0) {
                File root = new File(".");
                freeBytes = root.getUsableSpace();
                totalBytes = root.getTotalSpace();
            }
            double freeGb = freeBytes / (1024.0 * 1024.0 * 1024.0);
            double totalGb = totalBytes / (1024.0 * 1024.0 * 1024.0);
            String storageText = String.format(Locale.US, "Available Storage: %.1f GB Free / %.1f GB Total", freeGb, totalGb);
            storageLabel.setText(storageText);
        } catch (Exception ignored) {
            storageLabel.setText("Available Storage: Ready");
        }
    }

    private void startTelemetryMonitor() {
        scheduler.scheduleAtFixedRate(() -> {
            try {
                double usedRamGB = SystemHardwareInfo.getUsedMemoryGB();
                double totalRamGB = SystemHardwareInfo.getTotalMemoryGB();
                double cpuLoad = SystemHardwareInfo.getCpuLoadPercent();

                SwingUtilities.invokeLater(() -> {
                    updateStorageInfo();
                    telemetryLabel.setText(String.format(Locale.US,
                            "System Status: Optimal  •  RAM: %.1f / %.1f GB  •  CPU: %.0f%%",
                            usedRamGB, totalRamGB, cpuLoad));
                });
            } catch (Exception ignored) {}
        }, 1, 3, TimeUnit.SECONDS);
    }

    @Override
    protected void paintComponent(Graphics g) {
        Graphics2D g2 = (Graphics2D) g.create();
        g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);

        // Apple-style translucent glass background
        Color topBg = ThemeColors.isDark() ? new Color(22, 28, 45, 215) : new Color(255, 255, 255, 215);
        Color bottomBg = ThemeColors.isDark() ? new Color(15, 20, 32, 230) : new Color(248, 250, 252, 230);
        g2.setPaint(new GradientPaint(0, 0, topBg, 0, getHeight(), bottomBg));
        g2.fillRect(0, 0, getWidth(), getHeight());

        // Specular top rim line
        g2.setColor(ThemeColors.isDark() ? new Color(255, 255, 255, 28) : new Color(255, 255, 255, 200));
        g2.drawLine(0, 0, getWidth(), 0);

        // Top separator border
        g2.setColor(ThemeColors.cardBorder());
        g2.drawLine(0, 1, getWidth(), 1);

        g2.dispose();
        super.paintComponent(g);
    }
}
