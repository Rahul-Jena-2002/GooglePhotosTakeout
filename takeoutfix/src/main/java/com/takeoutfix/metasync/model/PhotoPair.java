package com.takeoutfix.metasync.model;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

/**
 * Represents a pair of related photograph files (e.g., RAW original and JPEG export)
 * for metadata comparison and synchronization.
 */
public class PhotoPair {

    private final String baseName;
    private final File sourceFile;
    private final File destFile;
    private final File xmpSidecar;
    private final List<TagDifference> differences = new ArrayList<>();
    private boolean analyzed = false;

    public PhotoPair(String baseName, File sourceFile, File destFile, File xmpSidecar) {
        this.baseName = baseName;
        this.sourceFile = sourceFile;
        this.destFile = destFile;
        this.xmpSidecar = xmpSidecar;
    }

    public PhotoPair(String baseName, File sourceFile, File destFile) {
        this(baseName, sourceFile, destFile, null);
    }

    public String getBaseName() {
        return baseName;
    }

    public File getSourceFile() {
        return sourceFile;
    }

    public File getDestFile() {
        return destFile;
    }

    public File getXmpSidecar() {
        return xmpSidecar;
    }

    public boolean isPaired() {
        return sourceFile != null && destFile != null;
    }

    public List<TagDifference> getDifferences() {
        return differences;
    }

    public void setDifferences(List<TagDifference> diffs) {
        this.differences.clear();
        if (diffs != null) {
            this.differences.addAll(diffs);
        }
        this.analyzed = true;
    }

    public boolean isAnalyzed() {
        return analyzed;
    }

    public long getDifferencesCount() {
        return differences.stream()
                .filter(d -> d.getStatus() == DiffStatus.DIFFERENT || d.getStatus() == DiffStatus.SOURCE_ONLY)
                .count();
    }

    @Override
    public String toString() {
        return String.format("PhotoPair[%s: %s <-> %s]",
                baseName,
                sourceFile != null ? sourceFile.getName() : "(none)",
                destFile != null ? destFile.getName() : "(none)");
    }
}
