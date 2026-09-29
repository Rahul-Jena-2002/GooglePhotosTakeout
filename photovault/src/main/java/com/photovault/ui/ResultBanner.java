package com.photovault.ui;

import com.photovault.model.VerificationResult;
import com.photovault.model.VerificationState;
import com.photovault.report.HtmlReportGenerator;
import com.photovault.report.TxtReportGenerator;
import com.photovault.ui.common.UiFactory;
import com.photovault.ui.theme.ThemeColors;

import javax.swing.*;
import javax.swing.border.EmptyBorder;
import java.awt.*;
import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Visual outcome card displaying the 3-state verification verdict with report export actions.
 * Styled with TakeoutFix glass card, dynamic status pills, and action buttons.
 */
public class ResultBanner extends JPanel {

    private final JLabel stateBadge;
    private final JLabel summaryLabel;
    private final JButton exportHtmlButton;
    private final JButton exportTxtButton;
    private VerificationResult currentResult;

    public ResultBanner() {
        setLayout(new BorderLayout(16, 12));
        setOpaque(false);
        setBorder(new EmptyBorder(16, 20, 16, 20));
        setVisible(false);

        // Left section: State badge and summary
        JPanel leftPanel = new JPanel(new BorderLayout(0, 6));
        leftPanel.setOpaque(false);

        stateBadge = new JLabel("Status");
        stateBadge.setFont(new Font("Segoe UI", Font.BOLD, 15));

        summaryLabel = new JLabel("Summary description");
        summaryLabel.setFont(new Font("Segoe UI", Font.PLAIN, 12));
        summaryLabel.setForeground(ThemeColors.textSecondary());

        leftPanel.add(stateBadge, BorderLayout.NORTH);
        leftPanel.add(summaryLabel, BorderLayout.SOUTH);

        // Right section: Export actions
        JPanel actionsPanel = new JPanel(new FlowLayout(FlowLayout.RIGHT, 10, 0));
        actionsPanel.setOpaque(false);

        exportHtmlButton = UiFactory.createSecondaryButton("Export HTML Report");
        exportHtmlButton.addActionListener(e -> exportReport(true));

        exportTxtButton = UiFactory.createSecondaryButton("Export TXT Receipt");
        exportTxtButton.addActionListener(e -> exportReport(false));

        actionsPanel.add(exportHtmlButton);
        actionsPanel.add(exportTxtButton);

        add(leftPanel, BorderLayout.CENTER);
        add(actionsPanel, BorderLayout.EAST);
    }

    @Override
    protected void paintComponent(Graphics g) {
        Graphics2D g2 = (Graphics2D) g.create();
        g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
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

            // Border Tinted with outcome status if available
            Color topBorder = currentResult != null ? getOutcomeBorder(currentResult.state()) : ThemeColors.cardBorder();
            g2.setColor(topBorder);
            g2.setStroke(new BasicStroke(1.2f));
            g2.drawRoundRect(1, 1, w - 3, h - shadowOffset - 2, arc, arc);
        }
        g2.dispose();
        super.paintComponent(g);
    }

    private Color getOutcomeBorder(VerificationState state) {
        return switch (state) {
            case VERIFIED -> ThemeColors.success();
            case DIFFERENCES_FOUND -> ThemeColors.warning();
            case INCOMPLETE -> ThemeColors.danger();
        };
    }

    public void setResult(VerificationResult result) {
        this.currentResult = result;
        if (result == null) {
            setVisible(false);
            return;
        }

        switch (result.state()) {
            case VERIFIED -> {
                stateBadge.setText("✓ VERIFIED — Bit-for-bit Identity Confirmed");
                stateBadge.setForeground(ThemeColors.success());
            }
            case DIFFERENCES_FOUND -> {
                stateBadge.setText("▲ DIFFERENCES DETECTED — Discrepancies Found");
                stateBadge.setForeground(ThemeColors.warning());
            }
            case INCOMPLETE -> {
                stateBadge.setText("✕ INCOMPLETE — Verification Could Not Finish");
                stateBadge.setForeground(ThemeColors.danger());
            }
        }
        summaryLabel.setText(result.summaryMessage());

        setVisible(true);
        repaint();
    }

    private void exportReport(boolean isHtml) {
        if (currentResult == null) return;

        JFileChooser chooser = new JFileChooser();
        String ext = isHtml ? "html" : "txt";
        chooser.setSelectedFile(new File(String.format("photovault_verification_receipt.%s", ext)));
        chooser.setDialogTitle(isHtml ? "Save HTML Audit Report" : "Save TXT Audit Receipt");

        int option = chooser.showSaveDialog(this);
        if (option == JFileChooser.APPROVE_OPTION) {
            File dest = chooser.getSelectedFile();
            try {
                Path destPath = dest.toPath();
                if (isHtml) {
                    Files.writeString(destPath, HtmlReportGenerator.generate(currentResult));
                } else {
                    Files.writeString(destPath, TxtReportGenerator.generate(currentResult));
                }

                if (Desktop.isDesktopSupported() && Desktop.getDesktop().isSupported(Desktop.Action.OPEN)) {
                    int openOpt = JOptionPane.showConfirmDialog(this,
                            "Report successfully saved to:\n" + destPath.toAbsolutePath() + "\n\nWould you like to open it now?",
                            "Report Exported", JOptionPane.YES_NO_OPTION, JOptionPane.INFORMATION_MESSAGE);
                    if (openOpt == JOptionPane.YES_OPTION) {
                        Desktop.getDesktop().open(dest);
                    }
                } else {
                    JOptionPane.showMessageDialog(this,
                            "Report saved successfully to:\n" + destPath.toAbsolutePath(),
                            "Report Exported", JOptionPane.INFORMATION_MESSAGE);
                }
            } catch (Exception ex) {
                JOptionPane.showMessageDialog(this,
                        "Failed to export report: " + ex.getMessage(),
                        "Export Error", JOptionPane.ERROR_MESSAGE);
            }
        }
    }
}
