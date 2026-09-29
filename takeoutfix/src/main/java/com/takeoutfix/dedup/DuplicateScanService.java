package com.takeoutfix.dedup;

import com.takeoutfix.dedup.analysis.ExactHashAnalyzer;
import com.takeoutfix.dedup.analysis.OpenCvFeatureMatcher;
import com.takeoutfix.dedup.analysis.PerceptualHashAnalyzer;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Stream;

/**
 * Headless duplicate scanner that detects exact byte-identical copies using size-bucketing + SHA-256 digests,
 * or visually similar media using DCT-based Perceptual Hashing (pHash) and Difference Hashing (dHash).
 */
public class DuplicateScanService {

    public static class DuplicateCluster {
        private final String groupId;
        private final File primaryFile;
        private final List<File> duplicateCopies;
        private final long fileSize;
        private final String matchType;
        private final double similarityPercentage;

        public DuplicateCluster(String groupId, File primaryFile, List<File> duplicateCopies, long fileSize, String matchType) {
            this(groupId, primaryFile, duplicateCopies, fileSize, matchType, 100.0);
        }

        public DuplicateCluster(String groupId, File primaryFile, List<File> duplicateCopies, long fileSize, String matchType, double similarityPercentage) {
            this.groupId = groupId;
            this.primaryFile = primaryFile;
            this.duplicateCopies = Collections.unmodifiableList(duplicateCopies);
            this.fileSize = fileSize;
            this.matchType = matchType;
            this.similarityPercentage = similarityPercentage;
        }

        public String getGroupId() { return groupId; }
        public File getPrimaryFile() { return primaryFile; }
        public List<File> getDuplicateCopies() { return duplicateCopies; }
        public long getFileSize() { return fileSize; }
        public String getMatchType() { return matchType; }
        public double getSimilarityPercentage() { return similarityPercentage; }

        public long getReclaimableBytes() {
            long total = 0;
            for (File dup : duplicateCopies) {
                total += (dup != null && dup.exists()) ? dup.length() : fileSize;
            }
            return total;
        }
    }

    public static class ScanResult {
        private final List<DuplicateCluster> clusters;
        private final int totalFilesScanned;
        private final long totalReclaimableBytes;

        public ScanResult(List<DuplicateCluster> clusters, int totalFilesScanned) {
            this.clusters = Collections.unmodifiableList(clusters);
            this.totalFilesScanned = totalFilesScanned;
            this.totalReclaimableBytes = clusters.stream().mapToLong(DuplicateCluster::getReclaimableBytes).sum();
        }

        public List<DuplicateCluster> getClusters() { return clusters; }
        public int getTotalFilesScanned() { return totalFilesScanned; }
        public long getTotalReclaimableBytes() { return totalReclaimableBytes; }
    }

    public enum MatchStrategy {
        FILENAME("Filename Match"),
        EXACT_HASH("SHA-256 Exact"),
        PERCEPTUAL_HASH("Visual Similarity (pHash)"),
        FEATURE_MATCH("Visual Feature Match (ORB)");

        private final String label;
        MatchStrategy(String label) { this.label = label; }
        public String getLabel() { return label; }
    }

    public static final Set<String> MEDIA_EXTENSIONS = Set.of(
            // Photos & RAW
            "jpg", "jpeg", "png", "heic", "heif", "webp", "gif", "bmp", "tif", "tiff",
            "cr2", "cr3", "nef", "arw", "dng", "rw2", "orf", "pef", "raf", "raw",
            // Videos
            "mp4", "mov", "avi", "mkv", "m4v", "3gp", "wmv", "flv", "mpg", "mpeg", "webm"
    );

    private final ExactHashAnalyzer exactHashAnalyzer = new ExactHashAnalyzer();
    private final PerceptualHashAnalyzer perceptualHashAnalyzer = new PerceptualHashAnalyzer();
    private final OpenCvFeatureMatcher featureMatcher = new OpenCvFeatureMatcher();

    public static boolean isMediaFile(Path path) {
        if (path == null || path.getFileName() == null) return false;
        String name = path.getFileName().toString().toLowerCase(Locale.ROOT);
        if (name.endsWith(".json")) {
            return false; // Strictly exclude JSON sidecars
        }
        int dot = name.lastIndexOf('.');
        if (dot <= 0 || dot == name.length() - 1) return false;
        String ext = name.substring(dot + 1);
        return MEDIA_EXTENSIONS.contains(ext);
    }

    /**
     * Scans a directory recursively for duplicate media files using Filename matching by default.
     */
    public ScanResult scanDirectory(Path directory) throws IOException {
        return scanDirectory(directory, MatchStrategy.FILENAME, 90.0);
    }

    /**
     * Scans a directory recursively and groups duplicate media files by selected strategy.
     */
    public ScanResult scanDirectory(Path directory, MatchStrategy strategy) throws IOException {
        return scanDirectory(directory, strategy, 90.0);
    }

    /**
     * Scans a directory recursively with configurable visual similarity threshold (e.g. 85.0% - 95.0%).
     * All .json sidecars and non-media files are strictly excluded.
     */
    public ScanResult scanDirectory(Path directory, MatchStrategy strategy, double similarityThreshold) throws IOException {
        if (!Files.isDirectory(directory)) {
            throw new IllegalArgumentException("Target path is not a directory: " + directory);
        }

        Path normalizedDir = directory.toRealPath();
        List<File> mediaFiles = new ArrayList<>();

        try (Stream<Path> stream = Files.walk(normalizedDir)) {
            stream.filter(Files::isRegularFile)
                  .filter(DuplicateScanService::isMediaFile)
                  .forEach(p -> {
                try {
                    Path realPath = p.toRealPath();
                    if (!realPath.startsWith(normalizedDir)) {
                        return; // Symlink outside root
                    }
                    File f = p.toFile();
                    if (f.length() > 0) { // skip empty files
                        mediaFiles.add(f);
                    }
                } catch (IOException ignored) {}
            });
        }

        List<DuplicateCluster> clusters = new ArrayList<>();
        int groupIdx = 1;

        if (strategy == MatchStrategy.FILENAME) {
            // Group by filename (case-insensitive)
            Map<String, List<File>> nameMap = new HashMap<>();
            for (File f : mediaFiles) {
                String key = f.getName().toLowerCase(Locale.ROOT);
                nameMap.computeIfAbsent(key, k -> new ArrayList<>()).add(f);
            }

            for (List<File> group : nameMap.values()) {
                if (group.size() > 1) {
                    File primary = group.get(0);
                    List<File> duplicates = group.subList(1, group.size());
                    String gId = String.format("#%03d", groupIdx++);
                    clusters.add(new DuplicateCluster(gId, primary, duplicates, primary.length(), "Filename Match", 100.0));
                }
            }
        } else if (strategy == MatchStrategy.EXACT_HASH) {
            // EXACT_HASH: size bucketing then SHA-256
            Map<Long, List<File>> sizeMap = new HashMap<>();
            for (File f : mediaFiles) {
                sizeMap.computeIfAbsent(f.length(), k -> new ArrayList<>()).add(f);
            }

            for (Map.Entry<Long, List<File>> entry : sizeMap.entrySet()) {
                if (entry.getValue().size() > 1) {
                    Map<String, List<File>> hashMap = new ConcurrentHashMap<>();
                    entry.getValue().parallelStream().forEach(f -> {
                        String hash = exactHashAnalyzer.computeSha256(f);
                        if (hash != null) {
                            hashMap.computeIfAbsent(hash, k -> Collections.synchronizedList(new ArrayList<>())).add(f);
                        }
                    });

                    for (List<File> identicalGroup : hashMap.values()) {
                        if (identicalGroup.size() > 1) {
                            File primary = identicalGroup.get(0);
                            List<File> duplicates = identicalGroup.subList(1, identicalGroup.size());
                            String gId = String.format("#%03d", groupIdx++);
                            clusters.add(new DuplicateCluster(gId, primary, duplicates, entry.getKey(), "SHA-256 Exact", 100.0));
                        }
                    }
                }
            }
        } else {
            // PERCEPTUAL_HASH or FEATURE_MATCH (Visual Similarity)
            clusters.addAll(scanVisualDuplicates(mediaFiles, similarityThreshold, strategy));
        }

        return new ScanResult(clusters, mediaFiles.size());
    }

    private List<DuplicateCluster> scanVisualDuplicates(List<File> mediaFiles, double threshold, MatchStrategy strategy) {
        List<DuplicateCluster> clusters = new ArrayList<>();
        List<File> images = new ArrayList<>();

        for (File f : mediaFiles) {
            if (perceptualHashAnalyzer.isSupported(f)) {
                images.add(f);
            }
        }

        // Sort descending by file size (preferred keeper is higher resolution / larger file)
        images.sort((a, b) -> Long.compare(b.length(), a.length()));

        // Precompute perceptual hashes concurrently
        Map<File, PerceptualHashAnalyzer.LongPair> hashMap = new ConcurrentHashMap<>();
        images.parallelStream().forEach(f -> {
            PerceptualHashAnalyzer.LongPair p = PerceptualHashAnalyzer.computeFileHashes(f);
            if (p != null) {
                hashMap.put(f, p);
            }
        });

        Set<File> clustered = new HashSet<>();
        int groupIdx = 1;

        for (int i = 0; i < images.size(); i++) {
            File primary = images.get(i);
            if (clustered.contains(primary)) continue;
            PerceptualHashAnalyzer.LongPair hashPrimary = hashMap.get(primary);
            if (hashPrimary == null) continue;

            List<File> duplicates = new ArrayList<>();
            double minSim = 100.0;

            for (int j = i + 1; j < images.size(); j++) {
                File candidate = images.get(j);
                if (clustered.contains(candidate)) continue;
                PerceptualHashAnalyzer.LongPair hashCand = hashMap.get(candidate);
                if (hashCand == null) continue;

                double sim;
                if (strategy == MatchStrategy.FEATURE_MATCH && OpenCvFeatureMatcher.isOpencvAvailable()) {
                    sim = featureMatcher.calculateSimilarity(primary, candidate);
                } else {
                    double pSim = PerceptualHashAnalyzer.similarityPercentage(hashPrimary.pHash, hashCand.pHash);
                    double dSim = PerceptualHashAnalyzer.similarityPercentage(hashPrimary.dHash, hashCand.dHash);
                    sim = Math.max(dSim, (pSim * 0.5 + dSim * 0.5));
                }

                if (sim >= threshold) {
                    duplicates.add(candidate);
                    clustered.add(candidate);
                    minSim = Math.min(minSim, sim);
                }
            }

            if (!duplicates.isEmpty()) {
                clustered.add(primary);
                String gId = String.format("#%03d", groupIdx++);
                String matchLabel = String.format("Visual Match (%.0f%%)", minSim);
                clusters.add(new DuplicateCluster(gId, primary, duplicates, primary.length(), matchLabel, minSim));
            }
        }

        return clusters;
    }

    public String computeSha256(File file) {
        return exactHashAnalyzer.computeSha256(file);
    }
}
