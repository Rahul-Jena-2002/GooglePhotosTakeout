package com.photovault.model;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Snapshot inventory of an inspected directory tree.
 * Holds file records indexed by relative path, summary metrics, and excluded file count/list.
 */
public record DirectoryInventory(
        Map<String, FileRecord> files,
        long totalBytes,
        long totalFiles,
        List<String> excludedFiles
) {
    public DirectoryInventory {
        Objects.requireNonNull(files, "files map cannot be null");
        Objects.requireNonNull(excludedFiles, "excludedFiles list cannot be null");
        files = Collections.unmodifiableMap(files);
        excludedFiles = Collections.unmodifiableList(excludedFiles);
    }

    public static DirectoryInventory of(Map<String, FileRecord> files, List<String> excludedFiles) {
        long totalBytes = files.values().stream().mapToLong(FileRecord::sizeBytes).sum();
        return new DirectoryInventory(files, totalBytes, files.size(), excludedFiles);
    }

    public static DirectoryInventory empty() {
        return new DirectoryInventory(Collections.emptyMap(), 0L, 0L, Collections.emptyList());
    }
}
