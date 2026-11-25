package com.takeoutfix.auth;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class UsageJournalTest {
    @TempDir Path directory;

    @Test void batchesSurviveRestartAndStayWithTheirOwner() throws Exception {
        UsageJournal journal = new UsageJournal(directory);
        var first = journal.append("account-a", 3, 1200);
        var second = journal.append("account-b", 1, 500);
        UsageJournal reopened = new UsageJournal(directory);
        assertEquals(List.of(first), reopened.pendingFor("account-a"));
        assertEquals(List.of(second), reopened.pendingFor("account-b"));
        reopened.acknowledge(first);
        assertTrue(reopened.pendingFor("account-a").isEmpty());
        assertEquals(List.of(second), reopened.pendingFor("account-b"));
    }

    @Test void acknowledgementCannotDeleteADifferentBatch() throws Exception {
        UsageJournal journal = new UsageJournal(directory);
        var batch = journal.append("account-a", 2, 50);
        assertThrows(java.io.IOException.class, () -> journal.acknowledge(
                new UsageJournal.Batch(batch.id(), "account-b", 2, 50)));
        assertEquals(List.of(batch), journal.pendingFor("account-a"));
    }

    @Test void corruptBatchIsPreservedWithoutBlockingValidBatches() throws Exception {
        UsageJournal journal = new UsageJournal(directory);
        assertThrows(IllegalArgumentException.class, () -> journal.append("", 1, 1));
        assertThrows(IllegalArgumentException.class, () -> journal.append("a", -1, 1));
        Path invalid = directory.resolve("not-a-valid-batch.json");
        Files.writeString(invalid, "{}");
        var valid = journal.append("a", 2, 10);
        assertEquals(List.of(valid), journal.pendingFor("a"));
        assertTrue(Files.exists(invalid));
    }
}
