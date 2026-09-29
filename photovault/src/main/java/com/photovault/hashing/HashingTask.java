package com.photovault.hashing;

import com.photovault.model.FileRecord;
import com.photovault.model.VerificationDiscrepancy;

import java.io.IOException;
import java.nio.file.Path;
import java.util.Objects;
import java.util.concurrent.Callable;
import java.util.function.LongConsumer;

/**
 * Callable task that hashes an original file and its corresponding backup file,
 * verifying bit-for-bit cryptographic equality and stability.
 */
public class HashingTask implements Callable<HashingTask.ComparisonOutcome> {

    public record ComparisonOutcome(
            String relativePath,
            FileRecord originalRecord,
            FileRecord backupRecord,
            VerificationDiscrepancy discrepancy
    ) {}

    private final Path originalRoot;
    private final Path backupRoot;
    private final String relativePath;
    private final long expectedSize;
    private final LongConsumer byteProgressListener;

    public HashingTask(Path originalRoot, Path backupRoot, String relativePath, long expectedSize, LongConsumer byteProgressListener) {
        this.originalRoot = Objects.requireNonNull(originalRoot, "originalRoot cannot be null");
        this.backupRoot = Objects.requireNonNull(backupRoot, "backupRoot cannot be null");
        this.relativePath = Objects.requireNonNull(relativePath, "relativePath cannot be null");
        this.expectedSize = expectedSize;
        this.byteProgressListener = byteProgressListener;
    }

    @Override
    public ComparisonOutcome call() {
        Path origFile = originalRoot.resolve(relativePath);
        Path backupFile = backupRoot.resolve(relativePath);

        Sha256StreamHasher.HashResult origHashResult;
        try {
            origHashResult = Sha256StreamHasher.hashFile(origFile, byteProgressListener);
        } catch (Exception e) {
            return new ComparisonOutcome(relativePath, null, null,
                    VerificationDiscrepancy.readError(relativePath, "Original read error: " + e.getMessage()));
        }

        if (!origHashResult.isStable()) {
            return new ComparisonOutcome(relativePath, null, null,
                    VerificationDiscrepancy.unstable(relativePath, "Original file modified while being read"));
        }

        Sha256StreamHasher.HashResult backupHashResult;
        try {
            backupHashResult = Sha256StreamHasher.hashFile(backupFile, byteProgressListener);
        } catch (Exception e) {
            return new ComparisonOutcome(relativePath, null, null,
                    VerificationDiscrepancy.readError(relativePath, "Backup read error: " + e.getMessage()));
        }

        if (!backupHashResult.isStable()) {
            return new ComparisonOutcome(relativePath, null, null,
                    VerificationDiscrepancy.unstable(relativePath, "Backup file modified while being read"));
        }

        FileRecord origRecord = new FileRecord(relativePath, origHashResult.bytesRead(),
                origFile.toFile().lastModified(), origHashResult.hashHex());
        FileRecord backupRecord = new FileRecord(relativePath, backupHashResult.bytesRead(),
                backupFile.toFile().lastModified(), backupHashResult.hashHex());

        if (!origHashResult.hashHex().equalsIgnoreCase(backupHashResult.hashHex())) {
            VerificationDiscrepancy discrepancy = VerificationDiscrepancy.hashMismatch(
                    relativePath, expectedSize, origHashResult.hashHex(), backupHashResult.hashHex());
            return new ComparisonOutcome(relativePath, origRecord, backupRecord, discrepancy);
        }

        // Bit-for-bit identical!
        return new ComparisonOutcome(relativePath, origRecord, backupRecord, null);
    }
}
