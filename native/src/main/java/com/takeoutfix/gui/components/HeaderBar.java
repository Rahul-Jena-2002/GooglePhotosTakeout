package com.takeoutfix.gui.components;

import com.formdev.flatlaf.FlatDarkLaf;
import com.formdev.flatlaf.FlatLaf;
import com.formdev.flatlaf.FlatLightLaf;
import com.takeoutfix.gui.service.NetworkMonitorService;
import com.takeoutfix.gui.service.UserSyncBridgeService;
import com.takeoutfix.gui.theme.ThemeColors;
import com.takeoutfix.service.UpdateCheckerService;
import com.takeoutfix.util.AppVersion;

import javax.swing.*;
import javax.swing.border.EmptyBorder;
import java.awt.*;
import java.net.URI;
import java.util.Map;

/**
 * Modern top navigation bar — fully smooth, pill-shaped widgets, no square edges.
 */
public class HeaderBar extends JPanel {

    private final JButton btnUpdateBanner;
    private final JLabel userNameLabel;
    private final JLabel userPlanBadge;
    private final JLabel avatarLabel;
    private final JButton btnAuthAction;
    private final JButton btnPricing;
    private final JButton btnThemeToggle;
    private final JButton btnOnlineSync;
    private final JButton btnNavDashboard;
    private final JButton btnNavRestore;
    private String activeTab = "Dashboard";
    private final JPanel userPill;
    private final JLabel brandName;
    private final JFrame mainFrame;
    private final UserSyncBridgeService userService;
    private boolean isDarkMode = false;
    private UpdateCheckerService.UpdateInfo currentUpdateInfo = null;
    private java.util.function.Consumer<String> onNavigate = null;

    public void setNavigationCallback(java.util.function.Consumer<String> onNavigate) {
        this.onNavigate = onNavigate;
    }

    public HeaderBar(NetworkMonitorService netService, UserSyncBridgeService userService, JFrame mainFrame) {
        super(new BorderLayout(15, 0));
        this.mainFrame = mainFrame;
        this.userService = userService;

        updateBarTheme();

        // ── Left: Brand + Nav Links ──────────────────────────────────────────
        JPanel leftPanel = new JPanel(new FlowLayout(FlowLayout.LEFT, 14, 0));
        leftPanel.setOpaque(false);

        // Logo badge ("TF") — fully rounded
        JLabel logo = UiFactory.createLogoBadge("TF", ThemeColors.accent(), Color.WHITE);
        ThemeColors.addThemeListener(() -> logo.setBackground(ThemeColors.accent()));

        brandName = new JLabel("TakeoutFix");
        brandName.setFont(new Font("Segoe UI", Font.BOLD, 17));
        brandName.setForeground(ThemeColors.textPrimary());

        JPanel brandBox = new JPanel(new FlowLayout(FlowLayout.LEFT, 6, 0));
        brandBox.setOpaque(false);
        brandBox.setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
        brandBox.setToolTipText("Open Dashboard Overview");
        brandBox.addMouseListener(new java.awt.event.MouseAdapter() {
            @Override public void mouseClicked(java.awt.event.MouseEvent e) {
                if (onNavigate != null) onNavigate.accept(RecoveryCenterPanel.CARD_DASHBOARD);
            }
        });
        brandBox.add(logo);
        brandBox.add(brandName);
        leftPanel.add(brandBox);

        // Internal Action Nav Links with active indicator
        btnNavDashboard = createActionNavTab("Dashboard", () -> {
            if (onNavigate != null) onNavigate.accept(RecoveryCenterPanel.CARD_DASHBOARD);
        });
        leftPanel.add(btnNavDashboard);

        btnNavRestore = createActionNavTab("Restore", () -> {
            if (onNavigate != null) onNavigate.accept(RecoveryCenterPanel.CARD_RESTORE);
        });
        leftPanel.add(btnNavRestore);

        // External Web Nav Links
        leftPanel.add(createNavLink("Home",         "https://takeoutfix.pages.dev/"));
        leftPanel.add(createNavLink("Guide",        "https://takeoutfix.pages.dev/guide"));
        leftPanel.add(createNavLink("Pricing",      "https://takeoutfix.pages.dev/pricing"));
        leftPanel.add(createNavLink("Reviews",      "https://takeoutfix.pages.dev/reviews"));
        leftPanel.add(createNavLink("FAQ",          "https://takeoutfix.pages.dev/faq"));

        add(leftPanel, BorderLayout.WEST);

        // ── Right: Theme Toggle | Update Pill | Online | User Pill | Pricing | Auth ──
        JPanel rightPanel = new JPanel(new FlowLayout(FlowLayout.RIGHT, 8, 0));
        rightPanel.setOpaque(false);

        // Update Notification Banner (Hidden by default, shown when newer version found)
        btnUpdateBanner = new JButton("⚡ Update Available") {
            @Override protected void paintComponent(Graphics g) {
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                g2.setColor(getBackground());
                g2.fillRoundRect(0, 0, getWidth(), getHeight(), getHeight(), getHeight());
                g2.dispose();
                super.paintComponent(g);
            }
        };
        btnUpdateBanner.setContentAreaFilled(false);
        btnUpdateBanner.setOpaque(false);
        btnUpdateBanner.setFont(new Font("Segoe UI", Font.BOLD, 11));
        btnUpdateBanner.setBackground(new Color(16, 185, 129));
        btnUpdateBanner.setForeground(Color.WHITE);
        btnUpdateBanner.setBorder(new EmptyBorder(4, 12, 4, 12));
        btnUpdateBanner.setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
        btnUpdateBanner.setFocusPainted(false);
        btnUpdateBanner.setVisible(false);
        btnUpdateBanner.addActionListener(e -> showUpdatePrompt());
        rightPanel.add(btnUpdateBanner);

        // Theme Toggle — smooth rounded button
        btnThemeToggle = new JButton("DARK") {
            @Override protected void paintComponent(Graphics g) {
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                g2.setColor(getBackground());
                g2.fillRoundRect(0, 0, getWidth(), getHeight(), getHeight(), getHeight());
                g2.setColor(ThemeColors.cardBorder());
                g2.setStroke(new java.awt.BasicStroke(1f));
                g2.drawRoundRect(0, 0, getWidth() - 1, getHeight() - 1, getHeight() - 1, getHeight() - 1);
                g2.dispose();
                super.paintComponent(g);
            }
        };
        btnThemeToggle.setContentAreaFilled(false);
        btnThemeToggle.setOpaque(false);
        btnThemeToggle.setFont(new Font("Segoe UI", Font.BOLD, 10));
        btnThemeToggle.setFocusPainted(false);
        btnThemeToggle.setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
        btnThemeToggle.setToolTipText("Toggle Light / Dark Theme");
        updateThemeToggleStyle();

        btnThemeToggle.addActionListener(e -> {
            isDarkMode = !isDarkMode;
            btnThemeToggle.setText(isDarkMode ? "DARK" : "LIGHT");
            ThemeColors.setDark(isDarkMode);
            if (isDarkMode) FlatDarkLaf.setup(); else FlatLightLaf.setup();
            FlatLaf.updateUI();
            if (mainFrame != null) {
                SwingUtilities.updateComponentTreeUI(mainFrame);
                mainFrame.repaint();
            }
        });
        btnOnlineSync = new JButton("● ⟳ ONLINE") {
            @Override protected void paintComponent(Graphics g) {
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                g2.setColor(getBackground());
                int r = getHeight();
                g2.fillRoundRect(0, 0, getWidth(), getHeight(), r, r);
                g2.setColor(new Color(16, 185, 129, 60));
                g2.setStroke(new java.awt.BasicStroke(1f));
                g2.drawRoundRect(0, 0, getWidth() - 1, getHeight() - 1, r - 1, r - 1);
                g2.dispose();
                super.paintComponent(g);
            }
        };
        btnOnlineSync.setContentAreaFilled(false);
        btnOnlineSync.setOpaque(false);
        btnOnlineSync.setFont(new Font("Segoe UI", Font.BOLD, 10));
        btnOnlineSync.setBackground(ThemeColors.successLight());
        btnOnlineSync.setForeground(ThemeColors.success());
        btnOnlineSync.setBorder(new EmptyBorder(4, 10, 4, 10));
        btnOnlineSync.setFocusPainted(false);
        btnOnlineSync.setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
        btnOnlineSync.setToolTipText("Cloud Online — Click to refresh & sync with Firebase");
        btnOnlineSync.addActionListener(e -> {
            if (!userService.isSignedIn()) {
                new SignInDialog(mainFrame, userService).setVisible(true);
                return;
            }
            btnOnlineSync.setEnabled(false);
            btnOnlineSync.setText("⟳ Syncing...");
            userService.triggerCloudSync(ok -> SwingUtilities.invokeLater(() -> {
                btnOnlineSync.setEnabled(true);
                btnOnlineSync.setText("● ⟳ ONLINE");
                btnOnlineSync.setBackground(ThemeColors.successLight());
                btnOnlineSync.setForeground(ThemeColors.success());
            }));
        });
        rightPanel.add(btnOnlineSync);

        // ── User Pill ────────────────────────────────────────────────────────
        userPill = new JPanel(new FlowLayout(FlowLayout.LEFT, 6, 0)) {
            @Override protected void paintComponent(Graphics g) {
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                g2.setColor(getBackground());
                int r = getHeight();
                g2.fillRoundRect(0, 0, getWidth(), getHeight(), r, r);
                g2.setColor(ThemeColors.cardBorder());
                g2.setStroke(new java.awt.BasicStroke(1f));
                g2.drawRoundRect(0, 0, getWidth() - 1, getHeight() - 1, r - 1, r - 1);
                g2.dispose();
                super.paintComponent(g);
            }
        };
        userPill.setOpaque(false);
        updateUserPillTheme();

        userNameLabel = new JLabel("Not Signed In");
        userNameLabel.setFont(new Font("Segoe UI", Font.BOLD, 12));
        userNameLabel.setForeground(ThemeColors.textPrimary());
        userPill.add(userNameLabel);

        userPlanBadge = UiFactory.createBadge(" LOCKED ", ThemeColors.warningLight(), ThemeColors.warning());
        userPill.add(userPlanBadge);

        // Avatar circle
        avatarLabel = new JLabel("?", SwingConstants.CENTER) {
            @Override protected void paintComponent(Graphics g) {
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                g2.setColor(getBackground());
                g2.fillOval(0, 0, getWidth(), getHeight());
                g2.dispose();
                super.paintComponent(g);
            }
        };
        avatarLabel.setOpaque(false);
        avatarLabel.setFont(new Font("Segoe UI", Font.BOLD, 10));
        avatarLabel.setBackground(ThemeColors.primaryButtonBg());
        avatarLabel.setForeground(ThemeColors.primaryButtonText());
        avatarLabel.setPreferredSize(new Dimension(22, 22));
        userPill.add(avatarLabel);

        rightPanel.add(userPill);

        // About & Terms Button
        JButton btnTerms = UiFactory.createSecondaryButton("Terms");
        btnTerms.addActionListener(e -> {
            int choice = JOptionPane.showOptionDialog(mainFrame,
                    "TakeoutFix Desktop Operations Center\n"
                    + AppVersion.getFullVersionString() + "\n\n"
                    + "Copyright (c) 2025-2026 TakeoutFix. All Rights Reserved.\n\n"
                    + "This software and its algorithms are proprietary.\n"
                    + "Unauthorized copying, redistribution, or modification is strictly prohibited.\n\n"
                    + "Terms of Service: https://takeoutfix.pages.dev/terms",
                    "TakeoutFix — Proprietary & Terms",
                    JOptionPane.YES_NO_OPTION,
                    JOptionPane.INFORMATION_MESSAGE,
                    null,
                    new String[]{"View Terms Online", "Close"},
                    "View Terms Online");
            if (choice == 0) {
                try { Desktop.getDesktop().browse(new URI("https://takeoutfix.pages.dev/terms")); } catch (Exception ignored) {}
            }
        });
        rightPanel.add(btnTerms);

        // Pricing / Upgrade Button
        btnPricing = UiFactory.createSecondaryButton("Pricing");
        btnPricing.addActionListener(e -> {
            try { Desktop.getDesktop().browse(new URI("https://takeoutfix.pages.dev/pricing")); } catch (Exception ignored) {}
        });
        rightPanel.add(btnPricing);

        // Auth Button — Always provides Native Login Interface when clicked
        btnAuthAction = UiFactory.createPrimaryButton("Sign In");
        btnAuthAction.addActionListener(e -> {
            if (userService.isSignedIn()) {
                String[] options = {"Switch Account", "Sign Out", "Cancel"};
                int choice = JOptionPane.showOptionDialog(mainFrame,
                        "Signed in as: " + userService.getCurrentEmail()
                                + "  (" + userService.getCurrentPlan().toUpperCase() + ")\nWhat would you like to do?",
                        "Account Management",
                        JOptionPane.DEFAULT_OPTION, JOptionPane.QUESTION_MESSAGE,
                        null, options, options[0]);
                if (choice == 0) {
                    new SignInDialog(mainFrame, userService).setVisible(true);
                } else if (choice == 1) {
                    userService.signOut();
                }
            } else {
                // Always provide native login interface instead of directly jumping to browser!
                new SignInDialog(mainFrame, userService).setVisible(true);
            }
        });
        rightPanel.add(btnAuthAction);

        add(rightPanel, BorderLayout.EAST);

        // ── Theme & auth listener wiring ─────────────────────────────────────
        ThemeColors.addThemeListener(() -> {
            updateBarTheme();
            updateThemeToggleStyle();
            updateUserPillTheme();
            logo.setBackground(ThemeColors.accent());
            brandName.setForeground(ThemeColors.textPrimary());
            userNameLabel.setForeground(ThemeColors.textPrimary());
            avatarLabel.setBackground(ThemeColors.primaryButtonBg());
            avatarLabel.setForeground(ThemeColors.primaryButtonText());
            updateUserDisplay(userService.getCurrentProfile());
            repaint();
        });

        netService.addListener(online -> SwingUtilities.invokeLater(() -> {
            if (online) {
                btnOnlineSync.setText("● ⟳ ONLINE");
                btnOnlineSync.setBackground(ThemeColors.successLight());
                btnOnlineSync.setForeground(ThemeColors.success());
            } else {
                btnOnlineSync.setText("⚠ OFFLINE");
                btnOnlineSync.setBackground(ThemeColors.dangerLight());
                btnOnlineSync.setForeground(ThemeColors.danger());
            }
        }));

        userService.addListener(this::updateUserDisplay);
        if (userService.getFirebaseSyncService() != null) {
            userService.getFirebaseSyncService().setSyncStateListener(state -> SwingUtilities.invokeLater(() -> {
                if (state == com.takeoutfix.service.FirebaseSyncService.SyncState.SYNCED) {
                    btnOnlineSync.setText("● ⟳ ONLINE");
                    btnOnlineSync.setBackground(ThemeColors.successLight());
                    btnOnlineSync.setForeground(ThemeColors.success());
                } else if (state == com.takeoutfix.service.FirebaseSyncService.SyncState.SYNCING) {
                    btnOnlineSync.setText("⟳ Syncing...");
                }
            }));
        }
    }

    public void setUpdateAvailable(UpdateCheckerService.UpdateInfo updateInfo) {
        this.currentUpdateInfo = updateInfo;
        SwingUtilities.invokeLater(() -> {
            btnUpdateBanner.setText("⚡ Update: " + updateInfo.versionTag());
            btnUpdateBanner.setVisible(true);
            revalidate();
            repaint();
        });
    }

    private void showUpdatePrompt() {
        if (currentUpdateInfo == null) return;
        int choice = JOptionPane.showOptionDialog(mainFrame,
                "A new version of TakeoutFix is available!\n\n"
                        + "Current version: " + AppVersion.getFullVersionString() + "\n"
                        + "Latest version:  " + currentUpdateInfo.versionTag() + "\n\n"
                        + "Would you like to install the OTA update directly?",
                "TakeoutFix Update Available",
                JOptionPane.YES_NO_CANCEL_OPTION,
                JOptionPane.INFORMATION_MESSAGE,
                null,
                new String[]{"Install OTA Update", "View on Web", "Later"},
                "Install OTA Update");
        if (choice == 0) {
            UpdateCheckerService.performOtaUpdate(mainFrame, currentUpdateInfo);
        } else if (choice == 1) {
            UpdateCheckerService.openDownloadPage(currentUpdateInfo.htmlUrl());
        }
    }

    private void updateBarTheme() {
        setBackground(ThemeColors.cardBg());
        setBorder(BorderFactory.createCompoundBorder(
                BorderFactory.createMatteBorder(0, 0, 1, 0, ThemeColors.cardBorder()),
                new EmptyBorder(8, 20, 8, 20)
        ));
    }

    private void updateThemeToggleStyle() {
        btnThemeToggle.setBackground(ThemeColors.pillBg());
        btnThemeToggle.setForeground(ThemeColors.textPrimary());
        btnThemeToggle.setBorder(new EmptyBorder(5, 12, 5, 12));
        btnThemeToggle.repaint();
    }

    private void updateUserPillTheme() {
        userPill.setBackground(ThemeColors.pillBg());
        userPill.setBorder(new EmptyBorder(4, 10, 4, 10));
        userPill.repaint();
    }

    private void updateUserDisplay(Map<String, Object> user) {
        SwingUtilities.invokeLater(() -> {
            if (!userService.isSignedIn()) {
                userPill.setVisible(false);
                btnAuthAction.setText("Sign In");
                btnPricing.setText("Pricing");
                revalidate();
                repaint();
                return;
            }

            userPill.setVisible(true);
            String email = (String) user.getOrDefault("email", "");
            String name = !email.isEmpty() ? email.split("@")[0] : "Operator";
            userNameLabel.setText("Hi, " + name);
            avatarLabel.setText(name.substring(0, 1).toUpperCase());
            btnAuthAction.setText("Sign Out");

            String plan = (String) user.getOrDefault("plan", "free");
            if ("super".equalsIgnoreCase(plan)) {
                userPlanBadge.setText(" SUPER ");
                userPlanBadge.setBackground(ThemeColors.accentLight());
                userPlanBadge.setForeground(ThemeColors.accent());
                btnPricing.setText("Super Active");
            } else if ("pro".equalsIgnoreCase(plan)) {
                userPlanBadge.setText(" PRO ");
                userPlanBadge.setBackground(ThemeColors.successLight());
                userPlanBadge.setForeground(ThemeColors.success());
                btnPricing.setText("Pro Active");
            } else {
                userPlanBadge.setText(" FREE ");
                userPlanBadge.setBackground(ThemeColors.pillBg());
                userPlanBadge.setForeground(ThemeColors.textMuted());
                btnPricing.setText("Upgrade");
            }
        });
    }

    private JLabel createNavLink(String text, String url) {
        JLabel link = new JLabel(text);
        link.setFont(new Font("Segoe UI", Font.PLAIN, 12));
        link.setForeground(ThemeColors.textSecondary());
        link.setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));

        ThemeColors.addThemeListener(() -> link.setForeground(ThemeColors.textSecondary()));

        link.addMouseListener(new java.awt.event.MouseAdapter() {
            @Override public void mouseEntered(java.awt.event.MouseEvent e) { link.setForeground(ThemeColors.textPrimary()); }
            @Override public void mouseExited(java.awt.event.MouseEvent e)  { link.setForeground(ThemeColors.textSecondary()); }
            @Override public void mouseClicked(java.awt.event.MouseEvent e) {
                try { Desktop.getDesktop().browse(new URI(url)); } catch (Exception ignored) {}
            }
        });
        return link;
    }

    private JButton createActionNavTab(String text, Runnable action) {
        JButton btn = new JButton(text) {
            @Override protected void paintComponent(Graphics g) {
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                boolean isSelected = text.equalsIgnoreCase(activeTab);
                if (isSelected) {
                    g2.setColor(ThemeColors.accent());
                    int r = getHeight();
                    g2.fillRoundRect(0, 0, getWidth(), getHeight(), r, r);
                } else if (getModel().isRollover()) {
                    g2.setColor(ThemeColors.pillBg());
                    int r = getHeight();
                    g2.fillRoundRect(0, 0, getWidth(), getHeight(), r, r);
                }
                g2.dispose();
                super.paintComponent(g);
            }
        };
        btn.setContentAreaFilled(false);
        btn.setOpaque(false);
        btn.setBorderPainted(false);
        btn.setFocusPainted(false);
        btn.setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
        btn.setBorder(new EmptyBorder(5, 14, 5, 14));
        btn.addActionListener(e -> {
            setActiveTab(text);
            if (action != null) action.run();
        });
        ThemeColors.addThemeListener(() -> updateTabStyle(btn, text));
        updateTabStyle(btn, text);
        return btn;
    }

    public void setActiveTab(String tabName) {
        String normalized = (tabName != null && tabName.toLowerCase().contains("dashboard")) ? "Dashboard" : "Restore";
        this.activeTab = normalized;
        SwingUtilities.invokeLater(() -> {
            updateTabStyle(btnNavDashboard, "Dashboard");
            updateTabStyle(btnNavRestore, "Restore");
            repaint();
        });
    }

    private void updateTabStyle(JButton btn, String tabName) {
        if (btn == null) return;
        boolean isSelected = tabName.equalsIgnoreCase(activeTab);
        if (isSelected) {
            btn.setForeground(Color.WHITE);
            btn.setFont(new Font("Segoe UI", Font.BOLD, 12));
        } else {
            btn.setForeground(ThemeColors.textSecondary());
            btn.setFont(new Font("Segoe UI", Font.PLAIN, 12));
        }
    }

    public JFrame getMainFrame() {
        return mainFrame;
    }
}
