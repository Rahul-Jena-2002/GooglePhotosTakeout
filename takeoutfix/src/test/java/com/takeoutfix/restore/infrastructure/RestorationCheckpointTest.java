package com.takeoutfix.restore.infrastructure;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

class RestorationCheckpointTest {
    @Test
    void unexpectedCheckpointCreatedAfterLoadIsNotOverwrittenOrDeleted(@TempDir Path root) throws Exception {
        RestorationCheckpoint checkpoint = RestorationCheckpoint.load(root.toFile(), root.toFile());
        Path existing = Files.writeString(root.resolve(RestorationCheckpoint.CHECKPOINT_FILENAME), "keep this file");

        checkpoint.flush(false);
        assertTrue(checkpoint.hasFlushFailed());
        assertEquals("keep this file", Files.readString(existing));
        checkpoint.deleteCheckpointFile();
        assertEquals("keep this file", Files.readString(existing));
        Files.delete(existing);
        checkpoint.flush(false);
        assertFalse(checkpoint.hasFlushFailed());
    }

    @Test
    void checkpointPathCannotBeASymbolicLink(@TempDir Path root) throws Exception {
        Path outside = Files.writeString(root.resolve("unrelated.txt"), "leave unchanged");
        Path link = root.resolve(RestorationCheckpoint.CHECKPOINT_FILENAME);
        try {
            Files.createSymbolicLink(link, outside);
        } catch (UnsupportedOperationException | SecurityException | java.io.IOException e) {
            org.junit.jupiter.api.Assumptions.assumeTrue(false, "Symbolic links are unavailable: " + e.getMessage());
        }
        assertThrows(IllegalStateException.class, () -> RestorationCheckpoint.load(root.toFile(), root.toFile()));
        assertEquals("leave unchanged", Files.readString(outside));
        assertTrue(Files.isSymbolicLink(link));
    }

    @Test
    void checkpointDoesNotOverwriteOrDeleteExistingTemporaryName(@TempDir Path root) throws Exception {
        Path existing = Files.writeString(root.resolve(RestorationCheckpoint.CHECKPOINT_FILENAME + ".tmp"), "keep this file");
        RestorationCheckpoint checkpoint = RestorationCheckpoint.load(root.toFile(), root.toFile());
        checkpoint.flush(false);
        assertTrue(Files.isRegularFile(root.resolve(RestorationCheckpoint.CHECKPOINT_FILENAME)));
        assertEquals("keep this file", Files.readString(existing));
        checkpoint.deleteCheckpointFile();
        assertEquals("keep this file", Files.readString(existing));
    }

    @Test
    void incompleteFlushClearsPriorCompletedState(@TempDir Path root) {
        RestorationCheckpoint checkpoint = RestorationCheckpoint.load(root.toFile(), root.toFile());
        checkpoint.flush(true);
        assertTrue(checkpoint.isCompleted());
        checkpoint.flush(false);
        assertFalse(checkpoint.isCompleted());
        assertFalse(RestorationCheckpoint.load(root.toFile(), root.toFile()).isCompleted());
    }

    @Test
    void zipOutputDoesNotResumeOrCreateCheckpoints(@TempDir Path root) throws Exception {
        Path checkpoint = root.resolve(RestorationCheckpoint.CHECKPOINT_FILENAME);
        Files.writeString(checkpoint, "existing checkpoint");
        assertNull(RestorationCheckpoint.loadForOutput(root.toFile(), root.toFile(), true));
        assertEquals("existing checkpoint", Files.readString(checkpoint));
        assertThrows(IllegalStateException.class, () -> RestorationCheckpoint.loadForOutput(root.toFile(), root.toFile(), false));
    }

    @Test
    void differentSourcesWithSameNameDoNotShareCompletedFiles(@TempDir Path root) throws Exception {
        Path first = Files.createDirectories(root.resolve("first/export"));
        Path second = Files.createDirectories(root.resolve("second/export"));
        Path output = Files.createDirectories(root.resolve("output"));
        Files.writeString(first.resolve("photo.jpg"), "source");
        Path restored = Files.writeString(output.resolve("photo.jpg"), "photo");
        RestorationCheckpoint checkpoint = RestorationCheckpoint.load(output.toFile(), first.toFile());
        checkpoint.recordCompletedFile("photo.jpg", true, false, false, 5, restored);
        checkpoint.flush(false);

        assertTrue(RestorationCheckpoint.load(output.toFile(), first.toFile()).isFileAlreadyProcessed("photo.jpg"));
        assertThrows(IllegalStateException.class, () -> RestorationCheckpoint.load(output.toFile(), second.toFile()));
    }

    @Test
    void failedFileIsNotMarkedAsCompleted(@TempDir Path root) {
        RestorationCheckpoint checkpoint = RestorationCheckpoint.load(root.toFile(), root.toFile());
        checkpoint.recordCompletedFile("failed.jpg", false, true, true, 5, null);
        assertFalse(checkpoint.isFileAlreadyProcessed("failed.jpg"));
        assertEquals(1, checkpoint.getErrorCount());
        assertEquals(0, checkpoint.getUnmatchedCount());
        assertEquals(0, checkpoint.getProcessedBytes());
    }

    @Test
    void retryDoesNotCarryErrorsFromPreviousRun(@TempDir Path root) throws Exception {
        Path restored = Files.writeString(root.resolve("restored.jpg"), "photo");
        Path retried = Files.writeString(root.resolve("failed.jpg"), "photo");
        RestorationCheckpoint first = RestorationCheckpoint.load(root.toFile(), root.toFile());
        first.recordCompletedFile("restored.jpg", true, false, false, 5, restored);
        first.recordCompletedFile("failed.jpg", false, false, true, 5, null);
        first.flush(false);

        RestorationCheckpoint retry = RestorationCheckpoint.load(root.toFile(), root.toFile());
        assertTrue(retry.isFileAlreadyProcessed("restored.jpg"));
        assertFalse(retry.isFileAlreadyProcessed("failed.jpg"));
        assertEquals(0, retry.getErrorCount());
        retry.recordCompletedFile("failed.jpg", true, false, false, 5, retried);
        assertEquals(0, retry.getErrorCount());
        assertEquals(2, retry.getCompletedCount());
    }

    @Test
    void missingOrChangedOutputCannotBeSkipped(@TempDir Path root) throws Exception {
        Path output = Files.writeString(root.resolve("photo.jpg"), "photo");
        RestorationCheckpoint checkpoint = RestorationCheckpoint.load(root.toFile(), root.toFile());
        checkpoint.recordCompletedFile("photo.jpg", true, false, false, 5, output);
        checkpoint.flush(false);
        RestorationCheckpoint retry = RestorationCheckpoint.load(root.toFile(), root.toFile());
        Files.writeString(output, "different contents");
        assertThrows(IllegalStateException.class, () -> retry.isFileAlreadyProcessed("photo.jpg"));
        Files.delete(output);
        assertThrows(IllegalStateException.class, () -> retry.isFileAlreadyProcessed("photo.jpg"));
        assertThrows(IllegalStateException.class, () -> RestorationCheckpoint.load(root.toFile(), root.toFile()));
    }

    @Test
    void legacyCheckpointWithoutOutputPathsIsNotTrusted(@TempDir Path root) throws Exception {
        String source = root.toFile().getAbsolutePath();
        String json = new org.json.JSONObject().put("sourcePath", source)
                .put("completedFiles", new org.json.JSONArray().put("photo.jpg")).toString();
        Files.writeString(root.resolve(RestorationCheckpoint.CHECKPOINT_FILENAME), json);
        assertThrows(IllegalStateException.class, () -> RestorationCheckpoint.load(root.toFile(), root.toFile()));
    }

    @Test
    void changedSourceCannotBeSkipped(@TempDir Path root) throws Exception {
        Path sourceDir = Files.createDirectory(root.resolve("source"));
        Path outputDir = Files.createDirectory(root.resolve("output"));
        Path source = Files.writeString(sourceDir.resolve("photo.jpg"), "original");
        Path output = Files.writeString(outputDir.resolve("photo.jpg"), "restored");
        RestorationCheckpoint checkpoint = RestorationCheckpoint.load(outputDir.toFile(), sourceDir.toFile());
        checkpoint.recordCompletedFile("photo.jpg", true, false, false, 8, output);
        checkpoint.flush(false);
        Files.writeString(source, "changed source");
        assertThrows(IllegalStateException.class, () -> RestorationCheckpoint.load(outputDir.toFile(), sourceDir.toFile()));
    }

    @Test
    void malformedCheckpointDoesNotSilentlyStartFresh(@TempDir Path root) throws Exception {
        Files.writeString(root.resolve(RestorationCheckpoint.CHECKPOINT_FILENAME), "{broken");
        assertThrows(IllegalStateException.class, () -> RestorationCheckpoint.load(root.toFile(), root.toFile()));
    }

    @Test
    void checkpointCannotPointOutsideOutputFolder(@TempDir Path root) throws Exception {
        Path sourceDir = Files.createDirectory(root.resolve("source"));
        Path outputDir = Files.createDirectory(root.resolve("output"));
        Files.writeString(sourceDir.resolve("photo.jpg"), "source");
        Path output = Files.writeString(outputDir.resolve("photo.jpg"), "restored");
        RestorationCheckpoint checkpoint = RestorationCheckpoint.load(outputDir.toFile(), sourceDir.toFile());
        checkpoint.recordCompletedFile("photo.jpg", true, false, false, 6, output);
        checkpoint.flush(false);

        Path checkpointFile = outputDir.resolve(RestorationCheckpoint.CHECKPOINT_FILENAME);
        var json = new org.json.JSONObject(Files.readString(checkpointFile));
        json.getJSONObject("outputs").getJSONObject("photo.jpg").put("path", "../outside.jpg");
        Files.writeString(checkpointFile, json.toString());
        assertThrows(IllegalStateException.class, () -> RestorationCheckpoint.load(outputDir.toFile(), sourceDir.toFile()));
    }

    @Test
    void changedRestoreSettingsCannotReuseCheckpoint(@TempDir Path root) throws Exception {
        Path sourceDir = Files.createDirectory(root.resolve("source"));
        Path outputDir = Files.createDirectory(root.resolve("output"));
        Files.writeString(sourceDir.resolve("photo.jpg"), "source");
        Path output = Files.writeString(outputDir.resolve("photo.jpg"), "restored");
        RestorationCheckpoint checkpoint = RestorationCheckpoint.load(outputDir.toFile(), sourceDir.toFile(), "organize=true");
        checkpoint.recordCompletedFile("photo.jpg", true, false, false, 6, output);
        checkpoint.flush(false);
        assertTrue(RestorationCheckpoint.load(outputDir.toFile(), sourceDir.toFile(), "organize=true").isFileAlreadyProcessed("photo.jpg"));
        assertThrows(IllegalStateException.class, () -> RestorationCheckpoint.load(outputDir.toFile(), sourceDir.toFile(), "organize=false"));
    }

    @Test
    void changedSidecarStopsResume(@TempDir Path root) throws Exception {
        Path sourceDir = Files.createDirectory(root.resolve("source"));
        Path outputDir = Files.createDirectory(root.resolve("output"));
        Files.writeString(sourceDir.resolve("photo.jpg"), "source");
        Path sidecar = Files.writeString(sourceDir.resolve("photo.jpg.json"), "{\"date\":1}");
        Path output = Files.writeString(outputDir.resolve("photo.jpg"), "restored");
        RestorationCheckpoint checkpoint = RestorationCheckpoint.load(outputDir.toFile(), sourceDir.toFile());
        checkpoint.recordCompletedFile("photo.jpg", true, false, false, 6, output);
        checkpoint.flush(false);

        var timestamp = Files.getLastModifiedTime(sidecar);
        Files.writeString(sidecar, "{\"date\":2}");
        Files.setLastModifiedTime(sidecar, timestamp);
        assertThrows(IllegalStateException.class, () -> RestorationCheckpoint.load(outputDir.toFile(), sourceDir.toFile()));
    }

    @Test
    void newlyAddedSidecarStopsResume(@TempDir Path root) throws Exception {
        Path sourceDir = Files.createDirectory(root.resolve("source"));
        Path outputDir = Files.createDirectory(root.resolve("output"));
        Files.writeString(sourceDir.resolve("photo.jpg"), "source");
        Path output = Files.writeString(outputDir.resolve("photo.jpg"), "restored");
        RestorationCheckpoint checkpoint = RestorationCheckpoint.load(outputDir.toFile(), sourceDir.toFile());
        checkpoint.recordCompletedFile("photo.jpg", false, true, false, 6, output);
        checkpoint.flush(false);

        Files.writeString(sourceDir.resolve("photo.jpg.json"), "{}");
        assertThrows(IllegalStateException.class, () -> RestorationCheckpoint.load(outputDir.toFile(), sourceDir.toFile()));
    }
}
