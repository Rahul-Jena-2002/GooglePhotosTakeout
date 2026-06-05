package com.rahul.controller;

import com.rahul.service.ExtractionService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.File;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/extraction")
@CrossOrigin(origins = "*")
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

            if (inputPath == null || inputPath.trim().isEmpty() || outputPath == null || outputPath.trim().isEmpty()) {
                throw new IllegalArgumentException("Both input and output folder paths are required.");
            }

            File input = new File(inputPath);
            if (!input.exists() || !input.isDirectory()) {
                throw new IllegalArgumentException("The input folder path does not exist or is not a directory.");
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

            extractionService.startExtraction(
                    inputPath,
                    outputPath,
                    com.rahul.service.PowerManager.PostAction.valueOf(postActionStr),
                    takeoutDate
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
