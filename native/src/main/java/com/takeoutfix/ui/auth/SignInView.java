package com.takeoutfix.ui.auth;

import com.takeoutfix.auth.AuthSession;
import com.takeoutfix.auth.CredentialStore;
import com.takeoutfix.auth.GoogleAuthService;
import com.takeoutfix.auth.SessionManager;
import com.takeoutfix.auth.UserController;
import com.takeoutfix.network.DirectAuthHttpsService;
import com.takeoutfix.shared.theme.ThemeColors;
import com.takeoutfix.shared.ui.UiFactory;

import javax.swing.*;
import javax.swing.border.EmptyBorder;
import java.awt.*;
import java.awt.geom.RoundRectangle2D;
import java.util.Objects;
import java.util.concurrent.CompletableFuture;
import java.util.function.Consumer;

/**
 * Native Swing Sign-In Screen for TakeoutFix.
 *
 * Implements the native authentication flow (matching VS Code / Antigravity IDE):
 * ┌───────────────────────────────────────────┐
 * │                 TakeoutFix                │
 * │         Restore your digital life.        │
 * │                                           │
 * │  Email                                    │
 * │  [ name@example.com                     ] │
 * │                                           │
 * │  Password                                 │
 * │  [ ••••••••••••                         ] │
 * │                                           │
 * │  [               Sign In                ] │
 * │                                           │
 * │  ───────────────   or   ───────────────   │
 * │                                           │
 * │  [ G  Continue with Google              ] │
 * │                                           │
 * │            🔒 Secure authentication       │
 * └───────────────────────────────────────────┘
 */
public class SignInView extends JPanel {

    private static final long serialVersionUID = 1L;
    private static final String FONT_FAMILY = "Segoe UI";

    private final transient GoogleAuthService googleAuthService;
    private final transient SessionManager sessionManager;
    private final transient CredentialStore credentialStore;
    private final transient Consumer<AuthSession> onAuthenticated;

    private final JTextField txtEmail;
    private final JPasswordField txtPassword;
    private final JButton btnSignIn;
    private final JButton btnGoogleSignIn;
    private final JLabel statusLabel;
    private final JProgressBar progressBar;

    public SignInView(GoogleAuthService googleAuthService,
                      SessionManager sessionManager,
                      Consumer<AuthSession> onAuthenticated) {
        this.googleAuthService = Objects.requireNonNull(googleAuthService, "googleAuthService must not be null");
        this.sessionManager = Objects.requireNonNull(sessionManager, "sessionManager must not be null");
        this.credentialStore = new CredentialStore();
        this.onAuthenticated = Objects.requireNonNull(onAuthenticated, "onAuthenticated must not be null");

        setLayout(new GridBagLayout());
        setBackground(ThemeColors.canvasBg());
        setBorder(new EmptyBorder(24, 28, 24, 28));

        JPanel card = new JPanel();
        card.setLayout(new BoxLayout(card, BoxLayout.Y_AXIS));
        card.setOpaque(false);
        card.setAlignmentX(Component.CENTER_ALIGNMENT);

        // 1. Branding Header
        JPanel brandRow = new JPanel(new FlowLayout(FlowLayout.CENTER, 10, 0));
        brandRow.setOpaque(false);
        brandRow.setAlignmentX(Component.CENTER_ALIGNMENT);

        JLabel logo = UiFactory.createBrandLogoLabel(46);
        logo.setPreferredSize(new Dimension(46, 46));
        brandRow.add(logo);
        card.add(brandRow);
        card.add(Box.createVerticalStrut(10));

        JLabel title = new JLabel("TakeoutFix");
        title.setFont(new Font(FONT_FAMILY, Font.BOLD, 22));
        title.setForeground(ThemeColors.textPrimary());
        title.setAlignmentX(Component.CENTER_ALIGNMENT);
        card.add(title);
        card.add(Box.createVerticalStrut(4));

        JLabel subtitle = new JLabel("Restore your digital life.");
        subtitle.setFont(new Font(FONT_FAMILY, Font.PLAIN, 12));
        subtitle.setForeground(ThemeColors.textSecondary());
        subtitle.setAlignmentX(Component.CENTER_ALIGNMENT);
        card.add(subtitle);
        card.add(Box.createVerticalStrut(20));

        // 2. Email Field
        JPanel emailLabelRow = createFieldLabelRow("Email");
        card.add(emailLabelRow);
        card.add(Box.createVerticalStrut(4));

        txtEmail = UiFactory.createTextField("name@example.com");
        txtEmail.setPreferredSize(new Dimension(320, 38));
        txtEmail.setMaximumSize(new Dimension(320, 38));
        txtEmail.setAlignmentX(Component.CENTER_ALIGNMENT);
        card.add(txtEmail);
        card.add(Box.createVerticalStrut(12));

        // 3. Password Field
        JPanel passwordLabelRow = createFieldLabelRow("Password");
        card.add(passwordLabelRow);
        card.add(Box.createVerticalStrut(4));

        txtPassword = UiFactory.createPasswordField("Password");
        txtPassword.setPreferredSize(new Dimension(320, 38));
        txtPassword.setMaximumSize(new Dimension(320, 38));
        txtPassword.setAlignmentX(Component.CENTER_ALIGNMENT);
        card.add(txtPassword);
        card.add(Box.createVerticalStrut(16));

        // 4. "Sign In" Button (Native Email/Password - No Browser Ever)
        btnSignIn = createPrimarySignInButton();
        btnSignIn.setAlignmentX(Component.CENTER_ALIGNMENT);
        btnSignIn.addActionListener(e -> startEmailSignIn());
        card.add(btnSignIn);
        card.add(Box.createVerticalStrut(14));

        // Keyboard Enter navigation
        txtEmail.addActionListener(e -> txtPassword.requestFocusInWindow());
        txtPassword.addActionListener(e -> startEmailSignIn());

        // 5. Divider "or"
        JPanel dividerPanel = createDividerPanel();
        dividerPanel.setAlignmentX(Component.CENTER_ALIGNMENT);
        card.add(dividerPanel);
        card.add(Box.createVerticalStrut(14));

        // 6. "Continue with Google" Button (OAuth loopback flow)
        btnGoogleSignIn = createGoogleButton();
        btnGoogleSignIn.setAlignmentX(Component.CENTER_ALIGNMENT);
        btnGoogleSignIn.addActionListener(e -> startGoogleSignIn());
        card.add(btnGoogleSignIn);
        card.add(Box.createVerticalStrut(12));

        // Progress bar for active authentication handshake
        progressBar = new JProgressBar();
        progressBar.setIndeterminate(true);
        progressBar.setVisible(false);
        progressBar.setPreferredSize(new Dimension(320, 4));
        progressBar.setMaximumSize(new Dimension(320, 4));
        progressBar.setAlignmentX(Component.CENTER_ALIGNMENT);
        card.add(progressBar);
        card.add(Box.createVerticalStrut(8));

        // Status / Error message label
        statusLabel = new JLabel(" ", SwingConstants.CENTER);
        statusLabel.setFont(new Font(FONT_FAMILY, Font.PLAIN, 11));
        statusLabel.setForeground(ThemeColors.textSecondary());
        statusLabel.setAlignmentX(Component.CENTER_ALIGNMENT);
        card.add(statusLabel);
        card.add(Box.createVerticalStrut(12));

        // 7. Footer Note
        JPanel footerRow = new JPanel(new FlowLayout(FlowLayout.CENTER, 6, 0));
        footerRow.setOpaque(false);
        footerRow.setAlignmentX(Component.CENTER_ALIGNMENT);

        JLabel lockIcon = new JLabel("🔒");
        lockIcon.setFont(new Font("Segoe UI Emoji", Font.PLAIN, 11));
        footerRow.add(lockIcon);

        JLabel footerText = new JLabel("Secure authentication");
        footerText.setFont(new Font(FONT_FAMILY, Font.PLAIN, 11));
        footerText.setForeground(ThemeColors.textMuted());
        footerRow.add(footerText);
        card.add(footerRow);

        add(card);

        ThemeColors.addThemeListener(() -> {
            setBackground(ThemeColors.canvasBg());
            title.setForeground(ThemeColors.textPrimary());
            subtitle.setForeground(ThemeColors.textSecondary());
            footerText.setForeground(ThemeColors.textMuted());
            repaint();
        });
    }

    private JPanel createFieldLabelRow(String text) {
        JPanel row = new JPanel(new FlowLayout(FlowLayout.LEFT, 0, 0));
        row.setOpaque(false);
        row.setPreferredSize(new Dimension(320, 18));
        row.setMaximumSize(new Dimension(320, 18));
        row.setAlignmentX(Component.CENTER_ALIGNMENT);

        JLabel label = new JLabel(text);
        label.setFont(new Font(FONT_FAMILY, Font.BOLD, 11));
        label.setForeground(ThemeColors.textSecondary());
        ThemeColors.addThemeListener(() -> label.setForeground(ThemeColors.textSecondary()));
        row.add(label);
        return row;
    }

    private JPanel createDividerPanel() {
        JPanel panel = new JPanel(new GridBagLayout());
        panel.setOpaque(false);
        panel.setPreferredSize(new Dimension(320, 20));
        panel.setMaximumSize(new Dimension(320, 20));

        GridBagConstraints gbc = new GridBagConstraints();
        gbc.fill = GridBagConstraints.HORIZONTAL;
        gbc.gridy = 0;

        JSeparator leftSep = new JSeparator();
        leftSep.setForeground(ThemeColors.cardBorder());
        gbc.weightx = 1.0;
        gbc.gridx = 0;
        panel.add(leftSep, gbc);

        JLabel orLabel = new JLabel("  or  ", SwingConstants.CENTER);
        orLabel.setFont(new Font(FONT_FAMILY, Font.PLAIN, 11));
        orLabel.setForeground(ThemeColors.textMuted());
        gbc.weightx = 0.0;
        gbc.gridx = 1;
        panel.add(orLabel, gbc);

        JSeparator rightSep = new JSeparator();
        rightSep.setForeground(ThemeColors.cardBorder());
        gbc.weightx = 1.0;
        gbc.gridx = 2;
        panel.add(rightSep, gbc);

        ThemeColors.addThemeListener(() -> {
            leftSep.setForeground(ThemeColors.cardBorder());
            rightSep.setForeground(ThemeColors.cardBorder());
            orLabel.setForeground(ThemeColors.textMuted());
        });

        return panel;
    }

    private JButton createPrimarySignInButton() {
        JButton btn = new JButton("Sign In") {
            private static final long serialVersionUID = 1L;

            @Override
            protected void paintComponent(Graphics g) {
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);

                boolean dark = ThemeColors.isDark();
                Color bg;
                if (!isEnabled()) {
                    bg = dark ? new Color(55, 55, 62) : new Color(210, 210, 215);
                } else if (getModel().isPressed()) {
                    bg = ThemeColors.accent().darker();
                } else if (getModel().isRollover()) {
                    bg = ThemeColors.accent().brighter();
                } else {
                    bg = ThemeColors.accent();
                }

                g2.setColor(bg);
                g2.fill(new RoundRectangle2D.Float(0, 0, getWidth(), getHeight(), 10, 10));

                g2.setFont(new Font(FONT_FAMILY, Font.BOLD, 13));
                g2.setColor(Color.WHITE);
                FontMetrics fm = g2.getFontMetrics();
                int textX = (getWidth() - fm.stringWidth(getText())) / 2;
                int textY = (getHeight() + fm.getAscent() - fm.getDescent()) / 2;
                g2.drawString(getText(), textX, textY);

                g2.dispose();
            }
        };

        btn.setPreferredSize(new Dimension(320, 42));
        btn.setMaximumSize(new Dimension(320, 42));
        btn.setContentAreaFilled(false);
        btn.setBorderPainted(false);
        btn.setFocusPainted(false);
        btn.setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
        return btn;
    }

    private JButton createGoogleButton() {
        JButton btn = new JButton("Continue with Google") {
            private static final long serialVersionUID = 1L;

            @Override
            protected void paintComponent(Graphics g) {
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);

                boolean dark = ThemeColors.isDark();
                Color bg = getGoogleButtonBackground(dark, getModel());
                Color border = dark ? new Color(63, 63, 70) : new Color(228, 228, 231);

                g2.setColor(bg);
                g2.fill(new RoundRectangle2D.Float(0, 0, getWidth(), getHeight(), 10, 10));

                g2.setColor(border);
                g2.setStroke(new BasicStroke(1.2f));
                g2.draw(new RoundRectangle2D.Float(0.6f, 0.6f, getWidth() - 1.2f, getHeight() - 1.2f, 10, 10));

                // Draw Google G icon
                int iconSize = 18;
                int iconX = 22;
                int iconY = (getHeight() - iconSize) / 2;
                drawGoogleIcon(g2, iconX, iconY, iconSize);

                // Draw Text
                g2.setFont(new Font(FONT_FAMILY, Font.BOLD, 13));
                Color textColor = dark ? Color.WHITE : new Color(24, 24, 27);
                g2.setColor(textColor);
                FontMetrics fm = g2.getFontMetrics();
                int textX = (getWidth() - fm.stringWidth(getText())) / 2 + 10;
                int textY = (getHeight() + fm.getAscent() - fm.getDescent()) / 2;
                g2.drawString(getText(), textX, textY);

                g2.dispose();
            }
        };

        btn.setPreferredSize(new Dimension(320, 44));
        btn.setMaximumSize(new Dimension(320, 44));
        btn.setContentAreaFilled(false);
        btn.setBorderPainted(false);
        btn.setFocusPainted(false);
        btn.setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
        return btn;
    }

    private Color getGoogleButtonBackground(boolean dark, ButtonModel model) {
        if (!model.isEnabled()) {
            return dark ? new Color(28, 28, 30) : new Color(245, 245, 247);
        }
        if (model.isPressed()) {
            return dark ? new Color(30, 30, 34) : new Color(244, 244, 245);
        }
        if (model.isRollover()) {
            return dark ? new Color(50, 50, 56) : new Color(248, 250, 252);
        }
        return dark ? new Color(39, 39, 42) : Color.WHITE;
    }

    private void drawGoogleIcon(Graphics2D g2, int x, int y, int size) {
        g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);

        // Blue right-arm
        g2.setColor(new Color(66, 133, 244));
        g2.fillArc(x, y, size, size, 0, 90);

        // Red top
        g2.setColor(new Color(234, 67, 53));
        g2.fillArc(x, y, size, size, 90, 90);

        // Yellow left
        g2.setColor(new Color(251, 188, 5));
        g2.fillArc(x, y, size, size, 180, 90);

        // Green bottom
        g2.setColor(new Color(52, 168, 83));
        g2.fillArc(x, y, size, size, 270, 90);

        // Center cutout
        boolean dark = ThemeColors.isDark();
        Color centerColor;
        if (btnGoogleSignIn.getModel().isRollover()) {
            centerColor = dark ? new Color(50, 50, 56) : new Color(248, 250, 252);
        } else {
            centerColor = dark ? new Color(39, 39, 42) : Color.WHITE;
        }
        g2.setColor(centerColor);
        int inner = size / 2;
        int inOff = size / 4;
        g2.fillOval(x + inOff, y + inOff, inner, inner);

        // Blue crossbar
        g2.setColor(new Color(66, 133, 244));
        g2.fillRect(x + size / 2, y + size / 2 - 2, size / 2, 4);
    }

    /**
     * STEP 2 — Direct Email/Password Path (No browser, ever)
     * Calls POST https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={API_KEY}
     * Persists idToken and refreshToken to session.json via CredentialStore.
     */
    private void startEmailSignIn() {
        String email = txtEmail.getText().trim();
        String password = new String(txtPassword.getPassword()).trim();

        if (email.isEmpty() || password.isEmpty()) {
            statusLabel.setText("Please enter both email and password.");
            statusLabel.setForeground(ThemeColors.danger());
            return;
        }

        setLoading(true);
        statusLabel.setText("Signing in...");
        statusLabel.setForeground(ThemeColors.accent());

        CompletableFuture
                .supplyAsync(() -> executeEmailAuth(email, password))
                .whenComplete((session, error) -> SwingUtilities.invokeLater(() -> handleEmailSignInResult(session, error)));
    }

    private AuthSession executeEmailAuth(String email, String password) {
        try {
            return DirectAuthHttpsService.authenticateWithEmailPassword(email, password);
        } catch (Exception e) {
            throw new java.util.concurrent.CompletionException(e);
        }
    }

    private void handleEmailSignInResult(AuthSession session, Throwable error) {
        setLoading(false);
        if (error != null) {
            Throwable cause = error.getCause() != null ? error.getCause() : error;
            String msg = cause.getMessage() != null ? cause.getMessage() : "Authentication failed.";
            statusLabel.setText(msg);
            statusLabel.setForeground(ThemeColors.danger());
            return;
        }
        if (session != null && session.isAuthenticated()) {
            statusLabel.setText("Signed in successfully as " + session.getEmail());
            statusLabel.setForeground(ThemeColors.success());

            credentialStore.saveSession(session);
            sessionManager.save(session);
            UserController.syncUser(session.toMap());

            onAuthenticated.accept(session);
        } else {
            statusLabel.setText("Authentication failed. Please verify credentials.");
            statusLabel.setForeground(ThemeColors.danger());
        }
    }

    /**
     * STEP 3 — Google Path (Browser loopback with select_account)
     */
    private void startGoogleSignIn() {
        setLoading(true);
        statusLabel.setText("Opening browser for Google authentication...");
        statusLabel.setForeground(ThemeColors.accent());

        googleAuthService.authenticate()
                .whenComplete((session, error) -> SwingUtilities.invokeLater(() -> handleGoogleSignInResult(session, error)));
    }

    private void handleGoogleSignInResult(AuthSession session, Throwable error) {
        setLoading(false);
        if (error != null) {
            statusLabel.setText("Authentication cancelled or timed out. Please try again.");
            statusLabel.setForeground(ThemeColors.danger());
            return;
        }
        if (session != null && session.isAuthenticated()) {
            statusLabel.setText("Signed in successfully as " + session.getEmail());
            statusLabel.setForeground(ThemeColors.success());

            credentialStore.saveSession(session);
            sessionManager.save(session);
            UserController.syncUser(session.toMap());

            onAuthenticated.accept(session);
        } else {
            statusLabel.setText("Authentication failed. Please try again.");
            statusLabel.setForeground(ThemeColors.danger());
        }
    }

    private void setLoading(boolean loading) {
        txtEmail.setEnabled(!loading);
        txtPassword.setEnabled(!loading);
        btnSignIn.setEnabled(!loading);
        btnGoogleSignIn.setEnabled(!loading);
        progressBar.setVisible(loading);
    }
}
