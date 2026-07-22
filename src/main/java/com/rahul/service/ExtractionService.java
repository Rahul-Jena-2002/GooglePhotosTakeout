package com.rahul.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.io.File;
import java.nio.file.Files;
import java.time.Instant;
import java.util.*;

import org.json.JSONObject;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Orchestrates the metadata restoration process.
 */
import com.rahul.util.FilenameDateParser;
import java.util.concurrent.atomic.AtomicLong;

@Service
public class ExtractionService {

    @Autowired private MediaScanner scanner;
    @Autowired private MetadataMatcher matcher;
    @Autowired private TimestampRestorer restorer;
    @Autowired private MetadataInjector metadataInjector;
    @Autowired private FileOperationService fileService;
    @Autowired private SimpMessagingTemplate messagingTemplate;
    @Autowired private SessionStatsService sessionStatsService;

    private volatile boolean paused = false;
    private volatile boolean cancelled = false;
    private volatile boolean isRunning = false;
    private final java.util.concurrent.atomic.AtomicInteger processed = new java.util.concurrent.atomic.AtomicInteger(0);
    private final AtomicLong processedBytes = new AtomicLong(0);
    private int totalFiles = 0;

    private volatile int limitFiles = -1;
    private volatile int offsetFiles = 0;
    private volatile boolean interpolateMissing = false;
    private java.io.PrintWriter logWriter = null;
    private volatile ExecutorService activeWorkersPool = null;
    
    private final Map<String, List<File>> dirSortedMediaCache = new java.util.concurrent.ConcurrentHashMap<>();
    private final Map<String, Instant> mediaTimestampCache = new java.util.concurrent.ConcurrentHashMap<>();
    
    private final ExecutorService masterExecutor = Executors.newSingleThreadExecutor();
    private static final long MAX_ZIP_SIZE = 2L * 1024 * 1024 * 1024; // 2GB

    public synchronized void startExtraction(String inputPath, String outputPath, PowerManager.PostAction postAction, Optional<Instant> takeoutDate, boolean cleanupInput, boolean outputZip, int limitFiles, int offsetFiles, boolean interpolateMissing) {
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
        this.dirSortedMediaCache.clear();
        this.mediaTimestampCache.clear();

        File input = new File(inputPath);
        File output = new File(outputPath);

        // Run the extraction in a separate thread managed by masterExecutor
        masterExecutor.submit(() -> {
            try {
                runExtraction(input, output, postAction, takeoutDate, cleanupInput, outputZip);
            } catch (Exception e) {
                sendLog("ERROR", "Fatal error: " + e.getMessage());
            } finally {
                this.isRunning = false;
            }
        });
    }

    private void runExtraction(File input, File output, PowerManager.PostAction postAction, Optional<Instant> takeoutDate, boolean cleanupInput, boolean outputZip) {
        try {
            File logFile = new File(output, "restoration_log.log");
            output.mkdirs();
            this.logWriter = new java.io.PrintWriter(new java.io.FileWriter(logFile, true));
        } catch (Exception e) {
            System.err.println("Could not create log file in output directory: " + e.getMessage());
        }

        try {
            PowerManager power = new PowerManager();
            power.startKeepAwake();

            List<File> mediaFiles = scanner.listMediaFiles(input);
            totalFiles = mediaFiles.size();
            sendLog("INFO", "Found " + totalFiles + " media files.");
            sendProgress();

            java.util.concurrent.atomic.AtomicInteger matched = new java.util.concurrent.atomic.AtomicInteger(0);
            java.util.concurrent.atomic.AtomicInteger unmatched = new java.util.concurrent.atomic.AtomicInteger(0);
            
            Map<String, File[]> dirCache = new java.util.concurrent.ConcurrentHashMap<>();

            int availableCores = Runtime.getRuntime().availableProcessors();
            int targetThreads = Math.max(1, (int) Math.round(availableCores * 0.80));
            ExecutorService workers = Executors.newFixedThreadPool(targetThreads);
            this.activeWorkersPool = workers;
            sendLog("INFO", "Dynamically allocated " + targetThreads + " worker threads for " + availableCores + " detected CPU cores (80% workload, 20% OS headroom).");
            
            try {
                if (outputZip) {
                    processAsZipChunks(mediaFiles, input, output, takeoutDate, dirCache, workers, matched, unmatched);
                } else {
                    processAsLooseFiles(mediaFiles, input, output, takeoutDate, dirCache, workers, matched, unmatched);
                }
            } finally {
                workers.shutdownNow();
                this.activeWorkersPool = null;
            }

            power.stopKeepAwake();
            sendLog("INFO", "Done. Matched: " + matched.get() + ", Unmatched: " + unmatched.get());


            if (cleanupInput) {
                sendLog("INFO", "Cleaning up temporary input files to save disk space...");
                fileService.deleteDirectory(input);
            }

            if (postAction == PowerManager.PostAction.KEEP_AWAKE_THEN_SHUTDOWN) {
                sendLog("INFO", "System will shut down in 30 seconds...");
            }
        } finally {
            if (logWriter != null) {
                synchronized (logWriter) {
                    logWriter.close();
                    logWriter = null;
                }
            }
        }
    }

    private void processAsLooseFiles(List<File> mediaFiles, File input, File output, Optional<Instant> takeoutDate, Map<String, File[]> dirCache, ExecutorService workers, java.util.concurrent.atomic.AtomicInteger matched, java.util.concurrent.atomic.AtomicInteger unmatched) {
        List<java.util.concurrent.CompletableFuture<Void>> futures = new ArrayList<>();
        for (File media : mediaFiles) {
            futures.add(java.util.concurrent.CompletableFuture.runAsync(() -> {
                if (cancelled) return;
                while (paused && !cancelled) {
                    try { Thread.sleep(150); } catch (InterruptedException e) {
                        Thread.currentThread().interrupt(); // re-interrupt so shutdownNow() propagates
                        return;
                    }
                }
                try {
                    if (cancelled) return;
                    Optional<File> json = matcher.findMatchingJson(media, dirCache);
                    if (json.isPresent()) {
                        if (cancelled) return;
                        java.nio.file.Path relativePath = fileService.copyToOutput(media, input, output);
                        File copiedFile = new File(output, relativePath.toString());
                        if (cancelled) return;
                        String displayPath = getDisplayPath(media, input);
                        // Single merged ExifTool call: injects EXIF + GPS + album in one pass
                        String albumTitle = getAlbumTitle(media);
                        metadataInjector.injectMetadataAndAlbum(copiedFile, json.get(), albumTitle);
                        Instant applied = restorer.restoreFromJson(copiedFile, json.get(), takeoutDate);
                        mediaTimestampCache.put(media.getAbsolutePath(), applied);
                        matched.incrementAndGet();
                        processedBytes.addAndGet(media.length());
                        sendLog("SUCCESS", "[SUCCESS] Restored " + displayPath);
                    } else {
                        if (cancelled) return;
                        
                        // Priority 2: Filename date extraction fallback
                        Optional<Instant> filenameDate = FilenameDateParser.parse(media.getName());
                        Optional<Instant> interpolated = Optional.empty();

                        if (filenameDate.isPresent()) {
                            java.nio.file.Path relativePath = fileService.copyToOutput(media, input, output);
                            File copiedFile = new File(output, relativePath.toString());
                            if (cancelled) return;
                            String displayPath = getDisplayPath(media, input);
                            Instant fnInstant = filenameDate.get();
                            restorer.applyInstant(copiedFile, fnInstant);
                            mediaTimestampCache.put(media.getAbsolutePath(), fnInstant);
                            matched.incrementAndGet();
                            processedBytes.addAndGet(media.length());
                            String formattedDate = java.time.LocalDateTime.ofInstant(fnInstant, java.time.ZoneId.systemDefault()).format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
                            sendLog("SUCCESS", "[FILENAME DATE] " + displayPath + " -> Extracted timestamp from filename: " + formattedDate);
                        } else {
                            // Priority 3: Fallback to adjacent media estimation
                            if (interpolateMissing) {
                                interpolated = tryInterpolateTimestamp(media, input, dirCache, takeoutDate);
                            }

                            if (interpolated.isPresent()) {
                                File estimatedFile = fileService.copyToEstimated(media, input, output);
                                if (cancelled) return;
                                String displayPath = getDisplayPath(media, input);
                                Instant est = interpolated.get();
                                restorer.applyInstant(estimatedFile, est);
                                mediaTimestampCache.put(media.getAbsolutePath(), est);
                                matched.incrementAndGet();
                                processedBytes.addAndGet(media.length());
                                String formattedDate = java.time.LocalDateTime.ofInstant(est, java.time.ZoneId.systemDefault()).format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
                                sendLog("SUCCESS", "[ESTIMATED META] " + displayPath + " -> Estimated date from adjacent media: " + formattedDate + " (saved in estimated_metadata)");
                            } else {
                                unmatched.incrementAndGet();
                                String displayPath = getDisplayPath(media, input);
                                sendLog("WARN", "[NO META] " + displayPath + " -> copying to metadata_not_found");
                                fileService.copyToUnmatched(media, input, output);
                            }
                        }
                    }
                } catch (Exception ex) {
                    unmatched.incrementAndGet();
                    String displayPath = getDisplayPath(media, input);
                    sendLog("ERROR", "[ERROR] " + displayPath + " -> " + ex.getMessage());
                    fileService.copyToUnmatchedSafe(media, input, output);
                } finally {
                    checkLimitsAndIncrement();
                }
            }, workers));
        }
        java.util.concurrent.CompletableFuture.allOf(futures.toArray(new java.util.concurrent.CompletableFuture[0])).join();
    }

    /**
     * Processes media files into chunked ZIP archives using a producer-consumer pattern:
     * - N worker threads do ExifTool injection in PARALLEL (no lock contention)
     * - 1 dedicated ZIP writer thread consumes completed files from a BlockingQueue (serial I/O, no contention)
     * This achieves full CPU utilization while safely writing to a single ZipOutputStream.
     */
    private void processAsZipChunks(List<File> mediaFiles, File input, File output, Optional<Instant> takeoutDate, Map<String, File[]> dirCache, ExecutorService workers, java.util.concurrent.atomic.AtomicInteger matched, java.util.concurrent.atomic.AtomicInteger unmatched) {

        // A record to pass completed files from workers → zip writer
        record ZipItem(File tempFile, File originalMedia, Instant timestamp) {}
        final Object POISON = new Object(); // sentinel to signal "all done"

        java.util.concurrent.BlockingQueue<Object> zipQueue = new java.util.concurrent.LinkedBlockingQueue<>(64);

        // === ZIP WRITER THREAD (single, serial — writes to ZipOutputStream) ===
        Thread zipWriter = new Thread(() -> {
            int zipPart = 1;
            long currentZipSize = 0;
            java.util.zip.ZipOutputStream zout = null;
            try {
                zout = new java.util.zip.ZipOutputStream(new java.io.FileOutputStream(new File(output, "Restored_Takeout_Part" + zipPart + ".zip")));
                while (true) {
                    Object item = zipQueue.take(); // blocks until item available
                    if (item == POISON) break;

                    ZipItem zi = (ZipItem) item;
                    try {
                        long len = zi.tempFile.length();
                        // Rotate to next zip chunk if this file would exceed MAX_ZIP_SIZE
                        if (currentZipSize + len > MAX_ZIP_SIZE && currentZipSize > 0) {
                            zout.close();
                            currentZipSize = 0;
                            zipPart++;
                            zout = new java.util.zip.ZipOutputStream(new java.io.FileOutputStream(new File(output, "Restored_Takeout_Part" + zipPart + ".zip")));
                        }
                        java.util.zip.ZipEntry entry = new java.util.zip.ZipEntry(input.toPath().relativize(zi.originalMedia.toPath()).toString());
                        if (zi.timestamp != null) {
                            entry.setLastModifiedTime(java.nio.file.attribute.FileTime.from(zi.timestamp));
                        }
                        zout.putNextEntry(entry);
                        java.nio.file.Files.copy(zi.tempFile.toPath(), zout);
                        zout.closeEntry();
                        currentZipSize += len;
                    } catch (Exception e) {
                        sendLog("ERROR", "[ZIP WRITE] " + zi.originalMedia.getName() + " -> " + e.getMessage());
                    } finally {
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

        // === WORKER THREADS (parallel ExifTool processing — no locks, full CPU) ===
        try {
            List<java.util.concurrent.CompletableFuture<Void>> futures = new ArrayList<>();
            for (File media : mediaFiles) {
                futures.add(java.util.concurrent.CompletableFuture.runAsync(() -> {
                    if (cancelled) return;
                    while (paused && !cancelled) {
                        try { Thread.sleep(150); } catch (InterruptedException e) {
                            Thread.currentThread().interrupt(); // re-interrupt so shutdownNow() propagates
                            return;
                        }
                    }
                    try {
                        if (cancelled) return;
                        Optional<File> json = matcher.findMatchingJson(media, dirCache);
                        if (json.isPresent()) {
                            File tempCopied = File.createTempFile("tmp_takeout_", "_" + media.getName());
                            try {
                                if (cancelled) { tempCopied.delete(); return; }
                                java.nio.file.Files.copy(media.toPath(), tempCopied.toPath(), java.nio.file.StandardCopyOption.REPLACE_EXISTING);

                                // Single merged ExifTool call (parallel — no lock needed)
                                String albumTitle = getAlbumTitle(media);
                                metadataInjector.injectMetadataAndAlbum(tempCopied, json.get(), albumTitle);
                                Instant applied = restorer.restoreFromJson(tempCopied, json.get(), takeoutDate);

                                String displayPath = getDisplayPath(media, input);
                                // Queue for zip writing (non-blocking enqueue)
                                zipQueue.put(new ZipItem(tempCopied, media, applied));
                                mediaTimestampCache.put(media.getAbsolutePath(), applied);
                                matched.incrementAndGet();
                                processedBytes.addAndGet(media.length());
                                sendLog("SUCCESS", "[SUCCESS] Restored " + displayPath);
                            } catch (Exception ex) {
                                tempCopied.delete();
                                throw ex;
                            }
                        } else {
                            if (cancelled) return;

                            // Priority 2: Filename date extraction fallback
                            Optional<Instant> filenameDate = FilenameDateParser.parse(media.getName());
                            Optional<Instant> interpolated = Optional.empty();

                            if (filenameDate.isPresent()) {
                                File tempCopied = File.createTempFile("tmp_takeout_", "_" + media.getName());
                                try {
                                    if (cancelled) { tempCopied.delete(); return; }
                                    java.nio.file.Files.copy(media.toPath(), tempCopied.toPath(), java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                                    Instant fnInstant = filenameDate.get();
                                    restorer.applyInstant(tempCopied, fnInstant);
                                    zipQueue.put(new ZipItem(tempCopied, media, fnInstant));
                                    mediaTimestampCache.put(media.getAbsolutePath(), fnInstant);
                                    matched.incrementAndGet();
                                    processedBytes.addAndGet(media.length());
                                    String displayPath = getDisplayPath(media, input);
                                    String formattedDate = java.time.LocalDateTime.ofInstant(fnInstant, java.time.ZoneId.systemDefault()).format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
                                    sendLog("SUCCESS", "[FILENAME DATE] " + displayPath + " -> Extracted timestamp from filename: " + formattedDate);
                                } catch (Exception ex) {
                                    tempCopied.delete();
                                    throw ex;
                                }
                            } else {
                                // Priority 3: Fallback to adjacent media estimation
                                if (interpolateMissing) {
                                    interpolated = tryInterpolateTimestamp(media, input, dirCache, takeoutDate);
                                }

                                if (interpolated.isPresent()) {
                                    File tempCopied = File.createTempFile("tmp_takeout_", "_" + media.getName());
                                    try {
                                        if (cancelled) { tempCopied.delete(); return; }
                                        java.nio.file.Files.copy(media.toPath(), tempCopied.toPath(), java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                                        Instant est = interpolated.get();
                                        restorer.applyInstant(tempCopied, est);
                                        zipQueue.put(new ZipItem(tempCopied, media, est));
                                        mediaTimestampCache.put(media.getAbsolutePath(), est);
                                        matched.incrementAndGet();
                                        processedBytes.addAndGet(media.length());
                                        String displayPath = getDisplayPath(media, input);
                                        String formattedDate = java.time.LocalDateTime.ofInstant(est, java.time.ZoneId.systemDefault()).format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
                                        sendLog("SUCCESS", "[ESTIMATED META] " + displayPath + " -> Estimated date from adjacent media: " + formattedDate + " (saved in estimated_metadata)");
                                    } catch (Exception ex) {
                                        tempCopied.delete();
                                        throw ex;
                                    }
                                } else {
                                    unmatched.incrementAndGet();
                                    String displayPath = getDisplayPath(media, input);
                                    sendLog("WARN", "[NO META] " + displayPath + " -> skipped in zip mode");
                                }
                            }
                        }
                    } catch (Exception ex) {
                        unmatched.incrementAndGet();
                        String displayPath = getDisplayPath(media, input);
                        sendLog("ERROR", "[ERROR] " + displayPath + " -> " + ex.getMessage());
                    } finally {
                        checkLimitsAndIncrement();
                    }
                }, workers));
            }
            java.util.concurrent.CompletableFuture.allOf(futures.toArray(new java.util.concurrent.CompletableFuture[0])).join();
        } finally {
            // Signal zip writer to finish
            try { zipQueue.put(POISON); } catch (InterruptedException ignored) {}
            try { zipWriter.join(30_000); } catch (InterruptedException ignored) {}
        }
    }


    public void togglePause() {
        this.paused = !this.paused;
    }

    public void cancel() {
        this.cancelled = true;
        this.isRunning = false; // immediately release lock so a new session can start
        ExecutorService p = this.activeWorkersPool;
        if (p != null) {
            p.shutdownNow();
        }
        sendLog("INFO", "Processing cancelled.");
    }

    public boolean isPaused() { return paused; }

    private static final org.slf4j.Logger logger = org.slf4j.LoggerFactory.getLogger(ExtractionService.class);

    private void sendLog(String level, String message) {
        messagingTemplate.convertAndSend("/topic/logs", new LogMessage(level, message));
        
        if ("ERROR".equalsIgnoreCase(level)) {
            logger.error(message);
        } else if ("WARN".equalsIgnoreCase(level)) {
            logger.warn(message);
        } else {
            logger.info(message);
        }

        if (logWriter != null) {
            synchronized (logWriter) {
                String timestamp = java.time.LocalDateTime.now().format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
                logWriter.println("[" + timestamp + "] [" + level + "] " + message);
                logWriter.flush();
            }
        }
    }

    private final java.util.concurrent.atomic.AtomicLong lastProgressTime = new java.util.concurrent.atomic.AtomicLong(0);

    private void sendProgress() {
        long now = System.currentTimeMillis();
        int current = processed.get();
        if (current == totalFiles || current == 1 || now - lastProgressTime.get() >= 50) {
            lastProgressTime.set(now);
            messagingTemplate.convertAndSend("/topic/progress", new ProgressUpdate(current, totalFiles, processedBytes.get()));
        }
    }

    private void checkLimitsAndIncrement() {
        if (cancelled) return;
        int current = processed.incrementAndGet();
        sendProgress();
        
        if (limitFiles > 0) {
            if (current >= limitFiles) {
                if (!cancelled) {
                    sendLog("ERROR", "LIMIT_EXCEEDED: You have reached your tier limit of " + limitFiles + " files.");
                    cancel();
                }
            }
        }
    }

    // Simple DTOs for WebSocket
    public record LogMessage(String level, String message) {}
    public record ProgressUpdate(int current, int total, long processedBytes) {}
    private String getDisplayPath(File media, File input) {
        try {
            return input.toPath().relativize(media.toPath()).toString();
        } catch (Exception e) {
            return media.getName();
        }
    }

    private Optional<Instant> tryInterpolateTimestamp(File media, File input, Map<String, File[]> dirCache, Optional<Instant> takeoutDate) {
        File parent = media.getParentFile();
        if (parent == null) return Optional.empty();

        List<File> sortedFiles = dirSortedMediaCache.computeIfAbsent(parent.getAbsolutePath(), p -> {
            File[] files = parent.listFiles();
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

    private String getAlbumTitle(File mediaFile) {
        try {
            File parent = mediaFile.getParentFile();
            if (parent == null) return null;
            
            // Exclude common date pattern "Photos from YYYY"
            if (parent.getName().matches("^Photos from \\d{4}$")) return null;
            
            File metadataJson = new File(parent, "metadata.json");
            if (metadataJson.isFile()) {
                String content = Files.readString(metadataJson.toPath());
                JSONObject json = new JSONObject(content);
                if (json.has("title") && !json.isNull("title")) {
                    String title = json.getString("title").trim();
                    if (!title.isEmpty() && !title.matches("^Photos from \\d{4}$")) {
                        return title;
                    }
                }
            }
        } catch (Exception ignored) {
            // Ignore parse errors or missing files
        }
        return null;
    }

    public long getProcessedBytes() {
        return processedBytes.get();
    }
}
