package com.rahul.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.io.File;
import java.time.Instant;
import java.util.*;

/**
 * Orchestrates the metadata restoration process.
 */
@Service
public class ExtractionService {

    @Autowired private MediaScanner scanner;
    @Autowired private MetadataMatcher matcher;
    @Autowired private TimestampRestorer restorer;
    @Autowired private FileOperationService fileService;
    @Autowired private SimpMessagingTemplate messagingTemplate;

    private volatile boolean paused = false;
    private volatile boolean cancelled = false;
    private volatile int processed = 0;
    private int totalFiles = 0;

    public void startExtraction(String inputPath, String outputPath, PowerManager.PostAction postAction, Optional<Instant> takeoutDate) {
        this.paused = false;
        this.cancelled = false;
        this.processed = 0;

        File input = new File(inputPath);
        File output = new File(outputPath);

        // Run the extraction in a separate thread
        new Thread(() -> {
            try {
                runExtraction(input, output, postAction, takeoutDate);
            } catch (Exception e) {
                sendLog("ERROR", "Fatal error: " + e.getMessage());
            }
        }).start();
    }

    private void runExtraction(File input, File output, PowerManager.PostAction postAction, Optional<Instant> takeoutDate) {
        PowerManager power = new PowerManager();
        power.startKeepAwake();

        List<File> mediaFiles = scanner.listMediaFiles(input);
        totalFiles = mediaFiles.size();
        sendLog("INFO", "Found " + totalFiles + " media files.");

        int matched = 0;
        int unmatched = 0;

        for (File media : mediaFiles) {
            if (cancelled) break;
            while (paused && !cancelled) {
                try { Thread.sleep(150); } catch (InterruptedException ignored) {}
            }

            try {
                Optional<File> json = matcher.findMatchingJson(media);
                if (json.isPresent()) {
                    java.nio.file.Path relativePath = fileService.copyToOutput(media, input, output);
                    File copiedFile = new File(output, relativePath.toString());
                    Instant applied = restorer.restoreFromJson(copiedFile, json.get(), takeoutDate);
                    matched++;
                    sendLog("INFO", "[SUCCESS] Found " + json.get().getName() + " for " + media.getName() + " and stored here: " + copiedFile.getAbsolutePath() + " | Date: " + applied);
                } else {
                    unmatched++;
                    sendLog("WARN", "[NO META] " + media.getName() + " -> copying to metadata_not_found");
                    fileService.copyToUnmatched(media, input, output);
                }
            } catch (Exception ex) {
                unmatched++;
                sendLog("ERROR", "[ERROR] " + media.getName() + " -> " + ex.getMessage());
                fileService.copyToUnmatchedSafe(media, input, output);
            } finally {
                processed++;
                sendProgress();
            }
        }

        power.stopKeepAwake();
        sendLog("INFO", "Done. Matched: " + matched + ", Unmatched: " + unmatched);

        if (postAction == PowerManager.PostAction.KEEP_AWAKE_THEN_SHUTDOWN) {
            sendLog("INFO", "System will shut down in 30 seconds...");
            // Implementation of delayed shutdown would go here
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
        messagingTemplate.convertAndSend("/topic/progress", new ProgressUpdate(processed, totalFiles));
    }

    // Simple DTOs for WebSocket
    public record LogMessage(String level, String message) {}
    public record ProgressUpdate(int current, int total) {}
}
