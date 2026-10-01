package com.takeoutfix.studio;

import com.takeoutfix.restore.infrastructure.NativeExifToolEngine;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.BasicFileAttributeView;
import java.nio.file.attribute.FileTime;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.BiConsumer;

/**
 * Core processing engine for Photo Studio batch operations.
 * Performs deep metadata writing (EXIF, IPTC, XMP, QuickTime) via NativeExifToolEngine
 * and synchronizes OS filesystem timestamps.
 */
public class PhotoStudioService {

    private final NativeExifToolEngine exifToolEngine;

    public interface ProgressCallback {
        void onProgress(int current, int total, StudioFileItem item);
    }

    public static class BatchResult {
        private final int total;
        private final int successful;
        private final int failed;
        private final List<String> errors;

        public BatchResult(int total, int successful, int failed, List<String> errors) {
            this.total = total;
            this.successful = successful;
            this.failed = failed;
            this.errors = errors;
        }

        public int getTotal() { return total; }
        public int getSuccessful() { return successful; }
        public int getFailed() { return failed; }
        public List<String> getErrors() { return errors; }
    }

    public PhotoStudioService(NativeExifToolEngine exifToolEngine) {
        this.exifToolEngine = exifToolEngine;
    }

    /**
     * Reads the current original date of a file via ExifTool or filesystem timestamp.
     */
    public LocalDateTime readOriginalDate(File file) {
        if (file == null || !file.exists()) {
            return null;
        }

        if (exifToolEngine != null) {
            List<String> output = exifToolEngine.executeWithOutput(List.of(
                    "-s3",
                    "-d", "%Y-%m-%d %H:%M:%S",
                    "-DateTimeOriginal",
                    file.getAbsolutePath()
            ));
            if (!output.isEmpty()) {
                LocalDateTime dt = DateShiftCalculator.parseDate(output.get(0));
                if (dt != null) return dt;
            }

            // Fallback to CreateDate
            output = exifToolEngine.executeWithOutput(List.of(
                    "-s3",
                    "-d", "%Y-%m-%d %H:%M:%S",
                    "-CreateDate",
                    file.getAbsolutePath()
            ));
            if (!output.isEmpty()) {
                LocalDateTime dt = DateShiftCalculator.parseDate(output.get(0));
                if (dt != null) return dt;
            }
        }

        // Filesystem lastModifiedTime fallback
        try {
            long millis = file.lastModified();
            if (millis > 0) {
                return LocalDateTime.ofInstant(java.time.Instant.ofEpochMilli(millis), ZoneId.systemDefault());
            }
        } catch (Exception ignored) {}

        return LocalDateTime.now();
    }

    /**
     * Builds the ExifTool command arguments for a file edit.
     */
    public List<String> buildExifArgs(File targetFile, LocalDateTime newDate, StudioEditRequest request) {
        List<String> args = new ArrayList<>();
        args.add("-overwrite_original_in_place");

        String name = targetFile.getName().toLowerCase(Locale.ROOT);
        boolean isVideo = name.endsWith(".mp4") || name.endsWith(".mov") || name.endsWith(".m4v") || name.endsWith(".avi");

        // 1. Date Tags
        if (newDate != null && request.getDateMode() != StudioEditRequest.DateMode.NONE) {
            String exifDate = DateShiftCalculator.toExifString(newDate);
            if (!isVideo) {
                args.add("-DateTimeOriginal=" + exifDate);
                args.add("-CreateDate=" + exifDate);
                args.add("-ModifyDate=" + exifDate);
            } else {
                args.add("-CreateDate=" + exifDate);
                args.add("-ModifyDate=" + exifDate);
                args.add("-TrackCreateDate=" + exifDate);
                args.add("-TrackModifyDate=" + exifDate);
                args.add("-MediaCreateDate=" + exifDate);
                args.add("-MediaModifyDate=" + exifDate);
            }
        }

        // 2. Geotagging / Location
        if (request.isStripGps()) {
            args.add("-gps:all=");
        } else if (request.isUpdateLocation() && request.getLatitude() != null && request.getLongitude() != null) {
            double lat = request.getLatitude();
            double lon = request.getLongitude();
            args.add("-GPSLatitude=" + Math.abs(lat));
            args.add("-GPSLatitudeRef=" + (lat >= 0 ? "N" : "S"));
            args.add("-GPSLongitude=" + Math.abs(lon));
            args.add("-GPSLongitudeRef=" + (lon >= 0 ? "E" : "W"));
        }

        // 3. Creator Presets
        if (request.isUpdatePresets()) {
            if (request.getArtist() != null && !request.getArtist().isBlank()) {
                args.add("-Artist=" + request.getArtist().trim());
            }
            if (request.getCopyright() != null && !request.getCopyright().isBlank()) {
                args.add("-Copyright=" + request.getCopyright().trim());
            }
            if (request.getDescription() != null && !request.getDescription().isBlank()) {
                args.add("-ImageDescription=" + request.getDescription().trim());
            }
        }

        args.add(targetFile.getAbsolutePath());
        return args;
    }

    /**
     * Executes the batch edit asynchronously with AtomicBoolean cancellation support.
     */
    public CompletableFuture<BatchResult> executeBatchAsync(
            List<StudioFileItem> items,
            StudioEditRequest request,
            ProgressCallback callback,
            AtomicBoolean cancelToken) {
        com.takeoutfix.shared.task.CancellationToken token = null;
        if (cancelToken != null) {
            token = new com.takeoutfix.shared.task.CancellationToken();
            if (cancelToken.get()) {
                token.cancel();
            }
        }
        return executeBatchAsync(items, request, callback, token);
    }

    /**
     * Executes the batch edit asynchronously with cooperative pause and cancellation support.
     */
    public CompletableFuture<BatchResult> executeBatchAsync(
            List<StudioFileItem> items,
            StudioEditRequest request,
            ProgressCallback callback,
            com.takeoutfix.shared.task.CancellationToken token) {

        return CompletableFuture.supplyAsync(() -> {
            int total = items.size();

            File outDir = request.getOutputDirectory();
            if (!request.isInPlace()) {
                if (outDir == null) {
                    File fallbackBase = (items != null && !items.isEmpty() && items.get(0).getFile() != null && items.get(0).getFile().getParentFile() != null)
                            ? items.get(0).getFile().getParentFile()
                            : new File(System.getProperty("user.home"));
                    outDir = new File(new File(fallbackBase, "TakeoutFix_Studio_Export"), "Studio_Output");
                }
                if (!outDir.exists()) {
                    outDir.mkdirs();
                }
            }

            int targetThreads = Math.min(Math.max(items.size(), 1), Math.max(4, Runtime.getRuntime().availableProcessors()));
            java.util.concurrent.ExecutorService pool = java.util.concurrent.Executors.newFixedThreadPool(targetThreads);
            java.util.concurrent.atomic.AtomicInteger successCounter = new java.util.concurrent.atomic.AtomicInteger(0);
            java.util.concurrent.atomic.AtomicInteger failedCounter = new java.util.concurrent.atomic.AtomicInteger(0);
            java.util.concurrent.atomic.AtomicInteger processedCounter = new java.util.concurrent.atomic.AtomicInteger(0);
            List<String> errors = java.util.Collections.synchronizedList(new ArrayList<>());
            List<CompletableFuture<Void>> futures = new ArrayList<>();

            for (int i = 0; i < total; i++) {
                final int idx = i;
                final StudioFileItem item = items.get(idx);
                final File effectiveOutDir = outDir;

                futures.add(CompletableFuture.runAsync(() -> {
                    if (token != null) {
                        if (token.isCancelled()) {
                            return;
                        }
                        token.checkPauseAndCancel();
                    }
                    item.setStatus("Processing...");

                    try {
                        File target = item.getFile();

                        // If non-destructive, copy to export folder first
                        if (!request.isInPlace() && effectiveOutDir != null) {
                            File dest = new File(effectiveOutDir, item.getFileName());
                            Files.copy(item.getFile().toPath(), dest.toPath(), StandardCopyOption.REPLACE_EXISTING);
                            target = dest;
                        }

                        // Calculate the designated new date
                        LocalDateTime calculatedDate = DateShiftCalculator.calculateNewDate(
                                item.getOriginalDate(), request, idx);
                        item.setNewDate(calculatedDate);

                        // Execute ExifTool
                        List<String> args = buildExifArgs(target, calculatedDate, request);
                        boolean ok = (exifToolEngine == null) || exifToolEngine.execute(args);

                        if (ok) {
                            // Synchronize OS filesystem attributes
                            if (request.isSyncOsTimestamps() && calculatedDate != null) {
                                syncOsFileTime(target.toPath(), calculatedDate);
                            }
                            item.setStatus("Completed");
                            successCounter.incrementAndGet();
                        } else {
                            item.setStatus("Failed");
                            item.setDetails("ExifTool returned an error.");
                            failedCounter.incrementAndGet();
                            errors.add(item.getFileName() + ": ExifTool write error");
                        }
                    } catch (Exception ex) {
                        item.setStatus("Error");
                        item.setDetails(ex.getMessage());
                        failedCounter.incrementAndGet();
                        errors.add(item.getFileName() + ": " + ex.getMessage());
                    }

                    int done = processedCounter.incrementAndGet();
                    if (callback != null) callback.onProgress(done, total, item);
                }, pool));
            }

            try {
                CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();
            } finally {
                pool.shutdown();
            }

            return new BatchResult(total, successCounter.get(), failedCounter.get(), new ArrayList<>(errors));
        });
    }

    private void syncOsFileTime(Path path, LocalDateTime dt) {
        try {
            long millis = dt.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
            FileTime time = FileTime.fromMillis(millis);
            Files.setLastModifiedTime(path, time);

            BasicFileAttributeView view = Files.getFileAttributeView(path, BasicFileAttributeView.class);
            if (view != null) {
                view.setTimes(time, time, time);
            }
        } catch (IOException ignored) {}
    }
}
