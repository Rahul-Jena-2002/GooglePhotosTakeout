package com.takeoutfix.restore;
import com.takeoutfix.shared.ui.UiFactory;

import com.takeoutfix.network.SystemHardwareInfo;
import com.takeoutfix.auth.UserSyncBridgeService;
import com.takeoutfix.shared.theme.ThemeColors;

import javax.swing.*;
import javax.swing.border.EmptyBorder;
import java.awt.*;
import java.awt.event.MouseAdapter;
import java.awt.event.MouseEvent;
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

    private final JLabel ramLabel;
    private final JLabel cpuLabel;
    private final JLabel threadLabel;

    private final JLabel scannedCountLabel = new JLabel("0");
    private final JLabel restoredCountLabel = new JLabel("0");
    private final JLabel unmatchedCountLabel = new JLabel("0");
    private final JLabel errorsCountLabel = new JLabel("0");

    private final UserSyncBridgeService userService;
    private final SessionStatsService statsService;
    private final com.takeoutfix.ads.AdSyncService adSyncService;
    private final JPanel adsContainer;
    private final JPanel adsCard;

    public SessionStatsService getStatsService() {
        return statsService;
    }

    public CommandCenterPanel(UserSyncBridgeService userService, SessionStatsService statsService) {
        this(userService, statsService, null);
    }

    public CommandCenterPanel(UserSyncBridgeService userService, SessionStatsService statsService, com.takeoutfix.ads.AdSyncService adSyncService) {
        this.userService = userService;
        this.statsService = statsService;
        this.adSyncService = adSyncService;

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

        // ── PINNED TOP PANEL: Session Header (NEVER hides on window resize) ──
        JPanel pinnedTop = new JPanel(new GridBagLayout());
        pinnedTop.setOpaque(false);

        // 1. Command Center Header
        JPanel headerPanel = createCommandCenterHeader();
        stateBadge = (JLabel) headerPanel.getClientProperty("stateBadge");
        pinnedTop.add(headerPanel, createRowConstraints(0));

        add(pinnedTop, BorderLayout.NORTH);

        // ── SCROLLABLE BODY PANEL: Unified KPI Card & Separate Ads Card ───────
        JPanel scrollBody = new ScrollablePanel(new GridBagLayout());
        scrollBody.setOpaque(false);
        int gridY = 0;

        // 2. Unified KPI Card (Quota + Device Telemetry + 4 Status Cards)
        JPanel kpiCard = createUnifiedKpiCard();
        storageProgressText = (JLabel) kpiCard.getClientProperty("storageText");
        storageProgressBar = (JProgressBar) kpiCard.getClientProperty("storageBar");
        filesProgressText = (JLabel) kpiCard.getClientProperty("filesText");
        filesProgressBar = (JProgressBar) kpiCard.getClientProperty("filesBar");
        ramLabel = (JLabel) kpiCard.getClientProperty("ramLabel");
        cpuLabel = (JLabel) kpiCard.getClientProperty("cpuLabel");
        threadLabel = (JLabel) kpiCard.getClientProperty("threadLabel");
        scrollBody.add(kpiCard, createRowConstraints(gridY++));

        // 3. Dynamic Backend-Synced Hardware Deals & Ads in SEPARATE BOX (Card)
        adsContainer = new JPanel();
        adsContainer.setOpaque(false);
        adsCard = createAdsCard();
        scrollBody.add(adsCard, createRowConstraints(gridY++));

        // 4. System & Drive Status Quick Utilities Card (Fills empty sidebar space)
        JPanel systemHealthCard = createSystemHealthCard();
        scrollBody.add(systemHealthCard, createRowConstraints(gridY++));

        // 5. Vertical Spacer to push items to top of scroll
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

        // Dynamic backend-synchronized ads
        if (adSyncService != null) {
            adSyncService.addListener(this::updateAds);
        } else {
            updateAds(java.util.Collections.emptyList());
        }
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

        JLabel title = new JLabel("SESSION");
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

    // 2. Unified KPI Card (Quota + Device Telemetry + 4 Status Cards)
    private JPanel createUnifiedKpiCard() {
        JPanel card = UiFactory.createCard();
        card.setLayout(new GridBagLayout());

        GridBagConstraints gbc = new GridBagConstraints();
        gbc.gridx = 0;
        gbc.gridy = 0;
        gbc.weightx = 1.0;
        gbc.fill = GridBagConstraints.HORIZONTAL;
        gbc.insets = new Insets(0, 0, 4, 0);

        // 1. Quota Progress (Total Storage & Files)
        JLabel lblStorage = new JLabel("TOTAL STORAGE RESTORED");
        lblStorage.setFont(new Font("Segoe UI", Font.BOLD, 10));
        lblStorage.setForeground(ThemeColors.textMuted());
        card.add(lblStorage, gbc);

        JLabel storageTxt = new JLabel("0.0 MB Restored");
        storageTxt.setFont(new Font("Segoe UI", Font.BOLD, 13));
        storageTxt.setForeground(ThemeColors.textPrimary());
        gbc.gridy = 1;
        gbc.insets = new Insets(0, 0, 6, 0);
        card.add(storageTxt, gbc);

        JProgressBar storagePb = UiFactory.createSlimProgressBar();
        gbc.gridy = 2;
        gbc.insets = new Insets(0, 0, 10, 0);
        card.add(storagePb, gbc);

        JLabel lblFiles = new JLabel("TOTAL FILES PROCESSED");
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
        gbc.insets = new Insets(0, 0, 12, 0);
        card.add(filesPb, gbc);

        // 2. Device Performance Telemetry
        JLabel lblTitle = new JLabel("DEVICE PERFORMANCE");
        lblTitle.setFont(new Font("Segoe UI", Font.BOLD, 10));
        lblTitle.setForeground(ThemeColors.textMuted());
        gbc.gridy = 6;
        gbc.insets = new Insets(0, 0, 6, 0);
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

        JLabel thLbl = new JLabel("Cores: 0");
        thLbl.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        thLbl.setForeground(ThemeColors.textSecondary());
        row.add(thLbl);

        gbc.gridy = 7;
        gbc.insets = new Insets(0, 0, 12, 0);
        card.add(row, gbc);

        // 3. 4 Status Cards (2x2 Grid)
        JLabel lblStats = new JLabel("SESSION STATUS");
        lblStats.setFont(new Font("Segoe UI", Font.BOLD, 10));
        lblStats.setForeground(ThemeColors.textMuted());
        gbc.gridy = 8;
        gbc.insets = new Insets(0, 0, 6, 0);
        card.add(lblStats, gbc);

        JPanel statsGrid = new JPanel(new GridLayout(2, 2, 8, 8));
        statsGrid.setOpaque(false);

        statsGrid.add(UiFactory.createTintedStatTile("Scanned", scannedCountLabel,
                new Color(248, 250, 252), new Color(30, 41, 59),
                new Color(226, 232, 240), new Color(51, 65, 85),
                new Color(15, 23, 42), new Color(248, 250, 252)));

        statsGrid.add(UiFactory.createTintedStatTile("Restored", restoredCountLabel,
                new Color(236, 253, 245), new Color(6, 78, 59),
                new Color(167, 243, 208), new Color(5, 150, 105),
                new Color(5, 150, 105), new Color(52, 211, 153)));

        statsGrid.add(UiFactory.createTintedStatTile("Skipped / Adj", unmatchedCountLabel,
                new Color(245, 243, 255), new Color(46, 16, 101),
                new Color(221, 214, 254), new Color(109, 40, 217),
                new Color(109, 40, 217), new Color(196, 181, 253)));

        statsGrid.add(UiFactory.createTintedStatTile("Errors", errorsCountLabel,
                new Color(254, 242, 242), new Color(127, 29, 29),
                new Color(254, 202, 202), new Color(185, 28, 28),
                new Color(239, 68, 68), new Color(252, 165, 165)));

        gbc.gridy = 9;
        gbc.insets = new Insets(0, 0, 0, 0);
        card.add(statsGrid, gbc);

        card.putClientProperty("storageText", storageTxt);
        card.putClientProperty("storageBar", storagePb);
        card.putClientProperty("filesText", filesTxt);
        card.putClientProperty("filesBar", filesPb);
        card.putClientProperty("ramLabel", ramLbl);
        card.putClientProperty("cpuLabel", cpuLbl);
        card.putClientProperty("threadLabel", thLbl);

        ThemeColors.addThemeListener(() -> {
            lblStorage.setForeground(ThemeColors.textMuted());
            storageTxt.setForeground(ThemeColors.textPrimary());
            lblFiles.setForeground(ThemeColors.textMuted());
            filesTxt.setForeground(ThemeColors.textPrimary());
            lblTitle.setForeground(ThemeColors.textMuted());
            ramLbl.setForeground(ThemeColors.textSecondary());
            cpuLbl.setForeground(ThemeColors.textSecondary());
            thLbl.setForeground(ThemeColors.textSecondary());
            lblStats.setForeground(ThemeColors.textMuted());
        });

        return card;
    }

    // 3. Dynamic Backend-Synced Hardware Deals & Ads in SEPARATE BOX (Card)
    private JPanel createAdsCard() {
        JPanel card = UiFactory.createCard();
        card.setLayout(new BorderLayout(0, 8));

        JLabel lblAdsTitle = new JLabel("ADS & AFFILIATE LINKS");
        lblAdsTitle.setFont(new Font("Segoe UI", Font.BOLD, 10));
        lblAdsTitle.setForeground(ThemeColors.textMuted());
        card.add(lblAdsTitle, BorderLayout.NORTH);

        card.add(adsContainer, BorderLayout.CENTER);

        ThemeColors.addThemeListener(() -> lblAdsTitle.setForeground(ThemeColors.textMuted()));
        return card;
    }

    public void updateAds(java.util.List<com.takeoutfix.ads.AdSyncService.AdItem> ads) {
        SwingUtilities.invokeLater(() -> {
            adsContainer.removeAll();
            java.util.List<com.takeoutfix.ads.AdSyncService.AdItem> list = (ads != null && !ads.isEmpty()) ? ads :
                    (adSyncService != null ? adSyncService.getActiveAds() : java.util.Collections.emptyList());

            if (list.isEmpty()) {
                adsCard.setVisible(false);
                adsContainer.removeAll();
                adsContainer.revalidate();
                adsContainer.repaint();
                return;
            }
            adsCard.setVisible(true);
            final int targetCount = 8;
            adsContainer.setLayout(new GridLayout(targetCount, 1, 0, 5));
            for (int i = 0; i < targetCount; i++) {
                com.takeoutfix.ads.AdSyncService.AdItem ad = list.get(i % list.size());
                adsContainer.add(createCompactAdTile(ad));
            }
            adsContainer.revalidate();
            adsContainer.repaint();
        });
    }

    private JPanel createCompactAdTile(com.takeoutfix.ads.AdSyncService.AdItem ad) {
        JLabel arrow = new JLabel("↗");
        JPanel tile = new JPanel(new BorderLayout(8, 0)) {
            private boolean hovered = false;
            {
                addMouseListener(new MouseAdapter() {
                    @Override public void mouseEntered(MouseEvent e) {
                        hovered = true;
                        arrow.setForeground(ThemeColors.accent());
                        repaint();
                    }
                    @Override public void mouseExited(MouseEvent e) {
                        hovered = false;
                        arrow.setForeground(ThemeColors.textMuted());
                        repaint();
                    }
                    @Override public void mouseClicked(MouseEvent e) {
                        com.takeoutfix.shared.util.BrowserUtil.openBrowser(ad.destinationUrl());
                    }
                });
            }

            @Override
            protected void paintComponent(Graphics g) {
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                boolean dark = ThemeColors.isDark();
                Color bg;
                Color border;
                if (dark) {
                    bg = hovered ? new Color(30, 40, 58, 220) : new Color(20, 26, 38, 160);
                    border = hovered ? new Color(99, 102, 241, 180) : new Color(38, 48, 68, 140);
                } else {
                    bg = hovered ? new Color(238, 242, 255, 230) : new Color(241, 245, 249, 170);
                    border = hovered ? new Color(99, 102, 241, 150) : new Color(226, 232, 240, 160);
                }
                g2.setColor(bg);
                g2.fillRoundRect(0, 0, getWidth(), getHeight(), 10, 10);
                g2.setColor(border);
                g2.setStroke(new BasicStroke(1f));
                g2.drawRoundRect(0, 0, getWidth() - 1, getHeight() - 1, 10, 10);
                g2.dispose();
                super.paintComponent(g);
            }
        };
        tile.setOpaque(false);
        tile.setBorder(new EmptyBorder(4, 8, 4, 8));
        tile.setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
        tile.setPreferredSize(new Dimension(0, 42));
        tile.setToolTipText("Open: " + ad.title());

        // 1. Compact 32x32 Thumbnail (Pre-added to prevent layout shift)
        if (ad.imageUrl() != null && !ad.imageUrl().isBlank()) {
            JLabel imgLabel = new JLabel();
            imgLabel.setPreferredSize(new Dimension(32, 32));
            imgLabel.setOpaque(false);
            imgLabel.setHorizontalAlignment(SwingConstants.CENTER);
            imgLabel.setVerticalAlignment(SwingConstants.CENTER);
            tile.add(imgLabel, BorderLayout.WEST);
            com.takeoutfix.ads.AdSyncService.loadThumbnailAsync(ad.imageUrl(), 32, 32, icon -> {
                if (icon != null) {
                    imgLabel.setIcon(icon);
                    tile.repaint();
                }
            });
        }

        // 2. Compact Center Details (Tag/Discount + Title)
        JPanel details = new JPanel(new GridLayout(2, 1, 0, 1));
        details.setOpaque(false);

        JPanel topRow = new JPanel(new BorderLayout(4, 0));
        topRow.setOpaque(false);

        String tagText = ad.tag().isBlank() ? "SPONSORED" : ad.tag().trim();
        if (tagText.length() > 18) tagText = tagText.substring(0, 16) + "..";
        JLabel tag = new JLabel(tagText);
        tag.setFont(new Font("Segoe UI", Font.BOLD, 9));
        tag.setForeground(ThemeColors.textMuted());
        topRow.add(tag, BorderLayout.WEST);

        if (!ad.discount().isBlank()) {
            JLabel disc = new JLabel(ad.discount());
            disc.setFont(new Font("Segoe UI", Font.BOLD, 9));
            disc.setForeground(ThemeColors.success());
            topRow.add(disc, BorderLayout.EAST);
        }
        details.add(topRow);

        String cleanTitle = ad.title() != null ? ad.title().trim() : "";
        if (cleanTitle.length() > 28) {
            cleanTitle = cleanTitle.substring(0, 26).trim() + "...";
        }
        JLabel title = new JLabel(cleanTitle);
        title.setFont(new Font("Segoe UI", Font.BOLD, 10));
        title.setForeground(ThemeColors.textPrimary());
        details.add(title);

        tile.add(details, BorderLayout.CENTER);

        // 3. Compact subtle arrow link
        arrow.setFont(new Font("Segoe UI", Font.BOLD, 10));
        arrow.setForeground(ThemeColors.textMuted());
        arrow.setBorder(new EmptyBorder(0, 2, 0, 0));
        tile.add(arrow, BorderLayout.EAST);

        ThemeColors.addThemeListener(() -> {
            tag.setForeground(ThemeColors.textMuted());
            title.setForeground(ThemeColors.textPrimary());
            arrow.setForeground(ThemeColors.textMuted());
            tile.repaint();
        });

        return tile;
    }

    private JPanel createSystemHealthCard() {
        JPanel card = UiFactory.createCard();
        card.setLayout(new GridBagLayout());

        GridBagConstraints gbc = new GridBagConstraints();
        gbc.gridx = 0;
        gbc.gridy = 0;
        gbc.weightx = 1.0;
        gbc.fill = GridBagConstraints.HORIZONTAL;
        gbc.insets = new Insets(0, 0, 6, 0);

        JLabel lblTitle = new JLabel("DRIVE & ENGINE HEALTH");
        lblTitle.setFont(new Font("Segoe UI", Font.BOLD, 10));
        lblTitle.setForeground(ThemeColors.textMuted());
        card.add(lblTitle, gbc);

        // Drive Space detection
        java.io.File currentDrive = new java.io.File(".");
        long usable = currentDrive.getUsableSpace();
        long total = currentDrive.getTotalSpace();
        int usedPercent = total > 0 ? (int) Math.round(((total - usable) * 100.0) / total) : 0;

        JLabel driveText = new JLabel("Target Disk: " + formatBytes(usable) + " Free of " + formatBytes(total));
        driveText.setFont(new Font("Segoe UI", Font.BOLD, 11));
        driveText.setForeground(ThemeColors.textPrimary());
        gbc.gridy = 1;
        gbc.insets = new Insets(0, 0, 4, 0);
        card.add(driveText, gbc);

        JProgressBar driveBar = UiFactory.createSlimProgressBar();
        driveBar.setValue(usedPercent);
        gbc.gridy = 2;
        gbc.insets = new Insets(0, 0, 10, 0);
        card.add(driveBar, gbc);

        // Multi-threaded Engine Status
        int cores = Runtime.getRuntime().availableProcessors();
        JLabel engineText = new JLabel("Engine: " + cores + "-Core High-Speed Parallel Workers");
        engineText.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        engineText.setForeground(ThemeColors.textSecondary());
        gbc.gridy = 3;
        gbc.insets = new Insets(0, 0, 8, 0);
        card.add(engineText, gbc);

        // Quick Links Panel
        JPanel linksPanel = new JPanel(new GridLayout(2, 1, 0, 6));
        linksPanel.setOpaque(false);

        JButton btnGuide = UiFactory.createSecondaryButton("Takeout Extraction Guide");
        btnGuide.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        btnGuide.addActionListener(e -> com.takeoutfix.shared.util.BrowserUtil.openBrowser("https://takeoutfix.pages.dev/guide"));

        JButton btnWebPlatform = UiFactory.createSecondaryButton("TakeoutFix Web Platform");
        javax.swing.Icon globeIcon = UiFactory.svgDynamicIcon("globe", 13, () -> ThemeColors.secondaryButtonText());
        if (globeIcon != null) {
            btnWebPlatform.setIcon(globeIcon);
            btnWebPlatform.setIconTextGap(6);
        }
        btnWebPlatform.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        btnWebPlatform.addActionListener(e -> com.takeoutfix.shared.util.BrowserUtil.openBrowser("https://takeoutfix.pages.dev/"));

        linksPanel.add(btnGuide);
        linksPanel.add(btnWebPlatform);

        gbc.gridy = 4;
        gbc.insets = new Insets(0, 0, 0, 0);
        card.add(linksPanel, gbc);

        ThemeColors.addThemeListener(() -> {
            lblTitle.setForeground(ThemeColors.textMuted());
            driveText.setForeground(ThemeColors.textPrimary());
            engineText.setForeground(ThemeColors.textSecondary());
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

            if (!signedIn) {
                storageProgressText.setText("Sign In to Activate");
                storageProgressText.setForeground(ThemeColors.textMuted());
                storageProgressBar.setValue(0);
                storageProgressBar.setVisible(false);

                filesProgressText.setText("Sign In to Activate");
                filesProgressText.setForeground(ThemeColors.textMuted());
                filesProgressBar.setValue(0);
                filesProgressBar.setVisible(false);

                revalidate();
                repaint();
                return;
            }

            // Session telemetry: only show live job metrics when a job is active or has run this session
            if (isJobActive || activeJobFiles > 0 || activeJobBytes > 0) {
                String formattedBytes = formatBytes(activeJobBytes);
                storageProgressText.setText(formattedBytes + " Restored");
                storageProgressText.setForeground(ThemeColors.textPrimary());
                filesProgressText.setText(activeJobFiles + (activeJobTotal > 0 ? " / " + activeJobTotal : " Files Processed"));
                filesProgressText.setForeground(ThemeColors.textPrimary());
                int pct = activeJobTotal > 0 ? (int) Math.min(100, Math.round((activeJobFiles * 100.0) / activeJobTotal)) : (isJobActive ? 0 : 100);
                storageProgressBar.setVisible(true);
                storageProgressBar.setValue(pct);
                storageProgressBar.setForeground(ThemeColors.success());
                filesProgressBar.setVisible(true);
                filesProgressBar.setValue(pct);
                filesProgressBar.setForeground(ThemeColors.success());
            } else {
                // By default at startup or idle: clean zero state for this session
                storageProgressText.setText("0.0 MB Restored");
                storageProgressText.setForeground(ThemeColors.textPrimary());
                storageProgressBar.setVisible(false);

                filesProgressText.setText("0 Files Processed");
                filesProgressText.setForeground(ThemeColors.textPrimary());
                filesProgressBar.setVisible(false);
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
            NumberFormat nf = NumberFormat.getIntegerInstance(Locale.US);
            scannedCountLabel.setText(nf.format(scanned) + (total > 0 ? " / " + nf.format(total) : ""));
            restoredCountLabel.setText(nf.format(restored) + (total > 0 ? " / " + nf.format(total) : ""));
            unmatchedCountLabel.setText(nf.format(unmatched));
            errorsCountLabel.setText(nf.format(errors));
            if (errors > 0) {
                errorsCountLabel.setForeground(new Color(239, 68, 68));
            } else {
                errorsCountLabel.setForeground(ThemeColors.textPrimary());
            }
        });
    }

    public void updateLiveRestorationUsage(int restored, int total, long jobBytes) {
        this.isJobActive = true;
        this.activeJobFiles = restored;
        this.activeJobBytes = jobBytes;
        this.activeJobTotal = total;

        SwingUtilities.invokeLater(() -> {
            String formattedBytes = formatBytes(jobBytes);
            storageProgressText.setText(formattedBytes + " Restored");
            int pct = total > 0 ? (int) Math.min(100, Math.round((restored * 100.0) / total)) : 0;
            storageProgressBar.setVisible(true);
            storageProgressBar.setValue(pct);
            storageProgressBar.setForeground(ThemeColors.success());

            filesProgressText.setText(restored + (total > 0 ? " / " + total : " Files"));
            filesProgressBar.setVisible(true);
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
            storageProgressText.setText("0.0 MB Restored");
            storageProgressText.setForeground(ThemeColors.textPrimary());
            storageProgressBar.setValue(0);
            storageProgressBar.setVisible(false);

            filesProgressText.setText(total > 0 ? "0 / " + total : "0 Files Processed");
            filesProgressText.setForeground(ThemeColors.textPrimary());
            filesProgressBar.setValue(0);
            filesProgressBar.setVisible(false);
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
                ramLabel.setText(String.format("%.1fG / %.0fG", usedRamGB, totalRamGB));
                ramLabel.setToolTipText(String.format("Physical System RAM: %.1f GB / %.1f GB used", usedRamGB, totalRamGB));

                cpuLabel.setText(String.format("CPU: %.1f%%", cpuLoad));
                cpuLabel.setToolTipText(cpuName.isEmpty() ? String.format("CPU Load: %.1f%% (%d Cores)", cpuLoad, physicalCores) : String.format("%s (%.1f%% Load, %d Cores)", cpuName, cpuLoad, physicalCores));

                threadLabel.setText(String.format("Cores: %d", logicalThreads));
                threadLabel.setToolTipText(String.format("Available CPU Cores: %d", logicalThreads));
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
