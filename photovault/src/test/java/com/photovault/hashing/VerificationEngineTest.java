package com.photovault.hashing;

import com.photovault.model.DiscrepancyType;
import com.photovault.model.VerificationResult;
import com.photovault.model.VerificationState;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

class VerificationEngineTest {

    @Test
    @DisplayName("Identical folders resolve to VERIFIED with zero discrepancies")
    void testIdenticalFolders(@TempDir Path tempDir) throws IOException {
        Path orig = tempDir.resolve("original");
        Path backup = tempDir.resolve("backup");
        Files.createDirectories(orig);
        Files.createDirectories(backup);

        Files.writeString(orig.resolve("photo1.jpg"), "photo 1 binary data");
        Files.writeString(backup.resolve("photo1.jpg"), "photo 1 binary data");

        Path subOrig = orig.resolve("sub");
        Path subBackup = backup.resolve("sub");
        Files.createDirectories(subOrig);
        Files.createDirectories(subBackup);
        Files.writeString(subOrig.resolve("raw.cr3"), "raw photo binary data");
        Files.writeString(subBackup.resolve("raw.cr3"), "raw photo binary data");

        VerificationEngine engine = new VerificationEngine(4);
        VerificationResult result = engine.verify(orig, backup, null);

        assertEquals(VerificationState.VERIFIED, result.state());
        assertTrue(result.discrepancies().isEmpty());
        assertEquals(2, result.originalInventory().totalFiles());
        assertEquals(2, result.backupInventory().totalFiles());
    }

    @Test
    @DisplayName("Missing file in backup yields DIFFERENCES_FOUND")
    void testMissingFileInBackup(@TempDir Path tempDir) throws IOException {
        Path orig = tempDir.resolve("original");
        Path backup = tempDir.resolve("backup");
        Files.createDirectories(orig);
        Files.createDirectories(backup);

        Files.writeString(orig.resolve("exists_in_both.jpg"), "matching");
        Files.writeString(backup.resolve("exists_in_both.jpg"), "matching");
        Files.writeString(orig.resolve("missing_in_backup.jpg"), "lost on transfer");

        VerificationEngine engine = new VerificationEngine(2);
        VerificationResult result = engine.verify(orig, backup, null);

        assertEquals(VerificationState.DIFFERENCES_FOUND, result.state());
        assertEquals(1, result.discrepancies().size());
        assertEquals(DiscrepancyType.MISSING_IN_BACKUP, result.discrepancies().get(0).type());
        assertEquals("missing_in_backup.jpg", result.discrepancies().get(0).relativePath());
    }

    @Test
    @DisplayName("Corrupted 1-byte alteration (bit-rot) yields HASH_MISMATCH")
    void testBitRotHashMismatch(@TempDir Path tempDir) throws IOException {
        Path orig = tempDir.resolve("original");
        Path backup = tempDir.resolve("backup");
        Files.createDirectories(orig);
        Files.createDirectories(backup);

        // Same length (10 chars), 1 character flipped
        Files.writeString(orig.resolve("wedding.jpg"), "012345678A");
        Files.writeString(backup.resolve("wedding.jpg"), "012345678B");

        VerificationEngine engine = new VerificationEngine(2);
        VerificationResult result = engine.verify(orig, backup, null);

        assertEquals(VerificationState.DIFFERENCES_FOUND, result.state());
        assertEquals(1, result.discrepancies().size());
        assertEquals(DiscrepancyType.HASH_MISMATCH, result.discrepancies().get(0).type());
        assertEquals("wedding.jpg", result.discrepancies().get(0).relativePath());
        assertNotNull(result.discrepancies().get(0).originalHash());
        assertNotNull(result.discrepancies().get(0).backupHash());
        assertNotEquals(result.discrepancies().get(0).originalHash(), result.discrepancies().get(0).backupHash());
    }

    @Test
    @DisplayName("Truncated copy yields SIZE_MISMATCH")
    void testTruncatedSizeMismatch(@TempDir Path tempDir) throws IOException {
        Path orig = tempDir.resolve("original");
        Path backup = tempDir.resolve("backup");
        Files.createDirectories(orig);
        Files.createDirectories(backup);

        Files.writeString(orig.resolve("video.mp4"), "Full 100MB movie stream data here");
        Files.writeString(backup.resolve("video.mp4"), "Full 100MB"); // Truncated

        VerificationEngine engine = new VerificationEngine(2);
        VerificationResult result = engine.verify(orig, backup, null);

        assertEquals(VerificationState.DIFFERENCES_FOUND, result.state());
        assertEquals(1, result.discrepancies().size());
        assertEquals(DiscrepancyType.SIZE_MISMATCH, result.discrepancies().get(0).type());
        assertEquals("video.mp4", result.discrepancies().get(0).relativePath());
    }

    @Test
    @DisplayName("Extra file in backup detected")
    void testExtraFileInBackup(@TempDir Path tempDir) throws IOException {
        Path orig = tempDir.resolve("original");
        Path backup = tempDir.resolve("backup");
        Files.createDirectories(orig);
        Files.createDirectories(backup);

        Files.writeString(orig.resolve("photo.jpg"), "photo");
        Files.writeString(backup.resolve("photo.jpg"), "photo");
        Files.writeString(backup.resolve("debris.tmp"), "old file left behind");

        VerificationEngine engine = new VerificationEngine(2);
        VerificationResult result = engine.verify(orig, backup, null);

        assertEquals(VerificationState.DIFFERENCES_FOUND, result.state());
        assertEquals(1, result.discrepancies().size());
        assertEquals(DiscrepancyType.EXTRA_IN_BACKUP, result.discrepancies().get(0).type());
    }

    @Test
    @DisplayName("Nested folders safety violation yields INCOMPLETE")
    void testNestedFoldersFailSafely(@TempDir Path tempDir) throws IOException {
        Path orig = tempDir.resolve("original");
        Path nestedBackup = orig.resolve("nested_backup");
        Files.createDirectories(nestedBackup);

        VerificationEngine engine = new VerificationEngine(2);
        VerificationResult result = engine.verify(orig, nestedBackup, null);

        assertEquals(VerificationState.INCOMPLETE, result.state());
        assertTrue(result.summaryMessage().contains("Safety constraint violated"));
    }
}
