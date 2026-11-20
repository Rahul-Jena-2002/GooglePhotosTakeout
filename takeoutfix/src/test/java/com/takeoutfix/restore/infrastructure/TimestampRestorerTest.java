package com.takeoutfix.restore.infrastructure;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("TimestampRestorer Metadata & Timestamp Application Tests")
public class TimestampRestorerTest {

    @Test
    void missingOrUnreadableSidecarDateIsAvailableToFallback(@TempDir Path tempDir) throws IOException {
        Path json = tempDir.resolve("photo.json");
        Files.writeString(json, "{\"geoData\":{\"latitude\":12,\"longitude\":34}}");
        TimestampRestorer restorer = new TimestampRestorer();
        assertTrue(restorer.parseJsonTimestamp(json.toFile(), Optional.empty()).isEmpty());
        assertTrue(restorer.parseJsonTimestamp(tempDir.resolve("missing.json").toFile(), Optional.empty()).isEmpty());
        Files.writeString(json, "{\"photoTakenTime\":{\"timestamp\":\"1623751200\"}}");
        assertEquals(1623751200L, restorer.parseJsonTimestamp(json.toFile(), Optional.empty()).orElseThrow().getEpochSecond());
    }

    @Test
    void acceptsNumericTimestampWithoutTruncatingDecimalValues(@TempDir Path tempDir) throws IOException {
        Path json = tempDir.resolve("photo.json");
        TimestampRestorer restorer = new TimestampRestorer();
        Files.writeString(json, "{\"photoTakenTime\":{\"timestamp\":1623751200}}");
        assertEquals(1623751200L, restorer.parseInstantFromJson(json.toFile(), Optional.empty()).getEpochSecond());
        Files.writeString(json, "{\"photoTakenTime\":{\"timestamp\":1.5},\"creationTime\":{\"timestamp\":\"1623751200\"}}");
        assertEquals(1623751200L, restorer.parseInstantFromJson(json.toFile(), Optional.empty()).getEpochSecond());
    }

    @Test
    void oversizedTimestampFallsBackToCreationTime(@TempDir Path tempDir) throws IOException {
        Path json = tempDir.resolve("photo.json");
        Files.writeString(json, "{\"photoTakenTime\":{\"timestamp\":\"9223372036854775807\"},\"creationTime\":{\"timestamp\":\"1623751200\"}}");
        assertEquals(1623751200L, new TimestampRestorer().parseInstantFromJson(json.toFile(), Optional.empty()).getEpochSecond());
    }

    @Test
    void testMissingTimestampDoesNotInventDate(@TempDir Path tempDir) throws IOException {
        Path media = Files.createFile(tempDir.resolve("photo.jpg"));
        Path json = tempDir.resolve("photo.jpg.json");
        Files.writeString(json, "{\"photoTakenTime\":{\"timestamp\":\"0\"}}");
        var original = Files.getLastModifiedTime(media);
        TimestampRestorer restorer = new TimestampRestorer();
        assertThrows(IOException.class, () -> restorer.parseInstantFromJson(json.toFile(), Optional.empty()));
        assertThrows(IOException.class, () -> restorer.restoreFromJson(media.toFile(), json.toFile(), Optional.empty()));
        assertEquals(original, Files.getLastModifiedTime(media));
    }

    @Test
    @DisplayName("Verify restoreFromJson applies photoTakenTime timestamp from JSON")
    void testRestoreFromJsonPhotoTakenTime(@TempDir Path tempDir) throws IOException {
        Path mediaPath = Files.createFile(tempDir.resolve("sample.jpg"));
        Path jsonPath = Files.createFile(tempDir.resolve("sample.jpg.json"));

        // Timestamp for 2021-06-15 10:00:00 UTC = 1623751200
        String jsonContent = """
            {
              "title": "sample.jpg",
              "photoTakenTime": {
                "timestamp": "1623751200",
                "formatted": "Jun 15, 2021, 10:00:00 AM UTC"
              }
            }
            """;
        Files.writeString(jsonPath, jsonContent);

        TimestampRestorer restorer = new TimestampRestorer();
        Instant restoredInstant = restorer.restoreFromJson(mediaPath.toFile(), jsonPath.toFile(), Optional.empty());

        assertNotNull(restoredInstant);
        assertEquals(1623751200L, restoredInstant.getEpochSecond(), "Restored instant must match photoTakenTime");
        assertEquals(1623751200L, mediaPath.toFile().lastModified() / 1000L, "File lastModified must match timestamp");
    }

    @Test
    @DisplayName("Verify restoreFromJson falls back to creationTime when photoTakenTime is absent")
    void testRestoreFromJsonFallbackCreationTime(@TempDir Path tempDir) throws IOException {
        Path mediaPath = Files.createFile(tempDir.resolve("video.mp4"));
        Path jsonPath = Files.createFile(tempDir.resolve("video.mp4.json"));

        // Timestamp for 2022-01-01 00:00:00 UTC = 1640995200
        String jsonContent = """
            {
              "title": "video.mp4",
              "creationTime": {
                "timestamp": "1640995200",
                "formatted": "Jan 1, 2022, 12:00:00 AM UTC"
              }
            }
            """;
        Files.writeString(jsonPath, jsonContent);

        TimestampRestorer restorer = new TimestampRestorer();
        Instant restoredInstant = restorer.restoreFromJson(mediaPath.toFile(), jsonPath.toFile(), Optional.empty());

        assertNotNull(restoredInstant);
        assertEquals(1640995200L, restoredInstant.getEpochSecond(), "Restored instant must match creationTime");
    }
}
