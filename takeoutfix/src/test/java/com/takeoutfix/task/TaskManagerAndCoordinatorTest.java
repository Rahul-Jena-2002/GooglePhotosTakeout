package com.takeoutfix.task;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import javafx.application.Platform;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;

public class TaskManagerAndCoordinatorTest {

    @BeforeAll
    public static void initJavaFx() {
        if ("true".equalsIgnoreCase(System.getenv("GITHUB_ACTIONS")) && !System.getProperty("os.name").toLowerCase().contains("win")) {
            return; // Skip JavaFX graphical toolkit startup on headless Linux/macOS runners
        }
        CountDownLatch latch = new CountDownLatch(1);
        try {
            Platform.startup(latch::countDown);
            latch.await(2, TimeUnit.SECONDS);
        } catch (Throwable ignored) {}
    }

    private FileAccessCoordinator coordinator;
    private ResourceManager resourceManager;
    private TaskManager taskManager;

    @BeforeEach
    public void setup() {
        coordinator = new FileAccessCoordinator();
        resourceManager = new ResourceManager();
        taskManager = new TaskManager(resourceManager, coordinator);
    }

    @AfterEach
    public void tearDown() {
        taskManager.shutdown();
    }

    @Test
    public void testFileAccessCoordinatorReadWrite(@TempDir Path tempDir) throws Exception {
        Path file = tempDir.resolve("sample.jpg");
        Files.writeString(file, "test photo");

        // 1. Two tasks can acquire shared read concurrently
        assertTrue(coordinator.tryAcquireSharedRead(file, "task-1"));
        assertTrue(coordinator.tryAcquireSharedRead(file, "task-2"));

        // 2. Exclusive write fails while read locks are active
        assertFalse(coordinator.tryAcquireExclusiveWrite(file, "task-3"));

        // 3. Release both shared read locks
        coordinator.releaseSharedRead(file, "task-1");
        coordinator.releaseSharedRead(file, "task-2");

        // 4. Now exclusive write succeeds
        assertTrue(coordinator.tryAcquireExclusiveWrite(file, "task-3"));
        assertTrue(coordinator.isWriteLocked(file));
        assertEquals("task-3", coordinator.getWriteOwner(file));

        // 5. Subsequent read fails while write is held
        assertFalse(coordinator.tryAcquireSharedRead(file, "task-4"));

        // 6. Release exclusive write
        coordinator.releaseExclusiveWrite(file, "task-3");
        assertFalse(coordinator.isWriteLocked(file));
    }

    @Test
    public void testResourceManagerModesAndTelemetry() {
        assertTrue(resourceManager.getAvailableCores() >= 1);

        // Test mode switches
        resourceManager.setProcessingMode(ResourceManager.ProcessingMode.PERFORMANCE);
        assertEquals(ResourceManager.ProcessingMode.PERFORMANCE, resourceManager.getProcessingMode());

        resourceManager.setProcessingMode(ResourceManager.ProcessingMode.BACKGROUND);
        assertEquals(ResourceManager.ProcessingMode.BACKGROUND, resourceManager.getProcessingMode());

        resourceManager.setCustomMaxWorkers(64);
        resourceManager.setProcessingMode(ResourceManager.ProcessingMode.CUSTOM);
        assertEquals(ResourceManager.ProcessingMode.CUSTOM, resourceManager.getProcessingMode());

        resourceManager.setCustomMaxWorkers(1);
        resourceManager.setProcessingMode(ResourceManager.ProcessingMode.CUSTOM);
        assertEquals(ResourceManager.ProcessingMode.CUSTOM, resourceManager.getProcessingMode());

        resourceManager.setCustomMaxWorkers(16);
        resourceManager.setProcessingMode(ResourceManager.ProcessingMode.CUSTOM);
        assertEquals(ResourceManager.ProcessingMode.CUSTOM, resourceManager.getProcessingMode());

        resourceManager.setProcessingMode(ResourceManager.ProcessingMode.BALANCED);
        assertEquals(ResourceManager.ProcessingMode.BALANCED, resourceManager.getProcessingMode());

        // Telemetry metrics
        assertTrue(resourceManager.getJvmMemoryUsedMb() >= 0);
        assertTrue(resourceManager.getJvmMemoryMaxMb() > 0);
    }

    @Test
    public void testTaskManagerExecutionAndLifecycle() throws Exception {
        CountDownLatch startedLatch = new CountDownLatch(1);
        CountDownLatch completedLatch = new CountDownLatch(1);

        BackgroundTask testTask = new BackgroundTask("TestTool", "Mock Scan", BackgroundTask.WorkloadType.BALANCED) {
            @Override
            protected void execute() throws Exception {
                startedLatch.countDown();
                for (int i = 1; i <= 5; i++) {
                    checkPauseOrCancel();
                    setProgress(i / 5.0);
                    Thread.sleep(20);
                }
                completedLatch.countDown();
            }
        };

        taskManager.submitTask(testTask);

        assertTrue(startedLatch.await(3, TimeUnit.SECONDS), "Task did not start in time");
        assertTrue(completedLatch.await(3, TimeUnit.SECONDS), "Task did not complete in time");

        // Wait brief moment for thread completion callback
        Thread.sleep(100);
        assertEquals(BackgroundTask.TaskState.COMPLETED, testTask.getState());
        assertEquals(1.0, testTask.getProgress(), 0.01);
    }

    @Test
    public void testTaskCancellation() throws Exception {
        CountDownLatch startedLatch = new CountDownLatch(1);

        BackgroundTask cancellableTask = new BackgroundTask("CancelTool", "Infinite Loop", BackgroundTask.WorkloadType.BALANCED) {
            @Override
            protected void execute() throws Exception {
                startedLatch.countDown();
                while (!isCancelRequested()) {
                    checkPauseOrCancel();
                    Thread.sleep(20);
                }
            }
        };

        taskManager.submitTask(cancellableTask);
        assertTrue(startedLatch.await(3, TimeUnit.SECONDS));

        taskManager.cancelTask(cancellableTask.getId());
        Thread.sleep(150);

        assertTrue(cancellableTask.isFinished());
        assertEquals(BackgroundTask.TaskState.CANCELLED, cancellableTask.getState());
    }

    @Test
    public void testStandardizedTaskStatesAndTransitions() throws Exception {
        CountDownLatch scanLatch = new CountDownLatch(1);
        CountDownLatch processLatch = new CountDownLatch(1);
        CountDownLatch finishLatch = new CountDownLatch(1);

        BackgroundTask stateTask = new BackgroundTask("TestTool", "Multi-Phase Task", BackgroundTask.WorkloadType.BALANCED) {
            @Override
            protected void execute() throws Exception {
                setState(TaskState.SCANNING);
                scanLatch.countDown();
                Thread.sleep(50);

                setState(TaskState.PROCESSING);
                processLatch.countDown();
                Thread.sleep(50);

                finishLatch.countDown();
            }
        };

        assertEquals(BackgroundTask.TaskState.QUEUED, stateTask.getState());
        taskManager.submitTask(stateTask);

        assertTrue(scanLatch.await(3, TimeUnit.SECONDS));
        assertTrue(processLatch.await(3, TimeUnit.SECONDS));
        assertTrue(finishLatch.await(3, TimeUnit.SECONDS));

        Thread.sleep(100);
        assertEquals(BackgroundTask.TaskState.COMPLETED, stateTask.getState());
        assertTrue(stateTask.isFinished());
        assertTrue(stateTask.getDurationMs() >= 50);
    }

    @Test
    public void testTaskLookupAndMetrics() throws Exception {
        CountDownLatch latch = new CountDownLatch(1);
        BackgroundTask metricsTask = new BackgroundTask("MetricsTool", "Telemetry Check", BackgroundTask.WorkloadType.IO_BOUND) {
            @Override
            protected void execute() throws Exception {
                setTotalItems(500);
                setItemsProcessed(250);
                setThroughputMbPerSec(45.5);
                latch.countDown();
            }
        };

        taskManager.submitTask(metricsTask);
        assertTrue(latch.await(3, TimeUnit.SECONDS));

        BackgroundTask found = taskManager.getTask(metricsTask.getId());
        assertNotNull(found, "Task should be retrievable by ID from TaskManager");
        assertEquals("MetricsTool", found.getToolName());
        assertEquals(500, found.getTotalItems());
        assertEquals(250, found.getItemsProcessed());
        assertEquals(45.5, found.getThroughputMbPerSec(), 0.01);
    }
}
