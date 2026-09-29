package com.takeoutfix.dedup;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("Quarantine Manager Tests")
class QuarantineManagerTest {

    @Test
    @DisplayName("Should quarantine file safely, verify hash, and write to audit manifest")
    void testQuarantineAndManifest(@TempDir Path tempDir) throws IOException {
        Path qRoot = tempDir.resolve("quarantine");
        QuarantineManager manager = new QuarantineManager(qRoot);

        Path sourceDir = tempDir.resolve("photos");
        Files.createDirectories(sourceDir);
        Path sourceFile = sourceDir.resolve("duplicate.jpg");
        Files.writeString(sourceFile, "SAMPLE_DUPLICATE_BYTES", StandardCharsets.UTF_8);

        Path quarantined = manager.quarantineFile(sourceFile.toFile(), "group_01");

        assertFalse(Files.exists(sourceFile), "Original duplicate file should have moved out of source");
        assertTrue(Files.exists(quarantined), "File should exist in quarantine directory");
        assertEquals("SAMPLE_DUPLICATE_BYTES", Files.readString(quarantined));

        List<QuarantineManager.ManifestEntry> entries = manager.readManifest();
        assertFalse(entries.isEmpty());
        QuarantineManager.ManifestEntry entry = entries.get(0);
        assertEquals("group_01", entry.getGroupId());
        assertEquals("QUARANTINED", entry.getAction());
        assertEquals(sourceFile.toAbsolutePath().toString(), entry.getOriginalPath());
    }

    @Test
    @DisplayName("Should restore quarantined file to original location, and fail if destination occupied")
    void testRestoreWorkflow(@TempDir Path tempDir) throws IOException {
        Path qRoot = tempDir.resolve("quarantine");
        QuarantineManager manager = new QuarantineManager(qRoot);

        Path sourceDir = tempDir.resolve("photos");
        Files.createDirectories(sourceDir);
        Path sourceFile = sourceDir.resolve("image.jpg");
        Files.writeString(sourceFile, "IMAGE_DATA", StandardCharsets.UTF_8);

        Path quarantined = manager.quarantineFile(sourceFile.toFile(), "group_02");

        // Fails if destination is already occupied
        Files.writeString(sourceFile, "OCCUPIED_CONTENT", StandardCharsets.UTF_8);
        assertThrows(IOException.class, () -> manager.restoreFile(quarantined, sourceFile));

        // Restore succeeds once conflict cleared
        Files.delete(sourceFile);
        boolean restored = manager.restoreFile(quarantined, sourceFile);
        assertTrue(restored);
        assertTrue(Files.exists(sourceFile));
        assertFalse(Files.exists(quarantined));
        assertEquals("IMAGE_DATA", Files.readString(sourceFile));
    }

    @Test
    @DisplayName("Should permanently purge quarantined file")
    void testPurgeWorkflow(@TempDir Path tempDir) throws IOException {
        Path qRoot = tempDir.resolve("quarantine");
        QuarantineManager manager = new QuarantineManager(qRoot);

        Path sourceFile = tempDir.resolve("purge_me.jpg");
        Files.writeString(sourceFile, "GARBAGE_COPY", StandardCharsets.UTF_8);

        Path quarantined = manager.quarantineFile(sourceFile.toFile(), "group_03");
        assertTrue(Files.exists(quarantined));

        boolean purged = manager.purgeFile(quarantined);
        assertTrue(purged);
        assertFalse(Files.exists(quarantined));
    }

    @Test
    @DisplayName("Should preserve relative subfolder hierarchy inside quarantine holding area")
    void testPreserveRelativeFolderStructure(@TempDir Path tempDir) throws IOException {
        Path qRoot = tempDir.resolve("quarantine");
        QuarantineManager manager = new QuarantineManager(qRoot);

        Path libraryRoot = tempDir.resolve("PhotoLibrary");
        Path subFolder = libraryRoot.resolve("2023").resolve("Vacation");
        Files.createDirectories(subFolder);

        Path sourceFile = subFolder.resolve("IMG_9999.jpg");
        Files.writeString(sourceFile, "HIERARCHY_DATA", StandardCharsets.UTF_8);

        Path quarantined = manager.quarantineFile(sourceFile.toFile(), libraryRoot, "group_04");
        assertTrue(Files.exists(quarantined));

        // Must preserve the subfolder hierarchy 2023/Vacation/IMG_9999.jpg
        assertTrue(quarantined.toString().replace('\\', '/').contains("2023/Vacation/IMG_9999.jpg"),
                "Quarantine path must preserve relative folder structure: " + quarantined);

        // And restoration must restore back to original subfolder
        manager.restoreFile(quarantined, sourceFile);
        assertTrue(Files.exists(sourceFile));
        assertEquals("HIERARCHY_DATA", Files.readString(sourceFile));
    }
}
