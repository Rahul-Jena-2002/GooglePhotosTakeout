package com.takeoutfix.restore;

import com.takeoutfix.network.SystemHardwareInfo;
import com.takeoutfix.restore.infrastructure.MediaScanner;
import com.takeoutfix.restore.infrastructure.MetadataMatcher;
import com.takeoutfix.task.BackgroundTask;
import com.takeoutfix.task.ResourceManager;
import com.takeoutfix.task.TaskManager;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CancellationException;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

/**
 * High-performance, multi-threaded BackgroundTask for non-destructive pre-flight Takeout
 * library scan and sidecar matching.
 *
 * Utilizes auto CPU logical processor sensing and RAM headroom detection to scale
 * parallel worker concurrency safely without freezing the JavaFX UI or overloading the host OS.
 */
public class TakeoutScanTask extends BackgroundTask {

    public interface ScanListener {
        void onProgress(int current, int total, int matched, int unmatched, File currentFile);
        void onComplete(int total, int matched, int unmatched);
        void onError(Throwable t);
    }

    private final File source;
    private final ScanListener scanListener;
    private final MediaScanner mediaScanner;
    private final MetadataMatcher metadataMatcher;
    private final ResourceManager resourceManager;

    public TakeoutScanTask(File source, ScanListener scanListener) {
        this(source, scanListener, new MediaScanner(), new MetadataMatcher(),
                TaskManager.getInstance() != null ? TaskManager.getInstance().getResourceManager() : null);
    }

    public TakeoutScanTask(File source, ScanListener scanListener,
                           MediaScanner mediaScanner, MetadataMatcher metadataMatcher,
                           ResourceManager resourceManager) {
        super("Takeout Restore", "Scan: " + source.getName(), WorkloadType.IO_BOUND);
        this.source = source;
        this.scanListener = scanListener;
        this.mediaScanner = mediaScanner != null ? mediaScanner : new MediaScanner();
        this.metadataMatcher = metadataMatcher != null ? metadataMatcher : new MetadataMatcher();
        this.resourceManager = resourceManager;
    }

    @Override
    protected void execute() throws Exception {
        setState(TaskState.SCANNING);
        setStatusMessage("Discovering media files in " + source.getName() + "...");

        try {
            MediaScanner scanner = this.mediaScanner;
            MetadataMatcher matcher = this.metadataMatcher;
            Map<String, File[]> dirCache = new ConcurrentHashMap<>();

            List<File> media = scanner.listMediaFiles(source);
            int total = media.size();
            setTotalItems(total);

            if (total == 0) {
                setStatusMessage("No media files found in " + source.getName());
                setProgress(1.0);
                if (scanListener != null) {
                    scanListener.onComplete(0, 0, 0);
                }
                return;
            }

            // Auto-detect optimal thread concurrency based on CPU logical processors & RAM headroom
            int workers = determineOptimalWorkers();
            AtomicInteger matched = new AtomicInteger(0);
            AtomicInteger unmatched = new AtomicInteger(0);
            AtomicInteger processed = new AtomicInteger(0);
            AtomicLong lastUiUpdateMs = new AtomicLong(0);

            // Bounded thread pool with lower priority to guarantee UI and OS responsiveness
            ExecutorService executor = Executors.newFixedThreadPool(workers, r -> {
                Thread t = new Thread(r, "TakeoutScanWorker-" + processed.get());
                t.setDaemon(true);
                t.setPriority(Math.max(Thread.MIN_PRIORITY, Thread.NORM_PRIORITY - 1));
                return t;
            });

            try {
                List<CompletableFuture<Void>> futures = new ArrayList<>(total);
                for (File f : media) {
                    if (isCancelled()) break;

                    CompletableFuture<Void> cf = CompletableFuture.runAsync(() -> {
                        if (isCancelled()) return;
                        while (isPaused() && !isCancelled()) {
                            try {
                                Thread.sleep(100);
                            } catch (InterruptedException e) {
                                Thread.currentThread().interrupt();
                                return;
                            }
                        }

                        // Preserves exact JSON sidecar matcher logic with thread-safe dirCache
                        Optional<File> json = matcher.findMatchingJson(f, dirCache);
                        if (json.isPresent()) {
                            matched.incrementAndGet();
                        } else {
                            unmatched.incrementAndGet();
                        }

                        int currentIdx = processed.incrementAndGet();
                        long now = System.currentTimeMillis();
                        if (scanListener != null && (currentIdx == total || currentIdx % 25 == 0 || (now - lastUiUpdateMs.get() > 60))) {
                            lastUiUpdateMs.set(now);
                            setItemsProcessed(currentIdx);
                            setProgress((double) currentIdx / total);
                            setStatusMessage("Scanning: " + f.getName());
                            scanListener.onProgress(currentIdx, total, matched.get(), unmatched.get(), f);
                        }
                    }, executor);
                    futures.add(cf);
                }

                CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();
            } finally {
                executor.shutdownNow();
            }

            if (isCancelled()) {
                setState(TaskState.CANCELLED);
                return;
            }

            setItemsProcessed(total);
            setProgress(1.0);
            if (scanListener != null) {
                scanListener.onComplete(total, matched.get(), unmatched.get());
            }
            setStatusMessage(String.format("Scan finished: %,d files evaluated, %,d sidecars matched.", total, matched.get()));
        } catch (CancellationException e) {
            setState(TaskState.CANCELLED);
        } catch (Throwable t) {
            if (isCancelled()) {
                setState(TaskState.CANCELLED);
                return;
            }
            if (scanListener != null) {
                scanListener.onError(t);
            }
            throw t;
        }
    }

    private int determineOptimalWorkers() {
        if (resourceManager != null) {
            return resourceManager.calculateOptimalWorkerCount();
        }

        // Telemetry-driven dynamic calculation based on cores and RAM headroom
        int logicalCores = SystemHardwareInfo.getLogicalProcessors();
        long freeRamBytes = SystemHardwareInfo.getFreePhysicalMemoryBytes();
        long totalRamBytes = SystemHardwareInfo.getTotalPhysicalMemoryBytes();

        double ramUsedRatio = totalRamBytes > 0
                ? (double) (totalRamBytes - freeRamBytes) / totalRamBytes
                : 0.5;

        int cpuTarget;
        if (logicalCores <= 2) {
            cpuTarget = 1;
        } else if (logicalCores <= 4) {
            cpuTarget = 3;
        } else if (logicalCores <= 8) {
            cpuTarget = logicalCores - 1;
        } else {
            cpuTarget = Math.max(4, Math.min(logicalCores - 2, (int) Math.round(logicalCores * 0.88)));
        }

        if (ramUsedRatio > 0.85) {
            cpuTarget = Math.max(2, cpuTarget / 2);
        }

        return Math.max(2, Math.min(32, cpuTarget));
    }
}
