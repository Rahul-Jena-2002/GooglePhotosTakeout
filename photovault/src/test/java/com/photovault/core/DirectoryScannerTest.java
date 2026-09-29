package com.photovault.core;

import com.photovault.model.DirectoryInventory;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.*;

class DirectoryScannerTest {

    @Test
    @DisplayName("Recursive scan correctly catalogs nested files and filters OS noise")
    void testRecursiveScanAndExclusion(@TempDir Path tempDir) throws IOException {
        Path subDir1 = tempDir.resolve("2024").resolve("01_Jan");
        Path subDir2 = tempDir.resolve("2024").resolve("02_Feb");
        Files.createDirectories(subDir1);
        Files.createDirectories(subDir2);

        // Valid photos
        Files.writeString(subDir1.resolve("IMG_0001.JPG"), "photo 1 bytes");
        Files.writeString(subDir1.resolve("IMG_0002.RAW"), "raw 2 bytes longer");
        Files.writeString(subDir2.resolve("IMG_0003.JPG"), "photo 3");

        // OS noise files
        Files.writeString(subDir1.resolve(".DS_Store"), "apple junk");
        Files.writeString(subDir2.resolve("Thumbs.db"), "windows thumbs");
        Files.writeString(subDir1.resolve("._IMG_0001.JPG"), "apple double");

        ExclusionFilter filter = new ExclusionFilter();
        DirectoryScanner scanner = new DirectoryScanner(filter);

        AtomicLong reportedFiles = new AtomicLong();
        DirectoryScanner.ScanResult result = scanner.scan(tempDir, (files, bytes) -> reportedFiles.set(files));

        DirectoryInventory inv = result.inventory();
        assertNotNull(inv);
        assertEquals(3, inv.totalFiles());
        assertTrue(inv.files().containsKey("2024/01_Jan/IMG_0001.JPG"));
        assertTrue(inv.files().containsKey("2024/01_Jan/IMG_0002.RAW"));
        assertTrue(inv.files().containsKey("2024/02_Feb/IMG_0003.JPG"));

        // OS noise should NOT be in scanned inventory
        assertFalse(inv.files().containsKey("2024/01_Jan/.DS_Store"));
        assertFalse(inv.files().containsKey("2024/02_Feb/Thumbs.db"));
        assertFalse(inv.files().containsKey("2024/01_Jan/._IMG_0001.JPG"));

        // Exclusions should be recorded
        assertEquals(3, inv.excludedFiles().size());
        assertEquals(3, reportedFiles.get());
        assertTrue(result.scanErrors().isEmpty());
    }

    @Test
    @DisplayName("Empty directory scan returns empty inventory")
    void testEmptyDirectoryScan(@TempDir Path tempDir) throws IOException {
        DirectoryScanner scanner = new DirectoryScanner();
        DirectoryScanner.ScanResult result = scanner.scan(tempDir, null);

        assertEquals(0, result.inventory().totalFiles());
        assertEquals(0L, result.inventory().totalBytes());
        assertTrue(result.scanErrors().isEmpty());
    }
}
