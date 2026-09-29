package com.photovault.core;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.Objects;

/**
 * Validates that files are not modified concurrently while PhotoVault reads and hashes them.
 * Catches background saves, copy operations in progress, or file tampering.
 */
public class FileStabilityGuard {

    public record FileSnapshot(long sizeBytes, long lastModifiedMillis) {
        public static FileSnapshot of(Path path) throws IOException {
            BasicFileAttributes attrs = Files.readAttributes(path, BasicFileAttributes.class);
            return new FileSnapshot(attrs.size(), attrs.lastModifiedTime().toMillis());
        }
    }

    /**
     * Captures a pre-read file snapshot.
     */
    public static FileSnapshot capture(Path path) throws IOException {
        Objects.requireNonNull(path, "path cannot be null");
        return FileSnapshot.of(path);
    }

    /**
     * Compares the pre-read snapshot against current file attributes.
     *
     * @param path the file path
     * @param preSnapshot snapshot captured before reading
     * @return true if the file remained stable and unmodified
     */
    public static boolean isStable(Path path, FileSnapshot preSnapshot) {
        if (preSnapshot == null || path == null) {
            return false;
        }
        try {
            FileSnapshot postSnapshot = FileSnapshot.of(path);
            return preSnapshot.sizeBytes() == postSnapshot.sizeBytes()
                    && preSnapshot.lastModifiedMillis() == postSnapshot.lastModifiedMillis();
        } catch (IOException e) {
            return false;
        }
    }
}
