package com.takeoutfix.restore.infrastructure;

import org.springframework.stereotype.Component;

import java.io.File;
import java.io.IOException;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributeView;
import java.nio.file.attribute.DosFileAttributeView;
import java.nio.file.attribute.FileTime;
import java.time.Instant;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Responsible for parsing metadata from JSON files and applying
 * the correct timestamps to the filesystem.
 */
@Component
public class TimestampRestorer {

    private static final Pattern PHOTO_TAKEN_PATTERN = Pattern.compile("\"photoTakenTime\"\\s*:\\s*\\{[^}]*\"timestamp\"\\s*:\\s*(?:\"(\\d+)\"|(\\d+)(?=\\s*[,}]))", Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
    private static final Pattern CREATION_TIME_PATTERN = Pattern.compile("\"creationTime\"\\s*:\\s*\\{[^}]*\"timestamp\"\\s*:\\s*(?:\"(\\d+)\"|(\\d+)(?=\\s*[,}]))", Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
    private static final Pattern MODIFICATION_TIME_PATTERN = Pattern.compile("\"modificationTime\"\\s*:\\s*\\{[^}]*\"timestamp\"\\s*:\\s*(?:\"(\\d+)\"|(\\d+)(?=\\s*[,}]))", Pattern.CASE_INSENSITIVE | Pattern.DOTALL);

    /**
     * Reads JSON, determines the best "Date Taken", and applies it to the file.
     *
     * @param mediaToModify The file to update.
     * @param json The metadata JSON file.
     * @param takeoutRef Optional takeout request date to filter out export-time timestamps.
     * @return The timestamp that was applied.
     * @throws IOException If reading the JSON fails.
     */
    public Instant restoreFromJson(File mediaToModify, File json, Optional<Instant> takeoutRef) throws IOException {
        String jsonText = Files.readString(json.toPath());
        final Instant takeoutDateStartOfDay = takeoutRef.orElse(null);

        Optional<Long> takenTs = findEpoch(jsonText, PHOTO_TAKEN_PATTERN);
        Optional<Long> creationTs = findEpoch(jsonText, CREATION_TIME_PATTERN);
        Optional<Long> modificationTs = findEpoch(jsonText, MODIFICATION_TIME_PATTERN);

        Optional<Long> creationTsFiltered = creationTs.filter(ts -> {
            if (takeoutDateStartOfDay == null) return true;
            Instant creationInstant = Instant.ofEpochSecond(ts).truncatedTo(java.time.temporal.ChronoUnit.DAYS);
            return !creationInstant.equals(takeoutDateStartOfDay);
        });

        Optional<Long> modificationTsFiltered = modificationTs.filter(ts -> {
            if (takeoutDateStartOfDay == null) return true;
            Instant modInstant = Instant.ofEpochSecond(ts).truncatedTo(java.time.temporal.ChronoUnit.DAYS);
            return !modInstant.equals(takeoutDateStartOfDay);
        });

        long chosen = takenTs
                .or(() -> creationTsFiltered)
                .or(() -> modificationTsFiltered)
                .orElseThrow(() -> new IOException("No usable timestamp in metadata: " + json));

        Instant dateTaken = Instant.ofEpochSecond(chosen);
        applyFileTimes(mediaToModify.toPath(), dateTaken);

        return dateTaken;
    }

    /**
     * Extracts the target timestamp from the JSON without modifying any file.
     */
    public Instant parseInstantFromJson(File json, Optional<Instant> takeoutRef) throws IOException {
        String jsonText = Files.readString(json.toPath());
        final Instant takeoutDateStartOfDay = takeoutRef.orElse(null);

        Optional<Long> takenTs = findEpoch(jsonText, PHOTO_TAKEN_PATTERN);
        Optional<Long> creationTs = findEpoch(jsonText, CREATION_TIME_PATTERN);
        Optional<Long> modificationTs = findEpoch(jsonText, MODIFICATION_TIME_PATTERN);

        Optional<Long> creationTsFiltered = creationTs.filter(ts -> {
            if (takeoutDateStartOfDay == null) return true;
            Instant creationInstant = Instant.ofEpochSecond(ts).truncatedTo(java.time.temporal.ChronoUnit.DAYS);
            return !creationInstant.equals(takeoutDateStartOfDay);
        });

        Optional<Long> modificationTsFiltered = modificationTs.filter(ts -> {
            if (takeoutDateStartOfDay == null) return true;
            Instant modInstant = Instant.ofEpochSecond(ts).truncatedTo(java.time.temporal.ChronoUnit.DAYS);
            return !modInstant.equals(takeoutDateStartOfDay);
        });

        long chosen = takenTs
                .or(() -> creationTsFiltered)
                .or(() -> modificationTsFiltered)
                .orElseThrow(() -> new IOException("No usable timestamp in metadata: " + json));

        return Instant.ofEpochSecond(chosen);
    }

    private Optional<Long> findEpoch(String json, Pattern pattern) {
        Matcher m = pattern.matcher(json);
        if (m.find()) {
            try {
                long timestamp = Long.parseLong(m.group(1) != null ? m.group(1) : m.group(2));
                return timestamp > 0 && timestamp <= 253402300799L ? Optional.of(timestamp) : Optional.empty();
            } catch (NumberFormatException ignored) {}
        }
        return Optional.empty();
    }

    public void applyInstant(File file, Instant when) throws IOException {
        applyFileTimes(file.toPath(), when);
    }

    public Optional<Instant> parseJsonTimestamp(File json, Optional<Instant> takeoutRef) {
        try {
            String jsonText = Files.readString(json.toPath());
            final Instant takeoutDateStartOfDay = takeoutRef.orElse(null);

            Optional<Long> takenTs = findEpoch(jsonText, PHOTO_TAKEN_PATTERN);
            Optional<Long> creationTs = findEpoch(jsonText, CREATION_TIME_PATTERN);
            Optional<Long> modificationTs = findEpoch(jsonText, MODIFICATION_TIME_PATTERN);

            Optional<Long> creationTsFiltered = creationTs.filter(ts -> {
                if (takeoutDateStartOfDay == null) return true;
                Instant creationInstant = Instant.ofEpochSecond(ts).truncatedTo(java.time.temporal.ChronoUnit.DAYS);
                return !creationInstant.equals(takeoutDateStartOfDay);
            });

            Optional<Long> modificationTsFiltered = modificationTs.filter(ts -> {
                if (takeoutDateStartOfDay == null) return true;
                Instant modInstant = Instant.ofEpochSecond(ts).truncatedTo(java.time.temporal.ChronoUnit.DAYS);
                return !modInstant.equals(takeoutDateStartOfDay);
            });

            long chosen = takenTs
                    .or(() -> creationTsFiltered)
                    .or(() -> modificationTsFiltered)
                    .orElse(-1L);
            if (chosen > 0) return Optional.of(Instant.ofEpochSecond(chosen));
        } catch (Exception ignored) {}
        return Optional.empty();
    }

    private void applyFileTimes(Path path, Instant when) throws IOException {
        FileTime ft = FileTime.from(when);

        Files.setLastModifiedTime(path, ft);

        try {
            DosFileAttributeView dos = Files.getFileAttributeView(path, DosFileAttributeView.class);
            if (dos != null) {
                dos.setTimes(ft, ft, ft);
                return;
            }
        } catch (Exception ignored) {}

        try {
            BasicFileAttributeView basic = Files.getFileAttributeView(path, BasicFileAttributeView.class);
            if (basic != null) basic.setTimes(ft, ft, ft);
        } catch (Exception ignored) {}
    }
}
