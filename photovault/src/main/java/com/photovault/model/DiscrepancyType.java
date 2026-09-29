package com.photovault.model;

/**
 * Discrepancy classifications for files audited between source and backup trees.
 */
public enum DiscrepancyType {
    /** File exists in original folder but is missing from backup. */
    MISSING_IN_BACKUP("Missing in Backup"),

    /** File exists in backup folder but was not present in original. */
    EXTRA_IN_BACKUP("Extra in Backup"),

    /** File exists in both, but sizes differ in byte count. */
    SIZE_MISMATCH("Size Mismatch"),

    /** File sizes match, but cryptographic SHA-256 stream digests differ (corruption/bit-rot). */
    HASH_MISMATCH("Hash Mismatch (Corrupted)"),

    /** File could not be read or opened due to I/O permissions or drive error. */
    READ_ERROR("Read Error"),

    /** File was altered by another process while PhotoVault was reading it. */
    UNSTABLE_FILE("Concurrently Modified / Unstable");

    private final String label;

    DiscrepancyType(String label) {
        this.label = label;
    }

    public String getLabel() {
        return label;
    }
}
