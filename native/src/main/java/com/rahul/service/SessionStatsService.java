package com.rahul.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.IOException;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Tracks cumulative restoration stats (total files and bytes processed)
 * across all sessions. Stats are persisted to a JSON file in the user's
 * home directory so they survive Spring Boot restarts.
 */
@Service
public class SessionStatsService {

    private static final File STATS_FILE = new File(
            System.getProperty("user.home"), ".takeoutfix_stats.json");

    private final AtomicLong totalFiles = new AtomicLong(0);
    private final AtomicLong totalBytes = new AtomicLong(0);
    private final ObjectMapper mapper = new ObjectMapper();

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

    @SuppressWarnings("unchecked")
    private void load() {
        if (!STATS_FILE.exists()) return;
        try {
            Map<String, Object> data = mapper.readValue(STATS_FILE, Map.class);
            if (data.containsKey("totalFiles")) {
                totalFiles.set(((Number) data.get("totalFiles")).longValue());
            }
            if (data.containsKey("totalBytes")) {
                totalBytes.set(((Number) data.get("totalBytes")).longValue());
            }
        } catch (Exception ignored) {
            // Corrupt or unreadable — start fresh
        }
    }

    private void save() {
        try {
            mapper.writeValue(STATS_FILE,
                    Map.of("totalFiles", totalFiles.get(), "totalBytes", totalBytes.get()));
        } catch (IOException ignored) {}
    }
}
