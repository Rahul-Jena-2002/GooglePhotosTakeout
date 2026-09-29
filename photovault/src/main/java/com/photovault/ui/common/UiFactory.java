package com.photovault.ui.common;

import com.photovault.ui.theme.ThemeColors;

import javax.swing.*;
import javax.swing.border.EmptyBorder;
import java.awt.*;
import java.awt.event.MouseAdapter;
import java.awt.event.MouseEvent;

/**
 * Modern UI factory for PhotoVault matching the TakeoutFix glassmorphic aesthetic.
 * All cards use antialiased rendering, specular gradient lighting, and soft shadows.
 */
public final class UiFactory {
    private UiFactory() {}

    // ─── Glassmorphic Card (Smooth curvy radius, translucent surface, soft shadow) ───
    public static JPanel createCard() {
        return createGlassCard(16, new EmptyBorder(16, 20, 16, 20));
    }

    public static JPanel createGlassCard(int cornerRadius, EmptyBorder padding) {
        JPanel card = new JPanel() {
            @Override
            protected void paintComponent(Graphics g) {
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                g2.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
                int w = getWidth();
                int h = getHeight();
                if (w <= 4 || h <= 4) {
                    g2.dispose();
                    return;
                }

                boolean isDark = ThemeColors.isDark();
                int arc = cornerRadius;

                // 1. Soft Ambient Drop Shadow
                int shadowOffset = 3;
                Color sColor1 = isDark ? new Color(0, 0, 0, 75) : new Color(15, 23, 42, 12);
                Color sColor2 = isDark ? new Color(0, 0, 0, 40) : new Color(15, 23, 42, 6);
                g2.setColor(sColor1);
                g2.fillRoundRect(2, shadowOffset + 1, w - 4, h - shadowOffset - 2, arc + 2, arc + 2);
                g2.setColor(sColor2);
                g2.fillRoundRect(1, 1, w - 2, h - 2, arc, arc);

                // 2. Translucent Glass Surface with Specular Gradient
                Color topGlass = isDark
                        ? new Color(22, 28, 42, 240)
                        : new Color(255, 255, 255, 238);
                Color bottomGlass = isDark
                        ? new Color(14, 18, 28, 235)
                        : new Color(248, 250, 252, 220);

                GradientPaint glassGradient = new GradientPaint(0, 0, topGlass, 0, h, bottomGlass);
                g2.setPaint(glassGradient);
                g2.fillRoundRect(1, 1, w - 2, h - shadowOffset - 1, arc, arc);

                // 3. Inner Specular Highlight (subtle rim reflection at top)
                Color rimColor = isDark ? new Color(255, 255, 255, 35) : new Color(255, 255, 255, 175);
                g2.setColor(rimColor);
                g2.setStroke(new BasicStroke(1f));
                g2.drawLine(arc / 2 + 1, 2, w - arc / 2 - 2, 2);

                // 4. Subtle Specular Highlight Border (1px)
                Color topBorder = isDark
                        ? new Color(255, 255, 255, 45)
                        : new Color(255, 255, 255, 235);
                Color bottomBorder = isDark
                        ? new Color(42, 54, 76, 200)
                        : new Color(203, 213, 225, 140);

                GradientPaint borderGradient = new GradientPaint(0, 0, topBorder, 0, h, bottomBorder);
                g2.setPaint(borderGradient);
                g2.drawRoundRect(1, 1, w - 3, h - shadowOffset - 2, arc, arc);

                g2.dispose();
                super.paintComponent(g);
            }
        };
        card.setOpaque(false);
        card.setBorder(padding);
        return card;
    }

    // ─── Smooth Inner Container (replaces sharp squares with 10px rounded panels) ──
    public static JPanel createInnerContainer(int radius) {
        JPanel p = new JPanel() {
            @Override
            protected void paintComponent(Graphics g) {
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                int arc = radius;
                g2.setColor(getBackground());
                g2.fillRoundRect(0, 0, getWidth(), getHeight(), arc, arc);
                g2.setColor(ThemeColors.cardBorder());
                g2.setStroke(new BasicStroke(1f));
                g2.drawRoundRect(0, 0, getWidth() - 1, getHeight() - 1, arc, arc);
                g2.dispose();
                super.paintComponent(g);
            }
        };
        p.setOpaque(false);
        p.setBackground(ThemeColors.pillBg());
        ThemeColors.addThemeListener(() -> {
            p.setBackground(ThemeColors.pillBg());
            p.repaint();
        });
        return p;
    }

    // ─── Primary Button (10px rounded, vibrant indigo gradient & top rim light) ───
    public static JButton createPrimaryButton(String text) {
        JButton btn = new JButton(text) {
            @Override
            protected void paintComponent(Graphics g) {
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                int arc = 10;

                Color bg = isEnabled() ? getBackground() : new Color(55, 65, 81);
                g2.setColor(bg);
                g2.fillRoundRect(0, 0, getWidth(), getHeight(), arc, arc);

                if (isEnabled()) {
                    // Subtle top rim light
                    g2.setColor(new Color(255, 255, 255, 45));
                    g2.drawLine(arc / 2, 1, getWidth() - arc / 2, 1);
                }

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

    // ─── Secondary Button (10px rounded, crisp border and smooth hover) ───────
    public static JButton createSecondaryButton(String text) {
        JButton btn = new JButton(text) {
            @Override
            protected void paintComponent(Graphics g) {
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                int arc = 10;
                g2.setColor(getBackground());
                g2.fillRoundRect(0, 0, getWidth(), getHeight(), arc, arc);
                g2.setColor(ThemeColors.cardBorder());
                g2.setStroke(new BasicStroke(1f));
                g2.drawRoundRect(0, 0, getWidth() - 1, getHeight() - 1, arc, arc);
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

        Runnable updateStyle = () -> {
            btn.setBackground(ThemeColors.secondaryButtonBg());
            btn.setForeground(ThemeColors.secondaryButtonText());
            btn.setBorder(new EmptyBorder(7, 14, 7, 14));
        };
        updateStyle.run();
        ThemeColors.addThemeListener(updateStyle);

        btn.addMouseListener(new MouseAdapter() {
            @Override public void mouseEntered(MouseEvent e) {
                if (btn.isEnabled()) btn.setBackground(new Color(45, 55, 75));
            }
            @Override public void mouseExited(MouseEvent e) {
                if (btn.isEnabled()) btn.setBackground(ThemeColors.secondaryButtonBg());
            }
        });
        return btn;
    }

    // ─── Badge / Pill (Smooth slight curve 8px, dynamic dark mode tinting) ────
    public static JLabel createBadge(String text, Color baseBg, Color baseFg) {
        JLabel badge = new JLabel(text, SwingConstants.CENTER) {
            private Color lightBg = baseBg;
            private Color lightFg = baseFg;

            @Override
            public void setBackground(Color c) {
                this.lightBg = c;
                super.setBackground(c);
            }

            @Override
            public void setForeground(Color c) {
                this.lightFg = c;
                super.setForeground(c);
            }

            @Override
            protected void paintComponent(Graphics g) {
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                boolean dark = ThemeColors.isDark();
                Color fillColor;
                Color borderColor;
                Color effectiveFg = (lightFg != null) ? lightFg : ThemeColors.accent();
                Color effectiveBg = (lightBg != null) ? lightBg : ThemeColors.pillBg();

                if (dark) {
                    int r = effectiveFg.getRed();
                    int gr = effectiveFg.getGreen();
                    int b = effectiveFg.getBlue();
                    fillColor = new Color(Math.max(12, r / 6), Math.max(16, gr / 6), Math.max(24, b / 6), 220);
                    borderColor = new Color(r, gr, b, 120);
                } else {
                    fillColor = effectiveBg;
                    borderColor = new Color(effectiveFg.getRed(), effectiveFg.getGreen(), effectiveFg.getBlue(), 60);
                }
                g2.setColor(fillColor);
                g2.fillRoundRect(0, 0, getWidth(), getHeight(), 8, 8);
                g2.setColor(borderColor);
                g2.setStroke(new BasicStroke(1f));
                g2.drawRoundRect(0, 0, getWidth() - 1, getHeight() - 1, 8, 8);
                g2.dispose();

                if (dark) {
                    float[] hsb = Color.RGBtoHSB(effectiveFg.getRed(), effectiveFg.getGreen(), effectiveFg.getBlue(), null);
                    Color darkFg = Color.getHSBColor(hsb[0], Math.max(0.30f, hsb[1] * 0.75f), Math.max(0.85f, hsb[2]));
                    super.setForeground(darkFg);
                } else {
                    super.setForeground(effectiveFg);
                }
                super.paintComponent(g);
            }
        };
        badge.setOpaque(false);
        badge.setFont(new Font("Segoe UI", Font.BOLD, 10));
        badge.setBorder(new EmptyBorder(3, 9, 3, 9));
        badge.setBackground(baseBg);
        badge.setForeground(baseFg);

        ThemeColors.addThemeListener(badge::repaint);
        return badge;
    }

    // ─── Slim Antialiased Progress Bar ─────────────────────────────────────────
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
        pb.setPreferredSize(new Dimension(100, 8));
        pb.setBorder(new EmptyBorder(0, 0, 0, 0));
        pb.setStringPainted(false);
        pb.setOpaque(false);
        pb.putClientProperty("ProgressBar.arc", 8);

        Runnable updateStyle = () -> {
            pb.setForeground(ThemeColors.accent());
            pb.setBackground(ThemeColors.pillBg());
        };
        updateStyle.run();
        ThemeColors.addThemeListener(updateStyle);
        return pb;
    }
}
