package com.rahul.gui.components;

import com.rahul.gui.service.UserSyncBridgeService;
import com.rahul.gui.theme.ThemeColors;

import javax.swing.*;
import javax.swing.border.EmptyBorder;
import javax.swing.border.LineBorder;
import java.awt.*;
import java.util.Map;
import java.util.function.Consumer;

/**
 * Dedicated Google OAuth Sign-In dialog.
 * Exclusively uses Google OAuth 2.0 / OpenID Connect without any custom forms or password prompts.
 */
public class SignInDialog extends JDialog {

    private final JLabel statusLabel;
    private final JButton btnGoogleSignIn;
    private final Consumer<Map<String, Object>> authListener;
    private final UserSyncBridgeService userService;

    public SignInDialog(Frame owner, UserSyncBridgeService userService) {
        super(owner, "Sign In with Google - TakeoutFix", true);
        this.userService = userService;

        setSize(440, 260);
        setLocationRelativeTo(owner);
        setResizable(false);
        getContentPane().setBackground(ThemeColors.cardBg());
        setLayout(new BorderLayout());

        JPanel container = new JPanel();
        container.setLayout(new BoxLayout(container, BoxLayout.Y_AXIS));
        container.setBackground(ThemeColors.cardBg());
        container.setBorder(new EmptyBorder(24, 28, 24, 28));

        // 1. Branding Header
        JPanel brandRow = new JPanel(new FlowLayout(FlowLayout.CENTER, 8, 0));
        brandRow.setOpaque(false);

        JLabel logo = new JLabel("TF");
        logo.setFont(new Font("Segoe UI", Font.BOLD, 14));
        logo.setOpaque(true);
        logo.setBackground(ThemeColors.accent());
        logo.setForeground(Color.WHITE);
        logo.setBorder(new EmptyBorder(3, 8, 3, 8));
        brandRow.add(logo);

        JLabel title = new JLabel("Sign In with Google");
        title.setFont(new Font("Segoe UI", Font.BOLD, 18));
        title.setForeground(ThemeColors.textPrimary());
        brandRow.add(title);
        container.add(brandRow);
        container.add(Box.createVerticalStrut(8));

        JLabel subtitle = new JLabel("<html><center>Authenticate securely using your Google account.<br>Quotas and tool access are unlocked automatically.</center></html>");
        subtitle.setFont(new Font("Segoe UI", Font.PLAIN, 12));
        subtitle.setForeground(ThemeColors.textSecondary());
        subtitle.setAlignmentX(Component.CENTER_ALIGNMENT);
        container.add(subtitle);
        container.add(Box.createVerticalStrut(20));

        // 2. Status Label
        statusLabel = new JLabel("Click above to start Google OAuth in your browser.", SwingConstants.CENTER);
        statusLabel.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        statusLabel.setForeground(ThemeColors.textMuted());
        statusLabel.setAlignmentX(Component.CENTER_ALIGNMENT);

        // 3. Primary Google Sign-In Button
        btnGoogleSignIn = new JButton("  Sign In with Google");
        btnGoogleSignIn.setFont(new Font("Segoe UI", Font.BOLD, 14));
        btnGoogleSignIn.setFocusPainted(false);
        btnGoogleSignIn.setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
        btnGoogleSignIn.setBackground(Color.WHITE);
        btnGoogleSignIn.setForeground(new Color(30, 41, 59));
        btnGoogleSignIn.setBorder(BorderFactory.createCompoundBorder(
                new LineBorder(new Color(203, 213, 225), 1, true),
                new EmptyBorder(12, 24, 12, 24)
        ));
        btnGoogleSignIn.setAlignmentX(Component.CENTER_ALIGNMENT);
        btnGoogleSignIn.setMaximumSize(new Dimension(Integer.MAX_VALUE, 44));

        btnGoogleSignIn.addActionListener(e -> {
            statusLabel.setText("Opening browser at Google login... Please complete sign-in.");
            statusLabel.setForeground(ThemeColors.accent());
            UserSyncBridgeService.openGoogleLogin(this);
        });
        container.add(btnGoogleSignIn);
        container.add(Box.createVerticalStrut(12));
        container.add(statusLabel);

        add(container, BorderLayout.CENTER);

        // Auto-close when Google OAuth completes
        authListener = profile -> {
            if (userService.isSignedIn()) {
                SwingUtilities.invokeLater(() -> {
                    statusLabel.setText("Signed in as " + userService.getCurrentEmail() + "! Closing...");
                    statusLabel.setForeground(ThemeColors.success());
                    Timer timer = new Timer(700, evt -> dispose());
                    timer.setRepeats(false);
                    timer.start();
                });
            }
        };
        userService.addListener(authListener);
    }
}
