package com.takeoutfix.dashboard;

import com.takeoutfix.auth.SignInDialog;
import com.takeoutfix.shared.ui.UiFactory;
import com.takeoutfix.auth.UserSyncBridgeService;
import com.takeoutfix.shared.theme.ThemeColors;
import com.takeoutfix.auth.FirebaseSyncService;
import com.takeoutfix.shared.util.BrowserUtil;

import javax.swing.*;
import javax.swing.border.EmptyBorder;
import java.awt.*;

/**
 * Dedicated Native Dashboard — Account & Cloud Synchronization card.
 * Features privacy-masked email with SVG eye reveal toggle, dynamic tier badge,
 * cloud sync triggers, web dashboard link, and account management.
 */
public class DashboardAccountSection extends JPanel {

    private final UserSyncBridgeService userService;
    private final JLabel avatarLabel;
    private final JLabel userNameLabel;
    private final JLabel userEmailLabel;
    private final JButton btnToggleEmail;
    private final JLabel planBadge;
    private final JLabel syncStatusBadge;
    private final JLabel cloudNotice;
    private final JButton btnSyncNow;
    private final JButton btnWebDashboard;
    private final JButton btnUpgrade;
    private final JButton btnAccountAction;

    private boolean isEmailRevealed = false;
    private Timer autoMaskTimer;

    public DashboardAccountSection(UserSyncBridgeService userService) {
        super(new BorderLayout());
        setOpaque(false);
        this.userService = userService;

        JPanel card = UiFactory.createCard();
        card.setLayout(new BorderLayout(0, 12));

        // Top Header Row
        JPanel topHeader = new JPanel(new BorderLayout());
        topHeader.setOpaque(false);
        JLabel lblTitle = new JLabel("MY ACCOUNT & CLOUD SYNCHRONIZATION");
        lblTitle.setFont(new Font("Segoe UI", Font.BOLD, 11));
        lblTitle.setForeground(ThemeColors.textMuted());
        topHeader.add(lblTitle, BorderLayout.WEST);

        syncStatusBadge = UiFactory.createBadge("● Synced", new Color(236, 253, 245), new Color(16, 185, 129));
        topHeader.add(syncStatusBadge, BorderLayout.EAST);
        card.add(topHeader, BorderLayout.NORTH);

        // Center Profile Row
        JPanel profileRow = UiFactory.createInnerContainer(12);
        profileRow.setLayout(new BorderLayout(14, 0));
        profileRow.setBorder(new EmptyBorder(12, 14, 12, 14));

        avatarLabel = new JLabel("TF", SwingConstants.CENTER) {
            @Override
            protected void paintComponent(Graphics g) {
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                g2.setColor(getBackground());
                g2.fillOval(0, 0, getWidth(), getHeight());
                g2.dispose();
                super.paintComponent(g);
            }
        };
        avatarLabel.setOpaque(false);
        avatarLabel.setPreferredSize(new Dimension(46, 46));
        avatarLabel.setFont(new Font("Segoe UI", Font.BOLD, 16));
        avatarLabel.setForeground(Color.WHITE);
        avatarLabel.setBackground(new Color(99, 102, 241));

        JPanel avatarBox = new JPanel(new FlowLayout(FlowLayout.CENTER, 0, 2));
        avatarBox.setOpaque(false);
        avatarBox.setPreferredSize(new Dimension(48, 48));
        avatarBox.add(avatarLabel);
        profileRow.add(avatarBox, BorderLayout.WEST);

        JPanel details = new JPanel(new GridLayout(3, 1, 0, 4));
        details.setOpaque(false);

        userNameLabel = new JLabel("Operator");
        userNameLabel.setFont(new Font("Segoe UI", Font.BOLD, 16));
        userNameLabel.setForeground(ThemeColors.textPrimary());

        planBadge = UiFactory.createBadge("FREE PLAN", new Color(245, 243, 255), new Color(124, 58, 237));

        JPanel nameAndBadge = new JPanel(new FlowLayout(FlowLayout.LEFT, 8, 0));
        nameAndBadge.setOpaque(false);
        nameAndBadge.add(userNameLabel);
        nameAndBadge.add(planBadge);

        // Email row with Show/Hide toggle button
        JPanel emailRow = new JPanel(new FlowLayout(FlowLayout.LEFT, 6, 0));
        emailRow.setOpaque(false);

        userEmailLabel = new JLabel("Not signed in");
        userEmailLabel.setFont(new Font("Segoe UI", Font.PLAIN, 12));
        userEmailLabel.setForeground(ThemeColors.textSecondary());
        emailRow.add(userEmailLabel);

        btnToggleEmail = UiFactory.createSecondaryButton("Show");
        btnToggleEmail.setFont(new Font("Segoe UI", Font.BOLD, 10));
        btnToggleEmail.setPreferredSize(new Dimension(72, 24));
        btnToggleEmail.setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
        btnToggleEmail.setToolTipText("Reveal full email address (auto-masks in 15 seconds)");
        javax.swing.Icon eyeIcon = UiFactory.svgDynamicIcon("eye", 12, () -> ThemeColors.secondaryButtonText());
        if (eyeIcon != null) {
            btnToggleEmail.setIcon(eyeIcon);
            btnToggleEmail.setIconTextGap(4);
        }
        btnToggleEmail.addActionListener(e -> toggleEmailVisibility());
        emailRow.add(btnToggleEmail);

        cloudNotice = new JLabel("Google Cloud Firestore realtime sync active • Offline restoration ready");
        cloudNotice.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        cloudNotice.setForeground(ThemeColors.textMuted());

        details.add(nameAndBadge);
        details.add(emailRow);
        details.add(cloudNotice);

        profileRow.add(details, BorderLayout.CENTER);
        card.add(profileRow, BorderLayout.CENTER);

        // Bottom Actions Row (All clean buttons with SVG icons)
        JPanel actionsRow = new JPanel(new FlowLayout(FlowLayout.RIGHT, 8, 0));
        actionsRow.setOpaque(false);

        btnSyncNow = UiFactory.createSecondaryButton("Sync Cloud");
        btnSyncNow.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        javax.swing.Icon syncIcon = UiFactory.svgDynamicIcon("reload", 12, () -> ThemeColors.secondaryButtonText());
        if (syncIcon != null) {
            btnSyncNow.setIcon(syncIcon);
            btnSyncNow.setIconTextGap(5);
        }
        btnSyncNow.setPreferredSize(new Dimension(115, 32));
        btnSyncNow.addActionListener(e -> triggerCloudSync());

        btnWebDashboard = UiFactory.createSecondaryButton("Web Dashboard");
        btnWebDashboard.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        javax.swing.Icon extIcon = UiFactory.svgDynamicIcon("external-link", 11, () -> ThemeColors.secondaryButtonText());
        if (extIcon != null) {
            btnWebDashboard.setIcon(extIcon);
            btnWebDashboard.setIconTextGap(5);
        }
        btnWebDashboard.setPreferredSize(new Dimension(135, 32));
        btnWebDashboard.setToolTipText("Open Web Dashboard in browser");
        btnWebDashboard.addActionListener(e -> BrowserUtil.openBrowser("https://takeoutfix.pages.dev/dashboard"));

        btnUpgrade = UiFactory.createPrimaryButton("Upgrade Plan");
        btnUpgrade.setFont(new Font("Segoe UI", Font.BOLD, 11));
        javax.swing.Icon zapIcon = UiFactory.svgDynamicIcon("zap", 11, () -> ThemeColors.primaryButtonText());
        if (zapIcon != null) {
            btnUpgrade.setIcon(zapIcon);
            btnUpgrade.setIconTextGap(5);
        }
        btnUpgrade.setPreferredSize(new Dimension(125, 32));
        btnUpgrade.setToolTipText("Review Pro and Super plan features on web");
        btnUpgrade.addActionListener(e -> BrowserUtil.openBrowser("https://takeoutfix.pages.dev/pricing"));

        btnAccountAction = UiFactory.createSecondaryButton("Sign In");
        btnAccountAction.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        btnAccountAction.setPreferredSize(new Dimension(100, 32));
        btnAccountAction.addActionListener(e -> handleAccountAction());

        actionsRow.add(btnSyncNow);
        actionsRow.add(btnWebDashboard);
        actionsRow.add(btnUpgrade);
        actionsRow.add(btnAccountAction);
        card.add(actionsRow, BorderLayout.SOUTH);

        ThemeColors.addThemeListener(() -> {
            lblTitle.setForeground(ThemeColors.textMuted());
            userNameLabel.setForeground(ThemeColors.textPrimary());
            userEmailLabel.setForeground(ThemeColors.textSecondary());
            cloudNotice.setForeground(ThemeColors.textMuted());
        });

        add(card, BorderLayout.CENTER);
        updateUserData();
    }

    private void toggleEmailVisibility() {
        isEmailRevealed = !isEmailRevealed;
        if (autoMaskTimer != null) {
            autoMaskTimer.stop();
        }

        if (isEmailRevealed) {
            autoMaskTimer = new Timer(15000, e -> {
                isEmailRevealed = false;
                updateEmailDisplay();
            });
            autoMaskTimer.setRepeats(false);
            autoMaskTimer.start();
        }

        updateEmailDisplay();
    }

    private void updateEmailDisplay() {
        if (userService == null || !userService.isSignedIn()) {
            userEmailLabel.setText("Sign in to sync your cloud restoration telemetry");
            btnToggleEmail.setVisible(false);
            return;
        }

        String rawEmail = userService.getCurrentEmail();
        btnToggleEmail.setVisible(!rawEmail.isEmpty());

        if (isEmailRevealed) {
            userEmailLabel.setText(rawEmail);
            btnToggleEmail.setText("Hide");
            javax.swing.Icon eyeOff = UiFactory.svgDynamicIcon("eye-off", 12, () -> ThemeColors.secondaryButtonText());
            if (eyeOff != null) {
                btnToggleEmail.setIcon(eyeOff);
            }
        } else {
            userEmailLabel.setText(maskEmail(rawEmail));
            btnToggleEmail.setText("Show");
            javax.swing.Icon eye = UiFactory.svgDynamicIcon("eye", 12, () -> ThemeColors.secondaryButtonText());
            if (eye != null) {
                btnToggleEmail.setIcon(eye);
            }
        }
    }

    public static String maskEmail(String email) {
        if (email == null || email.isBlank() || !email.contains("@")) {
            return email != null ? email : "";
        }
        int atIndex = email.indexOf('@');
        String name = email.substring(0, atIndex);
        String domain = email.substring(atIndex);

        if (name.length() <= 3) {
            return name.charAt(0) + "***" + domain;
        }
        return name.substring(0, 2) + "***" + name.charAt(name.length() - 1) + domain;
    }

    private void handleAccountAction() {
        Window win = SwingUtilities.getWindowAncestor(this);
        Frame frame = (win instanceof Frame) ? (Frame) win : null;
        if (userService != null && userService.isSignedIn()) {
            String[] options = { "Switch Account", "Sign Out", "Cancel" };
            int choice = JOptionPane.showOptionDialog(frame,
                    "Currently signed in as: " + userService.getCurrentEmail() + "\nWhat would you like to do?",
                    "Account Options",
                    JOptionPane.DEFAULT_OPTION, JOptionPane.QUESTION_MESSAGE,
                    null, options, options[0]);
            if (choice == 0) {
                new SignInDialog(frame, userService).setVisible(true);
                updateUserData();
            } else if (choice == 1) {
                userService.signOut();
                updateUserData();
            }
        } else {
            new SignInDialog(frame, userService).setVisible(true);
            updateUserData();
        }
    }

    public void updateUserData() {
        SwingUtilities.invokeLater(() -> {
            if (userService == null) return;
            boolean signedIn = userService.isSignedIn();
            String name = userService.getCurrentName();
            String email = userService.getCurrentEmail();
            String plan = userService.getCurrentPlan();
            if (plan == null || plan.isBlank()) plan = "free";

            updateEmailDisplay();

            if (signedIn) {
                userNameLabel.setText(name.isEmpty() ? "Operator" : name);
                String planUpper = plan.toUpperCase();
                planBadge.setText(planUpper + " PLAN");

                if ("SUPER".equalsIgnoreCase(plan)) {
                    planBadge.setBackground(new Color(245, 243, 255));
                    planBadge.setForeground(new Color(124, 58, 237));
                    btnUpgrade.setVisible(false);
                } else if ("PRO".equalsIgnoreCase(plan)) {
                    planBadge.setBackground(new Color(238, 242, 255));
                    planBadge.setForeground(new Color(79, 70, 229));
                    btnUpgrade.setText("Upgrade to Super");
                    btnUpgrade.setVisible(true);
                } else {
                    planBadge.setBackground(new Color(241, 245, 249));
                    planBadge.setForeground(new Color(71, 85, 105));
                    btnUpgrade.setText("Upgrade Plan");
                    btnUpgrade.setVisible(true);
                }

                btnAccountAction.setText("Sign Out");
                btnAccountAction.setForeground(new Color(220, 38, 38));
                cloudNotice.setText("Google Cloud Firestore realtime sync active • Offline restoration ready");
                btnSyncNow.setEnabled(true);
                syncStatusBadge.setText("● Synced");
                syncStatusBadge.setBackground(new Color(236, 253, 245));
                syncStatusBadge.setForeground(new Color(16, 185, 129));
                btnWebDashboard.setVisible(true);
            } else {
                userNameLabel.setText("Guest Operator");
                planBadge.setText("LOGIN REQUIRED");
                planBadge.setBackground(new Color(254, 243, 199));
                planBadge.setForeground(new Color(217, 119, 6));
                btnAccountAction.setText("Sign In");
                btnAccountAction.setForeground(ThemeColors.secondaryButtonText());
                cloudNotice.setText("Local restoration engines active • Sign in with Google to sync cloud history");
                btnSyncNow.setEnabled(false);
                btnUpgrade.setVisible(false);
                btnWebDashboard.setVisible(false);
                syncStatusBadge.setText("● Guest Mode");
                syncStatusBadge.setBackground(ThemeColors.pillBg());
                syncStatusBadge.setForeground(ThemeColors.textMuted());
            }

            if (!name.isEmpty() && signedIn) {
                avatarLabel.setText(name.substring(0, 1).toUpperCase());
            } else if (!email.isEmpty() && signedIn) {
                avatarLabel.setText(email.substring(0, 1).toUpperCase());
            } else {
                avatarLabel.setText("TF");
            }

            revalidate();
            repaint();
        });
    }

    private void triggerCloudSync() {
        btnSyncNow.setEnabled(false);
        btnSyncNow.setText("Syncing...");
        syncStatusBadge.setText("● Syncing...");
        syncStatusBadge.setBackground(new Color(254, 243, 199));
        syncStatusBadge.setForeground(new Color(217, 119, 6));

        userService.triggerCloudSync(success -> SwingUtilities.invokeLater(() -> {
            btnSyncNow.setEnabled(true);
            btnSyncNow.setText("Sync Cloud");
            if (Boolean.TRUE.equals(success)) {
                syncStatusBadge.setText("● Synced");
                syncStatusBadge.setBackground(new Color(236, 253, 245));
                syncStatusBadge.setForeground(new Color(16, 185, 129));
                updateUserData();
            } else {
                syncStatusBadge.setText("● Sync Error");
                syncStatusBadge.setBackground(new Color(254, 226, 226));
                syncStatusBadge.setForeground(new Color(220, 38, 38));
            }
        }));
    }

    public void updateSyncState(FirebaseSyncService.SyncState state) {
        SwingUtilities.invokeLater(() -> {
            if (state == null) return;
            switch (state) {
                case SYNCING:
                    syncStatusBadge.setText("● Syncing...");
                    syncStatusBadge.setBackground(new Color(254, 243, 199));
                    syncStatusBadge.setForeground(new Color(217, 119, 6));
                    break;
                case SYNCED:
                    syncStatusBadge.setText("● Synced");
                    syncStatusBadge.setBackground(new Color(236, 253, 245));
                    syncStatusBadge.setForeground(new Color(16, 185, 129));
                    break;
                case FAILED:
                    syncStatusBadge.setText("● Sync Error");
                    syncStatusBadge.setBackground(new Color(254, 226, 226));
                    syncStatusBadge.setForeground(new Color(220, 38, 38));
                    break;
                case IDLE:
                default:
                    syncStatusBadge.setText("● Idle");
                    syncStatusBadge.setBackground(ThemeColors.pillBg());
                    syncStatusBadge.setForeground(ThemeColors.textMuted());
                    break;
            }
        });
    }
}
