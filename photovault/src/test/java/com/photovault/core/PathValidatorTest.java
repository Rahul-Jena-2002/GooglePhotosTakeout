package com.photovault.core;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

class PathValidatorTest {

    @Test
    @DisplayName("Reject null paths")
    void testNullPaths(@TempDir Path tempDir) {
        PathValidator.ValidationResult r1 = PathValidator.validatePaths(null, tempDir);
        assertFalse(r1.isValid());
        assertTrue(r1.errorMessage().contains("null"));

        PathValidator.ValidationResult r2 = PathValidator.validatePaths(tempDir, null);
        assertFalse(r2.isValid());
        assertTrue(r2.errorMessage().contains("null"));
    }

    @Test
    @DisplayName("Reject non-existent directory")
    void testNonExistentDirectory(@TempDir Path tempDir) {
        Path missing = tempDir.resolve("does_not_exist");
        Path valid = tempDir.resolve("valid_dir");
        assertDoesNotThrow(() -> Files.createDirectories(valid));

        PathValidator.ValidationResult r1 = PathValidator.validatePaths(missing, valid);
        assertFalse(r1.isValid());
        assertTrue(r1.errorMessage().contains("does not exist"));

        PathValidator.ValidationResult r2 = PathValidator.validatePaths(valid, missing);
        assertFalse(r2.isValid());
        assertTrue(r2.errorMessage().contains("does not exist"));
    }

    @Test
    @DisplayName("Reject file paths that are not directories")
    void testNotADirectory(@TempDir Path tempDir) throws IOException {
        Path file = tempDir.resolve("photo.jpg");
        Files.writeString(file, "dummy content");
        Path dir = tempDir.resolve("photos");
        Files.createDirectories(dir);

        PathValidator.ValidationResult r = PathValidator.validatePaths(file, dir);
        assertFalse(r.isValid());
        assertTrue(r.errorMessage().contains("not a directory"));
    }

    @Test
    @DisplayName("Reject identical directories")
    void testIdenticalDirectories(@TempDir Path tempDir) throws IOException {
        Path original = tempDir.resolve("original");
        Files.createDirectories(original);

        PathValidator.ValidationResult r = PathValidator.validatePaths(original, original);
        assertFalse(r.isValid());
        assertTrue(r.errorMessage().contains("same directory"));
    }

    @Test
    @DisplayName("Reject nested directories (backup inside original)")
    void testBackupInsideOriginal(@TempDir Path tempDir) throws IOException {
        Path original = tempDir.resolve("original");
        Path backupNested = original.resolve("backup_subfolder");
        Files.createDirectories(backupNested);

        PathValidator.ValidationResult r = PathValidator.validatePaths(original, backupNested);
        assertFalse(r.isValid());
        assertTrue(r.errorMessage().contains("inside the Original folder"));
    }

    @Test
    @DisplayName("Reject nested directories (original inside backup)")
    void testOriginalInsideBackup(@TempDir Path tempDir) throws IOException {
        Path backup = tempDir.resolve("backup");
        Path originalNested = backup.resolve("original_subfolder");
        Files.createDirectories(originalNested);

        PathValidator.ValidationResult r = PathValidator.validatePaths(originalNested, backup);
        assertFalse(r.isValid());
        assertTrue(r.errorMessage().contains("inside the Backup folder"));
    }

    @Test
    @DisplayName("Accept valid distinct peer directories")
    void testValidDistinctDirectories(@TempDir Path tempDir) throws IOException {
        Path original = tempDir.resolve("original_photos");
        Path backup = tempDir.resolve("backup_photos");
        Files.createDirectories(original);
        Files.createDirectories(backup);

        PathValidator.ValidationResult r = PathValidator.validatePaths(original, backup);
        assertTrue(r.isValid());
        assertNull(r.errorMessage());
        assertNotNull(r.resolvedOriginal());
        assertNotNull(r.resolvedBackup());
    }

    @Test
    @DisplayName("Detect symlink escaping root boundary")
    void testSymlinkEscape(@TempDir Path tempDir) throws IOException {
        Path root = tempDir.resolve("photos_root");
        Path outside = tempDir.resolve("outside_system_dir");
        Files.createDirectories(root);
        Files.createDirectories(outside);

        Path outsideFile = outside.resolve("secret.txt");
        Files.writeString(outsideFile, "secret");

        Path insideFile = root.resolve("normal.txt");
        Files.writeString(insideFile, "hello");

        // Normal file is not escaping
        assertFalse(PathValidator.isSymlinkEscapingRoot(insideFile, root));

        // Create symlink pointing outside if OS permissions allow
        Path symlink = root.resolve("escaped_link");
        try {
            Files.createSymbolicLink(symlink, outsideFile);
            assertTrue(PathValidator.isSymlinkEscapingRoot(symlink, root));
        } catch (UnsupportedOperationException | SecurityException | IOException e) {
            // On Windows non-elevated Developer Mode might prevent creating symlinks, which is standard
            System.out.println("Skipping active symlink creation due to OS policy: " + e.getMessage());
        }
    }
}
