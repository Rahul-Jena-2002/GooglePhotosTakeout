package com.photovault.model;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

class ModelTest {

    @Test
    @DisplayName("FileRecord creation and immutability")
    void testFileRecord() {
        FileRecord record = new FileRecord("photos/trip.jpg", 1024L, 1700000000000L);
        assertEquals("photos/trip.jpg", record.relativePath());
        assertEquals(1024L, record.sizeBytes());
        assertEquals(1700000000000L, record.lastModifiedMillis());
        assertNull(record.sha256Hex());

        FileRecord withHash = record.withSha256("abc123def456");
        assertEquals("abc123def456", withHash.sha256Hex());
        assertEquals(1024L, withHash.sizeBytes());

        assertThrows(IllegalArgumentException.class, () -> new FileRecord("invalid", -1L, 0L));
        assertThrows(NullPointerException.class, () -> new FileRecord(null, 10L, 0L));
    }

    @Test
    @DisplayName("DirectoryInventory aggregation and immutability")
    void testDirectoryInventory() {
        FileRecord r1 = new FileRecord("a.jpg", 1000L, 100L);
        FileRecord r2 = new FileRecord("b.jpg", 2500L, 200L);
        Map<String, FileRecord> map = Map.of("a.jpg", r1, "b.jpg", r2);

        DirectoryInventory inv = DirectoryInventory.of(map, List.of(".DS_Store"));
        assertEquals(2, inv.totalFiles());
        assertEquals(3500L, inv.totalBytes());
        assertEquals(1, inv.excludedFiles().size());
        assertEquals(2, inv.files().size());
    }

    @Test
    @DisplayName("VerificationMetrics throughput calculation")
    void testMetricsCalculation() {
        // 100 MB in 2000 ms = 50 MB/s
        long bytes = 100L * 1024L * 1024L;
        VerificationMetrics metrics = VerificationMetrics.compute(50, bytes, 2000, 4);

        assertEquals(50, metrics.totalFilesScanned());
        assertEquals(bytes, metrics.totalBytesScanned());
        assertEquals(2000, metrics.elapsedMillis());
        assertEquals(4, metrics.activeWorkers());
        assertEquals(50.0, metrics.throughputMegabytesPerSec(), 0.1);
    }

    @Test
    @DisplayName("VerificationResult 3-state predicates and discrepancies")
    void testVerificationResult() {
        UUID id = UUID.randomUUID();
        Instant now = Instant.now();
        Path orig = Path.of("C:/photos");
        Path backup = Path.of("D:/backup");
        DirectoryInventory inv = DirectoryInventory.empty();
        VerificationMetrics metrics = VerificationMetrics.zero();

        // 1. Verified state
        VerificationResult verified = new VerificationResult(
                id, VerificationState.VERIFIED, now, orig, backup, inv, inv,
                List.of(), List.of(), metrics, "All 0 files matched"
        );
        assertTrue(verified.isVerified());
        assertFalse(verified.hasDifferences());
        assertFalse(verified.isIncomplete());

        // 2. Differences Found
        VerificationDiscrepancy diff = VerificationDiscrepancy.missing("photo.raw", 5000000L);
        VerificationResult withDiff = new VerificationResult(
                id, VerificationState.DIFFERENCES_FOUND, now, orig, backup, inv, inv,
                List.of(diff), List.of(), metrics, "1 file missing"
        );
        assertFalse(withDiff.isVerified());
        assertTrue(withDiff.hasDifferences());
        assertEquals(1, withDiff.discrepancies().size());
        assertEquals(DiscrepancyType.MISSING_IN_BACKUP, withDiff.discrepancies().get(0).type());

        // 3. Incomplete
        VerificationDiscrepancy err = VerificationDiscrepancy.readError("locked.jpg", "Permission denied");
        VerificationResult incomplete = new VerificationResult(
                id, VerificationState.INCOMPLETE, now, orig, backup, inv, inv,
                List.of(err), List.of(), metrics, "Read error encountered"
        );
        assertTrue(incomplete.isIncomplete());
        assertFalse(incomplete.isVerified());
    }
}
