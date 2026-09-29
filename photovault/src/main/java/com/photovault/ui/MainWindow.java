package com.photovault.ui;

import com.formdev.flatlaf.FlatDarkLaf;
import com.formdev.flatlaf.FlatLaf;
import com.formdev.flatlaf.FlatLightLaf;
import com.photovault.hashing.VerificationEngine;
import com.photovault.model.VerificationDiscrepancy;
import com.photovault.model.VerificationResult;
import com.photovault.ui.common.UiFactory;
import com.photovault.ui.theme.ThemeColors;

import javax.swing.*;
import javax.swing.border.EmptyBorder;
import java.awt.*;
import java.awt.geom.Area;
import java.awt.geom.Ellipse2D;
import java.nio.file.Path;

/**
 * Main application window for PhotoVault.
 * Styled with the TakeoutFix glassmorphic design system:
 * - Dynamic Sun / Moon Light & Dark theme toggle
 * - Obsidian / Crisp slate canvas surfaces
 * - Specular highlights, rounded cards, and responsive centered layout
 */
public class MainWindow extends JFrame {

    private FolderSelectionCard originalCard;
    private FolderSelectionCard backupCard;
    private JButton verifyButton;
    private VerificationProgressBar progressBar;
    private ResultBanner resultBanner;
    private DiscrepanciesTable discrepanciesTable;
    private VerificationEngine activeEngine;
    private JButton btnThemeToggle;
    private boolean isDarkMode = true;

    public MainWindow() {
        super("PhotoVault — Local Photo Backup Verifier");
        initWindow();
        initContent();
    }

    private void initWindow() {
        setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        setMinimumSize(new Dimension(880, 680));
        setPreferredSize(new Dimension(1000, 740));
        setLocationRelativeTo(null);
    }

    private void initContent() {
        JPanel root = new JPanel(new BorderLayout(0, 14)) {
            @Override
            protected void paintComponent(Graphics g) {
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setColor(ThemeColors.canvasBg());
                g2.fillRect(0, 0, getWidth(), getHeight());
                g2.dispose();
                super.paintComponent(g);
            }
        };
        root.setOpaque(true);
        root.setBorder(new EmptyBorder(16, 22, 16, 22));

        // 1. Top Header Bar (TakeoutFix Style)
        JPanel headerPanel = new JPanel(new BorderLayout(16, 0));
        headerPanel.setOpaque(false);
        headerPanel.setBorder(new EmptyBorder(0, 4, 6, 4));

        // Brand & Subtitle
        JPanel brandGroup = new JPanel(new FlowLayout(FlowLayout.LEFT, 12, 0));
        brandGroup.setOpaque(false);

        JLabel logoBadge = UiFactory.createBadge("PV", new Color(99, 102, 241), Color.WHITE);
        logoBadge.setFont(new Font("Segoe UI", Font.BOLD, 13));
        logoBadge.setPreferredSize(new Dimension(36, 28));

        JPanel titleBlock = new JPanel(new BorderLayout(0, 2));
        titleBlock.setOpaque(false);

        JLabel titleLabel = new JLabel("PhotoVault");
        titleLabel.setFont(new Font("Segoe UI", Font.BOLD, 20));
        titleLabel.setForeground(ThemeColors.textPrimary());

        JLabel subtitleLabel = new JLabel("Local Photo Backup Verifier • Bit-for-bit SHA-256 validation");
        subtitleLabel.setFont(new Font("Segoe UI", Font.PLAIN, 12));
        subtitleLabel.setForeground(ThemeColors.textMuted());

        ThemeColors.addThemeListener(() -> {
            titleLabel.setForeground(ThemeColors.textPrimary());
            subtitleLabel.setForeground(ThemeColors.textMuted());
            root.repaint();
        });

        titleBlock.add(titleLabel, BorderLayout.NORTH);
        titleBlock.add(subtitleLabel, BorderLayout.SOUTH);

        brandGroup.add(logoBadge);
        brandGroup.add(titleBlock);

        // Right Actions: Sun/Moon Theme Toggle + Status Pill
        JPanel rightActions = new JPanel(new FlowLayout(FlowLayout.RIGHT, 10, 0));
        rightActions.setOpaque(false);

        btnThemeToggle = createThemeToggleButton();
        JLabel offlineBadge = UiFactory.createBadge("100% OFFLINE & READ-ONLY", new Color(16, 185, 129), ThemeColors.success());

        rightActions.add(btnThemeToggle);
        rightActions.add(offlineBadge);

        headerPanel.add(brandGroup, BorderLayout.WEST);
        headerPanel.add(rightActions, BorderLayout.EAST);
        root.add(headerPanel, BorderLayout.NORTH);

        // 2. Center Content Area (Centered Card Structure)
        JPanel centerPanel = new JPanel();
        centerPanel.setLayout(new BoxLayout(centerPanel, BoxLayout.Y_AXIS));
        centerPanel.setOpaque(false);

        // Folder Pickers (Grid 1x2)
        JPanel pickersGrid = new JPanel(new GridLayout(1, 2, 14, 0));
        pickersGrid.setOpaque(false);
        pickersGrid.setMaximumSize(new Dimension(Short.MAX_VALUE, 125));

        originalCard = new FolderSelectionCard("Original Folder", "Source SD Card, local disk, or primary photo library");
        backupCard = new FolderSelectionCard("Backup Folder", "External portable SSD, HDD, or secondary backup share");

        originalCard.setOnPathSelected(p -> updateVerifyButtonState());
        backupCard.setOnPathSelected(p -> updateVerifyButtonState());

        pickersGrid.add(originalCard);
        pickersGrid.add(backupCard);
        centerPanel.add(pickersGrid);
        centerPanel.add(Box.createVerticalStrut(12));

        // Action Bar (Primary Button + Read-Only Assurance)
        JPanel actionBar = new JPanel(new BorderLayout(16, 0));
        actionBar.setOpaque(false);
        actionBar.setMaximumSize(new Dimension(Short.MAX_VALUE, 40));

        verifyButton = UiFactory.createPrimaryButton("Start Full Verification");
        verifyButton.setFont(new Font("Segoe UI", Font.BOLD, 13));
        verifyButton.setEnabled(false);
        verifyButton.setPreferredSize(new Dimension(210, 36));
        verifyButton.addActionListener(e -> startVerification());

        JLabel safetyNotice = new JLabel("Strict Read-Only: Files are compared without modifying, moving, syncing, or deleting.");
        safetyNotice.setFont(new Font("Segoe UI", Font.PLAIN, 12));
        safetyNotice.setForeground(ThemeColors.textMuted());
        ThemeColors.addThemeListener(() -> safetyNotice.setForeground(ThemeColors.textMuted()));

        actionBar.add(verifyButton, BorderLayout.WEST);
        actionBar.add(safetyNotice, BorderLayout.CENTER);
        centerPanel.add(actionBar);
        centerPanel.add(Box.createVerticalStrut(12));

        // Progress Bar
        progressBar = new VerificationProgressBar();
        progressBar.setMaximumSize(new Dimension(Short.MAX_VALUE, 74));
        progressBar.setOnCancelRequested(() -> {
            if (activeEngine != null) {
                activeEngine.cancel();
            }
        });
        centerPanel.add(progressBar);

        // Result Banner
        resultBanner = new ResultBanner();
        resultBanner.setMaximumSize(new Dimension(Short.MAX_VALUE, 90));
        centerPanel.add(resultBanner);
        centerPanel.add(Box.createVerticalStrut(10));

        // Discrepancies Table
        discrepanciesTable = new DiscrepanciesTable();
        centerPanel.add(discrepanciesTable);

        root.add(centerPanel, BorderLayout.CENTER);

        setContentPane(root);
        pack();
    }

    private JButton createThemeToggleButton() {
        JButton btn = new JButton() {
            @Override
            protected void paintComponent(Graphics g) {
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                g2.setColor(ThemeColors.cardBg());
                g2.fillRoundRect(0, 0, getWidth(), getHeight(), getHeight(), getHeight());
                g2.setColor(ThemeColors.cardBorder());
                g2.setStroke(new BasicStroke(1f));
                g2.drawRoundRect(0, 0, getWidth() - 1, getHeight() - 1, getHeight() - 1, getHeight() - 1);

                int cx = getWidth() / 2;
                int cy = getHeight() / 2;
                g2.setColor(ThemeColors.textPrimary());

                if (isDarkMode) {
                    // Crescent Moon
                    Area moon = new Area(new Ellipse2D.Double(cx - 6, cy - 6, 12, 12));
                    moon.subtract(new Area(new Ellipse2D.Double(cx - 3, cy - 8, 11, 11)));
                    g2.fill(moon);
                } else {
                    // Sun with rays
                    g2.fillOval(cx - 4, cy - 4, 8, 8);
                    g2.setStroke(new BasicStroke(1.5f, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
                    for (int i = 0; i < 8; i++) {
                        double angle = Math.toRadians(i * 45.0);
                        int x1 = (int) (cx + Math.cos(angle) * 6.0);
                        int y1 = (int) (cy + Math.sin(angle) * 6.0);
                        int x2 = (int) (cx + Math.cos(angle) * 9.0);
                        int y2 = (int) (cy + Math.sin(angle) * 9.0);
                        g2.drawLine(x1, y1, x2, y2);
                    }
                }
                g2.dispose();
            }
        };
        btn.setContentAreaFilled(false);
        btn.setOpaque(false);
        btn.setPreferredSize(new Dimension(34, 30));
        btn.setFocusPainted(false);
        btn.setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
        btn.setToolTipText("Switch to Light Mode");
        btn.addActionListener(e -> toggleTheme());
        return btn;
    }

    private void toggleTheme() {
        isDarkMode = !isDarkMode;
        btnThemeToggle.setToolTipText(isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode");
        ThemeColors.setDark(isDarkMode);

        if (isDarkMode) {
            FlatDarkLaf.setup();
        } else {
            FlatLightLaf.setup();
        }

        FlatLaf.updateUI();
        SwingUtilities.updateComponentTreeUI(this);
        repaint();
    }

    private void updateVerifyButtonState() {
        boolean ready = originalCard.getSelectedPath() != null && backupCard.getSelectedPath() != null;
        verifyButton.setEnabled(ready);
    }

    private void startVerification() {
        Path orig = originalCard.getSelectedPath();
        Path backup = backupCard.getSelectedPath();
        if (orig == null || backup == null) return;

        // UI Transition to Running
        verifyButton.setEnabled(false);
        originalCard.setEnabledSelection(false);
        backupCard.setEnabledSelection(false);
        resultBanner.setVisible(false);
        discrepanciesTable.clear();
        progressBar.reset();
        progressBar.setVisible(true);

        activeEngine = new VerificationEngine();

        SwingWorker<VerificationResult, Object> worker = new SwingWorker<>() {
            @Override
            protected VerificationResult doInBackground() {
                return activeEngine.verify(orig, backup, new VerificationEngine.VerificationListener() {
                    @Override
                    public void onPhaseChange(String phaseName) {
                        SwingUtilities.invokeLater(() -> progressBar.setPhase(phaseName));
                    }

                    @Override
                    public void onProgress(long bytesProcessed, long totalBytes, double mbPerSec, int filesCompleted, int totalFiles) {
                        SwingUtilities.invokeLater(() ->
                                progressBar.updateProgress(bytesProcessed, totalBytes, mbPerSec, filesCompleted, totalFiles));
                    }

                    @Override
                    public void onDiscrepancyFound(VerificationDiscrepancy discrepancy) {
                        SwingUtilities.invokeLater(() -> discrepanciesTable.addDiscrepancy(discrepancy));
                    }
                });
            }

            @Override
            protected void done() {
                try {
                    VerificationResult result = get();
                    progressBar.setVisible(false);
                    resultBanner.setResult(result);
                    discrepanciesTable.setDiscrepancies(result.discrepancies());
                } catch (Exception ex) {
                    JOptionPane.showMessageDialog(MainWindow.this,
                            "An unexpected error occurred during verification: " + ex.getMessage(),
                            "Verification Error", JOptionPane.ERROR_MESSAGE);
                } finally {
                    verifyButton.setEnabled(true);
                    originalCard.setEnabledSelection(true);
                    backupCard.setEnabledSelection(true);
                }
            }
        };

        worker.execute();
    }
}
