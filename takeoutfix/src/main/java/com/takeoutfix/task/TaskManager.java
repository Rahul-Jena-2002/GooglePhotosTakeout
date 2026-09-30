package com.takeoutfix.task;

import javafx.collections.FXCollections;
import javafx.collections.ObservableList;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Future;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Central task orchestrator for TakeoutFix.
 * Allows multiple tools (Duplicate Finder, MetaSync, PhotoVault, Takeout Restore) to run
 * asynchronous operations in the background while dynamically managing system resources.
 *
 * Tasks continue uninterrupted as users navigate freely across different workspace screens.
 */
public class TaskManager {

    private static final TaskManager INSTANCE = new TaskManager();

    public static TaskManager getInstance() {
        return INSTANCE;
    }

    private final ResourceManager resourceManager;
    private final FileAccessCoordinator fileAccessCoordinator;

    private final ObservableList<BackgroundTask> activeTasks = FXCollections.observableArrayList();
    private final ObservableList<BackgroundTask> recentTasks = FXCollections.observableArrayList();
    private final ConcurrentHashMap<String, BackgroundTask> activeTasksMap = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, BackgroundTask> allTasksMap = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Future<?>> runningFutures = new ConcurrentHashMap<>();
    private final List<Runnable> taskChangeListeners = new CopyOnWriteArrayList<>();

    public TaskManager() {
        this(new ResourceManager(), new FileAccessCoordinator());
    }

    public TaskManager(ResourceManager resourceManager, FileAccessCoordinator fileAccessCoordinator) {
        this.resourceManager = resourceManager;
        this.fileAccessCoordinator = fileAccessCoordinator;
    }

    /**
     * Submits a background task to the central queue and begins asynchronous execution.
     */
    public synchronized void submitTask(BackgroundTask task) {
        if (task == null) return;

        activeTasksMap.put(task.getId(), task);
        allTasksMap.put(task.getId(), task);

        runFx(() -> {
            synchronized (activeTasks) {
                activeTasks.add(task);
            }
        });

        var executor = (task.getWorkloadType() == BackgroundTask.WorkloadType.IO_BOUND)
                ? resourceManager.getIoExecutor()
                : resourceManager.getCpuExecutor();

        Future<?> future = executor.submit(() -> {
            try {
                task.run();
            } finally {
                runningFutures.remove(task.getId());
                activeTasksMap.remove(task.getId());
                runFx(() -> {
                    synchronized (activeTasks) {
                        activeTasks.remove(task);
                    }
                    synchronized (recentTasks) {
                        if (!recentTasks.contains(task)) {
                            recentTasks.add(0, task);
                            if (recentTasks.size() > 50) {
                                recentTasks.remove(recentTasks.size() - 1);
                            }
                        }
                    }
                    notifyListeners();
                });
            }
        });

        runningFutures.put(task.getId(), future);
        notifyListeners();
    }

    public void pauseTask(String taskId) {
        if (taskId == null) return;
        BackgroundTask task = activeTasksMap.get(taskId);
        if (task != null) {
            task.pause();
            notifyListeners();
        }
    }

    public void resumeTask(String taskId) {
        if (taskId == null) return;
        BackgroundTask task = activeTasksMap.get(taskId);
        if (task != null) {
            task.resume();
            notifyListeners();
        }
    }

    public void cancelTask(String taskId) {
        if (taskId == null) return;
        BackgroundTask task = activeTasksMap.get(taskId);
        if (task == null) {
            task = allTasksMap.get(taskId);
        }
        if (task != null) {
            task.cancel();
            Future<?> future = runningFutures.get(taskId);
            if (future != null) {
                future.cancel(true);
            }
            notifyListeners();
        }
    }

    public void cancelAll() {
        for (BackgroundTask task : new java.util.ArrayList<>(activeTasksMap.values())) {
            task.cancel();
        }
        for (Future<?> f : new java.util.ArrayList<>(runningFutures.values())) {
            f.cancel(true);
        }
        notifyListeners();
    }

    public void pauseAll() {
        for (BackgroundTask task : activeTasksMap.values()) {
            task.pause();
        }
        notifyListeners();
    }

    public void resumeAll() {
        for (BackgroundTask task : activeTasksMap.values()) {
            task.resume();
        }
        notifyListeners();
    }

    public ObservableList<BackgroundTask> getActiveTasks() {
        return activeTasks;
    }

    public ObservableList<BackgroundTask> getRecentTasks() {
        return recentTasks;
    }

    public BackgroundTask getTask(String taskId) {
        if (taskId == null) return null;
        BackgroundTask t = activeTasksMap.get(taskId);
        if (t != null) return t;
        return allTasksMap.get(taskId);
    }

    public int getActiveTaskCount() {
        return activeTasksMap.size();
    }

    public boolean hasRunningTasks() {
        for (BackgroundTask t : activeTasksMap.values()) {
            if (t.isRunning()) return true;
        }
        return false;
    }

    public ResourceManager getResourceManager() {
        return resourceManager;
    }

    public FileAccessCoordinator getFileAccessCoordinator() {
        return fileAccessCoordinator;
    }

    public void addChangeListener(Runnable listener) {
        if (listener != null && !taskChangeListeners.contains(listener)) {
            taskChangeListeners.add(listener);
        }
    }

    public void removeChangeListener(Runnable listener) {
        taskChangeListeners.remove(listener);
    }

    private void runFx(Runnable action) {
        if (action == null) return;
        try {
            javafx.application.Platform.runLater(action);
        } catch (IllegalStateException e) {
            action.run();
        }
    }

    private void notifyListeners() {
        for (Runnable r : taskChangeListeners) {
            runFx(r);
        }
    }

    public void shutdown() {
        cancelAll();
        resourceManager.shutdown();
        fileAccessCoordinator.clear();
    }
}
