package com.photovault.model;

import java.util.Objects;

/**
 * Immutable record representing an audited difference or read issue on a file path.
 */
public record VerificationDiscrepancy(
        String relativePath,
        DiscrepancyType type,
        Long originalSize,
        Long backupSize,
        String originalHash,
        String backupHash,
        String message
) {
    public VerificationDiscrepancy {
        Objects.requireNonNull(relativePath, "relativePath cannot be null");
        Objects.requireNonNull(type, "type cannot be null");
    }

    public static VerificationDiscrepancy missing(String relativePath, long originalSize) {
        return new VerificationDiscrepancy(relativePath, DiscrepancyType.MISSING_IN_BACKUP,
                originalSize, null, null, null, "File missing from backup");
    }

    public static VerificationDiscrepancy extra(String relativePath, long backupSize) {
        return new VerificationDiscrepancy(relativePath, DiscrepancyType.EXTRA_IN_BACKUP,
                null, backupSize, null, null, "Extra file in backup (not in original)");
    }

    public static VerificationDiscrepancy sizeMismatch(String relativePath, long originalSize, long backupSize) {
        return new VerificationDiscrepancy(relativePath, DiscrepancyType.SIZE_MISMATCH,
                originalSize, backupSize, null, null,
                String.format("Size mismatch: original has %d bytes, backup has %d bytes", originalSize, backupSize));
    }

    public static VerificationDiscrepancy hashMismatch(String relativePath, long size, String originalHash, String backupHash) {
        return new VerificationDiscrepancy(relativePath, DiscrepancyType.HASH_MISMATCH,
                size, size, originalHash, backupHash, "Cryptographic hash mismatch (SHA-256 differs)");
    }

    public static VerificationDiscrepancy readError(String relativePath, String errorMessage) {
        return new VerificationDiscrepancy(relativePath, DiscrepancyType.READ_ERROR,
                null, null, null, null, errorMessage);
    }

    public static VerificationDiscrepancy unstable(String relativePath, String message) {
        return new VerificationDiscrepancy(relativePath, DiscrepancyType.UNSTABLE_FILE,
                null, null, null, null, message);
    }
}
