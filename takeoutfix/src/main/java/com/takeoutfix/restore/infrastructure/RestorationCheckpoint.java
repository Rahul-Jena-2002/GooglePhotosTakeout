package com.takeoutfix.restore.infrastructure;

import org.json.JSONArray;
import org.json.JSONObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.LinkOption;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.Collections;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Set;
import java.util.Map;
import java.util.UUID;
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
    private final String sourcePath;
    private final String options;
    private final Path outputRoot;
    private final Set<String> completedFiles = ConcurrentHashMap.newKeySet();
    private final Map<String, OutputSnapshot> outputs = new ConcurrentHashMap<>();
    private final Map<Path, String> directorySnapshots = new ConcurrentHashMap<>();

    private record OutputSnapshot(String path, long size, long modified, long sourceSize, long sourceModified, String directoryState) {}

    private final AtomicInteger matchedCount = new AtomicInteger(0);
    private final AtomicInteger unmatchedCount = new AtomicInteger(0);
    private final AtomicInteger errorCount = new AtomicInteger(0);
    private final AtomicLong processedBytes = new AtomicLong(0);

    private volatile boolean completed = false;
    private boolean checkpointOwned = false;
    private volatile boolean flushFailed = false;
    private volatile long lastFlushedTime = 0;
    private final AtomicInteger unpersistedFileCount = new AtomicInteger(0);

    private RestorationCheckpoint(File destinationDir, String sourcePath, String options) {
        this.checkpointFile = new File(destinationDir, CHECKPOINT_FILENAME);
        this.sourcePath = (sourcePath != null) ? sourcePath.trim() : "";
        this.options = options;
        this.outputRoot = destinationDir.toPath().toAbsolutePath().normalize();
    }

    /**
     * Loads an existing checkpoint from the destination directory if it matches the current source,
     * or creates a new empty checkpoint.
     */
    public static RestorationCheckpoint loadForOutput(File destinationDir, File sourceDir, boolean outputZip) {
        return outputZip ? null : load(destinationDir, sourceDir);
    }

    public static RestorationCheckpoint loadForOutput(File destinationDir, File sourceDir, boolean outputZip, String options) {
        return outputZip ? null : load(destinationDir, sourceDir, options);
    }

    public static RestorationCheckpoint load(File destinationDir, File sourceDir) {
        return load(destinationDir, sourceDir, "");
    }

    public static RestorationCheckpoint load(File destinationDir, File sourceDir, String options) {
        String sourcePathStr = (sourceDir != null) ? sourceDir.getAbsolutePath() : "";
        RestorationCheckpoint checkpoint = new RestorationCheckpoint(destinationDir, sourcePathStr, options);

        Path checkpointPath = checkpoint.checkpointFile.toPath();
        if (!Files.exists(checkpointPath, LinkOption.NOFOLLOW_LINKS)) {
            return checkpoint;
        }
        if (!Files.isRegularFile(checkpointPath, LinkOption.NOFOLLOW_LINKS)) {
            throw new IllegalStateException("The restore checkpoint is not a regular file. Choose a new output folder.");
        }

        try {
            String content;
            try (var input = Files.newInputStream(checkpointPath, StandardOpenOption.READ, LinkOption.NOFOLLOW_LINKS)) {
                content = new String(input.readAllBytes(), StandardCharsets.UTF_8);
            }
            if (content == null || content.isBlank()) {
                throw new IllegalStateException("The restore checkpoint is empty. Choose a new output folder.");
            }

            JSONObject json = new JSONObject(content);
            String savedSource = json.optString("sourcePath", "");

            // A directory name alone does not identify a source export.
            boolean matches = File.separatorChar == '\\'
                    ? savedSource.equalsIgnoreCase(sourcePathStr)
                    : savedSource.equals(sourcePathStr);

            if (!matches) {
                throw new IllegalStateException("The checkpoint belongs to a different source. Choose a new output folder.");
            }
            if (!json.optString("options", "").equals(options)) {
                throw new IllegalStateException("Restore settings have changed. Choose a new output folder or restore the original settings.");
            }

            checkpoint.matchedCount.set(json.optInt("matched", 0));
            checkpoint.unmatchedCount.set(json.optInt("unmatched", 0));
            // Failed files are retried, so errors describe the current run only.
            checkpoint.processedBytes.set(json.optLong("processedBytes", 0L));
            checkpoint.completed = json.optBoolean("completed", false);

            JSONArray filesArr = json.optJSONArray("completedFiles");
            JSONObject savedOutputs = json.optJSONObject("outputs");
            if (filesArr == null) throw new IllegalStateException("The checkpoint file is incomplete.");
            for (int i = 0; i < filesArr.length(); i++) {
                String rel = filesArr.optString(i, "");
                if (rel.isBlank() || !checkpoint.completedFiles.add(rel)) {
                    throw new IllegalStateException("The checkpoint contains an invalid or duplicate file path.");
                }
                JSONObject entry = savedOutputs == null ? null : savedOutputs.optJSONObject(rel);
                if (entry == null || !entry.has("path") || !entry.has("size") || !entry.has("modified")
                        || !entry.has("sourceSize") || !entry.has("sourceModified") || !entry.has("directoryState")) {
                    throw new IllegalStateException("This older checkpoint cannot verify its output files. Keep the originals and choose a new output folder.");
                }
                checkpoint.outputs.put(rel, new OutputSnapshot(entry.getString("path"), entry.getLong("size"), entry.getLong("modified"),
                        entry.getLong("sourceSize"), entry.getLong("sourceModified"), entry.getString("directoryState")));
            }

            for (String relativePath : checkpoint.completedFiles) {
                checkpoint.isFileAlreadyProcessed(relativePath);
            }

            checkpoint.checkpointOwned = true;
            log.info("Loaded destination checkpoint: %,d files already restored from source.", checkpoint.completedFiles.size());
        } catch (Exception e) {
            throw new IllegalStateException("Cannot safely resume this restore: " + e.getMessage(), e);
        }

        return checkpoint;
    }

    /**
     * Checks if a relative file path has already been restored in a previous run.
     */
    public boolean isFileAlreadyProcessed(String relativePath) {
        if (relativePath == null || relativePath.isBlank()) return false;
        if (!completedFiles.contains(relativePath)) return false;
        OutputSnapshot snapshot = outputs.get(relativePath);
        try {
            if (snapshot == null) throw new IllegalStateException("Output details are missing.");
            Path output = outputRoot.resolve(snapshot.path()).normalize();
            if (!output.startsWith(outputRoot) || Files.isSymbolicLink(output) || !Files.isRegularFile(output)
                    || !output.toRealPath().startsWith(outputRoot.toRealPath())
                    || Files.size(output) != snapshot.size()
                    || Files.getLastModifiedTime(output).toMillis() != snapshot.modified()) {
                throw new IllegalStateException("An earlier output is missing or changed: " + output);
            }
            Path sourceRoot = Path.of(sourcePath).toAbsolutePath().normalize();
            Path source = sourceRoot.resolve(relativePath).normalize();
            if (!source.startsWith(sourceRoot) || Files.isSymbolicLink(source) || !Files.isRegularFile(source)
                    || !source.toRealPath().startsWith(sourceRoot.toRealPath())
                    || Files.size(source) != snapshot.sourceSize()
                    || Files.getLastModifiedTime(source).toMillis() != snapshot.sourceModified()
                    || !directoryState(source.getParent()).equals(snapshot.directoryState())) {
                throw new IllegalStateException("An earlier source file is missing or changed: " + source);
            }
        } catch (java.io.IOException e) {
            throw new IllegalStateException("Cannot verify an earlier output for " + relativePath, e);
        }
        return true;
    }

    /**
     * Records a newly restored file and periodically flushes to disk.
     */
    public synchronized void recordCompletedFile(String relativePath, boolean isMatched, boolean isUnmatched, boolean isError, long bytes, Path output) {
        if (!isError && relativePath != null && !relativePath.isBlank()) {
            try {
                if (output == null) throw new IllegalStateException("Missing output path for completed file.");
                Path actual = output.toAbsolutePath().normalize();
                if (!actual.startsWith(outputRoot) || Files.isSymbolicLink(actual) || !Files.isRegularFile(actual)
                        || !actual.toRealPath().startsWith(outputRoot.toRealPath())) {
                    throw new IllegalStateException("Cannot safely record output: " + actual);
                }
                Path sourceRoot = Path.of(sourcePath).toAbsolutePath().normalize();
                Path source = sourceRoot.resolve(relativePath).normalize();
                if (!source.startsWith(sourceRoot) || Files.isSymbolicLink(source) || !Files.isRegularFile(source)
                        || !source.toRealPath().startsWith(sourceRoot.toRealPath())) {
                    throw new IllegalStateException("Cannot safely record source: " + source);
                }
                outputs.put(relativePath, new OutputSnapshot(outputRoot.relativize(actual).toString(), Files.size(actual),
                        Files.getLastModifiedTime(actual).toMillis(), Files.size(source), Files.getLastModifiedTime(source).toMillis(),
                        directoryState(source.getParent())));
            } catch (java.io.IOException e) {
                throw new IllegalStateException("Cannot record output for " + relativePath, e);
            }
            completedFiles.add(relativePath);
        }

        if (!isError && isMatched) matchedCount.incrementAndGet();
        else if (!isError && isUnmatched) unmatchedCount.incrementAndGet();
        if (isError) errorCount.incrementAndGet();
        if (!isError && bytes > 0) processedBytes.addAndGet(bytes);

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
        this.completed = markCompleted;
        Path temporary = null;
        boolean temporaryCreated = false;

        try {
            JSONObject json = new JSONObject();
            json.put("sourcePath", sourcePath);
            json.put("options", options);
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
            JSONObject savedOutputs = new JSONObject();
            outputs.forEach((key, value) -> savedOutputs.put(key, new JSONObject()
                    .put("path", value.path()).put("size", value.size()).put("modified", value.modified())
                    .put("sourceSize", value.sourceSize()).put("sourceModified", value.sourceModified())
                    .put("directoryState", value.directoryState())));
            json.put("outputs", savedOutputs);

            byte[] data = json.toString(2).getBytes(StandardCharsets.UTF_8);

            // Ensure destination directory exists
            File parentDir = checkpointFile.getParentFile();
            if (parentDir != null && !parentDir.exists()) {
                parentDir.mkdirs();
            }

            temporary = checkpointFile.toPath().resolveSibling(CHECKPOINT_FILENAME + "." + UUID.randomUUID() + ".tmp");
            try (FileChannel channel = FileChannel.open(temporary, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE)) {
                temporaryCreated = true;
                ByteBuffer buffer = ByteBuffer.wrap(data);
                while (buffer.hasRemaining()) channel.write(buffer);
                channel.force(true);
            }

            if (!checkpointOwned) {
                Files.move(temporary, checkpointFile.toPath());
            } else {
                try {
                    Files.move(temporary, checkpointFile.toPath(),
                            StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
                } catch (java.nio.file.AtomicMoveNotSupportedException moveEx) {
                    Files.move(temporary, checkpointFile.toPath(), StandardCopyOption.REPLACE_EXISTING);
                }
            }
            checkpointOwned = true;
            flushFailed = false;

            unpersistedFileCount.set(0);
            lastFlushedTime = System.currentTimeMillis();
        } catch (Exception e) {
            flushFailed = true;
            log.warn("Failed to flush restoration checkpoint: {}", e.getMessage());
        } finally {
            if (temporaryCreated) {
                try { Files.deleteIfExists(temporary); }
                catch (Exception e) { log.warn("Failed to remove temporary checkpoint: {}", e.getMessage()); }
            }
        }
    }

    public boolean hasFlushFailed() {
        return flushFailed;
    }

    /**
     * Deletes the checkpoint and any temporary checkpoint file once restoration finishes cleanly.
     */
    public synchronized void deleteCheckpointFile() {
        try {
            if (checkpointOwned) {
                Files.deleteIfExists(checkpointFile.toPath());
                checkpointOwned = false;
            }
        } catch (Exception e) {
            log.warn("Failed to delete checkpoint file: {}", e.getMessage());
        }
    }

    public Set<String> getCompletedFiles() {
        return Collections.unmodifiableSet(completedFiles);
    }

    private synchronized String directoryState(Path directory) throws java.io.IOException {
        String cached = directorySnapshots.get(directory);
        if (cached != null) return cached;
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            try (var entries = Files.list(directory)) {
                for (Path path : entries.sorted().toList()) {
                    String name = path.getFileName().toString();
                    if (name.startsWith(".")) continue;
                    BasicFileAttributes attributes = Files.readAttributes(path, BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
                    if (attributes.isSymbolicLink()) throw new java.io.IOException("Source folder contains a symbolic link: " + path);
                    if (!attributes.isRegularFile()) continue;
                    String item = name + "\0" + attributes.size() + "\0" + attributes.lastModifiedTime().toMillis() + "\0";
                    digest.update(item.getBytes(StandardCharsets.UTF_8));
                    if (name.toLowerCase(Locale.ROOT).endsWith(".json")) {
                        try (var input = Files.newInputStream(path)) {
                            byte[] buffer = new byte[8192];
                            int count;
                            while ((count = input.read(buffer)) != -1) digest.update(buffer, 0, count);
                        }
                    }
                }
            }
            String result = HexFormat.of().formatHex(digest.digest());
            directorySnapshots.put(directory, result);
            return result;
        } catch (NoSuchAlgorithmException e) {
            throw new java.io.IOException("SHA-256 is unavailable.", e);
        }
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
