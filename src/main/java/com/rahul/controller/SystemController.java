package com.rahul.controller;

import com.rahul.service.SessionStatsService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import javax.swing.*;
import javax.swing.filechooser.FileNameExtensionFilter;
import java.io.File;
import java.util.Collections;
import java.util.Map;

@RestController
@RequestMapping("/api/system")
@CrossOrigin(origins = "*")
public class SystemController {

    @Autowired
    private SessionStatsService sessionStatsService;

    /** Returns cumulative totals persisted across all past sessions. */
    @GetMapping("/session-stats")
    public ResponseEntity<Map<String, Long>> getSessionStats() {
        return ResponseEntity.ok(Map.of(
                "totalFiles", sessionStatsService.getTotalFiles(),
                "totalBytes", sessionStatsService.getTotalBytes()
        ));
    }

    /** Called by the frontend after each completed session to record totals. */
    @PostMapping("/session-stats/record")
    public ResponseEntity<Map<String, String>> recordSession(@RequestBody Map<String, Long> body) {
        long files = body.getOrDefault("files", 0L);
        long bytes = body.getOrDefault("bytes", 0L);
        sessionStatsService.record(files, bytes);
        return ResponseEntity.ok(Map.of("status", "recorded"));
    }

    /** Synchronizes local database totals with absolute Firestore totals. */
    @PostMapping("/session-stats/sync")
    public ResponseEntity<Map<String, String>> syncSession(@RequestBody Map<String, Long> body) {
        long files = body.getOrDefault("files", 0L);
        long bytes = body.getOrDefault("bytes", 0L);
        sessionStatsService.sync(files, bytes);
        return ResponseEntity.ok(Map.of("status", "synced"));
    }

    /** Resets all cumulative stats (dev purge utility). */
    @PostMapping("/session-stats/reset")
    public ResponseEntity<Map<String, String>> resetStats() {
        sessionStatsService.reset();
        return ResponseEntity.ok(Map.of("status", "reset"));
    }

    @GetMapping("/browse-folder")
    public ResponseEntity<Map<String, String>> browseFolder() {
        // Must run on EDT or simply inside this thread. JFileChooser is mostly thread-safe for basic use.
        final String[] selectedPath = {null};
        try {
            // Need to ensure headless is false, which it is in TakeoutApplication
            SwingUtilities.invokeAndWait(() -> {
                try {
                    UIManager.setLookAndFeel(UIManager.getSystemLookAndFeelClassName());
                } catch (Exception ignored) {}

                JFileChooser chooser = new JFileChooser();
                chooser.setFileSelectionMode(JFileChooser.DIRECTORIES_ONLY);
                chooser.setDialogTitle("Select Folder");
                chooser.setAcceptAllFileFilterUsed(false);

                // Try to bring to front using a hidden frame
                JFrame frame = new JFrame();
                frame.setAlwaysOnTop(true);
                frame.setLocationRelativeTo(null);
                
                int result = chooser.showOpenDialog(frame);
                if (result == JFileChooser.APPROVE_OPTION) {
                    File selectedFile = chooser.getSelectedFile();
                    selectedPath[0] = selectedFile.getAbsolutePath();
                }
                frame.dispose();
            });
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Collections.singletonMap("error", e.getMessage()));
        }

        if (selectedPath[0] != null) {
            return ResponseEntity.ok(Collections.singletonMap("path", selectedPath[0]));
        } else {
            return ResponseEntity.ok(Collections.singletonMap("path", ""));
        }
    }

    @GetMapping("/browse-zip")
    public ResponseEntity<Map<String, String>> browseZip() {
        final String[] selectedPath = {null};
        try {
            SwingUtilities.invokeAndWait(() -> {
                try {
                    UIManager.setLookAndFeel(UIManager.getSystemLookAndFeelClassName());
                } catch (Exception ignored) {}

                JFileChooser chooser = new JFileChooser();
                chooser.setFileSelectionMode(JFileChooser.FILES_ONLY);
                chooser.setFileFilter(new FileNameExtensionFilter("ZIP Archives", "zip"));
                chooser.setDialogTitle("Select ZIP File");
                chooser.setAcceptAllFileFilterUsed(false);

                JFrame frame = new JFrame();
                frame.setAlwaysOnTop(true);
                frame.setLocationRelativeTo(null);

                int result = chooser.showOpenDialog(frame);
                if (result == JFileChooser.APPROVE_OPTION) {
                    File selectedFile = chooser.getSelectedFile();
                    selectedPath[0] = selectedFile.getAbsolutePath();
                }
                frame.dispose();
            });
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Collections.singletonMap("error", e.getMessage()));
        }

        if (selectedPath[0] != null) {
            return ResponseEntity.ok(Collections.singletonMap("path", selectedPath[0]));
        } else {
            return ResponseEntity.ok(Collections.singletonMap("path", ""));
        }
    }

    @GetMapping("/telemetry")
    public ResponseEntity<Map<String, Object>> getTelemetry() {
        java.lang.management.OperatingSystemMXBean baseBean = java.lang.management.ManagementFactory.getOperatingSystemMXBean();
        double processCpuLoad = 0.0;
        long totalMemory = Runtime.getRuntime().maxMemory(); // fallback JVM max
        
        if (baseBean instanceof com.sun.management.OperatingSystemMXBean) {
            com.sun.management.OperatingSystemMXBean sunBean = (com.sun.management.OperatingSystemMXBean) baseBean;
            processCpuLoad = sunBean.getProcessCpuLoad();
            totalMemory = sunBean.getTotalMemorySize(); // true system physical RAM size!
        }
        
        if (processCpuLoad < 0) {
            processCpuLoad = 0.0;
        }

        // JVM Process specific Memory stats (Heap size and usage)
        long jvmTotal = Runtime.getRuntime().totalMemory(); // allocated heap RAM
        long freeMemory = Runtime.getRuntime().freeMemory(); // free heap RAM
        long usedMemory = jvmTotal - freeMemory;

        int cores = Runtime.getRuntime().availableProcessors();
        long totalMemoryMB = totalMemory / (1024 * 1024);
        long usedMemoryMB = usedMemory / (1024 * 1024);

        return ResponseEntity.ok(Map.of(
                "cores", cores,
                "cpuLoad", processCpuLoad * 100,
                "totalMemoryMB", totalMemoryMB,
                "usedMemoryMB", usedMemoryMB
        ));
    }
}
