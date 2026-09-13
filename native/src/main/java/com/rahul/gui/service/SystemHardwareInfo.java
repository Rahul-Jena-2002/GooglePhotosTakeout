package com.rahul.gui.service;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.lang.management.ManagementFactory;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Provides accurate, genuine physical and logical hardware telemetry
 * matching OS Task Manager / System Information.
 *
 * Automatically detects:
 * - Physical CPU cores (e.g. 16)
 * - Logical processors / hardware threads (e.g. 22)
 * - CPU model name (e.g. "Intel(R) Core(TM) Ultra 9 185H")
 * - Real physical system RAM (used / total in GB)
 * - Real system CPU load percentage (0-100%)
 */
public class SystemHardwareInfo {

    private static volatile int physicalCores = -1;
    private static volatile int logicalProcessors = -1;
    private static volatile String cpuName = "";
    private static final AtomicBoolean detecting = new AtomicBoolean(false);

    static {
        // Safe baseline fallbacks from JVM runtime
        int available = Runtime.getRuntime().availableProcessors();
        logicalProcessors = available;
        physicalCores = available;

        // Immediately launch background hardware detection
        detectHardwareAsync();
    }

    public static void detectHardwareAsync() {
        if (detecting.compareAndSet(false, true)) {
            Thread t = new Thread(() -> {
                try {
                    detectHardware();
                } catch (Throwable ignored) {
                }
            }, "System-Hardware-Detector");
            t.setDaemon(true);
            t.start();
        }
    }

    private static void detectHardware() {
        String os = System.getProperty("os.name", "").toLowerCase();
        if (os.contains("win")) {
            detectWindows();
        } else if (os.contains("mac")) {
            detectMac();
        } else if (os.contains("linux")) {
            detectLinux();
        }
    }

    private static void detectWindows() {
        // Preferred: PowerShell CIM query (fast, accurate on Windows 10/11)
        try {
            ProcessBuilder pb = new ProcessBuilder(
                    "powershell.exe", "-NoProfile", "-NonInteractive", "-Command",
                    "Write-Output CORES:$((Get-CimInstance Win32_Processor).NumberOfCores); " +
                    "Write-Output THREADS:$((Get-CimInstance Win32_Processor).NumberOfLogicalProcessors); " +
                    "Write-Output NAME:$((Get-CimInstance Win32_Processor).Name)"
            );
            pb.redirectErrorStream(true);
            Process proc = pb.start();
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(proc.getInputStream()))) {
                String line;
                int sumCores = 0;
                int sumThreads = 0;
                String foundName = "";
                while ((line = reader.readLine()) != null) {
                    line = line.trim();
                    if (line.startsWith("CORES:")) {
                        try {
                            sumCores += Integer.parseInt(line.substring(6).trim());
                        } catch (NumberFormatException ignored) {}
                    } else if (line.startsWith("THREADS:")) {
                        try {
                            sumThreads += Integer.parseInt(line.substring(8).trim());
                        } catch (NumberFormatException ignored) {}
                    } else if (line.startsWith("NAME:")) {
                        String name = line.substring(5).trim();
                        if (!name.isEmpty() && foundName.isEmpty()) {
                            foundName = name;
                        }
                    }
                }
                proc.waitFor();
                if (sumCores > 0) physicalCores = sumCores;
                if (sumThreads > 0) logicalProcessors = sumThreads;
                if (!foundName.isEmpty()) cpuName = foundName;
                if (sumCores > 0 && sumThreads > 0) {
                    return; // Successfully detected
                }
            }
        } catch (Throwable ignored) {}

        // Fallback: WMIC (older Windows)
        try {
            ProcessBuilder pb = new ProcessBuilder("wmic", "cpu", "get", "NumberOfCores,NumberOfLogicalProcessors,Name", "/format:csv");
            pb.redirectErrorStream(true);
            Process proc = pb.start();
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(proc.getInputStream()))) {
                String line;
                int sumCores = 0;
                int sumThreads = 0;
                String foundName = "";
                while ((line = reader.readLine()) != null) {
                    line = line.trim();
                    if (line.isEmpty() || line.startsWith("Node")) continue;
                    String[] parts = line.split(",");
                    if (parts.length >= 4) {
                        // Node, Name, NumberOfCores, NumberOfLogicalProcessors
                        try {
                            foundName = parts[1].trim();
                            sumCores += Integer.parseInt(parts[2].trim());
                            sumThreads += Integer.parseInt(parts[3].trim());
                        } catch (Exception ignored) {}
                    }
                }
                proc.waitFor();
                if (sumCores > 0) physicalCores = sumCores;
                if (sumThreads > 0) logicalProcessors = sumThreads;
                if (!foundName.isEmpty()) cpuName = foundName;
            }
        } catch (Throwable ignored) {}
    }

    private static void detectMac() {
        try {
            int cores = runCommandForInt("sysctl", "-n", "hw.physicalcpu");
            int threads = runCommandForInt("sysctl", "-n", "hw.logicalcpu");
            String brand = runCommandForString("sysctl", "-n", "machdep.cpu.brand_string");
            if (cores > 0) physicalCores = cores;
            if (threads > 0) logicalProcessors = threads;
            if (!brand.isEmpty()) cpuName = brand;
        } catch (Throwable ignored) {}
    }

    private static void detectLinux() {
        try {
            File cpuinfo = new File("/proc/cpuinfo");
            if (cpuinfo.exists()) {
                List<String> lines = Files.readAllLines(Path.of("/proc/cpuinfo"));
                Set<String> coreIds = new HashSet<>();
                String model = "";
                int countProcessors = 0;
                String currentPhysical = "0";
                for (String line : lines) {
                    line = line.trim();
                    if (line.startsWith("model name") && model.isEmpty()) {
                        String[] parts = line.split(":", 2);
                        if (parts.length > 1) model = parts[1].trim();
                    } else if (line.startsWith("physical id")) {
                        String[] parts = line.split(":", 2);
                        if (parts.length > 1) currentPhysical = parts[1].trim();
                    } else if (line.startsWith("core id")) {
                        String[] parts = line.split(":", 2);
                        if (parts.length > 1) coreIds.add(currentPhysical + "_" + parts[1].trim());
                    } else if (line.startsWith("processor")) {
                        countProcessors++;
                    }
                }
                if (!coreIds.isEmpty()) physicalCores = coreIds.size();
                if (countProcessors > 0) logicalProcessors = countProcessors;
                if (!model.isEmpty()) cpuName = model;
            }
        } catch (Throwable ignored) {}
    }

    private static int runCommandForInt(String... cmd) {
        try {
            Process p = new ProcessBuilder(cmd).start();
            try (BufferedReader r = new BufferedReader(new InputStreamReader(p.getInputStream()))) {
                String line = r.readLine();
                if (line != null) return Integer.parseInt(line.trim());
            }
        } catch (Throwable ignored) {}
        return -1;
    }

    private static String runCommandForString(String... cmd) {
        try {
            Process p = new ProcessBuilder(cmd).start();
            try (BufferedReader r = new BufferedReader(new InputStreamReader(p.getInputStream()))) {
                String line = r.readLine();
                if (line != null) return line.trim();
            }
        } catch (Throwable ignored) {}
        return "";
    }

    // ─── Public Getters ───────────────────────────────────────────────────────

    public static int getPhysicalCores() {
        if (physicalCores <= 0) {
            return Runtime.getRuntime().availableProcessors();
        }
        return physicalCores;
    }

    public static int getLogicalProcessors() {
        if (logicalProcessors <= 0) {
            return Runtime.getRuntime().availableProcessors();
        }
        return logicalProcessors;
    }

    public static String getCpuName() {
        return cpuName != null ? cpuName : "";
    }

    public static long getTotalPhysicalMemoryBytes() {
        try {
            java.lang.management.OperatingSystemMXBean base = ManagementFactory.getOperatingSystemMXBean();
            if (base instanceof com.sun.management.OperatingSystemMXBean sun) {
                long total = sun.getTotalMemorySize();
                if (total > 0) return total;
            }
        } catch (Throwable ignored) {}
        return Runtime.getRuntime().totalMemory();
    }

    public static long getFreePhysicalMemoryBytes() {
        try {
            java.lang.management.OperatingSystemMXBean base = ManagementFactory.getOperatingSystemMXBean();
            if (base instanceof com.sun.management.OperatingSystemMXBean sun) {
                long free = sun.getFreeMemorySize();
                if (free > 0) return free;
            }
        } catch (Throwable ignored) {}
        return Runtime.getRuntime().freeMemory();
    }

    public static long getUsedPhysicalMemoryBytes() {
        long total = getTotalPhysicalMemoryBytes();
        long free = getFreePhysicalMemoryBytes();
        return Math.max(0, total - free);
    }

    public static double getTotalMemoryGB() {
        return getTotalPhysicalMemoryBytes() / (1024.0 * 1024.0 * 1024.0);
    }

    public static double getUsedMemoryGB() {
        return getUsedPhysicalMemoryBytes() / (1024.0 * 1024.0 * 1024.0);
    }

    public static double getCpuLoadPercent() {
        try {
            java.lang.management.OperatingSystemMXBean base = ManagementFactory.getOperatingSystemMXBean();
            if (base instanceof com.sun.management.OperatingSystemMXBean sun) {
                double load = sun.getCpuLoad();
                if (load < 0) load = sun.getProcessCpuLoad();
                if (load >= 0) return load * 100.0;
            }
        } catch (Throwable ignored) {}
        return 0.0;
    }
}
