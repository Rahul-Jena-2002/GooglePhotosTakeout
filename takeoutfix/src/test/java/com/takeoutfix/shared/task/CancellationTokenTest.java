package com.takeoutfix.shared.task;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("Cancellation Token Unit Tests")
class CancellationTokenTest {

    @Test
    void testInitialStateNotCancelled() {
        CancellationToken token = new CancellationToken();
        assertFalse(token.isCancelled());
        assertDoesNotThrow(token::checkCancelled);
    }

    @Test
    void testCancelState() {
        CancellationToken token = new CancellationToken();
        token.cancel();
        assertTrue(token.isCancelled());
        assertThrows(CancellationToken.OperationCancelledException.class, token::checkCancelled);
    }

    @Test
    void testCallbacksInvokedOnCancel() {
        CancellationToken token = new CancellationToken();
        AtomicBoolean invoked = new AtomicBoolean(false);

        token.onCancel(() -> invoked.set(true));
        assertFalse(invoked.get());

        token.cancel();
        assertTrue(invoked.get());

        // Registering a callback after cancellation should trigger immediately
        AtomicBoolean lateInvoked = new AtomicBoolean(false);
        token.onCancel(() -> lateInvoked.set(true));
        assertTrue(lateInvoked.get());
    }

    @Test
    void testTaskProgressCalculations() {
        TaskProgress progress = TaskProgress.of("Hashing", 50, 100, "photo1.jpg");
        assertEquals("Hashing", progress.phase());
        assertEquals(50, progress.completedUnits());
        assertEquals(100, progress.totalUnits());
        assertEquals("photo1.jpg", progress.currentItem());
        assertEquals(0.5, progress.fraction(), 0.001);
        assertEquals(50, progress.percentage());
        assertFalse(progress.isIndeterminate());

        TaskProgress indeterminate = TaskProgress.indeterminate("Scanning", "Reading folder...");
        assertTrue(indeterminate.isIndeterminate());
    }

    @Test
    void testPauseAndResume() throws Exception {
        CancellationToken token = new CancellationToken();
        assertFalse(token.isPaused());

        AtomicBoolean resumed = new AtomicBoolean(false);
        token.pause();
        assertTrue(token.isPaused());

        Thread worker = new Thread(() -> {
            token.checkPauseAndCancel();
            resumed.set(true);
        });
        worker.start();

        Thread.sleep(50);
        assertFalse(resumed.get()); // Still waiting in pause

        token.resume();
        assertFalse(token.isPaused());
        worker.join(1000);
        assertTrue(resumed.get());
    }

    @Test
    void testCancelWhilePausedUnblocksThread() throws Exception {
        CancellationToken token = new CancellationToken();
        token.pause();

        AtomicBoolean threw = new AtomicBoolean(false);
        Thread worker = new Thread(() -> {
            try {
                token.checkPauseAndCancel();
            } catch (CancellationToken.OperationCancelledException e) {
                threw.set(true);
            }
        });
        worker.start();

        Thread.sleep(50);
        assertFalse(threw.get());

        token.cancel();
        worker.join(1000);
        assertTrue(threw.get());
    }
}
