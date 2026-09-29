package com.takeoutfix.metasync.model;

/**
 * Logical categorization of photograph metadata fields.
 */
public enum TagGroup {
    CAPTURE("Capture", "Exposure, camera model, lens, and capture date"),
    LOCATION("Location", "GPS latitude, longitude, and altitude"),
    COPYRIGHT("Copyright", "Creator, copyright notice, and usage rights"),
    DESCRIPTIVE("Descriptive", "Title, caption, and descriptions"),
    KEYWORDS("Keywords", "Subject keywords and hierarchical tags"),
    RATINGS("Ratings", "Star ratings and color labels");

    private final String displayName;
    private final String description;

    TagGroup(String displayName, String description) {
        this.displayName = displayName;
        this.description = description;
    }

    public String getDisplayName() {
        return displayName;
    }

    public String getDescription() {
        return description;
    }
}
