package com.takeoutfix.restore.infrastructure;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;

import static org.junit.jupiter.api.Assertions.*;

class WorkerCompletionTest {
    @Test
    void reportsUnexpectedFailureEvenWhenCancelled() {
        CompletableFuture<Void> worker = CompletableFuture.failedFuture(new IllegalStateException("disk failed"));
        assertThrows(CompletionException.class, () -> WorkerCompletion.await(List.of(worker), () -> false));
        assertThrows(CompletionException.class, () -> WorkerCompletion.await(List.of(worker), () -> true));
    }

    @Test
    void waitsForWorkerToActuallyFinishAfterCancellation() throws Exception {
        CompletableFuture<Void> worker = new CompletableFuture<>();
        CompletableFuture<Void> waiter = CompletableFuture.runAsync(() -> WorkerCompletion.await(List.of(worker), () -> true));
        assertFalse(waiter.isDone());
        worker.complete(null);
        waiter.get(2, java.util.concurrent.TimeUnit.SECONDS);
    }

    @Test
    void treatsCancellationAsExpectedOnlyWhenRequested() {
        CompletableFuture<Void> worker = new CompletableFuture<>();
        worker.cancel(true);
        assertThrows(CompletionException.class, () -> WorkerCompletion.await(List.of(worker), () -> false));
        assertDoesNotThrow(() -> WorkerCompletion.await(List.of(worker), () -> true));
    }
}
