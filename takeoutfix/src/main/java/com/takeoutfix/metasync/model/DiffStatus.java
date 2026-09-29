package com.takeoutfix.metasync.model;

/**
 * Status of a specific metadata tag when compared between Source and Destination.
 */
public enum DiffStatus {
    MATCH("Match", "Values are identical across both files"),
    DIFFERENT("Different", "Values differ between source and destination"),
    SOURCE_ONLY("Source Only", "Present in source RAW/XMP, missing in destination"),
    DEST_ONLY("Destination Only", "Present only in destination file");

    private final String label;
    private final String description;

    DiffStatus(String label, String description) {
        this.label = label;
        this.description = description;
    }

    public String getLabel() {
        return label;
    }

    public String getDescription() {
        return description;
    }
}
