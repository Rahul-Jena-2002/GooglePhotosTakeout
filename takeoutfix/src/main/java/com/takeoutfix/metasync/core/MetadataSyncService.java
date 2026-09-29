package com.takeoutfix.metasync.core;

import com.takeoutfix.metasync.model.PhotoPair;
import com.takeoutfix.metasync.model.TagDifference;
import com.takeoutfix.restore.infrastructure.NativeExifToolEngine;

import java.io.File;
import java.util.*;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * High-level orchestration service for MetaSync.
 * Coordinates batch pair discovery, parallel diff inspection, and safe writing.
 */
public class MetadataSyncService {

    private final FilePairingService pairingService;
    private final MetadataReader reader;
    private final MetadataComparator comparator;
    private final WriteSafetyService safetyService;
    private final MetadataWriter writer;

    public interface SyncListener {
        void onScanProgress(int current, int total, String message);
        void onPairAnalyzed(PhotoPair pair, int index, int total);
        void onSyncProgress(int current, int total, String filename);
        void onSyncComplete(int successCount, int errorCount);
    }

    private final List<SyncListener> listeners = new CopyOnWriteArrayList<>();

    public MetadataSyncService(NativeExifToolEngine engine) {
        this.pairingService = new FilePairingService();
        this.reader = new MetadataReader(engine);
        this.comparator = new MetadataComparator();
        this.safetyService = new WriteSafetyService(reader);
        this.writer = new MetadataWriter(engine, safetyService);
    }

    public void addListener(SyncListener listener) {
        if (listener != null) listeners.add(listener);
    }

    public void removeListener(SyncListener listener) {
        listeners.remove(listener);
    }

    /**
     * Scans and pairs files from RAW and Export folders.
     */
    public List<PhotoPair> discoverPairs(File rawFolder, File exportFolder) {
        return pairingService.pairFolders(rawFolder, exportFolder);
    }

    /**
     * Inspects metadata and populates differences for a single PhotoPair.
     */
    public void analyzePair(PhotoPair pair) {
        if (pair == null) return;

        Map<String, String> srcTags = pair.getSourceFile() != null ? reader.readTags(pair.getSourceFile()) : Map.of();
        Map<String, String> dstTags = pair.getDestFile() != null ? reader.readTags(pair.getDestFile()) : Map.of();

        List<TagDifference> diffs = comparator.compare(srcTags, dstTags);
        pair.setDifferences(diffs);
    }

    /**
     * Synchronizes a batch of analyzed pairs.
     */
    public void executeBatchSync(List<PhotoPair> pairs, boolean inPlaceWithBackup, File safeOutputDir) {
        int success = 0;
        int errors = 0;
        int total = pairs.size();

        for (int i = 0; i < total; i++) {
            PhotoPair pair = pairs.get(i);
            final int idx = i + 1;
            notifySyncProgress(idx, total, pair.getBaseName());

            try {
                if (pair.isPaired() && pair.isAnalyzed()) {
                    File written = writer.syncPair(pair, pair.getDifferences(), inPlaceWithBackup, safeOutputDir);
                    safetyService.verifyWrittenTags(written, pair.getDifferences());
                    success++;
                }
            } catch (Exception ex) {
                System.err.println("Error synchronizing " + pair.getBaseName() + ": " + ex.getMessage());
                errors++;
            }
        }

        notifySyncComplete(success, errors);
    }

    private void notifySyncProgress(int cur, int tot, String file) {
        for (SyncListener l : listeners) {
            l.onSyncProgress(cur, tot, file);
        }
    }

    private void notifySyncComplete(int succ, int err) {
        for (SyncListener l : listeners) {
            l.onSyncComplete(succ, err);
        }
    }

    public FilePairingService getPairingService() {
        return pairingService;
    }

    public MetadataReader getReader() {
        return reader;
    }

    public MetadataComparator getComparator() {
        return comparator;
    }

    public WriteSafetyService getSafetyService() {
        return safetyService;
    }
}
