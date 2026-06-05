package com.rahul.service;

import org.springframework.stereotype.Service;
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
@Service
public class TimestampRestorer {

    private static final Pattern PHOTO_TAKEN_PATTERN = Pattern.compile("\"photoTakenTime\"\\s*:\\s*\\{[^}]*\"timestamp\"\\s*:\\s*\"(\\d+)\"", Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
    private static final Pattern CREATION_TIME_PATTERN = Pattern.compile("\"creationTime\"\\s*:\\s*\\{[^}]*\"timestamp\"\\s*:\\s*\"(\\d+)\"", Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
    private static final Pattern MODIFICATION_TIME_PATTERN = Pattern.compile("\"modificationTime\"\\s*:\\s*\\{[^}]*\"timestamp\"\\s*:\\s*\"(\\d+)\"", Pattern.CASE_INSENSITIVE | Pattern.DOTALL);

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
                .orElse(mediaToModify.lastModified() / 1000L);

        Instant dateTaken = Instant.ofEpochSecond(chosen);
        applyFileTimes(mediaToModify.toPath(), dateTaken);

        return dateTaken;
    }

    private Optional<Long> findEpoch(String json, Pattern pattern) {
        Matcher m = pattern.matcher(json);
        if (m.find()) {
            try {
                return Optional.of(Long.parseLong(m.group(1)));
            } catch (NumberFormatException ignored) {}
        }
        return Optional.empty();
    }

    private void applyFileTimes(Path path, Instant when) {
        FileTime ft = FileTime.from(when);

        try {
            Files.setLastModifiedTime(path, ft);
        } catch (Exception ignored) {}

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
