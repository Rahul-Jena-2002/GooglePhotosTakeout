package com.takeoutfix.shared.theme;

/**
 * Top IDE & Application Themes supported natively across Google Takeout Restorer.
 */
public enum AppTheme {
    TAKEOUTFIX_DARK("TakeoutFix Dark", true, "/css/takeoutfix-dark.css", "Modern dark slate aesthetic with purple highlights"),
    TAKEOUTFIX_LIGHT("TakeoutFix Light", false, "/css/takeoutfix-light.css", "Clean, high-contrast daylight theme"),
    CATPPUCCIN_FOREST("Catppuccin Forest", true, "/css/theme-catppuccin-forest.css", "Deep evergreen & pine palette with soothing sage accents"),
    INTELLIJ_DARK("IntelliJ Dark", true, "/css/theme-intellij-dark.css", "JetBrains Darcula / New UI Dark with IntelliJ blue"),
    INTELLIJ_LIGHT("IntelliJ Light", false, "/css/theme-intellij-light.css", "JetBrains New UI Light with clean white cards and blue accent");

    private final String displayName;
    private final boolean dark;
    private final String cssPath;
    private final String description;

    AppTheme(String displayName, boolean dark, String cssPath, String description) {
        this.displayName = displayName;
        this.dark = dark;
        this.cssPath = cssPath;
        this.description = description;
    }

    public String getDisplayName() {
        return displayName;
    }

    public boolean isDark() {
        return dark;
    }

    public String getCssPath() {
        return cssPath;
    }

    public String getDescription() {
        return description;
    }

    @Override
    public String toString() {
        return displayName;
    }

    public static AppTheme fromDisplayName(String name) {
        if (name == null) return TAKEOUTFIX_DARK;
        for (AppTheme t : values()) {
            if (t.displayName.equalsIgnoreCase(name) || t.name().equalsIgnoreCase(name)) {
                return t;
            }
        }
        return TAKEOUTFIX_DARK;
    }
}
