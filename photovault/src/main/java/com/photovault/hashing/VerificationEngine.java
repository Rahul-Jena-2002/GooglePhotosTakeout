package com.photovault.hashing;

import com.photovault.core.DirectoryScanner;
import com.photovault.core.ExclusionFilter;
import com.photovault.core.PathValidator;
import com.photovault.model.*;

import java.io.IOException;
import java.nio.file.Path;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Core coordinator of the PhotoVault verification pipeline.
 * Orchestrates directory scanning, size comparison, concurrent SHA-256 streaming,
 * and 3-state outcome resolution.
 */
public class VerificationEngine {

    public interface VerificationListener {
        void onPhaseChange(String phaseName);
        void onProgress(long bytesProcessed, long totalBytes, double mbPerSec, int filesCompleted, int totalFiles);
        void onDiscrepancyFound(VerificationDiscrepancy discrepancy);
    }

    private final int threadCount;
    private final AtomicBoolean cancelled = new AtomicBoolean(false);
    private final AtomicBoolean paused = new AtomicBoolean(false);
    private final Object pauseLock = new Object();
    private ExecutorService executor;

    public VerificationEngine() {
        this(Math.max(1, Math.min(Runtime.getRuntime().availableProcessors(), 8)));
    }

    public VerificationEngine(int threadCount) {
        this.threadCount = Math.max(1, threadCount);
    }

    /**
     * Pauses hashing progression.
     */
    public void pause() {
        paused.set(true);
    }

    /**
     * Resumes hashing progression.
     */
    public void resume() {
        paused.set(false);
        synchronized (pauseLock) {
            pauseLock.notifyAll();
        }
    }

    public boolean isPaused() {
        return paused.get();
    }

    public void checkPause() {
        synchronized (pauseLock) {
            while (paused.get() && !cancelled.get()) {
                try {
                    pauseLock.wait(200);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
        }
    }

    /**
     * Cancels the active verification run promptly.
     */
    public void cancel() {
        cancelled.set(true);
        paused.set(false);
        synchronized (pauseLock) {
            pauseLock.notifyAll();
        }
        if (executor != null && !executor.isShutdown()) {
            executor.shutdownNow();
        }
    }

    public boolean isCancelled() {
        return cancelled.get();
    }

    /**
     * Executes full bit-for-bit verification of the original vs backup directory.
     */
    public VerificationResult verify(Path originalPath, Path backupPath, VerificationListener listener) {
        UUID runId = UUID.randomUUID();
        Instant startTime = Instant.now();
        cancelled.set(false);

        // 1. Path Safety & Overlap Validation
        PathValidator.ValidationResult pathValidation = PathValidator.validatePaths(originalPath, backupPath);
        if (!pathValidation.isValid()) {
            return new VerificationResult(
                    runId,
                    VerificationState.INCOMPLETE,
                    Instant.now(),
                    originalPath,
                    backupPath,
                    DirectoryInventory.empty(),
                    DirectoryInventory.empty(),
                    List.of(VerificationDiscrepancy.readError("", pathValidation.errorMessage())),
                    List.of(),
                    VerificationMetrics.zero(),
                    "Path validation failed: " + pathValidation.errorMessage()
            );
        }

        Path resolvedOriginal = pathValidation.resolvedOriginal();
        Path resolvedBackup = pathValidation.resolvedBackup();

        // 2. Inventory Scan Phase
        if (listener != null) {
            listener.onPhaseChange("Scanning directories...");
        }

        ExclusionFilter exclusionFilter = new ExclusionFilter();
        DirectoryScanner scanner = new DirectoryScanner(exclusionFilter);

        DirectoryScanner.ScanResult origScan;
        DirectoryScanner.ScanResult backupScan;
        try {
            origScan = scanner.scan(resolvedOriginal, null);
            backupScan = scanner.scan(resolvedBackup, null);
        } catch (IOException e) {
            return new VerificationResult(
                    runId,
                    VerificationState.INCOMPLETE,
                    Instant.now(),
                    resolvedOriginal,
                    resolvedBackup,
                    DirectoryInventory.empty(),
                    DirectoryInventory.empty(),
                    List.of(VerificationDiscrepancy.readError("", "Failed to scan directories: " + e.getMessage())),
                    List.of(),
                    VerificationMetrics.zero(),
                    "Scan I/O error: " + e.getMessage()
            );
        }

        List<VerificationDiscrepancy> discrepancies = new ArrayList<>();
        discrepancies.addAll(origScan.scanErrors());
        discrepancies.addAll(backupScan.scanErrors());

        Map<String, FileRecord> origFiles = origScan.inventory().files();
        Map<String, FileRecord> backupFiles = backupScan.inventory().files();

        // 3. Existence & Size Comparison
        List<String> candidatePathsToHash = new ArrayList<>();
        long totalBytesToHash = 0;

        for (Map.Entry<String, FileRecord> entry : origFiles.entrySet()) {
            String relPath = entry.getKey();
            FileRecord origRec = entry.getValue();

            if (!backupFiles.containsKey(relPath)) {
                VerificationDiscrepancy disc = VerificationDiscrepancy.missing(relPath, origRec.sizeBytes());
                discrepancies.add(disc);
                if (listener != null) listener.onDiscrepancyFound(disc);
            } else {
                FileRecord backupRec = backupFiles.get(relPath);
                if (origRec.sizeBytes() != backupRec.sizeBytes()) {
                    VerificationDiscrepancy disc = VerificationDiscrepancy.sizeMismatch(
                            relPath, origRec.sizeBytes(), backupRec.sizeBytes());
                    discrepancies.add(disc);
                    if (listener != null) listener.onDiscrepancyFound(disc);
                } else {
                    candidatePathsToHash.add(relPath);
                    // We will read both source and backup, so total hashed stream bytes is 2 * size
                    totalBytesToHash += (origRec.sizeBytes() * 2);
                }
            }
        }

        // Check for extra files in backup
        for (Map.Entry<String, FileRecord> entry : backupFiles.entrySet()) {
            String relPath = entry.getKey();
            FileRecord backupRec = entry.getValue();
            if (!origFiles.containsKey(relPath)) {
                VerificationDiscrepancy disc = VerificationDiscrepancy.extra(relPath, backupRec.sizeBytes());
                discrepancies.add(disc);
                if (listener != null) listener.onDiscrepancyFound(disc);
            }
        }

        // 4. SHA-256 Streaming Verification Phase
        if (listener != null) {
            listener.onPhaseChange("Streaming SHA-256 verification...");
        }

        executor = Executors.newFixedThreadPool(threadCount);
        AtomicLong processedBytes = new AtomicLong(0);
        AtomicInteger completedFiles = new AtomicInteger(0);
        int totalFilesToHash = candidatePathsToHash.size();
        long hashingStartTime = System.currentTimeMillis();

        List<Future<HashingTask.ComparisonOutcome>> futures = new ArrayList<>(totalFilesToHash);

        final long totalBytes = totalBytesToHash;
        for (String relPath : candidatePathsToHash) {
            if (cancelled.get()) {
                break;
            }
            long fileSize = origFiles.get(relPath).sizeBytes();
            HashingTask task = new HashingTask(resolvedOriginal, resolvedBackup, relPath, fileSize, bytesRead -> {
                checkPause();
                long current = processedBytes.addAndGet(bytesRead);
                if (listener != null) {
                    long elapsed = Math.max(1, System.currentTimeMillis() - hashingStartTime);
                    double mb = current / (1024.0 * 1024.0);
                    double mbPerSec = mb / (elapsed / 1000.0);
                    listener.onProgress(current, totalBytes, mbPerSec, completedFiles.get(), totalFilesToHash);
                }
            });
            futures.add(executor.submit(task));
        }

        // Await task completions
        for (Future<HashingTask.ComparisonOutcome> future : futures) {
            if (cancelled.get()) {
                break;
            }
            try {
                HashingTask.ComparisonOutcome outcome = future.get();
                if (outcome.discrepancy() != null) {
                    discrepancies.add(outcome.discrepancy());
                    if (listener != null) listener.onDiscrepancyFound(outcome.discrepancy());
                }
                completedFiles.incrementAndGet();
            } catch (InterruptedException | CancellationException e) {
                cancelled.set(true);
                break;
            } catch (ExecutionException e) {
                discrepancies.add(VerificationDiscrepancy.readError("", "Hashing error: " + e.getCause().getMessage()));
            }
        }

        executor.shutdown();
        try {
            if (!executor.awaitTermination(5, TimeUnit.SECONDS)) {
                executor.shutdownNow();
            }
        } catch (InterruptedException e) {
            executor.shutdownNow();
            Thread.currentThread().interrupt();
        }

        // 5. Outcome Resolution
        long totalElapsed = Math.max(1, System.currentTimeMillis() - startTime.toEpochMilli());
        VerificationMetrics metrics = VerificationMetrics.compute(
                origFiles.size() + backupFiles.size(),
                processedBytes.get(),
                totalElapsed,
                threadCount
        );

        VerificationState state;
        String summary;

        if (cancelled.get()) {
            state = VerificationState.INCOMPLETE;
            summary = "Verification cancelled by user before completion.";
        } else {
            boolean hasReadErrors = discrepancies.stream().anyMatch(d ->
                    d.type() == DiscrepancyType.READ_ERROR || d.type() == DiscrepancyType.UNSTABLE_FILE);

            if (hasReadErrors) {
                state = VerificationState.INCOMPLETE;
                summary = "Verification incomplete: read or permission errors encountered.";
            } else if (!discrepancies.isEmpty()) {
                state = VerificationState.DIFFERENCES_FOUND;
                long missingCount = discrepancies.stream().filter(d -> d.type() == DiscrepancyType.MISSING_IN_BACKUP).count();
                long hashMismatchCount = discrepancies.stream().filter(d -> d.type() == DiscrepancyType.HASH_MISMATCH).count();
                long sizeMismatchCount = discrepancies.stream().filter(d -> d.type() == DiscrepancyType.SIZE_MISMATCH).count();
                long extraCount = discrepancies.stream().filter(d -> d.type() == DiscrepancyType.EXTRA_IN_BACKUP).count();

                summary = String.format("Differences found: %d missing, %d corrupted/mismatch, %d size mismatch, %d extra.",
                        missingCount, hashMismatchCount, sizeMismatchCount, extraCount);
            } else {
                state = VerificationState.VERIFIED;
                summary = String.format("All %d original files matched bit-for-bit with 0 errors.", origFiles.size());
            }
        }

        Set<String> allExclusions = new TreeSet<>();
        allExclusions.addAll(origScan.inventory().excludedFiles());
        allExclusions.addAll(backupScan.inventory().excludedFiles());

        return new VerificationResult(
                runId,
                state,
                Instant.now(),
                resolvedOriginal,
                resolvedBackup,
                origScan.inventory(),
                backupScan.inventory(),
                Collections.unmodifiableList(discrepancies),
                List.copyOf(allExclusions),
                metrics,
                summary
        );
    }
}
