package com.takeoutfix.restore.infrastructure;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("MetadataMatcher JSON Sidecar Matching Tests")
public class MetadataMatcherTest {

    @Test
    @DisplayName("Verify exact sidecar matching: photo.jpg -> photo.jpg.json")
    void testExactMatch(@TempDir Path tempDir) throws IOException {
        Path mediaPath = Files.createFile(tempDir.resolve("IMG_2024.jpg"));
        Path jsonPath = Files.createFile(tempDir.resolve("IMG_2024.jpg.json"));

        MetadataMatcher matcher = new MetadataMatcher();
        Map<String, File[]> dirCache = new HashMap<>();

        Optional<File> match = matcher.findMatchingJson(mediaPath.toFile(), dirCache);

        assertTrue(match.isPresent(), "Matching JSON should be found");
        assertEquals(jsonPath.getFileName().toString(), match.get().getName());
    }

    @Test
    @DisplayName("Verify supplemental-metadata matching: photo.jpg -> photo.supplemental-metadata.json")
    void testSupplementalMetadataMatch(@TempDir Path tempDir) throws IOException {
        Path mediaPath = Files.createFile(tempDir.resolve("family_trip.jpg"));
        Path jsonPath = Files.createFile(tempDir.resolve("family_trip.supplemental-metadata.json"));

        MetadataMatcher matcher = new MetadataMatcher();
        Map<String, File[]> dirCache = new HashMap<>();

        Optional<File> match = matcher.findMatchingJson(mediaPath.toFile(), dirCache);

        assertTrue(match.isPresent(), "Supplemental metadata JSON should be found");
        assertEquals(jsonPath.getFileName().toString(), match.get().getName());
    }

    @Test
    @DisplayName("Verify numbered duplicate matching: photo(1).jpg -> photo.jpg(1).json")
    void testNumberedMatch(@TempDir Path tempDir) throws IOException {
        Path mediaPath = Files.createFile(tempDir.resolve("vacation(1).jpg"));
        Path jsonPath = Files.createFile(tempDir.resolve("vacation.jpg(1).json"));

        MetadataMatcher matcher = new MetadataMatcher();
        Map<String, File[]> dirCache = new HashMap<>();

        Optional<File> match = matcher.findMatchingJson(mediaPath.toFile(), dirCache);

        assertTrue(match.isPresent(), "Numbered duplicate JSON should be matched");
        assertEquals(jsonPath.getFileName().toString(), match.get().getName());
    }
}
