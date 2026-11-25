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
    void restoreLogDoesNotAppendToAnExistingFile(@TempDir Path root) throws IOException {
        Path existing = Files.writeString(root.resolve("restoration_log.log"), "keep this file");
        try (var log = new FileOperationService().createRestoreLog(root)) {
            log.println("new log entry");
        }
        assertEquals("keep this file", Files.readString(existing));
        try (var files = Files.list(root)) {
            assertTrue(files.anyMatch(path -> path.getFileName().toString().startsWith("restoration_log-")));
        }
    }

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
    void testArchivePartDoesNotOverwriteExistingArchive(@TempDir Path tempDir) throws IOException {
        Path original = tempDir.resolve("Restored_Takeout_Part1.zip");
        Files.writeString(original, "existing archive");
        FileOperationService service = new FileOperationService();
        Path partial = service.createArchivePart(tempDir, 1);
        assertTrue(partial.getFileName().toString().endsWith(".zip.partial"));
        Files.writeString(partial, "new archive");
        assertFalse(Files.exists(tempDir.resolve("Restored_Takeout_Part1 (1).zip")));
        service.finishArchivePart(partial, 1);
        assertFalse(Files.exists(partial));
        assertEquals("existing archive", Files.readString(original));
        assertEquals("new archive", Files.readString(tempDir.resolve("Restored_Takeout_Part1 (1).zip")));
    }

    @Test
    void testArchiveCopyPreservesOriginal(@TempDir Path tempDir) throws IOException {
        Path source = tempDir.resolve("unmatched.jpg");
        Files.writeString(source, "original content");
        Path copy = new FileOperationService().createArchiveCopy(source.toFile());
        try {
            assertNotEquals(source, copy);
            assertEquals("original content", Files.readString(copy));
        } finally {
            Files.deleteIfExists(copy);
        }
        assertEquals("original content", Files.readString(source));
    }

    @Test
    void archiveTemporaryNameKeepsExtensionWithoutLongOriginalName() throws IOException {
        File temporary = new FileOperationService().createArchiveTemp(new File("a".repeat(230) + ".jpeg"));
        try {
            assertTrue(temporary.getName().endsWith(".jpeg"));
            assertTrue(temporary.getName().length() < 100);
        } finally {
            Files.deleteIfExists(temporary.toPath());
        }
    }

    @Test
    void testRestoreDirectoriesMustBeSeparate(@TempDir Path tempDir) throws IOException {
        Path source = Files.createDirectories(tempDir.resolve("source"));
        Path other = Files.createDirectories(tempDir.resolve("other"));
        assertThrows(IOException.class, () -> FileOperationService.requireSeparateDirectories(source.toFile(), source.toFile()));
        assertThrows(IOException.class, () -> FileOperationService.requireSeparateDirectories(source.toFile(), source.resolve("output").toFile()));
        assertThrows(IOException.class, () -> FileOperationService.requireSeparateDirectories(source.toFile(), tempDir.toFile()));
        assertDoesNotThrow(() -> FileOperationService.requireSeparateDirectories(source.toFile(), other.resolve("output").toFile()));
    }

    @Test
    @org.junit.jupiter.api.condition.EnabledOnOs(org.junit.jupiter.api.condition.OS.WINDOWS)
    void junctionToSourceCannotBeUsedAsOutput(@TempDir Path tempDir) throws Exception {
        Path source = Files.createDirectories(tempDir.resolve("source"));
        Path original = Files.writeString(source.resolve("original.txt"), "keep original");
        Path junction = tempDir.resolve("source-junction");
        Process process = new ProcessBuilder("cmd", "/c", "mklink", "/J", junction.toString(), source.toString())
                .redirectErrorStream(true).start();
        assertTrue(process.waitFor(10, java.util.concurrent.TimeUnit.SECONDS), "Junction creation timed out");
        assertEquals(0, process.exitValue(), "Could not create a temporary junction");
        try {
            assertThrows(IOException.class, () ->
                    FileOperationService.requireSeparateDirectories(source.toFile(), junction.resolve("output").toFile()));
            assertEquals("keep original", Files.readString(original));
        } finally {
            Files.deleteIfExists(junction);
        }
    }

    @Test
    @org.junit.jupiter.api.condition.EnabledOnOs(org.junit.jupiter.api.condition.OS.WINDOWS)
    void junctionInsideOutputCannotRedirectCopies(@TempDir Path tempDir) throws Exception {
        Path input = Files.createDirectories(tempDir.resolve("input"));
        Path media = Files.writeString(Files.createDirectories(input.resolve("album")).resolve("photo.jpg"), "original");
        Path output = Files.createDirectories(tempDir.resolve("output"));
        Path outside = Files.createDirectories(tempDir.resolve("outside"));
        Path junction = output.resolve("album");
        Process process = new ProcessBuilder("cmd", "/c", "mklink", "/J", junction.toString(), outside.toString())
                .redirectErrorStream(true).start();
        assertTrue(process.waitFor(10, java.util.concurrent.TimeUnit.SECONDS), "Junction creation timed out");
        assertEquals(0, process.exitValue(), "Could not create a temporary junction");
        try {
            assertThrows(IOException.class, () -> new FileOperationService().copyToOutput(media.toFile(), input.toFile(), output.toFile()));
            assertFalse(Files.exists(outside.resolve("photo.jpg")));
            assertEquals("original", Files.readString(media));
        } finally {
            Files.deleteIfExists(junction);
        }
    }

    @Test
    void testRestoreDestinationThroughSymlinkIsRejected(@TempDir Path tempDir) throws IOException {
        Path source = Files.createDirectories(tempDir.resolve("source"));
        Path link = tempDir.resolve("source-link");
        try {
            Files.createSymbolicLink(link, source);
        } catch (UnsupportedOperationException | SecurityException | IOException e) {
            org.junit.jupiter.api.Assumptions.assumeTrue(false, "Symbolic links are unavailable: " + e.getMessage());
        }
        assertThrows(IOException.class, () ->
                FileOperationService.requireSeparateDirectories(source.toFile(), link.resolve("output").toFile()));
    }

    @Test
    void linkedOutputSubfolderCannotRedirectRestoredFiles(@TempDir Path tempDir) throws IOException {
        Path input = Files.createDirectories(tempDir.resolve("input"));
        Path source = Files.createDirectories(input.resolve("album")).resolve("photo.jpg");
        Files.writeString(source, "original");
        Path output = Files.createDirectories(tempDir.resolve("output"));
        Path outside = Files.createDirectories(tempDir.resolve("outside"));
        try {
            Files.createSymbolicLink(output.resolve("album"), outside);
        } catch (UnsupportedOperationException | SecurityException | IOException e) {
            org.junit.jupiter.api.Assumptions.assumeTrue(false, "Symbolic links are unavailable: " + e.getMessage());
        }
        FileOperationService service = new FileOperationService();
        assertThrows(IOException.class, () -> service.copyToOutput(source.toFile(), input.toFile(), output.toFile()));
        assertThrows(IOException.class, () -> service.copyToChronologicalOutput(source.toFile(), input.toFile(), output.toFile(), Instant.parse("2023-08-15T12:00:00Z")));
        assertFalse(Files.exists(outside.resolve("photo.jpg")));
        assertFalse(Files.exists(outside.resolve("2023")));
        assertEquals("original", Files.readString(source));
    }

    @Test
    void linkedReviewFolderCannotRedirectCopies(@TempDir Path tempDir) throws IOException {
        Path input = Files.createDirectories(tempDir.resolve("input"));
        Path source = Files.writeString(input.resolve("photo.jpg"), "original");
        Path output = Files.createDirectories(tempDir.resolve("output"));
        Path outside = Files.createDirectories(tempDir.resolve("outside"));
        try {
            Files.createSymbolicLink(output.resolve("metadata_not_found"), outside);
        } catch (UnsupportedOperationException | SecurityException | IOException e) {
            org.junit.jupiter.api.Assumptions.assumeTrue(false, "Symbolic links are unavailable: " + e.getMessage());
        }
        assertThrows(IOException.class, () -> new FileOperationService().copyToUnmatched(source.toFile(), input.toFile(), output.toFile()));
        assertFalse(Files.exists(outside.resolve("photo.jpg")));
    }

    @Test
    void testExistingDestinationIsNotOverwritten(@TempDir Path tempDir) throws IOException {
        Path source = tempDir.resolve("source.jpg");
        Path destination = tempDir.resolve("destination.jpg");
        Files.writeString(source, "original photo");
        Files.writeString(destination, "existing output");

        FileOperationService service = new FileOperationService();
        assertThrows(java.nio.file.FileAlreadyExistsException.class, () -> service.fastCopy(source, destination));
        assertEquals("existing output", Files.readString(destination));
        assertEquals("original photo", Files.readString(source));
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
        assertEquals(outputRoot.resolve("Family").resolve("2023").resolve("08").resolve("beach.jpg"), copied.toPath());
        File otherYear = service.copyToChronologicalOutput(sourceFile.toFile(), inputRoot.toFile(), outputRoot.toFile(), Instant.parse("2022-08-15T12:00:00Z"));
        assertEquals(outputRoot.resolve("Family").resolve("2022").resolve("08").resolve("beach.jpg"), otherYear.toPath());
    }
}
