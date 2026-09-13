package com.rahul.gui.theme;

import java.awt.Color;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Dynamic theme manager supporting seamless Light / Dark mode switching.
 */
public final class ThemeColors {
    private ThemeColors() {}

    private static boolean dark = false;
    private static final List<Runnable> listeners = new CopyOnWriteArrayList<>();

    public static boolean isDark() {
        return dark;
    }

    public static void setDark(boolean isDarkMode) {
        dark = isDarkMode;
        for (Runnable r : listeners) {
            try { r.run(); } catch (Exception ignored) {}
        }
    }

    public static void addThemeListener(Runnable r) {
        listeners.add(r);
    }

    // Dynamic Canvas & Surface getters
    public static Color canvasBg() {
        return dark ? new Color(13, 13, 18) : new Color(248, 250, 252);     // #0d0d12 vs #f8fafc
    }

    public static Color cardBg() {
        return dark ? new Color(22, 22, 30) : new Color(255, 255, 255);     // #16161e vs #ffffff
    }

    public static Color cardBorder() {
        return dark ? new Color(42, 42, 54) : new Color(226, 232, 240);     // #2a2a36 vs #e2e8f0
    }

    public static Color inputBg() {
        return dark ? new Color(28, 28, 38) : new Color(248, 250, 252);     // #1c1c26 vs #f8fafc
    }

    public static Color inputBorder() {
        return dark ? new Color(55, 55, 70) : new Color(203, 213, 225);     // #373746 vs #cbd5e1
    }

    public static Color pillBg() {
        return dark ? new Color(32, 32, 44) : new Color(241, 245, 249);     // #20202c vs #f1f5f9
    }

    // Console terminal
    public static Color consoleBg() {
        return dark ? new Color(9, 9, 13) : new Color(15, 23, 42);          // #09090d vs #0f172a
    }

    public static Color consoleText() {
        return new Color(226, 232, 240);
    }

    // Buttons
    public static Color primaryButtonBg() {
        return dark ? new Color(244, 244, 245) : new Color(15, 23, 42);
    }

    public static Color primaryButtonHover() {
        return dark ? new Color(220, 220, 225) : new Color(30, 41, 59);
    }

    public static Color primaryButtonText() {
        return dark ? new Color(15, 23, 42) : new Color(255, 255, 255);
    }

    public static Color secondaryButtonBg() {
        return pillBg();
    }

    public static Color secondaryButtonText() {
        return textPrimary();
    }

    // Accents
    public static Color accent() {
        return new Color(99, 102, 241);                                      // #6366f1 (Indigo)
    }

    public static Color accentHover() {
        return new Color(79, 70, 229);                                      // #4f46e5
    }

    public static Color accentLight() {
        return dark ? new Color(38, 35, 68) : new Color(238, 242, 255);
    }

    // Status Colors
    public static Color success() {
        return new Color(16, 185, 129);                                     // #10b981 (Emerald)
    }

    public static Color successLight() {
        return dark ? new Color(8, 46, 32) : new Color(236, 253, 245);
    }

    public static Color warning() {
        return new Color(245, 158, 11);                                     // #f59e0b (Amber)
    }

    public static Color warningLight() {
        return dark ? new Color(55, 38, 12) : new Color(254, 243, 199);
    }

    public static Color danger() {
        return new Color(239, 68, 68);                                      // #ef4444 (Rose)
    }

    public static Color dangerLight() {
        return dark ? new Color(55, 18, 18) : new Color(254, 242, 242);
    }

    // Typography
    public static Color textPrimary() {
        return dark ? new Color(244, 244, 245) : new Color(15, 23, 42);    // #f4f4f5 vs #0f172a
    }

    public static Color textSecondary() {
        return dark ? new Color(161, 161, 170) : new Color(100, 116, 139); // #a1a1aa vs #64748b
    }

    public static Color textMuted() {
        return dark ? new Color(113, 113, 122) : new Color(148, 163, 184); // #71717a vs #94a3b8
    }

    // Static default constants for components needing direct constant references
    public static final Color CANVAS_BG = new Color(248, 250, 252);
    public static final Color CARD_BG = new Color(255, 255, 255);
    public static final Color CARD_BORDER = new Color(226, 232, 240);
    public static final Color INPUT_BG = new Color(248, 250, 252);
    public static final Color INPUT_BORDER = new Color(203, 213, 225);
    public static final Color PILL_BG = new Color(241, 245, 249);
    public static final Color CONSOLE_BG = new Color(15, 23, 42);
    public static final Color CONSOLE_TEXT = new Color(226, 232, 240);
    public static final Color BUTTON_BLACK = new Color(15, 23, 42);
    public static final Color BUTTON_TEXT = new Color(255, 255, 255);
    public static final Color ACCENT = new Color(99, 102, 241);
    public static final Color ACCENT_HOVER = new Color(79, 70, 229);
    public static final Color ACCENT_LIGHT = new Color(238, 242, 255);
    public static final Color SUCCESS = new Color(16, 185, 129);
    public static final Color SUCCESS_LIGHT = new Color(236, 253, 245);
    public static final Color WARNING = new Color(245, 158, 11);
    public static final Color WARNING_LIGHT = new Color(254, 243, 199);
    public static final Color DANGER = new Color(239, 68, 68);
    public static final Color DANGER_LIGHT = new Color(254, 242, 242);
    public static final Color TEXT_PRIMARY = new Color(15, 23, 42);
    public static final Color TEXT_SECONDARY = new Color(100, 116, 139);
    public static final Color TEXT_MUTED = new Color(148, 163, 184);
}
