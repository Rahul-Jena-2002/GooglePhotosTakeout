package com.takeoutfix.restore.infrastructure;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.io.TempDir;
import com.takeoutfix.restore.PowerManager;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.zip.ZipFile;

import static org.junit.jupiter.api.Assertions.*;

class RealPhotoRestorationTest {
    @TempDir Path tempDir;

    @AfterEach
    void releaseTemporaryWindowsExecutableBeforeJUnitCleanup() throws Exception {
        Path bin = tempDir.resolve(".takeoutfix").resolve("bin");
        if (!Files.isDirectory(bin)) return;
        List<Path> executables;
        try (var versions = Files.newDirectoryStream(bin, "exiftool-win-*")) {
            executables = new java.util.ArrayList<>();
            for (Path version : versions) executables.add(version.resolve("exiftool.exe"));
        }
        for (Path executable : executables) {
            // Windows can briefly retain the executable after the test process exits.
            for (int attempt = 0; ; attempt++) {
                try {
                    Files.deleteIfExists(executable);
                    break;
                } catch (java.nio.file.AccessDeniedException locked) {
                    if (attempt == 19) throw locked;
                    Thread.sleep(50);
                }
            }
        }
    }

    @Test
    void derivedOutputCannotOverlapTheOriginalFolder() throws Exception {
        Path input = Files.createDirectories(tempDir.resolve("TakeoutFix Restore").resolve("input"));
        Path photo = input.resolve("photo.jpg");
        byte[] original = "original synthetic file".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        Files.write(photo, original);
        NativeExifToolEngine engine = new NativeExifToolEngine();
        ExtractionService service = new ExtractionService(engine);
        try {
            var failure = assertThrows(java.util.concurrent.ExecutionException.class, () -> service.startExtraction(
                    input.toString(), tempDir.toString(), PowerManager.PostAction.KEEP_AWAKE_ONLY,
                    Optional.empty(), false, false, -1, 0, false, false).get(30, TimeUnit.SECONDS));
            assertTrue(failure.getCause().getMessage().contains("separate"));
            assertArrayEquals(original, Files.readAllBytes(photo));
            try (var files = Files.list(input)) { assertEquals(1, files.count()); }
        } finally {
            service.cancel();
            var field = ExtractionService.class.getDeclaredField("masterExecutor");
            field.setAccessible(true);
            ((ExecutorService) field.get(service)).shutdownNow();
            engine.cleanup();
        }
    }

    @Test
    void laterZipFailureKeepsAndChargesOnlyFinishedPart() throws Exception {
        Path input = Files.createDirectory(tempDir.resolve("partial-input"));
        Path output = Files.createDirectory(tempDir.resolve("partial-output"));
        assertTrue(ImageIO.write(new BufferedImage(4, 4, BufferedImage.TYPE_INT_RGB), "jpg", input.resolve("a.jpg").toFile()));
        Files.copy(input.resolve("a.jpg"), input.resolve("b.jpg"));
        var reserved = new java.util.concurrent.atomic.AtomicBoolean();
        var charged = new java.util.concurrent.atomic.AtomicInteger();
        var released = new java.util.concurrent.atomic.AtomicInteger();
        String oldHome = System.getProperty("user.home");
        System.setProperty("user.home", tempDir.toString());
        NativeExifToolEngine engine = new NativeExifToolEngine();
        ExtractionService service = new ExtractionService(engine) {
            @Override public boolean isGuestUser() { return true; }
            @Override protected com.takeoutfix.auth.GuestQuotaStore.ReservationAttempt tryReserveGuestBytes(long bytes) {
                boolean acquired = reserved.compareAndSet(false, true);
                return new com.takeoutfix.auth.GuestQuotaStore.ReservationAttempt(acquired
                        ? com.takeoutfix.auth.GuestQuotaStore.ReservationStatus.RESERVED
                        : com.takeoutfix.auth.GuestQuotaStore.ReservationStatus.WAIT, acquired ? new Object() : null);
            }
            @Override protected void finishGuestReservation(Object token, boolean completed) {
                if (completed) charged.incrementAndGet(); else released.incrementAndGet();
                reserved.set(false);
            }
        };
        var fileService = ExtractionService.class.getDeclaredField("fileService");
        fileService.setAccessible(true);
        fileService.set(service, new FileOperationService() {
            @Override public Path finishArchivePart(Path partial, int part) throws java.io.IOException {
                if (part == 2) throw new java.io.IOException("Synthetic second-part failure");
                return super.finishArchivePart(partial, part);
            }
        });
        try {
            assertThrows(java.util.concurrent.ExecutionException.class, () -> service.startExtraction(
                    input.toString(), output.toString(), PowerManager.PostAction.KEEP_AWAKE_ONLY,
                    Optional.empty(), false, true, -1, 0, false, false).get(30, TimeUnit.SECONDS));
            assertEquals(1, charged.get());
            assertEquals(1, released.get());
            try (var paths = Files.walk(output)) {
                var archives = paths.filter(path -> path.toString().endsWith(".zip")).toList();
                assertEquals(1, archives.size());
                try (ZipFile zip = new ZipFile(archives.get(0).toFile())) { assertEquals(1, zip.size()); }
            }
        } finally {
            service.cancel();
            var field = ExtractionService.class.getDeclaredField("masterExecutor");
            field.setAccessible(true);
            ((ExecutorService) field.get(service)).shutdownNow();
            engine.cleanup();
            System.setProperty("user.home", oldHome);
        }
    }

    @Test
    void failedZipFinalizationReleasesGuestReservation() throws Exception {
        Path input = Files.createDirectory(tempDir.resolve("failed-input"));
        Path output = Files.createDirectory(tempDir.resolve("failed-output"));
        assertTrue(ImageIO.write(new BufferedImage(4, 4, BufferedImage.TYPE_INT_RGB), "jpg", input.resolve("photo.jpg").toFile()));
        var charged = new java.util.concurrent.atomic.AtomicInteger();
        var released = new java.util.concurrent.atomic.AtomicInteger();
        String oldHome = System.getProperty("user.home");
        System.setProperty("user.home", tempDir.toString());
        NativeExifToolEngine engine = new NativeExifToolEngine();
        ExtractionService service = new ExtractionService(engine) {
            @Override public boolean isGuestUser() { return true; }
            @Override protected com.takeoutfix.auth.GuestQuotaStore.ReservationAttempt tryReserveGuestBytes(long bytes) {
                return new com.takeoutfix.auth.GuestQuotaStore.ReservationAttempt(
                        com.takeoutfix.auth.GuestQuotaStore.ReservationStatus.RESERVED, new Object());
            }
            @Override protected void finishGuestReservation(Object token, boolean completed) {
                if (completed) charged.incrementAndGet(); else released.incrementAndGet();
            }
        };
        var fileService = ExtractionService.class.getDeclaredField("fileService");
        fileService.setAccessible(true);
        fileService.set(service, new FileOperationService() {
            @Override public Path finishArchivePart(Path partial, int part) throws java.io.IOException {
                throw new java.io.IOException("Synthetic archive finalization failure");
            }
        });
        try {
            assertThrows(java.util.concurrent.ExecutionException.class, () -> service.startExtraction(
                    input.toString(), output.toString(), PowerManager.PostAction.KEEP_AWAKE_ONLY,
                    Optional.empty(), false, true, -1, 0, false, false).get(30, TimeUnit.SECONDS));
            assertEquals(0, charged.get());
            assertEquals(1, released.get());
        } finally {
            var field = ExtractionService.class.getDeclaredField("masterExecutor");
            field.setAccessible(true);
            ((ExecutorService) field.get(service)).shutdownNow();
            engine.cleanup();
            System.setProperty("user.home", oldHome);
        }
    }

    @Test
    void zipFinalizesWhenAnotherFileWaitsForQuota() throws Exception {
        Path input = Files.createDirectory(tempDir.resolve("waiting-input"));
        Path output = Files.createDirectory(tempDir.resolve("waiting-output"));
        Path existingArchive = output.resolve("Restored_Takeout_Part1.zip");
        byte[] existingBytes = "existing archive".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        Files.write(existingArchive, existingBytes);
        Files.createFile(input.resolve("a.jpg"));
        assertTrue(ImageIO.write(new BufferedImage(4, 4, BufferedImage.TYPE_INT_RGB), "jpg", input.resolve("b.jpg").toFile()));
        var reserved = new java.util.concurrent.atomic.AtomicBoolean();
        var charged = new java.util.concurrent.atomic.AtomicInteger();
        var committedFiles = new java.util.concurrent.atomic.AtomicLong();
        var committedBytes = new java.util.concurrent.atomic.AtomicLong();
        var filesAtStop = new java.util.concurrent.atomic.AtomicLong(-1);
        String oldHome = System.getProperty("user.home");
        System.setProperty("user.home", tempDir.toString());
        NativeExifToolEngine engine = new NativeExifToolEngine();
        ExtractionService service = new ExtractionService(engine) {
            @Override public boolean isGuestUser() { return true; }
            @Override protected com.takeoutfix.auth.GuestQuotaStore.ReservationAttempt tryReserveGuestBytes(long bytes) {
                boolean acquired = reserved.compareAndSet(false, true);
                return new com.takeoutfix.auth.GuestQuotaStore.ReservationAttempt(acquired
                        ? com.takeoutfix.auth.GuestQuotaStore.ReservationStatus.RESERVED
                        : com.takeoutfix.auth.GuestQuotaStore.ReservationStatus.WAIT, acquired ? new Object() : null);
            }
            @Override protected void finishGuestReservation(Object token, boolean completed) {
                if (completed) charged.incrementAndGet();
                reserved.set(false);
            }
        };
        service.addRestorationListener(new ExtractionService.RestorationListener() {
            @Override public void onLog(String level, String message) {}
            @Override public void onProgress(int processed, int total, long bytes, String action) {}
            @Override public void onStats(int scanned, int total, int restoredCount, int unmatched, int errors) {}
            @Override public void onUsageCommitted(long files, long bytes) {
                committedFiles.addAndGet(files);
                committedBytes.addAndGet(bytes);
            }
            @Override public void onStopped() { filesAtStop.set(committedFiles.get()); }
        });
        try {
            service.startExtraction(input.toString(), output.toString(), PowerManager.PostAction.KEEP_AWAKE_ONLY,
                    Optional.empty(), false, true, -1, 0, false, false).get(30, TimeUnit.SECONDS);
            assertEquals(2, charged.get());
            assertEquals(2, committedFiles.get());
            assertEquals(2, filesAtStop.get(), "Stop notification must follow committed usage");
            assertEquals(Files.size(input.resolve("b.jpg")), committedBytes.get());
            try (var paths = Files.walk(output)) {
                var archives = paths.filter(path -> path.toString().endsWith(".zip") && !path.equals(existingArchive)).toList();
                assertEquals(2, archives.size());
                var names = new java.util.HashSet<String>();
                for (Path archive : archives) {
                    try (ZipFile zip = new ZipFile(archive.toFile())) {
                        assertEquals(1, zip.size());
                        zip.stream().forEach(entry -> names.add(entry.getName()));
                    }
                }
                assertEquals(java.util.Set.of("waiting-input/a.jpg", "waiting-input/b.jpg"), names);
            }
            assertArrayEquals(existingBytes, Files.readAllBytes(existingArchive));
        } finally {
            service.cancel();
            var field = ExtractionService.class.getDeclaredField("masterExecutor");
            field.setAccessible(true);
            ((ExecutorService) field.get(service)).shutdownNow();
            engine.cleanup();
            System.setProperty("user.home", oldHome);
        }
    }

    @Test
    void cancelledZipDoesNotChargeUnfinishedEntries() throws Exception {
        Path input = Files.createDirectory(tempDir.resolve("quota-input"));
        Path output = Files.createDirectory(tempDir.resolve("quota-output"));
        assertTrue(ImageIO.write(new BufferedImage(4, 4, BufferedImage.TYPE_INT_RGB), "jpg", input.resolve("photo.jpg").toFile()));
        var charged = new java.util.concurrent.atomic.AtomicInteger();
        var committedFiles = new java.util.concurrent.atomic.AtomicLong();
        var filesAtStop = new java.util.concurrent.atomic.AtomicLong(-1);
        String oldHome = System.getProperty("user.home");
        System.setProperty("user.home", tempDir.toString());
        NativeExifToolEngine engine = new NativeExifToolEngine();
        ExtractionService service = new ExtractionService(engine) {
            @Override public boolean isGuestUser() { return true; }
            @Override protected com.takeoutfix.auth.GuestQuotaStore.ReservationAttempt tryReserveGuestBytes(long bytes) {
                return new com.takeoutfix.auth.GuestQuotaStore.ReservationAttempt(
                        com.takeoutfix.auth.GuestQuotaStore.ReservationStatus.RESERVED, new Object());
            }
            @Override protected void finishGuestReservation(Object token, boolean completed) {
                if (completed) charged.incrementAndGet();
            }
        };
        service.addRestorationListener(new ExtractionService.RestorationListener() {
            @Override public void onLog(String level, String message) { if (message.startsWith("Added ")) service.cancel(); }
            @Override public void onProgress(int processed, int total, long bytes, String action) {}
            @Override public void onStats(int scanned, int total, int restoredCount, int unmatched, int errors) {}
            @Override public void onUsageCommitted(long files, long bytes) { committedFiles.addAndGet(files); }
            @Override public void onStopped() { filesAtStop.set(committedFiles.get()); }
        });
        try {
            service.startExtraction(input.toString(), output.toString(), PowerManager.PostAction.KEEP_AWAKE_ONLY,
                    Optional.empty(), false, true, -1, 0, false, false).get(30, TimeUnit.SECONDS);
            assertTrue(service.isCancelled());
            assertEquals(0, charged.get(), "An unfinished ZIP must not consume guest quota");
            assertEquals(0, committedFiles.get(), "An unfinished ZIP must not count as completed output");
            assertEquals(0, filesAtStop.get(), "Cancellation must still notify the checkpoint listener");
        } finally {
            var field = ExtractionService.class.getDeclaredField("masterExecutor");
            field.setAccessible(true);
            ((ExecutorService) field.get(service)).shutdownNow();
            engine.cleanup();
            System.setProperty("user.home", oldHome);
        }
    }

    @Test
    void writesAndReadsMetadataOnACopyOfASyntheticJpeg() throws Exception {
        Path original = tempDir.resolve("photo.jpg");
        assertTrue(ImageIO.write(new BufferedImage(4, 4, BufferedImage.TYPE_INT_RGB), "jpg", original.toFile()));
        byte[] originalBytes = Files.readAllBytes(original);
        Path output = Files.copy(original, tempDir.resolve("restored.jpg"));
        Path sidecar = tempDir.resolve("photo.jpg.json");
        Files.writeString(sidecar, """
                {"photoTakenTime":{"timestamp":"1609459200"},
                 "geoData":{"latitude":12.34,"longitude":-56.78},
                 "description":"Synthetic test photo"}
                """);
        var matched = new MetadataMatcher().findMatchingJson(original.toFile(), new HashMap<>());
        assertEquals(sidecar.toFile(), matched.orElseThrow());

        String originalHome = System.getProperty("user.home");
        NativeExifToolEngine engine;
        try {
            System.setProperty("user.home", tempDir.toString());
            engine = new NativeExifToolEngine();
        } finally {
            System.setProperty("user.home", originalHome);
        }
        try {
            assertTrue(new MetadataInjector(engine).injectMetadataAndAlbum(output.toFile(), matched.orElseThrow(), null, null));
            String outputJson = String.join("\n", engine.executeWithOutput(List.of(
                    "-json", "-n", "-DateTimeOriginal", "-GPSLatitude", "-GPSLongitude", "-ImageDescription", output.toString())));
            JSONObject tags = new JSONArray(outputJson).getJSONObject(0);
            assertEquals("2021:01:01 00:00:00", tags.getString("DateTimeOriginal"));
            assertEquals(12.34, tags.getDouble("GPSLatitude"), 0.0001);
            assertEquals(-56.78, tags.getDouble("GPSLongitude"), 0.0001);
            assertEquals("Synthetic test photo", tags.getString("ImageDescription"));
            assertArrayEquals(originalBytes, Files.readAllBytes(original));
        } finally {
            engine.cleanup();
        }
    }

    @Test
    void restoresSyntheticFolderWithoutChangingOriginal() throws Exception {
        Path input = Files.createDirectory(tempDir.resolve("input"));
        Path destination = Files.createDirectory(tempDir.resolve("destination"));
        Path photo = input.resolve("photo.jpg");
        assertTrue(ImageIO.write(new BufferedImage(4, 4, BufferedImage.TYPE_INT_RGB), "jpg", photo.toFile()));
        byte[] original = Files.readAllBytes(photo);
        Path unmatched = Files.copy(photo, input.resolve("unmatched.jpg"));
        Files.writeString(input.resolve("photo.jpg.json"),
                "{\"photoTakenTime\":{\"timestamp\":\"1609459200\"},\"description\":\"Folder test\"}");

        String oldHome = System.getProperty("user.home");
        String oldHeadless = System.getProperty("java.awt.headless");
        System.setProperty("user.home", tempDir.toString());
        System.setProperty("java.awt.headless", "true");
        NativeExifToolEngine engine = new NativeExifToolEngine();
        ExtractionService service = new ExtractionService(engine) {
            @Override public boolean isGuestUser() { return false; }
        };
        var committedFiles = new java.util.concurrent.atomic.AtomicLong();
        var committedBytes = new java.util.concurrent.atomic.AtomicLong();
        service.addRestorationListener(new ExtractionService.RestorationListener() {
            @Override public void onLog(String level, String message) {}
            @Override public void onProgress(int processed, int total, long bytes, String action) {}
            @Override public void onStats(int scanned, int total, int restoredCount, int unmatched, int errors) {}
            @Override public void onUsageCommitted(long files, long bytes) {
                committedFiles.addAndGet(files);
                committedBytes.addAndGet(bytes);
            }
        });
        try {
            service.startExtraction(input.toString(), destination.toString(), PowerManager.PostAction.KEEP_AWAKE_ONLY,
                    Optional.empty(), false, false, -1, 0, false, false).get(30, TimeUnit.SECONDS);
            assertEquals(2, committedFiles.get());
            assertEquals(original.length * 2L, committedBytes.get());
            Path restored;
            try (var paths = Files.walk(destination)) {
                restored = paths.filter(path -> path.getFileName().toString().equals("photo.jpg"))
                        .findFirst().orElseThrow();
            }
            String json = String.join("\n", engine.executeWithOutput(List.of("-json", "-DateTimeOriginal", "-ImageDescription", restored.toString())));
            JSONObject tags = new JSONArray(json).getJSONObject(0);
            assertEquals("2021:01:01 00:00:00", tags.getString("DateTimeOriginal"));
            assertEquals("Folder test", tags.getString("ImageDescription"));
            assertArrayEquals(original, Files.readAllBytes(photo));
            Path unmatchedOutput;
            try (var paths = Files.walk(destination)) {
                unmatchedOutput = paths.filter(path -> path.getFileName().toString().equals("unmatched.jpg"))
                        .findFirst().orElseThrow();
            }
            assertTrue(unmatchedOutput.toString().contains("metadata_not_found"));
            assertArrayEquals(original, Files.readAllBytes(unmatchedOutput));
            assertArrayEquals(original, Files.readAllBytes(unmatched));

            byte[] existingOutput = "existing file must not be overwritten".getBytes(java.nio.charset.StandardCharsets.UTF_8);
            Files.write(restored, existingOutput);
            var error = assertThrows(java.util.concurrent.ExecutionException.class, () ->
                    service.startExtraction(input.toString(), destination.toString(), PowerManager.PostAction.KEEP_AWAKE_ONLY,
                            Optional.empty(), false, false, -1, 0, false, false).get(30, TimeUnit.SECONDS));
            assertTrue(error.getCause().getMessage().contains("Cannot safely resume"));
            assertEquals(2, committedFiles.get());
            assertEquals(original.length * 2L, committedBytes.get());
            assertArrayEquals(existingOutput, Files.readAllBytes(restored));
            assertArrayEquals(original, Files.readAllBytes(photo));

            Path zipDestination = Files.createDirectory(tempDir.resolve("zip-destination"));
            service.startExtraction(input.toString(), zipDestination.toString(), PowerManager.PostAction.KEEP_AWAKE_ONLY,
                    Optional.empty(), false, true, -1, 0, false, false).get(30, TimeUnit.SECONDS);
            assertEquals(4, committedFiles.get());
            assertEquals(original.length * 4L, committedBytes.get());
            Path archive;
            try (var paths = Files.walk(zipDestination)) {
                archive = paths.filter(path -> path.toString().endsWith(".zip")).findFirst().orElseThrow();
            }
            Path extracted = tempDir.resolve("zip-output.jpg");
            try (ZipFile zip = new ZipFile(archive.toFile())) {
                var entry = zip.stream().filter(item -> item.getName().endsWith("/photo.jpg")).findFirst().orElseThrow();
                try (var stream = zip.getInputStream(entry)) {
                    Files.copy(stream, extracted);
                }
                var unmatchedEntry = zip.stream().filter(item -> item.getName().endsWith("/unmatched.jpg")).findFirst().orElseThrow();
                try (var stream = zip.getInputStream(unmatchedEntry)) {
                    assertArrayEquals(original, stream.readAllBytes());
                }
            }
            String zipJson = String.join("\n", engine.executeWithOutput(List.of("-json", "-DateTimeOriginal", "-ImageDescription", extracted.toString())));
            JSONObject zipTags = new JSONArray(zipJson).getJSONObject(0);
            assertEquals("2021:01:01 00:00:00", zipTags.getString("DateTimeOriginal"));
            assertEquals("Folder test", zipTags.getString("ImageDescription"));
            assertArrayEquals(original, Files.readAllBytes(photo));

            Path cancelledDestination = Files.createDirectory(tempDir.resolve("cancelled-destination"));
            service.addRestorationListener(new ExtractionService.RestorationListener() {
                @Override public void onLog(String level, String message) {
                    if (message.startsWith("Added ")) service.cancel();
                }
                @Override public void onProgress(int processed, int total, long bytes, String action) {}
                @Override public void onStats(int scanned, int total, int restoredCount, int unmatched, int errors) {}
            });
            service.startExtraction(input.toString(), cancelledDestination.toString(), PowerManager.PostAction.KEEP_AWAKE_ONLY,
                    Optional.empty(), false, true, -1, 0, false, false).get(30, TimeUnit.SECONDS);
            assertTrue(service.isCancelled());
            assertEquals(4, committedFiles.get());
            assertEquals(original.length * 4L, committedBytes.get());
            try (var paths = Files.walk(cancelledDestination)) {
                assertTrue(paths.anyMatch(path -> path.toString().endsWith(".zip.partial")));
            }
            try (var paths = Files.walk(cancelledDestination)) {
                assertFalse(paths.anyMatch(path -> path.toString().endsWith(".zip")));
            }
            assertArrayEquals(original, Files.readAllBytes(photo));
        } finally {
            var field = ExtractionService.class.getDeclaredField("masterExecutor");
            field.setAccessible(true);
            ((ExecutorService) field.get(service)).shutdownNow();
            engine.cleanup();
            System.setProperty("user.home", oldHome);
            if (oldHeadless == null) System.clearProperty("java.awt.headless");
            else System.setProperty("java.awt.headless", oldHeadless);
        }
    }
}
