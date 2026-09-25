package com.takeoutfix.dashboard;
import com.takeoutfix.shared.ui.AppRoutes;

import com.takeoutfix.shared.ui.UiFactory;
import com.takeoutfix.shared.theme.ThemeColors;

import javax.swing.*;
import javax.swing.border.EmptyBorder;
import java.awt.*;
import java.util.function.Consumer;

/**
 * High-Performance Engine Suite quick action launcher cards.
 * Provides instant access to Takeout restoration, EXIF inspection, and deduplication engines.
 */
public class DashboardQuickActionsSection extends JPanel {

    public DashboardQuickActionsSection(Consumer<String> onNavigate) {
        super(new BorderLayout());
        setOpaque(false);

        JPanel card = UiFactory.createCard();
        card.setLayout(new BorderLayout(0, 12));

        // Header Row
        JPanel head = new JPanel(new BorderLayout());
        head.setOpaque(false);
        JLabel lblTitle = new JLabel("TOOLS");
        lblTitle.setFont(new Font("Segoe UI", Font.BOLD, 11));
        lblTitle.setForeground(ThemeColors.textMuted());
        head.add(lblTitle, BorderLayout.WEST);

        JLabel lblVer = UiFactory.createBadge("ALL TOOLS UNLOCKED", ThemeColors.successLight(), ThemeColors.success());
        head.add(lblVer, BorderLayout.EAST);
        card.add(head, BorderLayout.NORTH);

        // 4 Tools Grid (1x4)
        JPanel grid = new JPanel(new GridLayout(1, 4, 12, 0));
        grid.setOpaque(false);

        grid.add(createToolCard("FIX PHOTOS", "Takeout Restorer",
                "Fix your Google Photos export — restore dates, captions, and organize everything neatly.",
                "Open →", new Color(99, 102, 241),
                () -> { if (onNavigate != null) onNavigate.accept(AppRoutes.RESTORE); }));

        grid.add(createToolCard("BETA", "EXIF Viewer",
                "See photo details like camera model, location, and when it was taken.",
                "Open →", new Color(16, 185, 129),
                () -> { if (onNavigate != null) onNavigate.accept(AppRoutes.EXIF); }));

        grid.add(createToolCard("BETA", "Archive Compare",
                "Check that your restored files match your original Takeout export perfectly.",
                "Compare →", new Color(14, 165, 233),
                () -> { if (onNavigate != null) onNavigate.accept(AppRoutes.COMPARE); }));

        grid.add(createToolCard("BETA", "Duplicate Finder",
                "Find and remove duplicate photos and videos to free up space.",
                "Scan →", new Color(168, 85, 247),
                () -> { if (onNavigate != null) onNavigate.accept(AppRoutes.DUPLICATE); }));

        card.add(grid, BorderLayout.CENTER);

        ThemeColors.addThemeListener(() -> {
            lblTitle.setForeground(ThemeColors.textMuted());
        });

        add(card, BorderLayout.CENTER);
    }

    private JPanel createToolCard(String badgeText, String title, String desc, String btnText, Color accent, Runnable action) {
        JPanel tile = UiFactory.createInnerContainer(12);
        tile.setLayout(new BorderLayout(0, 8));
        tile.setBorder(new EmptyBorder(12, 14, 12, 14));

        JPanel top = new JPanel(new BorderLayout());
        top.setOpaque(false);
        JLabel badge = UiFactory.createBadge(badgeText, new Color(accent.getRed(), accent.getGreen(), accent.getBlue(), 30), accent);
        top.add(badge, BorderLayout.WEST);
        tile.add(top, BorderLayout.NORTH);

        JPanel body = new JPanel(new BorderLayout(0, 6));
        body.setOpaque(false);

        JLabel lblTitle = new JLabel(title);
        lblTitle.setFont(new Font("Segoe UI", Font.BOLD, 13));
        lblTitle.setForeground(ThemeColors.textPrimary());

        JLabel lblDesc = new JLabel("<html><body style='width:160px; line-height: 1.35;'>" + desc + "</body></html>");
        lblDesc.setFont(new Font("Segoe UI", Font.PLAIN, 11));
        lblDesc.setForeground(ThemeColors.textSecondary());

        body.add(lblTitle, BorderLayout.NORTH);
        body.add(lblDesc, BorderLayout.CENTER);
        tile.add(body, BorderLayout.CENTER);

        JButton btn = UiFactory.createSecondaryButton(btnText);
        btn.setFont(new Font("Segoe UI", Font.BOLD, 11));
        btn.addActionListener(e -> action.run());
        tile.add(btn, BorderLayout.SOUTH);

        tile.setPreferredSize(new Dimension(0, 168));

        ThemeColors.addThemeListener(() -> {
            lblTitle.setForeground(ThemeColors.textPrimary());
            lblDesc.setForeground(ThemeColors.textSecondary());
            tile.repaint();
        });

        return tile;
    }
}
