package com.photovault.core;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.time.Instant;

import static org.junit.jupiter.api.Assertions.*;

class FileStabilityGuardTest {

    @Test
    @DisplayName("Stable file returns true")
    void testStableFile(@TempDir Path tempDir) throws IOException {
        Path file = tempDir.resolve("photo.jpg");
        Files.writeString(file, "Stable photo content");

        FileStabilityGuard.FileSnapshot snapshot = FileStabilityGuard.capture(file);
        assertNotNull(snapshot);
        assertTrue(snapshot.sizeBytes() > 0);

        assertTrue(FileStabilityGuard.isStable(file, snapshot));
    }

    @Test
    @DisplayName("File with altered size detected as unstable")
    void testUnstableFileSize(@TempDir Path tempDir) throws IOException {
        Path file = tempDir.resolve("photo.jpg");
        Files.writeString(file, "Initial content");

        FileStabilityGuard.FileSnapshot snapshot = FileStabilityGuard.capture(file);

        // Modify file size
        Files.writeString(file, "Initial content appended with more data!");

        assertFalse(FileStabilityGuard.isStable(file, snapshot));
    }

    @Test
    @DisplayName("File with altered timestamp detected as unstable")
    void testUnstableFileTimestamp(@TempDir Path tempDir) throws IOException {
        Path file = tempDir.resolve("photo.jpg");
        Files.writeString(file, "Content");

        FileStabilityGuard.FileSnapshot snapshot = FileStabilityGuard.capture(file);

        // Alter timestamp by 10 seconds
        Files.setLastModifiedTime(file, FileTime.from(Instant.ofEpochMilli(snapshot.lastModifiedMillis() + 10_000)));

        assertFalse(FileStabilityGuard.isStable(file, snapshot));
    }

    @Test
    @DisplayName("Deleted file returns false")
    void testDeletedFile(@TempDir Path tempDir) throws IOException {
        Path file = tempDir.resolve("temp.jpg");
        Files.writeString(file, "Content");

        FileStabilityGuard.FileSnapshot snapshot = FileStabilityGuard.capture(file);
        Files.delete(file);

        assertFalse(FileStabilityGuard.isStable(file, snapshot));
    }
}
