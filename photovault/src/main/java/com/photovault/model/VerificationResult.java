package com.photovault.model;

import java.nio.file.Path;
import java.time.Instant;
import java.util.Collections;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

/**
 * Authoritative immutable verification certificate / result data structure.
 */
public record VerificationResult(
        UUID id,
        VerificationState state,
        Instant completedAt,
        Path originalPath,
        Path backupPath,
        DirectoryInventory originalInventory,
        DirectoryInventory backupInventory,
        List<VerificationDiscrepancy> discrepancies,
        List<String> excludedFiles,
        VerificationMetrics metrics,
        String summaryMessage
) {
    public VerificationResult {
        Objects.requireNonNull(id, "id cannot be null");
        Objects.requireNonNull(state, "state cannot be null");
        Objects.requireNonNull(completedAt, "completedAt cannot be null");
        Objects.requireNonNull(discrepancies, "discrepancies list cannot be null");
        Objects.requireNonNull(excludedFiles, "excludedFiles list cannot be null");
        discrepancies = Collections.unmodifiableList(discrepancies);
        excludedFiles = Collections.unmodifiableList(excludedFiles);
    }

    public boolean isVerified() {
        return state == VerificationState.VERIFIED;
    }

    public boolean hasDifferences() {
        return state == VerificationState.DIFFERENCES_FOUND;
    }

    public boolean isIncomplete() {
        return state == VerificationState.INCOMPLETE;
    }
}
