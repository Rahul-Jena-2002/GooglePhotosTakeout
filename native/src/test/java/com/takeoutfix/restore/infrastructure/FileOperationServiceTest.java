package com.takeoutfix.restore.infrastructure;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("FileOperationService File Copy & Organization Tests")
public class FileOperationServiceTest {

    @Test
    @DisplayName("Verify copyToOutput preserves relative directory structures and contents")
    void testCopyToOutput(@TempDir Path tempDir) throws IOException {
        Path inputRoot = Files.createDirectories(tempDir.resolve("input"));
        Path outputRoot = Files.createDirectories(tempDir.resolve("output"));

        Path subDir = Files.createDirectories(inputRoot.resolve("Vacation 2024"));
        Path sourceFile = subDir.resolve("photo.jpg");
        Files.writeString(sourceFile, "dummy image content");

        FileOperationService service = new FileOperationService();
        Path relPath = service.copyToOutput(sourceFile.toFile(), inputRoot.toFile(), outputRoot.toFile());

        Path expectedOutput = outputRoot.resolve("Vacation 2024").resolve("photo.jpg");
        assertTrue(Files.exists(expectedOutput), "Copied file must exist at destination");
        assertEquals("dummy image content", Files.readString(expectedOutput));
        assertEquals(Path.of("Vacation 2024", "photo.jpg"), relPath);
    }

    @Test
    @DisplayName("Verify copyToChronologicalOutput organizes into Year-Month subfolders")
    void testCopyToChronologicalOutput(@TempDir Path tempDir) throws IOException {
        Path inputRoot = Files.createDirectories(tempDir.resolve("input"));
        Path outputRoot = Files.createDirectories(tempDir.resolve("output"));

        Path subDir = Files.createDirectories(inputRoot.resolve("Family"));
        Path sourceFile = subDir.resolve("beach.jpg");
        Files.writeString(sourceFile, "beach picture data");

        // August 15, 2023 12:00:00 UTC
        Instant instant = Instant.parse("2023-08-15T12:00:00Z");

        FileOperationService service = new FileOperationService();
        File copied = service.copyToChronologicalOutput(sourceFile.toFile(), inputRoot.toFile(), outputRoot.toFile(), instant);

        assertNotNull(copied);
        assertTrue(copied.exists(), "Chronological file must exist");
        assertTrue(copied.getAbsolutePath().contains("2023-08"), "Path must contain Year-Month subfolder");
    }
}
