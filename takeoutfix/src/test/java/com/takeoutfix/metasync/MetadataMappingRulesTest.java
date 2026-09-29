package com.takeoutfix.metasync;

import com.takeoutfix.metasync.core.MetadataMappingRules;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class MetadataMappingRulesTest {

    @Test
    void testStandardTagsAreSafeToCopy() {
        assertTrue(MetadataMappingRules.isTagSafeToCopy("DateTimeOriginal"));
        assertTrue(MetadataMappingRules.isTagSafeToCopy("Make"));
        assertTrue(MetadataMappingRules.isTagSafeToCopy("Model"));
        assertTrue(MetadataMappingRules.isTagSafeToCopy("GPSLatitude"));
        assertTrue(MetadataMappingRules.isTagSafeToCopy("GPSLongitude"));
        assertTrue(MetadataMappingRules.isTagSafeToCopy("Artist"));
        assertTrue(MetadataMappingRules.isTagSafeToCopy("Copyright"));
        assertTrue(MetadataMappingRules.isTagSafeToCopy("Title"));
        assertTrue(MetadataMappingRules.isTagSafeToCopy("Keywords"));
        assertTrue(MetadataMappingRules.isTagSafeToCopy("Rating"));
    }

    @Test
    void testProprietaryAndDevelopmentTagsAreBlocked() {
        assertFalse(MetadataMappingRules.isTagSafeToCopy("MakerNotes"));
        assertFalse(MetadataMappingRules.isTagSafeToCopy("makernotes:FocusDistance"));
        assertFalse(MetadataMappingRules.isTagSafeToCopy("crs:Exposure2012"));
        assertFalse(MetadataMappingRules.isTagSafeToCopy("crs:Temperature"));
        assertFalse(MetadataMappingRules.isTagSafeToCopy("darktable:operation"));
        assertFalse(MetadataMappingRules.isTagSafeToCopy("raw:calibration"));
        assertFalse(MetadataMappingRules.isTagSafeToCopy(null));
        assertFalse(MetadataMappingRules.isTagSafeToCopy(""));
    }

    @Test
    void testFindDefinition() {
        var def = MetadataMappingRules.findDefinition("DateTimeOriginal");
        assertTrue(def.isPresent());
        assertEquals("Capture Date & Time", def.get().label());
    }
}
