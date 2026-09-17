package com.takeoutfix.gui.components;

import com.takeoutfix.gui.theme.ThemeColors;

import javax.swing.*;
import javax.swing.border.AbstractBorder;
import javax.swing.border.EmptyBorder;
import java.awt.*;
import java.awt.event.MouseAdapter;
import java.awt.event.MouseEvent;

/**
 * Modern UI factory — all components use antialiased custom painting.
 * Zero LineBorder / square edges anywhere.
 */
public final class UiFactory {
    private UiFactory() {}

    // ─── Rounded Border (replaces every LineBorder) ─────────────────────────
    public static class RoundedBorder extends AbstractBorder {
        private final Color color;
        private final int radius;
        private final int thickness;
        private final Insets insets;

        public RoundedBorder(Color color, int radius, int thickness, Insets insets) {
            this.color = color;
            this.radius = radius;
            this.thickness = thickness;
            this.insets = insets;
        }

        @Override
        public void paintBorder(Component c, Graphics g, int x, int y, int w, int h) {
            Graphics2D g2 = (Graphics2D) g.create();
            g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            g2.setStroke(new BasicStroke(thickness));
            g2.setColor(color);
            g2.drawRoundRect(x + thickness / 2, y + thickness / 2,
                    w - thickness, h - thickness, radius, radius);
            g2.dispose();
        }

        @Override
        public Insets getBorderInsets(Component c) { return insets; }
        @Override
        public Insets getBorderInsets(Component c, Insets i) {
            i.set(insets.top, insets.left, insets.bottom, insets.right);
            return i;
        }
    }

    // ─── Card ────────────────────────────────────────────────────────────────
    public static JPanel createCard() {
        JPanel card = new JPanel() {
            @Override
            protected void paintComponent(Graphics g) {
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                g2.setColor(getBackground());
                g2.fillRoundRect(1, 1, getWidth() - 2, getHeight() - 2, 16, 16);
                g2.setColor(ThemeColors.cardBorder());
                g2.setStroke(new BasicStroke(1f));
                g2.drawRoundRect(1, 1, getWidth() - 2, getHeight() - 2, 16, 16);
                g2.dispose();
                super.paintComponent(g);
            }
        };
        card.setOpaque(false);
        card.putClientProperty("FlatLaf.style", "arc: 16");
        updateCardStyle(card);
        ThemeColors.addThemeListener(() -> {
            updateCardStyle(card);
            card.repaint();
        });
        return card;
    }

    private static void updateCardStyle(JPanel card) {
        card.setBackground(ThemeColors.cardBg());
        card.setBorder(new EmptyBorder(14, 18, 14, 18));
    }

    // ─── Primary Button ───────────────────────────────────────────────────────
    public static JButton createPrimaryButton(String text) {
        JButton btn = new JButton(text) {
            @Override
            protected void paintComponent(Graphics g) {
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                g2.setColor(getBackground());
                g2.fillRoundRect(0, 0, getWidth(), getHeight(), 20, 20);
                g2.dispose();
                super.paintComponent(g);
            }
        };
        btn.setContentAreaFilled(false);
        btn.setOpaque(false);
        btn.setFont(new Font("Segoe UI", Font.BOLD, 12));
        btn.setFocusPainted(false);
        btn.setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
        btn.putClientProperty("JButton.buttonType", "roundRect");
        btn.putClientProperty("FlatLaf.style", "arc: 20");

        Runnable updateStyle = () -> {
            btn.setBackground(ThemeColors.primaryButtonBg());
            btn.setForeground(ThemeColors.primaryButtonText());
            btn.setBorder(new EmptyBorder(8, 18, 8, 18));
        };
        updateStyle.run();
        ThemeColors.addThemeListener(updateStyle);

        btn.addMouseListener(new MouseAdapter() {
            @Override public void mouseEntered(MouseEvent e) {
                if (btn.isEnabled()) btn.setBackground(ThemeColors.primaryButtonHover());
            }
            @Override public void mouseExited(MouseEvent e) {
                if (btn.isEnabled()) btn.setBackground(ThemeColors.primaryButtonBg());
            }
        });
        return btn;
    }

    // ─── Secondary Button ─────────────────────────────────────────────────────
    public static JButton createSecondaryButton(String text) {
        JButton btn = new JButton(text) {
            @Override
            protected void paintComponent(Graphics g) {
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                g2.setColor(getBackground());
                g2.fillRoundRect(0, 0, getWidth(), getHeight(), 20, 20);
                g2.setColor(ThemeColors.cardBorder());
                g2.setStroke(new BasicStroke(1f));
                g2.drawRoundRect(0, 0, getWidth() - 1, getHeight() - 1, 20, 20);
                g2.dispose();
                super.paintComponent(g);
            }
        };
        btn.setContentAreaFilled(false);
        btn.setOpaque(false);
        btn.setFont(new Font("Segoe UI", Font.BOLD, 11));
        btn.setFocusPainted(false);
        btn.setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
        btn.putClientProperty("JButton.buttonType", "roundRect");
        btn.putClientProperty("FlatLaf.style", "arc: 20");

        Runnable updateStyle = () -> {
            btn.setBackground(ThemeColors.secondaryButtonBg());
            btn.setForeground(ThemeColors.secondaryButtonText());
            btn.setBorder(new EmptyBorder(7, 14, 7, 14));
        };
        updateStyle.run();
        ThemeColors.addThemeListener(updateStyle);

        btn.addMouseListener(new MouseAdapter() {
            @Override public void mouseEntered(MouseEvent e) {
                if (btn.isEnabled()) btn.setBackground(ThemeColors.isDark() ? new Color(45, 45, 60) : new Color(226, 232, 240));
            }
            @Override public void mouseExited(MouseEvent e) {
                if (btn.isEnabled()) btn.setBackground(ThemeColors.secondaryButtonBg());
            }
        });
        return btn;
    }

    // ─── Text Field ───────────────────────────────────────────────────────────
    public static JTextField createTextField(String placeholder) {
        JTextField tf = new JTextField() {
            @Override protected void paintComponent(Graphics g) {
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                g2.setColor(getBackground());
                g2.fillRoundRect(0, 0, getWidth(), getHeight(), 12, 12);
                g2.dispose();
                super.paintComponent(g);
            }
            @Override protected void paintBorder(Graphics g) {
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                g2.setColor(ThemeColors.inputBorder());
                g2.setStroke(new BasicStroke(1f));
                g2.drawRoundRect(0, 0, getWidth() - 1, getHeight() - 1, 12, 12);
                g2.dispose();
            }
        };
        tf.setOpaque(false);
        tf.setFont(new Font("Segoe UI", Font.PLAIN, 12));
        tf.setToolTipText(placeholder);
        tf.putClientProperty("FlatLaf.style", "arc: 12");

        Runnable updateStyle = () -> {
            tf.setBackground(ThemeColors.inputBg());
            tf.setForeground(ThemeColors.textPrimary());
            tf.setCaretColor(ThemeColors.textPrimary());
            tf.setBorder(new EmptyBorder(8, 12, 8, 12));
        };
        updateStyle.run();
        ThemeColors.addThemeListener(updateStyle);
        return tf;
    }

    // ─── Badge / Pill ────────────────────────────────────────────────────────
    public static JLabel createBadge(String text, Color bg, Color fg) {
        JLabel badge = new JLabel(text, SwingConstants.CENTER) {
            @Override protected void paintComponent(Graphics g) {
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                g2.setColor(getBackground());
                g2.fillRoundRect(0, 0, getWidth(), getHeight(), getHeight(), getHeight());
                g2.dispose();
                super.paintComponent(g);
            }
        };
        badge.setOpaque(false);
        badge.setFont(new Font("Segoe UI", Font.BOLD, 10));
        badge.setBackground(bg);
        badge.setForeground(fg);
        badge.setBorder(new EmptyBorder(3, 9, 3, 9));
        return badge;
    }

    // ─── Progress Bar ────────────────────────────────────────────────────────
    public static JProgressBar createSlimProgressBar() {
        JProgressBar pb = new JProgressBar(0, 100) {
            @Override protected void paintComponent(Graphics g) {
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                int r = getHeight();
                // Track
                g2.setColor(getBackground());
                g2.fillRoundRect(0, 0, getWidth(), getHeight(), r, r);
                // Fill
                if (getValue() > 0) {
                    int fillW = (int) ((getWidth() - 2) * ((double) getValue() / getMaximum()));
                    g2.setColor(getForeground());
                    g2.fillRoundRect(1, 1, Math.max(fillW, r), getHeight() - 2, r - 2, r - 2);
                }
                g2.dispose();
            }
        };
        pb.setValue(0);
        pb.setPreferredSize(new Dimension(100, 7));
        pb.setBorder(new EmptyBorder(0, 0, 0, 0));
        pb.setStringPainted(false);
        pb.setOpaque(false);
        pb.putClientProperty("ProgressBar.arc", 7);
        pb.putClientProperty("FlatLaf.style", "arc: 7");

        Runnable updateStyle = () -> {
            pb.setForeground(ThemeColors.accent());
            pb.setBackground(ThemeColors.pillBg());
        };
        updateStyle.run();
        ThemeColors.addThemeListener(updateStyle);
        return pb;
    }

    // ─── Stat Tile (plain, for legacy use) ───────────────────────────────────
    public static JPanel createStatTile(String label, JLabel valueLabel, Color accentColor) {
        JPanel tile = new JPanel(new BorderLayout(4, 4)) {
            @Override protected void paintComponent(Graphics g) {
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                g2.setColor(getBackground());
                g2.fillRoundRect(0, 0, getWidth() - 1, getHeight() - 1, 12, 12);
                g2.setColor(ThemeColors.cardBorder());
                g2.setStroke(new BasicStroke(1f));
                g2.drawRoundRect(0, 0, getWidth() - 1, getHeight() - 1, 12, 12);
                g2.dispose();
                super.paintComponent(g);
            }
        };
        tile.setOpaque(false);
        tile.setBorder(new EmptyBorder(10, 14, 10, 14));

        JLabel lbl = new JLabel(label);
        lbl.setFont(new Font("Segoe UI", Font.BOLD, 10));
        valueLabel.setFont(new Font("Segoe UI", Font.BOLD, 15));
        valueLabel.setForeground(accentColor);

        Runnable updateStyle = () -> {
            tile.setBackground(ThemeColors.pillBg());
            lbl.setForeground(ThemeColors.textMuted());
            tile.repaint();
        };
        updateStyle.run();
        ThemeColors.addThemeListener(updateStyle);

        tile.add(lbl, BorderLayout.NORTH);
        tile.add(valueLabel, BorderLayout.CENTER);
        return tile;
    }

    // ─── Tinted Stat Tile (2x2 grid in command center) ───────────────────────
    public static JPanel createTintedStatTile(String label, JLabel valueLabel,
                                              Color lightBg, Color darkBg,
                                              Color lightBorder, Color darkBorder,
                                              Color lightFg, Color darkFg) {
        JPanel tile = new JPanel(new BorderLayout(4, 4)) {
            @Override protected void paintComponent(Graphics g) {
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                g2.setColor(getBackground());
                g2.fillRoundRect(0, 0, getWidth() - 1, getHeight() - 1, 14, 14);
                Color border = ThemeColors.isDark() ? darkBorder : lightBorder;
                g2.setColor(border);
                g2.setStroke(new BasicStroke(1f));
                g2.drawRoundRect(0, 0, getWidth() - 1, getHeight() - 1, 14, 14);
                g2.dispose();
                super.paintComponent(g);
            }
        };
        tile.setOpaque(false);
        tile.setBorder(new EmptyBorder(10, 14, 10, 14));

        JLabel lbl = new JLabel(label);
        lbl.setFont(new Font("Segoe UI", Font.BOLD, 10));

        valueLabel.setFont(new Font("Segoe UI", Font.BOLD, 16));

        Runnable updateStyle = () -> {
            tile.setBackground(ThemeColors.isDark() ? darkBg : lightBg);
            Color fg = ThemeColors.isDark() ? darkFg : lightFg;
            lbl.setForeground(fg);
            valueLabel.setForeground(fg);
            tile.repaint();
        };
        updateStyle.run();
        ThemeColors.addThemeListener(updateStyle);

        tile.add(lbl, BorderLayout.NORTH);
        tile.add(valueLabel, BorderLayout.CENTER);
        return tile;
    }

    // ─── Rounded Logo badge ───────────────────────────────────────────────────
    /** Creates a small pill-shaped logo badge (e.g. "TF") with full rounded corners. */
    public static JLabel createLogoBadge(String text, Color bg, Color fg) {
        JLabel lbl = new JLabel(text, SwingConstants.CENTER) {
            @Override protected void paintComponent(Graphics g) {
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                g2.setColor(getBackground());
                g2.fillRoundRect(0, 0, getWidth(), getHeight(), 10, 10);
                g2.dispose();
                super.paintComponent(g);
            }
        };
        lbl.setOpaque(false);
        lbl.setFont(new Font("Segoe UI", Font.BOLD, 13));
        lbl.setBackground(bg);
        lbl.setForeground(fg);
        lbl.setBorder(new EmptyBorder(3, 8, 3, 8));
        return lbl;
    }

    // ─── Smooth rounded pill panel ────────────────────────────────────────────
    /** A panel that paints itself as a fully-rounded pill with a border. */
    public static JPanel createPillPanel(int radius) {
        JPanel pill = new JPanel() {
            @Override protected void paintComponent(Graphics g) {
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                g2.setColor(getBackground());
                g2.fillRoundRect(0, 0, getWidth(), getHeight(), radius, radius);
                g2.setColor(ThemeColors.cardBorder());
                g2.setStroke(new BasicStroke(1f));
                g2.drawRoundRect(0, 0, getWidth() - 1, getHeight() - 1, radius, radius);
                g2.dispose();
                super.paintComponent(g);
            }
        };
        pill.setOpaque(false);
        return pill;
    }
}
