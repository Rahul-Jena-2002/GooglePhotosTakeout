package com.photovault.core;

import com.photovault.model.DirectoryInventory;
import com.photovault.model.FileRecord;
import com.photovault.model.VerificationDiscrepancy;

import java.io.IOException;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.*;
import java.util.function.Consumer;

/**
 * Traverses a directory tree recursively using Java NIO.2.
 * Enforces boundary containment, filters OS metadata noise, and produces a normalized inventory.
 */
public class DirectoryScanner {

    public record ScanResult(
            DirectoryInventory inventory,
            List<VerificationDiscrepancy> scanErrors
    ) {}

    public interface ProgressListener {
        void onProgress(long filesDiscovered, long totalBytes);
    }

    private final ExclusionFilter exclusionFilter;

    public DirectoryScanner() {
        this(new ExclusionFilter());
    }

    public DirectoryScanner(ExclusionFilter exclusionFilter) {
        this.exclusionFilter = Objects.requireNonNull(exclusionFilter, "exclusionFilter cannot be null");
    }

    /**
     * Recursively scans the target root directory.
     *
     * @param root the directory root to scan
     * @param progressListener optional progress callback
     * @return ScanResult containing the inventory and any scan read errors
     * @throws IOException if root directory is unreadable
     */
    public ScanResult scan(Path root, ProgressListener progressListener) throws IOException {
        Objects.requireNonNull(root, "root path cannot be null");
        Path canonicalRoot = root.toRealPath();

        Map<String, FileRecord> files = new HashMap<>();
        List<VerificationDiscrepancy> scanErrors = new ArrayList<>();
        long[] counter = new long[]{0, 0}; // [filesCount, totalBytes]

        Files.walkFileTree(canonicalRoot, EnumSet.of(FileVisitOption.FOLLOW_LINKS), Integer.MAX_VALUE, new FileVisitor<>() {
            @Override
            public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) {
                // If symlink escapes boundary, skip directory
                if (Files.isSymbolicLink(dir) && PathValidator.isSymlinkEscapingRoot(dir, canonicalRoot)) {
                    scanErrors.add(VerificationDiscrepancy.readError(
                            normalizeRelativePath(canonicalRoot.relativize(dir)),
                            "Skipped directory symlink escaping root boundary"));
                    return FileVisitResult.SKIP_SUBTREE;
                }

                // If directory itself matches exclusion filter, skip subtree
                String dirName = dir.getFileName() != null ? dir.getFileName().toString() : "";
                if (exclusionFilter.shouldExcludeName(dirName)) {
                    return FileVisitResult.SKIP_SUBTREE;
                }
                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                Path relative = canonicalRoot.relativize(file);
                String normalizedPath = normalizeRelativePath(relative);

                // Check symlink escape
                if (Files.isSymbolicLink(file) && PathValidator.isSymlinkEscapingRoot(file, canonicalRoot)) {
                    scanErrors.add(VerificationDiscrepancy.readError(
                            normalizedPath, "Skipped symlink escaping root boundary"));
                    return FileVisitResult.CONTINUE;
                }

                // Check OS noise exclusion
                if (exclusionFilter.testAndRecord(normalizedPath)) {
                    return FileVisitResult.CONTINUE;
                }

                try {
                    long size = attrs.size();
                    long lastModified = attrs.lastModifiedTime().toMillis();
                    files.put(normalizedPath, new FileRecord(normalizedPath, size, lastModified));

                    counter[0]++;
                    counter[1] += size;

                    if (progressListener != null && counter[0] % 100 == 0) {
                        progressListener.onProgress(counter[0], counter[1]);
                    }
                } catch (Exception e) {
                    scanErrors.add(VerificationDiscrepancy.readError(normalizedPath, e.getMessage()));
                }

                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult visitFileFailed(Path file, IOException exc) {
                String normalizedPath = normalizeRelativePath(canonicalRoot.relativize(file));
                scanErrors.add(VerificationDiscrepancy.readError(
                        normalizedPath, exc != null ? exc.getMessage() : "Read failed"));
                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult postVisitDirectory(Path dir, IOException exc) {
                if (exc != null) {
                    String normalizedPath = normalizeRelativePath(canonicalRoot.relativize(dir));
                    scanErrors.add(VerificationDiscrepancy.readError(
                            normalizedPath, "Directory post-visit error: " + exc.getMessage()));
                }
                return FileVisitResult.CONTINUE;
            }
        });

        if (progressListener != null) {
            progressListener.onProgress(counter[0], counter[1]);
        }

        DirectoryInventory inventory = DirectoryInventory.of(files, exclusionFilter.getRecordedExclusions());
        return new ScanResult(inventory, Collections.unmodifiableList(scanErrors));
    }

    /**
     * Normalizes relative paths to forward slashes for deterministic cross-platform comparison.
     */
    public static String normalizeRelativePath(Path relativePath) {
        return relativePath.toString().replace('\\', '/');
    }
}
