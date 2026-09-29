package com.photovault.model;

/**
 * Performance telemetry and resource indicators measured during a verification run.
 */
public record VerificationMetrics(
        long totalFilesScanned,
        long totalBytesScanned,
        long elapsedMillis,
        double throughputMegabytesPerSec,
        int activeWorkers
) {
    public static VerificationMetrics zero() {
        return new VerificationMetrics(0, 0, 0, 0.0, 0);
    }

    public static VerificationMetrics compute(long totalFiles, long totalBytes, long elapsedMillis, int workers) {
        double seconds = Math.max(0.001, elapsedMillis / 1000.0);
        double mb = totalBytes / (1024.0 * 1024.0);
        double mbPerSec = mb / seconds;
        return new VerificationMetrics(totalFiles, totalBytes, elapsedMillis, mbPerSec, workers);
    }
}
