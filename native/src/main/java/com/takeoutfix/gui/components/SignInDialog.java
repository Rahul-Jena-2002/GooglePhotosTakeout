package com.takeoutfix.gui.components;

import com.takeoutfix.gui.service.DesktopAuthServer;
import com.takeoutfix.gui.service.UserSyncBridgeService;
import com.takeoutfix.gui.theme.ThemeColors;

import javax.swing.*;
import javax.swing.border.EmptyBorder;
import javax.swing.border.LineBorder;
import java.awt.*;
import java.net.URI;
import java.util.Map;
import java.util.function.Consumer;

/**
 * Modern Native Sign-In & Authentication Dialog.
 * Supports:
 *  1. Sign In with Google (Standard browser redirect via local auth port)
 *  2. Direct Email & Password Sign-In and Registration via secure HTTPS REST API
 *  3. Password Reset
 */
public class SignInDialog extends JDialog {

    private final UserSyncBridgeService userService;
    private final Consumer<Map<String, Object>> authListener;

    private final JLabel statusLabel;
    private final JButton btnGoogleSignIn;
    private final JButton btnCancelGoogle;

    private final JTextField emailField;
    private final JLabel lblPassword;
    private final JPasswordField passwordField;
    private final JButton btnEmailSubmit;
    private final JButton btnToggleMode;
    private final JButton btnForgotPassword;

    private boolean isSignUpMode = false;

    public SignInDialog(Frame owner, UserSyncBridgeService userService) {
        super(owner, "TakeoutFix — Sign In", true);
        this.userService = userService;

        setSize(480, 600);
        setLocationRelativeTo(owner);
        setResizable(false);
        getContentPane().setBackground(ThemeColors.cardBg());
        setLayout(new BorderLayout());

        JPanel root = new JPanel();
        root.setLayout(new BoxLayout(root, BoxLayout.Y_AXIS));
        root.setBackground(ThemeColors.cardBg());
        root.setBorder(new EmptyBorder(24, 32, 24, 32));

        // ── 1. Branding Header ───────────────────────────────────────────────
        JPanel brandRow = new JPanel(new FlowLayout(FlowLayout.CENTER, 10, 0));
        brandRow.setOpaque(false);
        brandRow.setAlignmentX(Component.CENTER_ALIGNMENT);

        JLabel logo = UiFactory.createLogoBadge("TF", ThemeColors.accent(), Color.WHITE);
        logo.setPreferredSize(new Dimension(36, 36));
        brandRow.add(logo);

        JLabel title = new JLabel("TakeoutFix Account");
        title.setFont(new Font("Segoe UI", Font.BOLD, 20));
        title.setForeground(ThemeColors.textPrimary());
        brandRow.add(title);
        root.add(brandRow);
        root.add(Box.createVerticalStrut(6));

        JLabel subtitle = new JLabel("<html><center>Sign in to unlock archive restoration, EXIF metadata tools, and cloud synchronization.</center></html>");
        subtitle.setFont(new Font("Segoe UI", Font.PLAIN, 12));
        subtitle.setForeground(ThemeColors.textSecondary());
        subtitle.setAlignmentX(Component.CENTER_ALIGNMENT);
        root.add(subtitle);
        root.add(Box.createVerticalStrut(20));

        // ── 2. Sign In with Google ───────────────────────────────────────────
        btnGoogleSignIn = new JButton("Sign in with Google") {
            @Override
            protected void paintComponent(Graphics g) {
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                g2.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);

                boolean dark = ThemeColors.isDark();
                Color bg = !isEnabled() ? (dark ? new Color(39, 39, 42) : new Color(241, 245, 249))
                        : getModel().isArmed() ? (dark ? new Color(45, 45, 50) : new Color(241, 245, 249))
                        : getModel().isRollover() ? (dark ? new Color(35, 35, 40) : new Color(248, 250, 252))
                        : (dark ? new Color(24, 24, 27) : Color.WHITE);
                Color border = dark ? new Color(63, 63, 70) : new Color(226, 232, 240);

                g2.setColor(bg);
                g2.fillRoundRect(0, 0, getWidth(), getHeight(), 12, 12);
                g2.setColor(border);
                g2.setStroke(new BasicStroke(1.2f));
                g2.drawRoundRect(0, 0, getWidth() - 1, getHeight() - 1, 12, 12);

                int iconSize = 18;
                int iconX = 22;
                int iconY = (getHeight() - iconSize) / 2;
                drawGoogleIcon(g2, iconX, iconY, iconSize);

                g2.setFont(getFont());
                g2.setColor(!isEnabled() ? (dark ? new Color(113, 113, 122) : new Color(148, 163, 184))
                        : (dark ? Color.WHITE : new Color(15, 23, 42)));
                FontMetrics fm = g2.getFontMetrics();
                int textX = (getWidth() - fm.stringWidth(getText())) / 2 + 10;
                int textY = (getHeight() - fm.getHeight()) / 2 + fm.getAscent();
                g2.drawString(getText(), textX, textY);

                g2.dispose();
            }
        };
        btnGoogleSignIn.setFont(new Font("Segoe UI", Font.BOLD, 13));
        btnGoogleSignIn.setFocusPainted(false);
        btnGoogleSignIn.setContentAreaFilled(false);
        btnGoogleSignIn.setOpaque(false);
        btnGoogleSignIn.setBorderPainted(false);
        btnGoogleSignIn.setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
        btnGoogleSignIn.setAlignmentX(Component.CENTER_ALIGNMENT);
        btnGoogleSignIn.setMaximumSize(new Dimension(Integer.MAX_VALUE, 44));
        btnGoogleSignIn.addActionListener(e -> startGoogleSignIn());
        root.add(btnGoogleSignIn);

        btnCancelGoogle = UiFactory.createSecondaryButton("Cancel Browser Waiting");
        btnCancelGoogle.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        btnCancelGoogle.setAlignmentX(Component.CENTER_ALIGNMENT);
        btnCancelGoogle.setVisible(false);
        btnCancelGoogle.addActionListener(e -> cancelGoogleSignIn());
        root.add(btnCancelGoogle);

        // ── 3. Divider: OR SIGN IN WITH EMAIL ────────────────────────────────
        root.add(Box.createVerticalStrut(14));
        JPanel dividerPanel = new JPanel(new GridBagLayout());
        dividerPanel.setOpaque(false);
        dividerPanel.setAlignmentX(Component.CENTER_ALIGNMENT);
        dividerPanel.setMaximumSize(new Dimension(Integer.MAX_VALUE, 20));

        GridBagConstraints gbc = new GridBagConstraints();
        gbc.fill = GridBagConstraints.HORIZONTAL;
        gbc.weightx = 1.0;

        JSeparator leftSep = new JSeparator();
        leftSep.setForeground(ThemeColors.cardBorder());
        dividerPanel.add(leftSep, gbc);

        JLabel orLabel = new JLabel("  OR SIGN IN WITH EMAIL  ");
        orLabel.setFont(new Font("Segoe UI", Font.BOLD, 10));
        orLabel.setForeground(ThemeColors.textMuted());
        gbc.weightx = 0;
        gbc.fill = GridBagConstraints.NONE;
        dividerPanel.add(orLabel, gbc);

        JSeparator rightSep = new JSeparator();
        rightSep.setForeground(ThemeColors.cardBorder());
        gbc.weightx = 1.0;
        gbc.fill = GridBagConstraints.HORIZONTAL;
        dividerPanel.add(rightSep, gbc);

        root.add(dividerPanel);
        root.add(Box.createVerticalStrut(14));

        // ── 4. Email & Password Form ─────────────────────────────────────────
        JPanel formPanel = new JPanel(new GridBagLayout());
        formPanel.setOpaque(false);
        formPanel.setAlignmentX(Component.CENTER_ALIGNMENT);
        formPanel.setMaximumSize(new Dimension(Integer.MAX_VALUE, 160));

        GridBagConstraints fgbc = new GridBagConstraints();
        fgbc.gridx = 0;
        fgbc.weightx = 1.0;
        fgbc.fill = GridBagConstraints.HORIZONTAL;

        fgbc.gridy = 0;
        fgbc.insets = new Insets(0, 0, 4, 0);
        JLabel lblEmail = new JLabel("GMAIL ADDRESS");
        lblEmail.setFont(new Font("Segoe UI", Font.BOLD, 10));
        lblEmail.setForeground(ThemeColors.textMuted());
        lblEmail.setHorizontalAlignment(SwingConstants.LEFT);
        formPanel.add(lblEmail, fgbc);

        fgbc.gridy = 1;
        fgbc.insets = new Insets(0, 0, 10, 0);
        emailField = UiFactory.createTextField("yourname@gmail.com");
        emailField.setPreferredSize(new Dimension(416, 40));
        formPanel.add(emailField, fgbc);

        fgbc.gridy = 2;
        fgbc.insets = new Insets(0, 0, 4, 0);
        lblPassword = new JLabel("PASSWORD");
        lblPassword.setFont(new Font("Segoe UI", Font.BOLD, 10));
        lblPassword.setForeground(ThemeColors.textMuted());
        lblPassword.setHorizontalAlignment(SwingConstants.LEFT);
        formPanel.add(lblPassword, fgbc);

        fgbc.gridy = 3;
        fgbc.insets = new Insets(0, 0, 0, 0);
        passwordField = new JPasswordField() {
            @Override protected void paintComponent(Graphics g) {
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                g2.setColor(getBackground());
                g2.fillRoundRect(0, 0, getWidth(), getHeight(), 12, 12);
                g2.dispose();
                super.paintComponent(g);
            }
            @Override protected void paintBorder(Graphics g) {
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                g2.setColor(ThemeColors.inputBorder());
                g2.setStroke(new BasicStroke(1f));
                g2.drawRoundRect(0, 0, getWidth() - 1, getHeight() - 1, 12, 12);
                g2.dispose();
            }
        };
        passwordField.setOpaque(false);
        passwordField.setFont(new Font("Segoe UI", Font.PLAIN, 12));
        passwordField.setBackground(ThemeColors.inputBg());
        passwordField.setForeground(ThemeColors.textPrimary());
        passwordField.setCaretColor(ThemeColors.textPrimary());
        passwordField.setBorder(new EmptyBorder(8, 12, 8, 12));
        passwordField.setPreferredSize(new Dimension(416, 40));
        formPanel.add(passwordField, fgbc);

        root.add(formPanel);
        root.add(Box.createVerticalStrut(14));

        // Submit Button
        btnEmailSubmit = UiFactory.createPrimaryButton("Sign In");
        btnEmailSubmit.setFont(new Font("Segoe UI", Font.BOLD, 13));
        btnEmailSubmit.setMaximumSize(new Dimension(Integer.MAX_VALUE, 40));
        btnEmailSubmit.setAlignmentX(Component.CENTER_ALIGNMENT);
        btnEmailSubmit.addActionListener(e -> handleEmailSubmit());
        root.add(btnEmailSubmit);
        root.add(Box.createVerticalStrut(12));

        // Mode switch row: "Don't have an account? Sign Up" & "Forgot Password?"
        JPanel linkRow = new JPanel(new BorderLayout());
        linkRow.setOpaque(false);
        linkRow.setAlignmentX(Component.CENTER_ALIGNMENT);
        linkRow.setMaximumSize(new Dimension(Integer.MAX_VALUE, 26));

        btnToggleMode = new JButton("Don't have an account? Sign Up");
        btnToggleMode.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        btnToggleMode.setForeground(ThemeColors.accent());
        btnToggleMode.setContentAreaFilled(false);
        btnToggleMode.setBorderPainted(false);
        btnToggleMode.setFocusPainted(false);
        btnToggleMode.setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
        btnToggleMode.addActionListener(e -> toggleMode());
        linkRow.add(btnToggleMode, BorderLayout.WEST);

        btnForgotPassword = new JButton("Forgot Password?");
        btnForgotPassword.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        btnForgotPassword.setForeground(ThemeColors.textMuted());
        btnForgotPassword.setContentAreaFilled(false);
        btnForgotPassword.setBorderPainted(false);
        btnForgotPassword.setFocusPainted(false);
        btnForgotPassword.setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
        btnForgotPassword.addActionListener(e -> handleForgotPassword());
        linkRow.add(btnForgotPassword, BorderLayout.EAST);

        root.add(linkRow);
        root.add(Box.createVerticalStrut(14));

        // ── 5. Status Feedback ───────────────────────────────────────────────
        statusLabel = new JLabel(" ", SwingConstants.CENTER);
        statusLabel.setFont(new Font("Segoe UI", Font.PLAIN, 12));
        statusLabel.setForeground(ThemeColors.textSecondary());
        statusLabel.setAlignmentX(Component.CENTER_ALIGNMENT);
        root.add(statusLabel);

        add(root, BorderLayout.CENTER);

        // Enter key submits form
        getRootPane().setDefaultButton(btnEmailSubmit);

        // ── 6. Auth Listener ─────────────────────────────────────────────────
        authListener = profile -> {
            if (userService.isSignedIn()) {
                SwingUtilities.invokeLater(() -> {
                    String email = userService.getCurrentEmail();
                    statusLabel.setText("Signed in successfully as " + email + "!");
                    statusLabel.setForeground(ThemeColors.success());
                    btnGoogleSignIn.setEnabled(false);
                    btnEmailSubmit.setEnabled(false);

                    Timer timer = new Timer(600, evt -> dispose());
                    timer.setRepeats(false);
                    timer.start();
                });
            }
        };
        userService.addListener(authListener);
    }

    private void toggleMode() {
        isSignUpMode = !isSignUpMode;
        if (isSignUpMode) {
            btnEmailSubmit.setText("Create Account");
            btnToggleMode.setText("Already have an account? Sign In");
            btnForgotPassword.setVisible(false);
            lblPassword.setText("PASSWORD (8-16 CHARS, Aa1@)");
            statusLabel.setText("Fill in your email and password to create an account.");
            statusLabel.setForeground(ThemeColors.textSecondary());
        } else {
            btnEmailSubmit.setText("Sign In");
            btnToggleMode.setText("Don't have an account? Sign Up");
            btnForgotPassword.setVisible(true);
            lblPassword.setText("PASSWORD");
            statusLabel.setText(" ");
        }
    }

    private void handleEmailSubmit() {
        String email = emailField.getText().trim();
        String password = new String(passwordField.getPassword()).trim();

        if (email.isEmpty()) {
            statusLabel.setText("Please enter your email address.");
            statusLabel.setForeground(ThemeColors.danger());
            emailField.requestFocus();
            return;
        }
        if (!email.toLowerCase().matches("^[a-zA-Z0-9._%+-]+@gmail\\.com$")) {
            statusLabel.setText("Only @gmail.com email addresses are allowed (e.g. yourname@gmail.com).");
            statusLabel.setForeground(ThemeColors.danger());
            emailField.requestFocus();
            return;
        }
        if (password.isEmpty()) {
            statusLabel.setText("Please enter your password.");
            statusLabel.setForeground(ThemeColors.danger());
            passwordField.requestFocus();
            return;
        }
        if (isSignUpMode && !isValidPassword(password)) {
            statusLabel.setText("Password must be 8-16 chars with uppercase, lowercase, numbers & special chars.");
            statusLabel.setForeground(ThemeColors.danger());
            passwordField.requestFocus();
            return;
        }

        btnEmailSubmit.setEnabled(false);
        btnGoogleSignIn.setEnabled(false);
        statusLabel.setText(isSignUpMode ? "Creating account..." : "Authenticating...");
        statusLabel.setForeground(ThemeColors.accent());

        if (isSignUpMode) {
            userService.signUpWithEmail(email, password, this,
                    profile -> {
                        statusLabel.setText("Account created! Welcome, " + profile.getOrDefault("displayName", email));
                        statusLabel.setForeground(ThemeColors.success());
                        Timer timer = new Timer(600, evt -> dispose());
                        timer.setRepeats(false);
                        timer.start();
                    },
                    error -> {
                        btnEmailSubmit.setEnabled(true);
                        btnGoogleSignIn.setEnabled(true);
                        statusLabel.setText(error);
                        statusLabel.setForeground(ThemeColors.danger());
                    }
            );
        } else {
            userService.signInWithEmail(email, password, this,
                    profile -> {
                        statusLabel.setText("Sign-in successful! Loading entitlements...");
                        statusLabel.setForeground(ThemeColors.success());
                        Timer timer = new Timer(600, evt -> dispose());
                        timer.setRepeats(false);
                        timer.start();
                    },
                    error -> {
                        btnEmailSubmit.setEnabled(true);
                        btnGoogleSignIn.setEnabled(true);
                        statusLabel.setText(error);
                        statusLabel.setForeground(ThemeColors.danger());
                    }
            );
        }
    }

    private void handleForgotPassword() {
        String email = emailField.getText().trim();
        if (email.isEmpty()) {
            String input = JOptionPane.showInputDialog(this, "Enter your email address to receive a password reset link:", "Reset Password", JOptionPane.QUESTION_MESSAGE);
            if (input != null && !input.trim().isEmpty()) {
                email = input.trim();
            } else {
                return;
            }
        }

        statusLabel.setText("Sending password reset email...");
        statusLabel.setForeground(ThemeColors.accent());
        userService.sendPasswordReset(email,
                msg -> {
                    statusLabel.setText("Password reset email sent to " + emailField.getText().trim());
                    statusLabel.setForeground(ThemeColors.success());
                    JOptionPane.showMessageDialog(this, "A password reset email has been sent to:\n" + emailField.getText().trim() + "\nPlease check your inbox.", "Password Reset Sent", JOptionPane.INFORMATION_MESSAGE);
                },
                err -> {
                    statusLabel.setText("Reset failed: " + err);
                    statusLabel.setForeground(ThemeColors.danger());
                }
        );
    }

    private void startGoogleSignIn() {
        btnGoogleSignIn.setEnabled(false);
        btnCancelGoogle.setVisible(true);
        statusLabel.setText("Opening browser for Google authorization...");
        statusLabel.setForeground(ThemeColors.accent());

        int port = DesktopAuthServer.start(profile -> {
            SwingUtilities.invokeLater(() -> {
                com.takeoutfix.controller.UserController.syncUser(profile);
                statusLabel.setText("Authenticated! Welcome, " + profile.getOrDefault("displayName", profile.getOrDefault("email", "User")));
                statusLabel.setForeground(ThemeColors.success());
                Timer timer = new Timer(600, evt -> dispose());
                timer.setRepeats(false);
                timer.start();
            });
        });

        if (port <= 0) {
            statusLabel.setText("Failed to start local listener. Please sign in with Email above.");
            statusLabel.setForeground(ThemeColors.danger());
            btnGoogleSignIn.setEnabled(true);
            btnCancelGoogle.setVisible(false);
            return;
        }

        statusLabel.setText("Waiting for browser Google sign-in on port " + port + "...");
        btnCancelGoogle.setVisible(true);
        try {
            String url = "https://takeoutfix.pages.dev/login?desktop_port=" + port + "&port=" + port + "&prompt=select_account";
            Desktop.getDesktop().browse(new URI(url));
        } catch (Exception ex) {
            statusLabel.setText("Could not launch browser automatically: " + ex.getMessage());
            statusLabel.setForeground(ThemeColors.warning());
        }
    }

    private void cancelGoogleSignIn() {
        DesktopAuthServer.stop();
        btnGoogleSignIn.setEnabled(true);
        btnCancelGoogle.setVisible(false);
        statusLabel.setText("Browser authentication cancelled.");
        statusLabel.setForeground(ThemeColors.textSecondary());
    }

    private static void drawGoogleIcon(Graphics2D g2, int x, int y, int size) {
        g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        int r = size / 2;
        int cx = x + r;
        int cy = y + r;

        // 4 color segments
        g2.setColor(new Color(66, 133, 244)); // Blue
        g2.fillArc(x, y, size, size, -45, 90);

        g2.setColor(new Color(52, 168, 83)); // Green
        g2.fillArc(x, y, size, size, 45, 90);

        g2.setColor(new Color(251, 188, 5)); // Yellow
        g2.fillArc(x, y, size, size, 135, 90);

        g2.setColor(new Color(234, 67, 53)); // Red
        g2.fillArc(x, y, size, size, 225, 90);

        // Center cutout
        int inner = size * 52 / 100;
        int inX = cx - inner / 2;
        int inY = cy - inner / 2;
        boolean dark = ThemeColors.isDark();
        g2.setColor(dark ? new Color(24, 24, 27) : Color.WHITE);
        g2.fillOval(inX, inY, inner, inner);

        // Crossbar
        g2.setColor(new Color(66, 133, 244));
        int barH = size * 26 / 100;
        int barW = size * 48 / 100;
        g2.fillRect(cx - 2, cy - barH / 2, barW, barH);
    }

    public static boolean isValidPassword(String password) {
        if (password == null || password.length() < 8 || password.length() > 16) {
            return false;
        }
        boolean hasUpper = false;
        boolean hasLower = false;
        boolean hasDigit = false;
        boolean hasSpecial = false;
        for (char c : password.toCharArray()) {
            if (Character.isUpperCase(c)) {
                hasUpper = true;
            } else if (Character.isLowerCase(c)) {
                hasLower = true;
            } else if (Character.isDigit(c)) {
                hasDigit = true;
            } else if ("!@#$%^&*()_+-=[]{};':\"\\|,.<>/?`~".indexOf(c) >= 0) {
                hasSpecial = true;
            }
        }
        return hasUpper && hasLower && hasDigit && hasSpecial;
    }

    @Override
    public void dispose() {
        DesktopAuthServer.stop();
        super.dispose();
    }
}
