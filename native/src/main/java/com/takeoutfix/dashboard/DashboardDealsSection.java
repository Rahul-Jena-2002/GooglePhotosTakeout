package com.takeoutfix.dashboard;

import com.takeoutfix.shared.ui.UiFactory;
import com.takeoutfix.shared.theme.ThemeColors;
import com.takeoutfix.ads.AdSyncService;

import javax.swing.*;
import javax.swing.border.EmptyBorder;
import java.awt.*;
import java.awt.event.MouseAdapter;
import java.awt.event.MouseEvent;
import java.util.List;

/**
 * Recommended Hardware & NVMe storage deals card.
 * Dynamically synchronized from backend Firestore via AdSyncService.
 * Features real product thumbnails with smooth rounded borders and direct Amazon integration.
 */
public class DashboardDealsSection extends JPanel {

    private final AdSyncService adSyncService;
    private final JPanel dealsContainer;

    public DashboardDealsSection(AdSyncService adSyncService) {
        super(new BorderLayout());
        setOpaque(false);
        this.adSyncService = adSyncService;

        JPanel card = UiFactory.createCard();
        card.setLayout(new BorderLayout(0, 12));

        // Simple Header Row
        JPanel head = new JPanel(new BorderLayout());
        head.setOpaque(false);

        JLabel lblTitle = new JLabel("ADS & AFFILIATE LINKS");
        lblTitle.setFont(new Font("Segoe UI", Font.BOLD, 11));
        lblTitle.setForeground(ThemeColors.textMuted());
        head.add(lblTitle, BorderLayout.WEST);
        card.add(head, BorderLayout.NORTH);

        // Dynamic Deals Container
        dealsContainer = new JPanel();
        dealsContainer.setOpaque(false);
        card.add(dealsContainer, BorderLayout.CENTER);

        ThemeColors.addThemeListener(() -> {
            lblTitle.setForeground(ThemeColors.textMuted());
        });

        add(card, BorderLayout.CENTER);

        // Connect directly to live backend Firestore synchronization
        if (adSyncService != null) {
            adSyncService.addListener(this::updateAds);
        } else {
            updateAds(java.util.Collections.emptyList());
        }
    }

    public void updateAds(List<AdSyncService.AdItem> ads) {
        SwingUtilities.invokeLater(() -> {
            dealsContainer.removeAll();

            List<AdSyncService.AdItem> list = (ads != null && !ads.isEmpty())
                    ? ads
                    : (adSyncService != null ? adSyncService.getActiveAds() : java.util.Collections.emptyList());

            int displayCount = Math.min(list.size(), 6);
            if (displayCount <= 0) {
                setVisible(false);
                dealsContainer.setLayout(new FlowLayout());
                dealsContainer.revalidate();
                dealsContainer.repaint();
                return;
            }
            setVisible(true);

            // Exactly 1 row × up to 6 columns
            int cols = Math.min(displayCount, 6);
            dealsContainer.setLayout(new GridLayout(1, cols, 8, 8));
            for (int i = 0; i < displayCount; i++) {
                dealsContainer.add(createDealTile(list.get(i)));
            }

            dealsContainer.revalidate();
            dealsContainer.repaint();
        });
    }

    private JPanel createDealTile(AdSyncService.AdItem ad) {
        JPanel tile = new JPanel(new BorderLayout(8, 0)) {
            private boolean hovered = false;
            {
                addMouseListener(new MouseAdapter() {
                    @Override public void mouseEntered(MouseEvent e) { hovered = true; repaint(); }
                    @Override public void mouseExited(MouseEvent e) { hovered = false; repaint(); }
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
                // Subtle reduced opacity background — soft and non-intrusive
                Color bg;
                Color border;
                if (dark) {
                    bg = hovered ? new Color(26, 34, 50, 180) : new Color(18, 23, 34, 130);
                    border = hovered ? new Color(55, 70, 98, 140) : new Color(34, 44, 62, 90);
                } else {
                    bg = hovered ? new Color(235, 240, 248, 190) : new Color(241, 245, 249, 140);
                    border = hovered ? new Color(203, 213, 225, 180) : new Color(226, 232, 240, 110);
                }
                g2.setColor(bg);
                g2.fillRoundRect(0, 0, getWidth(), getHeight(), 8, 8);
                g2.setColor(border);
                g2.setStroke(new BasicStroke(1f));
                g2.drawRoundRect(0, 0, getWidth() - 1, getHeight() - 1, 8, 8);
                g2.dispose();
                super.paintComponent(g);
            }
        };
        tile.setOpaque(false);
        tile.setBorder(new EmptyBorder(10, 10, 10, 10));
        tile.setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
        tile.setToolTipText("Open: " + ad.title());

        // 1. Asynchronous rounded thumbnail (only rendered if image loads successfully)
        if (ad.imageUrl() != null && !ad.imageUrl().isBlank()) {
            JLabel img = new JLabel();
            img.setOpaque(false);
            img.setPreferredSize(new Dimension(42, 42));
            img.setHorizontalAlignment(SwingConstants.CENTER);
            img.setVerticalAlignment(SwingConstants.CENTER);
            AdSyncService.loadThumbnailAsync(ad.imageUrl(), 42, 42, icon -> {
                if (icon != null) {
                    img.setIcon(icon);
                    tile.add(img, BorderLayout.WEST);
                    tile.revalidate();
                    tile.repaint();
                }
            });
        }

        // 2. Center details (Top row: tag + discount; Bottom row: title)
        JPanel details = new JPanel(new GridLayout(2, 1, 0, 3));
        details.setOpaque(false);

        JPanel topRow = new JPanel(new BorderLayout(4, 0));
        topRow.setOpaque(false);

        String tagText = ad.tag().isBlank() ? "Ad" : ad.tag();
        if (tagText.length() > 14) tagText = tagText.substring(0, 12) + "..";
        JLabel tag = new JLabel(tagText);
        tag.setFont(new Font("Segoe UI", Font.PLAIN, 9));
        tag.setForeground(ThemeColors.textMuted());
        topRow.add(tag, BorderLayout.WEST);

        if (!ad.discount().isBlank()) {
            JLabel disc = new JLabel(ad.discount());
            disc.setFont(new Font("Segoe UI", Font.BOLD, 9));
            disc.setForeground(ThemeColors.success());
            topRow.add(disc, BorderLayout.EAST);
        }
        details.add(topRow);

        String trimmedTitle = ad.title() != null ? ad.title().trim() : "";
        if (trimmedTitle.length() > 24) {
            trimmedTitle = trimmedTitle.substring(0, 22).trim() + "...";
        }
        JLabel title = new JLabel(trimmedTitle);
        title.setFont(new Font("Segoe UI", Font.PLAIN, 10));
        title.setForeground(ThemeColors.textSecondary());
        details.add(title);

        tile.add(details, BorderLayout.CENTER);

        // 3. Compact subtle link arrow
        JLabel arrow = new JLabel("↗");
        arrow.setFont(new Font("Segoe UI", Font.PLAIN, 10));
        arrow.setForeground(ThemeColors.textMuted());
        arrow.setBorder(new EmptyBorder(0, 2, 0, 0));
        tile.add(arrow, BorderLayout.EAST);

        ThemeColors.addThemeListener(() -> {
            tag.setForeground(ThemeColors.textMuted());
            title.setForeground(ThemeColors.textSecondary());
            arrow.setForeground(ThemeColors.textMuted());
            tile.repaint();
        });

        return tile;
    }
}
