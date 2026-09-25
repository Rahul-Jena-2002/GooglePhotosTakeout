package com.takeoutfix.dashboard;
import com.takeoutfix.shared.ui.AppRoutes;

import com.takeoutfix.shared.ui.UiFactory;
import com.takeoutfix.shared.theme.ThemeColors;

import javax.swing.*;
import java.awt.*;
import java.util.function.Consumer;

/**
 * Top operations dashboard banner with brand logo, title, and quick launcher CTA.
 */
public class DashboardHeaderBanner extends JPanel {

    public DashboardHeaderBanner(Consumer<String> onNavigate) {
        super(new BorderLayout(16, 0));
        setOpaque(false);

        JPanel card = UiFactory.createCard();
        card.setLayout(new BorderLayout(16, 0));

        JPanel left = new JPanel(new FlowLayout(FlowLayout.LEFT, 12, 0));
        left.setOpaque(false);

        JLabel logo = UiFactory.createBrandLogoLabel(36);
        logo.setPreferredSize(new Dimension(36, 36));
        left.add(logo);

        JPanel titles = new JPanel(new GridLayout(2, 1, 0, 2));
        titles.setOpaque(false);

        JLabel title = new JLabel("YOUR DASHBOARD");
        title.setFont(new Font("Segoe UI", Font.BOLD, 16));
        title.setForeground(ThemeColors.textPrimary());

        JLabel subtitle = new JLabel("Your photos and files, all fixed up and ready to go.");
        subtitle.setFont(new Font("Segoe UI", Font.PLAIN, 12));
        subtitle.setForeground(ThemeColors.textSecondary());

        titles.add(title);
        titles.add(subtitle);
        left.add(titles);
        card.add(left, BorderLayout.WEST);

        JButton btnStartRestore = UiFactory.createPrimaryButton("Start Restoring →");
        btnStartRestore.setPreferredSize(new Dimension(175, 34));
        btnStartRestore.addActionListener(e -> {
            if (onNavigate != null) {
                onNavigate.accept(AppRoutes.RESTORE);
            }
        });
        card.add(btnStartRestore, BorderLayout.EAST);

        ThemeColors.addThemeListener(() -> {
            title.setForeground(ThemeColors.textPrimary());
            subtitle.setForeground(ThemeColors.textSecondary());
        });

        add(card, BorderLayout.CENTER);
    }
}
