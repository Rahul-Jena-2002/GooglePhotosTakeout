package com.rahul.service;

import org.json.JSONObject;

import java.io.File;
import java.nio.file.Files;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Tracks cumulative restoration stats (total files and bytes processed)
 * across all sessions. Stats are persisted to a JSON file in the user's
 * home directory so they survive application restarts.
 */
public class SessionStatsService {

    private static final File STATS_FILE = new File(
            System.getProperty("user.home"), ".takeoutfix_stats.json");

    private final AtomicLong totalFiles = new AtomicLong(0);
    private final AtomicLong totalBytes = new AtomicLong(0);

    public SessionStatsService() {
        load();
    }

    /** Adds a completed session's counts to the running totals and persists. */
    public synchronized void record(long files, long bytes) {
        totalFiles.addAndGet(files);
        totalBytes.addAndGet(bytes);
        save();
    }

    /** Synchronizes running totals to an absolute value and persists. */
    public synchronized void sync(long files, long bytes) {
        totalFiles.set(files);
        totalBytes.set(bytes);
        save();
    }

    public long getTotalFiles() { return totalFiles.get(); }
    public long getTotalBytes() { return totalBytes.get(); }

    /** Resets all totals (used by the dev purge utility). */
    public synchronized void reset() {
        totalFiles.set(0);
        totalBytes.set(0);
        save();
    }

    // ── persistence ───────────────────────────────────────────────────────────

    private void load() {
        if (!STATS_FILE.exists()) return;
        try {
            String content = Files.readString(STATS_FILE.toPath());
            if (content != null && !content.isBlank()) {
                JSONObject json = new JSONObject(content);
                totalFiles.set(json.optLong("totalFiles", 0));
                totalBytes.set(json.optLong("totalBytes", 0));
            }
        } catch (Exception ignored) {
            // Corrupt or unreadable — start fresh
        }
    }

    private void save() {
        try {
            JSONObject json = new JSONObject();
            json.put("totalFiles", totalFiles.get());
            json.put("totalBytes", totalBytes.get());
            Files.writeString(STATS_FILE.toPath(), json.toString(2));
        } catch (Exception ignored) {}
    }
}
