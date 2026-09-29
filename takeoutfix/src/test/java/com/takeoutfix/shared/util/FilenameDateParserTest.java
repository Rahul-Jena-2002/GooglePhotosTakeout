package com.takeoutfix.shared.util;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

class FilenameDateParserTest {

    @Test
    @DisplayName("Should extract timestamp from standard IMG_YYYYMMDD_HHMMSS pattern")
    void testStandardImgPattern() {
        String filename = "IMG_20210715_143205.jpg";
        Optional<Instant> instant = FilenameDateParser.parse(filename);

        assertTrue(instant.isPresent(), "Expected timestamp to be parsed from filename");
        ZonedDateTime dt = instant.get().atZone(ZoneId.systemDefault());
        assertEquals(2021, dt.getYear());
        assertEquals(7, dt.getMonthValue());
        assertEquals(15, dt.getDayOfMonth());
        assertEquals(14, dt.getHour());
        assertEquals(32, dt.getMinute());
        assertEquals(5, dt.getSecond());
    }

    @Test
    @DisplayName("Should extract timestamp from Google Pixel PXL_YYYYMMDD_HHMMSS pattern")
    void testPixelPattern() {
        String filename = "PXL_20231225_081530123.jpg";
        Optional<Instant> instant = FilenameDateParser.parse(filename);

        assertTrue(instant.isPresent());
        ZonedDateTime dt = instant.get().atZone(ZoneId.systemDefault());
        assertEquals(2023, dt.getYear());
        assertEquals(12, dt.getMonthValue());
        assertEquals(25, dt.getDayOfMonth());
        assertEquals(8, dt.getHour());
        assertEquals(15, dt.getMinute());
        assertEquals(30, dt.getSecond());
    }

    @Test
    @DisplayName("Should extract timestamp from Video VID_YYYYMMDD_HHMMSS pattern")
    void testVideoPattern() {
        String filename = "VID_20200501_190000.mp4";
        Optional<Instant> instant = FilenameDateParser.parse(filename);

        assertTrue(instant.isPresent());
        ZonedDateTime dt = instant.get().atZone(ZoneId.systemDefault());
        assertEquals(2020, dt.getYear());
        assertEquals(5, dt.getMonthValue());
        assertEquals(1, dt.getDayOfMonth());
    }

    @Test
    @DisplayName("Should return empty for non-date filenames")
    void testNonDateFilename() {
        String filename = "random_vacation_photo.jpg";
        Optional<Instant> instant = FilenameDateParser.parse(filename);

        assertTrue(instant.isEmpty(), "Expected non-date filename to return empty");
    }
}
