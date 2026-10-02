package com.takeoutfix.restore.infrastructure;

import org.json.JSONArray;
import org.json.JSONObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.util.Collections;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Manages atomic, persistent checkpoints in the destination folder.
 * If the application crashes, hard drive unplugs, or the user pauses/stops,
 * restoration can resume seamlessly without repeating already completed files.
 */
public class RestorationCheckpoint {

    private static final Logger log = LoggerFactory.getLogger(RestorationCheckpoint.class);
    public static final String CHECKPOINT_FILENAME = ".takeoutfix_checkpoint.json";

    private final File checkpointFile;
    private final File tmpCheckpointFile;
    private final String sourcePath;
    private final Set<String> completedFiles = ConcurrentHashMap.newKeySet();

    private final AtomicInteger matchedCount = new AtomicInteger(0);
    private final AtomicInteger unmatchedCount = new AtomicInteger(0);
    private final AtomicInteger errorCount = new AtomicInteger(0);
    private final AtomicLong processedBytes = new AtomicLong(0);

    private volatile boolean completed = false;
    private volatile long lastFlushedTime = 0;
    private final AtomicInteger unpersistedFileCount = new AtomicInteger(0);

    private RestorationCheckpoint(File destinationDir, String sourcePath) {
        this.checkpointFile = new File(destinationDir, CHECKPOINT_FILENAME);
        this.tmpCheckpointFile = new File(destinationDir, CHECKPOINT_FILENAME + ".tmp");
        this.sourcePath = (sourcePath != null) ? sourcePath.trim() : "";
    }

    /**
     * Loads an existing checkpoint from the destination directory if it matches the current source,
     * or creates a new empty checkpoint.
     */
    public static RestorationCheckpoint load(File destinationDir, File sourceDir) {
        String sourcePathStr = (sourceDir != null) ? sourceDir.getAbsolutePath() : "";
        RestorationCheckpoint checkpoint = new RestorationCheckpoint(destinationDir, sourcePathStr);

        if (!checkpoint.checkpointFile.exists()) {
            return checkpoint;
        }

        try {
            String content = Files.readString(checkpoint.checkpointFile.toPath(), StandardCharsets.UTF_8);
            if (content == null || content.isBlank()) {
                return checkpoint;
            }

            JSONObject json = new JSONObject(content);
            String savedSource = json.optString("sourcePath", "");

            // Verify source matches (by full path or same archive directory name)
            boolean matches = savedSource.equalsIgnoreCase(sourcePathStr)
                    || (sourceDir != null && savedSource.endsWith(File.separator + sourceDir.getName()));

            if (!matches) {
                log.info("Checkpoint source mismatch ('{}' vs '{}'), starting clean checkpoint.", savedSource, sourcePathStr);
                return checkpoint;
            }

            checkpoint.matchedCount.set(json.optInt("matched", 0));
            checkpoint.unmatchedCount.set(json.optInt("unmatched", 0));
            checkpoint.errorCount.set(json.optInt("errors", 0));
            checkpoint.processedBytes.set(json.optLong("processedBytes", 0L));
            checkpoint.completed = json.optBoolean("completed", false);

            JSONArray filesArr = json.optJSONArray("completedFiles");
            if (filesArr != null) {
                for (int i = 0; i < filesArr.length(); i++) {
                    String rel = filesArr.optString(i, "");
                    if (!rel.isBlank()) {
                        checkpoint.completedFiles.add(rel);
                    }
                }
            }

            log.info("Loaded destination checkpoint: %,d files already restored from source.", checkpoint.completedFiles.size());
        } catch (Exception e) {
            log.warn("Could not read existing checkpoint file, starting fresh: {}", e.getMessage());
        }

        return checkpoint;
    }

    /**
     * Checks if a relative file path has already been restored in a previous run.
     */
    public boolean isFileAlreadyProcessed(String relativePath) {
        if (relativePath == null || relativePath.isBlank()) return false;
        return completedFiles.contains(relativePath);
    }

    /**
     * Records a newly restored file and periodically flushes to disk.
     */
    public void recordCompletedFile(String relativePath, boolean isMatched, boolean isUnmatched, boolean isError, long bytes) {
        if (relativePath != null && !relativePath.isBlank()) {
            completedFiles.add(relativePath);
        }

        if (isMatched) matchedCount.incrementAndGet();
        else if (isUnmatched) unmatchedCount.incrementAndGet();
        if (isError) errorCount.incrementAndGet();
        if (bytes > 0) processedBytes.addAndGet(bytes);

        int pending = unpersistedFileCount.incrementAndGet();
        long now = System.currentTimeMillis();

        // Flush atomically every 25 files or at least every 3 seconds
        if (pending >= 25 || (now - lastFlushedTime > 3000)) {
            flush(false);
        }
    }

    /**
     * Atomically writes the checkpoint to disk.
     * Uses write-to-tmp then atomic move to prevent corrupted files if power or drive fails.
     */
    public synchronized void flush(boolean markCompleted) {
        if (markCompleted) {
            this.completed = true;
        }

        try {
            JSONObject json = new JSONObject();
            json.put("sourcePath", sourcePath);
            json.put("matched", matchedCount.get());
            json.put("unmatched", unmatchedCount.get());
            json.put("errors", errorCount.get());
            json.put("processedBytes", processedBytes.get());
            json.put("completed", this.completed);
            json.put("lastUpdated", Instant.now().toString());

            JSONArray filesArr = new JSONArray();
            for (String file : completedFiles) {
                filesArr.put(file);
            }
            json.put("completedFiles", filesArr);

            byte[] data = json.toString(2).getBytes(StandardCharsets.UTF_8);

            // Ensure destination directory exists
            File parentDir = checkpointFile.getParentFile();
            if (parentDir != null && !parentDir.exists()) {
                parentDir.mkdirs();
            }

            // Write to .tmp and force file descriptor sync to physical disk
            try (FileOutputStream fos = new FileOutputStream(tmpCheckpointFile)) {
                fos.write(data);
                fos.flush();
                fos.getFD().sync();
            }

            // Atomic rename to replace the checkpoint file safely
            try {
                Files.move(tmpCheckpointFile.toPath(), checkpointFile.toPath(),
                        StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
            } catch (Exception moveEx) {
                Files.move(tmpCheckpointFile.toPath(), checkpointFile.toPath(),
                        StandardCopyOption.REPLACE_EXISTING);
            }

            unpersistedFileCount.set(0);
            lastFlushedTime = System.currentTimeMillis();
        } catch (Exception e) {
            log.warn("Failed to flush restoration checkpoint: {}", e.getMessage());
        }
    }

    public Set<String> getCompletedFiles() {
        return Collections.unmodifiableSet(completedFiles);
    }

    public int getCompletedCount() {
        return completedFiles.size();
    }

    public int getMatchedCount() {
        return matchedCount.get();
    }

    public int getUnmatchedCount() {
        return unmatchedCount.get();
    }

    public int getErrorCount() {
        return errorCount.get();
    }

    public long getProcessedBytes() {
        return processedBytes.get();
    }

    public boolean isCompleted() {
        return completed;
    }

    public File getCheckpointFile() {
        return checkpointFile;
    }
}
