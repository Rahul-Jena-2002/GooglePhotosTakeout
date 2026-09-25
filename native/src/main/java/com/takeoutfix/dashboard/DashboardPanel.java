package com.takeoutfix.dashboard;

import com.takeoutfix.network.SystemHardwareInfo;
import com.takeoutfix.auth.UserSyncBridgeService;
import com.takeoutfix.ads.AdSyncService;
import com.takeoutfix.auth.FirebaseSyncService;
import com.takeoutfix.network.NetworkMonitorService;

import javax.swing.*;
import java.awt.*;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

/**
 * Operations Dashboard Panel — modular high-level orchestrator.
 * Follows Single Responsibility and DRY principles, delegating card rendering to dedicated subcomponents.
 */
public class DashboardPanel extends JPanel {

    private final UserSyncBridgeService userService;

    // Subcomponents
    private final DashboardHeaderBanner headerBanner;
    private final DashboardAccountSection accountSection;
    private final DashboardKpiSection kpiSection;
    private DashboardDealsSection dealsSection;
    private final DashboardTelemetrySection telemetrySection;
    private final DashboardQuickActionsSection quickActionsSection;

    private final ScheduledExecutorService telemetryExecutor = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "Dashboard-Telemetry");
        t.setDaemon(true);
        return t;
    });

    public DashboardPanel(UserSyncBridgeService userService, NetworkMonitorService netService, Consumer<String> onNavigate) {
        this(userService, netService, null, onNavigate);
    }

    public DashboardPanel(UserSyncBridgeService userService, NetworkMonitorService netService,
                          AdSyncService adSyncService, Consumer<String> onNavigate) {
        super(new BorderLayout());
        setOpaque(false);
        this.userService = userService;

        // Initialize modular subcomponents
        this.headerBanner = new DashboardHeaderBanner(onNavigate);
        this.accountSection = new DashboardAccountSection(userService);
        this.kpiSection = new DashboardKpiSection(userService);
        this.telemetrySection = new DashboardTelemetrySection();
        this.quickActionsSection = new DashboardQuickActionsSection(onNavigate);

        if (adSyncService != null) {
            this.dealsSection = new DashboardDealsSection(adSyncService);
        }

        buildLayout();
        wireListeners();
        updateHardwareInfo();
        startTelemetryLoop();
    }

    private void buildLayout() {
        JPanel scrollContent = new ScrollablePanel(new GridBagLayout());
        scrollContent.setOpaque(false);

        int gridY = 0;

        // 1. Welcome Header Banner
        scrollContent.add(headerBanner, createRowConstraints(gridY++));

        // 2. Account & Quota Row (50 / 50 split)
        JPanel accountQuotaRow = new JPanel(new GridLayout(1, 2, 14, 0));
        accountQuotaRow.setOpaque(false);
        accountQuotaRow.add(accountSection);
        accountQuotaRow.add(kpiSection);
        scrollContent.add(accountQuotaRow, createRowConstraints(gridY++));

        // 3. Recommended Storage Deals
        if (dealsSection != null) {
            scrollContent.add(dealsSection, createRowConstraints(gridY++));
        }

        // 4. Hardware Host Telemetry
        scrollContent.add(telemetrySection, createRowConstraints(gridY++));

        // 5. Quick Action Launchers
        scrollContent.add(quickActionsSection, createRowConstraints(gridY++));

        JScrollPane scrollPane = new JScrollPane(scrollContent);
        scrollPane.setBorder(null);
        scrollPane.setOpaque(false);
        scrollPane.getViewport().setOpaque(false);
        scrollPane.getVerticalScrollBar().setUnitIncrement(16);
        add(scrollPane, BorderLayout.CENTER);
    }

    private GridBagConstraints createRowConstraints(int y) {
        GridBagConstraints gbc = new GridBagConstraints();
        gbc.gridx = 0;
        gbc.gridy = y;
        gbc.weightx = 1.0;
        gbc.fill = GridBagConstraints.HORIZONTAL;
        gbc.insets = new Insets(0, 0, 14, 0);
        return gbc;
    }

    private void wireListeners() {
        if (userService != null) {
            userService.addListener(user -> updateUserData());
            FirebaseSyncService fb = userService.getFirebaseSyncService();
            if (fb != null) {
                fb.setSyncStateListener(accountSection::updateSyncState);
            }
        }
    }

    public void updateUserData() {
        accountSection.updateUserData();
        kpiSection.updateUserData();
    }

    public void updateLiveSessionUsage(long processedDelta, long total, long processedBytesDelta) {
        kpiSection.updateLiveSessionUsage(processedDelta, total, processedBytesDelta);
    }

    public void updateSessionStats(long scanned, long restored, long unmatched, long errors) {
        kpiSection.updateSessionStats(scanned, restored, unmatched, errors);
    }

    private void updateHardwareInfo() {
        telemetrySection.setCpuName(SystemHardwareInfo.getCpuName());
    }

    private void startTelemetryLoop() {
        telemetryExecutor.scheduleAtFixedRate(() -> {
            try {
                int cpu = (int) Math.round(SystemHardwareInfo.getCpuLoadPercent());
                double usedRam = SystemHardwareInfo.getUsedMemoryGB();
                double totalRam = SystemHardwareInfo.getTotalMemoryGB();
                telemetrySection.updateTelemetry(cpu, usedRam, totalRam);
            } catch (Exception ignored) {}
        }, 1, 3, TimeUnit.SECONDS);
    }

    /**
     * ScrollablePanel implements Scrollable to enforce width-tracking in JScrollPane.
     */
    private static class ScrollablePanel extends JPanel implements Scrollable {
        public ScrollablePanel(LayoutManager layout) {
            super(layout);
        }

        @Override public Dimension getPreferredScrollableViewportSize() { return getPreferredSize(); }
        @Override public int getScrollableUnitIncrement(Rectangle r, int o, int d) { return 16; }
        @Override public int getScrollableBlockIncrement(Rectangle r, int o, int d) { return 64; }
        @Override public boolean getScrollableTracksViewportWidth() { return true; }
        @Override public boolean getScrollableTracksViewportHeight() { return false; }
    }
}
