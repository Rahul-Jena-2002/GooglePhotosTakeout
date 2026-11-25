package com.takeoutfix.restore;

import com.takeoutfix.restore.infrastructure.ExtractionService;
import com.takeoutfix.task.BackgroundTask;

import java.io.File;
import java.time.Instant;
import java.util.Optional;
import java.util.concurrent.Future;

/**
 * BackgroundTask adapter for the Google Photos Takeout restoration process.
 * Bridges ExtractionService events into observable BackgroundTask properties
 * for seamless integration with TaskManager, PersistentTaskFooter, and DashboardFxView.
 */
public class TakeoutRestoreTask extends BackgroundTask {

    private final ExtractionService extractionService;
    private final String inputPath;
    private final String outputPath;
    private final PowerManager.PostAction postAction;
    private final Optional<Instant> takeoutDate;
    private final boolean cleanupInput;
    private final boolean outputZip;
    private final int limitFiles;
    private final int offsetFiles;
    private final boolean interpolateMissing;
    private final boolean organizeYearMonth;

    private volatile Future<?> extractionFuture;

    public TakeoutRestoreTask(ExtractionService extractionService,
                              String inputPath,
                              String outputPath,
                              PowerManager.PostAction postAction,
                              Optional<Instant> takeoutDate,
                              boolean cleanupInput,
                              boolean outputZip,
                              int limitFiles,
                              int offsetFiles,
                              boolean interpolateMissing,
                              boolean organizeYearMonth) {
        super("Takeout Restore", new File(inputPath).getName(), WorkloadType.BALANCED);
        this.extractionService = extractionService;
        this.inputPath = inputPath;
        this.outputPath = outputPath;
        this.postAction = postAction;
        this.takeoutDate = takeoutDate;
        this.cleanupInput = cleanupInput;
        this.outputZip = outputZip;
        this.limitFiles = limitFiles;
        this.offsetFiles = offsetFiles;
        this.interpolateMissing = interpolateMissing;
        this.organizeYearMonth = organizeYearMonth;
    }

    @Override
    protected void execute() throws Exception {
        setState(TaskState.SCANNING);
        setStatusMessage("Analyzing Takeout archive and matching metadata...");
        java.util.concurrent.atomic.AtomicInteger reportedErrors = new java.util.concurrent.atomic.AtomicInteger();

        ExtractionService.RestorationListener listener = new ExtractionService.RestorationListener() {
            @Override
            public void onLog(String level, String message) {
                if ("WARN".equalsIgnoreCase(level) || "ERROR".equalsIgnoreCase(level)) {
                    setStatusMessage(message);
                }
            }

            @Override
            public void onProgress(int processed, int total, long processedBytes, String currentAction) {
                setItemsProcessed(processed);
                setTotalItems(total);
                setBytesProcessed(processedBytes);
                if (total > 0) {
                    setProgress((double) processed / total);
                }
                if (currentAction != null && !currentAction.isBlank()) {
                    setStatusMessage(currentAction);
                }
                if (processed > 0 && (getState() == TaskState.SCANNING || getState() == TaskState.QUEUED)) {
                    setState(TaskState.PROCESSING);
                }
            }

            @Override
            public void onProgressTelemetry(int processed, int total, long processedBytes, String currentAction,
                                           long elapsedSec, long etaSec, double filesPerSec, double mbPerSec) {
                onProgress(processed, total, processedBytes, currentAction);
                setThroughputMbPerSec(mbPerSec);
            }

            @Override
            public void onStats(int scanned, int total, int restored, int unmatched, int errors) {
                setTotalItems(total);
                reportedErrors.accumulateAndGet(errors, Math::max);
            }

            @Override
            public void onGuestLimitReached() {
                setState(TaskState.PAUSED);
                setStatusMessage("The next file exceeds your remaining guest allowance. Sign in to continue.");
            }
        };

        extractionService.addRestorationListener(listener);

        try {
            extractionFuture = extractionService.startExtraction(
                    inputPath,
                    outputPath,
                    postAction,
                    takeoutDate,
                    cleanupInput,
                    outputZip,
                    limitFiles,
                    offsetFiles,
                    interpolateMissing,
                    organizeYearMonth
            );
            if (isCancelRequested()) extractionService.cancel();

            // Await execution synchronously within the BackgroundTask thread
            awaitRestore(extractionFuture, this::isCancelRequested);

            if (extractionService.isCancelled()) {
                setState(TaskState.CANCELLED);
                setStatusMessage(outputZip
                        ? "Restoration cancelled. ZIP files may be incomplete; restart the export."
                        : "Restoration cancelled by user.");
            } else {
                requireComplete(extractionService.isPaused(), reportedErrors.get());
            }
        } finally {
            extractionService.removeRestorationListener(listener);
        }
    }

    static void requireComplete(boolean paused, int errors) throws java.io.IOException {
        if (paused) throw new java.io.IOException("Restoration stopped before completion. Review the log before starting again.");
        if (errors > 0) throw new java.io.IOException("Restoration finished with " + errors + " file error(s). Review the log.");
    }

    static void awaitRestore(Future<?> future, java.util.function.BooleanSupplier cancellationRequested) throws Exception {
        boolean interrupted = false;
        try {
            while (true) {
                try {
                    future.get();
                    return;
                } catch (InterruptedException e) {
                    if (!cancellationRequested.getAsBoolean()) throw e;
                    interrupted = true;
                }
            }
        } finally {
            if (interrupted) Thread.currentThread().interrupt();
        }
    }

    @Override
    protected void onPauseRequested() {
        if (extractionService != null) {
            extractionService.pause();
        }
    }

    @Override
    protected void onResumeRequested() {
        if (extractionService != null) {
            extractionService.resume();
        }
    }

    @Override
    protected void onCancelRequested() {
        if (extractionService != null) {
            extractionService.cancel();
        }
    }

    public ExtractionService getExtractionService() {
        return extractionService;
    }
}
