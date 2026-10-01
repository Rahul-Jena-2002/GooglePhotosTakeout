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

    private final AtomicBoolean paused = new AtomicBoolean(false);
    private final Object pauseLock = new Object();

    public CancellationToken() {}

    /**
     * Pauses execution of the monitored operation.
     */
    public void pause() {
        paused.set(true);
    }

    /**
     * Resumes execution of the monitored operation.
     */
    public void resume() {
        synchronized (pauseLock) {
            paused.set(false);
            pauseLock.notifyAll();
        }
    }

    /**
     * Returns true if execution is currently paused.
     */
    public boolean isPaused() {
        return paused.get();
    }

    /**
     * Flags the token as cancelled, awakens any paused thread, and executes all registered callbacks.
     */
    public void cancel() {
        if (cancelled.compareAndSet(false, true)) {
            synchronized (pauseLock) {
                pauseLock.notifyAll();
            }
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
     * Cooperatively checks for cancellation and pause states.
     * If paused, blocks until resume() or cancel() is called.
     * If cancelled, throws an OperationCancelledException.
     */
    public void checkPauseAndCancel() throws OperationCancelledException {
        if (isCancelled()) {
            throw new OperationCancelledException("Operation was cancelled by user.");
        }
        synchronized (pauseLock) {
            while (paused.get() && !isCancelled()) {
                try {
                    pauseLock.wait();
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    throw new OperationCancelledException("Operation interrupted during pause.");
                }
            }
        }
        if (isCancelled()) {
            throw new OperationCancelledException("Operation was cancelled by user.");
        }
    }

    /**
     * Throws an OperationCancelledException if cancellation has been requested.
     */
    public void checkCancelled() throws OperationCancelledException {
        checkPauseAndCancel();
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
