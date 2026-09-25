package com.takeoutfix.shared.ui;

import com.takeoutfix.shared.theme.ThemeColors;

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

    // ─── Glassmorphic Card (Smooth curvy radius 20px, translucent surface, soft shadow) ───
    public static JPanel createCard() {
        return createGlassCard(20, new EmptyBorder(14, 18, 14, 18));
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

    // ─── Smooth Inner Container (replaces sharp squares with 12px rounded panels) ──
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

    // ─── Primary Button (Smooth slight curve 10px, subtle gradient & shadow) ───
    public static JButton createPrimaryButton(String text) {
        JButton btn = new JButton(text) {
            @Override
            protected void paintComponent(Graphics g) {
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                int arc = 10;
                g2.setColor(getBackground());
                g2.fillRoundRect(0, 0, getWidth(), getHeight(), arc, arc);

                // Subtle top rim light
                g2.setColor(new Color(255, 255, 255, ThemeColors.isDark() ? 30 : 50));
                g2.drawLine(arc / 2, 1, getWidth() - arc / 2, 1);

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
            btn.setBorder(new EmptyBorder(8, 16, 8, 16));
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

    // ─── Secondary Button (Smooth slight curve 10px, crisp 1px border) ───────
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
                if (btn.isEnabled()) btn.setBackground(ThemeColors.isDark() ? new Color(45, 45, 60) : new Color(226, 232, 240));
            }
            @Override public void mouseExited(MouseEvent e) {
                if (btn.isEnabled()) btn.setBackground(ThemeColors.secondaryButtonBg());
            }
        });
        return btn;
    }

    // ─── Text Field (Smooth slight curve 10px) ────────────────────────────────
    public static JTextField createTextField(String placeholder) {
        JTextField tf = new JTextField() {
            @Override protected void paintComponent(Graphics g) {
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                g2.setColor(getBackground());
                g2.fillRoundRect(0, 0, getWidth(), getHeight(), 10, 10);
                g2.dispose();
                super.paintComponent(g);
            }
            @Override protected void paintBorder(Graphics g) {
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                g2.setColor(ThemeColors.inputBorder());
                g2.setStroke(new BasicStroke(1f));
                g2.drawRoundRect(0, 0, getWidth() - 1, getHeight() - 1, 10, 10);
                g2.dispose();
            }
        };
        tf.setOpaque(false);
        tf.setFont(new Font("Segoe UI", Font.PLAIN, 12));
        tf.setToolTipText(placeholder);

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

    public static JPasswordField createPasswordField(String placeholder) {
        JPasswordField pf = new JPasswordField() {
            @Override protected void paintComponent(Graphics g) {
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                g2.setColor(getBackground());
                g2.fillRoundRect(0, 0, getWidth(), getHeight(), 10, 10);
                g2.dispose();
                super.paintComponent(g);
            }
            @Override protected void paintBorder(Graphics g) {
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                g2.setColor(ThemeColors.inputBorder());
                g2.setStroke(new BasicStroke(1f));
                g2.drawRoundRect(0, 0, getWidth() - 1, getHeight() - 1, 10, 10);
                g2.dispose();
            }
        };
        pf.setOpaque(false);
        pf.setFont(new Font("Segoe UI", Font.PLAIN, 12));
        pf.setToolTipText(placeholder);

        Runnable updateStyle = () -> {
            pf.setBackground(ThemeColors.inputBg());
            pf.setForeground(ThemeColors.textPrimary());
            pf.setCaretColor(ThemeColors.textPrimary());
            pf.setBorder(new EmptyBorder(8, 12, 8, 12));
        };
        updateStyle.run();
        ThemeColors.addThemeListener(updateStyle);
        return pf;
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
                g2.fillRoundRect(0, 0, getWidth() - 1, getHeight() - 1, 16, 16);
                Color border = ThemeColors.isDark() ? darkBorder : lightBorder;
                g2.setColor(border);
                g2.setStroke(new BasicStroke(1f));
                g2.drawRoundRect(0, 0, getWidth() - 1, getHeight() - 1, 16, 16);
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

    // ─── SVG Icon loader (FlatLaf Extras) ────────────────────────────────────
    /**
     * Loads a scalable SVG icon from the classpath ({@code /icons/<name>.svg}).
     * Automatically adapts its stroke color to dark / light mode.
     */
    public static javax.swing.Icon svgIcon(String name, float sizePx) {
        return svgDynamicIcon(name, sizePx, () -> ThemeColors.isDark() ? new Color(226, 232, 240) : new Color(30, 41, 59));
    }

    /**
     * Loads a scalable SVG icon tinted to an explicit Color.
     */
    public static javax.swing.Icon svgIcon(String name, float sizePx, Color tint) {
        if (tint == null) {
            return svgIcon(name, sizePx);
        }
        return svgDynamicIcon(name, sizePx, () -> tint);
    }

    /**
     * Loads a scalable SVG icon with a dynamic Color supplier evaluated on every repaint.
     */
    public static javax.swing.Icon svgDynamicIcon(String name, float sizePx, java.util.function.Supplier<Color> colorSupplier) {
        try {
            java.net.URL url = UiFactory.class.getResource("/icons/" + name + ".svg");
            if (url == null) return null;
            com.formdev.flatlaf.extras.FlatSVGIcon icon = new com.formdev.flatlaf.extras.FlatSVGIcon(url);
            icon.setColorFilter(new com.formdev.flatlaf.extras.FlatSVGIcon.ColorFilter(color -> {
                Color c = colorSupplier != null ? colorSupplier.get() : null;
                if (c != null) return c;
                return ThemeColors.isDark() ? new Color(226, 232, 240) : new Color(30, 41, 59);
            }));
            return icon.derive(Math.round(sizePx), Math.round(sizePx));
        } catch (Throwable t) {
            return null; // flatlaf-extras not in classpath — safe no-op
        }
    }

    /**
     * Creates a small square icon-only secondary button (e.g. for a calendar or clear button).
     * Automatically inverts SVG icon color on dark/light mode switches.
     */
    public static JButton createIconButton(String svgName, String fallbackText, String tooltip) {
        JButton btn = createSecondaryButton(fallbackText);
        javax.swing.Icon icon = svgDynamicIcon(svgName, 15, () -> ThemeColors.secondaryButtonText());
        if (icon != null) {
            btn.setIcon(icon);
            btn.setText("");
        }
        btn.setToolTipText(tooltip);
        btn.setPreferredSize(new Dimension(34, 32));
        btn.setMargin(new Insets(2, 4, 2, 4));
        return btn;
    }

    /**
     * Loads and scales the brand icon from {@code /icons/icon.png} classpath resource.
     * Returns a smooth {@link java.awt.Image} at the given pixel size, or {@code null}.
     */
    public static java.awt.Image appIconImage(int size) {
        try (java.io.InputStream is = UiFactory.class.getResourceAsStream("/icons/icon.png")) {
            if (is == null) return null;
            java.awt.Image img = java.awt.Toolkit.getDefaultToolkit().createImage(is.readAllBytes());
            return img.getScaledInstance(size, size, java.awt.Image.SCALE_SMOOTH);
        } catch (Throwable t) {
            return null;
        }
    }

    /**
     * Creates a brand logo {@link JLabel} showing the real app icon PNG scaled to {@code size}×{@code size} px.
     * Falls back to the text pill badge ("TF") if the image cannot be loaded.
     */
    public static JLabel createBrandLogoLabel(int size) {
        java.awt.Image img = appIconImage(size);
        if (img != null) {
            JLabel lbl = new JLabel(new javax.swing.ImageIcon(img));
            lbl.setPreferredSize(new java.awt.Dimension(size, size));
            lbl.setOpaque(false);
            return lbl;
        }
        // Graceful fallback — text pill
        return createLogoBadge("TF", new Color(99, 102, 241), Color.WHITE);
    }

    /**
     * Returns a multi-resolution list of icons from {@code /icons/icon.png}
     * for high-DPI title bars, taskbars, and Alt-Tab switchers.
     */
    public static java.util.List<java.awt.Image> getAppIconImages() {
        java.util.List<java.awt.Image> icons = new java.util.ArrayList<>();
        int[] sizes = {16, 24, 32, 48, 64, 128, 256};
        for (int s : sizes) {
            java.awt.Image img = appIconImage(s);
            if (img != null) {
                icons.add(img);
            }
        }
        return icons;
    }

    /**
     * Applies brand icon across window title bars, taskbar entries, and OS docks.
     */
    public static void applyAppIcon(java.awt.Window window) {
        if (window == null) return;
        java.util.List<java.awt.Image> icons = getAppIconImages();
        if (!icons.isEmpty()) {
            window.setIconImages(icons);
        }
        try {
            if (java.awt.Taskbar.isTaskbarSupported()) {
                java.awt.Taskbar taskbar = java.awt.Taskbar.getTaskbar();
                if (taskbar.isSupported(java.awt.Taskbar.Feature.ICON_IMAGE)) {
                    java.awt.Image icon256 = appIconImage(256);
                    if (icon256 != null) {
                        taskbar.setIconImage(icon256);
                    }
                }
            }
        } catch (Throwable ignored) {
            // Taskbar feature not supported or accessible on this platform
        }
    }
}


