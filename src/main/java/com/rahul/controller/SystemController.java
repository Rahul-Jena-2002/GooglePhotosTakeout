package com.rahul.controller;

import com.rahul.service.SessionStatsService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import javax.swing.*;
import javax.swing.filechooser.FileNameExtensionFilter;
import java.io.File;
import java.nio.file.Files;
import java.util.Collections;
import java.util.Map;

@RestController
@RequestMapping("/api/system")
@CrossOrigin(originPatterns = {"http://localhost:*", "https://takeoutfix.com", "https://*.pages.dev"})
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
        final String[] selectedPath = {null};
        try {
            SwingUtilities.invokeAndWait(() -> {
                try {
                    UIManager.setLookAndFeel(UIManager.getSystemLookAndFeelClassName());
                } catch (Exception ignored) {}

                JFileChooser chooser = new JFileChooser();
                chooser.setFileSelectionMode(JFileChooser.DIRECTORIES_ONLY);
                chooser.setDialogTitle("Select Folder");
                chooser.setAcceptAllFileFilterUsed(false);

                JFrame frame = new JFrame();
                frame.setAlwaysOnTop(true);
                frame.setLocationRelativeTo(null);
                frame.setVisible(false);
                
                int result = chooser.showOpenDialog(frame);
                if (result == JFileChooser.APPROVE_OPTION) {
                    File selectedFile = chooser.getSelectedFile();
                    if (selectedFile == null || !selectedFile.exists()) {
                        selectedFile = chooser.getCurrentDirectory();
                    }
                    if (selectedFile != null && selectedFile.exists()) {
                        selectedPath[0] = selectedFile.getAbsolutePath();
                    }
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
                frame.setVisible(false);

                int result = chooser.showOpenDialog(frame);
                if (result == JFileChooser.APPROVE_OPTION) {
                    File selectedFile = chooser.getSelectedFile();
                    if (selectedFile != null && selectedFile.exists()) {
                        selectedPath[0] = selectedFile.getAbsolutePath();
                    }
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

    @PostMapping("/open-folder")
    public ResponseEntity<Map<String, String>> openFolder(@RequestBody Map<String, String> body) {
        String path = body.get("path");
        if (path == null || path.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("error", "No path specified"));
        }
        try {
            File folder = new File(path);
            if (!folder.exists()) {
                folder.mkdirs();
            }
            String os = System.getProperty("os.name").toLowerCase();
            if (os.contains("win")) {
                new ProcessBuilder("explorer.exe", folder.getAbsolutePath()).start();
            } else if (os.contains("mac")) {
                new ProcessBuilder("open", folder.getAbsolutePath()).start();
            } else {
                new ProcessBuilder("xdg-open", folder.getAbsolutePath()).start();
            }
            return ResponseEntity.ok(Collections.singletonMap("status", "opened"));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    @GetMapping("/telemetry")
    public ResponseEntity<Map<String, Object>> getTelemetry() {
        double cpuLoadPercent = 0.0;
        long totalMemoryMB = 0;
        long usedMemoryMB = 0;

        java.lang.management.OperatingSystemMXBean baseBean = java.lang.management.ManagementFactory.getOperatingSystemMXBean();
        if (baseBean instanceof com.sun.management.OperatingSystemMXBean sunBean) {
            double load = sunBean.getCpuLoad();
            if (load < 0) load = sunBean.getProcessCpuLoad();
            if (load < 0) load = 0.0;
            cpuLoadPercent = load * 100.0;
            long totalPhysical = sunBean.getTotalMemorySize();
            long freePhysical = sunBean.getFreeMemorySize();
            if (totalPhysical > 0) {
                totalMemoryMB = totalPhysical / (1024 * 1024);
                usedMemoryMB = (totalPhysical - freePhysical) / (1024 * 1024);
            }
        }

        // Fallback for JVM memory if physical RAM is unavailable
        if (usedMemoryMB <= 0) {
            long jvmTotal = Runtime.getRuntime().totalMemory();
            long freeMemory = Runtime.getRuntime().freeMemory();
            usedMemoryMB = (jvmTotal - freeMemory) / (1024 * 1024);
            if (totalMemoryMB <= 0) totalMemoryMB = jvmTotal / (1024 * 1024);
        }

        int cores = Runtime.getRuntime().availableProcessors();
        int threads = Math.max(1, (int) Math.round(cores * 0.80));

        return ResponseEntity.ok(Map.of(
                "cores", cores,
                "threads", threads,
                "cpuLoad", cpuLoadPercent,
                "totalMemoryMB", totalMemoryMB,
                "usedMemoryMB", usedMemoryMB
        ));
    }

    /**
     * Resolves a folder name (from browser showDirectoryPicker handle.name) to a full filesystem path.
     * Handles Unicode apostrophes, searches mounted drives recursively up to 5 levels deep.
     * Returns {"path": "/absolute/path", "unresolved": false} or {"path": name, "unresolved": true}.
     */
    @PostMapping("/resolve-path")
    public ResponseEntity<Map<String, Object>> resolvePath(@RequestBody Map<String, String> body) {
        String rawName = body.getOrDefault("name", "").trim();
        if (rawName.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "No folder name provided"));
        }

        // Normalize Unicode apostrophes/quotes → plain ASCII so browser curly-quote doesn't break matching
        // e.g. U+2019 RIGHT SINGLE QUOTATION MARK → U+0027 APOSTROPHE
        String name = rawName
            .replace("\u2019", "'").replace("\u2018", "'")  // curly single quotes → straight
            .replace("\u201C", "\"").replace("\u201D", "\"") // curly double quotes → straight
            .replace("\u2032", "'");                          // prime → apostrophe

        // If it's already an absolute path that exists, return it directly
        File direct = new File(name);
        if (direct.isAbsolute() && direct.isDirectory()) {
            return ResponseEntity.ok(Map.of("path", direct.getAbsolutePath(), "unresolved", false));
        }

        String home = System.getProperty("user.home");

        // Collect all root directories to search recursively
        java.util.List<File> searchRoots = new java.util.ArrayList<>();

        // 1. Home directory and common subdirs
        searchRoots.add(new File(home));
        for (String sub : new String[]{"Desktop","Documents","Downloads","Pictures","Videos","Music"}) {
            File f = new File(home, sub);
            if (f.isDirectory()) searchRoots.add(f);
        }

        // 2. All mounted external drives under /run/media/<any-user>/<any-drive>/
        File runMedia = new File("/run/media");
        if (runMedia.isDirectory()) {
            File[] userDirs = runMedia.listFiles();
            if (userDirs != null) {
                for (File userDir : userDirs) {
                    if (!userDir.isDirectory()) continue;
                    File[] drives = userDir.listFiles();
                    if (drives != null) {
                        for (File drive : drives) {
                            if (drive.isDirectory()) {
                                searchRoots.add(drive); // e.g. /run/media/rahul/s, /run/media/rahul/Universal
                            }
                        }
                    }
                }
            }
        }

        // 3. /media (older Linux mount point)
        File media = new File("/media");
        if (media.isDirectory()) {
            File[] entries = media.listFiles();
            if (entries != null) {
                for (File e : entries) {
                    if (e.isDirectory()) searchRoots.add(e);
                }
            }
        }

        // Recursive search in all roots (up to depth 6 for nested drive structures)
        for (File root : searchRoots) {
            File found = searchRecursive(root, name, 6);
            if (found != null) {
                return ResponseEntity.ok(Map.of("path", found.getAbsolutePath(), "unresolved", false));
            }
        }

        // Could not resolve — return unresolved flag so the UI can ask the user to type the full path
        return ResponseEntity.ok(Map.of("path", rawName, "unresolved", true));
    }

    /**
     * Recursively searches a directory tree for a folder matching the given name (exact, then case-insensitive).
     * Skips hidden directories and common system/cache dirs for speed.
     */
    private File searchRecursive(File dir, String targetName, int depth) {
        if (depth <= 0 || dir == null || !dir.isDirectory()) return null;
        File[] children = dir.listFiles();
        if (children == null) return null;

        // First pass: exact match
        for (File child : children) {
            if (child.isDirectory() && child.getName().equals(targetName)) {
                return child;
            }
        }
        // Second pass: recurse (skip hidden, snap, proc, sys dirs)
        for (File child : children) {
            if (!child.isDirectory()) continue;
            String n = child.getName();
            if (n.startsWith(".") || n.equals("snap") || n.equals("proc") || n.equals("sys") || n.equals("dev")) continue;
            File found = searchRecursive(child, targetName, depth - 1);
            if (found != null) return found;
        }
        return null;
    }


    private long parseKb(String line) {
        try {
            String[] parts = line.trim().split("\\s+");
            if (parts.length >= 2) {
                return Long.parseLong(parts[1]);
            }
        } catch (Exception ignored) {}
        return 0;
    }
}
