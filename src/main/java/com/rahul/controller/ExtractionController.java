package com.rahul.controller;

import com.rahul.service.ExtractionService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.zip.ZipInputStream;
import java.io.FileInputStream;

@RestController
@RequestMapping("/api/extraction")
@CrossOrigin(originPatterns = {"http://localhost:*", "https://takeoutfix.com", "https://*.pages.dev"})
public class ExtractionController {

    @Autowired
    private ExtractionService extractionService;

    @PostMapping("/start")
    public ResponseEntity<?> start(@RequestBody Map<String, String> params) {
        try {
            String inputPath = params.get("inputPath");
            String outputPath = params.get("outputPath");
            String postActionStr = params.getOrDefault("postAction", "KEEP_AWAKE_ONLY");
            String dateStr = params.get("takeoutDate");
            boolean outputZip = Boolean.parseBoolean(params.getOrDefault("outputZip", "false"));

            if (inputPath == null || inputPath.trim().isEmpty() || outputPath == null || outputPath.trim().isEmpty()) {
                throw new IllegalArgumentException("Both input and output folder paths are required.");
            }

            File input = new File(inputPath);
            if (!input.exists()) {
                throw new IllegalArgumentException("The input path does not exist.");
            }

            boolean isTemp = false;
            if (input.isFile() && input.getName().toLowerCase().endsWith(".zip")) {
                Path tempDir = Files.createTempDirectory("zip_extraction");
                try (ZipInputStream zis = new ZipInputStream(new FileInputStream(input))) {
                    java.util.zip.ZipEntry entry;
                    while ((entry = zis.getNextEntry()) != null) {
                        Path newPath = tempDir.resolve(entry.getName()).normalize();
                        if (!newPath.startsWith(tempDir)) {
                            throw new SecurityException("Bad zip entry: " + entry.getName());
                        }
                        if (entry.isDirectory()) Files.createDirectories(newPath);
                        else {
                            Files.createDirectories(newPath.getParent());
                            Files.copy(zis, newPath);
                        }
                    }
                }
                inputPath = tempDir.toAbsolutePath().toString();
                isTemp = true;
            } else if (!input.isDirectory()) {
                throw new IllegalArgumentException("The input path is not a directory or a ZIP file.");
            }
            
            File output = new File(outputPath);
            if (!output.exists()) {
                output.mkdirs();
            }

            Optional<Instant> takeoutDate = Optional.empty();
            if (dateStr != null && !dateStr.trim().isEmpty()) {
                try {
                    // Try parsing HTML5 datetime-local (e.g. 2023-10-01T12:30)
                    takeoutDate = Optional.of(java.time.LocalDateTime.parse(dateStr).atZone(java.time.ZoneId.systemDefault()).toInstant());
                } catch (Exception e) {
                    try {
                        takeoutDate = Optional.of(Instant.parse(dateStr));
                    } catch (Exception ex) {
                        throw new IllegalArgumentException("Invalid date format. Please use the date picker.");
                    }
                }
            }

            int limitFiles = Integer.parseInt(params.getOrDefault("limitFiles", "250"));
            int offsetFiles = Integer.parseInt(params.getOrDefault("offsetFiles", "0"));
            boolean interpolateMissing = Boolean.parseBoolean(params.getOrDefault("interpolateMissing", "false"));

            extractionService.startExtraction(
                    inputPath,
                    outputPath,
                    com.rahul.service.PowerManager.PostAction.valueOf(postActionStr),
                    takeoutDate,
                    isTemp,
                    outputZip,
                    limitFiles,
                    offsetFiles,
                    interpolateMissing
            );

            return ResponseEntity.ok(Map.of("status", "started"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("message", e.getMessage() != null ? e.getMessage() : "Unknown server error."));
        }
    }

    @PostMapping("/pause")
    public ResponseEntity<?> pause() {
        extractionService.togglePause();
        return ResponseEntity.ok(Map.of("paused", extractionService.isPaused()));
    }

    @PostMapping("/cancel")
    public ResponseEntity<?> cancel() {
        extractionService.cancel();
        return ResponseEntity.ok(Map.of("status", "cancelled"));
    }
}
