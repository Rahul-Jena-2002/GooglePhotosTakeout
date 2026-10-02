package com.takeoutfix.task;

import javafx.beans.property.*;

import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Representation of a long-running background task managed by {@link TaskManager}.
 * Emits observable JavaFX properties for seamless binding to UI cards, progress bars, and the persistent footer.
 */
public abstract class BackgroundTask implements Runnable {

    public enum TaskState {
        QUEUED,
        SCANNING,
        PROCESSING,
        RUNNING,
        PAUSING,
        PAUSED,
        CANCELLING,
        COMPLETED,
        FAILED,
        CANCELLED,
        INTERRUPTED
    }

    public enum WorkloadType {
        CPU_INTENSIVE,
        IO_BOUND,
        BALANCED
    }

    private final String id;
    private final String toolName;
    private final String taskTitle;
    private final WorkloadType workloadType;

    private final ObjectProperty<TaskState> state = new SimpleObjectProperty<>(TaskState.QUEUED);
    private final DoubleProperty progress = new SimpleDoubleProperty(0.0); // 0.0 to 1.0, or -1.0 for indeterminate
    private final StringProperty statusMessage = new SimpleStringProperty("Queued");
    private final LongProperty itemsProcessed = new SimpleLongProperty(0);
    private final LongProperty totalItems = new SimpleLongProperty(0);
    private final LongProperty bytesProcessed = new SimpleLongProperty(0);
    private final LongProperty totalBytes = new SimpleLongProperty(0);
    private final DoubleProperty throughputMbPerSec = new SimpleDoubleProperty(0.0);

    private final AtomicBoolean cancelRequested = new AtomicBoolean(false);
    private final AtomicBoolean pauseRequested = new AtomicBoolean(false);
    private final Object pauseLock = new Object();

    private long startTimeMs = 0L;
    private long endTimeMs = 0L;
    private Throwable failureError = null;

    private volatile TaskState rawState = TaskState.QUEUED;
    private volatile double rawProgress = 0.0;
    private volatile String rawStatusMessage = "Queued";
    private volatile long rawItemsProcessed = 0L;
    private volatile long rawTotalItems = 0L;
    private volatile long rawBytesProcessed = 0L;
    private volatile long rawTotalBytes = 0L;
    private volatile double rawThroughputMbPerSec = 0.0;

    public BackgroundTask(String toolName, String taskTitle, WorkloadType workloadType) {
        this.id = UUID.randomUUID().toString().substring(0, 8);
        this.toolName = toolName;
        this.taskTitle = taskTitle;
        this.workloadType = workloadType;
    }

    @Override
    public final void run() {
        if (cancelRequested.get()) {
            setState(TaskState.CANCELLED);
            return;
        }

        startTimeMs = System.currentTimeMillis();
        if (rawState == TaskState.QUEUED) {
            setState(TaskState.PROCESSING);
        }
        setStatusMessage("Starting " + taskTitle + "...");

        try {
            execute();
            if (cancelRequested.get()) {
                setState(TaskState.CANCELLED);
                setStatusMessage("Task cancelled by user");
            } else {
                setProgress(1.0);
                setState(TaskState.COMPLETED);
                setStatusMessage("Completed successfully");
            }
        } catch (InterruptedException e) {
            setState(TaskState.CANCELLED);
            setStatusMessage("Task cancelled");
            Thread.currentThread().interrupt();
        } catch (Throwable t) {
            failureError = t;
            setState(TaskState.FAILED);
            setStatusMessage("Failed: " + t.getMessage());
            t.printStackTrace();
        } finally {
            endTimeMs = System.currentTimeMillis();
            onFinished();
        }
    }

    /**
     * Optional lifecycle callback invoked when task finishes execution (COMPLETED, CANCELLED, or FAILED).
     */
    protected void onFinished() {}

    /**
     * Subclasses implement their workload execution loop here.
     * Should periodically invoke {@link #checkPauseOrCancel()} to respect pause and cancellation signals.
     */
    protected abstract void execute() throws Exception;

    /**
     * Helper to be called within task loops to cooperatively handle pause and cancellation.
     */
    protected void checkPauseOrCancel() throws InterruptedException {
        if (cancelRequested.get()) {
            throw new InterruptedException("Task was cancelled");
        }

        synchronized (pauseLock) {
            while (pauseRequested.get() && !cancelRequested.get()) {
                setState(TaskState.PAUSED);
                setStatusMessage("Paused");
                pauseLock.wait(100);
            }
        }

        if (cancelRequested.get()) {
            throw new InterruptedException("Task was cancelled");
        }
        if (getState() == TaskState.PAUSED || getState() == TaskState.PAUSING) {
            setState(TaskState.PROCESSING);
        }
    }

    public void pause() {
        TaskState s = rawState;
        if (s == TaskState.RUNNING || s == TaskState.SCANNING || s == TaskState.PROCESSING) {
            pauseRequested.set(true);
            setState(TaskState.PAUSING);
            onPauseRequested();
        }
    }

    /**
     * Optional hook for subclasses to propagate pause to underlying workers or child processes.
     */
    protected void onPauseRequested() {}

    public void resume() {
        if (pauseRequested.get() || rawState == TaskState.PAUSED || rawState == TaskState.PAUSING) {
            pauseRequested.set(false);
            onResumeRequested();
            synchronized (pauseLock) {
                pauseLock.notifyAll();
            }
            if (rawState == TaskState.PAUSED || rawState == TaskState.PAUSING) {
                setState(TaskState.PROCESSING);
            }
        }
    }

    /**
     * Optional hook for subclasses to propagate resume to underlying workers or child processes.
     */
    protected void onResumeRequested() {}

    public void cancel() {
        cancelRequested.set(true);
        setState(TaskState.CANCELLING);
        onCancelRequested();
        resume(); // Unblock if paused so thread can exit cleanly
    }

    /**
     * Optional hook for subclasses to propagate cancel to underlying workers or child processes.
     */
    protected void onCancelRequested() {}

    public boolean isCancelRequested() {
        return cancelRequested.get();
    }

    public boolean isCancelled() {
        return cancelRequested.get() || rawState == TaskState.CANCELLED || rawState == TaskState.CANCELLING;
    }

    public boolean isPaused() {
        return pauseRequested.get() || rawState == TaskState.PAUSED || rawState == TaskState.PAUSING;
    }

    public boolean isRunning() {
        TaskState s = rawState;
        return s == TaskState.RUNNING || s == TaskState.SCANNING || s == TaskState.PROCESSING
                || s == TaskState.PAUSING || s == TaskState.CANCELLING;
    }

    public boolean isFinished() {
        TaskState s = rawState;
        return s == TaskState.COMPLETED || s == TaskState.FAILED || s == TaskState.CANCELLED || s == TaskState.INTERRUPTED;
    }

    // --- Getters & Setters ---

    public String getId() { return id; }
    public String getToolName() { return toolName; }
    public String getTaskTitle() { return taskTitle; }
    public WorkloadType getWorkloadType() { return workloadType; }

    public TaskState getState() { return rawState; }
    public void setState(TaskState s) {
        this.rawState = s;
        runSafelyOnFx(() -> state.set(s));
    }
    public ObjectProperty<TaskState> stateProperty() { return state; }

    public double getProgress() { return rawProgress; }
    public void setProgress(double p) {
        double bounded = Math.max(-1.0, Math.min(1.0, p));
        this.rawProgress = bounded;
        runSafelyOnFx(() -> progress.set(bounded));
    }
    public DoubleProperty progressProperty() { return progress; }

    public String getStatusMessage() { return rawStatusMessage; }
    public void setStatusMessage(String msg) {
        String safe = msg != null ? msg : "";
        this.rawStatusMessage = safe;
        runSafelyOnFx(() -> statusMessage.set(safe));
    }
    public StringProperty statusMessageProperty() { return statusMessage; }

    public long getItemsProcessed() { return rawItemsProcessed; }
    public void setItemsProcessed(long val) {
        this.rawItemsProcessed = val;
        runSafelyOnFx(() -> itemsProcessed.set(val));
    }
    public LongProperty itemsProcessedProperty() { return itemsProcessed; }

    public long getTotalItems() { return rawTotalItems; }
    public void setTotalItems(long val) {
        this.rawTotalItems = val;
        runSafelyOnFx(() -> totalItems.set(val));
    }
    public LongProperty totalItemsProperty() { return totalItems; }

    public long getBytesProcessed() { return rawBytesProcessed; }
    public void setBytesProcessed(long val) {
        this.rawBytesProcessed = val;
        runSafelyOnFx(() -> bytesProcessed.set(val));
    }
    public LongProperty bytesProcessedProperty() { return bytesProcessed; }

    public long getTotalBytes() { return rawTotalBytes; }
    public void setTotalBytes(long val) {
        this.rawTotalBytes = val;
        runSafelyOnFx(() -> totalBytes.set(val));
    }
    public LongProperty totalBytesProperty() { return totalBytes; }

    public double getThroughputMbPerSec() { return rawThroughputMbPerSec; }
    public void setThroughputMbPerSec(double val) {
        this.rawThroughputMbPerSec = val;
        runSafelyOnFx(() -> throughputMbPerSec.set(val));
    }
    public DoubleProperty throughputMbPerSecProperty() { return throughputMbPerSec; }

    public long getStartTimeMs() { return startTimeMs; }
    public long getEndTimeMs() { return endTimeMs; }

    public long getDurationMs() {
        if (startTimeMs == 0) return 0L;
        return (endTimeMs > 0 ? endTimeMs : System.currentTimeMillis()) - startTimeMs;
    }

    public Throwable getFailureError() { return failureError; }
    public String getFailureMessage() {
        if (failureError == null) return null;
        return failureError.getMessage() != null ? failureError.getMessage() : failureError.getClass().getSimpleName();
    }

    private void runSafelyOnFx(Runnable action) {
        if (action == null) return;
        try {
            if (javafx.application.Platform.isFxApplicationThread()) {
                action.run();
            } else {
                javafx.application.Platform.runLater(action);
            }
        } catch (IllegalStateException ignored) {
            action.run();
        }
    }
}
