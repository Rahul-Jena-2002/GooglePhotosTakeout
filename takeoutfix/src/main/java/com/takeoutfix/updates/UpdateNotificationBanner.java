package com.takeoutfix.updates;

import com.takeoutfix.shared.theme.ThemeColors;
import com.takeoutfix.shared.util.AppVersion;
import com.takeoutfix.shared.ui.UiFactory;

import javax.swing.*;
import javax.swing.border.EmptyBorder;
import java.awt.*;

/**
 * Modern, dismissible update notification banner.
 * Displayed dynamically below the main header bar when a new release is detected.
 */
public class UpdateNotificationBanner extends JPanel {

    private final JLabel lblVersionText;
    private final JButton btnUpdateNow;
    private final JButton btnNotes;
    private final JButton btnDismiss;

    private volatile UpdateCheckerService.UpdateInfo activeUpdateInfo = null;

    public UpdateNotificationBanner() {
        super(new BorderLayout(14, 0));
        setOpaque(false);
        setBorder(new EmptyBorder(8, 20, 8, 20));
        setVisible(false);

        // Inner Card Panel for sleek pill/bar look
        JPanel innerCard = new JPanel(new BorderLayout(14, 0)) {
            @Override
            protected void paintComponent(Graphics g) {
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                boolean dark = ThemeColors.isDark();
                // Subtle emerald-indigo tinted glass background
                Color bg = dark ? new Color(16, 185, 129, 28) : new Color(209, 250, 229, 180);
                g2.setColor(bg);
                g2.fillRoundRect(0, 0, getWidth(), getHeight(), 12, 12);
                Color border = dark ? new Color(16, 185, 129, 90) : new Color(16, 185, 129, 120);
                g2.setColor(border);
                g2.setStroke(new BasicStroke(1.2f));
                g2.drawRoundRect(0, 0, getWidth() - 1, getHeight() - 1, 12, 12);
                g2.dispose();
                super.paintComponent(g);
            }
        };
        innerCard.setOpaque(false);
        innerCard.setBorder(new EmptyBorder(6, 14, 6, 12));

        // ── Left: Icon Badge + Release Text ─────────────────────────────────
        JPanel leftBox = new JPanel(new FlowLayout(FlowLayout.LEFT, 10, 0));
        leftBox.setOpaque(false);

        JLabel updateBadge = UiFactory.createBadge("⚡ UPDATE READY", new Color(16, 185, 129, 40), new Color(16, 185, 129));
        leftBox.add(updateBadge);

        lblVersionText = new JLabel("A new version of TakeoutFix is available.");
        lblVersionText.setFont(new Font("Segoe UI", Font.BOLD, 12));
        lblVersionText.setForeground(ThemeColors.textPrimary());
        leftBox.add(lblVersionText);

        innerCard.add(leftBox, BorderLayout.WEST);

        // ── Right: Action Buttons + Dismiss Button ──────────────────────────
        JPanel rightBox = new JPanel(new FlowLayout(FlowLayout.RIGHT, 8, 0));
        rightBox.setOpaque(false);

        btnUpdateNow = UiFactory.createPrimaryButton("Install OTA Update");
        btnUpdateNow.setPreferredSize(new Dimension(145, 28));
        btnUpdateNow.setFont(new Font("Segoe UI", Font.BOLD, 11));
        btnUpdateNow.setBackground(new Color(16, 185, 129));
        btnUpdateNow.addActionListener(e -> {
            if (activeUpdateInfo != null) {
                UpdateCheckerService.performOtaUpdate(SwingUtilities.getWindowAncestor(this), activeUpdateInfo);
            }
        });

        btnNotes = UiFactory.createSecondaryButton("Release Notes");
        btnNotes.setPreferredSize(new Dimension(110, 28));
        btnNotes.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        btnNotes.addActionListener(e -> {
            if (activeUpdateInfo != null) {
                UpdateCheckerService.showUpdateDetailsDialog(SwingUtilities.getWindowAncestor(this), activeUpdateInfo);
            }
        });

        btnDismiss = UiFactory.createSecondaryButton("✕");
        btnDismiss.setPreferredSize(new Dimension(28, 28));
        btnDismiss.setToolTipText("Dismiss update banner");
        btnDismiss.setFont(new Font("Segoe UI", Font.BOLD, 11));
        btnDismiss.addActionListener(e -> dismissBanner());

        rightBox.add(btnUpdateNow);
        rightBox.add(btnNotes);
        rightBox.add(btnDismiss);

        innerCard.add(rightBox, BorderLayout.EAST);
        add(innerCard, BorderLayout.CENTER);

        ThemeColors.addThemeListener(() -> {
            lblVersionText.setForeground(ThemeColors.textPrimary());
            repaint();
        });
    }

    public void showUpdate(UpdateCheckerService.UpdateInfo info) {
        if (info == null || !info.isUpdateAvailable()) return;
        this.activeUpdateInfo = info;
        SwingUtilities.invokeLater(() -> {
            lblVersionText.setText("TakeoutFix " + info.versionTag() + " is available! (Current: v" + AppVersion.getVersion() + ")");
            setVisible(true);
            Container parent = getParent();
            if (parent != null) {
                parent.revalidate();
                parent.repaint();
            }
        });
    }

    public void dismissBanner() {
        SwingUtilities.invokeLater(() -> {
            setVisible(false);
            Container parent = getParent();
            if (parent != null) {
                parent.revalidate();
                parent.repaint();
            }
        });
    }
}
