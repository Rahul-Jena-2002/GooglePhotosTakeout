package com.takeoutfix.restore;

import org.junit.jupiter.api.Test;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.jupiter.api.Assertions.*;

class TakeoutRestoreTaskTest {
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
