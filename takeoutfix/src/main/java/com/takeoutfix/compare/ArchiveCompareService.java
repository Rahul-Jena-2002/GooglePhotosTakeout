package com.takeoutfix.compare;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.util.*;
import java.util.stream.Stream;

/**
 * Headless, hardened service for comparing photo collections and archives.
 * Implements:
 * 1. Safe recursive directory indexing with path-traversal and symlink defense.
 * 2. Multi-tier comparison: Relative path -> File size -> SHA-256 byte digest.
 * 3. Categorization into Exact, Missing, Additional, and Modified items.
 * 4. Safe Copy operation that guarantees zero overwrite of existing destination files.
 * 5. Escaped CSV and JSON export routines.
 */
public class ArchiveCompareService {

    public enum DiffType {
        EXACT("Exact Match"),
        MISSING_IN_B("Missing in B"),
        ADDITIONAL_IN_B("Additional in B"),
        MODIFIED("Modified Content");

        private final String label;
        DiffType(String label) { this.label = label; }
        public String getLabel() { return label; }
    }

    public static class CompareRecord {
        private final String relativePath;
        private final String sourceAInfo;
        private final String sourceBInfo;
        private final DiffType diffType;
        private final File fileA;
        private final File fileB;

        public CompareRecord(String relativePath, String sourceAInfo, String sourceBInfo, DiffType diffType, File fileA, File fileB) {
            this.relativePath = relativePath;
            this.sourceAInfo = sourceAInfo;
            this.sourceBInfo = sourceBInfo;
            this.diffType = diffType;
            this.fileA = fileA;
            this.fileB = fileB;
        }

        public String getRelativePath() { return relativePath; }
        public String getSourceAInfo() { return sourceAInfo; }
        public String getSourceBInfo() { return sourceBInfo; }
        public DiffType getDiffType() { return diffType; }
        public File getFileA() { return fileA; }
        public File getFileB() { return fileB; }
    }

    public static class ComparisonResult {
        private final List<CompareRecord> records;
        private final long exactCount;
        private final long missingCount;
        private final long additionalCount;
        private final long modifiedCount;

        public ComparisonResult(List<CompareRecord> records) {
            this.records = Collections.unmodifiableList(records);
            this.exactCount = records.stream().filter(r -> r.getDiffType() == DiffType.EXACT).count();
            this.missingCount = records.stream().filter(r -> r.getDiffType() == DiffType.MISSING_IN_B).count();
            this.additionalCount = records.stream().filter(r -> r.getDiffType() == DiffType.ADDITIONAL_IN_B).count();
            this.modifiedCount = records.stream().filter(r -> r.getDiffType() == DiffType.MODIFIED).count();
        }

        public List<CompareRecord> getRecords() { return records; }
        public long getExactCount() { return exactCount; }
        public long getMissingCount() { return missingCount; }
        public long getAdditionalCount() { return additionalCount; }
        public long getModifiedCount() { return modifiedCount; }
    }

    /**
     * Set of supported photo and video extensions.
     * All .json sidecars (metadata.json, supplemental-metadata.json) and non-media files are strictly excluded.
     */
    public static final Set<String> MEDIA_EXTENSIONS = Set.of(
            // Photos & RAW
            "jpg", "jpeg", "png", "heic", "heif", "webp", "gif", "bmp", "tif", "tiff",
            "cr2", "cr3", "nef", "arw", "dng", "rw2", "orf", "pef", "raf", "raw",
            // Videos
            "mp4", "mov", "avi", "mkv", "m4v", "3gp", "wmv", "flv", "mpg", "mpeg", "webm"
    );

    public static boolean isMediaFile(Path path) {
        if (path == null || path.getFileName() == null) return false;
        String name = path.getFileName().toString().toLowerCase(Locale.ROOT);
        if (name.endsWith(".json")) {
            return false;
        }
        int dot = name.lastIndexOf('.');
        if (dot <= 0 || dot == name.length() - 1) return false;
        String ext = name.substring(dot + 1);
        return MEDIA_EXTENSIONS.contains(ext);
    }

    /**
     * Recursively indexes a collection directory with path traversal and symlink guards.
     * Only indexes genuine photo and video files (ignores .json sidecars).
     */
    public Map<String, File> indexDirectory(Path rootDir) throws IOException {
        return indexDirectory(rootDir, null);
    }

    public Map<String, File> indexDirectory(Path rootDir, com.takeoutfix.shared.task.CancellationToken token) throws IOException {
        if (!Files.isDirectory(rootDir)) {
            throw new IllegalArgumentException("Root path must be a valid directory: " + rootDir);
        }

        Map<String, File> index = new HashMap<>();
        Path normalizedRoot = rootDir.toRealPath();

        try (Stream<Path> stream = Files.walk(normalizedRoot)) {
            stream.filter(Files::isRegularFile)
                  .filter(ArchiveCompareService::isMediaFile)
                  .forEach(p -> {
                if (token != null) token.checkPauseAndCancel();
                try {
                    // Security guard: prevent symlink escapes outside root
                    Path realPath = p.toRealPath();
                    if (!realPath.startsWith(normalizedRoot)) {
                        return; // Skip symlink outside root
                    }

                    Path rel = normalizedRoot.relativize(realPath);
                    String relStr = rel.toString().replace('\\', '/');

                    // Security guard: no path traversal characters
                    if (!relStr.contains("..")) {
                        index.put(relStr, p.toFile());
                    }
                } catch (IOException ignored) {}
            });
        }

        return index;
    }

    /**
     * Compares two collection directories.
     */
    public ComparisonResult compare(Path sourceA, Path sourceB) throws IOException {
        return compare(sourceA, sourceB, null);
    }

    public ComparisonResult compare(Path sourceA, Path sourceB, com.takeoutfix.shared.task.CancellationToken token) throws IOException {
        Map<String, File> filesA = indexDirectory(sourceA, token);
        Map<String, File> filesB = indexDirectory(sourceB, token);

        Set<String> allPaths = new TreeSet<>();
        allPaths.addAll(filesA.keySet());
        allPaths.addAll(filesB.keySet());

        List<CompareRecord> records = Collections.synchronizedList(new ArrayList<>());

        for (String rel : allPaths) {
            if (token != null) token.checkPauseAndCancel();
            File fa = filesA.get(rel);
            File fb = filesB.get(rel);

            if (fa != null && fb == null) {
                records.add(new CompareRecord(rel, formatSize(fa.length()), "Missing in Source B", DiffType.MISSING_IN_B, fa, null));
            } else if (fa == null && fb != null) {
                records.add(new CompareRecord(rel, "Not in Source A", formatSize(fb.length()), DiffType.ADDITIONAL_IN_B, null, fb));
            } else if (fa != null && fb != null) {
                String aInfo = formatSize(fa.length());
                String bInfo = formatSize(fb.length());

                if (fa.length() == fb.length()) {
                    String hashA = computeSha256(fa);
                    String hashB = computeSha256(fb);
                    if (Objects.equals(hashA, hashB)) {
                        records.add(new CompareRecord(rel, aInfo, bInfo, DiffType.EXACT, fa, fb));
                    } else {
                        records.add(new CompareRecord(rel, aInfo, bInfo, DiffType.MODIFIED, fa, fb));
                    }
                } else {
                    records.add(new CompareRecord(rel, aInfo, bInfo, DiffType.MODIFIED, fa, fb));
                }
            }
        }

        records.sort(Comparator.comparing(CompareRecord::getRelativePath));
        return new ComparisonResult(records);
    }

    /**
     * Copies missing files from Source A into destination root.
     * Hardened: NEVER overwrites existing files.
     */
    public int safeCopyMissing(List<CompareRecord> records, Path destinationDir) throws IOException {
        if (!Files.isDirectory(destinationDir)) {
            Files.createDirectories(destinationDir);
        }
        Path normalizedDest = destinationDir.toRealPath();

        int copied = 0;
        for (CompareRecord r : records) {
            if (r.getDiffType() == DiffType.MISSING_IN_B && r.getFileA() != null && r.getFileA().exists()) {
                Path target = normalizedDest.resolve(r.getRelativePath()).normalize();

                // Security guard: ensure target stays inside destination
                if (!target.startsWith(normalizedDest)) {
                    continue;
                }

                if (!Files.exists(target)) {
                    Files.createDirectories(target.getParent());
                    Files.copy(r.getFileA().toPath(), target, StandardCopyOption.COPY_ATTRIBUTES);
                    copied++;
                }
            }
        }
        return copied;
    }

    public String computeSha256(File file) {
        try (FileInputStream fis = new FileInputStream(file)) {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] buf = new byte[65536];
            int read;
            while ((read = fis.read(buf)) != -1) {
                md.update(buf, 0, read);
            }
            byte[] digest = md.digest();
            StringBuilder sb = new StringBuilder();
            for (byte b : digest) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception e) {
            return null;
        }
    }

    public String exportCsv(List<CompareRecord> records) {
        StringBuilder sb = new StringBuilder();
        sb.append("RelativePath,SourceAInfo,SourceBInfo,ComparisonStatus\n");
        for (CompareRecord r : records) {
            sb.append(String.format("\"%s\",\"%s\",\"%s\",\"%s\"\n",
                    escapeCsv(r.getRelativePath()),
                    escapeCsv(r.getSourceAInfo()),
                    escapeCsv(r.getSourceBInfo()),
                    escapeCsv(r.getDiffType().getLabel())));
        }
        return sb.toString();
    }

    public String exportJson(List<CompareRecord> records) {
        StringBuilder sb = new StringBuilder();
        sb.append("[\n");
        for (int i = 0; i < records.size(); i++) {
            CompareRecord r = records.get(i);
            sb.append(String.format("  {\"relativePath\": \"%s\", \"sourceA\": \"%s\", \"sourceB\": \"%s\", \"status\": \"%s\"}%s\n",
                    escapeJson(r.getRelativePath()),
                    escapeJson(r.getSourceAInfo()),
                    escapeJson(r.getSourceBInfo()),
                    escapeJson(r.getDiffType().getLabel()),
                    (i < records.size() - 1 ? "," : "")));
        }
        sb.append("]");
        return sb.toString();
    }

    private String formatSize(long bytes) {
        double mb = bytes / (1024.0 * 1024.0);
        return String.format("%.2f MB", mb);
    }

    private String escapeCsv(String s) {
        if (s == null) return "";
        return s.replace("\"", "\"\"");
    }

    private String escapeJson(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", " ").replace("\r", "");
    }
}
