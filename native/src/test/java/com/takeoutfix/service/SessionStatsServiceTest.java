package com.takeoutfix.service;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class SessionStatsServiceTest {

    private SessionStatsService statsService;

    @BeforeEach
    void setUp() {
        statsService = new SessionStatsService();
        statsService.reset();
    }

    @AfterEach
    void tearDown() {
        statsService.reset();
    }

    @Test
    @DisplayName("Should record file count and bytes accurately")
    void testRecordStats() {
        statsService.record(50, 1024 * 1024);
        assertEquals(50, statsService.getTotalFiles());
        assertEquals(1024 * 1024, statsService.getTotalBytes());

        statsService.record(25, 2048 * 1024);
        assertEquals(75, statsService.getTotalFiles());
        assertEquals(3072 * 1024, statsService.getTotalBytes());
    }

    @Test
    @DisplayName("Should synchronize to absolute value")
    void testSyncStats() {
        statsService.record(100, 5000);
        statsService.sync(250, 10000);

        assertEquals(250, statsService.getTotalFiles());
        assertEquals(10000, statsService.getTotalBytes());
    }

    @Test
    @DisplayName("Should reset totals to zero")
    void testResetStats() {
        statsService.record(100, 5000);
        statsService.reset();

        assertEquals(0, statsService.getTotalFiles());
        assertEquals(0, statsService.getTotalBytes());
    }
}
