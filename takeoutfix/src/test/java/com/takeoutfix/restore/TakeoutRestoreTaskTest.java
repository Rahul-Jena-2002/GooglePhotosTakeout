package com.takeoutfix.restore;

import org.junit.jupiter.api.Test;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.jupiter.api.Assertions.*;

class TakeoutRestoreTaskTest {
    @Test
    void cancellationDuringStartupIsNotLost() {
        var taskRef = new java.util.concurrent.atomic.AtomicReference<TakeoutRestoreTask>();
        var cancelled = new AtomicBoolean();
        var service = new com.takeoutfix.restore.infrastructure.ExtractionService(null, null, null, null, null, null) {
            @Override
            public synchronized java.util.concurrent.Future<?> startExtraction(String input, String output,
                    PowerManager.PostAction action, java.util.Optional<java.time.Instant> date,
                    boolean cleanup, boolean zip, int limit, int offset, boolean interpolate, boolean organize) {
                taskRef.get().cancel();
                cancelled.set(false); // Simulate the start routine resetting its cancellation flag.
                return CompletableFuture.completedFuture(null);
            }
            @Override public synchronized void cancel() { cancelled.set(true); }
            @Override public boolean isCancelled() { return cancelled.get(); }
        };
        TakeoutRestoreTask task = new TakeoutRestoreTask(service, "input", "output", null,
                java.util.Optional.empty(), false, false, -1, 0, false, false);
        taskRef.set(task);
        task.run();
        assertTrue(cancelled.get());
        assertEquals(com.takeoutfix.task.BackgroundTask.TaskState.CANCELLED, task.getState());
    }

    @Test
    void incompleteRestoreDoesNotReportSuccess() {
        assertThrows(java.io.IOException.class, () -> TakeoutRestoreTask.requireComplete(false, 1));
        assertThrows(java.io.IOException.class, () -> TakeoutRestoreTask.requireComplete(true, 0));
        assertDoesNotThrow(() -> TakeoutRestoreTask.requireComplete(false, 0));
    }

    @Test
    void cancellationInterruptDoesNotFinishBeforeRestoreStops() throws Exception {
        var restore = new CompletableFuture<Void>();
        var waiting = new CountDownLatch(1);
        var finished = new CountDownLatch(1);
        var preservedInterrupt = new AtomicBoolean();
        Thread thread = new Thread(() -> {
            waiting.countDown();
            try {
                TakeoutRestoreTask.awaitRestore(restore, () -> true);
                preservedInterrupt.set(Thread.currentThread().isInterrupted());
            } catch (Exception e) {
                throw new AssertionError(e);
            } finally {
                finished.countDown();
            }
        });
        thread.start();
        assertTrue(waiting.await(2, TimeUnit.SECONDS));
        thread.interrupt();
        assertFalse(finished.await(100, TimeUnit.MILLISECONDS));
        restore.complete(null);
        assertTrue(finished.await(2, TimeUnit.SECONDS));
        assertTrue(preservedInterrupt.get());
    }
}
