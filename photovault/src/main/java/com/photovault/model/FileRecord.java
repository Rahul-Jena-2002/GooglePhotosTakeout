package com.photovault.model;

import java.util.Objects;

/**
 * Immutable metadata record for a file within a directory inventory.
 * Contains relative path, file length, last modified timestamp, and optional SHA-256 hash.
 */
public record FileRecord(
        String relativePath,
        long sizeBytes,
        long lastModifiedMillis,
        String sha256Hex
) {
    public FileRecord {
        Objects.requireNonNull(relativePath, "relativePath cannot be null");
        if (sizeBytes < 0) {
            throw new IllegalArgumentException("sizeBytes cannot be negative: " + sizeBytes);
        }
    }

    public FileRecord(String relativePath, long sizeBytes, long lastModifiedMillis) {
        this(relativePath, sizeBytes, lastModifiedMillis, null);
    }

    public FileRecord withSha256(String hashHex) {
        return new FileRecord(this.relativePath, this.sizeBytes, this.lastModifiedMillis, hashHex);
    }
}
