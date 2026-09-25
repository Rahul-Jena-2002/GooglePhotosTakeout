package com.takeoutfix.dashboard;

import com.takeoutfix.auth.SignInDialog;
import com.takeoutfix.shared.ui.UiFactory;
import com.takeoutfix.auth.UserSyncBridgeService;
import com.takeoutfix.shared.theme.ThemeColors;
import com.takeoutfix.auth.FirebaseSyncService;

import javax.swing.*;
import javax.swing.border.EmptyBorder;
import java.awt.*;

/**
 * Account & Cloud Synchronization card.
 * Features a smoothly rounded inner container, dynamic login/beta badges, and cloud sync triggers.
 */
public class DashboardAccountSection extends JPanel {

    private final UserSyncBridgeService userService;
    private final JLabel avatarLabel;
    private final JLabel userNameLabel;
    private final JLabel userEmailLabel;
    private final JLabel planBadge;
    private final JLabel syncStatusBadge;
    private final JLabel cloudNotice;
    private final JButton btnSyncNow;
    private final JButton btnAccountAction;

    public DashboardAccountSection(UserSyncBridgeService userService) {
        super(new BorderLayout());
        setOpaque(false);
        this.userService = userService;

        JPanel card = UiFactory.createCard();
        card.setLayout(new BorderLayout(0, 12));

        // Top Header Row
        JPanel topHeader = new JPanel(new BorderLayout());
        topHeader.setOpaque(false);
        JLabel lblTitle = new JLabel("ACCOUNT & CLOUD SYNCHRONIZATION");
        lblTitle.setFont(new Font("Segoe UI", Font.BOLD, 11));
        lblTitle.setForeground(ThemeColors.textMuted());
        topHeader.add(lblTitle, BorderLayout.WEST);

        syncStatusBadge = UiFactory.createBadge("● Synced", new Color(236, 253, 245), new Color(16, 185, 129));
        topHeader.add(syncStatusBadge, BorderLayout.EAST);
        card.add(topHeader, BorderLayout.NORTH);

        // Center Profile Row (smooth slight curve 12px container with padding)
        JPanel profileRow = UiFactory.createInnerContainer(12);
        profileRow.setLayout(new BorderLayout(14, 0));
        profileRow.setBorder(new EmptyBorder(10, 14, 10, 14));

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
        avatarLabel.setPreferredSize(new Dimension(44, 44));
        avatarLabel.setFont(new Font("Segoe UI", Font.BOLD, 15));
        avatarLabel.setForeground(Color.WHITE);
        avatarLabel.setBackground(new Color(99, 102, 241));

        JPanel avatarBox = new JPanel(new FlowLayout(FlowLayout.CENTER, 0, 2));
        avatarBox.setOpaque(false);
        avatarBox.setPreferredSize(new Dimension(46, 46));
        avatarBox.add(avatarLabel);
        profileRow.add(avatarBox, BorderLayout.WEST);

        JPanel details = new JPanel(new GridLayout(3, 1, 0, 3));
        details.setOpaque(false);

        userNameLabel = new JLabel("Operator");
        userNameLabel.setFont(new Font("Segoe UI", Font.BOLD, 16));
        userNameLabel.setForeground(ThemeColors.textPrimary());

        planBadge = UiFactory.createBadge("ACTIVE", new Color(245, 243, 255), new Color(124, 58, 237));

        JPanel nameAndBadge = new JPanel(new FlowLayout(FlowLayout.LEFT, 8, 0));
        nameAndBadge.setOpaque(false);
        nameAndBadge.add(userNameLabel);
        nameAndBadge.add(planBadge);

        userEmailLabel = new JLabel("Not signed in");
        userEmailLabel.setFont(new Font("Segoe UI", Font.PLAIN, 12));
        userEmailLabel.setForeground(ThemeColors.textSecondary());

        cloudNotice = new JLabel("Google Cloud Firestore realtime sync active");
        cloudNotice.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        cloudNotice.setForeground(ThemeColors.textMuted());

        details.add(nameAndBadge);
        details.add(userEmailLabel);
        details.add(cloudNotice);

        profileRow.add(details, BorderLayout.CENTER);
        card.add(profileRow, BorderLayout.CENTER);

        // Bottom Actions Row
        JPanel actionsRow = new JPanel(new FlowLayout(FlowLayout.RIGHT, 8, 0));
        actionsRow.setOpaque(false);

        btnSyncNow = UiFactory.createSecondaryButton("Sync Cloud");
        javax.swing.Icon syncIcon = UiFactory.svgDynamicIcon("reload", 13, () -> ThemeColors.secondaryButtonText());
        if (syncIcon != null) {
            btnSyncNow.setIcon(syncIcon);
            btnSyncNow.setIconTextGap(6);
        }
        btnSyncNow.setPreferredSize(new Dimension(120, 34));
        btnSyncNow.addActionListener(e -> triggerCloudSync());

        btnAccountAction = UiFactory.createPrimaryButton("Sign In");
        btnAccountAction.setPreferredSize(new Dimension(140, 34));
        btnAccountAction.addActionListener(e -> {
            Window win = SwingUtilities.getWindowAncestor(this);
            Frame frame = (win instanceof Frame) ? (Frame) win : null;
            if (userService != null && userService.isSignedIn()) {
                String[] options = {"Switch Account", "Sign Out", "Cancel"};
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
        });

        actionsRow.add(btnSyncNow);
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

    public void updateUserData() {
        SwingUtilities.invokeLater(() -> {
            if (userService == null) return;
            boolean signedIn = userService.isSignedIn();
            String name = userService.getCurrentName();
            String email = userService.getCurrentEmail();

            if (signedIn) {
                userNameLabel.setText(name.isEmpty() ? "Operator" : name);
                userEmailLabel.setText(email);
                planBadge.setText("ACTIVE");
                planBadge.setBackground(new Color(245, 243, 255));
                planBadge.setForeground(new Color(124, 58, 237));
                btnAccountAction.setText("Switch Account");
                cloudNotice.setText("Google Cloud Firestore realtime sync active");
                btnSyncNow.setEnabled(true);
                syncStatusBadge.setText("● Synced");
                syncStatusBadge.setBackground(new Color(236, 253, 245));
                syncStatusBadge.setForeground(new Color(16, 185, 129));
            } else {
                userNameLabel.setText("Guest Operator");
                userEmailLabel.setText("Sign in to sync your cloud restoration telemetry");
                planBadge.setText("LOGIN REQUIRED");
                planBadge.setBackground(new Color(254, 243, 199));
                planBadge.setForeground(new Color(217, 119, 6));
                btnAccountAction.setText("  Sign In  ");
                cloudNotice.setText("Local restoration engines active • Sign in to sync cloud profile");
                btnSyncNow.setEnabled(false);
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
