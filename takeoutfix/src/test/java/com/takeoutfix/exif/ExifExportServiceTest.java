package com.takeoutfix.exif;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("EXIF Export Service Tests")
class ExifExportServiceTest {

    @Test
    @DisplayName("Should mitigate formula injection and escape quotes in CSV export")
    void testCsvInjectionMitigation(@TempDir Path tempDir) throws IOException {
        Path csvFile = tempDir.resolve("test_export.csv");

        List<ExifExportService.TagEntry> entries = List.of(
                new ExifExportService.TagEntry("EXIF", "Model", "Sony A7 IV"),
                new ExifExportService.TagEntry("IPTC", "Description", "=cmd|' /C calc'!A0"),
                new ExifExportService.TagEntry("EXIF", "UserComment", "Photo with \"quoted\" text")
        );

        ExifExportService.exportCsv(entries, csvFile);
        String content = Files.readString(csvFile);

        assertTrue(content.contains("Group,TagName,Value"));
        assertTrue(content.contains("\"Sony A7 IV\""));
        // Formula injection neutralized with prepended quote
        assertTrue(content.contains("\"'=cmd|' /C calc'!A0\""));
        // Quotes doubled
        assertTrue(content.contains("\"Photo with \"\"quoted\"\" text\""));
    }

    @Test
    @DisplayName("Should escape JSON characters properly")
    void testJsonExportEscaping(@TempDir Path tempDir) throws IOException {
        Path jsonFile = tempDir.resolve("test_export.json");

        List<ExifExportService.TagEntry> entries = List.of(
                new ExifExportService.TagEntry("EXIF", "Lens", "FE 24-70mm F2.8 GM\nSecond Line"),
                new ExifExportService.TagEntry("EXIF", "Make", "Sony")
        );

        ExifExportService.exportJson(entries, jsonFile);
        String content = Files.readString(jsonFile);

        assertTrue(content.contains("\"group\": \"EXIF\""));
        assertTrue(content.contains("\"value\": \"FE 24-70mm F2.8 GM\\nSecond Line\""));
    }
}
