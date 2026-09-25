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
