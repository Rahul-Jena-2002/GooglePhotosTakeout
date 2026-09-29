package com.takeoutfix.ui.startup;

import com.takeoutfix.shared.theme.ThemeColors;
import com.takeoutfix.shared.ui.UiFactory;

import javax.swing.*;
import javax.swing.border.EmptyBorder;
import java.awt.*;

/**
 * Modern startup/loading state view for TakeoutFix.
 *
 * Displayed immediately when the application launches while
 * SessionManager silently restores the session against the backend.
 */
public class LoadingView extends JPanel {

    private final JLabel statusLabel;
    private final JProgressBar progressBar;

    public LoadingView() {
        setLayout(new GridBagLayout());
        setBackground(ThemeColors.canvasBg());
        setBorder(new EmptyBorder(40, 40, 40, 40));

        JPanel card = new JPanel();
        card.setLayout(new BoxLayout(card, BoxLayout.Y_AXIS));
        card.setOpaque(false);
        card.setAlignmentX(Component.CENTER_ALIGNMENT);

        // 1. Brand Logo
        JLabel logo = UiFactory.createBrandLogoLabel(56);
        logo.setAlignmentX(Component.CENTER_ALIGNMENT);
        card.add(logo);
        card.add(Box.createVerticalStrut(18));

        // 2. App Name & Tagline
        JLabel title = new JLabel("TakeoutFix");
        title.setFont(new Font("Segoe UI", Font.BOLD, 24));
        title.setForeground(ThemeColors.textPrimary());
        title.setAlignmentX(Component.CENTER_ALIGNMENT);
        card.add(title);
        card.add(Box.createVerticalStrut(6));

        JLabel subtitle = new JLabel("Restore your digital life.");
        subtitle.setFont(new Font("Segoe UI", Font.PLAIN, 13));
        subtitle.setForeground(ThemeColors.textSecondary());
        subtitle.setAlignmentX(Component.CENTER_ALIGNMENT);
        card.add(subtitle);
        card.add(Box.createVerticalStrut(28));

        // 3. Smooth Progress Bar
        progressBar = new JProgressBar();
        progressBar.setIndeterminate(true);
        progressBar.setPreferredSize(new Dimension(240, 4));
        progressBar.setMaximumSize(new Dimension(240, 4));
        progressBar.setAlignmentX(Component.CENTER_ALIGNMENT);
        card.add(progressBar);
        card.add(Box.createVerticalStrut(14));

        // 4. Status Indicator
        statusLabel = new JLabel("Initializing TakeoutFix...", SwingConstants.CENTER);
        statusLabel.setFont(new Font("Segoe UI", Font.PLAIN, 12));
        statusLabel.setForeground(ThemeColors.textMuted());
        statusLabel.setAlignmentX(Component.CENTER_ALIGNMENT);
        card.add(statusLabel);

        add(card);

        ThemeColors.addThemeListener(() -> {
            setBackground(ThemeColors.canvasBg());
            title.setForeground(ThemeColors.textPrimary());
            subtitle.setForeground(ThemeColors.textSecondary());
            statusLabel.setForeground(ThemeColors.textMuted());
            repaint();
        });
    }

    public void setStatus(String text) {
        SwingUtilities.invokeLater(() -> statusLabel.setText(text));
    }
}
