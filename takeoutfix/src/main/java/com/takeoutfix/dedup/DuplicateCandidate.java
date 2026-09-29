package com.takeoutfix.dedup;

import java.io.File;

/**
 * Represents a duplicate candidate file with calculated similarity metrics and match explanation.
 */
public class DuplicateCandidate {
    private final File file;
    private final double similarityPercentage;
    private final DuplicateConfidence confidence;
    private final String matchReason;

    public DuplicateCandidate(File file, double similarityPercentage, DuplicateConfidence confidence, String matchReason) {
        this.file = file;
        this.similarityPercentage = similarityPercentage;
        this.confidence = confidence;
        this.matchReason = matchReason;
    }

    public File getFile() {
        return file;
    }

    public double getSimilarityPercentage() {
        return similarityPercentage;
    }

    public DuplicateConfidence getConfidence() {
        return confidence;
    }

    public String getMatchReason() {
        return matchReason;
    }
}
