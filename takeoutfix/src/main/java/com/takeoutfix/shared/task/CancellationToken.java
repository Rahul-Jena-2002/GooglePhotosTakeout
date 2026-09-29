package com.takeoutfix.shared.task;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Thread-safe cancellation token used across all background operations
 * (Fix Google Photos, Compare Archives, Find Duplicates, Photo Studio).
 */
public class CancellationToken {

    private final AtomicBoolean cancelled = new AtomicBoolean(false);
    private final List<Runnable> cancelCallbacks = new CopyOnWriteArrayList<>();

    public CancellationToken() {}

    /**
     * Flags the token as cancelled and executes all registered callbacks.
     */
    public void cancel() {
        if (cancelled.compareAndSet(false, true)) {
            for (Runnable callback : cancelCallbacks) {
                try {
                    callback.run();
                } catch (Throwable ignored) {}
            }
        }
    }

    /**
     * Returns true if a cancellation request has been triggered.
     */
    public boolean isCancelled() {
        return cancelled.get();
    }

    /**
     * Throws an OperationCancelledException if cancellation has been requested.
     */
    public void checkCancelled() throws OperationCancelledException {
        if (isCancelled()) {
            throw new OperationCancelledException("Operation was cancelled by user.");
        }
    }

    /**
     * Registers a callback to be run upon cancellation.
     * If already cancelled, the callback runs immediately.
     */
    public void onCancel(Runnable callback) {
        if (callback == null) return;
        if (isCancelled()) {
            try {
                callback.run();
            } catch (Throwable ignored) {}
        } else {
            cancelCallbacks.add(callback);
        }
    }

    public static class OperationCancelledException extends RuntimeException {
        public OperationCancelledException(String message) {
            super(message);
        }
    }
}
