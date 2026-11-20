package com.takeoutfix.restore.infrastructure;

import com.takeoutfix.shared.util.FilenameDateParser;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.HashMap;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ExtractionTimestampTest {
    @Test
    void knownTimestampUsesSidecarBeforeFilename(@TempDir Path directory) throws Exception {
        Path media = Files.createFile(directory.resolve("IMG_20210715_143205.jpg"));
        Files.writeString(directory.resolve("IMG_20210715_143205.jpg.json"),
                "{\"photoTakenTime\":{\"timestamp\":\"1600000000\"}}");
        ExtractionService service = new ExtractionService(new MediaScanner(), new MetadataMatcher(),
                new TimestampRestorer(), null, null, null);

        assertEquals(Instant.ofEpochSecond(1600000000L),
                service.getKnownTimestamp(media.toFile(), new HashMap<>(), Optional.empty()));
    }

    @Test
    void knownTimestampFindsFilenameDateWithoutPriorProcessing(@TempDir Path directory) throws Exception {
        Path media = Files.createFile(directory.resolve("IMG_20210715_143205.jpg"));
        ExtractionService service = new ExtractionService(new MediaScanner(), new MetadataMatcher(),
                new TimestampRestorer(), null, null, null);

        assertEquals(FilenameDateParser.parse(media.getFileName().toString()).orElseThrow(),
                service.getKnownTimestamp(media.toFile(), new HashMap<>(), Optional.empty()));
    }
}
