package com.takeoutfix.gui.components;

import com.takeoutfix.gui.service.NetworkMonitorService;
import com.takeoutfix.gui.service.SystemHardwareInfo;
import com.takeoutfix.gui.service.UserSyncBridgeService;
import com.takeoutfix.gui.theme.ThemeColors;
import com.takeoutfix.service.FirebaseSyncService;

import javax.swing.*;
import javax.swing.border.EmptyBorder;
import java.awt.*;
import java.io.File;
import java.net.URI;
import java.text.NumberFormat;
import java.util.Locale;
import java.util.Map;
import java.util.function.Consumer;

/**
 * Modern Operations Dashboard for TakeoutFix Native Desktop.
 * Provides real-time account status, cloud synchronization, hardware telemetry,
 * restoration quota meters, and one-click quick launchers to all tools.
 */
public class DashboardPanel extends JPanel {

    private final UserSyncBridgeService userService;
    private final NetworkMonitorService netService;
    private final Consumer<String> onNavigate;

    // Account & Sync UI components
    private final JLabel avatarLabel;
    private final JLabel userNameLabel;
    private final JLabel userEmailLabel;
    private final JLabel planBadge;
    private final JLabel syncStatusBadge;
    private final JButton btnSyncNow;
    private final JButton btnAccountAction;

    // Quota & Stats UI components
    private final JLabel filesQuotaText;
    private final JProgressBar filesQuotaBar;
    private final JLabel storageQuotaText;
    private final JProgressBar storageQuotaBar;
    private final JLabel statFilesProcessed;
    private final JLabel statMetadataRestored;
    private final JLabel statSidecarsMatched;
    private final JLabel statEngineReliability;

    // Hardware Telemetry UI components
    private final JLabel cpuNameLabel;
    private final JLabel cpuLoadText;
    private final JProgressBar cpuLoadBar;
    private final JLabel ramText;
    private final JProgressBar ramBar;
    private final JLabel threadsLabel;

    // System Health UI components
    private final JLabel networkStatusLabel;
    private final JLabel diskSpaceLabel;

    private Timer telemetryTimer;

    public DashboardPanel(UserSyncBridgeService userService, NetworkMonitorService netService, Consumer<String> onNavigate) {
        this.userService = userService;
        this.netService = netService;
        this.onNavigate = onNavigate;

        setLayout(new BorderLayout());
        setOpaque(false);
        setBorder(new EmptyBorder(10, 10, 10, 10));

        // ── Component instantiation ──
        avatarLabel = new JLabel("TF", SwingConstants.CENTER) {
            @Override
            protected void paintComponent(Graphics g) {
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                g2.setColor(getBackground());
                int size = Math.min(getWidth(), getHeight());
                int x = (getWidth() - size) / 2;
                int y = (getHeight() - size) / 2;
                g2.fillOval(x, y, size, size);
                g2.dispose();
                super.paintComponent(g);
            }
        };
        avatarLabel.setOpaque(false);
        avatarLabel.setPreferredSize(new Dimension(42, 42));
        avatarLabel.setMinimumSize(new Dimension(42, 42));
        avatarLabel.setMaximumSize(new Dimension(42, 42));
        avatarLabel.setFont(new Font("Segoe UI", Font.BOLD, 15));
        avatarLabel.setForeground(Color.WHITE);
        avatarLabel.setBackground(new Color(99, 102, 241));

        userNameLabel = new JLabel("Operator");
        userNameLabel.setFont(new Font("Segoe UI", Font.BOLD, 17));

        userEmailLabel = new JLabel("Not signed in");
        userEmailLabel.setFont(new Font("Segoe UI", Font.PLAIN, 12));

        planBadge = UiFactory.createBadge("FREE TIER", new Color(241, 245, 249), new Color(71, 85, 105));
        syncStatusBadge = UiFactory.createBadge("● Synced", new Color(236, 253, 245), new Color(16, 185, 129));

        btnSyncNow = UiFactory.createSecondaryButton("⟳ Sync Cloud");
        btnSyncNow.setPreferredSize(new Dimension(120, 32));

        btnAccountAction = UiFactory.createPrimaryButton("Sign In");
        btnAccountAction.setPreferredSize(new Dimension(110, 32));

        filesQuotaText = new JLabel("0 / 250");
        filesQuotaText.setFont(new Font("Segoe UI", Font.BOLD, 13));
        filesQuotaBar = UiFactory.createSlimProgressBar();

        storageQuotaText = new JLabel("0.0 MB / 500 MB");
        storageQuotaText.setFont(new Font("Segoe UI", Font.BOLD, 13));
        storageQuotaBar = UiFactory.createSlimProgressBar();

        statFilesProcessed = new JLabel("0");
        statMetadataRestored = new JLabel("0");
        statSidecarsMatched = new JLabel("0");
        statEngineReliability = new JLabel("100.0%");

        cpuNameLabel = new JLabel("Detecting CPU...");
        cpuNameLabel.setFont(new Font("Segoe UI", Font.BOLD, 12));

        cpuLoadText = new JLabel("0.0%");
        cpuLoadText.setFont(new Font("Segoe UI", Font.BOLD, 12));
        cpuLoadBar = UiFactory.createSlimProgressBar();

        ramText = new JLabel("0.0 GB / 0.0 GB");
        ramText.setFont(new Font("Segoe UI", Font.BOLD, 12));
        ramBar = UiFactory.createSlimProgressBar();

        threadsLabel = new JLabel("Logical Threads: " + Runtime.getRuntime().availableProcessors());
        threadsLabel.setFont(new Font("Segoe UI", Font.PLAIN, 12));

        networkStatusLabel = new JLabel("Online");
        networkStatusLabel.setFont(new Font("Segoe UI", Font.BOLD, 12));

        diskSpaceLabel = new JLabel("Scanning...");
        diskSpaceLabel.setFont(new Font("Segoe UI", Font.PLAIN, 12));

        // ── Build UI Structure ──
        JPanel scrollableContent = new ScrollablePanel(new GridBagLayout());
        scrollableContent.setOpaque(false);

        int gridY = 0;

        // 1. Welcome & Header Banner
        scrollableContent.add(createHeaderBanner(), createGridBagRow(gridY++));

        // 2. Account & Quota Row (50 / 50 split)
        scrollableContent.add(createAccountAndQuotaRow(), createGridBagRow(gridY++));

        // 3. Hardware Engine Telemetry Card
        scrollableContent.add(createHardwareTelemetryCard(), createGridBagRow(gridY++));

        // 4. Quick Action Tool Launchers Card
        scrollableContent.add(createQuickActionsCard(), createGridBagRow(gridY++));

        // 5. System Health & Gateway Footer Card
        scrollableContent.add(createSystemHealthCard(), createGridBagRow(gridY++));

        JScrollPane scrollPane = new JScrollPane(scrollableContent);
        scrollPane.setBorder(null);
        scrollPane.setOpaque(false);
        scrollPane.getViewport().setOpaque(false);
        scrollPane.getVerticalScrollBar().setUnitIncrement(16);
        add(scrollPane, BorderLayout.CENTER);

        // ── Wire Listeners & Sync ──
        wireListeners();
        updateUserData();
        updateHardwareInfo();
        startTelemetryLoop();
    }

    private GridBagConstraints createGridBagRow(int y) {
        GridBagConstraints gbc = new GridBagConstraints();
        gbc.gridx = 0;
        gbc.gridy = y;
        gbc.weightx = 1.0;
        gbc.fill = GridBagConstraints.HORIZONTAL;
        gbc.insets = new Insets(0, 0, 14, 0);
        return gbc;
    }

    // ── 1. Header Banner ──────────────────────────────────────────────────────
    private JPanel createHeaderBanner() {
        JPanel panel = UiFactory.createCard();
        panel.setLayout(new BorderLayout(16, 0));

        JPanel left = new JPanel(new FlowLayout(FlowLayout.LEFT, 12, 0));
        left.setOpaque(false);

        JLabel logo = UiFactory.createLogoBadge("TF", ThemeColors.accent(), Color.WHITE);
        logo.setPreferredSize(new Dimension(36, 36));
        left.add(logo);

        JPanel titles = new JPanel(new GridLayout(2, 1, 0, 2));
        titles.setOpaque(false);

        JLabel title = new JLabel("OPERATIONS DASHBOARD");
        title.setFont(new Font("Segoe UI", Font.BOLD, 16));
        title.setForeground(ThemeColors.textPrimary());

        JLabel subtitle = new JLabel("Live engine status, cloud synchronization, hardware telemetry, and suite launchers.");
        subtitle.setFont(new Font("Segoe UI", Font.PLAIN, 12));
        subtitle.setForeground(ThemeColors.textSecondary());

        titles.add(title);
        titles.add(subtitle);
        left.add(titles);
        panel.add(left, BorderLayout.WEST);

        JButton btnStartRestore = UiFactory.createPrimaryButton("Launch Restoration →");
        btnStartRestore.setPreferredSize(new Dimension(175, 34));
        btnStartRestore.addActionListener(e -> {
            if (onNavigate != null) {
                onNavigate.accept(RecoveryCenterPanel.CARD_RESTORE);
            }
        });
        panel.add(btnStartRestore, BorderLayout.EAST);

        ThemeColors.addThemeListener(() -> {
            title.setForeground(ThemeColors.textPrimary());
            subtitle.setForeground(ThemeColors.textSecondary());
        });

        return panel;
    }

    // ── 2. Account & Quota Row ────────────────────────────────────────────────
    private JPanel createAccountAndQuotaRow() {
        JPanel row = new JPanel(new GridLayout(1, 2, 14, 0));
        row.setOpaque(false);

        row.add(createAccountCard());
        row.add(createQuotaCard());
        return row;
    }

    private JPanel createAccountCard() {
        JPanel card = UiFactory.createCard();
        card.setLayout(new BorderLayout(0, 12));

        // Top Header
        JPanel topHeader = new JPanel(new BorderLayout());
        topHeader.setOpaque(false);
        JLabel lblTitle = new JLabel("ACCOUNT & CLOUD SYNCHRONIZATION");
        lblTitle.setFont(new Font("Segoe UI", Font.BOLD, 11));
        lblTitle.setForeground(ThemeColors.textMuted());
        topHeader.add(lblTitle, BorderLayout.WEST);
        topHeader.add(syncStatusBadge, BorderLayout.EAST);
        card.add(topHeader, BorderLayout.NORTH);

        // Center Profile Row
        JPanel profileRow = new JPanel(new BorderLayout(14, 0));
        JPanel avatarBox = new JPanel(new FlowLayout(FlowLayout.CENTER, 0, 2));
        avatarBox.setOpaque(false);
        avatarBox.setPreferredSize(new Dimension(46, 46));
        avatarBox.add(avatarLabel);
        profileRow.add(avatarBox, BorderLayout.WEST);

        JPanel details = new JPanel(new GridLayout(3, 1, 0, 2));
        details.setOpaque(false);

        JPanel nameAndBadge = new JPanel(new FlowLayout(FlowLayout.LEFT, 8, 0));
        nameAndBadge.setOpaque(false);
        nameAndBadge.add(userNameLabel);
        nameAndBadge.add(planBadge);

        details.add(nameAndBadge);
        details.add(userEmailLabel);

        JLabel cloudNotice = new JLabel("Google Cloud Firestore realtime sync active");
        cloudNotice.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        cloudNotice.setForeground(ThemeColors.textMuted());
        details.add(cloudNotice);

        profileRow.add(details, BorderLayout.CENTER);
        card.add(profileRow, BorderLayout.CENTER);

        // Bottom Actions
        JPanel actionsRow = new JPanel(new FlowLayout(FlowLayout.RIGHT, 8, 0));
        actionsRow.setOpaque(false);

        btnSyncNow.addActionListener(e -> {
            btnSyncNow.setEnabled(false);
            btnSyncNow.setText("Syncing...");
            syncStatusBadge.setText("● Syncing...");
            syncStatusBadge.setBackground(new Color(254, 243, 199));
            syncStatusBadge.setForeground(new Color(217, 119, 6));

            userService.triggerCloudSync(success -> SwingUtilities.invokeLater(() -> {
                btnSyncNow.setEnabled(true);
                btnSyncNow.setText("⟳ Sync Cloud");
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
        });

        btnAccountAction.addActionListener(e -> {
            Window win = SwingUtilities.getWindowAncestor(this);
            Frame frame = (win instanceof Frame) ? (Frame) win : null;
            SignInDialog dialog = new SignInDialog(frame, userService);
            dialog.setVisible(true);
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

        return card;
    }

    private JPanel createQuotaCard() {
        JPanel card = UiFactory.createCard();
        card.setLayout(new GridBagLayout());

        GridBagConstraints gbc = new GridBagConstraints();
        gbc.gridx = 0;
        gbc.gridy = 0;
        gbc.weightx = 1.0;
        gbc.fill = GridBagConstraints.HORIZONTAL;
        gbc.insets = new Insets(0, 0, 8, 0);

        JLabel lblTitle = new JLabel("ACTIVE RESTORATION QUOTA");
        lblTitle.setFont(new Font("Segoe UI", Font.BOLD, 11));
        lblTitle.setForeground(ThemeColors.textMuted());
        card.add(lblTitle, gbc);

        // Files Meter
        JPanel filesRow = new JPanel(new BorderLayout());
        filesRow.setOpaque(false);
        JLabel lblFiles = new JLabel("Files Processed");
        lblFiles.setFont(new Font("Segoe UI", Font.PLAIN, 12));
        lblFiles.setForeground(ThemeColors.textSecondary());
        filesRow.add(lblFiles, BorderLayout.WEST);
        filesRow.add(filesQuotaText, BorderLayout.EAST);
        gbc.gridy = 1;
        gbc.insets = new Insets(0, 0, 4, 0);
        card.add(filesRow, gbc);

        gbc.gridy = 2;
        gbc.insets = new Insets(0, 0, 10, 0);
        card.add(filesQuotaBar, gbc);

        // Storage Meter
        JPanel storageRow = new JPanel(new BorderLayout());
        storageRow.setOpaque(false);
        JLabel lblStorage = new JLabel("Storage Volume");
        lblStorage.setFont(new Font("Segoe UI", Font.PLAIN, 12));
        lblStorage.setForeground(ThemeColors.textSecondary());
        storageRow.add(lblStorage, BorderLayout.WEST);
        storageRow.add(storageQuotaText, BorderLayout.EAST);
        gbc.gridy = 3;
        gbc.insets = new Insets(0, 0, 4, 0);
        card.add(storageRow, gbc);

        gbc.gridy = 4;
        gbc.insets = new Insets(0, 0, 12, 0);
        card.add(storageQuotaBar, gbc);

        // 4 Tinted Mini Stat Tiles
        JPanel statsGrid = new JPanel(new GridLayout(1, 4, 8, 0));
        statsGrid.setOpaque(false);

        statsGrid.add(createMiniStatTile("Scanned", statFilesProcessed, new Color(59, 130, 246)));
        statsGrid.add(createMiniStatTile("Restored", statMetadataRestored, new Color(16, 185, 129)));
        statsGrid.add(createMiniStatTile("Sidecars", statSidecarsMatched, new Color(168, 85, 247)));
        statsGrid.add(createMiniStatTile("Accuracy", statEngineReliability, new Color(14, 165, 233)));

        gbc.gridy = 5;
        gbc.insets = new Insets(0, 0, 0, 0);
        card.add(statsGrid, gbc);

        ThemeColors.addThemeListener(() -> {
            lblTitle.setForeground(ThemeColors.textMuted());
            lblFiles.setForeground(ThemeColors.textSecondary());
            filesQuotaText.setForeground(ThemeColors.textPrimary());
            lblStorage.setForeground(ThemeColors.textSecondary());
            storageQuotaText.setForeground(ThemeColors.textPrimary());
        });

        return card;
    }

    private JPanel createMiniStatTile(String label, JLabel valueLabel, Color accent) {
        JPanel tile = new JPanel(new BorderLayout(2, 2)) {
            @Override
            protected void paintComponent(Graphics g) {
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                g2.setColor(getBackground());
                g2.fillRoundRect(0, 0, getWidth() - 1, getHeight() - 1, 10, 10);
                g2.setColor(ThemeColors.cardBorder());
                g2.drawRoundRect(0, 0, getWidth() - 1, getHeight() - 1, 10, 10);
                g2.dispose();
                super.paintComponent(g);
            }
        };
        tile.setOpaque(false);
        tile.setBorder(new EmptyBorder(6, 8, 6, 8));

        JLabel lbl = new JLabel(label);
        lbl.setFont(new Font("Segoe UI", Font.BOLD, 9));

        valueLabel.setFont(new Font("Segoe UI", Font.BOLD, 13));
        valueLabel.setForeground(accent);

        Runnable update = () -> {
            tile.setBackground(ThemeColors.pillBg());
            lbl.setForeground(ThemeColors.textMuted());
            tile.repaint();
        };
        update.run();
        ThemeColors.addThemeListener(update);

        tile.add(lbl, BorderLayout.NORTH);
        tile.add(valueLabel, BorderLayout.CENTER);
        return tile;
    }

    // ── 3. Hardware Engine Telemetry Card ─────────────────────────────────────
    private JPanel createHardwareTelemetryCard() {
        JPanel card = UiFactory.createCard();
        card.setLayout(new BorderLayout(0, 12));

        // Header
        JPanel header = new JPanel(new BorderLayout());
        header.setOpaque(false);
        JLabel lblTitle = new JLabel("HARDWARE ACCELERATION & HOST TELEMETRY");
        lblTitle.setFont(new Font("Segoe UI", Font.BOLD, 11));
        lblTitle.setForeground(ThemeColors.textMuted());
        header.add(lblTitle, BorderLayout.WEST);

        JLabel lblEngine = UiFactory.createBadge("MULTI-CORE SIMD ACTIVE", new Color(238, 242, 255), new Color(99, 102, 241));
        header.add(lblEngine, BorderLayout.EAST);
        card.add(header, BorderLayout.NORTH);

        // Body: 3 columns (CPU, RAM, Threads/Architecture)
        JPanel grid = new JPanel(new GridLayout(1, 3, 14, 0));
        grid.setOpaque(false);

        // Col 1: CPU
        JPanel cpuCol = UiFactory.createPillPanel(12);
        cpuCol.setLayout(new GridBagLayout());
        cpuCol.setBorder(new EmptyBorder(10, 14, 10, 14));
        GridBagConstraints g = new GridBagConstraints();
        g.gridx = 0; g.gridy = 0; g.weightx = 1.0; g.fill = GridBagConstraints.HORIZONTAL;
        g.insets = new Insets(0, 0, 4, 0);

        JLabel lblCpuHead = new JLabel("PROCESSOR LOAD");
        lblCpuHead.setFont(new Font("Segoe UI", Font.BOLD, 10));
        lblCpuHead.setForeground(ThemeColors.textMuted());
        cpuCol.add(lblCpuHead, g);

        g.gridy = 1;
        cpuCol.add(cpuNameLabel, g);

        g.gridy = 2;
        JPanel cpuValRow = new JPanel(new BorderLayout());
        cpuValRow.setOpaque(false);
        JLabel lblCurrentLoad = new JLabel("Active Utilization");
        lblCurrentLoad.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        lblCurrentLoad.setForeground(ThemeColors.textSecondary());
        cpuValRow.add(lblCurrentLoad, BorderLayout.WEST);
        cpuValRow.add(cpuLoadText, BorderLayout.EAST);
        cpuCol.add(cpuValRow, g);

        g.gridy = 3;
        g.insets = new Insets(4, 0, 0, 0);
        cpuCol.add(cpuLoadBar, g);
        grid.add(cpuCol);

        // Col 2: RAM
        JPanel ramCol = UiFactory.createPillPanel(12);
        ramCol.setLayout(new GridBagLayout());
        ramCol.setBorder(new EmptyBorder(10, 14, 10, 14));
        g = new GridBagConstraints();
        g.gridx = 0; g.gridy = 0; g.weightx = 1.0; g.fill = GridBagConstraints.HORIZONTAL;
        g.insets = new Insets(0, 0, 4, 0);

        JLabel lblRamHead = new JLabel("PHYSICAL SYSTEM MEMORY");
        lblRamHead.setFont(new Font("Segoe UI", Font.BOLD, 10));
        lblRamHead.setForeground(ThemeColors.textMuted());
        ramCol.add(lblRamHead, g);

        g.gridy = 1;
        JLabel lblRamSub = new JLabel("Fast Takeout Stream Buffer");
        lblRamSub.setFont(new Font("Segoe UI", Font.BOLD, 12));
        lblRamSub.setForeground(ThemeColors.textPrimary());
        ramCol.add(lblRamSub, g);

        g.gridy = 2;
        JPanel ramValRow = new JPanel(new BorderLayout());
        ramValRow.setOpaque(false);
        JLabel lblUsedMem = new JLabel("Memory In Use");
        lblUsedMem.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        lblUsedMem.setForeground(ThemeColors.textSecondary());
        ramValRow.add(lblUsedMem, BorderLayout.WEST);
        ramValRow.add(ramText, BorderLayout.EAST);
        ramCol.add(ramValRow, g);

        g.gridy = 3;
        g.insets = new Insets(4, 0, 0, 0);
        ramCol.add(ramBar, g);
        grid.add(ramCol);

        // Col 3: Threads & Execution Engine
        JPanel engCol = UiFactory.createPillPanel(12);
        engCol.setLayout(new GridBagLayout());
        engCol.setBorder(new EmptyBorder(10, 14, 10, 14));
        g = new GridBagConstraints();
        g.gridx = 0; g.gridy = 0; g.weightx = 1.0; g.fill = GridBagConstraints.HORIZONTAL;
        g.insets = new Insets(0, 0, 4, 0);

        JLabel lblEngHead = new JLabel("PARALLEL WORKER ENGINE");
        lblEngHead.setFont(new Font("Segoe UI", Font.BOLD, 10));
        lblEngHead.setForeground(ThemeColors.textMuted());
        engCol.add(lblEngHead, g);

        g.gridy = 1;
        engCol.add(threadsLabel, g);

        g.gridy = 2;
        JLabel lblFeat = new JLabel("✓ Native ExifTool Worker Pool");
        lblFeat.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        lblFeat.setForeground(new Color(16, 185, 129));
        engCol.add(lblFeat, g);

        g.gridy = 3;
        JLabel lblFeat2 = new JLabel("✓ Smart Adjacent Interpolation");
        lblFeat2.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        lblFeat2.setForeground(new Color(16, 185, 129));
        engCol.add(lblFeat2, g);
        grid.add(engCol);

        card.add(grid, BorderLayout.CENTER);

        ThemeColors.addThemeListener(() -> {
            lblTitle.setForeground(ThemeColors.textMuted());
            lblCpuHead.setForeground(ThemeColors.textMuted());
            cpuNameLabel.setForeground(ThemeColors.textPrimary());
            cpuLoadText.setForeground(ThemeColors.textPrimary());
            lblRamHead.setForeground(ThemeColors.textMuted());
            lblRamSub.setForeground(ThemeColors.textPrimary());
            ramText.setForeground(ThemeColors.textPrimary());
            lblEngHead.setForeground(ThemeColors.textMuted());
            threadsLabel.setForeground(ThemeColors.textPrimary());
        });

        return card;
    }

    // ── 4. Quick Action Tool Launchers Card ────────────────────────────────────
    private JPanel createQuickActionsCard() {
        JPanel card = UiFactory.createCard();
        card.setLayout(new BorderLayout(0, 12));

        JLabel lblTitle = new JLabel("TAKEOUT TOOLKIT QUICK LAUNCH");
        lblTitle.setFont(new Font("Segoe UI", Font.BOLD, 11));
        lblTitle.setForeground(ThemeColors.textMuted());
        card.add(lblTitle, BorderLayout.NORTH);

        JPanel grid = new JPanel(new GridLayout(1, 4, 12, 0));
        grid.setOpaque(false);

        grid.add(createToolCard(
                "RESTORE",
                "Archive Restoration",
                "Fix timestamps, merge JSON metadata sidecars, and organize year/month albums.",
                "Open Restore →",
                new Color(59, 130, 246),
                () -> navigateTo(RecoveryCenterPanel.CARD_RESTORE)
        ));

        grid.add(createToolCard(
                "EXIF & GPS",
                "Metadata Inspector",
                "View full EXIF tags, camera hardware specs, lens models, and Google Maps pins.",
                "Open Inspector →",
                new Color(16, 185, 129),
                () -> navigateTo(RecoveryCenterPanel.CARD_EXIF)
        ));

        grid.add(createToolCard(
                "COMPARE",
                "Archive Comparison",
                "Side-by-side folder structure & checksum diff between original and restored.",
                "Open Compare →",
                new Color(245, 158, 11),
                () -> navigateTo(RecoveryCenterPanel.CARD_COMPARE)
        ));

        grid.add(createToolCard(
                "DUPLICATES",
                "Duplicate Cleaner",
                "Detect exact & perceptual duplicate photos across Takeout folders to reclaim disk.",
                "Open Cleaner →",
                new Color(168, 85, 247),
                () -> navigateTo(RecoveryCenterPanel.CARD_DUPLICATE)
        ));

        card.add(grid, BorderLayout.CENTER);

        ThemeColors.addThemeListener(() -> lblTitle.setForeground(ThemeColors.textMuted()));
        return card;
    }

    private JPanel createToolCard(String badgeText, String title, String desc, String btnText, Color accent, Runnable action) {
        JPanel tile = UiFactory.createPillPanel(14);
        tile.setLayout(new BorderLayout(0, 8));
        tile.setBorder(new EmptyBorder(12, 14, 12, 14));

        JPanel top = new JPanel(new BorderLayout());
        top.setOpaque(false);
        JLabel badge = UiFactory.createBadge(badgeText, new Color(accent.getRed(), accent.getGreen(), accent.getBlue(), 30), accent);
        top.add(badge, BorderLayout.WEST);
        tile.add(top, BorderLayout.NORTH);

        JPanel body = new JPanel(new GridLayout(2, 1, 0, 4));
        body.setOpaque(false);

        JLabel lblTitle = new JLabel(title);
        lblTitle.setFont(new Font("Segoe UI", Font.BOLD, 13));
        lblTitle.setForeground(ThemeColors.textPrimary());

        JLabel lblDesc = new JLabel("<html><body style='width:160px;'>" + desc + "</body></html>");
        lblDesc.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        lblDesc.setForeground(ThemeColors.textSecondary());

        body.add(lblTitle);
        body.add(lblDesc);
        tile.add(body, BorderLayout.CENTER);

        JButton btn = UiFactory.createSecondaryButton(btnText);
        btn.setPreferredSize(new Dimension(140, 30));
        btn.addActionListener(e -> {
            if (action != null) action.run();
        });
        tile.add(btn, BorderLayout.SOUTH);

        ThemeColors.addThemeListener(() -> {
            lblTitle.setForeground(ThemeColors.textPrimary());
            lblDesc.setForeground(ThemeColors.textSecondary());
        });

        return tile;
    }

    private void navigateTo(String cardName) {
        if (!userService.isSignedIn()) {
            Window win = SwingUtilities.getWindowAncestor(this);
            Frame frame = (win instanceof Frame) ? (Frame) win : null;
            new SignInDialog(frame, userService).setVisible(true);
            return;
        }
        if (onNavigate != null) {
            onNavigate.accept(cardName);
        }
    }

    // ── 5. System Health & Gateway Card ───────────────────────────────────────
    private JPanel createSystemHealthCard() {
        JPanel card = UiFactory.createCard();
        card.setLayout(new BorderLayout(0, 8));

        JPanel left = new JPanel(new FlowLayout(FlowLayout.LEFT, 16, 0));
        left.setOpaque(false);

        JPanel netItem = new JPanel(new FlowLayout(FlowLayout.LEFT, 6, 0));
        netItem.setOpaque(false);
        JLabel netIcon = new JLabel("●");
        netIcon.setForeground(new Color(16, 185, 129));
        JLabel lblNet = new JLabel("Internet Gateway:");
        lblNet.setFont(new Font("Segoe UI", Font.PLAIN, 12));
        lblNet.setForeground(ThemeColors.textMuted());
        netItem.add(netIcon);
        netItem.add(lblNet);
        netItem.add(networkStatusLabel);
        left.add(netItem);

        JPanel diskItem = new JPanel(new FlowLayout(FlowLayout.LEFT, 6, 0));
        diskItem.setOpaque(false);
        JLabel lblDisk = new JLabel("Temp Decompression Staging:");
        lblDisk.setFont(new Font("Segoe UI", Font.PLAIN, 12));
        lblDisk.setForeground(ThemeColors.textMuted());
        diskItem.add(lblDisk);
        diskItem.add(diskSpaceLabel);
        left.add(diskItem);

        card.add(left, BorderLayout.WEST);

        JLabel ver = new JLabel("TakeoutFix Native Desktop v1.0.0 • Java 17+ FlatLaf");
        ver.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        ver.setForeground(ThemeColors.textMuted());
        card.add(ver, BorderLayout.EAST);

        ThemeColors.addThemeListener(() -> {
            lblNet.setForeground(ThemeColors.textMuted());
            networkStatusLabel.setForeground(ThemeColors.textPrimary());
            lblDisk.setForeground(ThemeColors.textMuted());
            diskSpaceLabel.setForeground(ThemeColors.textPrimary());
            ver.setForeground(ThemeColors.textMuted());
        });

        return card;
    }

    // ── Data updates & telemetry loops ────────────────────────────────────────

    public void updateUserData() {
        SwingUtilities.invokeLater(() -> {
            boolean signedIn = userService.isSignedIn();
            String name = userService.getCurrentName();
            String email = userService.getCurrentEmail();
            String plan = userService.getCurrentPlan();

            userNameLabel.setText(name.isEmpty() ? "Operator" : name);
            userEmailLabel.setText(signedIn ? email : "Not signed in (Local session)");

            if (!name.isEmpty()) {
                avatarLabel.setText(name.substring(0, 1).toUpperCase());
            } else if (!email.isEmpty()) {
                avatarLabel.setText(email.substring(0, 1).toUpperCase());
            } else {
                avatarLabel.setText("TF");
            }

            if ("super".equalsIgnoreCase(plan)) {
                planBadge.setText("SUPER LIFETIME");
                planBadge.setBackground(new Color(254, 240, 138));
                planBadge.setForeground(new Color(133, 77, 14));
            } else if ("pro".equalsIgnoreCase(plan)) {
                planBadge.setText("PRO TIER");
                planBadge.setBackground(new Color(224, 231, 255));
                planBadge.setForeground(new Color(67, 56, 202));
            } else if (userService.isFreeUnlimited()) {
                planBadge.setText("FREE (UNLIMITED PROMO)");
                planBadge.setBackground(new Color(220, 252, 231));
                planBadge.setForeground(new Color(22, 101, 52));
            } else {
                planBadge.setText("FREE TIER");
                planBadge.setBackground(ThemeColors.isDark() ? new Color(51, 65, 85) : new Color(241, 245, 249));
                planBadge.setForeground(ThemeColors.isDark() ? new Color(203, 213, 225) : new Color(71, 85, 105));
            }

            btnAccountAction.setText(signedIn ? "Switch Account" : "Sign In");

            // Quota values
            long usedFiles = userService.getUsedFiles();
            long maxFiles = userService.getMaxFiles();
            long usedBytes = userService.getUsedBytes();
            long maxBytes = userService.getMaxBytes();

            NumberFormat nf = NumberFormat.getIntegerInstance(Locale.US);

            if (userService.isProOrSuper() || userService.isFreeUnlimited()) {
                String suffix = "Unlimited";
                filesQuotaText.setText(nf.format(usedFiles) + " / " + suffix);
                filesQuotaBar.setValue(100);
                filesQuotaBar.setForeground(new Color(16, 185, 129));

                double usedMb = usedBytes / (1024.0 * 1024.0);
                storageQuotaText.setText(String.format(Locale.US, "%.1f MB / %s", usedMb, suffix));
                storageQuotaBar.setValue(100);
                storageQuotaBar.setForeground(new Color(16, 185, 129));
            } else {
                long capFiles = maxFiles > 0 ? maxFiles : 250;
                filesQuotaText.setText(nf.format(usedFiles) + " / " + capFiles);
                int filePct = (int) Math.min(100, Math.max(0, (usedFiles * 100) / capFiles));
                filesQuotaBar.setValue(filePct);
                filesQuotaBar.setForeground(filePct >= 100 ? new Color(239, 68, 68) : ThemeColors.accent());

                long capBytes = maxBytes > 0 ? maxBytes : (500L * 1024 * 1024);
                double usedMb = usedBytes / (1024.0 * 1024.0);
                double capMb = capBytes / (1024.0 * 1024.0);
                storageQuotaText.setText(String.format(Locale.US, "%.1f MB / %.0f MB", usedMb, capMb));
                int bytePct = (int) Math.min(100, Math.max(0, (usedBytes * 100) / capBytes));
                storageQuotaBar.setValue(bytePct);
                storageQuotaBar.setForeground(bytePct >= 100 ? new Color(239, 68, 68) : ThemeColors.accent());
            }

            // Sync status
            FirebaseSyncService fb = userService.getFirebaseSyncService();
            if (fb != null) {
                updateSyncState(fb.getSyncState());
            }
        });
    }

    private void updateSyncState(FirebaseSyncService.SyncState state) {
        SwingUtilities.invokeLater(() -> {
            if (state == null) return;
            switch (state) {
                case SYNCING -> {
                    syncStatusBadge.setText("● Syncing...");
                    syncStatusBadge.setBackground(new Color(254, 243, 199));
                    syncStatusBadge.setForeground(new Color(217, 119, 6));
                }
                case SYNCED -> {
                    syncStatusBadge.setText("● Synced");
                    syncStatusBadge.setBackground(new Color(236, 253, 245));
                    syncStatusBadge.setForeground(new Color(16, 185, 129));
                }
                case FAILED -> {
                    syncStatusBadge.setText("● Offline / Local");
                    syncStatusBadge.setBackground(new Color(241, 245, 249));
                    syncStatusBadge.setForeground(new Color(100, 116, 139));
                }
                default -> {
                    syncStatusBadge.setText("● Idle");
                    syncStatusBadge.setBackground(ThemeColors.pillBg());
                    syncStatusBadge.setForeground(ThemeColors.textMuted());
                }
            }
        });
    }

    private void updateHardwareInfo() {
        String cpuName = SystemHardwareInfo.getCpuName();
        if (!cpuName.isEmpty()) {
            cpuNameLabel.setText(cpuName.length() > 34 ? cpuName.substring(0, 31) + "..." : cpuName);
            cpuNameLabel.setToolTipText(cpuName);
        } else {
            cpuNameLabel.setText("Host Multi-Core CPU");
        }

        int threads = SystemHardwareInfo.getLogicalProcessors();
        int physical = SystemHardwareInfo.getPhysicalCores();
        threadsLabel.setText(String.format("%d Cores / %d Logical Threads", physical, threads));

        // Disk staging space
        try {
            File tmp = new File(System.getProperty("java.io.tmpdir", "."));
            long freeGb = tmp.getFreeSpace() / (1024 * 1024 * 1024);
            diskSpaceLabel.setText(freeGb + " GB Available (" + tmp.getAbsolutePath() + ")");
        } catch (Exception ignored) {
            diskSpaceLabel.setText("Disk Available");
        }
    }

    private void startTelemetryLoop() {
        telemetryTimer = new Timer(2000, e -> {
            try {
                // CPU load
                double cpuLoad = SystemHardwareInfo.getCpuLoadPercent();
                cpuLoadText.setText(String.format(Locale.US, "%.1f%%", cpuLoad));
                cpuLoadBar.setValue((int) Math.min(100, Math.max(0, cpuLoad)));

                // RAM
                double usedRam = SystemHardwareInfo.getUsedMemoryGB();
                double totalRam = SystemHardwareInfo.getTotalMemoryGB();
                if (totalRam > 0) {
                    ramText.setText(String.format(Locale.US, "%.1f GB / %.1f GB", usedRam, totalRam));
                    int ramPct = (int) Math.min(100, Math.max(0, (usedRam * 100.0) / totalRam));
                    ramBar.setValue(ramPct);
                }

                // Update CPU name once background detection completes
                String cpu = SystemHardwareInfo.getCpuName();
                if (!cpu.isEmpty() && !cpu.equals(cpuNameLabel.getToolTipText())) {
                    cpuNameLabel.setText(cpu.length() > 34 ? cpu.substring(0, 31) + "..." : cpu);
                    cpuNameLabel.setToolTipText(cpu);
                }
            } catch (Exception ignored) {}
        });
        telemetryTimer.setRepeats(true);
        telemetryTimer.start();
    }

    private void wireListeners() {
        userService.addListener(user -> updateUserData());

        if (userService.getFirebaseSyncService() != null) {
            userService.getFirebaseSyncService().setSyncStateListener(this::updateSyncState);
        }

        if (netService != null) {
            netService.addListener(online -> SwingUtilities.invokeLater(() -> {
                networkStatusLabel.setText(online ? "Online (Connected)" : "Offline (No Gateway)");
                networkStatusLabel.setForeground(online ? new Color(16, 185, 129) : new Color(239, 68, 68));
            }));
        }
    }

    public void updateSessionStats(long scanned, long restored, long unmatched, long errors) {
        SwingUtilities.invokeLater(() -> {
            statFilesProcessed.setText(String.valueOf(scanned));
            statMetadataRestored.setText(String.valueOf(restored));
            statSidecarsMatched.setText(String.valueOf(unmatched));

            if (scanned > 0) {
                double accuracy = Math.max(0.0, 100.0 - ((errors * 100.0) / scanned));
                statEngineReliability.setText(String.format(Locale.US, "%.1f%%", accuracy));
            } else {
                statEngineReliability.setText("100.0%");
            }
        });
    }

    public void updateLiveSessionUsage(int restored, int total, long jobBytes) {
        SwingUtilities.invokeLater(() -> {
            long baseFiles = userService.getUsedFiles();
            long baseBytes = userService.getUsedBytes();

            long totalFiles = baseFiles + restored;
            long totalBytes = baseBytes + jobBytes;

            NumberFormat nf = NumberFormat.getIntegerInstance(Locale.US);

            if (userService.isProOrSuper() || userService.isFreeUnlimited()) {
                String suffix = "Unlimited";
                filesQuotaText.setText(nf.format(totalFiles) + " / " + suffix);
                filesQuotaBar.setValue(100);
                filesQuotaBar.setForeground(new Color(16, 185, 129));

                double usedMb = totalBytes / (1024.0 * 1024.0);
                storageQuotaText.setText(String.format(Locale.US, "%.1f MB / %s", usedMb, suffix));
                storageQuotaBar.setValue(100);
                storageQuotaBar.setForeground(new Color(16, 185, 129));
            } else {
                long capFiles = userService.getMaxFiles() > 0 ? userService.getMaxFiles() : 250;
                filesQuotaText.setText(nf.format(totalFiles) + " / " + capFiles);
                int filePct = (int) Math.min(100, Math.max(0, (totalFiles * 100) / capFiles));
                filesQuotaBar.setValue(filePct);
                filesQuotaBar.setForeground(filePct >= 100 ? new Color(239, 68, 68) : ThemeColors.accent());

                long capBytes = userService.getMaxBytes() > 0 ? userService.getMaxBytes() : (500L * 1024 * 1024);
                double usedMb = totalBytes / (1024.0 * 1024.0);
                double capMb = capBytes / (1024.0 * 1024.0);
                storageQuotaText.setText(String.format(Locale.US, "%.1f MB / %.0f MB", usedMb, capMb));
                int bytePct = (int) Math.min(100, Math.max(0, (totalBytes * 100) / capBytes));
                storageQuotaBar.setValue(bytePct);
                storageQuotaBar.setForeground(bytePct >= 100 ? new Color(239, 68, 68) : ThemeColors.accent());
            }
        });
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
