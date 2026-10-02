package com.takeoutfix.ui.fx;

import com.sun.jna.Library;
import com.sun.jna.Native;
import com.sun.jna.platform.win32.User32;
import com.sun.jna.platform.win32.WinDef.HWND;
import com.sun.jna.ptr.IntByReference;
import com.takeoutfix.shared.theme.AppTheme;
import javafx.application.Platform;
import javafx.stage.Stage;

/**
 * Windows native title bar theming using Desktop Window Manager (DWM) and JNA.
 * Applies DWMWA_USE_IMMERSIVE_DARK_MODE and DWMWA_CAPTION_COLOR dynamically so
 * the native OS window frame matches TakeoutFix's active theme:
 * - Catppuccin Green Forest: Caption #131B17 (COLORREF 0x00171B13), Text #EAF2ED (COLORREF 0x00EDF2EA)
 * - IntelliJ Dark: Caption #1E1F22 (COLORREF 0x00221F1E), Text #DFE1E5 (COLORREF 0x00E5E1DF)
 * - TakeoutFix Dark (Dracula): Caption #21222C (COLORREF 0x002C2221), Text #F8F8F2 (COLORREF 0x00F2F8F8)
 * - Light Themes: Caption #F6F6F8 (COLORREF 0x00F8F6F6), Text #101114 (COLORREF 0x00141110)
 *
 * Safely fails closed on non-Windows platforms.
 */
public final class WindowsTitleBarTheme {

    private static final int DWMWA_USE_IMMERSIVE_DARK_MODE = 20;
    private static final int DWMWA_USE_IMMERSIVE_DARK_MODE_LEGACY = 19;
    private static final int DWMWA_CAPTION_COLOR = 35;
    private static final int DWMWA_TEXT_COLOR = 36;

    // COLORREF format is 0x00BBGGRR
    private static final int DRACULA_CAPTION_COLOR = 0x002C2221; // #21222C
    private static final int DRACULA_TEXT_COLOR    = 0x00F2F8F8; // #F8F8F2

    private static final int FOREST_CAPTION_COLOR  = 0x00171B13; // #131B17 Pine/Conifer Dark
    private static final int FOREST_TEXT_COLOR     = 0x00EDF2EA; // #EAF2ED Sage Light

    private static final int INTELLIJ_CAPTION_COLOR = 0x00221F1E; // #1E1F22 IntelliJ Charcoal
    private static final int INTELLIJ_TEXT_COLOR    = 0x00E5E1DF; // #DFE1E5 IntelliJ Text

    private static final int LIGHT_CAPTION_COLOR   = 0x00F8F6F6; // #F6F6F8
    private static final int LIGHT_TEXT_COLOR      = 0x00141110; // #101114

    private static boolean isWindows = false;
    private static DwmApi dwmApi;

    public interface DwmApi extends Library {
        DwmApi INSTANCE = Native.load("dwmapi", DwmApi.class);
        int DwmSetWindowAttribute(HWND hwnd, int dwAttribute, IntByReference pvAttribute, int cbAttribute);
    }

    static {
        try {
            String os = System.getProperty("os.name", "").toLowerCase();
            if (os.contains("win")) {
                isWindows = true;
                dwmApi = DwmApi.INSTANCE;
            }
        } catch (Throwable ignored) {
            // Silently fall back if native library is unavailable
        }
    }

    private WindowsTitleBarTheme() {}

    /**
     * Applies the current active theme to the native Windows window frame/title bar.
     */
    public static void applyTheme(Stage stage, AppTheme theme) {
        if (!isWindows || dwmApi == null || stage == null) {
            return;
        }

        // Apply immediately and schedule a deferred pass to guarantee HWND binding after stage render
        applyThemeInternal(stage, theme);
        Platform.runLater(() -> applyThemeInternal(stage, theme));
    }

    /**
     * Backward-compatible convenience method.
     */
    public static void applyTheme(Stage stage, boolean dark) {
        applyTheme(stage, dark ? AppTheme.TAKEOUTFIX_DARK : AppTheme.TAKEOUTFIX_LIGHT);
    }

    private static void applyThemeInternal(Stage stage, AppTheme theme) {
        try {
            HWND hwnd = resolveHwnd(stage);
            if (hwnd == null) {
                return;
            }

            boolean dark = (theme == null) || theme.isDark();
            IntByReference darkModeVal = new IntByReference(dark ? 1 : 0);
            int res = dwmApi.DwmSetWindowAttribute(hwnd, DWMWA_USE_IMMERSIVE_DARK_MODE, darkModeVal, 4);
            if (res != 0) {
                dwmApi.DwmSetWindowAttribute(hwnd, DWMWA_USE_IMMERSIVE_DARK_MODE_LEGACY, darkModeVal, 4);
            }

            // Windows 11 DWM Custom Caption and Text Color attributes (0x00BBGGRR format)
            int captionColor;
            int textColor;

            if (theme == AppTheme.CATPPUCCIN_FOREST) {
                captionColor = FOREST_CAPTION_COLOR;
                textColor = FOREST_TEXT_COLOR;
            } else if (theme == AppTheme.INTELLIJ_DARK) {
                captionColor = INTELLIJ_CAPTION_COLOR;
                textColor = INTELLIJ_TEXT_COLOR;
            } else if (theme == AppTheme.TAKEOUTFIX_DARK) {
                captionColor = DRACULA_CAPTION_COLOR;
                textColor = DRACULA_TEXT_COLOR;
            } else {
                captionColor = LIGHT_CAPTION_COLOR;
                textColor = LIGHT_TEXT_COLOR;
            }

            IntByReference captionVal = new IntByReference(captionColor);
            dwmApi.DwmSetWindowAttribute(hwnd, DWMWA_CAPTION_COLOR, captionVal, 4);

            IntByReference textVal = new IntByReference(textColor);
            dwmApi.DwmSetWindowAttribute(hwnd, DWMWA_TEXT_COLOR, textVal, 4);
        } catch (Throwable ignored) {
            // Safe fallback if OS version does not support caption color attributes
        }
    }

    private static HWND resolveHwnd(Stage stage) {
        if (stage == null) return null;

        String title = stage.getTitle();
        if (title != null && !title.isEmpty()) {
            HWND hwnd = User32.INSTANCE.FindWindow(null, title);
            if (hwnd != null) {
                return hwnd;
            }
        }

        // Fallback: enumerate top-level windows matching TakeoutFix or Restorer
        final HWND[] found = new HWND[1];
        try {
            User32.INSTANCE.EnumWindows((hWnd, data) -> {
                char[] buffer = new char[512];
                User32.INSTANCE.GetWindowText(hWnd, buffer, 512);
                String windowTitle = Native.toString(buffer);
                if (windowTitle != null && (windowTitle.contains("TakeoutFix") || windowTitle.contains("Restorer"))) {
                    found[0] = hWnd;
                    return false; // Stop enumeration
                }
                return true;
            }, null);
        } catch (Throwable ignored) {}

        if (found[0] != null) {
            return found[0];
        }

        // Last resort: active foreground window
        try {
            return User32.INSTANCE.GetForegroundWindow();
        } catch (Throwable ignored) {
            return null;
        }
    }
}
