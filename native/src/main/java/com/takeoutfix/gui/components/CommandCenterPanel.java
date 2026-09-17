package com.takeoutfix.gui.components;

import com.takeoutfix.gui.service.SystemHardwareInfo;
import com.takeoutfix.gui.service.UserSyncBridgeService;
import com.takeoutfix.gui.theme.ThemeColors;
import com.takeoutfix.service.SessionStatsService;

import javax.swing.*;
import javax.swing.border.EmptyBorder;
import java.awt.*;
import java.net.URI;
import java.text.NumberFormat;
import java.util.Locale;
import java.util.Map;

/**
 * Clean, perfectly aligned left sidebar Command Center.
 * Includes storage progress, telemetry, 4-color status cards, and 3 distinct Amazon ad banners.
 * Uses GridBagLayout for rock-solid grid alignment and clean resizing.
 */
public class CommandCenterPanel extends JPanel {

    private final JLabel stateBadge;
    private final JLabel storageProgressText;
    private final JProgressBar storageProgressBar;
    private final JLabel filesProgressText;
    private final JProgressBar filesProgressBar;
    private JButton btnUpgradeQuota;

    private final JLabel ramLabel;
    private final JLabel cpuLabel;
    private final JLabel threadLabel;

    private final JLabel scannedCountLabel = new JLabel("0 / -");
    private final JLabel restoredCountLabel = new JLabel("0 / -");
    private final JLabel unmatchedCountLabel = new JLabel("0");
    private final JLabel errorsCountLabel = new JLabel("0");

    private final UserSyncBridgeService userService;
    private final SessionStatsService statsService;

    public SessionStatsService getStatsService() {
        return statsService;
    }

    public CommandCenterPanel(UserSyncBridgeService userService, SessionStatsService statsService) {
        this.userService = userService;
        this.statsService = statsService;

        setLayout(new BorderLayout(0, 8));
        setPreferredSize(new Dimension(320, 0));
        setMinimumSize(new Dimension(300, 0));
        setBorder(new EmptyBorder(12, 12, 12, 12));

        Runnable updateTheme = () -> {
            setBackground(ThemeColors.canvasBg());
            repaint();
        };
        updateTheme.run();
        ThemeColors.addThemeListener(updateTheme);

        // ── PINNED TOP PANEL: Header + Storage Quota Card (NEVER hides on window resize) ──
        JPanel pinnedTop = new JPanel(new GridBagLayout());
        pinnedTop.setOpaque(false);

        // 1. Command Center Header
        JPanel headerPanel = createCommandCenterHeader();
        stateBadge = (JLabel) headerPanel.getClientProperty("stateBadge");
        pinnedTop.add(headerPanel, createRowConstraints(0));

        // 2. Storage Quota Card
        JPanel quotaCard = createStorageQuotaCard();
        storageProgressText = (JLabel) quotaCard.getClientProperty("storageText");
        storageProgressBar = (JProgressBar) quotaCard.getClientProperty("storageBar");
        filesProgressText = (JLabel) quotaCard.getClientProperty("filesText");
        filesProgressBar = (JProgressBar) quotaCard.getClientProperty("filesBar");
        pinnedTop.add(quotaCard, createRowConstraints(1));

        add(pinnedTop, BorderLayout.NORTH);

        // ── SCROLLABLE BODY PANEL: Telemetry, stats, ad banners ───────────────
        JPanel scrollBody = new ScrollablePanel(new GridBagLayout());
        scrollBody.setOpaque(false);
        int gridY = 0;

        // 3. Resource Telemetry Card
        JPanel telemCard = createResourceTelemetryCard();
        ramLabel = (JLabel) telemCard.getClientProperty("ramLabel");
        cpuLabel = (JLabel) telemCard.getClientProperty("cpuLabel");
        threadLabel = (JLabel) telemCard.getClientProperty("threadLabel");
        scrollBody.add(telemCard, createRowConstraints(gridY++));

        // 4. Statistics Cards
        JPanel statsCard = createStatisticsCards();
        scrollBody.add(statsCard, createRowConstraints(gridY++));

        // 5. Ad Banner 1 (SanDisk Extreme SSD)
        JPanel ad1 = createAdBanner1();
        scrollBody.add(ad1, createRowConstraints(gridY++));

        // 6. Ad Banner 2 (Samsung T7 Shield SSD)
        JPanel ad2 = createAdBanner2();
        scrollBody.add(ad2, createRowConstraints(gridY++));

        // 7. Ad Banner 3 (Crucial X9 Pro SSD)
        JPanel ad3 = createAdBanner3();
        scrollBody.add(ad3, createRowConstraints(gridY++));

        // 8. Vertical Spacer to push items to top of scroll
        GridBagConstraints fillerGbc = new GridBagConstraints();
        fillerGbc.gridx = 0;
        fillerGbc.gridy = gridY;
        fillerGbc.weightx = 1.0;
        fillerGbc.weighty = 1.0;
        fillerGbc.fill = GridBagConstraints.VERTICAL;
        scrollBody.add(Box.createGlue(), fillerGbc);

        JScrollPane scroll = new JScrollPane(scrollBody);
        scroll.setBorder(null);
        scroll.setOpaque(false);
        scroll.getViewport().setOpaque(false);
        scroll.setHorizontalScrollBarPolicy(ScrollPaneConstants.HORIZONTAL_SCROLLBAR_NEVER);
        scroll.getVerticalScrollBar().setUnitIncrement(16);

        add(scroll, BorderLayout.CENTER);

        // Listeners
        userService.addListener(this::updateUserData);
        updateUserData(userService.getCurrentProfile());
        startHardwareMonitor();
    }

    private GridBagConstraints createRowConstraints(int row) {
        GridBagConstraints gbc = new GridBagConstraints();
        gbc.gridx = 0;
        gbc.gridy = row;
        gbc.weightx = 1.0;
        gbc.weighty = 0.0;
        gbc.fill = GridBagConstraints.HORIZONTAL;
        gbc.anchor = GridBagConstraints.NORTH;
        gbc.insets = new Insets(0, 0, 8, 0);
        return gbc;
    }

    // 1. Command Center Header
    private JPanel createCommandCenterHeader() {
        JPanel panel = new JPanel(new BorderLayout(8, 0));
        panel.setOpaque(false);

        JLabel title = new JLabel("COMMAND CENTER");
        title.setFont(new Font("Segoe UI", Font.BOLD, 12));
        title.setForeground(ThemeColors.textSecondary());
        panel.add(title, BorderLayout.WEST);

        JLabel badge = UiFactory.createBadge("IDLE", ThemeColors.pillBg(), ThemeColors.textMuted());
        panel.add(badge, BorderLayout.EAST);
        panel.putClientProperty("stateBadge", badge);

        ThemeColors.addThemeListener(() -> {
            title.setForeground(ThemeColors.textSecondary());
        });
        return panel;
    }

    // 2. Storage Quota Card
    private JPanel createStorageQuotaCard() {
        JPanel card = UiFactory.createCard();
        card.setLayout(new GridBagLayout());

        GridBagConstraints gbc = new GridBagConstraints();
        gbc.gridx = 0;
        gbc.gridy = 0;
        gbc.weightx = 1.0;
        gbc.fill = GridBagConstraints.HORIZONTAL;
        gbc.insets = new Insets(0, 0, 4, 0);

        JLabel lblStorage = new JLabel("STORAGE LIMIT PROGRESS");
        lblStorage.setFont(new Font("Segoe UI", Font.BOLD, 10));
        lblStorage.setForeground(ThemeColors.textMuted());
        card.add(lblStorage, gbc);

        JLabel storageTxt = new JLabel("0.0 MB / 500 MB");
        storageTxt.setFont(new Font("Segoe UI", Font.BOLD, 13));
        storageTxt.setForeground(ThemeColors.textPrimary());
        gbc.gridy = 1;
        gbc.insets = new Insets(0, 0, 6, 0);
        card.add(storageTxt, gbc);

        JProgressBar storagePb = UiFactory.createSlimProgressBar();
        gbc.gridy = 2;
        gbc.insets = new Insets(0, 0, 12, 0);
        card.add(storagePb, gbc);

        JLabel lblFiles = new JLabel("FILES LIMIT PROGRESS");
        lblFiles.setFont(new Font("Segoe UI", Font.BOLD, 10));
        lblFiles.setForeground(ThemeColors.textMuted());
        gbc.gridy = 3;
        gbc.insets = new Insets(0, 0, 4, 0);
        card.add(lblFiles, gbc);

        JLabel filesTxt = new JLabel("0 / 250");
        filesTxt.setFont(new Font("Segoe UI", Font.BOLD, 13));
        filesTxt.setForeground(ThemeColors.textPrimary());
        gbc.gridy = 4;
        gbc.insets = new Insets(0, 0, 6, 0);
        card.add(filesTxt, gbc);

        JProgressBar filesPb = UiFactory.createSlimProgressBar();
        gbc.gridy = 5;
        gbc.insets = new Insets(0, 0, 8, 0);
        card.add(filesPb, gbc);

        btnUpgradeQuota = UiFactory.createPrimaryButton("⚡ Upgrade to Unlimited");
        btnUpgradeQuota.setFont(new Font("Segoe UI", Font.BOLD, 11));
        btnUpgradeQuota.setPreferredSize(new Dimension(240, 32));
        btnUpgradeQuota.addActionListener(e -> {
            if (!userService.isSignedIn()) {
                UserSyncBridgeService.openGoogleLogin(SwingUtilities.getWindowAncestor(this));
            } else {
                try {
                    Desktop.getDesktop().browse(new URI("https://takeoutfix.pages.dev/pricing"));
                } catch (Exception ignored) {}
            }
        });
        gbc.gridy = 6;
        gbc.insets = new Insets(0, 0, 0, 0);
        card.add(btnUpgradeQuota, gbc);

        card.putClientProperty("storageText", storageTxt);
        card.putClientProperty("storageBar", storagePb);
        card.putClientProperty("filesText", filesTxt);
        card.putClientProperty("filesBar", filesPb);

        ThemeColors.addThemeListener(() -> {
            lblStorage.setForeground(ThemeColors.textMuted());
            storageTxt.setForeground(ThemeColors.textPrimary());
            lblFiles.setForeground(ThemeColors.textMuted());
            filesTxt.setForeground(ThemeColors.textPrimary());
        });

        return card;
    }

    // 3. Resource Telemetry Card
    private JPanel createResourceTelemetryCard() {
        JPanel card = UiFactory.createCard();
        card.setLayout(new GridBagLayout());

        GridBagConstraints gbc = new GridBagConstraints();
        gbc.gridx = 0;
        gbc.gridy = 0;
        gbc.weightx = 1.0;
        gbc.fill = GridBagConstraints.HORIZONTAL;
        gbc.insets = new Insets(0, 0, 8, 0);

        JLabel lblTitle = new JLabel("HARDWARE TELEMETRY");
        lblTitle.setFont(new Font("Segoe UI", Font.BOLD, 10));
        lblTitle.setForeground(ThemeColors.textMuted());
        card.add(lblTitle, gbc);

        JPanel row = new JPanel(new GridLayout(1, 3, 6, 0));
        row.setOpaque(false);

        JLabel ramLbl = new JLabel("RAM: 0 MB");
        ramLbl.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        ramLbl.setForeground(ThemeColors.textSecondary());
        row.add(ramLbl);

        JLabel cpuLbl = new JLabel("CPU: 0%");
        cpuLbl.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        cpuLbl.setForeground(ThemeColors.textSecondary());
        row.add(cpuLbl);

        JLabel thLbl = new JLabel("TH: 0");
        thLbl.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        thLbl.setForeground(ThemeColors.textSecondary());
        row.add(thLbl);

        gbc.gridy = 1;
        gbc.insets = new Insets(0, 0, 0, 0);
        card.add(row, gbc);

        card.putClientProperty("ramLabel", ramLbl);
        card.putClientProperty("cpuLabel", cpuLbl);
        card.putClientProperty("threadLabel", thLbl);

        ThemeColors.addThemeListener(() -> {
            lblTitle.setForeground(ThemeColors.textMuted());
            ramLbl.setForeground(ThemeColors.textSecondary());
            cpuLbl.setForeground(ThemeColors.textSecondary());
            thLbl.setForeground(ThemeColors.textSecondary());
        });

        return card;
    }

    // 4. Statistics Cards (2x2 Grid with distinct colors matching Screenshot 4)
    private JPanel createStatisticsCards() {
        JPanel card = new JPanel(new GridLayout(2, 2, 10, 10));
        card.setOpaque(false);

        // 1. Scanned (Grey / Slate tint)
        card.add(UiFactory.createTintedStatTile("Scanned", scannedCountLabel,
                new Color(248, 250, 252), new Color(30, 41, 59),
                new Color(226, 232, 240), new Color(51, 65, 85),
                new Color(15, 23, 42), new Color(248, 250, 252)));

        // 2. Restored (Soft Emerald tint)
        card.add(UiFactory.createTintedStatTile("Restored", restoredCountLabel,
                new Color(236, 253, 245), new Color(6, 78, 59),
                new Color(167, 243, 208), new Color(5, 150, 105),
                new Color(5, 150, 105), new Color(52, 211, 153)));

        // 3. Unmatched (Soft Amber tint)
        card.add(UiFactory.createTintedStatTile("Unmatched", unmatchedCountLabel,
                new Color(254, 243, 199), new Color(69, 26, 3),
                new Color(253, 230, 138), new Color(180, 83, 9),
                new Color(180, 83, 9), new Color(251, 191, 36)));

        // 4. Errors (Soft Rose / Red tint)
        card.add(UiFactory.createTintedStatTile("Errors", errorsCountLabel,
                new Color(254, 242, 242), new Color(69, 10, 10),
                new Color(254, 202, 202), new Color(185, 28, 28),
                new Color(220, 38, 38), new Color(248, 113, 113)));

        return card;
    }

    // 5. Ad Banner 1 (SanDisk Extreme 2TB SSD)
    private JPanel createAdBanner1() {
        JPanel card = UiFactory.createCard();
        card.setLayout(new GridBagLayout());

        GridBagConstraints gbc = new GridBagConstraints();
        gbc.gridx = 0;
        gbc.gridy = 0;
        gbc.weightx = 1.0;
        gbc.fill = GridBagConstraints.HORIZONTAL;
        gbc.insets = new Insets(0, 0, 4, 0);

        JPanel headerRow = new JPanel(new BorderLayout());
        headerRow.setOpaque(false);
        JLabel tag = new JLabel("AMAZON'S CHOICE");
        tag.setFont(new Font("Segoe UI", Font.BOLD, 9));
        tag.setForeground(new Color(245, 158, 11));
        headerRow.add(tag, BorderLayout.WEST);

        JLabel discount = UiFactory.createBadge("45% OFF", ThemeColors.successLight(), ThemeColors.success());
        headerRow.add(discount, BorderLayout.EAST);
        card.add(headerRow, gbc);

        JLabel title = new JLabel("SanDisk 2TB Extreme Portable SSD");
        title.setFont(new Font("Segoe UI", Font.BOLD, 12));
        title.setForeground(ThemeColors.textPrimary());
        gbc.gridy = 1;
        gbc.insets = new Insets(0, 0, 3, 0);
        card.add(title, gbc);

        JLabel rating = new JLabel("Rating: 4.7 / 5.0 (38,210 reviews) - $139.99");
        rating.setFont(new Font("Segoe UI", Font.PLAIN, 10));
        rating.setForeground(new Color(245, 158, 11));
        gbc.gridy = 2;
        gbc.insets = new Insets(0, 0, 4, 0);
        card.add(rating, gbc);

        JLabel desc = new JLabel("<html><div style='width: 220px; font-size: 11px; color: #64748b; line-height: 1.3;'>Up to 1050MB/s NVMe USB-C, IP65 rugged durability. High-speed target drive for large Takeout dumps.</div></html>");
        gbc.gridy = 3;
        gbc.insets = new Insets(0, 0, 8, 0);
        card.add(desc, gbc);

        JButton btnDeal = UiFactory.createSecondaryButton("View on Amazon");
        btnDeal.setFont(new Font("Segoe UI", Font.BOLD, 11));
        btnDeal.addActionListener(e -> {
            try { Desktop.getDesktop().browse(new URI("https://amzn.to/4gY0932")); } catch (Exception ignored) {}
        });
        gbc.gridy = 4;
        gbc.insets = new Insets(0, 0, 0, 0);
        card.add(btnDeal, gbc);

        ThemeColors.addThemeListener(() -> {
            title.setForeground(ThemeColors.textPrimary());
        });
        return card;
    }

    // 6. Ad Banner 2 (Samsung T7 Shield 2TB Rugged SSD)
    private JPanel createAdBanner2() {
        JPanel card = UiFactory.createCard();
        card.setLayout(new GridBagLayout());

        GridBagConstraints gbc = new GridBagConstraints();
        gbc.gridx = 0;
        gbc.gridy = 0;
        gbc.weightx = 1.0;
        gbc.fill = GridBagConstraints.HORIZONTAL;
        gbc.insets = new Insets(0, 0, 4, 0);

        JPanel headerRow = new JPanel(new BorderLayout());
        headerRow.setOpaque(false);
        JLabel tag = new JLabel("SPONSORED HARDWARE");
        tag.setFont(new Font("Segoe UI", Font.BOLD, 9));
        tag.setForeground(ThemeColors.textMuted());
        headerRow.add(tag, BorderLayout.WEST);

        JLabel discount = UiFactory.createBadge("38% OFF", ThemeColors.accentLight(), ThemeColors.accent());
        headerRow.add(discount, BorderLayout.EAST);
        card.add(headerRow, gbc);

        JLabel title = new JLabel("Samsung T7 Shield 2TB Rugged SSD");
        title.setFont(new Font("Segoe UI", Font.BOLD, 12));
        title.setForeground(ThemeColors.textPrimary());
        gbc.gridy = 1;
        gbc.insets = new Insets(0, 0, 3, 0);
        card.add(title, gbc);

        JLabel rating = new JLabel("Rating: 4.8 / 5.0 (24,190 reviews) - $149.99");
        rating.setFont(new Font("Segoe UI", Font.PLAIN, 10));
        rating.setForeground(new Color(245, 158, 11));
        gbc.gridy = 2;
        gbc.insets = new Insets(0, 0, 4, 0);
        card.add(rating, gbc);

        JLabel desc = new JLabel("<html><div style='width: 220px; font-size: 11px; color: #64748b; line-height: 1.3;'>IP65 dust/water resistance, drop-proof up to 9.8ft. Hardware AES-256 encryption for safe long-term photo backups.</div></html>");
        gbc.gridy = 3;
        gbc.insets = new Insets(0, 0, 8, 0);
        card.add(desc, gbc);

        JButton btnDeal = UiFactory.createSecondaryButton("View on Amazon");
        btnDeal.setFont(new Font("Segoe UI", Font.BOLD, 11));
        btnDeal.addActionListener(e -> {
            try { Desktop.getDesktop().browse(new URI("https://amzn.to/4kX6b89")); } catch (Exception ignored) {}
        });
        gbc.gridy = 4;
        gbc.insets = new Insets(0, 0, 0, 0);
        card.add(btnDeal, gbc);

        ThemeColors.addThemeListener(() -> {
            title.setForeground(ThemeColors.textPrimary());
        });
        return card;
    }

    // 7. Ad Banner 3 (Crucial X9 Pro 2TB SSD)
    private JPanel createAdBanner3() {
        JPanel card = UiFactory.createCard();
        card.setLayout(new GridBagLayout());

        GridBagConstraints gbc = new GridBagConstraints();
        gbc.gridx = 0;
        gbc.gridy = 0;
        gbc.weightx = 1.0;
        gbc.fill = GridBagConstraints.HORIZONTAL;
        gbc.insets = new Insets(0, 0, 4, 0);

        JPanel headerRow = new JPanel(new BorderLayout());
        headerRow.setOpaque(false);
        JLabel tag = new JLabel("BEST VALUE DEAL");
        tag.setFont(new Font("Segoe UI", Font.BOLD, 9));
        tag.setForeground(ThemeColors.success());
        headerRow.add(tag, BorderLayout.WEST);

        JLabel discount = UiFactory.createBadge("42% OFF", ThemeColors.warningLight(), ThemeColors.warning());
        headerRow.add(discount, BorderLayout.EAST);
        card.add(headerRow, gbc);

        JLabel title = new JLabel("Crucial X9 Pro 2TB Portable SSD");
        title.setFont(new Font("Segoe UI", Font.BOLD, 12));
        title.setForeground(ThemeColors.textPrimary());
        gbc.gridy = 1;
        gbc.insets = new Insets(0, 0, 3, 0);
        card.add(title, gbc);

        JLabel rating = new JLabel("Rating: 4.7 / 5.0 (16,400 reviews) - $129.99");
        rating.setFont(new Font("Segoe UI", Font.PLAIN, 10));
        rating.setForeground(new Color(245, 158, 11));
        gbc.gridy = 2;
        gbc.insets = new Insets(0, 0, 4, 0);
        card.add(rating, gbc);

        JLabel desc = new JLabel("<html><div style='width: 220px; font-size: 11px; color: #64748b; line-height: 1.3;'>Micron TLC NAND, 1050MB/s sustained speeds. Ultra-compact anodized aluminum backup drive.</div></html>");
        gbc.gridy = 3;
        gbc.insets = new Insets(0, 0, 8, 0);
        card.add(desc, gbc);

        JButton btnDeal = UiFactory.createSecondaryButton("View on Amazon");
        btnDeal.setFont(new Font("Segoe UI", Font.BOLD, 11));
        btnDeal.addActionListener(e -> {
            try { Desktop.getDesktop().browse(new URI("https://amzn.to/3PskxX8")); } catch (Exception ignored) {}
        });
        gbc.gridy = 4;
        gbc.insets = new Insets(0, 0, 0, 0);
        card.add(btnDeal, gbc);

        ThemeColors.addThemeListener(() -> {
            title.setForeground(ThemeColors.textPrimary());
        });
        return card;
    }

    public static String formatBytes(long bytes) {
        if (bytes <= 0) return "0.0 MB";
        if (bytes < 1024 * 1024) return String.format("%.1f KB", bytes / 1024.0);
        if (bytes < 1024 * 1024 * 1024L) return String.format("%.1f MB", bytes / (1024.0 * 1024.0));
        if (bytes < 1024L * 1024 * 1024 * 1024L) return String.format("%.2f GB", bytes / (1024.0 * 1024 * 1024.0));
        return String.format("%.2f TB", bytes / (1024.0 * 1024 * 1024 * 1024.0));
    }

    public void updateUserData() {
        updateUserData(userService.getCurrentProfile());
    }

    private long activeJobBytes = 0;
    private int activeJobFiles = 0;
    private int activeJobTotal = 0;
    private boolean isJobActive = false;

    public void updateUserData(Map<String, Object> user) {
        SwingUtilities.invokeLater(() -> {
            boolean signedIn = userService.isSignedIn();
            String plan = userService.getCurrentPlan();
            long usedFiles = userService.getUsedFiles();
            long usedBytes = userService.getUsedBytes();

            long maxBytes = userService.getMaxBytes() > 0 ? userService.getMaxBytes() : (500L * 1024 * 1024);
            long maxFiles = userService.getMaxFiles() > 0 ? userService.getMaxFiles() : 250;
            String limitSuffix = (userService.isProOrSuper() || userService.isFreeUnlimited()) ? "Unlimited" : formatBytes(maxBytes);
            String filesSuffix = (userService.isProOrSuper() || userService.isFreeUnlimited()) ? "Unlimited" : String.valueOf(maxFiles);

            if (!signedIn) {
                storageProgressText.setText("Sign In to Activate");
                storageProgressText.setForeground(ThemeColors.textMuted());
                storageProgressBar.setValue(0);
                storageProgressBar.setForeground(ThemeColors.accent());

                filesProgressText.setText("Sign In to Activate");
                filesProgressText.setForeground(ThemeColors.textMuted());
                filesProgressBar.setValue(0);
                filesProgressBar.setForeground(ThemeColors.accent());

                if (btnUpgradeQuota != null) {
                    btnUpgradeQuota.setVisible(true);
                    btnUpgradeQuota.setText("Sign In with Google");
                    btnUpgradeQuota.setBackground(ThemeColors.accent());
                }
                revalidate();
                repaint();
                return;
            }

            // If a restoration job is active or completed, show job metrics; otherwise on start show 0 0!
            if (isJobActive || activeJobFiles > 0 || activeJobBytes > 0) {
                String formattedBytes = formatBytes(activeJobBytes);
                storageProgressText.setText(formattedBytes + " / " + limitSuffix);
                filesProgressText.setText(activeJobFiles + " / " + (activeJobTotal > 0 ? activeJobTotal : filesSuffix));
                int pct = activeJobTotal > 0 ? (int) Math.min(100, Math.round((activeJobFiles * 100.0) / activeJobTotal)) : (isJobActive ? 0 : 100);
                storageProgressBar.setValue(pct);
                storageProgressBar.setForeground(ThemeColors.success());
                filesProgressBar.setValue(pct);
                filesProgressBar.setForeground(ThemeColors.success());
            } else {
                // Initial clean state on start: 0.0 MB and 0 files
                storageProgressText.setText("0.0 MB / " + limitSuffix);
                storageProgressText.setForeground(ThemeColors.textPrimary());
                storageProgressBar.setValue(0);
                storageProgressBar.setForeground(ThemeColors.accent());

                filesProgressText.setText("0 / " + filesSuffix);
                filesProgressText.setForeground(ThemeColors.textPrimary());
                filesProgressBar.setValue(0);
                filesProgressBar.setForeground(ThemeColors.accent());
            }

            // Upgrade button logic
            if (btnUpgradeQuota != null) {
                if (userService.isProOrSuper() || userService.isFreeUnlimited()) {
                    btnUpgradeQuota.setVisible(false);
                } else {
                    btnUpgradeQuota.setVisible(true);
                    boolean exceedsBytes = usedBytes > maxBytes;
                    boolean exceedsFiles = usedFiles > maxFiles;
                    if (exceedsBytes || exceedsFiles) {
                        btnUpgradeQuota.setText("⚡ Limit Exceeded - Upgrade");
                        btnUpgradeQuota.setBackground(ThemeColors.danger());
                    } else {
                        btnUpgradeQuota.setText("⚡ Upgrade to Unlimited");
                        btnUpgradeQuota.setBackground(ThemeColors.accent());
                    }
                }
            }
            revalidate();
            repaint();
        });
    }

    public void setState(String text, Color bg, Color fg) {
        if ("COMPLETE".equalsIgnoreCase(text.trim()) || "IDLE".equalsIgnoreCase(text.trim())) {
            this.isJobActive = false;
        }
        SwingUtilities.invokeLater(() -> {
            stateBadge.setText(" " + text + " ");
            stateBadge.setBackground(bg);
            stateBadge.setForeground(fg);
        });
    }

    public void updateJobCounters(int scanned, int total, int restored, int unmatched, int errors) {
        SwingUtilities.invokeLater(() -> {
            scannedCountLabel.setText(scanned + " / " + (total > 0 ? total : "-"));
            restoredCountLabel.setText(restored + " / " + (total > 0 ? total : "-"));
            unmatchedCountLabel.setText(String.valueOf(unmatched));
            errorsCountLabel.setText(String.valueOf(errors));
        });
    }

    public void updateLiveRestorationUsage(int restored, int total, long jobBytes) {
        this.isJobActive = true;
        this.activeJobFiles = restored;
        this.activeJobBytes = jobBytes;
        this.activeJobTotal = total;

        SwingUtilities.invokeLater(() -> {
            long maxBytes = userService.getMaxBytes() > 0 ? userService.getMaxBytes() : (500L * 1024 * 1024);
            long maxFiles = userService.getMaxFiles() > 0 ? userService.getMaxFiles() : 250;
            String limitSuffix = (userService.isProOrSuper() || userService.isFreeUnlimited()) ? "Unlimited" : formatBytes(maxBytes);
            String filesSuffix = total > 0 ? String.valueOf(total) : ((userService.isProOrSuper() || userService.isFreeUnlimited()) ? "Unlimited" : String.valueOf(maxFiles));

            String formattedBytes = formatBytes(jobBytes);
            storageProgressText.setText(formattedBytes + " / " + limitSuffix);
            int pct = total > 0 ? (int) Math.min(100, Math.round((restored * 100.0) / total)) : 0;
            storageProgressBar.setValue(pct);
            storageProgressBar.setForeground(ThemeColors.success());

            filesProgressText.setText(restored + " / " + filesSuffix);
            filesProgressBar.setValue(pct);
            filesProgressBar.setForeground(ThemeColors.success());
        });
    }

    public void resetJobCounters(int total) {
        this.isJobActive = false;
        this.activeJobFiles = 0;
        this.activeJobBytes = 0;
        this.activeJobTotal = total;

        updateJobCounters(0, total, 0, 0, 0);

        SwingUtilities.invokeLater(() -> {
            long maxBytes = userService.getMaxBytes() > 0 ? userService.getMaxBytes() : (500L * 1024 * 1024);
            long maxFiles = userService.getMaxFiles() > 0 ? userService.getMaxFiles() : 250;
            String limitSuffix = (userService.isProOrSuper() || userService.isFreeUnlimited()) ? "Unlimited" : formatBytes(maxBytes);
            String filesSuffix = total > 0 ? String.valueOf(total) : ((userService.isProOrSuper() || userService.isFreeUnlimited()) ? "Unlimited" : String.valueOf(maxFiles));

            storageProgressText.setText("0.0 MB / " + limitSuffix);
            storageProgressText.setForeground(ThemeColors.textPrimary());
            storageProgressBar.setValue(0);
            storageProgressBar.setForeground(ThemeColors.accent());

            filesProgressText.setText("0 / " + filesSuffix);
            filesProgressText.setForeground(ThemeColors.textPrimary());
            filesProgressBar.setValue(0);
            filesProgressBar.setForeground(ThemeColors.accent());
        });
    }

    private void startHardwareMonitor() {
        Timer timer = new Timer(1500, e -> {
            try {
                double usedRamGB = SystemHardwareInfo.getUsedMemoryGB();
                double totalRamGB = SystemHardwareInfo.getTotalMemoryGB();
                int physicalCores = SystemHardwareInfo.getPhysicalCores();
                int logicalThreads = SystemHardwareInfo.getLogicalProcessors();
                String cpuName = SystemHardwareInfo.getCpuName();

                double cpuLoad = SystemHardwareInfo.getCpuLoadPercent();
                ramLabel.setText(String.format("RAM: %.1f/%.0f GB", usedRamGB, totalRamGB));
                ramLabel.setToolTipText(String.format("Physical System RAM: %.1f GB / %.1f GB used", usedRamGB, totalRamGB));

                cpuLabel.setText(String.format("CPU: %.1f%%", cpuLoad));
                cpuLabel.setToolTipText(cpuName.isEmpty() ? String.format("CPU Load: %.1f%% (%d Cores)", cpuLoad, physicalCores) : String.format("%s (%.1f%% Load, %d Cores)", cpuName, cpuLoad, physicalCores));

                threadLabel.setText(String.format("Threads: %d", logicalThreads));
                threadLabel.setToolTipText(String.format("Logical Processors / Threads: %d (Task Manager)", logicalThreads));
            } catch (Exception ignored) {}
        });
        timer.start();
    }

    private static class ScrollablePanel extends JPanel implements Scrollable {
        public ScrollablePanel(LayoutManager layout) {
            super(layout);
        }

        @Override
        public Dimension getPreferredScrollableViewportSize() {
            return getPreferredSize();
        }

        @Override
        public int getScrollableUnitIncrement(Rectangle visibleRect, int orientation, int direction) {
            return 16;
        }

        @Override
        public int getScrollableBlockIncrement(Rectangle visibleRect, int orientation, int direction) {
            return 64;
        }

        @Override
        public boolean getScrollableTracksViewportWidth() {
            return true;
        }

        @Override
        public boolean getScrollableTracksViewportHeight() {
            return false;
        }
    }
}
