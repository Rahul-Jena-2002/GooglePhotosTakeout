package com.takeoutfix.network;
import com.takeoutfix.shared.ui.UiFactory;

import com.takeoutfix.shared.theme.ThemeColors;

import javax.swing.*;
import javax.swing.border.EmptyBorder;
import javax.swing.border.LineBorder;
import java.awt.*;

/**
 * Modular component to enforce strict blocking of the tool when offline.
 */
public class OfflineBlockerBanner extends JPanel {

    private final NetworkMonitorService networkMonitorService;

    public OfflineBlockerBanner(NetworkMonitorService netService) {
        super(new BorderLayout(12, 0));
        this.networkMonitorService = netService;

        setBackground(new Color(239, 68, 68, 25));
        setBorder(BorderFactory.createCompoundBorder(
                new LineBorder(new Color(239, 68, 68, 120), 1, true),
                new EmptyBorder(10, 16, 10, 16)
        ));
        setVisible(false);

        JLabel warningIcon = UiFactory.createBadge("OFFLINE", ThemeColors.dangerLight(), ThemeColors.danger());
        add(warningIcon, BorderLayout.WEST);

        JLabel text = new JLabel("<html><b style='color:#ef4444;'>INTERNET CONNECTION REQUIRED:</b> "
                + "TakeoutFix must be online to verify user account status and sync plan quotas. "
                + "The restoration tool is blocked until an active connection is restored.</html>");
        text.setFont(new Font("Segoe UI", Font.PLAIN, 12));
        text.setForeground(ThemeColors.TEXT_PRIMARY);
        add(text, BorderLayout.CENTER);

        JButton retryBtn = UiFactory.createSecondaryButton("Retry Connection");
        retryBtn.addActionListener(e -> networkMonitorService.checkNow());
        add(retryBtn, BorderLayout.EAST);

        netService.addListener(this::onNetworkStatusChanged);
    }

    private void onNetworkStatusChanged(boolean online) {
        SwingUtilities.invokeLater(() -> {
            setVisible(!online);
            revalidate();
            repaint();
        });
    }
}
