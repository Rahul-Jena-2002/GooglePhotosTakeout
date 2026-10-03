package com.takeoutfix.restore.infrastructure;

import java.io.File;
import java.nio.file.Files;
import java.time.Instant;
import java.util.*;

import org.json.JSONObject;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Orchestrates the metadata restoration process.
 */
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.util.concurrent.atomic.AtomicLong;
import com.takeoutfix.shared.util.FilenameDateParser;
import com.takeoutfix.restore.PowerManager;
import com.takeoutfix.restore.SessionStatsService;
import com.takeoutfix.auth.UserService;
import com.takeoutfix.auth.UserController;
import com.takeoutfix.auth.GuestQuotaStore;

@Service
public class ExtractionService {

    private MediaScanner scanner;
    private MetadataMatcher matcher;
    private TimestampRestorer restorer;
    private MetadataInjector metadataInjector;
    private FileOperationService fileService;
    private SessionStatsService sessionStatsService;
    private UserService userService;

    public ExtractionService() {
        this(NativeExifToolEngine.getDefault());
    }

    public ExtractionService(NativeExifToolEngine exifToolEngine) {
        this.scanner = new MediaScanner();
        this.matcher = new MetadataMatcher();
        this.restorer = new TimestampRestorer();
        this.metadataInjector = new MetadataInjector(exifToolEngine);
        this.fileService = new FileOperationService();
        this.sessionStatsService = new SessionStatsService();
        this.userService = new UserService();
    }

    @Autowired
    public ExtractionService(MediaScanner scanner, MetadataMatcher matcher, TimestampRestorer restorer,
                             MetadataInjector metadataInjector, FileOperationService fileService,
                             SessionStatsService sessionStatsService, UserService userService) {
        this.scanner = scanner;
        this.matcher = matcher;
        this.restorer = restorer;
        this.metadataInjector = metadataInjector;
        this.fileService = fileService;
        this.sessionStatsService = sessionStatsService;
        this.userService = userService;
    }

    private volatile boolean paused = false;
    private volatile boolean cancelled = false;
    private volatile boolean isRunning = false;
    private volatile RestorationCheckpoint activeCheckpoint = null;
    private final java.util.concurrent.atomic.AtomicInteger processed = new java.util.concurrent.atomic.AtomicInteger(0);
    private final AtomicLong processedBytes = new AtomicLong(0);
    private int totalFiles = 0;

    private volatile int limitFiles = -1;
    private volatile int offsetFiles = 0;
    private volatile boolean interpolateMissing = false;
    private volatile boolean organizeYearMonth = false;
    private java.io.PrintWriter logWriter = null;
    private final List<java.util.concurrent.CompletableFuture<?>> activeFutures = new java.util.concurrent.CopyOnWriteArrayList<>();
    private volatile ExecutorService activeWorkersPool = null;
    
    private final Map<String, List<File>> dirSortedMediaCache = new java.util.concurrent.ConcurrentHashMap<>();
    private final Map<String, Instant> mediaTimestampCache = new java.util.concurrent.ConcurrentHashMap<>();
    
    private volatile long startTimeMs = 0;
    
    public interface RestorationListener {
        void onLog(String level, String message);
        void onProgress(int processed, int total, long processedBytes, String currentAction);
        default void onProgressTelemetry(int processed, int total, long processedBytes, String currentAction, long elapsedSec, long etaSec, double filesPerSec, double mbPerSec) {
            onProgress(processed, total, processedBytes, currentAction);
        }
        void onStats(int scanned, int total, int restored, int unmatched, int errors);
        default void onGuestLimitReached() {}
        default void onComplete() {}
        default void onError(Throwable t) {}
    }

    private final List<RestorationListener> restorationListeners = new java.util.concurrent.CopyOnWriteArrayList<>();

    public void addRestorationListener(RestorationListener listener) {
        if (listener != null) this.restorationListeners.add(listener);
    }

    public void removeRestorationListener(RestorationListener listener) {
        this.restorationListeners.remove(listener);
    }

    public void setRestorationListener(RestorationListener listener) {
        this.restorationListeners.clear();
        if (listener != null) this.restorationListeners.add(listener);
    }

    private final ExecutorService masterExecutor = Executors.newSingleThreadExecutor();
    private static final long MAX_ZIP_SIZE = 2L * 1024 * 1024 * 1024; // 2GB

    public synchronized java.util.concurrent.Future<?> startExtraction(String inputPath, String outputPath, PowerManager.PostAction postAction, Optional<Instant> takeoutDate, boolean cleanupInput, boolean outputZip, int limitFiles, int offsetFiles, boolean interpolateMissing) {
        return startExtraction(inputPath, outputPath, postAction, takeoutDate, cleanupInput, outputZip, limitFiles, offsetFiles, interpolateMissing, true);
    }

    public synchronized java.util.concurrent.Future<?> startExtraction(String inputPath, String outputPath, PowerManager.PostAction postAction, Optional<Instant> takeoutDate, boolean cleanupInput, boolean outputZip, int limitFiles, int offsetFiles, boolean interpolateMissing, boolean organizeYearMonth) {
        if (this.isRunning) {
            throw new IllegalStateException("An extraction process is already running. Please wait or cancel the current one.");
        }
        this.isRunning = true;
        this.paused = false;
        this.cancelled = false;
        this.processed.set(0);
        this.processedBytes.set(0);
        this.limitFiles = limitFiles;
        this.offsetFiles = offsetFiles;
        this.interpolateMissing = interpolateMissing;
        this.organizeYearMonth = organizeYearMonth;
        this.dirSortedMediaCache.clear();
        this.mediaTimestampCache.clear();

        File input = new File(inputPath);
        File output = new File(outputPath);

        // Run the extraction in a separate thread managed by masterExecutor
        return masterExecutor.submit(() -> {
            try {
                runExtraction(input, output, postAction, takeoutDate, cleanupInput, outputZip);
                for (RestorationListener l : restorationListeners) {
                    try { l.onComplete(); } catch (Exception ignored) {}
                }
            } catch (Exception e) {
                sendLog("ERROR", "Fatal error: " + e.getMessage());
                for (RestorationListener l : restorationListeners) {
                    try { l.onError(e); } catch (Exception ignored) {}
                }
                throw e;
            } finally {
                this.isRunning = false;
                if (metadataInjector != null && metadataInjector.getExifToolEngine() != null) {
                    metadataInjector.getExifToolEngine().cullIdleWorkers();
                }
            }
        });
    }

    private void runExtraction(File input, File output, PowerManager.PostAction postAction, Optional<Instant> takeoutDate, boolean cleanupInput, boolean outputZip) {
        File restoreBase;
        if (output.getName().equalsIgnoreCase("TakeoutFix Restore")) {
            restoreBase = output;
        } else {
            restoreBase = new File(output, "TakeoutFix Restore");
        }
        File effectiveOutput = restoreBase;
        String dirName = input.getName();
        if (dirName != null && !dirName.isBlank()) {
            if (dirName.toLowerCase().endsWith(".zip")) {
                dirName = dirName.substring(0, dirName.length() - 4);
            }
            effectiveOutput = new File(restoreBase, dirName);
        }

        try {
            File logFile = new File(effectiveOutput, "restoration_log.log");
            effectiveOutput.mkdirs();
            this.logWriter = new java.io.PrintWriter(new java.io.FileWriter(logFile, true));
        } catch (Exception e) {
            System.err.println("Could not create log file in output directory: " + e.getMessage());
        }

        try {
            PowerManager power = new PowerManager();
            power.startKeepAwake();
            this.startTimeMs = System.currentTimeMillis();

            albumDetailsCache.clear();
            List<File> mediaFiles = scanner.listMediaFiles(input);
            totalFiles = mediaFiles.size();
            sendLog("INFO", "Found " + totalFiles + " media files in source archive.");

            // Deterministic serial ordering: sort canonical path
            mediaFiles.sort(Comparator.comparing(File::getAbsolutePath, String.CASE_INSENSITIVE_ORDER));

            java.util.concurrent.atomic.AtomicInteger matched = new java.util.concurrent.atomic.AtomicInteger(0);
            java.util.concurrent.atomic.AtomicInteger unmatched = new java.util.concurrent.atomic.AtomicInteger(0);
            java.util.concurrent.atomic.AtomicInteger errors = new java.util.concurrent.atomic.AtomicInteger(0);

            cleanupDestinationTempFiles(effectiveOutput);

            // Load or initialize destination checkpoint
            RestorationCheckpoint checkpoint = RestorationCheckpoint.load(effectiveOutput, input);
            this.activeCheckpoint = checkpoint;
            int resumedCount = checkpoint.getCompletedCount();
            if (resumedCount > 0) {
                matched.set(checkpoint.getMatchedCount());
                unmatched.set(checkpoint.getUnmatchedCount());
                errors.set(checkpoint.getErrorCount());
                processedBytes.set(checkpoint.getProcessedBytes());
                processed.set(resumedCount);
                sendLog("INFO", "[CHECKPOINT RESUME] Found existing checkpoint in destination with "
                        + String.format("%,d", resumedCount) + " files already restored. Resuming seamlessly in serial order...");
                notifyStats(totalFiles, totalFiles, matched.get(), unmatched.get(), errors.get());
                sendProgress("Resuming from checkpoint (" + resumedCount + "/" + totalFiles + ")...");
            } else {
                notifyStats(totalFiles, totalFiles, 0, 0, 0);
                sendProgress("Found " + totalFiles + " media files. Beginning restoration in serial order...");
            }
            
            Map<String, File[]> dirCache = new java.util.concurrent.ConcurrentHashMap<>();

            // Dynamic Storage Architecture detection: adapts ExifTool pool and threads to drive topology
            StorageDetector.StorageProfile storageProfile = StorageDetector.detectProfile(input, effectiveOutput);
            NativeExifToolEngine.getDefault().setMaxWorkers(storageProfile.exifToolWorkers());
            int targetThreads = storageProfile.extractionThreads();
            ExecutorService workers = Executors.newFixedThreadPool(targetThreads);
            this.activeWorkersPool = workers;
            sendLog("INFO", "[STORAGE PROFILE] " + storageProfile.summary() + " -> Allocated " + storageProfile.exifToolWorkers() + " ExifTool workers, " + targetThreads + " parallel threads.");
            
            try {
                if (outputZip) {
                    processAsZipChunks(mediaFiles, input, effectiveOutput, takeoutDate, dirCache, workers, targetThreads, matched, unmatched, errors, checkpoint);
                } else {
                    processAsLooseFiles(mediaFiles, input, effectiveOutput, output, takeoutDate, dirCache, workers, targetThreads, matched, unmatched, errors, checkpoint);
                }
            } finally {
                workers.shutdownNow();
                this.activeWorkersPool = null;
                if (checkpoint != null) {
                    if (!cancelled && !paused && checkpoint.isCompleted()) {
                        checkpoint.deleteCheckpointFile();
                    } else {
                        checkpoint.flush(!cancelled && !paused);
                    }
                }
                this.activeCheckpoint = null;
                cleanupDestinationTempFiles(effectiveOutput);
            }

            power.stopKeepAwake();
            sendLog("INFO", "Done. Matched: " + matched.get() + ", Unmatched: " + unmatched.get() + ", Errors: " + errors.get());
            notifyStats(totalFiles, totalFiles, matched.get(), unmatched.get(), errors.get());
            sendProgress("Restoration finished.");


            if (cleanupInput) {
                if (input != null && input.exists()) {
                    try {
                        java.nio.file.Path inputPathNormalized = input.toPath().toAbsolutePath().normalize();
                        java.nio.file.Path outputPathNormalized = effectiveOutput.toPath().toAbsolutePath().normalize();
                        java.nio.file.Path baseOutputPathNormalized = output.toPath().toAbsolutePath().normalize();

                        if (outputPathNormalized.startsWith(inputPathNormalized) 
                                || inputPathNormalized.startsWith(outputPathNormalized)
                                || baseOutputPathNormalized.startsWith(inputPathNormalized)
                                || inputPathNormalized.startsWith(baseOutputPathNormalized)) {
                            sendLog("WARN", "Skipping input cleanup: source and destination directories overlap or are identical.");
                        } else {
                            sendLog("INFO", "Cleaning up temporary input files to save disk space...");
                            fileService.deleteDirectory(input);
                        }
                    } catch (Exception ex) {
                        sendLog("WARN", "Could not verify path boundaries for cleanup: " + ex.getMessage());
                    }
                }
            }

            if (postAction == PowerManager.PostAction.KEEP_AWAKE_THEN_SHUTDOWN) {
                sendLog("INFO", "System will shut down in 30 seconds...");
            }

        } finally {
            if (logWriter != null) {
                try {
                    logWriter.flush();
                    logWriter.close();
                } catch (Exception ignored) {}
                logWriter = null;
            }
        }
    }

    private void processAsLooseFiles(List<File> mediaFiles, File input, File effectiveOutput, File baseOutput,
                                     Optional<Instant> takeoutDate, Map<String, File[]> dirCache,
                                     ExecutorService workers, int workerCount,
                                     java.util.concurrent.atomic.AtomicInteger matched,
                                     java.util.concurrent.atomic.AtomicInteger unmatched,
                                     java.util.concurrent.atomic.AtomicInteger errors,
                                     RestorationCheckpoint checkpoint) {
        activeFutures.clear();
        java.util.concurrent.ConcurrentLinkedQueue<File> queue = new java.util.concurrent.ConcurrentLinkedQueue<>(mediaFiles);
        List<java.util.concurrent.CompletableFuture<Void>> workerFutures = new ArrayList<>();

        for (int i = 0; i < workerCount; i++) {
            java.util.concurrent.CompletableFuture<Void> wf = java.util.concurrent.CompletableFuture.runAsync(() -> {
                while (!cancelled) {
                    while (paused && !cancelled) {
                        try {
                            Thread.sleep(150);
                        } catch (InterruptedException e) {
                            Thread.currentThread().interrupt();
                            return;
                        }
                    }
                    if (cancelled) return;

                    // Guest mode quota check (1 GB trial limit)
                    if (isGuestUser()) {
                        long curGuestBytes = GuestQuotaStore.getRestoredBytes() + processedBytes.get();
                        if (curGuestBytes >= GuestQuotaStore.MAX_GUEST_BYTES) {
                            if (!cancelled && !paused) {
                                paused = true;
                                sendLog("WARN", "[GUEST TIER LIMIT] Reached the free 1 GB guest trial limit. Restoration paused. Sign in to your Google Account to unlock unlimited access.");
                                notifyGuestLimitReached();
                            }
                            return;
                        }
                    }

                    File media = queue.poll();
                    if (media == null) {
                        break;
                    }

                    String relKey = getDisplayPath(media, input);
                    if (checkpoint != null && checkpoint.isFileAlreadyProcessed(relKey)) {
                        checkLimitsAndIncrement(media.getName());
                        continue;
                    }

                    boolean isMatch = false;
                    boolean isUnmatch = false;
                    boolean isErr = false;

                    try {
                        if (cancelled) return;
                        Optional<File> json = matcher.findMatchingJson(media, dirCache);
                        if (json.isPresent()) {
                            if (cancelled) return;
                            Instant targetTs = restorer.parseInstantFromJson(json.get(), takeoutDate);
                            File copiedFile;
                            if (organizeYearMonth) {
                                copiedFile = fileService.copyToChronologicalOutput(media, input, effectiveOutput, targetTs);
                            } else {
                                java.nio.file.Path relativePath = fileService.copyToOutput(media, input, effectiveOutput);
                                copiedFile = new File(effectiveOutput, relativePath.toString());
                            }
                            if (cancelled) return;
                            String displayPath = getDisplayPath(media, input);
                            // Single merged ExifTool call: injects EXIF + GPS + album details in one pass
                            Optional<AlbumDetails> album = getAlbumDetails(media);
                            String albumTitle = album.map(AlbumDetails::getTitle).orElse(null);
                            String albumDesc = album.map(AlbumDetails::getDescription).orElse(null);
                            metadataInjector.injectMetadataAndAlbum(copiedFile, json.get(), albumTitle, albumDesc);
                            Instant applied = restorer.restoreFromJson(copiedFile, json.get(), takeoutDate);
                            mediaTimestampCache.put(media.getAbsolutePath(), applied);
                            matched.incrementAndGet();
                            processedBytes.addAndGet(media.length());
                            isMatch = true;
                            notifyStats(totalFiles, totalFiles, matched.get(), unmatched.get(), errors.get());
                            String destRelative = baseOutput.toPath().relativize(copiedFile.toPath()).toString();
                            sendLog("SUCCESS", "[SUCCESS] Restored " + displayPath + " -> " + destRelative);
                        } else {
                            if (cancelled) return;
                            
                            // Priority 2: Filename date extraction fallback
                            Optional<Instant> filenameDate = FilenameDateParser.parse(media.getName());
                            Optional<Instant> interpolated = Optional.empty();

                            if (filenameDate.isPresent()) {
                                Instant fnInstant = filenameDate.get();
                                File copiedFile;
                                if (organizeYearMonth) {
                                    copiedFile = fileService.copyToChronologicalOutput(media, input, effectiveOutput, fnInstant);
                                } else {
                                    java.nio.file.Path relativePath = fileService.copyToOutput(media, input, effectiveOutput);
                                    copiedFile = new File(effectiveOutput, relativePath.toString());
                                }
                                if (cancelled) return;
                                String displayPath = getDisplayPath(media, input);
                                Optional<AlbumDetails> album = getAlbumDetails(media);
                                if (album.isPresent()) {
                                    metadataInjector.injectAlbumName(copiedFile, album.get().getTitle(), album.get().getDescription());
                                }
                                restorer.applyInstant(copiedFile, fnInstant);
                                mediaTimestampCache.put(media.getAbsolutePath(), fnInstant);
                                matched.incrementAndGet();
                                processedBytes.addAndGet(media.length());
                                isMatch = true;
                                notifyStats(totalFiles, totalFiles, matched.get(), unmatched.get(), errors.get());
                                String formattedDate = java.time.LocalDateTime.ofInstant(fnInstant, java.time.ZoneId.systemDefault()).format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
                                String destRelative = baseOutput.toPath().relativize(copiedFile.toPath()).toString();
                                sendLog("SUCCESS", "[FILENAME DATE] " + displayPath + " -> Extracted timestamp: " + formattedDate + " -> " + destRelative);
                            } else {
                                // Priority 3: Fallback to adjacent media estimation
                                if (interpolateMissing) {
                                    interpolated = tryInterpolateTimestamp(media, input, dirCache, takeoutDate);
                                }

                                if (interpolated.isPresent()) {
                                    Instant est = interpolated.get();
                                    File estimatedFile;
                                    if (organizeYearMonth) {
                                        estimatedFile = fileService.copyToChronologicalFolder(media, input, effectiveOutput, "estimated_metadata", est);
                                    } else {
                                        estimatedFile = fileService.copyToEstimated(media, input, effectiveOutput);
                                    }
                                    if (cancelled) return;
                                    String displayPath = getDisplayPath(media, input);
                                    Optional<AlbumDetails> album = getAlbumDetails(media);
                                    if (album.isPresent()) {
                                        metadataInjector.injectAlbumName(estimatedFile, album.get().getTitle(), album.get().getDescription());
                                    }
                                    restorer.applyInstant(estimatedFile, est);
                                    mediaTimestampCache.put(media.getAbsolutePath(), est);
                                    matched.incrementAndGet();
                                    processedBytes.addAndGet(media.length());
                                    isMatch = true;
                                    notifyStats(totalFiles, totalFiles, matched.get(), unmatched.get(), errors.get());
                                    String formattedDate = java.time.LocalDateTime.ofInstant(est, java.time.ZoneId.systemDefault()).format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
                                    sendLog("SUCCESS", "[ESTIMATED META] " + displayPath + " -> Estimated date from adjacent media: " + formattedDate + " (saved in estimated_metadata)");
                                } else {
                                    unmatched.incrementAndGet();
                                    processedBytes.addAndGet(media.length());
                                    isUnmatch = true;
                                    notifyStats(totalFiles, totalFiles, matched.get(), unmatched.get(), errors.get());
                                    String displayPath = getDisplayPath(media, input);
                                    sendLog("WARN", "[NO META] " + displayPath + " -> copying to metadata_not_found");
                                    if (organizeYearMonth) {
                                        fileService.copyToChronologicalFolder(media, input, effectiveOutput, "metadata_not_found", null);
                                    } else {
                                        fileService.copyToUnmatched(media, input, effectiveOutput);
                                    }
                                }
                            }
                        }
                    } catch (Exception ex) {
                        errors.incrementAndGet();
                        unmatched.incrementAndGet();
                        isErr = true;
                        notifyStats(totalFiles, totalFiles, matched.get(), unmatched.get(), errors.get());
                        String displayPath = getDisplayPath(media, input);
                        sendLog("ERROR", "[ERROR] " + displayPath + " -> " + ex.getMessage());
                    } finally {
                        if (checkpoint != null && !cancelled) {
                            checkpoint.recordCompletedFile(relKey, isMatch, isUnmatch, isErr, media.length());
                        }
                        if (isGuestUser() && (isMatch || isUnmatch)) {
                            GuestQuotaStore.recordRestoration(1, media.length());
                        }
                        checkLimitsAndIncrement(media.getName());
                    }
                }
            }, workers);

            workerFutures.add(wf);
            activeFutures.add(wf);
        }

        try {
            java.util.concurrent.CompletableFuture.allOf(workerFutures.toArray(new java.util.concurrent.CompletableFuture[0])).join();
        } catch (Exception ignored) {
        } finally {
            activeFutures.clear();
        }
    }

    /**
     * Processes media files into chunked ZIP archives using a producer-consumer pattern.
     */
    private void processAsZipChunks(List<File> mediaFiles, File input, File output,
                                    Optional<Instant> takeoutDate, Map<String, File[]> dirCache,
                                    ExecutorService workers, int workerCount,
                                    java.util.concurrent.atomic.AtomicInteger matched,
                                    java.util.concurrent.atomic.AtomicInteger unmatched,
                                    java.util.concurrent.atomic.AtomicInteger errors,
                                    RestorationCheckpoint checkpoint) {

        record ZipItem(File tempFile, File originalMedia, Instant timestamp, String relKey, boolean isMatch, boolean isUnmatch, boolean isErr) {}
        final Object POISON = new Object();

        java.util.concurrent.BlockingQueue<Object> zipQueue = new java.util.concurrent.LinkedBlockingQueue<>(64);

        Thread zipWriter = new Thread(() -> {
            int zipPart = 1;
            long currentZipSize = 0;
            java.util.zip.ZipOutputStream zout = null;
            try {
                zout = new java.util.zip.ZipOutputStream(new java.io.FileOutputStream(new File(output, "Restored_Takeout_Part" + zipPart + ".zip")));
                while (true) {
                    Object item = zipQueue.take();
                    if (item == POISON) break;

                    ZipItem zi = (ZipItem) item;
                    try {
                        long len = zi.tempFile.length();
                        if (currentZipSize + len > MAX_ZIP_SIZE && currentZipSize > 0) {
                            zout.close();
                            currentZipSize = 0;
                            zipPart++;
                            zout = new java.util.zip.ZipOutputStream(new java.io.FileOutputStream(new File(output, "Restored_Takeout_Part" + zipPart + ".zip")));
                        }
                        String entryPath = input.toPath().relativize(zi.originalMedia.toPath()).toString().replace('\\', '/');
                        if (input.isDirectory() && input.getName() != null && !input.getName().isBlank()) {
                            entryPath = input.getName() + "/" + entryPath;
                        }
                        java.util.zip.ZipEntry entry = new java.util.zip.ZipEntry(entryPath);
                        if (zi.timestamp != null) {
                            entry.setLastModifiedTime(java.nio.file.attribute.FileTime.from(zi.timestamp));
                        }
                        zout.putNextEntry(entry);
                        java.nio.file.Files.copy(zi.tempFile.toPath(), zout);
                        zout.closeEntry();
                        currentZipSize += len;
                        if (checkpoint != null) {
                            checkpoint.recordCompletedFile(zi.relKey, zi.isMatch, zi.isUnmatch, zi.isErr, zi.originalMedia.length());
                        }
                    } catch (Exception e) {
                        sendLog("ERROR", "[ZIP WRITE] " + zi.originalMedia.getName() + " -> " + e.getMessage());
                    } finally {
                        if (isGuestUser()) {
                            GuestQuotaStore.recordRestoration(1, zi.originalMedia.length());
                        }
                        zi.tempFile.delete();
                    }
                }
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            } catch (Exception e) {
                sendLog("ERROR", "ZIP writer fatal: " + e.getMessage());
            } finally {
                try { if (zout != null) zout.close(); } catch (Exception ignored) {}
            }
        }, "ZipWriterThread");
        zipWriter.setDaemon(true);
        zipWriter.start();

        try {
            activeFutures.clear();
            java.util.concurrent.ConcurrentLinkedQueue<File> queue = new java.util.concurrent.ConcurrentLinkedQueue<>(mediaFiles);
            List<java.util.concurrent.CompletableFuture<Void>> workerFutures = new ArrayList<>();

            for (int i = 0; i < workerCount; i++) {
                java.util.concurrent.CompletableFuture<Void> wf = java.util.concurrent.CompletableFuture.runAsync(() -> {
                    while (!cancelled) {
                        while (paused && !cancelled) {
                            try { Thread.sleep(150); } catch (InterruptedException e) {
                                Thread.currentThread().interrupt();
                                return;
                            }
                        }
                        if (cancelled) return;

                        // Guest mode quota check (1 GB trial limit)
                        if (isGuestUser()) {
                            long curGuestBytes = GuestQuotaStore.getRestoredBytes() + processedBytes.get();
                            if (curGuestBytes >= GuestQuotaStore.MAX_GUEST_BYTES) {
                                if (!cancelled && !paused) {
                                    paused = true;
                                    sendLog("WARN", "[GUEST TIER LIMIT] Reached the free 1 GB guest trial limit. Restoration paused. Sign in to your Google Account to unlock unlimited access.");
                                    notifyGuestLimitReached();
                                }
                                return;
                            }
                        }

                        File media = queue.poll();
                        if (media == null) break;

                        String relKey = getDisplayPath(media, input);
                        if (checkpoint != null && checkpoint.isFileAlreadyProcessed(relKey)) {
                            checkLimitsAndIncrement(media.getName());
                            continue;
                        }

                        boolean isMatch = false;
                        boolean isUnmatch = false;
                        boolean isErr = false;

                        try {
                            if (cancelled) return;
                            Optional<File> json = matcher.findMatchingJson(media, dirCache);
                            if (json.isPresent()) {
                                File tempCopied = File.createTempFile("tmp_takeout_", "_" + media.getName());
                                try {
                                    if (cancelled) { tempCopied.delete(); return; }
                                    java.nio.file.Files.copy(media.toPath(), tempCopied.toPath(), java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                                    Instant targetTs = restorer.parseInstantFromJson(json.get(), takeoutDate);
                                    Optional<AlbumDetails> album = getAlbumDetails(media);
                                    String albumTitle = album.map(AlbumDetails::getTitle).orElse(null);
                                    String albumDesc = album.map(AlbumDetails::getDescription).orElse(null);
                                    metadataInjector.injectMetadataAndAlbum(tempCopied, json.get(), albumTitle, albumDesc);
                                    Instant applied = restorer.restoreFromJson(tempCopied, json.get(), takeoutDate);
                                    isMatch = true;
                                    zipQueue.put(new ZipItem(tempCopied, media, applied, relKey, isMatch, isUnmatch, isErr));
                                    mediaTimestampCache.put(media.getAbsolutePath(), applied);
                                    matched.incrementAndGet();
                                    processedBytes.addAndGet(media.length());
                                    notifyStats(totalFiles, totalFiles, matched.get(), unmatched.get(), errors.get());
                                    String displayPath = getDisplayPath(media, input);
                                    sendLog("SUCCESS", "[SUCCESS] Restored " + displayPath + " -> Zip Entry");
                                } catch (Exception ex) {
                                    tempCopied.delete();
                                    throw ex;
                                }
                            } else {
                                if (cancelled) return;
                                Optional<Instant> filenameDate = FilenameDateParser.parse(media.getName());
                                Optional<Instant> interpolated = Optional.empty();

                                if (filenameDate.isPresent()) {
                                    Instant fnInstant = filenameDate.get();
                                    File tempCopied = File.createTempFile("tmp_takeout_", "_" + media.getName());
                                    try {
                                        if (cancelled) { tempCopied.delete(); return; }
                                        java.nio.file.Files.copy(media.toPath(), tempCopied.toPath(), java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                                        Optional<AlbumDetails> album = getAlbumDetails(media);
                                        if (album.isPresent()) {
                                            metadataInjector.injectAlbumName(tempCopied, album.get().getTitle(), album.get().getDescription());
                                        }
                                        restorer.applyInstant(tempCopied, fnInstant);
                                        isMatch = true;
                                        zipQueue.put(new ZipItem(tempCopied, media, fnInstant, relKey, isMatch, isUnmatch, isErr));
                                        mediaTimestampCache.put(media.getAbsolutePath(), fnInstant);
                                        matched.incrementAndGet();
                                        processedBytes.addAndGet(media.length());
                                        notifyStats(totalFiles, totalFiles, matched.get(), unmatched.get(), errors.get());
                                        String displayPath = getDisplayPath(media, input);
                                        String formattedDate = java.time.LocalDateTime.ofInstant(fnInstant, java.time.ZoneId.systemDefault()).format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
                                        sendLog("SUCCESS", "[FILENAME DATE] " + displayPath + " -> Extracted timestamp: " + formattedDate + " -> Zip Entry");
                                    } catch (Exception ex) {
                                        tempCopied.delete();
                                        throw ex;
                                    }
                                } else {
                                    if (interpolateMissing) {
                                        interpolated = tryInterpolateTimestamp(media, input, dirCache, takeoutDate);
                                    }

                                    if (interpolated.isPresent()) {
                                        File tempCopied = File.createTempFile("tmp_takeout_", "_" + media.getName());
                                        try {
                                            if (cancelled) { tempCopied.delete(); return; }
                                            java.nio.file.Files.copy(media.toPath(), tempCopied.toPath(), java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                                            Instant est = interpolated.get();
                                            Optional<AlbumDetails> album = getAlbumDetails(media);
                                            if (album.isPresent()) {
                                                metadataInjector.injectAlbumName(tempCopied, album.get().getTitle(), album.get().getDescription());
                                            }
                                            restorer.applyInstant(tempCopied, est);
                                            isMatch = true;
                                            zipQueue.put(new ZipItem(tempCopied, media, est, relKey, isMatch, isUnmatch, isErr));
                                            mediaTimestampCache.put(media.getAbsolutePath(), est);
                                            matched.incrementAndGet();
                                            processedBytes.addAndGet(media.length());
                                            notifyStats(totalFiles, totalFiles, matched.get(), unmatched.get(), errors.get());
                                            String displayPath = getDisplayPath(media, input);
                                            String formattedDate = java.time.LocalDateTime.ofInstant(est, java.time.ZoneId.systemDefault()).format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
                                            sendLog("SUCCESS", "[ESTIMATED META] " + displayPath + " -> Estimated date from adjacent media: " + formattedDate + " (saved in estimated_metadata)");
                                        } catch (Exception ex) {
                                            tempCopied.delete();
                                            throw ex;
                                        }
                                    } else {
                                        unmatched.incrementAndGet();
                                        isUnmatch = true;
                                        notifyStats(totalFiles, totalFiles, matched.get(), unmatched.get(), errors.get());
                                        String displayPath = getDisplayPath(media, input);
                                        sendLog("WARN", "[NO META] " + displayPath + " -> skipped in zip mode");
                                        if (checkpoint != null) {
                                            checkpoint.recordCompletedFile(relKey, false, true, false, media.length());
                                        }
                                    }
                                }
                            }
                        } catch (Exception ex) {
                            errors.incrementAndGet();
                            unmatched.incrementAndGet();
                            isErr = true;
                            notifyStats(totalFiles, totalFiles, matched.get(), unmatched.get(), errors.get());
                            String displayPath = getDisplayPath(media, input);
                            sendLog("ERROR", "[ERROR] " + displayPath + " -> " + ex.getMessage());
                            if (checkpoint != null) {
                                checkpoint.recordCompletedFile(relKey, false, false, true, media.length());
                            }
                        } finally {
                            checkLimitsAndIncrement(media.getName());
                        }
                    }
                }, workers);
                workerFutures.add(wf);
                activeFutures.add(wf);
            }
            try {
                java.util.concurrent.CompletableFuture.allOf(workerFutures.toArray(new java.util.concurrent.CompletableFuture[0])).join();
            } catch (Exception ignored) {
            } finally {
                activeFutures.clear();
            }
        } finally {
            try {
                zipQueue.put(POISON);
                zipWriter.join(60000);
            } catch (Exception ignored) {}
        }
    }

    public boolean isGuestUser() {
        if (UserController.isLoggedIn()) {
            return false;
        }
        if (userService != null) {
            try {
                return !userService.isAuthenticated();
            } catch (Exception ignored) {}
        }
        return true;
    }

    private void notifyGuestLimitReached() {
        for (RestorationListener l : restorationListeners) {
            try {
                l.onGuestLimitReached();
            } catch (Exception ignored) {}
        }
    }

    private String getDisplayPath(File file, File root) {
        try {
            return root.toPath().relativize(file.toPath()).toString();
        } catch (Exception e) {
            return file.getName();
        }
    }

    public synchronized void cancel() {
        this.cancelled = true;
        this.paused = false;
        if (activeWorkersPool != null) {
            try {
                activeWorkersPool.shutdownNow();
            } catch (Exception ignored) {}
        }
        for (java.util.concurrent.CompletableFuture<?> f : activeFutures) {
            if (f != null && !f.isDone()) {
                f.cancel(true);
            }
        }
        activeFutures.clear();
        if (activeCheckpoint != null) {
            activeCheckpoint.flush(false);
        }
    }

    private void sendLog(String level, String message) {
        if (logWriter != null) {
            try {
                String timestamp = java.time.LocalDateTime.now().format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
                logWriter.println("[" + timestamp + "] [" + level + "] " + message);
                logWriter.flush();
            } catch (Exception ignored) {}
        }
        for (RestorationListener l : restorationListeners) {
            try {
                l.onLog(level, message);
            } catch (Exception ignored) {}
        }
    }

    private final java.util.concurrent.atomic.AtomicLong lastProgressTime = new java.util.concurrent.atomic.AtomicLong(0);

    public int getLimitFiles() {
        return limitFiles;
    }

    private void sendProgress(String action) {
        long now = System.currentTimeMillis();
        int current = processed.get();
        if (current == totalFiles || current == 1 || now - lastProgressTime.get() >= 50) {
            lastProgressTime.set(now);
            long elapsedMs = Math.max(1, now - startTimeMs);
            long bytes = processedBytes.get();
            double elapsedSecDouble = elapsedMs / 1000.0;
            double filesPerSec = elapsedSecDouble > 0 ? (current / elapsedSecDouble) : 0.0;
            double mbPerSec = elapsedSecDouble > 0 ? ((bytes / (1024.0 * 1024.0)) / elapsedSecDouble) : 0.0;
            int remaining = Math.max(0, totalFiles - current);
            long etaSec = (filesPerSec > 0.05 && remaining > 0) ? Math.round(remaining / filesPerSec) : 0;
            long elapsedSec = elapsedMs / 1000;

            for (RestorationListener l : restorationListeners) {
                try {
                    l.onProgressTelemetry(current, totalFiles, bytes, action, elapsedSec, etaSec, filesPerSec, mbPerSec);
                } catch (Exception ignored) {}
            }
        }
    }

    private void notifyStats(int scanned, int total, int restored, int unmatched, int errors) {
        for (RestorationListener l : restorationListeners) {
            try {
                l.onStats(scanned, total, restored, unmatched, errors);
            } catch (Exception ignored) {}
        }
    }

    private void checkLimitsAndIncrement(String currentFile) {
        if (cancelled) return;
        int current = processed.incrementAndGet();
        sendProgress("Processed (" + current + "/" + totalFiles + "): " + currentFile);
    }

    // Simple DTOs for WebSocket
    public record LogMessage(String level, String message) {}
    public record ProgressUpdate(int current, int total, long processedBytes) {}

    private Optional<Instant> tryInterpolateTimestamp(File media, File input, Map<String, File[]> dirCache, Optional<Instant> takeoutDate) {
        File parentDir = media.getParentFile();
        if (parentDir == null) return Optional.empty();

        List<File> sortedFiles = dirSortedMediaCache.computeIfAbsent(parentDir.getAbsolutePath(), dirPath -> {
            File[] files = dirCache.computeIfAbsent(dirPath, k -> parentDir.listFiles());
            if (files == null) return Collections.emptyList();
            List<File> list = new ArrayList<>();
            for (File f : files) {
                if (scanner.isMediaFile(f)) {
                    list.add(f);
                }
            }
            list.sort(Comparator.comparing(File::getName, String.CASE_INSENSITIVE_ORDER));
            return list;
        });

        if (sortedFiles.size() <= 1) return Optional.empty();

        int targetIdx = sortedFiles.indexOf(media);
        if (targetIdx < 0) return Optional.empty();

        // Find nearest preceding file with known timestamp
        int prevIdx = -1;
        Instant prevTs = null;
        for (int i = targetIdx - 1; i >= 0; i--) {
            File prevMedia = sortedFiles.get(i);
            Instant ts = getKnownTimestamp(prevMedia, dirCache, takeoutDate);
            if (ts != null) {
                prevIdx = i;
                prevTs = ts;
                break;
            }
        }

        // Find nearest succeeding file with known timestamp
        int nextIdx = -1;
        Instant nextTs = null;
        for (int i = targetIdx + 1; i < sortedFiles.size(); i++) {
            File nextMedia = sortedFiles.get(i);
            Instant ts = getKnownTimestamp(nextMedia, dirCache, takeoutDate);
            if (ts != null) {
                nextIdx = i;
                nextTs = ts;
                break;
            }
        }

        if (prevTs != null && nextTs != null) {
            long diffSec = nextTs.getEpochSecond() - prevTs.getEpochSecond();
            int stepCount = nextIdx - prevIdx;
            
            java.time.LocalDate prevDate = java.time.LocalDateTime.ofInstant(prevTs, java.time.ZoneId.systemDefault()).toLocalDate();
            java.time.LocalDate nextDate = java.time.LocalDateTime.ofInstant(nextTs, java.time.ZoneId.systemDefault()).toLocalDate();
            
            // If timestamps cross midnight / new day or gap > 4 hours (14400s), avoid day-boundary averaging
            if (!prevDate.equals(nextDate) || diffSec > 14400) {
                if ((targetIdx - prevIdx) <= (nextIdx - targetIdx)) {
                    long offsetSec = 30L * (targetIdx - prevIdx);
                    return Optional.of(prevTs.plusSeconds(offsetSec));
                } else {
                    long offsetSec = 30L * (nextIdx - targetIdx);
                    return Optional.of(nextTs.minusSeconds(offsetSec));
                }
            } else {
                // Same day: linear average interpolation
                long offsetSec = (diffSec * (targetIdx - prevIdx)) / stepCount;
                return Optional.of(prevTs.plusSeconds(offsetSec));
            }
        } else if (prevTs != null) {
            // Last file(s) in folder without next metadata: use previous file date + 30 seconds per step
            long offsetSec = 30L * (targetIdx - prevIdx);
            return Optional.of(prevTs.plusSeconds(offsetSec));
        } else if (nextTs != null) {
            // First file(s) in folder: use next file date - 30 seconds per step
            long offsetSec = 30L * (nextIdx - targetIdx);
            return Optional.of(nextTs.minusSeconds(offsetSec));
        }

        return Optional.empty();
    }

    private Instant getKnownTimestamp(File media, Map<String, File[]> dirCache, Optional<Instant> takeoutDate) {
        String key = media.getAbsolutePath();
        Instant cached = mediaTimestampCache.get(key);
        if (cached != null) return cached;

        Optional<File> json = matcher.findMatchingJson(media, dirCache);
        if (json.isPresent()) {
            Optional<Instant> ts = restorer.parseJsonTimestamp(json.get(), takeoutDate);
            if (ts.isPresent()) {
                mediaTimestampCache.put(key, ts.get());
                return ts.get();
            }
        }
        return null;
    }

    public static class AlbumDetails {
        private final String title;
        private final String description;

        public AlbumDetails(String title, String description) {
            this.title = title;
            this.description = description;
        }

        public String getTitle() { return title; }
        public String getDescription() { return description; }
    }

    private final Map<String, Optional<AlbumDetails>> albumDetailsCache = new ConcurrentHashMap<>();

    private Optional<AlbumDetails> getAlbumDetails(File mediaFile) {
        try {
            File parent = mediaFile.getParentFile();
            if (parent == null) return Optional.empty();

            String parentPath = parent.getAbsolutePath();
            Optional<AlbumDetails> cached = albumDetailsCache.get(parentPath);
            if (cached != null) {
                return cached;
            }

            String originalFolderName = parent.getName().trim();
            String folderName = originalFolderName.toLowerCase();

            // Exclude Takeout organizational folders ("Photos from YYYY") and system folders
            if (folderName.matches("^photos from \\d{4}$")
                || folderName.equals("archive")
                || folderName.equals("locked folder")
                || folderName.equals("bin")
                || folderName.equals("trash")
                || folderName.equals("similar shots")
                || folderName.equals("takeout")
                || folderName.equals("google photos")
                || folderName.equals("takeoutfix restore")) {
                albumDetailsCache.put(parentPath, Optional.empty());
                return Optional.empty();
            }

            String title = originalFolderName;
            String description = null;

            // Check if folder contains Google Takeout's album metadata.json
            File metadataJson = new File(parent, "metadata.json");
            if (metadataJson.isFile()) {
                try {
                    String content = Files.readString(metadataJson.toPath());
                    JSONObject json = new JSONObject(content);
                    if (json.has("title") && !json.isNull("title")) {
                        String parsedTitle = json.getString("title").trim();
                        if (!parsedTitle.isEmpty() && !parsedTitle.toLowerCase().matches("^photos from \\d{4}$")) {
                            title = parsedTitle;
                        }
                    }
                    if (json.has("description") && !json.isNull("description")) {
                        String parsedDesc = json.getString("description").trim();
                        if (!parsedDesc.isEmpty()) {
                            description = parsedDesc;
                        }
                    }
                } catch (Exception ignored) {}
            }

            AlbumDetails details = new AlbumDetails(title, description);
            Optional<AlbumDetails> opt = Optional.of(details);
            albumDetailsCache.put(parentPath, opt);
            return opt;
        } catch (Exception ignored) {
            return Optional.empty();
        }
    }

    public long getProcessedBytes() {
        return processedBytes.get();
    }

    public int getProcessedFiles() {
        return processed.get();
    }

    public SessionStatsService getSessionStatsService() {
        return sessionStatsService;
    }

    public int getOffsetFiles() {
        return offsetFiles;
    }

    public void pause() {
        this.paused = true;
        if (activeCheckpoint != null) {
            activeCheckpoint.flush(false);
        }
    }

    public void resume() {
        this.paused = false;
    }

    public boolean isCancelled() {
        return cancelled;
    }

    public boolean isPaused() {
        return paused;
    }

    public void cleanupDestinationTempFiles(File destDir) {
        if (destDir == null || !destDir.exists() || !destDir.isDirectory()) return;
        try (java.util.stream.Stream<java.nio.file.Path> stream = java.nio.file.Files.walk(destDir.toPath())) {
            stream.filter(java.nio.file.Files::isRegularFile)
                  .filter(p -> {
                      String name = p.getFileName().toString();
                      return name.endsWith("_exiftool_tmp") || name.endsWith(".takeoutfix_checkpoint.json.tmp");
                  })
                  .forEach(p -> {
                      try {
                          java.nio.file.Files.deleteIfExists(p);
                      } catch (Exception ignored) {}
                  });
        } catch (Exception e) {
            sendLog("WARN", "Could not complete cleanup of destination temporary files: " + e.getMessage());
        }
    }
}
