package com.takeoutfix.restore.infrastructure;

import java.io.IOException;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.CancellationException;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BooleanSupplier;

final class ZipQueue {
    private ZipQueue() {}

    static void put(BlockingQueue<Object> queue, Object item, AtomicReference<Throwable> failure)
            throws IOException, InterruptedException {
        put(queue, item, failure, () -> false);
    }

    static void put(BlockingQueue<Object> queue, Object item, AtomicReference<Throwable> failure,
                    BooleanSupplier cancelled) throws IOException, InterruptedException {
        while (true) {
            if (cancelled.getAsBoolean()) throw new CancellationException("ZIP writing cancelled");
            Throwable error = failure.get();
            if (error != null) throw new IOException("ZIP writer failed", error);
            if (queue.offer(item, 250, TimeUnit.MILLISECONDS)) return;
        }
    }
}
