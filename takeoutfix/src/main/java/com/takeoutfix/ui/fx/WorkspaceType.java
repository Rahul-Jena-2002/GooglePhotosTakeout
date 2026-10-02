package com.takeoutfix.ui.fx;

/**
 * Supported navigation workspaces in TakeoutFix - Google Takeout Restorer.
 * Pure JavaFX modular workspaces.
 */
public enum WorkspaceType {
    TAKEOUT_RESTORE("TakeoutFix - Google Takeout Restorer", "Restore metadata, dates, and JSON sidecars from Google Takeout exports"),
    HISTORY("Activity History", "Inspect past restoration, sync, and editing history logs"),
    SETTINGS("Settings", "Configure user profile, appearance themes, engine, and preferences");

    private final String title;
    private final String subtitle;

    WorkspaceType(String title, String subtitle) {
        this.title = title;
        this.subtitle = subtitle;
    }

    public String getTitle() {
        return title;
    }

    public String getSubtitle() {
        return subtitle;
    }
}
