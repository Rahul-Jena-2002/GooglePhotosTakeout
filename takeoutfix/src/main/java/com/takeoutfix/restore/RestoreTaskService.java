package com.takeoutfix.restore;

import com.takeoutfix.restore.infrastructure.ExtractionService;
import com.takeoutfix.shared.history.OperationHistoryService;

import java.io.File;
import java.time.Instant;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;

public final class RestoreTaskService {
    private final ExtractionService extractionService;
    private final SessionStatsService statsService;

    public RestoreTaskService(ExtractionService extractionService, SessionStatsService statsService) {
        this.extractionService = extractionService;
        this.statsService = statsService;
    }

    public TakeoutRestoreTask createRestoreTask(File source, File output, boolean shutdownRequested,
                                               boolean zipOutput, boolean estimateDates, boolean organizeMonth) {
        PowerManager.PostAction postAction = shutdownRequested
                ? PowerManager.PostAction.KEEP_AWAKE_THEN_SHUTDOWN
                : PowerManager.PostAction.KEEP_AWAKE_ONLY;

        return new TakeoutRestoreTask(
                extractionService,
                source.getAbsolutePath(),
                output.getAbsolutePath(),
                postAction,
                Optional.empty(),
                false,
                zipOutput,
                -1,
                0,
                estimateDates,
                organizeMonth
        );
    }

    public void recordCompletion(int restored, long bytes, boolean needsReview) {
        CompletableFuture.runAsync(() -> {
            try {
                if (statsService != null) statsService.record(restored, bytes);
                new OperationHistoryService().recordOperation(
                        "Fix Google Photos", needsReview ? "NEEDS_REVIEW" : "SUCCESS", null,
                        Instant.now(), restored, bytes,
                        needsReview ? "Restoration finished; some files need review." : "Google Photos Takeout restoration completed."
                );
            } catch (Exception error) {
                System.err.println("Could not save restoration history: " + error.getMessage());
            }
        });
    }
}
