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

    }

    @Autowired
    public ExtractionService(MediaScanner scanner, MetadataMatcher matcher, TimestampRestorer restorer,
                             MetadataInjector metadataInjector, FileOperationService fileService,
                             SessionStatsService sessionStatsService) {
        this.scanner = scanner;
        this.matcher = matcher;
        this.restorer = restorer;
        this.metadataInjector = metadataInjector;
        this.fileService = fileService;
        this.sessionStatsService = sessionStatsService;

    }

    private volatile boolean paused = false;
    private volatile boolean cancelled = false;
    private volatile boolean isRunning = false;
    private volatile Thread activeZipWriter;
    private final java.util.concurrent.atomic.AtomicBoolean checkpointWarningReported = new java.util.concurrent.atomic.AtomicBoolean();
    private final java.util.concurrent.atomic.AtomicBoolean logWarningReported = new java.util.concurrent.atomic.AtomicBoolean();
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
        if (activeZipWriter != null && activeZipWriter.isAlive()) {
            throw new IllegalStateException("The previous ZIP export is still closing. Wait for it to finish, or restart TakeoutFix.");
        }
        checkpointWarningReported.set(false);
        logWarningReported.set(false);
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
                if (!cancelled && !paused) {
                    for (RestorationListener l : restorationListeners) {
                        try { l.onComplete(); } catch (Exception ignored) {}
                    }
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
            FileOperationService.requireSeparateDirectories(input, effectiveOutput);
        } catch (java.io.IOException e) {
            throw new IllegalArgumentException("Cannot use these source and restore folders: " + e.getMessage(), e);
        }
        try {
            effectiveOutput.mkdirs();
            this.logWriter = fileService.createRestoreLog(effectiveOutput.toPath());
        } catch (Exception e) {
            sendLog("WARN", "Could not create the restore log. Check the output folder permissions and review the results in the app.");
        }

        PowerManager power = new PowerManager();
        try {
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


            // Load or initialize destination checkpoint
            String checkpointOptions = "organize=" + organizeYearMonth + ";interpolate=" + interpolateMissing + ";takeoutDate=" + takeoutDate.map(Instant::toString).orElse("") + (organizeYearMonth ? ";layout=year-month-v1" : "");            RestorationCheckpoint checkpoint = RestorationCheckpoint.loadForOutput(effectiveOutput, input, outputZip, checkpointOptions);
            if (outputZip) sendLog("WARN", "ZIP output cannot resume an interrupted run. Unfinished archive parts have a .zip.partial suffix; restart the export in full.");
            this.activeCheckpoint = checkpoint;
            int resumedCount = checkpoint != null ? checkpoint.getCompletedCount() : 0;
            if (resumedCount > 0) {
                matched.set(checkpoint.getMatchedCount());
                unmatched.set(checkpoint.getUnmatchedCount());
                errors.set(checkpoint.getErrorCount());
                processedBytes.set(checkpoint.getProcessedBytes());
                processed.set(resumedCount);
                sendLog("WARN", "[CHECKPOINT RESUME] Found existing checkpoint in destination with "
                        + String.format("%,d", resumedCount) + " files previously recorded. Earlier output files will be checked before they are skipped; keep your original export.");
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
            
            boolean processingSucceeded = false;
            try {
                if (outputZip) {
                    processAsZipChunks(mediaFiles, input, effectiveOutput, takeoutDate, dirCache, workers, targetThreads, matched, unmatched, errors, checkpoint);
                } else {
                    processAsLooseFiles(mediaFiles, input, effectiveOutput, output, takeoutDate, dirCache, workers, targetThreads, matched, unmatched, errors, checkpoint);
                }
                processingSucceeded = true;
            } finally {
                workers.shutdownNow();
                this.activeWorkersPool = null;
                if (checkpoint != null) {
                    if (processingSucceeded && !cancelled && !paused && errors.get() == 0 && checkpoint.isCompleted()) {
                        checkpoint.deleteCheckpointFile();
                    } else {
                        checkpoint.flush(processingSucceeded && !cancelled && !paused && errors.get() == 0);
                        warnCheckpointFailure(checkpoint);
                    }
                }
                this.activeCheckpoint = null;
            }

            sendLog("INFO", "Done. Matched: " + matched.get() + ", Unmatched: " + unmatched.get() + ", Errors: " + errors.get());
            notifyStats(totalFiles, totalFiles, matched.get(), unmatched.get(), errors.get());
            if (cancelled && outputZip) {                sendLog("WARN", "ZIP export was cancelled. The output may be incomplete; unfinished archive parts have a .zip.partial suffix. Keep your originals and restart the export in full.");                sendProgress("Restoration cancelled. ZIP output may be incomplete.");            } else if (cancelled) sendProgress("Restoration cancelled.");            else if (paused) sendProgress("Restoration paused.");
            else if (errors.get() > 0) sendProgress("Restoration finished with errors. Check the log.");
            else sendProgress("Restoration finished.");


            if (cleanupInput) {
                sendLog("WARN", "Source cleanup was skipped to preserve your original files.");
            }

            if (postAction == PowerManager.PostAction.KEEP_AWAKE_THEN_SHUTDOWN) {
                sendLog("INFO", "The desktop interface handles a requested shutdown after successful completion.");
            }

        } finally {
            power.stopKeepAwake();
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
                    File media = queue.poll();
                    if (media == null) {
                        break;
                    }

                    String relKey = getDisplayPath(media, input);
                    if (checkpoint != null && checkpoint.isFileAlreadyProcessed(relKey)) {
                        checkLimitsAndIncrement(media.getName());
                        continue;
                    }

                    Object reservation;
                    try { reservation = reserveGuestBytes(media.length(), null); }
                    catch (java.util.concurrent.CancellationException e) { if (cancelled) return; throw e; }
                    boolean isMatch = false;
                    boolean isUnmatch = false;
                    boolean isErr = false;
                    File outputFile = null;

                    try {
                        if (cancelled) return;
                        Optional<File> json = matcher.findMatchingJson(media, dirCache);
                        if (json.isPresent() && restorer.parseJsonTimestamp(json.get(), takeoutDate).isEmpty()) {
                            sendLog("WARN", "No usable date in sidecar for " + getDisplayPath(media, input) + "; trying filename or unmatched fallback.");
                            json = Optional.empty();
                        }
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
                            if (!metadataInjector.injectMetadataAndAlbum(copiedFile, json.get(), albumTitle, albumDesc)) throw new java.io.IOException("Could not write photo metadata.");
                            Instant applied = restorer.restoreFromJson(copiedFile, json.get(), takeoutDate);
                            mediaTimestampCache.put(media.getAbsolutePath(), applied);
                            outputFile = copiedFile;
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
                                    if (!metadataInjector.injectAlbumName(copiedFile, album.get().getTitle(), album.get().getDescription())) throw new java.io.IOException("Could not write album metadata.");
                                }
                                restorer.applyInstant(copiedFile, fnInstant);
                                mediaTimestampCache.put(media.getAbsolutePath(), fnInstant);
                                outputFile = copiedFile;
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
                                        if (!metadataInjector.injectAlbumName(estimatedFile, album.get().getTitle(), album.get().getDescription())) throw new java.io.IOException("Could not write album metadata.");
                                    }
                                    restorer.applyInstant(estimatedFile, est);
                                    outputFile = estimatedFile;
                                    unmatched.incrementAndGet();                                    processedBytes.addAndGet(media.length());
                                    isUnmatch = true;                                    notifyStats(totalFiles, totalFiles, matched.get(), unmatched.get(), errors.get());
                                    String formattedDate = java.time.LocalDateTime.ofInstant(est, java.time.ZoneId.systemDefault()).format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
                                    sendLog("WARN", "[ESTIMATED META] " + displayPath + " -> Estimated date from adjacent media: " + formattedDate + " (saved in estimated_metadata; check this date)");                                } else {
                                    String displayPath = getDisplayPath(media, input);
                                    sendLog("WARN", "[NO META] " + displayPath + " -> copying to metadata_not_found");
                                    if (organizeYearMonth) {
                                        outputFile = fileService.copyToChronologicalFolder(media, input, effectiveOutput, "metadata_not_found", null);
                                    } else {
                                        outputFile = fileService.copyToUnmatched(media, input, effectiveOutput);
                                    }
                                    unmatched.incrementAndGet();
                                    processedBytes.addAndGet(media.length());
                                    isUnmatch = true;
                                    notifyStats(totalFiles, totalFiles, matched.get(), unmatched.get(), errors.get());
                                }
                            }
                        }
                    } catch (Exception ex) {
                        errors.incrementAndGet();
                        isErr = true;
                        notifyStats(totalFiles, totalFiles, matched.get(), unmatched.get(), errors.get());
                        String displayPath = getDisplayPath(media, input);
                        sendLog("ERROR", "[ERROR] " + displayPath + " -> " + ex.getMessage() + ". An incomplete copy may remain in the output folder; check it before retrying.");
                    } finally {
                        if (reservation != null) {
                            GuestQuotaStore.finishReservation(reservation, !isErr && (isMatch || isUnmatch));
                        }
                        if (checkpoint != null && !cancelled) {
                            checkpoint.recordCompletedFile(relKey, isMatch, isUnmatch, isErr, media.length(), outputFile == null ? null : outputFile.toPath());
                            warnCheckpointFailure(checkpoint);
                        }
                        checkLimitsAndIncrement(media.getName());
                    }
                }
            }, workers);

            workerFutures.add(wf);
            activeFutures.add(wf);
        }

        try {
            WorkerCompletion.await(workerFutures, () -> cancelled);
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

        record ZipItem(File tempFile, File originalMedia, Instant timestamp, String relKey, boolean isMatch, boolean isUnmatch, boolean isErr, Object reservation) {}
        final Object POISON = new Object();

        java.util.concurrent.BlockingQueue<Object> zipQueue = new java.util.concurrent.LinkedBlockingQueue<>(64);
        java.util.concurrent.atomic.AtomicReference<Throwable> zipFailure = new java.util.concurrent.atomic.AtomicReference<>();
        java.util.concurrent.atomic.AtomicBoolean producersFinished = new java.util.concurrent.atomic.AtomicBoolean(false);
        Runnable discardQueued = () -> {
            Object pending;
            while ((pending = zipQueue.poll()) != null) {
                if (pending instanceof ZipItem item) {
                    if (item.reservation != null) GuestQuotaStore.finishReservation(item.reservation, false);
                    if (!item.tempFile.delete()) sendLog("WARN", "Could not remove temporary ZIP copy: " + item.tempFile);
                }
            }
        };

        Thread zipWriter = new Thread(() -> {
            int zipPart = 1;
            long currentZipSize = 0;
            java.util.zip.ZipOutputStream zout = null;
            java.nio.file.Path partial = null;
            try {
                partial = fileService.createArchivePart(output.toPath(), zipPart);
                zout = new java.util.zip.ZipOutputStream(java.nio.file.Files.newOutputStream(partial));
                while (true) {
                    Object item = zipQueue.take();
                    if (item == POISON) {
                        zout.close();
                        zout = null;
                        if (!cancelled && producersFinished.get() && zipFailure.get() == null) fileService.finishArchivePart(partial, zipPart);
                        break;
                    }

                    ZipItem zi = (ZipItem) item;
                    boolean entryWritten = false;
                    try {
                        long len = zi.tempFile.length();
                        if (currentZipSize + len > MAX_ZIP_SIZE && currentZipSize > 0) {
                            zout.close();
                            zout = null;
                            if (!cancelled) fileService.finishArchivePart(partial, zipPart);
                            currentZipSize = 0;
                            zipPart++;
                            partial = fileService.createArchivePart(output.toPath(), zipPart);
                            zout = new java.util.zip.ZipOutputStream(java.nio.file.Files.newOutputStream(partial));
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
                        entryWritten = true;
                        if (zi.isMatch) matched.incrementAndGet();
                        if (zi.isUnmatch) unmatched.incrementAndGet();
                        processedBytes.addAndGet(zi.originalMedia.length());
                        notifyStats(totalFiles, totalFiles, matched.get(), unmatched.get(), errors.get());
                        sendLog("INFO", "Added " + getDisplayPath(zi.originalMedia, input) + " to the ZIP being prepared" + (zi.isUnmatch ? " (review needed)." : "."));                        currentZipSize += len;
                        if (checkpoint != null) {
                            checkpoint.recordCompletedFile(zi.relKey, zi.isMatch, zi.isUnmatch, zi.isErr, zi.originalMedia.length(), null);
                        }
                    } catch (Exception e) {
                        if (!cancelled) sendLog("ERROR", "[ZIP WRITE] " + zi.originalMedia.getName() + " -> " + e.getMessage());
                        throw e;
                    } finally {
                        if (zi.reservation != null) {
                            GuestQuotaStore.finishReservation(zi.reservation, entryWritten);
                        }
                        zi.tempFile.delete();
                    }
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                if (!cancelled) zipFailure.compareAndSet(null, e);
            } catch (Exception e) {
                if (!cancelled) {
                    zipFailure.compareAndSet(null, e);
                    sendLog("ERROR", "ZIP writer fatal: " + e.getMessage());
                }
            } finally {
                try { if (zout != null) zout.close(); }
                catch (Exception e) { if (!cancelled) zipFailure.compareAndSet(null, e); }
                finally { if (cancelled || zipFailure.get() != null) discardQueued.run(); }
            }
        }, "ZipWriterThread");
        activeZipWriter = zipWriter;
        zipWriter.setDaemon(true);
        zipWriter.start();

        try {
            activeFutures.clear();
            java.util.concurrent.ConcurrentLinkedQueue<File> queue = new java.util.concurrent.ConcurrentLinkedQueue<>(mediaFiles);
            List<java.util.concurrent.CompletableFuture<Void>> workerFutures = new ArrayList<>();

            for (int i = 0; i < workerCount; i++) {
                java.util.concurrent.CompletableFuture<Void> wf = java.util.concurrent.CompletableFuture.runAsync(() -> {
                    while (!cancelled && zipFailure.get() == null) {
                        while (paused && !cancelled && zipFailure.get() == null) {
                            try { Thread.sleep(150); } catch (InterruptedException e) {
                                Thread.currentThread().interrupt();
                                return;
                            }
                        }
                        if (cancelled) return;
                        File media = queue.poll();
                        if (media == null) break;

                        String relKey = getDisplayPath(media, input);
                        if (checkpoint != null && checkpoint.isFileAlreadyProcessed(relKey)) {
                            checkLimitsAndIncrement(media.getName());
                            continue;
                        }

                        Object reservation;
                        try { reservation = reserveGuestBytes(media.length(), zipFailure); }
                        catch (java.util.concurrent.CancellationException e) { if (cancelled || zipFailure.get() != null) return; throw e; }
                        boolean handedToWriter = false;
                        boolean isMatch = false;
                        boolean isUnmatch = false;
                        boolean isErr = false;

                        try {
                            if (cancelled) return;
                                Optional<File> json = matcher.findMatchingJson(media, dirCache);
                                if (json.isPresent() && restorer.parseJsonTimestamp(json.get(), takeoutDate).isEmpty()) {
                                    sendLog("WARN", "No usable date in sidecar for " + getDisplayPath(media, input) + "; trying filename or unmatched fallback.");
                                    json = Optional.empty();
                                }
                            if (json.isPresent()) {
                                File tempCopied = fileService.createArchiveTemp(media);
                                try {
                                    if (cancelled) { tempCopied.delete(); return; }
                                    java.nio.file.Files.copy(media.toPath(), tempCopied.toPath(), java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                                    Instant targetTs = restorer.parseInstantFromJson(json.get(), takeoutDate);
                                    Optional<AlbumDetails> album = getAlbumDetails(media);
                                    String albumTitle = album.map(AlbumDetails::getTitle).orElse(null);
                                    String albumDesc = album.map(AlbumDetails::getDescription).orElse(null);
                                    if (!metadataInjector.injectMetadataAndAlbum(tempCopied, json.get(), albumTitle, albumDesc)) throw new java.io.IOException("Could not write photo metadata.");
                                    Instant applied = restorer.restoreFromJson(tempCopied, json.get(), takeoutDate);
                                    isMatch = true;
                                    ZipQueue.put(zipQueue, new ZipItem(tempCopied, media, applied, relKey, isMatch, isUnmatch, isErr, reservation), zipFailure, () -> cancelled);
                                    handedToWriter = true;
                                    mediaTimestampCache.put(media.getAbsolutePath(), applied);

                                } catch (Exception ex) {
                                    if (!handedToWriter) tempCopied.delete();
                                    throw ex;
                                }
                            } else {
                                if (cancelled) return;
                                Optional<Instant> filenameDate = FilenameDateParser.parse(media.getName());
                                Optional<Instant> interpolated = Optional.empty();

                                if (filenameDate.isPresent()) {
                                    Instant fnInstant = filenameDate.get();
                                    File tempCopied = fileService.createArchiveTemp(media);
                                    try {
                                        if (cancelled) { tempCopied.delete(); return; }
                                        java.nio.file.Files.copy(media.toPath(), tempCopied.toPath(), java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                                        Optional<AlbumDetails> album = getAlbumDetails(media);
                                        if (album.isPresent()) {
                                            if (!metadataInjector.injectAlbumName(tempCopied, album.get().getTitle(), album.get().getDescription())) throw new java.io.IOException("Could not write album metadata.");
                                        }
                                        restorer.applyInstant(tempCopied, fnInstant);
                                        isMatch = true;
                                        ZipQueue.put(zipQueue, new ZipItem(tempCopied, media, fnInstant, relKey, isMatch, isUnmatch, isErr, reservation), zipFailure, () -> cancelled);
                                        handedToWriter = true;
                                        mediaTimestampCache.put(media.getAbsolutePath(), fnInstant);

                                    } catch (Exception ex) {
                                        if (!handedToWriter) tempCopied.delete();
                                        throw ex;
                                    }
                                } else {
                                    if (interpolateMissing) {
                                        interpolated = tryInterpolateTimestamp(media, input, dirCache, takeoutDate);
                                    }

                                    if (interpolated.isPresent()) {
                                        File tempCopied = fileService.createArchiveTemp(media);
                                        try {
                                            if (cancelled) { tempCopied.delete(); return; }
                                            java.nio.file.Files.copy(media.toPath(), tempCopied.toPath(), java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                                            Instant est = interpolated.get();
                                            Optional<AlbumDetails> album = getAlbumDetails(media);
                                            if (album.isPresent()) {
                                                if (!metadataInjector.injectAlbumName(tempCopied, album.get().getTitle(), album.get().getDescription())) throw new java.io.IOException("Could not write album metadata.");
                                            }
                                            restorer.applyInstant(tempCopied, est);
                                            isUnmatch = true;                                            sendLog("WARN", "[ESTIMATED META] " + getDisplayPath(media, input) + " -> Estimated date from adjacent media; check this date in the ZIP output.");                                            ZipQueue.put(zipQueue, new ZipItem(tempCopied, media, est, relKey, isMatch, isUnmatch, isErr, reservation), zipFailure, () -> cancelled);
                                            handedToWriter = true;

                                        } catch (Exception ex) {
                                            if (!handedToWriter) tempCopied.delete();
                                            throw ex;
                                        }
                                    } else {
                                        java.nio.file.Path tempCopied = fileService.createArchiveCopy(media);
                                        try {
                                            if (cancelled) {
                                                java.nio.file.Files.deleteIfExists(tempCopied);
                                                return;
                                            }
                                            Instant originalTime = java.nio.file.Files.getLastModifiedTime(media.toPath()).toInstant();
                                            ZipQueue.put(zipQueue, new ZipItem(tempCopied.toFile(), media, originalTime, relKey, false, true, false, reservation), zipFailure, () -> cancelled);
                                            handedToWriter = true;
                                        } catch (Exception ex) {
                                            try { java.nio.file.Files.deleteIfExists(tempCopied); }
                                            catch (java.io.IOException cleanupError) { ex.addSuppressed(cleanupError); }
                                            throw ex;
                                        }

                                        sendLog("WARN", "[NO META] " + getDisplayPath(media, input) + " -> queued unchanged for ZIP");
                                    }
                                }
                            }
                        } catch (java.util.concurrent.CancellationException ex) {
                            if (cancelled) return;
                            throw ex;
                        } catch (Exception ex) {
                            errors.incrementAndGet();
                            isErr = true;
                            notifyStats(totalFiles, totalFiles, matched.get(), unmatched.get(), errors.get());
                            String displayPath = getDisplayPath(media, input);
                            sendLog("ERROR", "[ERROR] " + displayPath + " -> " + ex.getMessage());
                            if (checkpoint != null) {
                                checkpoint.recordCompletedFile(relKey, false, false, true, media.length(), null);
                            }
                        } finally {
                            if (reservation != null && !handedToWriter) GuestQuotaStore.finishReservation(reservation, false);
                            checkLimitsAndIncrement(media.getName());
                        }
                    }
                }, workers);
                workerFutures.add(wf);
                activeFutures.add(wf);
            }
            try {
                WorkerCompletion.await(workerFutures, () -> cancelled);
                producersFinished.set(true);
            } finally {
                activeFutures.clear();
            }
        } finally {
            try {
                if (!cancelled && zipFailure.get() == null) {
                    try { ZipQueue.put(zipQueue, POISON, zipFailure, () -> cancelled); }
                        catch (java.util.concurrent.CancellationException e) { if (!cancelled) throw e; }
                    catch (java.io.IOException e) { zipFailure.compareAndSet(null, e); }
                }
                if (cancelled) zipWriter.interrupt();
                zipWriter.join(60000);
                if (zipWriter.isAlive()) { zipFailure.compareAndSet(null, new java.io.IOException("ZIP writer timed out.")); throw new IllegalStateException("ZIP writer did not finish. The output archive may be incomplete; keep your originals."); }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                zipFailure.compareAndSet(null, e);
                zipWriter.interrupt();                throw new IllegalStateException("ZIP writing was interrupted. The output archive may be incomplete; keep your originals.", e);
            }
            if (cancelled || zipFailure.get() != null) {
                discardQueued.run();
                if (zipFailure.get() != null) throw new IllegalStateException("ZIP writing failed. The output archive may be incomplete; keep your originals.", zipFailure.get());
            }
        }
    }

    private void warnCheckpointFailure(RestorationCheckpoint checkpoint) {        if (checkpoint.hasFlushFailed() && checkpointWarningReported.compareAndSet(false, true)) {            sendLog("WARN", "Could not save restore progress. If interrupted, this restore may not resume from the latest file. Keep your originals.");        }    }    private Object reserveGuestBytes(long bytes, java.util.concurrent.atomic.AtomicReference<Throwable> zipFailure) {        while (!cancelled && (zipFailure == null || zipFailure.get() == null)) {
            if (!paused) {
                if (!isGuestUser()) return null;
                GuestQuotaStore.ReservationAttempt attempt = GuestQuotaStore.tryReserve(bytes);
                if (attempt.status() == GuestQuotaStore.ReservationStatus.RESERVED) return attempt.token();
                if (attempt.status() == GuestQuotaStore.ReservationStatus.LIMIT) {
                    boolean notify;
                    synchronized (this) {
                        notify = !paused && !cancelled;
                        if (notify) paused = true;
                    }
                    if (notify) {
                        sendLog("WARN", "The next file exceeds the remaining guest allowance. Sign in to continue for free.");
                        notifyGuestLimitReached();
                    }
                }
            }
            try {
                Thread.sleep(150);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new java.util.concurrent.CancellationException("Quota wait interrupted.");
            }
        }
        throw new java.util.concurrent.CancellationException("Restoration stopped while waiting for guest quota.");
    }

    public boolean isGuestUser() {
        return !UserController.hasSignedInCredentials();
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
    }
    private void sendLog(String level, String message) {
        boolean failed = false;
        java.io.PrintWriter writer = logWriter;
        if (writer != null) {
            try {
                String timestamp = java.time.LocalDateTime.now().format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
                writer.println("[" + timestamp + "] [" + level + "] " + message);
                failed = writer.checkError();
            } catch (Exception error) {
                failed = true;
            }
        }
        for (RestorationListener listener : restorationListeners) {
            try { listener.onLog(level, message); } catch (Exception ignored) {}
        }
        if (failed && logWarningReported.compareAndSet(false, true)) {
            for (RestorationListener listener : restorationListeners) {
                try { listener.onLog("WARN", "Could not save the restore log. Review the results in the app and keep your originals."); }
                catch (Exception ignored) {}
            }
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

    Instant getKnownTimestamp(File media, Map<String, File[]> dirCache, Optional<Instant> takeoutDate) {
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
        Optional<Instant> filenameTimestamp = FilenameDateParser.parse(media.getName());
        filenameTimestamp.ifPresent(timestamp -> mediaTimestampCache.put(key, timestamp));
        return filenameTimestamp.orElse(null);
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
        RestorationCheckpoint checkpoint = activeCheckpoint;
        if (checkpoint != null) {
            checkpoint.flush(false);
            warnCheckpointFailure(checkpoint);
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

}
