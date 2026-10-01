package com.takeoutfix.culling;

import com.takeoutfix.dedup.analysis.PerceptualHashAnalyzer;

import java.io.File;

/**
 * A single photo entry in the culling pipeline.
 * Timestamp is epoch-seconds: preferably from EXIF DateTimeOriginal, fallback to file mtime.
 * dHashPair is lazily computed by CullingScanService and may be null if the file could not be decoded.
 */
public final class PhotoEntry {

    private final File file;
    private final long timestampSecs;
    private PerceptualHashAnalyzer.LongPair dHashPair; // set after image decode

    public PhotoEntry(File file, long timestampSecs) {
        this.file = file;
        this.timestampSecs = timestampSecs;
    }

    public File getFile() { return file; }
    public long getTimestampSecs() { return timestampSecs; }

    public PerceptualHashAnalyzer.LongPair getDHashPair() { return dHashPair; }
    public void setDHashPair(PerceptualHashAnalyzer.LongPair pair) { this.dHashPair = pair; }

    @Override
    public String toString() {
        return file.getName() + " @" + timestampSecs;
    }
}
