package com.photovault.model;

/**
 * Three-state verification outcome as defined in the PhotoVault engineering specification.
 * Eliminates false positives and never confuses read errors with cryptographic bit-rot.
 */
public enum VerificationState {
    /**
     * All in-scope files in the original folder match the backup folder bit-for-bit with 0 errors.
     */
    VERIFIED("Verified", "All in-scope files matched bit-for-bit with 0 errors"),

    /**
     * Files were readable, but discrepancies exist (missing, extra, size mismatch, or SHA-256 mismatch).
     */
    DIFFERENCES_FOUND("Differences Found", "Discrepancies detected between original and backup"),

    /**
     * The scan could not complete with certainty (user cancelled, unreadable file, drive disconnected).
     */
    INCOMPLETE("Incomplete", "Verification could not complete or encountered read errors");

    private final String displayName;
    private final String description;

    VerificationState(String displayName, String description) {
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
