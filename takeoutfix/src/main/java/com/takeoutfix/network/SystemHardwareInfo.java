package com.takeoutfix.network;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStreamReader;
import java.lang.management.ManagementFactory;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * High-performance, zero-overhead hardware and system resource detector.
 * Resolves genuine physical cores, hyperthreaded logical processors, CPU model brand string,
 * host memory, and process-specific memory / CPU telemetry across Windows, macOS, and Linux.
 */
public final class SystemHardwareInfo {

    private static volatile int physicalCores = -1;
    private static volatile int logicalProcessors = -1;
    private static volatile String cpuName = "";
    private static volatile long cachedTotalMemoryBytes = -1;
    private static final AtomicBoolean detecting = new AtomicBoolean(false);

    private static final boolean IS_LINUX;
    private static final boolean IS_MAC;
    private static final boolean IS_WIN;

    static {
        String os = System.getProperty("os.name", "").toLowerCase();
        IS_LINUX = os.contains("linux");
        IS_MAC = os.contains("mac");
        IS_WIN = os.contains("win");

        // Safe baseline fallbacks from JVM runtime
        int available = Runtime.getRuntime().availableProcessors();
        logicalProcessors = available;
        physicalCores = available;

        // Immediate fast-path detection for Linux (reading /proc takes < 0.5ms)
        if (IS_LINUX) {
            detectLinux();
        }

        // Launch background detection for platform-specific hardware details
        detectHardwareAsync();
    }

    private SystemHardwareInfo() {}

    /**
     * Initializes hardware detection in a background thread if not already detected.
     */
    public static void detectHardwareAsync() {
        if (detecting.compareAndSet(false, true)) {
            Thread t = new Thread(() -> {
                try {
                    if (IS_WIN) {
                        detectWindows();
                    } else if (IS_MAC) {
                        detectMac();
                    } else if (IS_LINUX) {
                        detectLinux();
                    }
                } finally {
                    detecting.set(false);
                }
            }, "Hardware-Detector");
            t.setDaemon(true);
            t.setPriority(Thread.MIN_PRIORITY);
            t.start();
        }
    }

    public static void initializeAsync() {
        detectHardwareAsync();
    }

    // ─── Linux Hardware Detection ──────────────────────────────────────────

    private static void detectLinux() {
        File cpuinfo = new File("/proc/cpuinfo");
        if (!cpuinfo.exists()) return;

        try (BufferedReader reader = new BufferedReader(new InputStreamReader(new FileInputStream(cpuinfo), StandardCharsets.UTF_8), 2048)) {
            String line;
            int coreCount = 0;
            String modelName = "";

            while ((line = reader.readLine()) != null) {
                if (line.startsWith("model name") && modelName.isEmpty()) {
                    int colon = line.indexOf(':');
                    if (colon > 0) modelName = line.substring(colon + 1).trim();
                } else if (line.startsWith("cpu cores")) {
                    int colon = line.indexOf(':');
                    if (colon > 0) {
                        try {
                            coreCount = Integer.parseInt(line.substring(colon + 1).trim());
                        } catch (NumberFormatException ignored) {}
                    }
                }
            }

            if (!modelName.isEmpty()) cpuName = modelName;
            if (coreCount > 0) physicalCores = coreCount;
        } catch (Throwable ignored) {}
    }

    // ─── Windows Hardware Detection ────────────────────────────────────────

    private static void detectWindows() {
        // Fast path 1: Windows Registry query for CPU Brand (zero WMI overhead, returns in ~15ms)
        try {
            Process p = new ProcessBuilder("reg", "query", "HKLM\\HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0", "/v", "ProcessorNameString").start();
            try (BufferedReader r = new BufferedReader(new InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = r.readLine()) != null) {
                    if (line.contains("ProcessorNameString")) {
                        String[] parts = line.split("REG_SZ", 2);
                        if (parts.length > 1) {
                            String name = parts[1].trim();
                            if (!name.isEmpty()) cpuName = name;
                        }
                    }
                }
            }
            p.waitFor();
        } catch (Throwable ignored) {}

        // Fast path 2: PowerShell CIM query for Cores & Threads (accurate for Intel P/E hybrid cores)
        try {
            ProcessBuilder pb = new ProcessBuilder(
                    "powershell.exe", "-NoProfile", "-NonInteractive", "-Command",
                    "Write-Output CORES:$((Get-CimInstance Win32_Processor).NumberOfCores); " +
                    "Write-Output THREADS:$((Get-CimInstance Win32_Processor).NumberOfLogicalProcessors); " +
                    "Write-Output NAME:$((Get-CimInstance Win32_Processor).Name)"
            );
            pb.redirectErrorStream(true);
            Process proc = pb.start();
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(proc.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                int sumCores = 0;
                int sumThreads = 0;
                String foundName = "";
                while ((line = reader.readLine()) != null) {
                    line = line.trim();
                    if (line.startsWith("CORES:")) {
                        try { sumCores += Integer.parseInt(line.substring(6).trim()); } catch (NumberFormatException ignored) {}
                    } else if (line.startsWith("THREADS:")) {
                        try { sumThreads += Integer.parseInt(line.substring(8).trim()); } catch (NumberFormatException ignored) {}
                    } else if (line.startsWith("NAME:")) {
                        String name = line.substring(5).trim();
                        if (!name.isEmpty() && foundName.isEmpty()) foundName = name;
                    }
                }
                proc.waitFor();
                if (sumCores > 0) physicalCores = sumCores;
                if (sumThreads > 0) logicalProcessors = sumThreads;
                if (!foundName.isEmpty() && cpuName.isEmpty()) cpuName = foundName;
                if (sumCores > 0 && sumThreads > 0) return;
            }
        } catch (Throwable ignored) {}

        // Fallback: WMIC (older Windows versions without CIM)
        try {
            ProcessBuilder pb = new ProcessBuilder("wmic", "cpu", "get", "NumberOfCores,NumberOfLogicalProcessors,Name", "/format:csv");
            pb.redirectErrorStream(true);
            Process proc = pb.start();
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(proc.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                int sumCores = 0;
                int sumThreads = 0;
                String foundName = "";
                while ((line = reader.readLine()) != null) {
                    line = line.trim();
                    if (line.isEmpty() || line.startsWith("Node")) continue;
                    String[] parts = line.split(",");
                    if (parts.length >= 4) {
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
                if (!foundName.isEmpty() && cpuName.isEmpty()) cpuName = foundName;
            }
        } catch (Throwable ignored) {}
    }

    // ─── macOS Hardware Detection ──────────────────────────────────────────

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

    private static int runCommandForInt(String... cmd) {
        try {
            Process p = new ProcessBuilder(cmd).start();
            try (BufferedReader r = new BufferedReader(new InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8))) {
                String line = r.readLine();
                if (line != null) return Integer.parseInt(line.trim());
            }
        } catch (Throwable ignored) {}
        return -1;
    }

    private static String runCommandForString(String... cmd) {
        try {
            Process p = new ProcessBuilder(cmd).start();
            try (BufferedReader r = new BufferedReader(new InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8))) {
                String line = r.readLine();
                if (line != null) return line.trim();
            }
        } catch (Throwable ignored) {}
        return "";
    }

    // ─── Public Getters (Optimized & Non-Blocking) ─────────────────────────

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

    public static String getCpuBrand() {
        if (cpuName == null || cpuName.isEmpty()) {
            return System.getProperty("os.arch", "x86_64") + " CPU";
        }
        return cpuName;
    }

    public static String getCpuName() {
        return getCpuBrand();
    }

    /**
     * Total physical RAM of the host machine in bytes.
     */
    public static long getTotalPhysicalMemoryBytes() {
        if (cachedTotalMemoryBytes > 0) {
            return cachedTotalMemoryBytes;
        }

        try {
            var osBean = ManagementFactory.getOperatingSystemMXBean();
            if (osBean instanceof com.sun.management.OperatingSystemMXBean sunBean) {
                long total = sunBean.getTotalMemorySize();
                if (total > 0) {
                    cachedTotalMemoryBytes = total;
                    return total;
                }
            }
        } catch (Throwable ignored) {}

        if (IS_LINUX) {
            long total = parseLinuxMeminfoTotal();
            if (total > 0) {
                cachedTotalMemoryBytes = total;
                return total;
            }
        }

        if (IS_MAC) {
            try {
                long total = Long.parseLong(runCommandForString("sysctl", "-n", "hw.memsize"));
                if (total > 0) {
                    cachedTotalMemoryBytes = total;
                    return total;
                }
            } catch (Throwable ignored) {}
        }

        long fallback = Runtime.getRuntime().maxMemory() * 2;
        return fallback > 0 ? fallback : (8L * 1024 * 1024 * 1024);
    }

    /**
     * Free physical RAM of the host machine in bytes.
     */
    public static long getFreePhysicalMemoryBytes() {
        try {
            var osBean = ManagementFactory.getOperatingSystemMXBean();
            if (osBean instanceof com.sun.management.OperatingSystemMXBean sunBean) {
                long free = sunBean.getFreeMemorySize();
                if (free > 0) return free;
            }
        } catch (Throwable ignored) {}

        if (IS_LINUX) {
            long free = parseLinuxMeminfoAvailable();
            if (free > 0) return free;
        }

        return Runtime.getRuntime().freeMemory();
    }

    /**
     * Genuine physical RAM currently in use by the OS and running processes.
     */
    public static long getUsedPhysicalMemoryBytes() {
        long total = getTotalPhysicalMemoryBytes();
        long free = getFreePhysicalMemoryBytes();
        return Math.max(0, total - free);
    }

    private static long parseLinuxMeminfoTotal() {
        File meminfo = new File("/proc/meminfo");
        if (!meminfo.exists()) return -1;
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(new FileInputStream(meminfo), StandardCharsets.US_ASCII), 1024)) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.startsWith("MemTotal:")) {
                    return parseMeminfoKb(line);
                }
            }
        } catch (Throwable ignored) {}
        return -1;
    }

    private static long parseLinuxMeminfoAvailable() {
        File meminfo = new File("/proc/meminfo");
        if (!meminfo.exists()) return -1;
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(new FileInputStream(meminfo), StandardCharsets.US_ASCII), 1024)) {
            String line;
            long free = -1;
            long buffers = -1;
            long cached = -1;
            while ((line = reader.readLine()) != null) {
                if (line.startsWith("MemAvailable:")) {
                    return parseMeminfoKb(line); // Immediate early return on line ~3
                } else if (line.startsWith("MemFree:")) {
                    free = parseMeminfoKb(line);
                } else if (line.startsWith("Buffers:")) {
                    buffers = parseMeminfoKb(line);
                } else if (line.startsWith("Cached:")) {
                    cached = parseMeminfoKb(line);
                }
            }
            if (free > 0) {
                return free + Math.max(0, buffers) + Math.max(0, cached);
            }
        } catch (Throwable ignored) {}
        return -1;
    }

    private static long parseMeminfoKb(String line) {
        int colon = line.indexOf(':');
        if (colon < 0) return 0;
        int start = colon + 1;
        while (start < line.length() && Character.isWhitespace(line.charAt(start))) {
            start++;
        }
        int end = start;
        while (end < line.length() && Character.isDigit(line.charAt(end))) {
            end++;
        }
        if (start < end) {
            try {
                return Long.parseLong(line.substring(start, end)) * 1024L;
            } catch (NumberFormatException ignored) {}
        }
        return 0;
    }

    /**
     * Genuine host CPU load percent (0.0 to 100.0).
     */
    public static double getCpuLoadPercent() {
        try {
            var osBean = ManagementFactory.getOperatingSystemMXBean();
            if (osBean instanceof com.sun.management.OperatingSystemMXBean sunBean) {
                double load = sunBean.getCpuLoad();
                if (load >= 0) return load * 100.0;
            }
        } catch (Throwable ignored) {}
        return 0.0;
    }

    /**
     * Process-specific native Working Set (Physical RAM) in bytes.
     * On Windows, prioritizes Private Working Set from PSAPI PROCESS_MEMORY_COUNTERS_EX to match Task Manager.
     * On Linux, reads genuine resident set size from /proc/self/status.
     * On macOS, queries POSIX/BSD ps rss for the current process.
     * Universal safe fallback computes total JVM committed heap + non-heap memory.
     */
    private static volatile long lastMacRssQueryTime = 0;
    private static volatile long cachedMacRssBytes = 0;

    /**
     * Process-specific native Working Set (Physical RAM) in bytes.
     * On Windows: Returns WorkingSetSize from PSAPI to match Windows Task Manager's "Memory" column.
     * On Linux: Reads genuine resident set size (VmRSS) from /proc/self/status.
     * On macOS: Queries POSIX/BSD resident set size (RSS) to match Activity Monitor.
     * Universal safe fallback computes active JVM heap used + non-heap memory.
     */
    public static long getProcessWorkingSetBytes() {
        if (IS_WIN) {
            try {
                com.sun.jna.platform.win32.WinNT.HANDLE proc = com.sun.jna.platform.win32.Kernel32.INSTANCE.GetCurrentProcess();
                WinPsapi.PROCESS_MEMORY_COUNTERS_EX counters = new WinPsapi.PROCESS_MEMORY_COUNTERS_EX();
                counters.cb = counters.size();
                if (WinPsapi.INSTANCE.GetProcessMemoryInfo(proc, counters, counters.cb)) {
                    // Windows Task Manager 'Memory' column displays physical WorkingSetSize
                    long ws = counters.WorkingSetSize != null ? counters.WorkingSetSize.longValue() : 0;
                    if (ws > 0) return ws;
                    long priv = counters.PrivateUsage != null ? counters.PrivateUsage.longValue() : 0;
                    if (priv > 0) return priv;
                    long privateCommit = counters.PagefileUsage != null ? counters.PagefileUsage.longValue() : 0;
                    if (privateCommit > 0) return privateCommit;
                }
            } catch (Throwable ignored) {}
        } else if (IS_LINUX) {
            try {
                File status = new File("/proc/self/status");
                if (status.exists()) {
                    try (BufferedReader reader = new BufferedReader(new InputStreamReader(new FileInputStream(status), StandardCharsets.US_ASCII), 1024)) {
                        String line;
                        while ((line = reader.readLine()) != null) {
                            if (line.startsWith("VmRSS:")) {
                                long bytes = parseMeminfoKb(line);
                                if (bytes > 0) return bytes;
                            }
                        }
                    }
                }
            } catch (Throwable ignored) {}
        } else if (IS_MAC) {
            try {
                long now = System.currentTimeMillis();
                if (now - lastMacRssQueryTime < 1000 && cachedMacRssBytes > 0) {
                    return cachedMacRssBytes;
                }
                long pid = ProcessHandle.current().pid();
                int rssKb = runCommandForInt("ps", "-o", "rss=", "-p", String.valueOf(pid));
                if (rssKb > 0) {
                    cachedMacRssBytes = rssKb * 1024L;
                    lastMacRssQueryTime = now;
                    return cachedMacRssBytes;
                }
            } catch (Throwable ignored) {}
        }

        // Cross-platform Fallback: Active Used Memory (Heap used + Non-Heap used)
        try {
            var mem = ManagementFactory.getMemoryMXBean();
            long totalUsed = mem.getHeapMemoryUsage().getUsed() + mem.getNonHeapMemoryUsage().getUsed();
            if (totalUsed > 0) return totalUsed;
        } catch (Throwable ignored) {}

        Runtime rt = Runtime.getRuntime();
        long fallback = rt.totalMemory() - rt.freeMemory();
        return fallback > 0 ? fallback : 1024 * 1024;
    }

    public static long getProcessWorkingSetMB() {
        long bytes = getProcessWorkingSetBytes();
        long mb = bytes / (1024 * 1024);
        return bytes > 0 ? Math.max(1, mb) : 0;
    }

    private interface WinPsapi extends com.sun.jna.win32.StdCallLibrary {
        WinPsapi INSTANCE = com.sun.jna.Native.load("psapi", WinPsapi.class);

        class PROCESS_MEMORY_COUNTERS_EX extends com.sun.jna.Structure {
            public int cb;
            public int PageFaultCount;
            public com.sun.jna.platform.win32.BaseTSD.SIZE_T PeakWorkingSetSize;
            public com.sun.jna.platform.win32.BaseTSD.SIZE_T WorkingSetSize;
            public com.sun.jna.platform.win32.BaseTSD.SIZE_T QuotaPeakPagedPoolUsage;
            public com.sun.jna.platform.win32.BaseTSD.SIZE_T QuotaPagedPoolUsage;
            public com.sun.jna.platform.win32.BaseTSD.SIZE_T QuotaPeakNonPagedPoolUsage;
            public com.sun.jna.platform.win32.BaseTSD.SIZE_T QuotaNonPagedPoolUsage;
            public com.sun.jna.platform.win32.BaseTSD.SIZE_T PagefileUsage;
            public com.sun.jna.platform.win32.BaseTSD.SIZE_T PeakPagefileUsage;
            public com.sun.jna.platform.win32.BaseTSD.SIZE_T PrivateUsage;

            @Override
            protected java.util.List<String> getFieldOrder() {
                return java.util.Arrays.asList(
                        "cb", "PageFaultCount",
                        "PeakWorkingSetSize", "WorkingSetSize",
                        "QuotaPeakPagedPoolUsage", "QuotaPagedPoolUsage",
                        "QuotaPeakNonPagedPoolUsage", "QuotaNonPagedPoolUsage",
                        "PagefileUsage", "PeakPagefileUsage", "PrivateUsage"
                );
            }
        }

        boolean GetProcessMemoryInfo(com.sun.jna.platform.win32.WinNT.HANDLE Process, PROCESS_MEMORY_COUNTERS_EX ppsmemCounters, int cb);
    }

    public static double getTotalMemoryGB() {
        return getTotalPhysicalMemoryBytes() / (1024.0 * 1024.0 * 1024.0);
    }

    public static double getUsedMemoryGB() {
        long total = getTotalPhysicalMemoryBytes();
        long free = getFreePhysicalMemoryBytes();
        return Math.max(0, total - free) / (1024.0 * 1024.0 * 1024.0);
    }
}
