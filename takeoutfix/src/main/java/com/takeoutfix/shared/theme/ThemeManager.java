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
            AppTheme savedTheme = AppTheme.valueOf(saved);
            currentTheme = savedTheme.isDark() ? AppTheme.TAKEOUTFIX_DARK : AppTheme.TAKEOUTFIX_LIGHT;
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
        if (theme == null) return;
        AppTheme selected = theme.isDark() ? AppTheme.TAKEOUTFIX_DARK : AppTheme.TAKEOUTFIX_LIGHT;
        if (selected == currentTheme) return;
        currentTheme = selected;
        try {
            prefs.put(PREF_KEY_THEME, selected.name());
        } catch (Exception ignored) {}

        ThemeColors.setDark(selected.isDark());

        for (Consumer<AppTheme> listener : listeners) {
            try {
                if (Platform.isFxApplicationThread()) {
                    listener.accept(selected);
                } else {
                    Platform.runLater(() -> listener.accept(selected));
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
