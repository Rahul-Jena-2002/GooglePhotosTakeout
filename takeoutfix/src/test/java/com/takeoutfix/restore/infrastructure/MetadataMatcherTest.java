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

    @Test
    @DisplayName("Verify edited/cropped photo matches original supplemental metadata: IMG_0316-edited.JPG -> IMG_0316.JPG.supplemental-metadata.json")
    void testEditedPhotoMatchesOriginalSupplementalMetadata(@TempDir Path tempDir) throws IOException {
        Path originalMedia = Files.createFile(tempDir.resolve("IMG_0316.JPG"));
        Path editedMedia = Files.createFile(tempDir.resolve("IMG_0316-edited.JPG"));
        Path jsonPath = Files.createFile(tempDir.resolve("IMG_0316.JPG.supplemental-metadata.json"));

        MetadataMatcher matcher = new MetadataMatcher();
        Map<String, File[]> dirCache = new HashMap<>();

        // Test original file
        Optional<File> origMatch = matcher.findMatchingJson(originalMedia.toFile(), dirCache);
        assertTrue(origMatch.isPresent(), "Original photo should match JSON");
        assertEquals(jsonPath.getFileName().toString(), origMatch.get().getName());

        // Test -edited companion file (same folder cache)
        Optional<File> editedMatch = matcher.findMatchingJson(editedMedia.toFile(), dirCache);
        assertTrue(editedMatch.isPresent(), "Edited companion photo should match original's JSON");
        assertEquals(jsonPath.getFileName().toString(), editedMatch.get().getName());
    }

    @Test
    @DisplayName("Verify CIMG edited photo matches original supplemental metadata: CIMG0655-edited.JPG -> CIMG0655.JPG.supplemental-metadata.json")
    void testCimgEditedPhotoMatch(@TempDir Path tempDir) throws IOException {
        Path originalMedia = Files.createFile(tempDir.resolve("CIMG0655.JPG"));
        Path editedMedia = Files.createFile(tempDir.resolve("CIMG0655-edited.JPG"));
        Path jsonPath = Files.createFile(tempDir.resolve("CIMG0655.JPG.supplemental-metadata.json"));

        MetadataMatcher matcher = new MetadataMatcher();
        Map<String, File[]> dirCache = new HashMap<>();

        Optional<File> editedMatch = matcher.findMatchingJson(editedMedia.toFile(), dirCache);
        assertTrue(editedMatch.isPresent(), "CIMG edited photo should match original's JSON");
        assertEquals(jsonPath.getFileName().toString(), editedMatch.get().getName());
    }

    @Test
    @DisplayName("Verify effects/mix edited photo matches original JSON: photo_effects.jpg -> photo.json")
    void testEffectsPhotoMatch(@TempDir Path tempDir) throws IOException {
        Path originalMedia = Files.createFile(tempDir.resolve("photo.jpg"));
        Path effectsMedia = Files.createFile(tempDir.resolve("photo_effects.jpg"));
        Path jsonPath = Files.createFile(tempDir.resolve("photo.json"));

        MetadataMatcher matcher = new MetadataMatcher();
        Map<String, File[]> dirCache = new HashMap<>();

        Optional<File> match = matcher.findMatchingJson(effectsMedia.toFile(), dirCache);
        assertTrue(match.isPresent(), "Effects photo should match original's JSON");
        assertEquals(jsonPath.getFileName().toString(), match.get().getName());
    }
}
