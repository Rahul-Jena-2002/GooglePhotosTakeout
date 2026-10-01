package com.takeoutfix.ui.fx;

/**
 * Supported navigation workspaces in TakeoutFix Studio.
 * Pure JavaFX modular workspaces.
 */
public enum WorkspaceType {
    TAKEOUT_RESTORE("Fix Google Photos", "Restore metadata, dates, and JSON sidecars from Google Takeout exports"),
    DASHBOARD("Overview", "Overview of operations, quotas, hardware telemetry, and quick actions"),
    HISTORY("Activity History", "Inspect past restoration, sync, and editing history logs"),
    SETTINGS("Settings", "Configure application preferences, tool paths, and engine settings");

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
