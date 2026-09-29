package com.takeoutfix.studio;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("DateShiftCalculator Unit Tests")
class DateShiftCalculatorTest {

    @Test
    @DisplayName("Should correctly apply positive relative shift across day boundary")
    void testRelativeShiftPositive() {
        LocalDateTime original = LocalDateTime.of(2024, 5, 31, 23, 30, 0);
        StudioEditRequest req = new StudioEditRequest();
        req.setDateMode(StudioEditRequest.DateMode.RELATIVE_SHIFT);
        req.setShiftHours(1); // 23:30 + 1h = next day 00:30 (June 1)

        LocalDateTime result = DateShiftCalculator.calculateNewDate(original, req, 0);
        assertNotNull(result);
        assertEquals(LocalDateTime.of(2024, 6, 1, 0, 30, 0), result);
    }

    @Test
    @DisplayName("Should correctly apply negative relative shift across leap year boundary")
    void testRelativeShiftLeapYear() {
        LocalDateTime original = LocalDateTime.of(2024, 3, 1, 2, 0, 0); // 2024 is leap year
        StudioEditRequest req = new StudioEditRequest();
        req.setDateMode(StudioEditRequest.DateMode.RELATIVE_SHIFT);
        req.setShiftHours(-3); // Subtract 3 hours -> Feb 29, 2024 23:00

        LocalDateTime result = DateShiftCalculator.calculateNewDate(original, req, 0);
        assertNotNull(result);
        assertEquals(LocalDateTime.of(2024, 2, 29, 23, 0, 0), result);
    }

    @Test
    @DisplayName("Should calculate sequential increment for scanned album batches")
    void testFixedIncrement() {
        LocalDateTime base = LocalDateTime.of(1998, 7, 15, 10, 0, 0);
        StudioEditRequest req = new StudioEditRequest();
        req.setDateMode(StudioEditRequest.DateMode.FIXED_INCREMENT);
        req.setBaseDateTime(base);
        req.setIncrementSeconds(120); // 2 minutes per photo

        LocalDateTime file0 = DateShiftCalculator.calculateNewDate(null, req, 0);
        LocalDateTime file1 = DateShiftCalculator.calculateNewDate(null, req, 1);
        LocalDateTime file5 = DateShiftCalculator.calculateNewDate(null, req, 5);

        assertEquals(LocalDateTime.of(1998, 7, 15, 10, 0, 0), file0);
        assertEquals(LocalDateTime.of(1998, 7, 15, 10, 2, 0), file1);
        assertEquals(LocalDateTime.of(1998, 7, 15, 10, 10, 0), file5);
    }

    @Test
    @DisplayName("Should parse standard EXIF timestamp format")
    void testParseExif() {
        String exif = "2023:11:04 18:45:12";
        LocalDateTime parsed = DateShiftCalculator.parseDate(exif);
        assertNotNull(parsed);
        assertEquals(LocalDateTime.of(2023, 11, 4, 18, 45, 12), parsed);
        assertEquals("2023:11:04 18:45:12", DateShiftCalculator.toExifString(parsed));
    }

    @Test
    @DisplayName("Should parse ISO timestamp format")
    void testParseIso() {
        String iso = "2023-11-04 18:45:12";
        LocalDateTime parsed = DateShiftCalculator.parseDate(iso);
        assertNotNull(parsed);
        assertEquals(LocalDateTime.of(2023, 11, 4, 18, 45, 12), parsed);
    }
}
