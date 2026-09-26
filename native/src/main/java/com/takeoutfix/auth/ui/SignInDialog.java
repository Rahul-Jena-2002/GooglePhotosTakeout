package com.takeoutfix.auth.ui;

import com.takeoutfix.auth.AuthSession;
import com.takeoutfix.auth.CredentialStore;
import com.takeoutfix.auth.FirebaseTokenService;
import com.takeoutfix.auth.GoogleAuthService;
import com.takeoutfix.auth.UserController;
import com.takeoutfix.auth.UserSyncBridgeService;
import com.takeoutfix.network.DirectAuthHttpsService;
import com.takeoutfix.shared.theme.ThemeColors;
import com.takeoutfix.shared.ui.UiFactory;

import javax.swing.*;
import javax.swing.border.EmptyBorder;
import java.awt.*;
import java.awt.event.WindowAdapter;
import java.awt.event.WindowEvent;
import java.awt.geom.RoundRectangle2D;
import java.util.concurrent.CompletableFuture;

/**
 * Native Sign-In Dialog for TakeoutFix Desktop.
 *
 * Implements the native authentication flow:
 * ┌──────────────────────────────────┐
 * │           TakeoutFix             │
 * │   Restore your digital life.     │
 * │                                  │
 * │  Email                           │
 * │  [ name@example.com            ] │
 * │  Password                        │
 * │  [ ••••••••••••                ] │
 * │  [          Sign In            ] │
 * │  ────────────  or  ────────────  │
 * │  [ G   Continue with Google    ] │
 * │       🔒 Secure authentication   │
 * └──────────────────────────────────┘
 */
public class SignInDialog extends JDialog {

    private static final long serialVersionUID = 1L;
    private static final String FONT_FAMILY = "Segoe UI";

    private final transient UserSyncBridgeService userService;
    private final transient GoogleAuthService googleAuthService;
    private final transient CredentialStore credentialStore;
    private final boolean isStartupGate;
    private boolean authenticated = false;

    private final JTextField txtEmail;
    private final JPasswordField txtPassword;
    private final JButton btnSignIn;
    private final JButton btnGoogleSignIn;
    private final JLabel statusLabel;
    private final JProgressBar progressBar;

    public SignInDialog(Frame owner, UserSyncBridgeService userService) {
        this(owner, userService, false);
    }

    public SignInDialog(Frame owner, UserSyncBridgeService userService, boolean isStartupGate) {
        super(owner, "TakeoutFix — Sign In", true);
        this.userService = userService;
        this.googleAuthService = userService != null ? userService.getGoogleAuthService() : new GoogleAuthService();
        this.credentialStore = new CredentialStore();
        this.isStartupGate = isStartupGate;
        UiFactory.applyAppIcon(this);

        setSize(440, 560);
        setLocationRelativeTo(owner);
        setResizable(false);
        getContentPane().setBackground(ThemeColors.cardBg());
        setLayout(new BorderLayout());

        // Intercept window close when functioning as a strict startup gate
        setDefaultCloseOperation(WindowConstants.DO_NOTHING_ON_CLOSE);
        addWindowListener(new WindowAdapter() {
            @Override
            public void windowClosing(WindowEvent e) {
                if (SignInDialog.this.isStartupGate && !authenticated) {
                    System.exit(0);
                } else {
                    dispose();
                }
            }
        });

        JPanel root = new JPanel();
        root.setLayout(new BoxLayout(root, BoxLayout.Y_AXIS));
        root.setBackground(ThemeColors.cardBg());
        root.setBorder(new EmptyBorder(28, 36, 24, 36));

        // 1. Branding Header
        JPanel brandRow = new JPanel(new FlowLayout(FlowLayout.CENTER, 10, 0));
        brandRow.setOpaque(false);
        brandRow.setAlignmentX(Component.CENTER_ALIGNMENT);

        JLabel logo = UiFactory.createBrandLogoLabel(44);
        logo.setPreferredSize(new Dimension(44, 44));
        brandRow.add(logo);
        root.add(brandRow);
        root.add(Box.createVerticalStrut(10));

        JLabel title = new JLabel("TakeoutFix");
        title.setFont(new Font(FONT_FAMILY, Font.BOLD, 22));
        title.setForeground(ThemeColors.textPrimary());
        title.setAlignmentX(Component.CENTER_ALIGNMENT);
        root.add(title);
        root.add(Box.createVerticalStrut(4));

        JLabel subtitle = new JLabel("Restore your digital life.");
        subtitle.setFont(new Font(FONT_FAMILY, Font.PLAIN, 12));
        subtitle.setForeground(ThemeColors.textSecondary());
        subtitle.setAlignmentX(Component.CENTER_ALIGNMENT);
        root.add(subtitle);
        root.add(Box.createVerticalStrut(20));

        // 2. Email Field
        JPanel emailLabelRow = createFieldLabelRow("Email");
        root.add(emailLabelRow);
        root.add(Box.createVerticalStrut(4));

        txtEmail = UiFactory.createTextField("name@example.com");
        txtEmail.setPreferredSize(new Dimension(320, 38));
        txtEmail.setMaximumSize(new Dimension(320, 38));
        txtEmail.setAlignmentX(Component.CENTER_ALIGNMENT);
        root.add(txtEmail);
        root.add(Box.createVerticalStrut(12));

        // 3. Password Field
        JPanel passwordLabelRow = createFieldLabelRow("Password");
        root.add(passwordLabelRow);
        root.add(Box.createVerticalStrut(4));

        txtPassword = UiFactory.createPasswordField("Password");
        txtPassword.setPreferredSize(new Dimension(320, 38));
        txtPassword.setMaximumSize(new Dimension(320, 38));
        txtPassword.setAlignmentX(Component.CENTER_ALIGNMENT);
        root.add(txtPassword);
        root.add(Box.createVerticalStrut(16));

        // 4. "Sign In" Button (Direct Email/Password - No Browser)
        btnSignIn = createPrimarySignInButton();
        btnSignIn.setAlignmentX(Component.CENTER_ALIGNMENT);
        btnSignIn.addActionListener(e -> startEmailSignIn());
        root.add(btnSignIn);
        root.add(Box.createVerticalStrut(14));

        txtEmail.addActionListener(e -> txtPassword.requestFocusInWindow());
        txtPassword.addActionListener(e -> startEmailSignIn());

        // 5. Divider "or"
        JPanel dividerPanel = createDividerPanel();
        dividerPanel.setAlignmentX(Component.CENTER_ALIGNMENT);
        root.add(dividerPanel);
        root.add(Box.createVerticalStrut(14));

        // 6. "Continue with Google" Button (Loopback browser with select_account)
        btnGoogleSignIn = createGoogleButton();
        btnGoogleSignIn.setAlignmentX(Component.CENTER_ALIGNMENT);
        btnGoogleSignIn.addActionListener(e -> startGoogleSignIn());
        root.add(btnGoogleSignIn);
        root.add(Box.createVerticalStrut(6));

        // Enterprise Fallback: Manual Token Entry (IntelliJ style)
        JButton btnManualToken = new JButton("Trouble connecting? Paste code manually");
        btnManualToken.setFont(new Font(FONT_FAMILY, Font.PLAIN, 11));
        btnManualToken.setForeground(ThemeColors.accent());
        btnManualToken.setBorderPainted(false);
        btnManualToken.setContentAreaFilled(false);
        btnManualToken.setFocusPainted(false);
        btnManualToken.setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
        btnManualToken.setAlignmentX(Component.CENTER_ALIGNMENT);
        btnManualToken.addActionListener(e -> promptManualToken());
        root.add(btnManualToken);
        root.add(Box.createVerticalStrut(8));

        // Progress bar for active request
        progressBar = new JProgressBar();
        progressBar.setIndeterminate(true);
        progressBar.setVisible(false);
        progressBar.setPreferredSize(new Dimension(320, 4));
        progressBar.setMaximumSize(new Dimension(320, 4));
        progressBar.setAlignmentX(Component.CENTER_ALIGNMENT);
        root.add(progressBar);
        root.add(Box.createVerticalStrut(8));

        // Status Label
        statusLabel = new JLabel(" ", SwingConstants.CENTER);
        statusLabel.setFont(new Font(FONT_FAMILY, Font.PLAIN, 11));
        statusLabel.setForeground(ThemeColors.textSecondary());
        statusLabel.setAlignmentX(Component.CENTER_ALIGNMENT);
        root.add(statusLabel);
        root.add(Box.createVerticalStrut(12));

        // 7. Footer Lock Note
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
        root.add(footerRow);

        add(root, BorderLayout.CENTER);
    }

    public boolean isStartupGate() {
        return isStartupGate;
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

                int iconSize = 18;
                int iconX = 22;
                int iconY = (getHeight() - iconSize) / 2;
                drawGoogleIcon(g2, iconX, iconY, iconSize);

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

        g2.setColor(new Color(66, 133, 244));
        g2.fillArc(x, y, size, size, 0, 90);

        g2.setColor(new Color(234, 67, 53));
        g2.fillArc(x, y, size, size, 90, 90);

        g2.setColor(new Color(251, 188, 5));
        g2.fillArc(x, y, size, size, 180, 90);

        g2.setColor(new Color(52, 168, 83));
        g2.fillArc(x, y, size, size, 270, 90);

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

        g2.setColor(new Color(66, 133, 244));
        g2.fillRect(x + size / 2, y + size / 2 - 2, size / 2, 4);
    }

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
            authenticated = true;
            credentialStore.saveSession(session);
            if (userService != null) {
                userService.getSessionManager().save(session);
                UserController.syncUser(session.toMap());
                userService.triggerCloudSync(null);
            }
            if (getOwner() != null) {
                getOwner().toFront();
                getOwner().requestFocus();
            }
            dispose();
        } else {
            statusLabel.setText("Authentication failed. Please verify credentials.");
            statusLabel.setForeground(ThemeColors.danger());
        }
    }

    private void startGoogleSignIn() {
        setLoading(true);
        statusLabel.setText("Opening browser for Google authentication...");
        statusLabel.setForeground(ThemeColors.accent());

        googleAuthService.authenticate()
                .whenComplete((session, error) -> SwingUtilities.invokeLater(() -> handleGoogleSignInResult(session, error)));
    }

    private void promptManualToken() {
        String input = JOptionPane.showInputDialog(
                this,
                "Paste the authorization code or token from your browser:",
                "Enterprise Login — Manual Code",
                JOptionPane.PLAIN_MESSAGE
        );
        if (input != null && !input.trim().isEmpty()) {
            startManualTokenAuth(input.trim());
        }
    }

    private void startManualTokenAuth(String rawInput) {
        setLoading(true);
        statusLabel.setText("Verifying authorization code...");
        statusLabel.setForeground(ThemeColors.accent());

        CompletableFuture.supplyAsync(() -> {
            try {
                FirebaseTokenService tokenService = new FirebaseTokenService();
                java.util.Map<String, Object> map = new java.util.HashMap<>();

                // Check if base64 encoded JSON string
                if (!rawInput.startsWith("ey") && rawInput.length() > 20) {
                    try {
                        byte[] decoded = java.util.Base64.getDecoder().decode(rawInput);
                        String jsonStr = new String(decoded, java.nio.charset.StandardCharsets.UTF_8);
                        if (jsonStr.startsWith("{")) {
                            org.json.JSONObject obj = new org.json.JSONObject(jsonStr);
                            for (String key : obj.keySet()) {
                                map.put(key, obj.get(key));
                            }
                            return tokenService.exchangeGoogleCredential(map);
                        }
                    } catch (Exception ignored) {}
                }

                map.put("token", rawInput);
                map.put("idToken", rawInput);
                return tokenService.exchangeGoogleCredential(map);
            } catch (Exception e) {
                throw new java.util.concurrent.CompletionException(e);
            }
        }).whenComplete((session, error) -> SwingUtilities.invokeLater(() -> handleGoogleSignInResult(session, error)));
    }

    private void handleGoogleSignInResult(AuthSession session, Throwable error) {
        setLoading(false);
        if (error != null) {
            statusLabel.setText("Authentication cancelled or timed out. Please try again.");
            statusLabel.setForeground(ThemeColors.danger());
            return;
        }
        if (session != null && session.isAuthenticated()) {
            authenticated = true;
            credentialStore.saveSession(session);
            if (userService != null) {
                userService.getSessionManager().save(session);
                UserController.syncUser(session.toMap());
                userService.triggerCloudSync(null);
            }
            if (getOwner() != null) {
                getOwner().toFront();
                getOwner().requestFocus();
            }
            dispose();
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

    public boolean isAuthenticated() {
        return authenticated;
    }
}
