package com.takeoutfix.exif;

import java.io.IOException;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.List;

/**
 * Hardened export utility for EXIF metadata.
 * Implements strict CSV formula injection mitigation and robust JSON serialization.
 */
public class ExifExportService {

    public record TagEntry(String group, String tagName, String value) {}

    public static void exportCsv(List<TagEntry> entries, Path targetFile) throws IOException {
        try (PrintWriter pw = new PrintWriter(targetFile.toFile(), StandardCharsets.UTF_8)) {
            pw.println("Group,TagName,Value");
            for (TagEntry e : entries) {
                pw.printf("\"%s\",\"%s\",\"%s\"%n",
                        escapeCsv(e.group()),
                        escapeCsv(e.tagName()),
                        escapeCsv(e.value()));
            }
        }
    }

    public static void exportJson(List<TagEntry> entries, Path targetFile) throws IOException {
        try (PrintWriter pw = new PrintWriter(targetFile.toFile(), StandardCharsets.UTF_8)) {
            pw.println("[");
            for (int i = 0; i < entries.size(); i++) {
                TagEntry e = entries.get(i);
                pw.printf("  {\"group\": \"%s\", \"tagName\": \"%s\", \"value\": \"%s\"}%s%n",
                        escapeJson(e.group()),
                        escapeJson(e.tagName()),
                        escapeJson(e.value()),
                        (i < entries.size() - 1 ? "," : ""));
            }
            pw.println("]");
        }
    }

    public static String escapeCsv(String s) {
        if (s == null) return "";
        // Security: CSV formula injection mitigation (starts with =, +, -, @, or tab)
        String sanitized = s;
        if (!sanitized.isEmpty()) {
            char first = sanitized.charAt(0);
            if (first == '=' || first == '+' || first == '-' || first == '@' || first == '\t') {
                sanitized = "'" + sanitized;
            }
        }
        return sanitized.replace("\"", "\"\"");
    }

    public static String escapeJson(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\b", "\\b")
                .replace("\f", "\\f")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
    }
}
