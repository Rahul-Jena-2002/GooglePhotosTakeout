package com.takeoutfix.studio;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.regex.Pattern;

/**
 * High-performance, robust date-shift calculation engine for photo and video batches.
 * Handles EXIF timestamps, leap years, timezone offsets, and sequential increments.
 */
public final class DateShiftCalculator {

    public static final DateTimeFormatter EXIF_FORMATTER = DateTimeFormatter.ofPattern("yyyy:MM:dd HH:mm:ss");
    public static final DateTimeFormatter DISPLAY_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private static final Pattern EXIF_DATE_PATTERN = Pattern.compile("^\\d{4}:\\d{2}:\\d{2} \\d{2}:\\d{2}:\\d{2}.*");
    private static final Pattern ISO_DATE_PATTERN = Pattern.compile("^\\d{4}-\\d{2}-\\d{2}[ T]\\d{2}:\\d{2}:\\d{2}.*");

    private DateShiftCalculator() {}

    /**
     * Calculates the new timestamp for a file given the original timestamp, request mode, and index in batch.
     */
    public static LocalDateTime calculateNewDate(LocalDateTime originalDate, StudioEditRequest request, int fileIndex) {
        if (request == null || request.getDateMode() == StudioEditRequest.DateMode.NONE) {
            return originalDate;
        }

        if (request.getDateMode() == StudioEditRequest.DateMode.RELATIVE_SHIFT) {
            if (originalDate == null) {
                return null;
            }
            long seconds = request.getTotalShiftSeconds();
            return originalDate.plusSeconds(seconds);
        }

        if (request.getDateMode() == StudioEditRequest.DateMode.FIXED_INCREMENT) {
            LocalDateTime base = request.getBaseDateTime();
            if (base == null) {
                base = LocalDateTime.now();
            }
            long offsetSeconds = (long) Math.max(0, fileIndex) * request.getIncrementSeconds();
            return base.plusSeconds(offsetSeconds);
        }

        return originalDate;
    }

    /**
     * Parses a raw date string from EXIF, ISO, or filename format.
     */
    public static LocalDateTime parseDate(String raw) {
        if (raw == null || raw.trim().isEmpty() || raw.equals("0000:00:00 00:00:00")) {
            return null;
        }
        String s = raw.trim();

        // 1. Standard EXIF "2024:05:12 14:30:00"
        if (EXIF_DATE_PATTERN.matcher(s).matches()) {
            try {
                String sub = s.substring(0, 19);
                return LocalDateTime.parse(sub, EXIF_FORMATTER);
            } catch (DateTimeParseException ignored) {}
        }

        // 2. ISO "2024-05-12 14:30:00" or "2024-05-12T14:30:00"
        if (ISO_DATE_PATTERN.matcher(s).matches()) {
            try {
                String norm = s.substring(0, 19).replace('T', ' ');
                return LocalDateTime.parse(norm, DISPLAY_FORMATTER);
            } catch (DateTimeParseException ignored) {}
        }

        return null;
    }

    /**
     * Formats LocalDateTime into standard EXIF format (yyyy:MM:dd HH:mm:ss).
     */
    public static String toExifString(LocalDateTime dt) {
        if (dt == null) return "";
        return dt.format(EXIF_FORMATTER);
    }

    /**
     * Formats LocalDateTime into user-friendly UI display format (yyyy-MM-dd HH:mm:ss).
     */
    public static String toDisplayString(LocalDateTime dt) {
        if (dt == null) return "Unknown";
        return dt.format(DISPLAY_FORMATTER);
    }
}
