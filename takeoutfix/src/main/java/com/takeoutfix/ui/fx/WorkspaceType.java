package com.takeoutfix.ui.fx;

/**
 * Supported navigation workspaces in TakeoutFix Studio.
 * Pure JavaFX modular workspaces.
 */
public enum WorkspaceType {
    TAKEOUT_RESTORE("Fix Google Photos", "Restore metadata, dates, and JSON sidecars from Google Takeout exports"),
    PHOTO_STUDIO("Edit Metadata", "Batch-adjust photo dates, correct time zones, update GPS information and manage metadata across multiple files"),
    METASYNC("Sync Photo Details", "Synchronize and transfer metadata across RAW, JPEG and sidecar files"),
    PHOTOVAULT("Private Photo Vault", "Secure local private vault to safeguard and verify your private photos"),
    DASHBOARD("Overview", "Overview of operations, quotas, hardware telemetry, and quick actions"),
    EXIF_VIEWER("View Photo Details", "Inspect photo details, camera specs, capture timestamps, and GPS map coordinates"),
    ARCHIVE_COMPARE("Compare Archives", "Compare photo library files with Google Takeout sidecars"),
    DUPLICATE_FINDER("Find Duplicates", "Scan directories for duplicate photos and reclaim disk space"),
    PHOTO_CULLING("AI Photo Picker", "Group burst photos by visual similarity and recommend the best keeper in each group"),
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
