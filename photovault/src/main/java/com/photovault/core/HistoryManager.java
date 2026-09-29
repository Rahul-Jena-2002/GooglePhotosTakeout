package com.photovault.core;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.StandardOpenOption;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Lightweight, zero-dependency local audit history store for PhotoVault.
 * <p>
 * Preserves past verification runs (timestamp, source path, backup path,
 * files inspected, matched count, issue count, and final status)
 * in the user's home directory.
 */
public class HistoryManager {

    private static File historyFile = new File(
            System.getProperty("user.home"), ".photovault_history.tsv");

    private static final DateTimeFormatter FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    public record HistoryEntry(
            String timestamp,
            String originalPath,
            String backupPath,
            long totalFiles,
            long matchedFiles,
            int issueCount,
            String status
    ) {}

    /** Allows overriding the storage file for unit testing. */
    public static synchronized void setStorageFileForTesting(File file) {
        historyFile = file;
    }

    public static synchronized void record(String originalPath, String backupPath,
                                           long totalFiles, long matchedFiles,
                                           int issueCount, String status) {
        try {
            String ts = LocalDateTime.now().format(FORMATTER);
            String line = String.format("%s\t%s\t%s\t%d\t%d\t%d\t%s%n",
                    ts,
                    escape(originalPath),
                    escape(backupPath),
                    totalFiles,
                    matchedFiles,
                    issueCount,
                    escape(status)
            );
            Files.writeString(historyFile.toPath(), line,
                    StandardOpenOption.CREATE,
                    StandardOpenOption.APPEND);
        } catch (Exception ignored) {}
    }

    public static synchronized List<HistoryEntry> load() {
        List<HistoryEntry> list = new ArrayList<>();
        if (!historyFile.exists()) return list;

        try {
            List<String> lines = Files.readAllLines(historyFile.toPath());
            for (String line : lines) {
                if (line.isBlank()) continue;
                String[] parts = line.split("\t");
                if (parts.length >= 7) {
                    list.add(new HistoryEntry(
                            parts[0],
                            unescape(parts[1]),
                            unescape(parts[2]),
                            Long.parseLong(parts[3]),
                            Long.parseLong(parts[4]),
                            Integer.parseInt(parts[5]),
                            unescape(parts[6])
                    ));
                }
            }
        } catch (Exception ignored) {}

        // Return most recent first
        Collections.reverse(list);
        return list;
    }

    public static synchronized void clear() {
        if (historyFile.exists()) {
            historyFile.delete();
        }
    }

    private static String escape(String s) {
        if (s == null) return "";
        return s.replace("\t", " ").replace("\r", "").replace("\n", " ");
    }

    private static String unescape(String s) {
        return s != null ? s : "";
    }
}
