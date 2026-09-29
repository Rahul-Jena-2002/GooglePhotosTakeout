package com.photovault.core;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class ExclusionFilterTest {

    private ExclusionFilter filter;

    @BeforeEach
    void setUp() {
        filter = new ExclusionFilter();
    }

    @Test
    @DisplayName("Filter common OS metadata files case-insensitively")
    void testDefaultOsNoiseFiles() {
        assertTrue(filter.shouldExcludeName(".DS_Store"));
        assertTrue(filter.shouldExcludeName(".ds_store"));
        assertTrue(filter.shouldExcludeName("Thumbs.db"));
        assertTrue(filter.shouldExcludeName("thumbs.db"));
        assertTrue(filter.shouldExcludeName("THUMBS.DB"));
        assertTrue(filter.shouldExcludeName("desktop.ini"));
        assertTrue(filter.shouldExcludeName("Desktop.ini"));
        assertTrue(filter.shouldExcludeName(".Spotlight-V100"));
        assertTrue(filter.shouldExcludeName(".Trashes"));
    }

    @Test
    @DisplayName("Filter AppleDouble metadata files (._*)")
    void testAppleDoublePrefix() {
        assertTrue(filter.shouldExcludeName("._IMG_0001.JPG"));
        assertTrue(filter.shouldExcludeName("._DSC_4901.CR3"));
        assertTrue(filter.shouldExcludeName("._photo.png"));
    }

    @Test
    @DisplayName("Allow legitimate photos and user files")
    void testLegitimateFilesAllowed() {
        assertFalse(filter.shouldExcludeName("IMG_0001.JPG"));
        assertFalse(filter.shouldExcludeName("DSC_4901.CR3"));
        assertFalse(filter.shouldExcludeName("wedding_raw.arw"));
        assertFalse(filter.shouldExcludeName("portfolio.dng"));
        assertFalse(filter.shouldExcludeName("video.mp4"));
        assertFalse(filter.shouldExcludeName("manifest.json"));
    }

    @Test
    @DisplayName("Track excluded files and counts transparently")
    void testTrackingAndDisclosure() {
        assertTrue(filter.testAndRecord("2024/Vacation/.DS_Store"));
        assertTrue(filter.testAndRecord("2024/Vacation/Thumbs.db"));
        assertTrue(filter.testAndRecord("2024/Vacation/._IMG_1001.JPG"));
        assertFalse(filter.testAndRecord("2024/Vacation/IMG_1001.JPG"));

        assertEquals(3, filter.getExcludedCount());
        List<String> recorded = filter.getRecordedExclusions();
        assertEquals(3, recorded.size());
        assertTrue(recorded.contains("2024/Vacation/.DS_Store"));
        assertTrue(recorded.contains("2024/Vacation/Thumbs.db"));
        assertTrue(recorded.contains("2024/Vacation/._IMG_1001.JPG"));

        Map<String, Long> counts = filter.getCountsByType();
        assertEquals(1L, counts.get(".ds_store"));
        assertEquals(1L, counts.get("thumbs.db"));
        assertEquals(1L, counts.get("apple_double (._*)"));

        // Reset
        filter.reset();
        assertEquals(0, filter.getExcludedCount());
        assertTrue(filter.getRecordedExclusions().isEmpty());
    }
}
