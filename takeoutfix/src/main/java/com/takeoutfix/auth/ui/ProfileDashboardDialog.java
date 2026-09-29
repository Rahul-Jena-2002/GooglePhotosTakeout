package com.takeoutfix.auth.ui;

import com.takeoutfix.auth.UserSyncBridgeService;
import com.takeoutfix.restore.CommandCenterPanel;
import com.takeoutfix.shared.theme.ThemeColors;
import com.takeoutfix.shared.ui.UiFactory;
import com.takeoutfix.shared.util.BrowserUtil;

import javax.swing.*;
import javax.swing.border.EmptyBorder;
import java.awt.*;
import java.awt.event.WindowAdapter;
import java.awt.event.WindowEvent;
import java.util.Map;

/**
 * Modern Glassmorphic Profile & Operations Dashboard Modal.
 * Opens upon clicking the Profile Pill, preserving the underlying restoration state.
 *
 * Features:
 * - Privacy-masked email (e.g. ra***l@domain.com) with 15s auto-remasking eye toggle
 * - Plan badge (FREE, PRO, SUPER) & quota usage progress bar
 * - Cloud synchronization controls & 1-click Web Dashboard link
 * - Recent restoration run telemetry and host hardware specs
 */
public class ProfileDashboardDialog extends JDialog {

    private static final String FONT_FAMILY = "Segoe UI";
    private static final int AUTO_REVERT_SECS = 15;

    private final UserSyncBridgeService userService;
    private final Runnable onSignOutCallback;

    private JLabel emailLabel;
    private JButton btnToggleEmail;
    private boolean isEmailRevealed = false;
    private Timer autoMaskTimer;

    private JLabel userNameLabel;
    private JLabel avatarLabel;
    private JLabel planBadge;
    private JLabel syncStatusBadge;
    private JLabel filesRestoredLabel;
    private JLabel bytesProcessedLabel;
    private JProgressBar quotaProgressBar;
    private JButton btnUpgradePlan;

    public ProfileDashboardDialog(JFrame parent, UserSyncBridgeService userService, Runnable onSignOutCallback) {
        super(parent, "TakeoutFix — My Account & Dashboard", true);
        this.userService = userService;
        this.onSignOutCallback = onSignOutCallback;

        setDefaultCloseOperation(DISPOSE_ON_CLOSE);
        setResizable(false);
        setSize(580, 660);
        setLocationRelativeTo(parent);

        buildContent();
        refreshUserData();

        addWindowListener(new WindowAdapter() {
            @Override
            public void windowClosed(WindowEvent e) {
                if (autoMaskTimer != null && autoMaskTimer.isRunning()) {
                    autoMaskTimer.stop();
                }
            }
        });
    }

    private void buildContent() {
        JPanel root = new JPanel(new BorderLayout(0, 16));
        root.setBackground(ThemeColors.canvasBg());
        root.setBorder(new EmptyBorder(20, 24, 20, 24));

        // 1. Top Title & Close Bar
        JPanel topBar = new JPanel(new BorderLayout());
        topBar.setOpaque(false);

        JLabel dialogTitle = new JLabel("MY ACCOUNT & OPERATIONS CENTER");
        dialogTitle.setFont(new Font(FONT_FAMILY, Font.BOLD, 12));
        dialogTitle.setForeground(ThemeColors.textMuted());
        topBar.add(dialogTitle, BorderLayout.WEST);

        JButton btnClose = UiFactory.createSecondaryButton("✕");
        btnClose.setFont(new Font(FONT_FAMILY, Font.BOLD, 12));
        btnClose.setPreferredSize(new Dimension(32, 28));
        btnClose.addActionListener(e -> dispose());
        topBar.add(btnClose, BorderLayout.EAST);

        root.add(topBar, BorderLayout.NORTH);

        // 2. Main Scrollable Content
        JPanel body = new JPanel();
        body.setLayout(new BoxLayout(body, BoxLayout.Y_AXIS));
        body.setOpaque(false);

        // Section A: Profile Identity Card
        body.add(createIdentityCard());
        body.add(Box.createVerticalStrut(14));

        // Section B: Plan & Quota Card
        body.add(createPlanAndQuotaCard());
        body.add(Box.createVerticalStrut(14));

        // Section C: Hardware Telemetry Card
        body.add(createHardwareCard());
        body.add(Box.createVerticalStrut(16));

        root.add(body, BorderLayout.CENTER);

        // 3. Bottom Action Buttons Bar
        JPanel bottomBar = new JPanel(new BorderLayout(10, 0));
        bottomBar.setOpaque(false);

        JButton btnSignOut = UiFactory.createSecondaryButton("Sign Out");
        btnSignOut.setForeground(new Color(239, 68, 68));
        btnSignOut.addActionListener(e -> handleSignOut());
        bottomBar.add(btnSignOut, BorderLayout.WEST);

        JPanel rightActions = new JPanel(new FlowLayout(FlowLayout.RIGHT, 8, 0));
        rightActions.setOpaque(false);

        JButton btnWebDashboard = UiFactory.createSecondaryButton("Web Dashboard ↗");
        btnWebDashboard.addActionListener(e -> BrowserUtil.openBrowser("https://takeoutfix.pages.dev/dashboard"));
        rightActions.add(btnWebDashboard);

        JButton btnDone = UiFactory.createPrimaryButton("Done");
        btnDone.addActionListener(e -> dispose());
        rightActions.add(btnDone);

        bottomBar.add(rightActions, BorderLayout.EAST);

        root.add(bottomBar, BorderLayout.SOUTH);

        setContentPane(root);
    }

    private JPanel createIdentityCard() {
        JPanel card = UiFactory.createCard();
        card.setLayout(new BorderLayout(14, 0));
        card.setBorder(new EmptyBorder(14, 16, 14, 16));

        // Avatar
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
        avatarLabel.setPreferredSize(new Dimension(50, 50));
        avatarLabel.setFont(new Font(FONT_FAMILY, Font.BOLD, 18));
        avatarLabel.setForeground(Color.WHITE);
        avatarLabel.setBackground(new Color(99, 102, 241));

        JPanel avatarWrapper = new JPanel(new FlowLayout(FlowLayout.CENTER, 0, 4));
        avatarWrapper.setOpaque(false);
        avatarWrapper.add(avatarLabel);
        card.add(avatarWrapper, BorderLayout.WEST);

        // Details Column
        JPanel infoCol = new JPanel();
        infoCol.setLayout(new BoxLayout(infoCol, BoxLayout.Y_AXIS));
        infoCol.setOpaque(false);

        // Name + Plan badge row
        JPanel nameRow = new JPanel(new FlowLayout(FlowLayout.LEFT, 8, 0));
        nameRow.setOpaque(false);
        userNameLabel = new JLabel("Operator");
        userNameLabel.setFont(new Font(FONT_FAMILY, Font.BOLD, 17));
        userNameLabel.setForeground(ThemeColors.textPrimary());

        planBadge = UiFactory.createBadge("FREE", ThemeColors.pillBg(), ThemeColors.textSecondary());
        nameRow.add(userNameLabel);
        nameRow.add(planBadge);
        infoCol.add(nameRow);

        infoCol.add(Box.createVerticalStrut(4));

        // Masked Email + Reveal Eye Button
        JPanel emailRow = new JPanel(new FlowLayout(FlowLayout.LEFT, 8, 0));
        emailRow.setOpaque(false);

        emailLabel = new JLabel("Not signed in");
        emailLabel.setFont(new Font(FONT_FAMILY, Font.PLAIN, 13));
        emailLabel.setForeground(ThemeColors.textSecondary());

        btnToggleEmail = UiFactory.createSecondaryButton("👁️ Show");
        btnToggleEmail.setFont(new Font(FONT_FAMILY, Font.PLAIN, 11));
        btnToggleEmail.setPreferredSize(new Dimension(74, 24));
        btnToggleEmail.setToolTipText("Show full email address (auto-hides after 15s)");
        btnToggleEmail.addActionListener(e -> toggleEmailVisibility());

        emailRow.add(emailLabel);
        emailRow.add(btnToggleEmail);
        infoCol.add(emailRow);

        infoCol.add(Box.createVerticalStrut(4));

        JLabel subNote = new JLabel("Cloud authentication active · Offline restoration ready");
        subNote.setFont(new Font(FONT_FAMILY, Font.PLAIN, 11));
        subNote.setForeground(ThemeColors.textMuted());
        infoCol.add(subNote);

        card.add(infoCol, BorderLayout.CENTER);
        return card;
    }

    private JPanel createPlanAndQuotaCard() {
        JPanel card = UiFactory.createCard();
        card.setLayout(new BorderLayout(0, 12));
        card.setBorder(new EmptyBorder(14, 16, 14, 16));

        // Header Row
        JPanel header = new JPanel(new BorderLayout());
        header.setOpaque(false);
        JLabel lbl = new JLabel("RESTORATION QUOTA & CLOUD SYNC");
        lbl.setFont(new Font(FONT_FAMILY, Font.BOLD, 11));
        lbl.setForeground(ThemeColors.textMuted());
        header.add(lbl, BorderLayout.WEST);

        syncStatusBadge = UiFactory.createBadge("● Synced", new Color(236, 253, 245), new Color(16, 185, 129));
        header.add(syncStatusBadge, BorderLayout.EAST);
        card.add(header, BorderLayout.NORTH);

        // Stats Grid (2 Columns: Files Restored | Data Volume)
        JPanel statsGrid = new JPanel(new GridLayout(1, 2, 12, 0));
        statsGrid.setOpaque(false);

        JPanel filesBox = UiFactory.createInnerContainer(8);
        filesBox.setLayout(new BoxLayout(filesBox, BoxLayout.Y_AXIS));
        filesBox.setBorder(new EmptyBorder(10, 12, 10, 12));
        JLabel filesTitle = new JLabel("Files Restored");
        filesTitle.setFont(new Font(FONT_FAMILY, Font.PLAIN, 11));
        filesTitle.setForeground(ThemeColors.textSecondary());
        filesRestoredLabel = new JLabel("0");
        filesRestoredLabel.setFont(new Font(FONT_FAMILY, Font.BOLD, 18));
        filesRestoredLabel.setForeground(ThemeColors.textPrimary());
        filesBox.add(filesTitle);
        filesBox.add(Box.createVerticalStrut(2));
        filesBox.add(filesRestoredLabel);
        statsGrid.add(filesBox);

        JPanel bytesBox = UiFactory.createInnerContainer(8);
        bytesBox.setLayout(new BoxLayout(bytesBox, BoxLayout.Y_AXIS));
        bytesBox.setBorder(new EmptyBorder(10, 12, 10, 12));
        JLabel bytesTitle = new JLabel("Volume Processed");
        bytesTitle.setFont(new Font(FONT_FAMILY, Font.PLAIN, 11));
        bytesTitle.setForeground(ThemeColors.textSecondary());
        bytesProcessedLabel = new JLabel("0 MB");
        bytesProcessedLabel.setFont(new Font(FONT_FAMILY, Font.BOLD, 18));
        bytesProcessedLabel.setForeground(ThemeColors.textPrimary());
        bytesBox.add(bytesTitle);
        bytesBox.add(Box.createVerticalStrut(2));
        bytesBox.add(bytesProcessedLabel);
        statsGrid.add(bytesBox);

        card.add(statsGrid, BorderLayout.CENTER);

        // Bottom Quota Bar & Upgrade Trigger
        JPanel bottomRow = new JPanel(new BorderLayout(8, 6));
        bottomRow.setOpaque(false);

        quotaProgressBar = UiFactory.createSlimProgressBar();
        quotaProgressBar.setValue(100);
        bottomRow.add(quotaProgressBar, BorderLayout.NORTH);

        JPanel actionRow = new JPanel(new BorderLayout());
        actionRow.setOpaque(false);

        JButton btnSync = UiFactory.createSecondaryButton("Sync Now 🔄");
        btnSync.setFont(new Font(FONT_FAMILY, Font.PLAIN, 11));
        btnSync.addActionListener(e -> {
            btnSync.setEnabled(false);
            btnSync.setText("Syncing...");
            userService.triggerCloudSync(ok -> SwingUtilities.invokeLater(() -> {
                btnSync.setEnabled(true);
                btnSync.setText("Sync Now 🔄");
                refreshUserData();
            }));
        });
        actionRow.add(btnSync, BorderLayout.WEST);

        btnUpgradePlan = UiFactory.createPrimaryButton("Upgrade Plan ⚡");
        btnUpgradePlan.setFont(new Font(FONT_FAMILY, Font.BOLD, 11));
        btnUpgradePlan.addActionListener(e -> BrowserUtil.openBrowser("https://takeoutfix.pages.dev/pricing"));
        actionRow.add(btnUpgradePlan, BorderLayout.EAST);

        bottomRow.add(actionRow, BorderLayout.SOUTH);

        card.add(bottomRow, BorderLayout.SOUTH);
        return card;
    }

    private JPanel createHardwareCard() {
        JPanel card = UiFactory.createCard();
        card.setLayout(new BorderLayout(0, 8));
        card.setBorder(new EmptyBorder(12, 16, 12, 16));

        JLabel title = new JLabel("HOST HARDWARE TELEMETRY");
        title.setFont(new Font(FONT_FAMILY, Font.BOLD, 11));
        title.setForeground(ThemeColors.textMuted());
        card.add(title, BorderLayout.NORTH);

        JPanel row = new JPanel(new FlowLayout(FlowLayout.LEFT, 8, 4));
        row.setOpaque(false);

        String os = System.getProperty("os.name", "Windows");
        int cores = Runtime.getRuntime().availableProcessors();
        long totalRamMb = Runtime.getRuntime().maxMemory() / (1024 * 1024);

        JLabel osBadge = UiFactory.createBadge("OS: " + os, ThemeColors.pillBg(), ThemeColors.textSecondary());
        JLabel cpuBadge = UiFactory.createBadge("CPU: " + cores + " Cores", ThemeColors.pillBg(), ThemeColors.textSecondary());
        JLabel memBadge = UiFactory.createBadge("JVM RAM: " + totalRamMb + " MB", ThemeColors.pillBg(), ThemeColors.textSecondary());

        row.add(osBadge);
        row.add(cpuBadge);
        row.add(memBadge);

        card.add(row, BorderLayout.CENTER);
        return card;
    }

    private void toggleEmailVisibility() {
        isEmailRevealed = !isEmailRevealed;
        updateEmailDisplay();

        if (isEmailRevealed) {
            btnToggleEmail.setText("👁️‍🗨️ Hide");
            // Auto re-mask after 15 seconds to protect privacy on streams
            if (autoMaskTimer != null) autoMaskTimer.stop();
            autoMaskTimer = new Timer(AUTO_REVERT_SECS * 1000, e -> {
                isEmailRevealed = false;
                updateEmailDisplay();
                btnToggleEmail.setText("👁️ Show");
            });
            autoMaskTimer.setRepeats(false);
            autoMaskTimer.start();
        } else {
            btnToggleEmail.setText("👁️ Show");
            if (autoMaskTimer != null) autoMaskTimer.stop();
        }
    }

    private void updateEmailDisplay() {
        String rawEmail = userService.getCurrentEmail();
        if (rawEmail == null || rawEmail.isBlank()) {
            emailLabel.setText("Not signed in");
            btnToggleEmail.setVisible(false);
            return;
        }

        btnToggleEmail.setVisible(true);
        if (isEmailRevealed) {
            emailLabel.setText(rawEmail);
        } else {
            emailLabel.setText(maskEmail(rawEmail));
        }
    }

    /**
     * Masks email as first 2 chars + '***' + last char before '@' (e.g. ra***l@gmail.com).
     */
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

    private void refreshUserData() {
        Map<String, Object> profile = userService.getCurrentProfile();
        String name = (String) profile.getOrDefault("displayName", profile.getOrDefault("name", ""));
        if (name == null || name.isBlank()) name = "Operator";
        userNameLabel.setText(name);

        String initial = name.substring(0, 1).toUpperCase();
        avatarLabel.setText(initial);

        String plan = userService.getCurrentPlan();
        if (plan == null || plan.isBlank()) plan = "free";
        String planUpper = plan.toUpperCase();
        planBadge.setText(planUpper + " PLAN");

        if ("SUPER".equalsIgnoreCase(plan)) {
            planBadge.setBackground(new Color(245, 243, 255));
            planBadge.setForeground(new Color(124, 58, 237));
            btnUpgradePlan.setText("Manage Tier ⭐");
        } else if ("PRO".equalsIgnoreCase(plan)) {
            planBadge.setBackground(new Color(236, 253, 245));
            planBadge.setForeground(new Color(16, 185, 129));
            btnUpgradePlan.setText("Upgrade to Super ⚡");
        } else {
            planBadge.setBackground(ThemeColors.pillBg());
            planBadge.setForeground(ThemeColors.textSecondary());
            btnUpgradePlan.setText("Upgrade to Pro ⚡");
        }

        updateEmailDisplay();

        long files = userService.getUsedFiles();
        long bytes = userService.getUsedBytes();
        filesRestoredLabel.setText(String.format("%,d", files));
        bytesProcessedLabel.setText(CommandCenterPanel.formatBytes(bytes));
    }

    private void handleSignOut() {
        int opt = JOptionPane.showConfirmDialog(
                this,
                "Are you sure you want to sign out of TakeoutFix?",
                "Sign Out",
                JOptionPane.YES_NO_OPTION,
                JOptionPane.QUESTION_MESSAGE
        );
        if (opt == JOptionPane.YES_OPTION) {
            dispose();
            if (onSignOutCallback != null) {
                onSignOutCallback.run();
            } else {
                userService.signOut();
            }
        }
    }
}
