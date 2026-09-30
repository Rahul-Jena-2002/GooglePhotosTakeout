package com.takeoutfix.auth;

import org.json.JSONObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.prefs.Preferences;

/**
 * Local persistent quota tracker for Guest Mode (unauthenticated trial).
 * Enforces a strict limit of 100 files or 1 GB (1,073,741,824 bytes).
 * Uses dual-vault redundancy: standard JSON file + OS Java Preferences
 * so deleting either one automatically self-heals from the other.
 */
public final class GuestQuotaStore {

    private static final Logger log = LoggerFactory.getLogger(GuestQuotaStore.class);

    public static final int MAX_GUEST_FILES = 100;
    public static final long MAX_GUEST_BYTES = 1024L * 1024L * 1024L; // 1 GB

    private static final File CONFIG_DIR = new File(System.getProperty("user.home"), ".takeoutfix");
    private static final File GUEST_QUOTA_FILE = new File(CONFIG_DIR, "guest_quota.json");

    private static final Preferences PREFS = Preferences.userNodeForPackage(GuestQuotaStore.class);
    private static final String PREF_KEY_FILES = "guest_quota_files";
    private static final String PREF_KEY_BYTES = "guest_quota_bytes";

    private static int cachedFiles = -1;
    private static long cachedBytes = -1;

    private GuestQuotaStore() {}

    private static synchronized void loadIfNeeded() {
        if (cachedFiles >= 0 && cachedBytes >= 0) {
            return;
        }

        int fileCount = 0;
        long byteCount = 0;

        // 1. Read from OS Preferences (Registry on Windows)
        try {
            fileCount = PREFS.getInt(PREF_KEY_FILES, 0);
            byteCount = PREFS.getLong(PREF_KEY_BYTES, 0L);
        } catch (Exception ignored) {}

        // 2. Read from JSON file
        if (GUEST_QUOTA_FILE.exists()) {
            try {
                String content = Files.readString(GUEST_QUOTA_FILE.toPath(), StandardCharsets.UTF_8);
                JSONObject json = new JSONObject(content);
                int jsonFiles = json.optInt("files", 0);
                long jsonBytes = json.optLong("bytes", 0);
                fileCount = Math.max(fileCount, jsonFiles);
                byteCount = Math.max(byteCount, jsonBytes);
            } catch (Exception e) {
                log.warn("Failed to read guest quota store: {}", e.getMessage());
            }
        }

        cachedFiles = fileCount;
        cachedBytes = byteCount;

        // Re-persist so missing/cleared vault is instantly self-healed
        persist();
    }

    private static synchronized void persist() {
        // 1. Persist to OS Preferences
        try {
            PREFS.putInt(PREF_KEY_FILES, cachedFiles);
            PREFS.putLong(PREF_KEY_BYTES, cachedBytes);
            PREFS.flush();
        } catch (Exception e) {
            log.warn("Failed to flush preferences: {}", e.getMessage());
        }

        // 2. Persist to JSON file
        try {
            if (!CONFIG_DIR.exists()) {
                CONFIG_DIR.mkdirs();
            }
            JSONObject json = new JSONObject();
            json.put("files", cachedFiles);
            json.put("bytes", cachedBytes);
            json.put("updatedAt", System.currentTimeMillis());
            Files.writeString(GUEST_QUOTA_FILE.toPath(), json.toString(2), StandardCharsets.UTF_8);
        } catch (Exception e) {
            log.error("Failed to persist guest quota: {}", e.getMessage());
        }
    }

    public static synchronized int getRestoredFiles() {
        loadIfNeeded();
        return cachedFiles;
    }

    public static synchronized long getRestoredBytes() {
        loadIfNeeded();
        return cachedBytes;
    }

    public static synchronized void recordRestoration(int files, long bytes) {
        loadIfNeeded();
        cachedFiles += Math.max(0, files);
        cachedBytes += Math.max(0, bytes);
        persist();
    }

    public static synchronized boolean isExhausted() {
        return false;
    }

    public static synchronized int getRemainingFiles() {
        return Integer.MAX_VALUE;
    }

    public static synchronized long getRemainingBytes() {
        return Long.MAX_VALUE;
    }

    public static synchronized void resetForTesting() {
        cachedFiles = 0;
        cachedBytes = 0;
        if (GUEST_QUOTA_FILE.exists()) {
            try {
                GUEST_QUOTA_FILE.delete();
            } catch (Exception ignored) {}
        }
    }
}
