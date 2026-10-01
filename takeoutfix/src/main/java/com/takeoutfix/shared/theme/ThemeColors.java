package com.takeoutfix.shared.theme;

import java.awt.Color;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Dynamic theme manager supporting seamless Light / Dark mode switching.
 * Dracula-inspired palette for Dark mode, neutral modern palette for Light mode.
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
        return dark ? new Color(40, 42, 54) : new Color(248, 250, 252);     // #282a36 vs #f8fafc
    }

    public static Color cardBg() {
        return dark ? new Color(52, 55, 70) : new Color(255, 255, 255);     // #343746 vs #ffffff
    }

    public static Color cardBorder() {
        return dark ? new Color(68, 71, 90) : new Color(226, 232, 240);     // #44475a vs #e2e8f0
    }

    public static Color inputBg() {
        return dark ? new Color(40, 42, 54) : new Color(248, 250, 252);     // #282a36 vs #f8fafc
    }

    public static Color inputBorder() {
        return dark ? new Color(68, 71, 90) : new Color(203, 213, 225);     // #44475a vs #cbd5e1
    }

    public static Color pillBg() {
        return dark ? new Color(68, 71, 90) : new Color(241, 245, 249);     // #44475a vs #f1f5f9
    }

    // Console terminal
    public static Color consoleBg() {
        return dark ? new Color(33, 34, 44) : new Color(15, 23, 42);          // #21222c vs #0f172a
    }

    public static Color consoleText() {
        return dark ? new Color(248, 248, 242) : new Color(241, 245, 249);  // #f8f8f2 vs #f1f5f9
    }

    // Buttons
    public static Color primaryButtonBg() {
        return dark ? new Color(189, 147, 249) : new Color(15, 23, 42);     // #bd93f9 vs #0f172a
    }

    public static Color primaryButtonHover() {
        return dark ? new Color(203, 166, 247) : new Color(30, 41, 59);     // #cba6f7 vs #1e293b
    }

    public static Color primaryButtonText() {
        return dark ? new Color(40, 42, 54) : new Color(255, 255, 255);     // #282a36 vs #ffffff
    }

    public static Color secondaryButtonBg() {
        return pillBg();
    }

    public static Color secondaryButtonText() {
        return textPrimary();
    }

    // Accents
    public static Color accent() {
        return dark ? new Color(189, 147, 249) : new Color(99, 102, 241);    // #bd93f9 vs #6366f1 (Dracula Purple)
    }

    public static Color accentHover() {
        return dark ? new Color(203, 166, 247) : new Color(79, 70, 229);    // #cba6f7 vs #4f46e5
    }

    public static Color accentLight() {
        return dark ? new Color(68, 71, 90) : new Color(238, 242, 255);     // #44475a vs #eef2ff
    }

    // Status Colors
    public static Color success() {
        return dark ? new Color(80, 250, 123) : new Color(16, 185, 129);    // #50fa7b vs #10b981 (Dracula Green)
    }

    public static Color successLight() {
        return dark ? new Color(38, 59, 50) : new Color(236, 253, 245);     // #263b32 vs #ecfdf5
    }

    public static Color warning() {
        return dark ? new Color(241, 250, 140) : new Color(245, 158, 11);    // #f1fa8c vs #f59e0b (Dracula Yellow)
    }

    public static Color warningLight() {
        return dark ? new Color(61, 58, 43) : new Color(254, 243, 199);     // #3d3a2b vs #fef3c7
    }

    public static Color danger() {
        return dark ? new Color(255, 85, 85) : new Color(239, 68, 68);      // #ff5555 vs #ef4444 (Dracula Red)
    }

    public static Color dangerLight() {
        return dark ? new Color(68, 44, 54) : new Color(254, 242, 242);     // #442c36 vs #fef2f2
    }

    // Typography
    public static Color textPrimary() {
        return dark ? new Color(248, 248, 242) : new Color(15, 23, 42);    // #f8f8f2 vs #0f172a
    }

    public static Color textSecondary() {
        return dark ? new Color(196, 197, 206) : new Color(100, 116, 139); // #c4c5ce vs #64748b
    }

    public static Color textMuted() {
        return dark ? new Color(146, 148, 163) : new Color(148, 163, 184); // #9294a3 vs #94a3b8
    }

    // Static default constants for components needing direct constant references (Light mode defaults)
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
