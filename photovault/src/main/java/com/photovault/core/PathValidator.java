package com.photovault.core;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Objects;

/**
 * Validates directory boundaries, nesting, identical paths, and symlink escape vulnerabilities.
 * Protects users from infinite recursion, self-comparing, and accidental drive corruption.
 */
public class PathValidator {

    /**
     * Immutable outcome of a path pair validation check.
     */
    public record ValidationResult(boolean isValid, String errorMessage, Path resolvedOriginal, Path resolvedBackup) {
        public static ValidationResult valid(Path original, Path backup) {
            return new ValidationResult(true, null, original, backup);
        }

        public static ValidationResult invalid(String errorMessage) {
            return new ValidationResult(false, errorMessage, null, null);
        }
    }

    /**
     * Validates that both paths exist, are directories, are readable, are not identical,
     * and are not nested inside each other.
     *
     * @param original the source/original directory path
     * @param backup the destination/backup directory path
     * @return ValidationResult indicating success or failure reason
     */
    public static ValidationResult validatePaths(Path original, Path backup) {
        if (original == null) {
            return ValidationResult.invalid("Original directory path cannot be null");
        }
        if (backup == null) {
            return ValidationResult.invalid("Backup directory path cannot be null");
        }

        if (!Files.exists(original)) {
            return ValidationResult.invalid("Original directory does not exist: " + original);
        }
        if (!Files.isDirectory(original)) {
            return ValidationResult.invalid("Original path is not a directory: " + original);
        }
        if (!Files.isReadable(original)) {
            return ValidationResult.invalid("Original directory is not readable (check permissions): " + original);
        }

        if (!Files.exists(backup)) {
            return ValidationResult.invalid("Backup directory does not exist: " + backup);
        }
        if (!Files.isDirectory(backup)) {
            return ValidationResult.invalid("Backup path is not a directory: " + backup);
        }
        if (!Files.isReadable(backup)) {
            return ValidationResult.invalid("Backup directory is not readable (check permissions): " + backup);
        }

        // Canonical / real path resolution
        Path realOriginal;
        Path realBackup;
        try {
            realOriginal = original.toRealPath();
            realBackup = backup.toRealPath();
        } catch (IOException e) {
            return ValidationResult.invalid("Unable to resolve canonical real path: " + e.getMessage());
        }

        // Identical path detection
        try {
            if (Files.isSameFile(realOriginal, realBackup)) {
                return ValidationResult.invalid("Original and Backup cannot be the same directory.");
            }
        } catch (IOException e) {
            if (realOriginal.equals(realBackup)) {
                return ValidationResult.invalid("Original and Backup cannot be the same directory.");
            }
        }

        // Nested directory prevention
        if (realBackup.startsWith(realOriginal)) {
            return ValidationResult.invalid("Safety constraint violated: Backup folder is located inside the Original folder.");
        }
        if (realOriginal.startsWith(realBackup)) {
            return ValidationResult.invalid("Safety constraint violated: Original folder is located inside the Backup folder.");
        }

        return ValidationResult.valid(realOriginal, realBackup);
    }

    /**
     * Checks if a symbolic link points to a target outside the specified root directory.
     * Prevents symlink directory traversal escaping the audited folder.
     *
     * @param candidate the file or symlink path to inspect
     * @param rootDirectory the root directory boundary
     * @return true if candidate is a symlink that points outside rootDirectory
     */
    public static boolean isSymlinkEscapingRoot(Path candidate, Path rootDirectory) {
        Objects.requireNonNull(candidate, "candidate path cannot be null");
        Objects.requireNonNull(rootDirectory, "rootDirectory cannot be null");

        if (!Files.isSymbolicLink(candidate)) {
            return false;
        }

        try {
            Path realRoot = rootDirectory.toRealPath();
            Path realTarget = candidate.toRealPath();
            return !realTarget.startsWith(realRoot);
        } catch (IOException e) {
            // Broken symlink or permission denied -> treat as escaping / unsafe to traverse
            return true;
        }
    }
}
