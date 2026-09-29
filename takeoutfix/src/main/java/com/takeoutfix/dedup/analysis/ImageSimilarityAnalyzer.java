package com.takeoutfix.dedup.analysis;

import java.io.File;

/**
 * Common contract for comparing visual or cryptographic similarity between media files.
 */
public interface ImageSimilarityAnalyzer {

    /**
     * Checks if the given file is supported by this analyzer.
     */
    boolean isSupported(File file);

    /**
     * Calculates similarity score from 0.0 (completely distinct) to 100.0 (identical).
     */
    double calculateSimilarity(File file1, File file2);

    /**
     * Returns human-readable name of the algorithm.
     */
    String getAlgorithmName();
}
