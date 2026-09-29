package com.photovault.core;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.File;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class HistoryManagerTest {

    @TempDir
    Path tempDir;

    private File tempHistoryFile;

    @BeforeEach
    void setUp() {
        tempHistoryFile = tempDir.resolve("test_history.tsv").toFile();
        HistoryManager.setStorageFileForTesting(tempHistoryFile);
    }

    @AfterEach
    void tearDown() {
        HistoryManager.clear();
    }

    @Test
    void testRecordAndLoad() {
        HistoryManager.record("/source/photos", "/backup/photos", 100, 100, 0, "VERIFIED");
        HistoryManager.record("/source/2024", "/backup/2024", 50, 48, 2, "ISSUES_DETECTED");

        List<HistoryManager.HistoryEntry> list = HistoryManager.load();
        assertEquals(2, list.size());

        // Most recent first
        assertEquals("/source/2024", list.get(0).originalPath());
        assertEquals("/backup/2024", list.get(0).backupPath());
        assertEquals(50, list.get(0).totalFiles());
        assertEquals(48, list.get(0).matchedFiles());
        assertEquals(2, list.get(0).issueCount());
        assertEquals("ISSUES_DETECTED", list.get(0).status());

        assertEquals("/source/photos", list.get(1).originalPath());
        assertEquals(0, list.get(1).issueCount());
    }

    @Test
    void testClear() {
        HistoryManager.record("/a", "/b", 10, 10, 0, "VERIFIED");
        assertFalse(HistoryManager.load().isEmpty());

        HistoryManager.clear();
        assertTrue(HistoryManager.load().isEmpty());
    }
}
