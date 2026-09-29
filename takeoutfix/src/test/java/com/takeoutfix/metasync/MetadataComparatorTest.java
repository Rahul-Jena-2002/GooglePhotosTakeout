package com.takeoutfix.metasync;

import com.takeoutfix.metasync.core.MetadataComparator;
import com.takeoutfix.metasync.model.DiffStatus;
import com.takeoutfix.metasync.model.TagDifference;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class MetadataComparatorTest {

    private MetadataComparator comparator;

    @BeforeEach
    void setUp() {
        comparator = new MetadataComparator();
    }

    @Test
    void testCompareIdenticalTagsProducesMatch() {
        Map<String, String> src = Map.of(
                "DateTimeOriginal", "2024:05:12 14:30:00",
                "Make", "Canon",
                "Model", "EOS R5"
        );
        Map<String, String> dst = Map.of(
                "DateTimeOriginal", "2024:05:12 14:30:00",
                "Make", "Canon",
                "Model", "EOS R5"
        );

        List<TagDifference> diffs = comparator.compare(src, dst);
        assertEquals(3, diffs.size());
        assertTrue(diffs.stream().allMatch(d -> d.getStatus() == DiffStatus.MATCH));
    }

    @Test
    void testCompareDifferentAndMissingTags() {
        Map<String, String> src = Map.of(
                "DateTimeOriginal", "2024:05:12 14:30:00",
                "GPSLatitude", "45.123456",
                "Rating", "5"
        );
        Map<String, String> dst = Map.of(
                "DateTimeOriginal", "2024:05:12 14:30:00",
                "Rating", "3" // Different
                // GPSLatitude is missing in destination (SOURCE_ONLY)
        );

        List<TagDifference> diffs = comparator.compare(src, dst);
        assertEquals(3, diffs.size());

        TagDifference dateDiff = diffs.stream().filter(d -> d.getTagKey().equals("DateTimeOriginal")).findFirst().orElseThrow();
        assertEquals(DiffStatus.MATCH, dateDiff.getStatus());

        TagDifference ratingDiff = diffs.stream().filter(d -> d.getTagKey().equals("Rating")).findFirst().orElseThrow();
        assertEquals(DiffStatus.DIFFERENT, ratingDiff.getStatus());

        TagDifference gpsDiff = diffs.stream().filter(d -> d.getTagKey().equals("GPSLatitude")).findFirst().orElseThrow();
        assertEquals(DiffStatus.SOURCE_ONLY, gpsDiff.getStatus());
        assertTrue(gpsDiff.isSelected(), "SOURCE_ONLY tags should be queued for synchronization by default");
    }

    @Test
    void testOmitEmptyTags() {
        Map<String, String> src = new HashMap<>();
        Map<String, String> dst = new HashMap<>();

        List<TagDifference> diffs = comparator.compare(src, dst);
        assertTrue(diffs.isEmpty(), "Tags absent in both source and destination must be omitted to prevent noise");
    }
}
