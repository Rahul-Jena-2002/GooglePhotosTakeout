package com.takeoutfix.shared.history;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.File;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("Operation History Service Unit Tests")
class OperationHistoryServiceTest {

    @Test
    void testRecordAndRetrieveOperation(@TempDir Path tempDir) {
        File testHistoryFile = tempDir.resolve("operations_history.json").toFile();
        OperationHistoryService service = new OperationHistoryService(testHistoryFile);
        Instant now = Instant.now();

        service.recordOperation(
                "Fix Google Photos",
                "SUCCESS",
                now.minusSeconds(10),
                now,
                142,
                1024 * 1024 * 50,
                "Restored 142 items from Takeout archive with zero errors."
        );

        List<OperationHistoryService.OperationRecord> records = service.loadRecords();
        assertFalse(records.isEmpty());

        OperationHistoryService.OperationRecord latest = records.get(0);
        assertEquals("Fix Google Photos", latest.operationType());
        assertEquals("SUCCESS", latest.status());
        assertEquals(142, latest.itemsProcessed());
        assertEquals(1024 * 1024 * 50, latest.bytesProcessed());
    }
}
