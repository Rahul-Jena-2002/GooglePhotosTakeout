package com.rahul;

import org.json.JSONObject;
import javax.swing.*;
import java.io.File;
import java.io.IOException;
import java.nio.file.*;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.AbstractMap.SimpleEntry;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * The background worker ("Model" or "Worker" in MVC).
 * Handles all file operations, ExifTool calls, and heavy lifting
 * on a background thread to keep the GUI responsive.
 */
public class ProcessingTask extends SwingWorker<Void, String> {
    private final String inputPath, outputPath, exiftoolPath;
    private final AppView view;
    private final PowerManager.PostAction postAction;
    private final PowerManager powerManager;
    private volatile boolean paused = false;
    private static final String[] MEDIA_EXTS = {".jpg", ".jpeg", ".png", ".heic", ".mp4", ".mov", ".avi", ".mkv"};

    public ProcessingTask(String i, String o, String e, AppView v, PowerManager.PostAction a) {
        this.inputPath = i; this.outputPath = o; this.exiftoolPath = e; this.view = v;
        this.postAction = a; this.powerManager = new PowerManager();
    }

    @Override
    protected Void doInBackground() throws Exception {
        publish("INFO: === STARTING PROCESS ===");
        if (postAction == PowerManager.PostAction.KEEP_AWAKE) {
            powerManager.startKeepingAwake();
            publish("INFO: Power management enabled: System will be kept awake.");
        }

        List<Path> allFiles;
        try (Stream<Path> stream = Files.walk(Paths.get(inputPath))) {
            allFiles = stream.filter(Files::isRegularFile)
                    .filter(p -> Arrays.stream(MEDIA_EXTS).anyMatch(ext -> p.toString().toLowerCase().endsWith(ext)))
                    .collect(Collectors.toList());
        }
        int total = allFiles.size();
        publish("INFO: Found " + total + " media files to process.");
        if (total == 0) return null;

        AtomicInteger processedCount = new AtomicInteger(0);
        int numThreads = Runtime.getRuntime().availableProcessors();
        publish("INFO: Starting parallel processing with " + numThreads + " threads.");
        ExecutorService executor = Executors.newFixedThreadPool(numThreads);

        for (Path file : allFiles) {
            if (isCancelled()) break;
            executor.submit(() -> {
                try {
                    handlePause();
                    if (isCancelled()) return;
                    processSingleFile(file);
                    int current = processedCount.incrementAndGet();
                    SwingUtilities.invokeLater(() -> {
                        view.progressBar.setValue((int) ((current / (double) total) * 100));
                        view.statusLabel.setText("Processed " + current + "/" + total + ": " + file.getFileName());
                    });
                } catch (Exception e) { publish("ERROR: Failed " + file.getFileName() + ": " + e.getMessage()); }
            });
        }
        executor.shutdown();
        executor.awaitTermination(24, TimeUnit.HOURS);
        return null;
    }

    private void processSingleFile(Path file) throws Exception {
        publish("PROCESS: Starting: " + file.getFileName());
        Path outFile = Paths.get(outputPath).resolve(Paths.get(inputPath).relativize(file));
        Files.createDirectories(outFile.getParent());
        Files.copy(file, outFile, StandardCopyOption.REPLACE_EXISTING);

        Path jsonFile = findMatchingJson(file);
        if (jsonFile != null) {
            publish("SUCCESS: Found JSON for " + file.getFileName() + " -> " + jsonFile.getFileName());
            applyMetadata(jsonFile.toString(), outFile.toString());
        } else {
            publish("WARN: No matching JSON found for: " + file.getFileName());
        }
    }

    private Path findMatchingJson(Path mediaFile) throws IOException {
        String mediaFileName = mediaFile.getFileName().toString();
        String baseName = mediaFileName.substring(0, mediaFileName.lastIndexOf('.'));
        Path parentDir = mediaFile.getParent();

        // Strategy 1: Perfect Match (e.g., "IMG_123.JPG.json")
        Path perfectMatch = parentDir.resolve(mediaFileName + ".json");
        if (Files.exists(perfectMatch)) return perfectMatch;

        // Strategy 2: Title Match (e.g., "IMG_123(1).JPG" -> "IMG_123.json")
        Path titleMatch = parentDir.resolve(baseName + ".json");
        if (Files.exists(titleMatch)) return titleMatch;

        // Strategy 3: Longest Prefix Match (Handles truncated names safely)
        try (Stream<Path> stream = Files.list(parentDir)) {
            Path longestPrefixMatch = stream
                    .filter(p -> p.getFileName().toString().endsWith(".json") && !p.getFileName().toString().contains(".supplement"))
                    .map(p -> new SimpleEntry<>(p, p.getFileName().toString().replace(".json", "")))
                    .filter(entry -> baseName.startsWith(entry.getValue()))
                    .max(Comparator.comparingInt(entry -> entry.getValue().length()))
                    .map(SimpleEntry::getKey)
                    .orElse(null);
            if (longestPrefixMatch != null) return longestPrefixMatch;
        }

        // Strategy 4: 46-character truncation check (Google Takeout behavior)
        try (DirectoryStream<Path> dirStream = Files.newDirectoryStream(parentDir, "*.json")) {
            for (Path json : dirStream) {
                String jsonName = json.getFileName().toString();
                String jsonBase = jsonName.substring(0, jsonName.lastIndexOf('.'));

                // If both names are longer than 46 chars, compare only first 46
                if (baseName.length() > 46 && jsonBase.length() > 46) {
                    if (baseName.substring(0, 46).equals(jsonBase.substring(0, 46))) {
                        return json;
                    }
                }
            }
        }

        // Strategy 5: Fallback to Original Fuzzy Truncation Logic
        try (DirectoryStream<Path> dirStream = Files.newDirectoryStream(parentDir, "*.json")) {
            for (Path json : dirStream) {
                String jsonName = json.getFileName().toString();
                String jsonBase = jsonName.substring(0, jsonName.lastIndexOf('.'));
                for (int t = 1; t <= 5; t++) {
                    if (baseName.length() > t) {
                        if (jsonBase.startsWith(baseName.substring(0, baseName.length() - t)) && baseName.length() - t > 10) return json;
                    }
                    if (jsonBase.length() > t) {
                        if (baseName.startsWith(jsonBase.substring(0, jsonBase.length() - t)) && jsonBase.length() - t > 10) return json;
                    }
                }
            }
        }
        return null;
    }

    private void applyMetadata(String jsonFile, String mediaFile) {
        try {
            String jsonContent = new String(Files.readAllBytes(Paths.get(jsonFile)));
            JSONObject root = new JSONObject(jsonContent);

            String ts = root.optJSONObject("photoTakenTime").optString("timestamp",
                    root.optJSONObject("creationTime").optString("timestamp", null));
            if (ts == null) {
                publish("WARN: No timestamp in JSON for " + new File(mediaFile).getName());
                return;
            }

            Instant instant = Instant.ofEpochSecond(Long.parseLong(ts));
            String exifDate = LocalDateTime.ofInstant(instant, ZoneOffset.UTC).format(DateTimeFormatter.ofPattern("yyyy:MM:dd HH:mm:ss"));

            List<String> cmd = new java.util.ArrayList<>(Arrays.asList(exiftoolPath, "-overwrite_original", "-DateTimeOriginal=" + exifDate, "-CreateDate=" + exifDate, "-ModifyDate=" + exifDate));

            JSONObject geo = root.optJSONObject("geoData");
            if (geo != null && geo.optDouble("latitude", 0.0) != 0.0) {
                cmd.add("-GPSLatitude=" + geo.getDouble("latitude")); cmd.add("-GPSLongitude=" + geo.getDouble("longitude"));
                cmd.add("-GPSLatitudeRef=" + (geo.getDouble("latitude") >= 0 ? "N" : "S")); cmd.add("-GPSLongitudeRef=" + (geo.getDouble("longitude") >= 0 ? "E" : "W"));
            }
            cmd.add(mediaFile);

            if (new ProcessBuilder(cmd).start().waitFor() == 0) {
                publish("SUCCESS: Applied metadata to " + new File(mediaFile).getName());
                Files.setLastModifiedTime(Paths.get(mediaFile), java.nio.file.attribute.FileTime.from(instant));
            } else {
                publish("ERROR: ExifTool failed for " + new File(mediaFile).getName());
            }
        } catch (Exception e) { publish("ERROR: Metadata failure for " + new File(mediaFile).getName() + ": " + e.getMessage()); }
    }

    @Override protected void process(List<String> chunks) { for (String msg : chunks) view.logArea.append(msg + "\n"); }

    @Override protected void done() {
        powerManager.stopKeepingAwake();
        try {
            get();
            String finalMsg = isCancelled() ? "PROCESS CANCELLED BY USER" : "PROCESS COMPLETE";
            publish("INFO: === " + finalMsg + " ===");
            view.statusLabel.setText(isCancelled() ? "Cancelled" : "✅ Done!");
            if (!isCancelled() && postAction == PowerManager.PostAction.SHUTDOWN) {
                publish("ACTION: Shutting down computer in 60 seconds...");
                powerManager.shutdownComputer(60);
            }
        } catch (Exception e) {
            publish("FATAL: An error occurred: " + e.getCause().getMessage());
            view.statusLabel.setText("❌ Error!");
        } finally {
            view.setButtonsEnabled(true);
            view.pauseBtn.setText("Pause");
        }
    }

    public synchronized void setPaused(boolean p) { this.paused = p; if (!p) notifyAll(); }
    public boolean isPaused() { return this.paused; }
    private synchronized void handlePause() throws InterruptedException { while (paused) wait(); }
}