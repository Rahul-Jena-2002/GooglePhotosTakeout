package com.takeoutfix.shared.theme;

import javafx.application.Platform;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Consumer;
import java.util.prefs.Preferences;

/**
 * Central theme coordinator managing application-wide themes, notifications,
 * and user preferences persistence.
 */
public final class ThemeManager {
    private static final String PREF_KEY_THEME = "app_theme_selected";
    private static final Preferences prefs = Preferences.userNodeForPackage(ThemeManager.class);

    private static AppTheme currentTheme;
    private static final List<Consumer<AppTheme>> listeners = new CopyOnWriteArrayList<>();

    static {
        String saved = prefs.get(PREF_KEY_THEME, AppTheme.TAKEOUTFIX_DARK.name());
        try {
            currentTheme = AppTheme.valueOf(saved);
        } catch (Exception e) {
            currentTheme = AppTheme.TAKEOUTFIX_DARK;
        }
        ThemeColors.setDark(currentTheme.isDark());
    }

    private ThemeManager() {}

    public static AppTheme getCurrentTheme() {
        return currentTheme;
    }

    public static boolean isDark() {
        return currentTheme.isDark();
    }

    public static void setTheme(AppTheme theme) {
        if (theme == null || theme == currentTheme) return;
        currentTheme = theme;
        try {
            prefs.put(PREF_KEY_THEME, theme.name());
        } catch (Exception ignored) {}

        ThemeColors.setDark(theme.isDark());

        for (Consumer<AppTheme> listener : listeners) {
            try {
                if (Platform.isFxApplicationThread()) {
                    listener.accept(theme);
                } else {
                    Platform.runLater(() -> listener.accept(theme));
                }
            } catch (Exception ignored) {}
        }
    }

    public static void toggleDarkLight() {
        if (currentTheme.isDark()) {
            setTheme(AppTheme.TAKEOUTFIX_LIGHT);
        } else {
            setTheme(AppTheme.TAKEOUTFIX_DARK);
        }
    }

    public static void addListener(Consumer<AppTheme> listener) {
        if (listener != null) {
            listeners.add(listener);
        }
    }

    public static void removeListener(Consumer<AppTheme> listener) {
        listeners.remove(listener);
    }
}
