package com.takeoutfix.restore.infrastructure;

import org.json.JSONArray;
import org.json.JSONObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

/**
 * High-performance storage architecture and media type detector.
 * Identifies physical drive topology (HDD vs SSD vs NVMe vs USB) and whether
 * source and destination share the same physical drive platter or bus.
 */
public final class StorageDetector {

    private static final Logger log = LoggerFactory.getLogger(StorageDetector.class);

    public enum StorageType {
        ROTATIONAL_HDD,
        USB_DRIVE,
        SATA_SSD,
        NVME_SSD,
        UNKNOWN
    }

    public record StorageDevice(
            int diskNumber,
            String model,
            String mediaType,
            String busType,
            StorageType storageType
    ) {}

    public record StorageProfile(
            String summary,
            int exifToolWorkers,
            int extractionThreads,
            boolean isSamePhysicalDisk,
            StorageType sourceType,
            StorageType destType
    ) {}

    private static final Map<String, Integer> DRIVE_TO_DISK_CACHE = new ConcurrentHashMap<>();
    private static final Map<Integer, StorageDevice> DISK_INFO_CACHE = new ConcurrentHashMap<>();
    private static volatile boolean scanned = false;

    private StorageDetector() {}

    /**
     * Resolves the optimal concurrency profile for a given source and destination directory.
     */
    public static StorageProfile detectProfile(File source, File destination) {
        int cores = Runtime.getRuntime().availableProcessors();
        ensureScanned();

        String srcLetter = extractDriveLetter(source);
        String dstLetter = extractDriveLetter(destination);

        Integer srcDisk = srcLetter != null ? DRIVE_TO_DISK_CACHE.get(srcLetter) : null;
        Integer dstDisk = dstLetter != null ? DRIVE_TO_DISK_CACHE.get(dstLetter) : null;

        StorageDevice srcDev = srcDisk != null ? DISK_INFO_CACHE.get(srcDisk) : null;
        StorageDevice dstDev = dstDisk != null ? DISK_INFO_CACHE.get(dstDisk) : null;

        StorageType srcType = srcDev != null ? srcDev.storageType() : StorageType.UNKNOWN;
        StorageType dstType = dstDev != null ? dstDev.storageType() : StorageType.UNKNOWN;

        boolean sameDisk = (srcDisk != null && dstDisk != null && srcDisk.equals(dstDisk));

        // 1. Same physical disk contention (worst case for mechanical/USB)
        if (sameDisk) {
            if (dstType == StorageType.ROTATIONAL_HDD || dstType == StorageType.USB_DRIVE || dstType == StorageType.UNKNOWN) {
                return new StorageProfile(
                        "Same-Disk USB/HDD (" + (dstLetter != null ? dstLetter : "Disk") + " · Sequential 1-Worker Anti-Thrash Mode)",
                        1,
                        2,
                        true,
                        srcType,
                        dstType
                );
            } else if (dstType == StorageType.NVME_SSD) {
                int workers = Math.min(6, Math.max(2, cores / 3));
                int threads = Math.min(12, cores);
                return new StorageProfile(
                        "Same-Disk NVMe SSD (Optimized Parallel Mode)",
                        workers,
                        threads,
                        true,
                        srcType,
                        dstType
                );
            } else {
                int workers = Math.min(4, Math.max(2, cores / 4));
                int threads = Math.min(8, cores);
                return new StorageProfile(
                        "Same-Disk SSD (Balanced Mode)",
                        workers,
                        threads,
                        true,
                        srcType,
                        dstType
                );
            }
        }

        // 2. Separate physical disks
        if (dstType == StorageType.ROTATIONAL_HDD || dstType == StorageType.USB_DRIVE) {
            return new StorageProfile(
                    "External HDD/USB Destination (2-Worker Balanced Stream)",
                    2,
                    4,
                    false,
                    srcType,
                    dstType
            );
        } else if (dstType == StorageType.NVME_SSD) {
            int workers = Math.min(8, Math.max(4, cores / 2));
            int threads = Math.max(16, (int) Math.round(cores * 1.5));
            return new StorageProfile(
                    "NVMe SSD Destination (High-Throughput Parallel Mode)",
                    workers,
                    threads,
                    false,
                    srcType,
                    dstType
            );
        } else if (dstType == StorageType.SATA_SSD) {
            int workers = Math.min(4, Math.max(2, cores / 4));
            int threads = Math.min(12, cores);
            return new StorageProfile(
                    "SATA SSD Destination (Balanced Parallel Mode)",
                    workers,
                    threads,
                    false,
                    srcType,
                    dstType
            );
        }

        // 3. Fallback / Default
        int fallbackWorkers = Math.max(2, Math.min(4, cores / 4));
        int fallbackThreads = Math.max(4, Math.min(8, cores));
        return new StorageProfile(
                "Standard Storage (Auto Balanced Mode)",
                fallbackWorkers,
                fallbackThreads,
                false,
                srcType,
                dstType
        );
    }

    private static synchronized void ensureScanned() {
        if (scanned) return;
        scanned = true;

        String os = System.getProperty("os.name", "").toLowerCase(Locale.US);
        if (os.contains("win")) {
            scanWindowsDisks();
        }
    }

    private static void scanWindowsDisks() {
        try {
            // 1. Query partition to disk number mapping
            String partCmd = "powershell -NoProfile -Command \"Get-Partition | Select-Object DriveLetter, DiskNumber | ConvertTo-Json -Compress\"";
            String partJson = executeCommand(partCmd, 4000);
            if (partJson != null && !partJson.isBlank()) {
                parsePartitionJson(partJson);
            }

            // 2. Query physical disk details (MediaType, BusType, Model)
            String diskCmd = "powershell -NoProfile -Command \"Get-PhysicalDisk | Select-Object DeviceId, FriendlyName, MediaType, BusType | ConvertTo-Json -Compress\"";
            String diskJson = executeCommand(diskCmd, 4000);
            if (diskJson != null && !diskJson.isBlank()) {
                parsePhysicalDiskJson(diskJson);
            }
        } catch (Throwable t) {
            log.warn("Storage auto-detection failed, using safe fallback defaults: {}", t.getMessage());
        }
    }

    private static void parsePartitionJson(String raw) {
        try {
            raw = raw.trim();
            if (raw.startsWith("{")) {
                JSONObject obj = new JSONObject(raw);
                recordPartition(obj);
            } else if (raw.startsWith("[")) {
                JSONArray arr = new JSONArray(raw);
                for (int i = 0; i < arr.length(); i++) {
                    recordPartition(arr.getJSONObject(i));
                }
            }
        } catch (Exception e) {
            log.debug("Failed to parse partition JSON: {}", e.getMessage());
        }
    }

    private static void recordPartition(JSONObject obj) {
        String letter = obj.optString("DriveLetter", "").trim().toUpperCase(Locale.US);
        if (!letter.isEmpty() && !letter.equals("NULL")) {
            int diskNum = obj.optInt("DiskNumber", -1);
            if (diskNum >= 0) {
                DRIVE_TO_DISK_CACHE.put(letter, diskNum);
            }
        }
    }

    private static void parsePhysicalDiskJson(String raw) {
        try {
            raw = raw.trim();
            if (raw.startsWith("{")) {
                JSONObject obj = new JSONObject(raw);
                recordPhysicalDisk(obj);
            } else if (raw.startsWith("[")) {
                JSONArray arr = new JSONArray(raw);
                for (int i = 0; i < arr.length(); i++) {
                    recordPhysicalDisk(arr.getJSONObject(i));
                }
            }
        } catch (Exception e) {
            log.debug("Failed to parse physical disk JSON: {}", e.getMessage());
        }
    }

    private static void recordPhysicalDisk(JSONObject obj) {
        String devIdStr = obj.optString("DeviceId", String.valueOf(obj.optInt("DeviceId", -1))).trim();
        int devId;
        try {
            devId = Integer.parseInt(devIdStr);
        } catch (NumberFormatException e) {
            return;
        }

        String model = obj.optString("FriendlyName", "Unknown Disk");
        String media = obj.optString("MediaType", "Unspecified");
        String bus = obj.optString("BusType", "Unknown");

        StorageType type = resolveStorageType(media, bus, model);
        DISK_INFO_CACHE.put(devId, new StorageDevice(devId, model, media, bus, type));
    }

    private static StorageType resolveStorageType(String media, String bus, String model) {
        String mediaLower = media.toLowerCase(Locale.US);
        String busLower = bus.toLowerCase(Locale.US);
        String modelLower = model.toLowerCase(Locale.US);

        if (busLower.contains("nvme") || modelLower.contains("nvme")) {
            return StorageType.NVME_SSD;
        }
        if (mediaLower.contains("ssd")) {
            return busLower.contains("usb") ? StorageType.USB_DRIVE : StorageType.SATA_SSD;
        }
        if (mediaLower.contains("hdd") || mediaLower.contains("rotational")) {
            return StorageType.ROTATIONAL_HDD;
        }
        if (busLower.contains("usb")) {
            return StorageType.USB_DRIVE;
        }
        return StorageType.UNKNOWN;
    }

    private static String extractDriveLetter(File file) {
        if (file == null) return null;
        String abs = file.getAbsolutePath().trim();
        if (abs.length() >= 2 && abs.charAt(1) == ':') {
            return String.valueOf(Character.toUpperCase(abs.charAt(0)));
        }
        return null;
    }

    private static String executeCommand(String cmd, long timeoutMs) {
        try {
            Process p = Runtime.getRuntime().exec(cmd);
            StringBuilder sb = new StringBuilder();
            try (BufferedReader r = new BufferedReader(new InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = r.readLine()) != null) {
                    sb.append(line).append("\n");
                }
            }
            p.waitFor(timeoutMs, TimeUnit.MILLISECONDS);
            return sb.toString().trim();
        } catch (Throwable ignored) {
            return null;
        }
    }
}
