package com.takeoutfix.compare;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("Archive & Collection Compare Service Tests")
class ArchiveCompareServiceTest {

    private final ArchiveCompareService service = new ArchiveCompareService();

    @Test
    @DisplayName("Should detect Exact, Missing, Additional, and Modified files between collections")
    void testCompareCollections(@TempDir Path tempDir) throws IOException {
        Path sourceA = tempDir.resolve("SourceA");
        Path sourceB = tempDir.resolve("SourceB");
        Files.createDirectories(sourceA);
        Files.createDirectories(sourceB);

        // 1. Exact match (same relative path, same content)
        Files.writeString(sourceA.resolve("photo1.jpg"), "EXACT_CONTENT", StandardCharsets.UTF_8);
        Files.writeString(sourceB.resolve("photo1.jpg"), "EXACT_CONTENT", StandardCharsets.UTF_8);

        // 2. Missing in B (only in Source A)
        Files.writeString(sourceA.resolve("photo2.jpg"), "SOURCE_A_ONLY", StandardCharsets.UTF_8);

        // 3. Additional in B (only in Source B)
        Files.writeString(sourceB.resolve("photo3.jpg"), "SOURCE_B_ONLY", StandardCharsets.UTF_8);

        // 4. Modified content (same path, different bytes)
        Files.writeString(sourceA.resolve("photo4.jpg"), "VERSION_A", StandardCharsets.UTF_8);
        Files.writeString(sourceB.resolve("photo4.jpg"), "VERSION_B", StandardCharsets.UTF_8);

        ArchiveCompareService.ComparisonResult result = service.compare(sourceA, sourceB);

        assertEquals(1, result.getExactCount());
        assertEquals(1, result.getMissingCount());
        assertEquals(1, result.getAdditionalCount());
        assertEquals(1, result.getModifiedCount());

        List<ArchiveCompareService.CompareRecord> records = result.getRecords();
        assertEquals(4, records.size());

        // Test CSV & JSON report export
        String csv = service.exportCsv(records);
        assertTrue(csv.contains("photo1.jpg"));
        assertTrue(csv.contains("Exact Match"));
        assertTrue(csv.contains("Missing in B"));

        String json = service.exportJson(records);
        assertTrue(json.contains("\"relativePath\": \"photo1.jpg\""));
    }

    @Test
    @DisplayName("Safe copy should copy missing files and never overwrite existing files")
    void testSafeCopyMissing(@TempDir Path tempDir) throws IOException {
        Path sourceA = tempDir.resolve("SourceA");
        Path sourceB = tempDir.resolve("SourceB");
        Files.createDirectories(sourceA);
        Files.createDirectories(sourceB);

        Files.writeString(sourceA.resolve("missing.jpg"), "MISSING_DATA", StandardCharsets.UTF_8);
        Files.writeString(sourceB.resolve("existing.jpg"), "EXISTING_DATA", StandardCharsets.UTF_8);

        ArchiveCompareService.ComparisonResult result = service.compare(sourceA, sourceB);
        int copied = service.safeCopyMissing(result.getRecords(), sourceB);

        assertEquals(1, copied);
        assertTrue(Files.exists(sourceB.resolve("missing.jpg")));
        assertEquals("EXISTING_DATA", Files.readString(sourceB.resolve("existing.jpg")));
    }

    @Test
    @DisplayName("Should strictly ignore .json sidecars and only index media files")
    void testIgnoreJsonSidecars(@TempDir Path tempDir) throws IOException {
        Path sourceA = tempDir.resolve("SourceA");
        Path sourceB = tempDir.resolve("SourceB");
        Files.createDirectories(sourceA);
        Files.createDirectories(sourceB);

        // Real media files
        Files.writeString(sourceA.resolve("photo.jpg"), "PHOTO_BYTES", StandardCharsets.UTF_8);
        Files.writeString(sourceB.resolve("photo.jpg"), "PHOTO_BYTES", StandardCharsets.UTF_8);

        // JSON sidecars that must be ignored
        Files.writeString(sourceA.resolve("metadata.json"), "{\"title\":\"album\"}", StandardCharsets.UTF_8);
        Files.writeString(sourceA.resolve("photo.jpg.supplemental-metadata.json"), "{\"geoData\":{}}", StandardCharsets.UTF_8);
        Files.writeString(sourceB.resolve("backup_metadata.json"), "{\"backup\":true}", StandardCharsets.UTF_8);

        ArchiveCompareService.ComparisonResult result = service.compare(sourceA, sourceB);

        // Only photo.jpg should be indexed and matched as exact; all 3 JSON files must be ignored
        assertEquals(1, result.getRecords().size());
        assertEquals(1, result.getExactCount());
        assertEquals(0, result.getMissingCount());
        assertEquals(0, result.getAdditionalCount());
        assertEquals("photo.jpg", result.getRecords().get(0).getRelativePath());
    }
}
