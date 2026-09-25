package com.takeoutfix.restore.infrastructure;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("MediaScanner Filesystem Traversal Tests")
public class MediaScannerTest {

    @Test
    @DisplayName("Verify scanner detects supported media and ignores non-media and hidden directories")
    void testMediaScannerTraversesAndFilters(@TempDir Path tempDir) throws IOException {
        // Create valid media files
        Path subDir = Files.createDirectories(tempDir.resolve("Album 2024"));
        Files.createFile(subDir.resolve("photo1.jpg"));
        Files.createFile(subDir.resolve("photo2.HEIC"));
        Files.createFile(subDir.resolve("video1.MP4"));
        Files.createFile(subDir.resolve("image.png"));

        // Create non-media files
        Files.createFile(subDir.resolve("metadata.json"));
        Files.createFile(subDir.resolve("notes.txt"));

        // Create hidden git directory with media inside (should be skipped)
        Path gitDir = Files.createDirectories(tempDir.resolve(".git"));
        Files.createFile(gitDir.resolve("hidden.jpg"));

        MediaScanner scanner = new MediaScanner();
        List<File> discovered = scanner.listMediaFiles(tempDir.toFile());

        assertEquals(4, discovered.size(), "Should discover exactly 4 valid media files");
        assertTrue(discovered.stream().anyMatch(f -> f.getName().equalsIgnoreCase("photo1.jpg")));
        assertTrue(discovered.stream().anyMatch(f -> f.getName().equalsIgnoreCase("photo2.HEIC")));
        assertTrue(discovered.stream().anyMatch(f -> f.getName().equalsIgnoreCase("video1.MP4")));
        assertTrue(discovered.stream().anyMatch(f -> f.getName().equalsIgnoreCase("image.png")));
        assertFalse(discovered.stream().anyMatch(f -> f.getName().endsWith(".json")));
        assertFalse(discovered.stream().anyMatch(f -> f.getName().endsWith(".txt")));
        assertFalse(discovered.stream().anyMatch(f -> f.getName().equals("hidden.jpg")));
    }
}
