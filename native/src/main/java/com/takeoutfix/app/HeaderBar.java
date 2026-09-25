package com.takeoutfix.app;

import com.formdev.flatlaf.FlatDarkLaf;
import com.formdev.flatlaf.FlatLaf;
import com.formdev.flatlaf.FlatLightLaf;
import com.takeoutfix.auth.ui.SignInDialog;
import com.takeoutfix.auth.UserSyncBridgeService;
import com.takeoutfix.network.NetworkMonitorService;
import com.takeoutfix.shared.theme.ThemeColors;
import com.takeoutfix.shared.ui.AppRoutes;
import com.takeoutfix.shared.ui.UiFactory;
import com.takeoutfix.shared.util.AppVersion;
import com.takeoutfix.updates.UpdateCheckerService;

import javax.swing.*;
import javax.swing.border.EmptyBorder;
import java.awt.*;
import java.net.URI;
import java.util.Map;
import java.util.function.Consumer;

/**
 * Top Global Header Bar with integrated User profile, Cloud Online Status,
 * theme toggle, and unified action navigation tabs.
 */
public class HeaderBar extends JPanel {

    private static final long serialVersionUID = 1L;
    private static final String FONT_FAMILY = "Segoe UI";
    private static final String NAV_DASHBOARD = "Dashboard";
    private static final String NAV_RESTORE = "Restore";
    private static final String STATUS_ONLINE = "ONLINE";
    private static final String STATUS_SYNCING = "Syncing...";
    private static final String TERMS_URL = "https://takeoutfix.pages.dev/terms";

    private final JButton btnUpdateBanner;
    private final JButton btnAuthAction;
    private final JLabel userNameLabel;
    private final JLabel avatarLabel;
    private final JButton btnThemeToggle;
    private final JButton btnOnlineSync;
    private final JButton btnNavDashboard;
    private final JButton btnNavRestore;
    private String activeTab = NAV_DASHBOARD;
    private final JPanel userPill;
    private final JLabel brandName;
    private final JFrame mainFrame;
    private final transient UserSyncBridgeService userService;
    private boolean isDarkMode = false;
    private transient UpdateCheckerService.UpdateInfo currentUpdateInfo = null;
    private transient Consumer<String> onNavigate = null;
    private transient Runnable onSignOutListener = null;

    public void setNavigationCallback(Consumer<String> onNavigate) {
        this.onNavigate = onNavigate;
    }

    public void setOnSignOutListener(Runnable onSignOutListener) {
        this.onSignOutListener = onSignOutListener;
    }

    public HeaderBar(NetworkMonitorService netService, UserSyncBridgeService userService, JFrame mainFrame) {
        super(new BorderLayout(15, 0));
        this.mainFrame = mainFrame;
        this.userService = userService;

        updateBarTheme();

        // 1. Left: Brand & Navigation Links
        JLabel logo = UiFactory.createBrandLogoLabel(32);
        ThemeColors.addThemeListener(logo::repaint);

        brandName = new JLabel("TakeoutFix");
        brandName.setFont(new Font(FONT_FAMILY, Font.BOLD, 17));
        brandName.setForeground(ThemeColors.textPrimary());

        btnNavDashboard = createActionNavTab(NAV_DASHBOARD, () -> navigate(AppRoutes.DASHBOARD));
        btnNavRestore = createActionNavTab(NAV_RESTORE, () -> navigate(AppRoutes.RESTORE));

        JPanel leftPanel = createLeftPanel(logo);
        add(leftPanel, BorderLayout.WEST);

        // 2. Right: Action Buttons & Indicators
        btnUpdateBanner = createUpdateBannerButton();
        btnThemeToggle = createThemeToggleButton();
        btnOnlineSync = createOnlineSyncButton();

        userPill = createUserPillPanel();
        userNameLabel = createUserNameLabel();
        avatarLabel = createAvatarLabel();
        userPill.add(userNameLabel);
        userPill.add(avatarLabel);

        btnAuthAction = UiFactory.createPrimaryButton("Sign In");
        btnAuthAction.addActionListener(e -> handleAuthAction());

        JPanel rightPanel = createRightPanel();
        add(rightPanel, BorderLayout.EAST);

        // 3. Setup Listeners
        setupEventWiring(netService);
    }

    private void navigate(String route) {
        if (onNavigate != null) {
            onNavigate.accept(route);
        }
    }

    private JPanel createLeftPanel(JLabel logo) {
        JPanel leftPanel = new JPanel(new FlowLayout(FlowLayout.LEFT, 14, 0));
        leftPanel.setOpaque(false);

        JPanel brandBox = new JPanel(new FlowLayout(FlowLayout.LEFT, 6, 0));
        brandBox.setOpaque(false);
        brandBox.setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
        brandBox.setToolTipText("Open Dashboard Overview");
        brandBox.addMouseListener(new java.awt.event.MouseAdapter() {
            @Override public void mouseClicked(java.awt.event.MouseEvent e) {
                navigate(AppRoutes.DASHBOARD);
            }
        });
        brandBox.add(logo);
        brandBox.add(brandName);
        leftPanel.add(brandBox);

        leftPanel.add(btnNavDashboard);
        leftPanel.add(btnNavRestore);

        JButton btnWebsite = UiFactory.createSecondaryButton("Website");
        javax.swing.Icon globeIcon = UiFactory.svgDynamicIcon("globe", 13, () -> ThemeColors.secondaryButtonText());
        if (globeIcon != null) {
            btnWebsite.setIcon(globeIcon);
            btnWebsite.setIconTextGap(6);
        }
        btnWebsite.setFont(new Font(FONT_FAMILY, Font.PLAIN, 12));
        btnWebsite.setToolTipText("Open takeoutfix.pages.dev in browser");
        btnWebsite.addActionListener(e -> {
            try {
                com.takeoutfix.shared.util.BrowserUtil.openBrowser("https://takeoutfix.pages.dev/");
            } catch (Exception ignored) {
                // Non-fatal browser launch failure
            }
        });
        leftPanel.add(btnWebsite);

        return leftPanel;
    }

    private JPanel createRightPanel() {
        JPanel rightPanel = new JPanel(new FlowLayout(FlowLayout.RIGHT, 8, 0));
        rightPanel.setOpaque(false);
        rightPanel.add(btnUpdateBanner);
        rightPanel.add(btnThemeToggle);
        rightPanel.add(btnOnlineSync);
        rightPanel.add(userPill);
        rightPanel.add(btnAuthAction);
        return rightPanel;
    }

    private JButton createUpdateBannerButton() {
        JButton btn = new JButton("⚡ Update Available") {
            private static final long serialVersionUID = 1L;

            @Override protected void paintComponent(Graphics g) {
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                g2.setColor(getBackground());
                g2.fillRoundRect(0, 0, getWidth(), getHeight(), getHeight(), getHeight());
                g2.dispose();
                super.paintComponent(g);
            }
        };
        btn.setContentAreaFilled(false);
        btn.setOpaque(false);
        btn.setFont(new Font(FONT_FAMILY, Font.BOLD, 11));
        btn.setBackground(new Color(16, 185, 129));
        btn.setForeground(Color.WHITE);
        btn.setBorder(new EmptyBorder(4, 12, 4, 12));
        btn.setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
        btn.setFocusPainted(false);
        btn.setVisible(false);
        btn.addActionListener(e -> showUpdatePrompt());
        return btn;
    }

    private JButton createThemeToggleButton() {
        JButton btn = new JButton() {
            private static final long serialVersionUID = 1L;

            @Override protected void paintComponent(Graphics g) {
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                g2.setColor(getBackground());
                g2.fillRoundRect(0, 0, getWidth(), getHeight(), getHeight(), getHeight());
                g2.setColor(ThemeColors.cardBorder());
                g2.setStroke(new java.awt.BasicStroke(1f));
                g2.drawRoundRect(0, 0, getWidth() - 1, getHeight() - 1, getHeight() - 1, getHeight() - 1);

                int cx = getWidth() / 2;
                int cy = getHeight() / 2;
                g2.setColor(ThemeColors.textPrimary());

                if (isDarkMode) {
                    java.awt.geom.Area moon = new java.awt.geom.Area(new java.awt.geom.Ellipse2D.Double(cx - 6, cy - 6, 12, 12));
                    moon.subtract(new java.awt.geom.Area(new java.awt.geom.Ellipse2D.Double(cx - 3, cy - 8, 11, 11)));
                    g2.fill(moon);
                } else {
                    g2.fillOval(cx - 4, cy - 4, 8, 8);
                    g2.setStroke(new java.awt.BasicStroke(1.5f, java.awt.BasicStroke.CAP_ROUND, java.awt.BasicStroke.JOIN_ROUND));
                    for (int i = 0; i < 8; i++) {
                        double angle = Math.toRadians(i * 45.0);
                        int x1 = (int) (cx + Math.cos(angle) * 6.0);
                        int y1 = (int) (cy + Math.sin(angle) * 6.0);
                        int x2 = (int) (cx + Math.cos(angle) * 9.0);
                        int y2 = (int) (cy + Math.sin(angle) * 9.0);
                        g2.drawLine(x1, y1, x2, y2);
                    }
                }
                g2.dispose();
            }
        };
        btn.setContentAreaFilled(false);
        btn.setOpaque(false);
        btn.setPreferredSize(new Dimension(32, 30));
        btn.setFocusPainted(false);
        btn.setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
        btn.setToolTipText("Switch Theme");
        btn.addActionListener(e -> toggleTheme());
        return btn;
    }

    private void toggleTheme() {
        isDarkMode = !isDarkMode;
        btnThemeToggle.setToolTipText(isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode");
        ThemeColors.setDark(isDarkMode);
        if (isDarkMode) {
            FlatDarkLaf.setup();
        } else {
            FlatLightLaf.setup();
        }
        FlatLaf.updateUI();
        if (mainFrame != null) {
            SwingUtilities.updateComponentTreeUI(mainFrame);
            mainFrame.repaint();
        }
        btnThemeToggle.repaint();
    }

    private JButton createOnlineSyncButton() {
        JButton btn = new JButton(STATUS_ONLINE) {
            private static final long serialVersionUID = 1L;

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
        btn.setContentAreaFilled(false);
        btn.setOpaque(false);
        btn.setFont(new Font(FONT_FAMILY, Font.BOLD, 10));
        btn.setBackground(ThemeColors.successLight());
        btn.setForeground(ThemeColors.success());
        btn.setBorder(new EmptyBorder(4, 10, 4, 10));
        javax.swing.Icon reloadIcon = UiFactory.svgDynamicIcon("reload", 11, () -> btn.getForeground());
        if (reloadIcon != null) {
            btn.setIcon(reloadIcon);
            btn.setIconTextGap(5);
        }
        btn.setFocusPainted(false);
        btn.setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
        btn.setToolTipText("Cloud Online — Click to refresh & sync with Firebase");
        btn.addActionListener(e -> handleOnlineSync());
        return btn;
    }

    private void handleOnlineSync() {
        if (userService == null || !userService.isSignedIn()) {
            new SignInDialog(mainFrame, userService).setVisible(true);
            return;
        }
        btnOnlineSync.setEnabled(false);
        btnOnlineSync.setText(STATUS_SYNCING);
        userService.triggerCloudSync(ok -> SwingUtilities.invokeLater(() -> {
            btnOnlineSync.setEnabled(true);
            btnOnlineSync.setText(STATUS_ONLINE);
            btnOnlineSync.setBackground(ThemeColors.successLight());
            btnOnlineSync.setForeground(ThemeColors.success());
        }));
    }

    private JPanel createUserPillPanel() {
        JPanel pill = new JPanel(new FlowLayout(FlowLayout.LEFT, 6, 0)) {
            private static final long serialVersionUID = 1L;

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
        pill.setOpaque(false);
        pill.setBackground(ThemeColors.pillBg());
        pill.setBorder(new EmptyBorder(4, 10, 4, 10));
        return pill;
    }

    private JLabel createUserNameLabel() {
        JLabel label = new JLabel("Not Signed In");
        label.setFont(new Font(FONT_FAMILY, Font.BOLD, 12));
        label.setForeground(ThemeColors.textPrimary());
        return label;
    }

    private JLabel createAvatarLabel() {
        JLabel label = new JLabel("?", SwingConstants.CENTER) {
            private static final long serialVersionUID = 1L;

            @Override protected void paintComponent(Graphics g) {
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                g2.setColor(getBackground());
                g2.fillOval(0, 0, getWidth(), getHeight());
                g2.dispose();
                super.paintComponent(g);
            }
        };
        label.setOpaque(false);
        label.setFont(new Font(FONT_FAMILY, Font.BOLD, 10));
        label.setBackground(ThemeColors.primaryButtonBg());
        label.setForeground(ThemeColors.primaryButtonText());
        label.setPreferredSize(new Dimension(22, 22));
        return label;
    }

    private void handleAuthAction() {
        if (userService != null && userService.isSignedIn()) {
            String[] options = {"Switch Account", "About & Terms", "Sign Out", "Cancel"};
            int choice = JOptionPane.showOptionDialog(mainFrame,
                    "Signed in as: " + userService.getCurrentEmail()
                            + "  (" + userService.getCurrentPlan().toUpperCase() + ")\nWhat would you like to do?",
                    "Account Management",
                    JOptionPane.DEFAULT_OPTION, JOptionPane.QUESTION_MESSAGE,
                    null, options, options[0]);
            if (choice == 0) {
                new SignInDialog(mainFrame, userService).setVisible(true);
            } else if (choice == 2) {
                if (onSignOutListener != null) {
                    onSignOutListener.run();
                } else {
                    userService.signOut();
                }
            } else if (choice == 1) {
                showAboutDialog();
            }
        } else {
            new SignInDialog(mainFrame, userService).setVisible(true);
        }
    }

    private void setupEventWiring(NetworkMonitorService netService) {
        setupThemeListener();
        setupNetworkListener(netService);
        setupUserSyncListener();
    }

    private void setupThemeListener() {
        ThemeColors.addThemeListener(() -> {
            updateBarTheme();
            updateThemeToggleStyle();
            updateUserPillTheme();
            avatarLabel.setBackground(ThemeColors.primaryButtonBg());
            avatarLabel.setForeground(ThemeColors.primaryButtonText());
            if (userService != null) {
                updateUserDisplay(userService.getCurrentProfile());
            }
            repaint();
        });
    }

    private void setupNetworkListener(NetworkMonitorService netService) {
        if (netService != null) {
            netService.addListener(online -> SwingUtilities.invokeLater(() -> {
                if (Boolean.TRUE.equals(online)) {
                    btnOnlineSync.setText(STATUS_ONLINE);
                    btnOnlineSync.setBackground(ThemeColors.successLight());
                    btnOnlineSync.setForeground(ThemeColors.success());
                } else {
                    btnOnlineSync.setText("⚠ OFFLINE");
                    btnOnlineSync.setBackground(ThemeColors.dangerLight());
                    btnOnlineSync.setForeground(ThemeColors.danger());
                }
            }));
        }
    }

    private void setupUserSyncListener() {
        if (userService != null) {
            userService.addListener(this::updateUserDisplay);
            if (userService.getFirebaseSyncService() != null) {
                userService.getFirebaseSyncService().setSyncStateListener(state -> SwingUtilities.invokeLater(() -> {
                    if (state == com.takeoutfix.auth.FirebaseSyncService.SyncState.SYNCED) {
                        btnOnlineSync.setText(STATUS_ONLINE);
                        btnOnlineSync.setBackground(ThemeColors.successLight());
                        btnOnlineSync.setForeground(ThemeColors.success());
                    } else if (state == com.takeoutfix.auth.FirebaseSyncService.SyncState.SYNCING) {
                        btnOnlineSync.setText(STATUS_SYNCING);
                    }
                }));
            }
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
        UpdateCheckerService.showUpdateDetailsDialog(mainFrame, currentUpdateInfo);
    }

    private void showAboutDialog() {
        int choice = JOptionPane.showOptionDialog(mainFrame,
                "TakeoutFix Desktop  " + AppVersion.getFullVersionString() + "\n\n"
                + "Copyright \u00a9 2025\u20132026 TakeoutFix. All rights reserved.\n\n"
                + "Terms of Service: " + TERMS_URL,
                "About TakeoutFix",
                JOptionPane.YES_NO_OPTION,
                JOptionPane.INFORMATION_MESSAGE,
                null,
                new String[]{"View Terms", "Close"},
                "View Terms");
        if (choice == 0) {
            try {
                Desktop.getDesktop().browse(new URI(TERMS_URL));
            } catch (Exception ignored) {
                // Non-fatal browser launch failure
            }
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
        btnThemeToggle.setBorder(new EmptyBorder(5, 5, 5, 5));
        btnThemeToggle.repaint();
    }

    private void updateUserPillTheme() {
        userPill.setBackground(ThemeColors.pillBg());
        userPill.setBorder(new EmptyBorder(4, 10, 4, 10));
        userPill.repaint();
    }

    private void updateUserDisplay(Map<String, Object> user) {
        SwingUtilities.invokeLater(() -> {
            if (userService == null || !userService.isSignedIn()) {
                userPill.setVisible(false);
                btnAuthAction.setText("Sign In");
                revalidate();
                repaint();
                return;
            }

            userPill.setVisible(true);
            String firstName = resolveFirstName(user);

            userNameLabel.setText("Hi, " + firstName);
            avatarLabel.setText(firstName.substring(0, 1).toUpperCase());
            btnAuthAction.setText("Sign Out");
        });
    }

    private String resolveFirstName(Map<String, Object> user) {
        String rawName = String.valueOf(user.getOrDefault("displayName", user.getOrDefault("name", "")));
        if (rawName == null || rawName.isBlank() || "null".equalsIgnoreCase(rawName)) {
            String email = String.valueOf(user.getOrDefault("email", ""));
            if (!email.isEmpty() && email.contains("@")) {
                rawName = email.split("@")[0].replaceAll("[._0-9]+.*", "");
            }
        }
        if (rawName == null || rawName.isBlank()) {
            rawName = "User";
        }
        String first = rawName.trim().split("\\s+")[0];
        if (!first.isEmpty()) {
            return Character.toUpperCase(first.charAt(0)) + (first.length() > 1 ? first.substring(1) : "");
        }
        return "User";
    }

    private JButton createActionNavTab(String text, Runnable action) {
        JButton btn = new JButton(text) {
            private static final long serialVersionUID = 1L;

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
        String normalized = (tabName != null && tabName.toLowerCase().contains("dashboard")) ? NAV_DASHBOARD : NAV_RESTORE;
        this.activeTab = normalized;
        SwingUtilities.invokeLater(() -> {
            updateTabStyle(btnNavDashboard, NAV_DASHBOARD);
            updateTabStyle(btnNavRestore, NAV_RESTORE);
            repaint();
        });
    }

    private void updateTabStyle(JButton btn, String tabName) {
        if (btn == null) return;
        boolean isSelected = tabName.equalsIgnoreCase(activeTab);
        if (isSelected) {
            btn.setForeground(Color.WHITE);
            btn.setFont(new Font(FONT_FAMILY, Font.BOLD, 12));
        } else {
            btn.setForeground(ThemeColors.textSecondary());
            btn.setFont(new Font(FONT_FAMILY, Font.PLAIN, 12));
        }
    }

    public JFrame getMainFrame() {
        return mainFrame;
    }
}
