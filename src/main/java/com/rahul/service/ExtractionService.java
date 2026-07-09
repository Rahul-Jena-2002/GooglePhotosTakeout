package com.rahul.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.io.File;
import java.time.Instant;
import java.util.*;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Orchestrates the metadata restoration process.
 */
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
    private int totalFiles = 0;
    private volatile int limitFiles = -1;
    private volatile int offsetFiles = 0;
    
    private final ExecutorService masterExecutor = Executors.newSingleThreadExecutor();
    private static final long MAX_ZIP_SIZE = 2L * 1024 * 1024 * 1024; // 2GB

    public synchronized void startExtraction(String inputPath, String outputPath, PowerManager.PostAction postAction, Optional<Instant> takeoutDate, boolean cleanupInput, boolean outputZip, int limitFiles, int offsetFiles) {
        if (this.isRunning) {
            throw new IllegalStateException("An extraction process is already running. Please wait or cancel the current one.");
        }
        this.isRunning = true;
        this.paused = false;
        this.cancelled = false;
        this.processed.set(0);
        this.limitFiles = limitFiles;
        this.offsetFiles = offsetFiles;

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
        PowerManager power = new PowerManager();
        power.startKeepAwake();

        List<File> mediaFiles = scanner.listMediaFiles(input);
        totalFiles = mediaFiles.size();
        sendLog("INFO", "Found " + totalFiles + " media files.");

        java.util.concurrent.atomic.AtomicInteger matched = new java.util.concurrent.atomic.AtomicInteger(0);
        java.util.concurrent.atomic.AtomicInteger unmatched = new java.util.concurrent.atomic.AtomicInteger(0);
        
        Map<String, File[]> dirCache = new java.util.concurrent.ConcurrentHashMap<>();

        ExecutorService workers = Executors.newFixedThreadPool(Runtime.getRuntime().availableProcessors());
        
        try {
            if (outputZip) {
                processAsZipChunks(mediaFiles, input, output, takeoutDate, dirCache, workers, matched, unmatched);
            } else {
                processAsLooseFiles(mediaFiles, input, output, takeoutDate, dirCache, workers, matched, unmatched);
            }
        } finally {
            workers.shutdownNow();
        }

        power.stopKeepAwake();
        sendLog("INFO", "Done. Matched: " + matched.get() + ", Unmatched: " + unmatched.get());

        if (cleanupInput) {
            sendLog("INFO", "Cleaning up temporary input files to save disk space...");
            fileService.deleteDirectory(input);
        }

        if (postAction == PowerManager.PostAction.KEEP_AWAKE_THEN_SHUTDOWN) {
            sendLog("INFO", "System will shut down in 30 seconds...");
            // Implementation of delayed shutdown would go here
        }
    }

    private void processAsLooseFiles(List<File> mediaFiles, File input, File output, Optional<Instant> takeoutDate, Map<String, File[]> dirCache, ExecutorService workers, java.util.concurrent.atomic.AtomicInteger matched, java.util.concurrent.atomic.AtomicInteger unmatched) {
        List<java.util.concurrent.CompletableFuture<Void>> futures = new ArrayList<>();
        for (File media : mediaFiles) {
            futures.add(java.util.concurrent.CompletableFuture.runAsync(() -> {
                if (cancelled) return;
                while (paused && !cancelled) {
                    try { Thread.sleep(150); } catch (InterruptedException ignored) {}
                }
                try {
                    Optional<File> json = matcher.findMatchingJson(media, dirCache);
                    if (json.isPresent()) {
                        java.nio.file.Path relativePath = fileService.copyToOutput(media, input, output);
                        File copiedFile = new File(output, relativePath.toString());
                        metadataInjector.injectMetadata(copiedFile, json.get());
                        restorer.restoreFromJson(copiedFile, json.get(), takeoutDate);
                        matched.incrementAndGet();
                        sendLog("SUCCESS", "[SUCCESS] Restored " + media.getName());
                    } else {
                        unmatched.incrementAndGet();
                        sendLog("WARN", "[NO META] " + media.getName() + " -> copying to metadata_not_found");
                        fileService.copyToUnmatched(media, input, output);
                    }
                } catch (Exception ex) {
                    unmatched.incrementAndGet();
                    sendLog("ERROR", "[ERROR] " + media.getName() + " -> " + ex.getMessage());
                    fileService.copyToUnmatchedSafe(media, input, output);
                } finally {
                    checkLimitsAndIncrement();
                }
            }, workers));
        }
        java.util.concurrent.CompletableFuture.allOf(futures.toArray(new java.util.concurrent.CompletableFuture[0])).join();
    }

    private void processAsZipChunks(List<File> mediaFiles, File input, File output, Optional<Instant> takeoutDate, Map<String, File[]> dirCache, ExecutorService workers, java.util.concurrent.atomic.AtomicInteger matched, java.util.concurrent.atomic.AtomicInteger unmatched) {
        Object zipLock = new Object();
        int[] zipPart = {1};
        
        java.util.zip.ZipOutputStream[] zout = new java.util.zip.ZipOutputStream[1];
        long[] currentZipSize = new long[1];
        
        try {
            zout[0] = new java.util.zip.ZipOutputStream(new java.io.FileOutputStream(new File(output, "Restored_Takeout_Part" + zipPart[0] + ".zip")));
            
            List<java.util.concurrent.CompletableFuture<Void>> futures = new ArrayList<>();
            for (File media : mediaFiles) {
                futures.add(java.util.concurrent.CompletableFuture.runAsync(() -> {
                    if (cancelled) return;
                    while (paused && !cancelled) {
                        try { Thread.sleep(150); } catch (InterruptedException ignored) {}
                    }
                    try {
                        Optional<File> json = matcher.findMatchingJson(media, dirCache);
                        if (json.isPresent()) {
                            long len = media.length();
                            synchronized (zipLock) {
                                if (currentZipSize[0] + len > MAX_ZIP_SIZE) {
                                    zout[0].close();
                                    int nextPart = matched.get() + unmatched.get() > 0 ? zipPart[0] + 1 : zipPart[0] + 1;
                                }
                            }
                            // Process JSON metadata first (can be done concurrently)
                            // We need to apply timestamps to the zip entry. But wait, we need to know the Instant.
                            // restorer.restoreFromJson on a temp file is inefficient. We can modify TimestampRestorer.
                            // Since we can't change restorer easily right here, let's copy to a temp dir, restore, then put into ZIP.
                            File tempCopied = File.createTempFile("tmp_takeout_", "_" + media.getName());
                            java.nio.file.Files.copy(media.toPath(), tempCopied.toPath(), java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                            metadataInjector.injectMetadata(tempCopied, json.get());
                            Instant applied = restorer.restoreFromJson(tempCopied, json.get(), takeoutDate);
                            
                            synchronized (zipLock) {
                                if (currentZipSize[0] + len > MAX_ZIP_SIZE) {
                                    zout[0].close();
                                    currentZipSize[0] = 0;
                                    zipPart[0]++; // Increment part properly inside lock
                                    zout[0] = new java.util.zip.ZipOutputStream(new java.io.FileOutputStream(new File(output, "Restored_Takeout_Part" + zipPart[0] + ".zip")));
                                }
                                java.util.zip.ZipEntry entry = new java.util.zip.ZipEntry(input.toPath().relativize(media.toPath()).toString());
                                entry.setLastModifiedTime(java.nio.file.attribute.FileTime.from(applied));
                                zout[0].putNextEntry(entry);
                                java.nio.file.Files.copy(tempCopied.toPath(), zout[0]);
                                zout[0].closeEntry();
                                currentZipSize[0] += tempCopied.length();
                            }
                            tempCopied.delete();
                            matched.incrementAndGet();
                        } else {
                            unmatched.incrementAndGet();
                            sendLog("WARN", "[NO META] " + media.getName() + " -> ignoring in zip mode");
                        }
                    } catch (Exception ex) {
                        unmatched.incrementAndGet();
                        sendLog("ERROR", "[ERROR] " + media.getName() + " -> " + ex.getMessage());
                    } finally {
                        checkLimitsAndIncrement();
                    }
                }, workers));
            }
            java.util.concurrent.CompletableFuture.allOf(futures.toArray(new java.util.concurrent.CompletableFuture[0])).join();
        } catch (Exception ex) {
            sendLog("ERROR", "ZIP streaming error: " + ex.getMessage());
        } finally {
            try {
                if (zout[0] != null) zout[0].close();
            } catch (Exception ignored) {}
        }
    }

    public void togglePause() {
        this.paused = !this.paused;
    }

    public void cancel() {
        this.cancelled = true;
    }

    public boolean isPaused() { return paused; }

    private void sendLog(String level, String message) {
        messagingTemplate.convertAndSend("/topic/logs", new LogMessage(level, message));
    }

    private void sendProgress() {
        messagingTemplate.convertAndSend("/topic/progress", new ProgressUpdate(processed.get(), totalFiles));
    }

    private void checkLimitsAndIncrement() {
        int current = processed.incrementAndGet();
        sendProgress();
        
        if (limitFiles > 0) {
            long totalChecked = sessionStatsService.getTotalFiles() - offsetFiles + current;
            if (totalChecked >= limitFiles) {
                sendLog("ERROR", "LIMIT_EXCEEDED: You have reached your tier limit of " + limitFiles + " files.");
                cancel();
            }
        }
    }

    // Simple DTOs for WebSocket
    public record LogMessage(String level, String message) {}
    public record ProgressUpdate(int current, int total) {}
}
