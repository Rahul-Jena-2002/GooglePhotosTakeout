package com.takeoutfix.restore.infrastructure;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.CancellationException;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.jupiter.api.Assertions.*;

class ZipQueueTest {
    @Test
    void writerFailureStopsAProducerEvenWhenQueueIsFull() {
        var queue = new ArrayBlockingQueue<Object>(1);
        queue.add(new Object());
        var failure = new AtomicReference<Throwable>(new IOException("disk error"));
        assertThrows(IOException.class, () -> ZipQueue.put(queue, new Object(), failure));
        assertEquals(1, queue.size());
    }

    @Test
    void producerStopsWhenWriterFailsWhileQueueIsFull() throws Exception {
        var queue = new ArrayBlockingQueue<Object>(1);
        queue.add(new Object());
        var failure = new AtomicReference<Throwable>();
        var producer = CompletableFuture.runAsync(() -> {
            try {
                ZipQueue.put(queue, new Object(), failure);
                fail("Expected ZIP writer failure");
            } catch (IOException expected) {
                assertEquals("disk error", expected.getCause().getMessage());
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new AssertionError(e);
            }
        });
        failure.set(new IOException("disk error"));
        producer.get(2, TimeUnit.SECONDS);
    }

    @Test
    void itemIsQueuedWhenWriterIsHealthy() throws Exception {
        var queue = new ArrayBlockingQueue<Object>(1);
        var item = new Object();
        ZipQueue.put(queue, item, new AtomicReference<>());
        assertSame(item, queue.remove());
    }

    @Test
    void cancellationReleasesProducerWaitingOnFullQueue() throws Exception {
        var queue = new ArrayBlockingQueue<Object>(1);
        queue.add(new Object());
        var cancelled = new AtomicBoolean();
        var checkingQueue = new CountDownLatch(1);
        var producer = CompletableFuture.runAsync(() -> {
            assertThrows(CancellationException.class,
                    () -> ZipQueue.put(queue, new Object(), new AtomicReference<>(), () -> {
                        checkingQueue.countDown();
                        return cancelled.get();
                    }));
        });
        assertTrue(checkingQueue.await(2, TimeUnit.SECONDS));
        cancelled.set(true);
        producer.get(2, TimeUnit.SECONDS);
        assertEquals(1, queue.size());
    }
}
