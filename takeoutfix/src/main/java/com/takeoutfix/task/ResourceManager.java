package com.takeoutfix.task;

import java.lang.management.ManagementFactory;
import java.lang.management.OperatingSystemMXBean;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Centrally manages CPU and memory allocation for background operations.
 * Periodically samples system load and dynamically scales thread pools according to the configured
 * ProcessingMode (Balanced by default, Performance, Background, or Custom).
 *
 * Safe engineering policy: Bounded concurrency ensures TakeoutFix never starves the user's host OS,
 * keeping the system responsive during high-volume photo library scans.
 */
public class ResourceManager {

    public enum ProcessingMode {
        BALANCED,      // Adapt resource usage dynamically based on system load (Default)
        PERFORMANCE,   // Use more available CPU resources to complete tasks faster
        BACKGROUND,    // Minimum resource footprint to keep the computer quiet & responsive
        CUSTOM         // User-specified maximum worker threads
    }

    private ProcessingMode mode = ProcessingMode.BALANCED;
    private int customMaxWorkers = 4;

    private final int availableCores;
    private final ThreadPoolExecutor cpuExecutor;
    private final ThreadPoolExecutor ioExecutor;
    private final ScheduledExecutorService monitorScheduler;

    private double currentCpuLoad = 0.0;
    private double currentProcessCpuLoad = 0.0;

    public ResourceManager() {
        this.availableCores = Math.max(2, Runtime.getRuntime().availableProcessors());

        // Worker pools with daemon threads so JVM exits cleanly
        AtomicInteger cpuCount = new AtomicInteger(1);
        int initialCore = calculateInitialWorkerCount();
        this.cpuExecutor = new ThreadPoolExecutor(
                initialCore,
                Math.max(initialCore, availableCores),
                60L, TimeUnit.SECONDS,
                new LinkedBlockingQueue<>(500),
                r -> {
                    Thread t = new Thread(r, "TakeoutFix-CPUWorker-" + cpuCount.getAndIncrement());
                    t.setDaemon(true);
                    return t;
                },
                new ThreadPoolExecutor.CallerRunsPolicy()
        );

        AtomicInteger ioCount = new AtomicInteger(1);
        this.ioExecutor = new ThreadPoolExecutor(
                Math.min(8, availableCores),
                Math.max(8, availableCores * 2),
                60L, TimeUnit.SECONDS,
                new LinkedBlockingQueue<>(1000),
                r -> {
                    Thread t = new Thread(r, "TakeoutFix-IOWorker-" + ioCount.getAndIncrement());
                    t.setDaemon(true);
                    return t;
                },
                new ThreadPoolExecutor.CallerRunsPolicy()
        );

        this.monitorScheduler = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "TakeoutFix-ResourceTelemetry");
            t.setDaemon(true);
            return t;
        });

        // Sample load every 2.5 seconds
        this.monitorScheduler.scheduleAtFixedRate(this::sampleAndAdjust, 1, 3, TimeUnit.SECONDS);
    }

    private int calculateInitialWorkerCount() {
        return switch (mode) {
            case PERFORMANCE -> Math.max(4, availableCores - 2);
            case BACKGROUND -> Math.max(1, 2);
            case CUSTOM -> Math.max(1, customMaxWorkers);
            case BALANCED -> Math.max(2, Math.min(8, availableCores / 2));
        };
    }

    private void sampleAndAdjust() {
        try {
            OperatingSystemMXBean osBean = ManagementFactory.getOperatingSystemMXBean();
            if (osBean instanceof com.sun.management.OperatingSystemMXBean sunBean) {
                double sysLoad = sunBean.getCpuLoad();
                double procLoad = sunBean.getProcessCpuLoad();
                if (sysLoad >= 0) currentCpuLoad = sysLoad * 100.0;
                if (procLoad >= 0) currentProcessCpuLoad = procLoad * 100.0;
            } else {
                double loadAvg = osBean.getSystemLoadAverage();
                if (loadAvg >= 0) {
                    currentCpuLoad = Math.min(100.0, (loadAvg / availableCores) * 100.0);
                }
            }

            // Adapt worker count in BALANCED mode based on real-time load
            if (mode == ProcessingMode.BALANCED) {
                int targetWorkers;
                if (currentCpuLoad > 80.0) {
                    targetWorkers = Math.max(1, 2); // Heavy load -> throttle back
                } else if (currentCpuLoad > 50.0) {
                    targetWorkers = Math.max(2, availableCores / 4); // Moderate load
                } else {
                    targetWorkers = Math.max(4, Math.min(10, (int) (availableCores * 0.6))); // Low load -> scale up
                }

                if (targetWorkers != cpuExecutor.getCorePoolSize()) {
                    safelyResizeCpuPool(targetWorkers, Math.max(targetWorkers, availableCores));
                }
            }
        } catch (Throwable ignored) {}
    }

    private void safelyResizeCpuPool(int targetCore, int targetMax) {
        int currentMax = cpuExecutor.getMaximumPoolSize();
        if (targetMax > currentMax) {
            cpuExecutor.setMaximumPoolSize(targetMax);
            cpuExecutor.setCorePoolSize(targetCore);
        } else {
            cpuExecutor.setCorePoolSize(targetCore);
            cpuExecutor.setMaximumPoolSize(targetMax);
        }
    }

    public synchronized void setProcessingMode(ProcessingMode newMode) {
        this.mode = newMode;
        int target = calculateInitialWorkerCount();
        safelyResizeCpuPool(target, Math.max(target, availableCores));
    }

    public synchronized void setCustomMaxWorkers(int workers) {
        this.customMaxWorkers = Math.max(1, Math.min(64, workers));
        if (mode == ProcessingMode.CUSTOM) {
            setProcessingMode(ProcessingMode.CUSTOM);
        }
    }

    public ProcessingMode getProcessingMode() { return mode; }
    public int getCustomMaxWorkers() { return customMaxWorkers; }
    public int getAvailableCores() { return availableCores; }
    public int getActiveCpuWorkers() { return cpuExecutor.getActiveCount(); }
    public int getActiveIoWorkers() { return ioExecutor.getActiveCount(); }

    public double getSystemCpuPercent() { return currentCpuLoad; }
    public double getProcessCpuPercent() { return currentProcessCpuLoad; }

    /**
     * Genuine operating system Process Working Set RAM (matches Windows Task Manager "Memory").
     */
    public long getAppProcessMemoryMb() {
        return com.takeoutfix.network.SystemHardwareInfo.getProcessWorkingSetMB();
    }

    /**
     * Java managed heap memory currently holding live objects.
     */
    public long getJvmMemoryUsedMb() {
        Runtime rt = Runtime.getRuntime();
        return (rt.totalMemory() - rt.freeMemory()) / (1024 * 1024);
    }

    /**
     * Total Java heap memory committed by the JVM from the OS.
     */
    public long getJvmMemoryCommittedMb() {
        return Runtime.getRuntime().totalMemory() / (1024 * 1024);
    }

    public long getJvmMemoryMaxMb() {
        return Runtime.getRuntime().maxMemory() / (1024 * 1024);
    }

    public ThreadPoolExecutor getCpuExecutor() { return cpuExecutor; }
    public ThreadPoolExecutor getIoExecutor() { return ioExecutor; }

    public void shutdown() {
        monitorScheduler.shutdownNow();
        cpuExecutor.shutdownNow();
        ioExecutor.shutdownNow();
    }
}
