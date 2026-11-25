package com.takeoutfix.auth;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Files;
import java.nio.file.Path;
import static org.junit.jupiter.api.Assertions.*;

class UsageAccumulatorTest {
    @TempDir Path root;

    @Test void checkpointsAccountOwnedCountsWithoutRecounting() throws Exception {
        var journal = new UsageJournal(root.resolve("journal"));
        var accumulator = new UsageAccumulator(journal);
        accumulator.add("a", 1, 100);
        accumulator.add("a", 2, 200);
        accumulator.add("b", 1, 50);
        accumulator.checkpoint();
        accumulator.checkpoint();
        assertEquals(1, journal.pendingFor("a").size());
        assertEquals(3, journal.pendingFor("a").get(0).files());
        assertEquals(300, journal.pendingFor("a").get(0).bytes());
        assertEquals(1, journal.pendingFor("b").get(0).files());
    }

    @Test void failedCheckpointKeepsCountsForRetry() throws Exception {
        Path blocked = root.resolve("blocked");
        Files.writeString(blocked, "not a directory");
        var journal = new UsageJournal(blocked);
        var accumulator = new UsageAccumulator(journal);
        accumulator.add("a", 1, 100);
        assertThrows(java.io.IOException.class, accumulator::checkpoint);
        Files.delete(blocked);
        accumulator.checkpoint();
        assertEquals(100, journal.pendingFor("a").get(0).bytes());
    }
}
