package com.takeoutfix.auth.ui;

import com.takeoutfix.shared.theme.ThemeColors;
import com.takeoutfix.shared.ui.UiFactory;

import javax.swing.*;
import javax.swing.border.EmptyBorder;
import java.awt.*;
import java.awt.geom.RoundRectangle2D;

/**
 * Modern, non-intrusive authentication status banner matching modern IDE/system status pills.
 *
 * Displays:
 *  - "⚠️ Authenticating..." while silent token revalidation is in flight on startup.
 *  - "✓ Authenticated as email (plan)" on successful completion (auto-fades after 2.5s).
 *  - "⚠️ Session expired. Running in Guest Mode" if refresh token is invalid.
 */
public class AuthStatusBanner extends JPanel {

    private final JLabel iconLabel;
    private final JLabel messageLabel;
    private final JButton actionButton;
    private final JButton dismissButton;
    private final JPanel innerPill;

    private Color pillBgColor;
    private Color pillBorderColor;
    private Color textColor;
    private Timer autoDismissTimer;

    public AuthStatusBanner() {
        super(new BorderLayout());
        setOpaque(false);
        setBorder(new EmptyBorder(6, 20, 4, 20));
        setVisible(false);

        // Center-aligned or left-aligned pill
        innerPill = new JPanel(new BorderLayout(10, 0)) {
            @Override
            protected void paintComponent(Graphics g) {
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                int w = getWidth();
                int h = getHeight();

                g2.setColor(pillBgColor != null ? pillBgColor : new Color(38, 38, 42));
                g2.fill(new RoundRectangle2D.Float(0, 0, w, h, 14, 14));

                g2.setColor(pillBorderColor != null ? pillBorderColor : new Color(245, 158, 11, 70));
                g2.setStroke(new BasicStroke(1.0f));
                g2.draw(new RoundRectangle2D.Float(0.5f, 0.5f, w - 1f, h - 1f, 14, 14));

                g2.dispose();
                super.paintComponent(g);
            }
        };
        innerPill.setOpaque(false);
        innerPill.setBorder(new EmptyBorder(6, 12, 6, 12));

        // ── Left: Warning / Status Icon + Message ───────────────────────────
        JPanel leftBox = new JPanel(new FlowLayout(FlowLayout.LEFT, 8, 0));
        leftBox.setOpaque(false);

        iconLabel = new JLabel("⚠️");
        iconLabel.setFont(new Font("Segoe UI Emoji", Font.PLAIN, 13));
        leftBox.add(iconLabel);

        messageLabel = new JLabel("Authenticating...");
        messageLabel.setFont(new Font("Segoe UI", Font.PLAIN, 12));
        messageLabel.setForeground(new Color(245, 158, 11));
        leftBox.add(messageLabel);

        innerPill.add(leftBox, BorderLayout.WEST);

        // ── Right: Optional Action Button + Dismiss ─────────────────────────
        JPanel rightBox = new JPanel(new FlowLayout(FlowLayout.RIGHT, 6, 0));
        rightBox.setOpaque(false);

        actionButton = UiFactory.createSecondaryButton("Sign In");
        actionButton.setPreferredSize(new Dimension(80, 24));
        actionButton.setFont(new Font("Segoe UI", Font.BOLD, 11));
        actionButton.setVisible(false);
        rightBox.add(actionButton);

        dismissButton = UiFactory.createSecondaryButton("✕");
        dismissButton.setPreferredSize(new Dimension(24, 24));
        dismissButton.setFont(new Font("Segoe UI", Font.BOLD, 10));
        dismissButton.setToolTipText("Dismiss banner");
        dismissButton.addActionListener(e -> hideBanner());
        rightBox.add(dismissButton);

        innerPill.add(rightBox, BorderLayout.EAST);

        add(innerPill, BorderLayout.CENTER);

        updateThemeColors();
        ThemeColors.addThemeListener(this::updateThemeColors);
    }

    private enum State {
        AUTHENTICATING,
        AUTHENTICATED,
        OFFLINE,
        EXPIRED,
        HIDDEN
    }

    private State currentState = State.HIDDEN;

    private void updateThemeColors() {
        boolean dark = ThemeColors.isDark();
        switch (currentState) {
            case AUTHENTICATING -> {
                pillBgColor = dark ? new Color(34, 34, 38, 245) : new Color(254, 243, 199, 235);
                pillBorderColor = dark ? new Color(245, 158, 11, 80) : new Color(245, 158, 11, 140);
                textColor = dark ? new Color(251, 191, 36) : new Color(180, 83, 9);
            }
            case AUTHENTICATED -> {
                pillBgColor = dark ? new Color(16, 185, 129, 32) : new Color(209, 250, 229, 235);
                pillBorderColor = dark ? new Color(16, 185, 129, 90) : new Color(16, 185, 129, 140);
                textColor = dark ? new Color(52, 211, 153) : new Color(4, 120, 87);
            }
            case OFFLINE -> {
                pillBgColor = dark ? new Color(59, 130, 246, 30) : new Color(219, 234, 254, 235);
                pillBorderColor = dark ? new Color(59, 130, 246, 90) : new Color(59, 130, 246, 140);
                textColor = dark ? new Color(147, 197, 253) : new Color(29, 78, 216);
            }
            case EXPIRED -> {
                pillBgColor = dark ? new Color(239, 68, 68, 30) : new Color(254, 226, 226, 235);
                pillBorderColor = dark ? new Color(239, 68, 68, 90) : new Color(239, 68, 68, 140);
                textColor = dark ? new Color(248, 113, 113) : new Color(185, 28, 28);
            }
            case HIDDEN -> {
                pillBgColor = dark ? new Color(34, 34, 38, 245) : new Color(254, 243, 199, 235);
                pillBorderColor = dark ? new Color(245, 158, 11, 80) : new Color(245, 158, 11, 140);
                textColor = dark ? new Color(251, 191, 36) : new Color(180, 83, 9);
            }
        }
        if (messageLabel != null) {
            messageLabel.setForeground(textColor);
        }
        repaint();
    }

    /**
     * Displays the authenticating pill banner matching the user request:
     * ⚠️ Authenticating...
     */
    public void showAuthenticating(String message) {
        cancelTimer();
        currentState = State.AUTHENTICATING;
        SwingUtilities.invokeLater(() -> {
            updateThemeColors();

            iconLabel.setText("⚠️");
            messageLabel.setText(message != null ? message : "Authenticating...");
            actionButton.setVisible(false);
            dismissButton.setVisible(true);

            setVisible(true);
            revalidate();
            repaint();
        });
    }

    /**
     * Shows brief green success status then auto-hides after 2.5 seconds.
     */
    public void showAuthenticated(String email, String plan) {
        cancelTimer();
        currentState = State.AUTHENTICATED;
        SwingUtilities.invokeLater(() -> {
            updateThemeColors();

            iconLabel.setText("✓");
            String displayPlan = (plan != null && !plan.isBlank()) ? " (" + plan.toUpperCase() + ")" : "";
            messageLabel.setText("Authenticated as " + email + displayPlan);
            actionButton.setVisible(false);
            dismissButton.setVisible(true);

            setVisible(true);
            revalidate();
            repaint();

            // Auto-hide after 2.5 seconds
            autoDismissTimer = new Timer(2500, e -> hideBanner());
            autoDismissTimer.setRepeats(false);
            autoDismissTimer.start();
        });
    }

    /**
     * Shows offline status using cached credentials.
     */
    public void showOffline(String email) {
        cancelTimer();
        currentState = State.OFFLINE;
        SwingUtilities.invokeLater(() -> {
            updateThemeColors();

            iconLabel.setText("⚡");
            messageLabel.setText("Offline Mode: using cached session for " + email);
            actionButton.setVisible(false);
            dismissButton.setVisible(true);

            setVisible(true);
            revalidate();
            repaint();

            autoDismissTimer = new Timer(5000, e -> hideBanner());
            autoDismissTimer.setRepeats(false);
            autoDismissTimer.start();
        });
    }

    /**
     * Shows session expired warning with a 1-click Sign In action button.
     */
    public void showSessionExpired(Runnable onSignIn) {
        cancelTimer();
        currentState = State.EXPIRED;
        SwingUtilities.invokeLater(() -> {
            updateThemeColors();

            iconLabel.setText("⚠️");
            messageLabel.setText("Session expired. Running in Guest Mode.");

            if (onSignIn != null) {
                // Clear old listeners
                for (java.awt.event.ActionListener al : actionButton.getActionListeners()) {
                    actionButton.removeActionListener(al);
                }
                actionButton.setText("Sign In");
                actionButton.addActionListener(e -> {
                    hideBanner();
                    onSignIn.run();
                });
                actionButton.setVisible(true);
            } else {
                actionButton.setVisible(false);
            }

            dismissButton.setVisible(true);

            setVisible(true);
            revalidate();
            repaint();
        });
    }

    public void hideBanner() {
        cancelTimer();
        currentState = State.HIDDEN;
        SwingUtilities.invokeLater(() -> {
            setVisible(false);
            revalidate();
            repaint();
        });
    }

    private void cancelTimer() {
        if (autoDismissTimer != null && autoDismissTimer.isRunning()) {
            autoDismissTimer.stop();
            autoDismissTimer = null;
        }
    }
}
