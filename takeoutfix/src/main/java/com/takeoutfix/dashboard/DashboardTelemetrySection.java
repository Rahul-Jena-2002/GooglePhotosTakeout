package com.takeoutfix.dashboard;

import com.takeoutfix.shared.ui.UiFactory;
import com.takeoutfix.shared.theme.ThemeColors;

import javax.swing.*;
import javax.swing.border.EmptyBorder;
import java.awt.*;
import java.util.Locale;

/**
 * Hardware Acceleration & Host Telemetry card.
 * Monitors real-time CPU utilization, system RAM, and multi-core worker pipeline.
 */
public class DashboardTelemetrySection extends JPanel {

    private final JLabel cpuNameLabel;
    private final JLabel cpuLoadText;
    private final JProgressBar cpuLoadBar;
    private final JLabel ramText;
    private final JProgressBar ramBar;
    private final JLabel threadsLabel;

    public DashboardTelemetrySection() {
        super(new BorderLayout());
        setOpaque(false);

        JPanel card = UiFactory.createCard();
        card.setLayout(new BorderLayout(0, 12));

        // Header Row
        JPanel header = new JPanel(new BorderLayout());
        header.setOpaque(false);
        JLabel lblTitle = new JLabel("DEVICE PERFORMANCE & RESOURCES");
        lblTitle.setFont(new Font("Segoe UI", Font.BOLD, 11));
        lblTitle.setForeground(ThemeColors.textMuted());
        header.add(lblTitle, BorderLayout.WEST);

        JLabel lblEngine = UiFactory.createBadge("FAST", new Color(238, 242, 255), new Color(99, 102, 241));
        header.add(lblEngine, BorderLayout.EAST);
        card.add(header, BorderLayout.NORTH);

        // Body: 3 columns (CPU, RAM, Threads)
        JPanel grid = new JPanel(new GridLayout(1, 3, 14, 0));
        grid.setOpaque(false);

        // Col 1: CPU
        JPanel cpuCol = UiFactory.createInnerContainer(12);
        cpuCol.setLayout(new GridBagLayout());
        cpuCol.setBorder(new EmptyBorder(10, 14, 10, 14));
        GridBagConstraints g = new GridBagConstraints();
        g.gridx = 0; g.gridy = 0; g.weightx = 1.0; g.fill = GridBagConstraints.HORIZONTAL;
        g.insets = new Insets(0, 0, 4, 0);

        JLabel lblCpuHead = new JLabel("CPU USAGE");
        lblCpuHead.setFont(new Font("Segoe UI", Font.BOLD, 10));
        lblCpuHead.setForeground(ThemeColors.textMuted());
        cpuCol.add(lblCpuHead, g);

        g.gridy = 1;
        cpuNameLabel = new JLabel("Detecting CPU...");
        cpuNameLabel.setFont(new Font("Segoe UI", Font.BOLD, 12));
        cpuNameLabel.setForeground(ThemeColors.textPrimary());
        cpuCol.add(cpuNameLabel, g);

        g.gridy = 2;
        JPanel cpuValRow = new JPanel(new BorderLayout());
        cpuValRow.setOpaque(false);
        JLabel lblCurrentLoad = new JLabel("Current Load");
        lblCurrentLoad.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        lblCurrentLoad.setForeground(ThemeColors.textSecondary());
        cpuValRow.add(lblCurrentLoad, BorderLayout.WEST);

        cpuLoadText = new JLabel("0%");
        cpuLoadText.setFont(new Font("Segoe UI", Font.BOLD, 11));
        cpuLoadText.setForeground(ThemeColors.textPrimary());
        cpuValRow.add(cpuLoadText, BorderLayout.EAST);
        cpuCol.add(cpuValRow, g);

        g.gridy = 3;
        g.insets = new Insets(4, 0, 0, 0);
        cpuLoadBar = UiFactory.createSlimProgressBar();
        cpuCol.add(cpuLoadBar, g);
        grid.add(cpuCol);

        // Col 2: RAM
        JPanel ramCol = UiFactory.createInnerContainer(12);
        ramCol.setLayout(new GridBagLayout());
        ramCol.setBorder(new EmptyBorder(10, 14, 10, 14));
        g = new GridBagConstraints();
        g.gridx = 0; g.gridy = 0; g.weightx = 1.0; g.fill = GridBagConstraints.HORIZONTAL;
        g.insets = new Insets(0, 0, 4, 0);

        JLabel lblRamHead = new JLabel("SYSTEM MEMORY (RAM)");
        lblRamHead.setFont(new Font("Segoe UI", Font.BOLD, 10));
        lblRamHead.setForeground(ThemeColors.textMuted());
        ramCol.add(lblRamHead, g);

        g.gridy = 1;
        JLabel ramSub = new JLabel("Memory Available");
        ramSub.setFont(new Font("Segoe UI", Font.BOLD, 12));
        ramSub.setForeground(ThemeColors.textPrimary());
        ramCol.add(ramSub, g);

        g.gridy = 2;
        JPanel ramValRow = new JPanel(new BorderLayout());
        ramValRow.setOpaque(false);
        JLabel lblActiveRam = new JLabel("Used Memory");
        lblActiveRam.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        lblActiveRam.setForeground(ThemeColors.textSecondary());
        ramValRow.add(lblActiveRam, BorderLayout.WEST);

        ramText = new JLabel("0.0 GB / 0.0 GB");
        ramText.setFont(new Font("Segoe UI", Font.BOLD, 11));
        ramText.setForeground(ThemeColors.textPrimary());
        ramValRow.add(ramText, BorderLayout.EAST);
        ramCol.add(ramValRow, g);

        g.gridy = 3;
        g.insets = new Insets(4, 0, 0, 0);
        ramBar = UiFactory.createSlimProgressBar();
        ramCol.add(ramBar, g);
        grid.add(ramCol);

        // Col 3: Cores & Processing
        JPanel threadCol = UiFactory.createInnerContainer(12);
        threadCol.setLayout(new GridBagLayout());
        threadCol.setBorder(new EmptyBorder(10, 14, 10, 14));
        g = new GridBagConstraints();
        g.gridx = 0; g.gridy = 0; g.weightx = 1.0; g.fill = GridBagConstraints.HORIZONTAL;
        g.insets = new Insets(0, 0, 4, 0);

        JLabel lblThreadHead = new JLabel("PROCESSING POWER");
        lblThreadHead.setFont(new Font("Segoe UI", Font.BOLD, 10));
        lblThreadHead.setForeground(ThemeColors.textMuted());
        threadCol.add(lblThreadHead, g);

        g.gridy = 1;
        threadsLabel = new JLabel(Runtime.getRuntime().availableProcessors() + " Cores Available");
        threadsLabel.setFont(new Font("Segoe UI", Font.BOLD, 12));
        threadsLabel.setForeground(ThemeColors.textPrimary());
        threadCol.add(threadsLabel, g);

        g.gridy = 2;
        JLabel lblEngines = new JLabel("Using all cores");
        lblEngines.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        lblEngines.setForeground(ThemeColors.textSecondary());
        threadCol.add(lblEngines, g);

        g.gridy = 3;
        g.insets = new Insets(4, 0, 0, 0);
        JLabel lblOptimized = new JLabel("✓ All systems good");
        lblOptimized.setFont(new Font("Segoe UI", Font.BOLD, 11));
        lblOptimized.setForeground(new Color(16, 185, 129));
        threadCol.add(lblOptimized, g);
        grid.add(threadCol);

        card.add(grid, BorderLayout.CENTER);

        ThemeColors.addThemeListener(() -> {
            lblTitle.setForeground(ThemeColors.textMuted());
            lblCpuHead.setForeground(ThemeColors.textMuted());
            cpuNameLabel.setForeground(ThemeColors.textPrimary());
            lblRamHead.setForeground(ThemeColors.textMuted());
            ramSub.setForeground(ThemeColors.textPrimary());
            lblThreadHead.setForeground(ThemeColors.textMuted());
            threadsLabel.setForeground(ThemeColors.textPrimary());
        });

        add(card, BorderLayout.CENTER);
    }

    public void setCpuName(String name) {
        SwingUtilities.invokeLater(() -> {
            if (name != null && !name.isBlank()) {
                String clean = name.replace("(R)", "").replace("(TM)", "").replaceAll("\\s+", " ").trim();
                cpuNameLabel.setText(clean.length() > 24 ? clean.substring(0, 22) + "…" : clean);
                cpuNameLabel.setToolTipText(name);
            }
        });
    }

    public void updateTelemetry(int cpuPercent, double usedRamGb, double totalRamGb) {
        SwingUtilities.invokeLater(() -> {
            int cpu = Math.max(0, Math.min(100, cpuPercent));
            cpuLoadText.setText(cpu + "%");
            cpuLoadBar.setValue(cpu);

            int ramPercent = (totalRamGb > 0) ? (int) Math.round((usedRamGb / totalRamGb) * 100.0) : 0;
            ramPercent = Math.max(0, Math.min(100, ramPercent));
            ramText.setText(String.format(Locale.US, "%.1f GB / %.1f GB", usedRamGb, totalRamGb));
            ramBar.setValue(ramPercent);
        });
    }
}
