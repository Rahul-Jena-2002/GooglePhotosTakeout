package com.takeoutfix.restore;

import com.takeoutfix.restore.infrastructure.MediaScanner;
import com.takeoutfix.restore.infrastructure.MetadataMatcher;
import com.takeoutfix.task.BackgroundTask;

import java.io.File;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * BackgroundTask for non-destructive pre-flight Takeout library scan and sidecar matching.
 */
public class TakeoutScanTask extends BackgroundTask {

    public interface ScanListener {
        void onProgress(int current, int total, int matched, int unmatched, File currentFile);
        void onComplete(int total, int matched, int unmatched);
        void onError(Throwable t);
    }

    private final File source;
    private final ScanListener scanListener;

    public TakeoutScanTask(File source, ScanListener scanListener) {
        super("Takeout Restore", "Scan: " + source.getName(), WorkloadType.IO_BOUND);
        this.source = source;
        this.scanListener = scanListener;
    }

    @Override
    protected void execute() throws Exception {
        setState(TaskState.SCANNING);
        setStatusMessage("Discovering media files in " + source.getName() + "...");

        try {
            MediaScanner scanner = new MediaScanner();
            MetadataMatcher matcher = new MetadataMatcher();
            Map<String, File[]> dirCache = new HashMap<>();

            List<File> media = scanner.listMediaFiles(source);
            int total = media.size();
            setTotalItems(total);

            int matched = 0;
            int unmatched = 0;

            for (int i = 0; i < total; i++) {
                checkPauseOrCancel();

                File f = media.get(i);
                Optional<File> json = matcher.findMatchingJson(f, dirCache);
                if (json.isPresent()) {
                    matched++;
                } else {
                    unmatched++;
                }

                int currentIdx = i + 1;
                setItemsProcessed(currentIdx);
                setProgress(total > 0 ? (double) currentIdx / total : 0.0);
                setStatusMessage("Scanning: " + f.getName());

                if (scanListener != null && (i % 25 == 0 || i == total - 1)) {
                    scanListener.onProgress(currentIdx, total, matched, unmatched, f);
                }
            }

            if (scanListener != null) {
                scanListener.onComplete(total, matched, unmatched);
            }
            setStatusMessage(String.format("Scan finished: %,d files evaluated, %,d sidecars matched.", total, matched));
        } catch (InterruptedException e) {
            setState(TaskState.CANCELLED);
            throw e;
        } catch (Throwable t) {
            if (scanListener != null) {
                scanListener.onError(t);
            }
            throw t;
        }
    }
}
