package com.rahul.util;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * High-performance filename timestamp parser for Google Takeout photos and videos.
 * Extracts embedded date/time patterns from camera, Google Photos, WhatsApp, and screenshot filenames.
 */
public class FilenameDateParser {

    // Pattern 1: YYYY-MM-DD-HH-mm-ss-SSS or YYYY-MM-DD-HH-mm-ss (e.g. IMG_2025-06-10-18-11-04-598.jpg, original_..._IMG_2025-06-23-13-59-38-564-edited.jpg)
    private static final Pattern PATTERN_DASH_DATETIME = Pattern.compile("(\\d{4})-(\\d{2})-(\\d{2})[_-](\\d{2})[_-](\\d{2})[_-](\\d{2})");

    // Pattern 2: YYYYMMDD_HHmmss or YYYYMMDD-HHmmss (e.g. 20250504_132811.jpg, 20250921_165108.jpg, IMG_20170807_092341.jpg, Screenshot_20250426-105832_Facebook.png)
    private static final Pattern PATTERN_UNDERSCORE_DATETIME = Pattern.compile("(?:IMG_|PANO_|VID_|[A-Za-z]+_)?(\\d{4})(\\d{2})(\\d{2})[_-](\\d{2})(\\d{2})(\\d{2})");

    // Pattern 3: WhatsApp format IMG-YYYYMMDD-WAxxxx or VID-YYYYMMDD-WAxxxx
    private static final Pattern PATTERN_WHATSAPP = Pattern.compile("(?:IMG|VID)-(\\d{4})(\\d{2})(\\d{2})-WA\\d+");

    // Pattern 4: Plain date YYYYMMDD (e.g. 20250513_120000.jpg)
    private static final Pattern PATTERN_PLAIN_DATE = Pattern.compile("(?:IMG_|VID_)?(\\d{4})(\\d{2})(\\d{2})");

    public static Optional<Instant> parse(String filename) {
        if (filename == null || filename.isBlank()) {
            return Optional.empty();
        }

        // 1. Try YYYY-MM-DD-HH-mm-ss pattern first (Google Takeout / Camera edited names)
        Matcher m1 = PATTERN_DASH_DATETIME.matcher(filename);
        if (m1.find()) {
            try {
                int year = Integer.parseInt(m1.group(1));
                int month = Integer.parseInt(m1.group(2));
                int day = Integer.parseInt(m1.group(3));
                int hour = Integer.parseInt(m1.group(4));
                int minute = Integer.parseInt(m1.group(5));
                int second = Integer.parseInt(m1.group(6));

                if (isValidDate(year, month, day, hour, minute, second)) {
                    LocalDateTime ldt = LocalDateTime.of(year, month, day, hour, minute, second);
                    return Optional.of(ldt.atZone(ZoneId.systemDefault()).toInstant());
                }
            } catch (Exception ignored) {}
        }

        // 2. Try YYYYMMDD_HHmmss pattern (e.g. 20250504_132811.jpg, IMG_20170807_092341.jpg, Screenshot_20250426-105832)
        Matcher m2 = PATTERN_UNDERSCORE_DATETIME.matcher(filename);
        if (m2.find()) {
            try {
                int year = Integer.parseInt(m2.group(1));
                int month = Integer.parseInt(m2.group(2));
                int day = Integer.parseInt(m2.group(3));
                int hour = Integer.parseInt(m2.group(4));
                int minute = Integer.parseInt(m2.group(5));
                int second = Integer.parseInt(m2.group(6));

                if (isValidDate(year, month, day, hour, minute, second)) {
                    LocalDateTime ldt = LocalDateTime.of(year, month, day, hour, minute, second);
                    return Optional.of(ldt.atZone(ZoneId.systemDefault()).toInstant());
                }
            } catch (Exception ignored) {}
        }

        // 3. Try WhatsApp format (e.g. IMG-20250513-WA0004.jpg -> 2025-05-13 12:00:00)
        Matcher m3 = PATTERN_WHATSAPP.matcher(filename);
        if (m3.find()) {
            try {
                int year = Integer.parseInt(m3.group(1));
                int month = Integer.parseInt(m3.group(2));
                int day = Integer.parseInt(m3.group(3));

                if (isValidDate(year, month, day, 12, 0, 0)) {
                    LocalDateTime ldt = LocalDateTime.of(year, month, day, 12, 0, 0);
                    return Optional.of(ldt.atZone(ZoneId.systemDefault()).toInstant());
                }
            } catch (Exception ignored) {}
        }

        return Optional.empty();
    }

    private static boolean isValidDate(int year, int month, int day, int hour, int minute, int second) {
        if (year < 1970 || year > 2038) return false;
        if (month < 1 || month > 12) return false;
        if (day < 1 || day > 31) return false;
        if (hour < 0 || hour > 23) return false;
        if (minute < 0 || minute > 59) return false;
        if (second < 0 || second > 59) return false;
        return true;
    }
}
