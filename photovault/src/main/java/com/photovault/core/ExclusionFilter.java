package com.photovault.core;

import java.nio.file.Path;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.LongAdder;

/**
 * Filter for operating system metadata noise files (.DS_Store, Thumbs.db, desktop.ini, ._*).
 * Provides transparent tracking so all excluded items are auditable in UI and verification reports.
 */
public class ExclusionFilter {

    /** Default OS noise file names (compared case-insensitively). */
    public static final Set<String> DEFAULT_EXCLUDED_FILENAMES = Set.of(
            ".ds_store",
            "thumbs.db",
            "desktop.ini",
            ".spotlight-v100",
            ".trashes",
            ".fseventsd"
    );

    private final Set<String> exactMatchLower;
    private final Set<String> customPrefixes;
    private final List<String> recordedExclusions = Collections.synchronizedList(new ArrayList<>());
    private final Map<String, LongAdder> exclusionCountByType = new ConcurrentHashMap<>();

    public ExclusionFilter() {
        this(DEFAULT_EXCLUDED_FILENAMES, Set.of("._"));
    }

    public ExclusionFilter(Set<String> excludedFilenames, Set<String> prefixes) {
        this.exactMatchLower = new HashSet<>();
        for (String name : excludedFilenames) {
            this.exactMatchLower.add(name.toLowerCase(Locale.ROOT));
        }
        this.customPrefixes = new HashSet<>(prefixes);
    }

    /**
     * Tests whether a file or directory name should be excluded.
     *
     * @param fileName the simple file name to test
     * @return true if the item is classified as OS noise
     */
    public boolean shouldExcludeName(String fileName) {
        if (fileName == null || fileName.isBlank()) {
            return false;
        }
        String lower = fileName.toLowerCase(Locale.ROOT);
        if (exactMatchLower.contains(lower)) {
            return true;
        }
        for (String prefix : customPrefixes) {
            if (lower.startsWith(prefix.toLowerCase(Locale.ROOT))) {
                return true;
            }
        }
        return false;
    }

    /**
     * Checks if a path should be excluded, and if so, records it for disclosure.
     *
     * @param relativePath the relative path string
     * @return true if excluded
     */
    public boolean testAndRecord(String relativePath) {
        if (relativePath == null || relativePath.isBlank()) {
            return false;
        }
        Path path = Path.of(relativePath);
        Path fileNameObj = path.getFileName();
        if (fileNameObj == null) {
            return false;
        }
        String fileName = fileNameObj.toString();
        if (shouldExcludeName(fileName)) {
            recordedExclusions.add(relativePath);
            String lower = fileName.toLowerCase(Locale.ROOT);
            String key = exactMatchLower.contains(lower) ? lower : "apple_double (._*)";
            exclusionCountByType.computeIfAbsent(key, k -> new LongAdder()).increment();
            return true;
        }
        return false;
    }

    /**
     * Returns an unmodifiable list of all paths excluded during the scan.
     */
    public List<String> getRecordedExclusions() {
        synchronized (recordedExclusions) {
            return List.copyOf(recordedExclusions);
        }
    }

    /**
     * Returns the total count of excluded files.
     */
    public int getExcludedCount() {
        return recordedExclusions.size();
    }

    /**
     * Returns summary counts grouped by category (e.g. "thumbs.db" -> 4).
     */
    public Map<String, Long> getCountsByType() {
        Map<String, Long> result = new HashMap<>();
        exclusionCountByType.forEach((k, v) -> result.put(k, v.sum()));
        return Collections.unmodifiableMap(result);
    }

    /**
     * Clears recorded exclusions for a new scan run.
     */
    public void reset() {
        recordedExclusions.clear();
        exclusionCountByType.clear();
    }
}
