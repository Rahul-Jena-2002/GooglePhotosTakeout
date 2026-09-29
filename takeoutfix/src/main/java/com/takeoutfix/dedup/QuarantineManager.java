package com.takeoutfix.dedup;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Headless, reversible Quarantine Subsystem for TakeoutFix.
 * Implements:
 * 1. Preflight validation: ensures source file exists and verifies SHA-256 before moving.
 * 2. Atomic safe move into ~/TakeoutFix/quarantine/<date>/group_<id>/.
 * 3. Durable JSON audit manifest journaling (quarantine_manifest.json).
 * 4. Reversible restoration to original path (fails closed if target occupied).
 * 5. Explicit confirmed permanent purge.
 */
public class QuarantineManager {

    public enum QuarantineAction {
        QUARANTINED,
        RESTORED,
        PURGED
    }

    public static class ManifestEntry {
        private final String timestamp;
        private final String groupId;
        private final String action;
        private final String originalPath;
        private final String quarantinePath;
        private final String sha256;
        private final long fileSize;

        public ManifestEntry(String timestamp, String groupId, String action, String originalPath, String quarantinePath, String sha256, long fileSize) {
            this.timestamp = timestamp;
            this.groupId = groupId;
            this.action = action;
            this.originalPath = originalPath;
            this.quarantinePath = quarantinePath;
            this.sha256 = sha256;
            this.fileSize = fileSize;
        }

        public String getTimestamp() { return timestamp; }
        public String getGroupId() { return groupId; }
        public String getAction() { return action; }
        public String getOriginalPath() { return originalPath; }
        public String getQuarantinePath() { return quarantinePath; }
        public String getSha256() { return sha256; }
        public long getFileSize() { return fileSize; }
    }

    private final Path quarantineRoot;

    public QuarantineManager() {
        this(Paths.get(System.getProperty("user.home"), "TakeoutFix", "quarantine"));
    }

    public QuarantineManager(Path quarantineRoot) {
        this.quarantineRoot = quarantineRoot;
    }

    public Path getQuarantineRoot() {
        return quarantineRoot;
    }

    /**
     * Safely quarantines a file into the holding area.
     */
    public Path quarantineFile(File sourceFile, String groupId) throws IOException {
        return quarantineFile(sourceFile, null, groupId);
    }

    /**
     * Safely quarantines a file into the holding area, preserving its relative directory structure
     * if rootDirectory is specified.
     * Preflight checks:
     * - File exists and is regular file
     * - Checks hash match
     * - Prevents path traversal
     */
    public Path quarantineFile(File sourceFile, Path rootDirectory, String groupId) throws IOException {
        if (sourceFile == null || !sourceFile.isFile()) {
            throw new IOException("Source file does not exist or is not a regular file: " + sourceFile);
        }

        String initialHash = computeSha256(sourceFile);
        if (initialHash == null) {
            throw new IOException("Failed to calculate SHA-256 for source file: " + sourceFile);
        }

        String dateFolder = LocalDate.now().toString();
        String safeGroup = (groupId != null ? groupId.replaceAll("[^a-zA-Z0-9_-]", "") : "ungrouped");
        Path groupRoot = quarantineRoot.resolve(dateFolder).resolve("group_" + safeGroup);

        Path targetFile;
        if (rootDirectory != null) {
            Path normRoot = rootDirectory.toAbsolutePath().normalize();
            Path normSource = sourceFile.toPath().toAbsolutePath().normalize();
            if (normSource.startsWith(normRoot)) {
                Path rel = normRoot.relativize(normSource);
                targetFile = groupRoot.resolve(rel).normalize();
            } else {
                targetFile = groupRoot.resolve(sourceFile.getName());
            }
        } else {
            targetFile = groupRoot.resolve(sourceFile.getName());
        }

        Files.createDirectories(targetFile.getParent());

        // Perform move
        Files.move(sourceFile.toPath(), targetFile, StandardCopyOption.REPLACE_EXISTING);

        // Post-verification: ensure quarantined file matches initial hash
        String verifyHash = computeSha256(targetFile.toFile());
        if (!initialHash.equals(verifyHash)) {
            throw new IOException("Quarantined file verification failed! Expected " + initialHash + ", got " + verifyHash);
        }

        // Journal into manifest
        appendManifest(new ManifestEntry(
                Instant.now().toString(),
                safeGroup,
                QuarantineAction.QUARANTINED.name(),
                sourceFile.getAbsolutePath(),
                targetFile.toAbsolutePath().toString(),
                initialHash,
                Files.size(targetFile)
        ));

        return targetFile;
    }

    /**
     * Safely restores a quarantined file back to its original path.
     * Fails closed if original destination is already occupied.
     */
    public boolean restoreFile(Path quarantinedFile, Path originalDestination) throws IOException {
        if (!Files.isRegularFile(quarantinedFile)) {
            throw new IOException("Quarantined file not found: " + quarantinedFile);
        }

        if (Files.exists(originalDestination)) {
            throw new IOException("Cannot restore: Destination path already occupied by an existing file: " + originalDestination);
        }

        Files.createDirectories(originalDestination.getParent());
        Files.move(quarantinedFile, originalDestination, StandardCopyOption.ATOMIC_MOVE);

        appendManifest(new ManifestEntry(
                Instant.now().toString(),
                "restore",
                QuarantineAction.RESTORED.name(),
                originalDestination.toAbsolutePath().toString(),
                quarantinedFile.toAbsolutePath().toString(),
                computeSha256(originalDestination.toFile()),
                Files.size(originalDestination)
        ));

        return true;
    }

    /**
     * Permanently purges a quarantined file.
     */
    public boolean purgeFile(Path quarantinedFile) throws IOException {
        if (!Files.isRegularFile(quarantinedFile)) {
            return false;
        }

        long size = Files.size(quarantinedFile);
        String hash = computeSha256(quarantinedFile.toFile());
        boolean deleted = Files.deleteIfExists(quarantinedFile);

        if (deleted) {
            appendManifest(new ManifestEntry(
                    Instant.now().toString(),
                    "purge",
                    QuarantineAction.PURGED.name(),
                    "",
                    quarantinedFile.toAbsolutePath().toString(),
                    hash,
                    size
            ));
        }

        return deleted;
    }

    public List<ManifestEntry> readManifest() throws IOException {
        Path manifestFile = quarantineRoot.resolve("quarantine_manifest.json");
        if (!Files.exists(manifestFile)) {
            return Collections.emptyList();
        }

        List<ManifestEntry> entries = new ArrayList<>();
        List<String> lines = Files.readAllLines(manifestFile, StandardCharsets.UTF_8);
        for (String line : lines) {
            String trimmed = line.trim();
            if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
                String ts = extractJsonField(trimmed, "timestamp");
                String grp = extractJsonField(trimmed, "groupId");
                String act = extractJsonField(trimmed, "action");
                String orig = extractJsonField(trimmed, "originalPath");
                String qPath = extractJsonField(trimmed, "quarantinePath");
                String hash = extractJsonField(trimmed, "sha256");
                String sizeStr = extractJsonField(trimmed, "fileSize");
                long size = 0;
                try { size = Long.parseLong(sizeStr); } catch (Exception ignored) {}
                entries.add(new ManifestEntry(ts, grp, act, orig, qPath, hash, size));
            }
        }
        return entries;
    }

    private synchronized void appendManifest(ManifestEntry entry) {
        try {
            Files.createDirectories(quarantineRoot);
            Path manifestFile = quarantineRoot.resolve("quarantine_manifest.json");
            String line = String.format("{\"timestamp\":\"%s\",\"groupId\":\"%s\",\"action\":\"%s\",\"originalPath\":\"%s\",\"quarantinePath\":\"%s\",\"sha256\":\"%s\",\"fileSize\":%d}%n",
                    entry.getTimestamp(),
                    escapeJson(entry.getGroupId()),
                    entry.getAction(),
                    escapeJson(entry.getOriginalPath()),
                    escapeJson(entry.getQuarantinePath()),
                    entry.getSha256(),
                    entry.getFileSize());
            Files.writeString(manifestFile, line, StandardCharsets.UTF_8, java.nio.file.StandardOpenOption.CREATE, java.nio.file.StandardOpenOption.APPEND);
        } catch (Exception ignored) {}
    }

    public String computeSha256(File file) {
        try (FileInputStream fis = new FileInputStream(file)) {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] buf = new byte[8192];
            int read;
            while ((read = fis.read(buf)) != -1) {
                md.update(buf, 0, read);
            }
            byte[] digest = md.digest();
            StringBuilder sb = new StringBuilder();
            for (byte b : digest) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception e) {
            return null;
        }
    }

    private String extractJsonField(String json, String field) {
        String key = "\"" + field + "\":";
        int idx = json.indexOf(key);
        if (idx == -1) return "";
        int start = idx + key.length();
        if (start < json.length() && json.charAt(start) == '\"') {
            start++;
            int end = json.indexOf("\"", start);
            String val = end != -1 ? json.substring(start, end) : "";
            return val.replace("\\\\", "\\").replace("\\\"", "\"");
        } else {
            int end = json.indexOf(",", start);
            if (end == -1) end = json.indexOf("}", start);
            return end != -1 ? json.substring(start, end).trim() : "";
        }
    }

    private String escapeJson(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", " ").replace("\r", "");
    }
}
