package com.photovault.ui;

import com.photovault.ui.common.UiFactory;
import com.photovault.ui.theme.ThemeColors;

import javax.swing.*;
import javax.swing.border.EmptyBorder;
import java.awt.*;
import java.io.File;
import java.nio.file.Path;
import java.util.function.Consumer;

/**
 * Reusable folder picker component for Original and Backup directory selection.
 * Styled with TakeoutFix glassmorphism, rounded path badges, and custom buttons.
 */
public class FolderSelectionCard extends JPanel {

    private final String title;
    private final String helperText;
    private final JLabel pathLabel;
    private final JLabel capacityLabel;
    private final JButton browseButton;
    private Path selectedPath;
    private Consumer<Path> onPathSelected;

    public FolderSelectionCard(String title, String helperText) {
        this.title = title;
        this.helperText = helperText;

        setLayout(new BorderLayout(0, 10));
        setOpaque(false);
        setBorder(new EmptyBorder(16, 18, 16, 18));

        // Header: Badge + Title + Helper
        JPanel headerPanel = new JPanel(new BorderLayout(8, 4));
        headerPanel.setOpaque(false);

        JPanel titleRow = new JPanel(new FlowLayout(FlowLayout.LEFT, 8, 0));
        titleRow.setOpaque(false);

        boolean isOriginal = title.toLowerCase().contains("original");
        JLabel badge = UiFactory.createBadge(
                isOriginal ? "SOURCE" : "BACKUP",
                isOriginal ? new Color(99, 102, 241) : new Color(52, 211, 153),
                isOriginal ? ThemeColors.accent() : ThemeColors.success()
        );

        JLabel titleLabel = new JLabel(title);
        titleLabel.setFont(new Font("Segoe UI", Font.BOLD, 14));
        titleLabel.setForeground(ThemeColors.textPrimary());

        titleRow.add(badge);
        titleRow.add(titleLabel);

        JLabel descLabel = new JLabel(helperText);
        descLabel.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        descLabel.setForeground(ThemeColors.textMuted());

        headerPanel.add(titleRow, BorderLayout.NORTH);
        headerPanel.add(descLabel, BorderLayout.SOUTH);

        // Center Panel: Inner Rounded Path Display Container + Browse Button
        JPanel centerPanel = new JPanel(new BorderLayout(10, 0));
        centerPanel.setOpaque(false);

        JPanel pathContainer = UiFactory.createInnerContainer(8);
        pathContainer.setLayout(new BorderLayout());
        pathContainer.setBorder(new EmptyBorder(8, 12, 8, 12));

        pathLabel = new JLabel("No folder selected");
        pathLabel.setFont(new Font("Segoe UI", Font.PLAIN, 12));
        pathLabel.setForeground(ThemeColors.textMuted());
        pathContainer.add(pathLabel, BorderLayout.CENTER);

        browseButton = UiFactory.createSecondaryButton("Select Folder...");
        browseButton.addActionListener(e -> chooseFolder());

        centerPanel.add(pathContainer, BorderLayout.CENTER);
        centerPanel.add(browseButton, BorderLayout.EAST);

        // Footer / Capacity
        capacityLabel = new JLabel(" ");
        capacityLabel.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        capacityLabel.setForeground(ThemeColors.textMuted());

        add(headerPanel, BorderLayout.NORTH);
        add(centerPanel, BorderLayout.CENTER);
        add(capacityLabel, BorderLayout.SOUTH);

        ThemeColors.addThemeListener(() -> {
            titleLabel.setForeground(ThemeColors.textPrimary());
            descLabel.setForeground(ThemeColors.textMuted());
            if (selectedPath != null) {
                pathLabel.setForeground(ThemeColors.textPrimary());
            } else {
                pathLabel.setForeground(ThemeColors.textMuted());
            }
            capacityLabel.setForeground(ThemeColors.textMuted());
            repaint();
        });
    }

    @Override
    protected void paintComponent(Graphics g) {
        // Paint TakeoutFix glass card surface
        Graphics2D g2 = (Graphics2D) g.create();
        g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g2.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        int w = getWidth();
        int h = getHeight();
        if (w > 4 && h > 4) {
            boolean isDark = ThemeColors.isDark();
            int arc = 16;
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

            // Inner Specular Rim Highlight
            Color rimColor = isDark ? new Color(255, 255, 255, 35) : new Color(255, 255, 255, 175);
            g2.setColor(rimColor);
            g2.setStroke(new BasicStroke(1f));
            g2.drawLine(arc / 2 + 1, 2, w - arc / 2 - 2, 2);

            // 1px Border Highlight
            Color topBorder = isDark ? new Color(255, 255, 255, 45) : new Color(255, 255, 255, 235);
            Color bottomBorder = isDark ? new Color(42, 54, 76, 200) : new Color(203, 213, 225, 140);
            GradientPaint borderGradient = new GradientPaint(0, 0, topBorder, 0, h, bottomBorder);
            g2.setPaint(borderGradient);
            g2.drawRoundRect(1, 1, w - 3, h - shadowOffset - 2, arc, arc);
        }
        g2.dispose();
        super.paintComponent(g);
    }

    private void chooseFolder() {
        JFileChooser chooser = new JFileChooser();
        chooser.setFileSelectionMode(JFileChooser.DIRECTORIES_ONLY);
        chooser.setDialogTitle("Select " + title);
        if (selectedPath != null) {
            chooser.setCurrentDirectory(selectedPath.toFile());
        }

        int result = chooser.showOpenDialog(this);
        if (result == JFileChooser.APPROVE_OPTION) {
            File file = chooser.getSelectedFile();
            if (file != null) {
                setPath(file.toPath());
                if (onPathSelected != null) {
                    onPathSelected.accept(file.toPath());
                }
            }
        }
    }

    public void setPath(Path path) {
        this.selectedPath = path;
        if (path != null) {
            pathLabel.setText(path.toAbsolutePath().toString());
            pathLabel.setForeground(ThemeColors.textPrimary());

            File file = path.toFile();
            long freeBytes = file.getFreeSpace();
            long totalBytes = file.getTotalSpace();
            if (totalBytes > 0) {
                double freeGb = freeBytes / (1024.0 * 1024.0 * 1024.0);
                double totalGb = totalBytes / (1024.0 * 1024.0 * 1024.0);
                capacityLabel.setText(String.format("Drive Free Space: %.1f GB / %.1f GB available", freeGb, totalGb));
            } else {
                capacityLabel.setText("Local Directory");
            }
        } else {
            pathLabel.setText("No folder selected");
            pathLabel.setForeground(ThemeColors.textMuted());
            capacityLabel.setText(" ");
        }
    }

    public Path getSelectedPath() {
        return selectedPath;
    }

    public void setOnPathSelected(Consumer<Path> listener) {
        this.onPathSelected = listener;
    }

    public void setEnabledSelection(boolean enabled) {
        browseButton.setEnabled(enabled);
    }
}
