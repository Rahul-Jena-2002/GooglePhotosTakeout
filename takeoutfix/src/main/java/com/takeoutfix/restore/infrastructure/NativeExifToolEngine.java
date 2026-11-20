package com.takeoutfix.restore.infrastructure;

import java.io.*;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.StandardOpenOption;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import org.apache.commons.compress.archivers.tar.TarArchiveEntry;
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream;
import org.apache.commons.compress.compressors.gzip.GzipCompressorInputStream;

public class NativeExifToolEngine {

    private static final Object PROVISION_LOCK = new Object();

    private static volatile NativeExifToolEngine defaultInstance;
    private static final java.util.concurrent.ScheduledExecutorService COMMAND_TIMEOUTS =
            java.util.concurrent.Executors.newSingleThreadScheduledExecutor(r -> {
                Thread thread = new Thread(r, "ExifTool-CommandTimeout");
                thread.setDaemon(true);
                return thread;
            });

    public static NativeExifToolEngine getDefault() {
        if (defaultInstance == null) {
            synchronized (NativeExifToolEngine.class) {
                if (defaultInstance == null) {
                    defaultInstance = new NativeExifToolEngine();
                }
            }
        }
        return defaultInstance;
    }

    private File exifToolBinary;
    private final BlockingQueue<PersistentExifTool> pool = new LinkedBlockingQueue<>();
    private volatile int maxWorkers = Math.max(2, Math.min(8, Runtime.getRuntime().availableProcessors()));
    private final java.util.concurrent.atomic.AtomicInteger currentWorkers = new java.util.concurrent.atomic.AtomicInteger(0);
    private final java.util.concurrent.ScheduledExecutorService idleReaper = java.util.concurrent.Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "ExifTool-IdleReaper");
        t.setDaemon(true);
        return t;
    });
    private volatile long lastExecutionTime = System.currentTimeMillis();

    public NativeExifToolEngine() {
        init();
    }

    public void init() {
        try {
            String os = System.getProperty("os.name").toLowerCase();
            Path extractDir = Paths.get(System.getProperty("user.home"), ".takeoutfix", "bin");
            Files.createDirectories(extractDir);

            boolean windows = os.contains("win") && !os.contains("darwin");
            String resource = windows ? "/bin/exiftool_win.zip" : "/bin/exiftool_unix.tar.gz";
            String fingerprint;
            try (InputStream source = getClass().getResourceAsStream(resource)) {
                if (source == null) throw new IOException("Bundled ExifTool archive is missing: " + resource);
                fingerprint = archiveFingerprint(source);
            }
            try (InputStream source = getClass().getResourceAsStream(resource)) {
                if (source == null) throw new IOException("Bundled ExifTool archive is missing: " + resource);
                exifToolBinary = provisionBundledArchive(extractDir, windows, fingerprint, source).toFile();
            }
            
            if (exifToolBinary != null && exifToolBinary.exists()) {
                Runtime.getRuntime().addShutdownHook(new Thread(this::cleanup));
                // Periodic idle reaper: if idle for > 45 seconds, cull any background Perl workers
                idleReaper.scheduleWithFixedDelay(() -> {
                    try {
                        if (currentWorkers.get() > 0 && (System.currentTimeMillis() - lastExecutionTime) > 45000) {
                            cullIdleWorkers();
                        }
                    } catch (Throwable ignored) {}
                }, 30, 30, TimeUnit.SECONDS);
            } else {
                System.err.println("Failed to provision ExifTool!");
            }
        } catch (Exception e) {
            System.err.println("Error initializing ExifTool engine: " + e.getMessage());
            e.printStackTrace();
        }
    }

    public File getExifToolBinary() {
        return exifToolBinary;
    }

    public int getMaxWorkers() {
        return maxWorkers;
    }

    public void setMaxWorkers(int limit) {
        this.maxWorkers = Math.max(1, limit);
    }

    public synchronized void cullIdleWorkers() {
        PersistentExifTool worker;
        while ((worker = pool.poll()) != null) {
            worker.destroy();
            currentWorkers.decrementAndGet();
        }
        if (currentWorkers.get() < 0) {
            currentWorkers.set(0);
        }
    }

    public synchronized void cleanup() {
        try {
            idleReaper.shutdownNow();
        } catch (Throwable ignored) {}
        cullIdleWorkers();
    }

    static String archiveFingerprint(InputStream source) throws IOException {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] buffer = new byte[65536];
            int count;
            while ((count = source.read(buffer)) != -1) digest.update(buffer, 0, count);
            return HexFormat.of().formatHex(digest.digest());
        } catch (NoSuchAlgorithmException error) {
            throw new IOException("SHA-256 is unavailable.", error);
        }
    }

    static Path provisionBundledArchive(Path base, boolean windows, String fingerprint, InputStream source) throws IOException {
        if (fingerprint == null || !fingerprint.matches("[0-9a-f]{64}")) throw new IOException("Invalid archive fingerprint.");
        Files.createDirectories(base);
        // shortcut: old tool versions remain on disk, add cleanup when other running processes can be identified safely.
        Path target = base.resolve((windows ? "exiftool-win-" : "exiftool-unix-") + fingerprint.substring(0, 32));
        String executable = windows ? "exiftool.exe" : "exiftool";
        String support = windows ? "exiftool_files" : "lib";
        synchronized (PROVISION_LOCK) {
            try (FileChannel channel = FileChannel.open(base.resolve(".exiftool-provision.lock"), StandardOpenOption.CREATE, StandardOpenOption.WRITE);
                 FileLock ignored = channel.lock()) {
                if (Files.exists(target)) {
                    Path marker = target.resolve(".ready");
                    if (Files.isRegularFile(marker) && Files.readString(marker).equals(fingerprint)
                            && Files.isRegularFile(target.resolve(executable)) && Files.size(target.resolve(executable)) > 0
                            && Files.isDirectory(target.resolve(support))) {
                        return target.resolve(executable);
                    }
                    throw new IOException("The saved ExifTool installation is incomplete. Close TakeoutFix and remove the affected tool folder before retrying: " + target);
                }
                Path staging = Files.createTempDirectory(base, ".exiftool-staging-");
                try {
                    if (windows) extractWindowsArchive(source, staging); else extractUnixArchive(source, staging);
                    Path binary = staging.resolve(executable);
                    if (!Files.isRegularFile(binary) || Files.size(binary) == 0 || !Files.isDirectory(staging.resolve(support)) || (!windows && !Files.isExecutable(binary))) {
                        throw new IOException("The bundled ExifTool archive is incomplete.");
                    }
                    Files.writeString(staging.resolve(".ready"), fingerprint);
                    try {
                        Files.move(staging, target, StandardCopyOption.ATOMIC_MOVE);
                    } catch (AtomicMoveNotSupportedException error) {
                        Files.move(staging, target);
                    }
                    return target.resolve(executable);
                } finally {
                    if (Files.exists(staging)) {
                        try (var paths = Files.walk(staging)) {
                            for (Path path : paths.sorted(java.util.Comparator.reverseOrder()).toList()) Files.deleteIfExists(path);
                        }
                    }
                }
            }
        }
    }

    static void extractWindowsArchive(InputStream source, Path extractDir) throws IOException {
        try (ZipInputStream zis = new ZipInputStream(source)) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                File outFile = resolveBundledPath(extractDir, entry.getName()).toFile();
                if (entry.isDirectory()) {
                    Files.createDirectories(outFile.toPath());
                } else {
                    Files.createDirectories(outFile.getParentFile().toPath());
                    Files.copy(zis, outFile.toPath(), StandardCopyOption.REPLACE_EXISTING);
                }
                zis.closeEntry();
            }
        }
    }

    static void extractUnixArchive(InputStream source, Path extractDir) throws IOException {
        try (GzipCompressorInputStream gzis = new GzipCompressorInputStream(source);
             TarArchiveInputStream tar = new TarArchiveInputStream(gzis)) {
            TarArchiveEntry entry;
            while ((entry = tar.getNextTarEntry()) != null) {
                String name = entry.getName();
                int slash = name.indexOf('/');
                String relativePath = (slash != -1) ? name.substring(slash + 1) : name;
                if (relativePath.isEmpty()) continue;

                if (relativePath.equals("exiftool") || relativePath.startsWith("lib/")) {
                    File outFile = resolveBundledPath(extractDir, relativePath).toFile();
                    if (entry.isDirectory()) {
                        Files.createDirectories(outFile.toPath());
                        continue;
                    }
                    if (!entry.isFile()) throw new IOException("Unsupported entry in the bundled ExifTool archive: " + relativePath);
                    Files.createDirectories(outFile.getParentFile().toPath());
                    Files.copy(tar, outFile.toPath(), StandardCopyOption.REPLACE_EXISTING);
                    if (relativePath.equals("exiftool")) {
                        outFile.setExecutable(true);
                    }
                }
            }
        }
    }

    static Path resolveBundledPath(Path root, String name) throws IOException {
        if (name == null || name.isBlank() || name.indexOf('\\') >= 0) throw new IOException("Invalid bundled archive path.");
        Path base = root.toAbsolutePath().normalize();
        Path destination = base.resolve(name).normalize();
        if (!destination.startsWith(base) || destination.equals(base)) throw new IOException("Bundled archive path escapes its destination.");
        return destination;
    }

    public boolean execute(List<String> args) {
        if (exifToolBinary == null || !exifToolBinary.exists()) {
            System.err.println("ExifTool binary not available.");
            return false;
        }

        lastExecutionTime = System.currentTimeMillis();

        PersistentExifTool worker = pool.poll();
        if (worker == null) {
            if (currentWorkers.get() < maxWorkers) {
                synchronized (this) {
                    if (currentWorkers.get() < maxWorkers) {
                        try {
                            worker = new PersistentExifTool(exifToolBinary);
                            currentWorkers.incrementAndGet();
                        } catch (IOException e) {
                            System.err.println("Failed to spawn on-demand ExifTool worker: " + e.getMessage());
                        }
                    }
                }
            }
        }

        if (worker == null) {
            // Apply controlled backpressure: wait for active workers to complete disk writes
            long deadline = System.currentTimeMillis() + 60_000L;
            while (worker == null && System.currentTimeMillis() < deadline) {
                try {
                    worker = pool.poll(5, TimeUnit.SECONDS);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    return false;
                }
            }
            if (worker == null) {
                System.err.println("ExifTool workers busy after 60s backpressure wait — running single fallback");
                return executeFallback(args);
            }
        }

        boolean success = false;
        try {
            success = worker.runCommand(args);
            if (!success) {
                worker.destroy();
                currentWorkers.decrementAndGet();
                worker = null;
            }
        } finally {
            if (worker != null) {
                if (currentWorkers.get() > maxWorkers) {
                    worker.destroy();
                    currentWorkers.decrementAndGet();
                } else {
                    pool.offer(worker);
                }
            }
        }
        return success;
    }

    private boolean executeFallback(List<String> args) {
        List<String> command = new ArrayList<>();
        command.add(exifToolBinary.getAbsolutePath());
        command.addAll(args);

        Process p = null;
        try {
            ProcessBuilder pb = new ProcessBuilder(command);
            pb.directory(exifToolBinary.getParentFile());
            pb.redirectOutput(ProcessBuilder.Redirect.DISCARD);
            pb.redirectError(ProcessBuilder.Redirect.DISCARD);
            p = pb.start();
            boolean finished = p.waitFor(10, TimeUnit.SECONDS);
            if (!finished) {
                p.destroyForcibly();
                return false;
            }
            return p.exitValue() == 0;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        } catch (Exception e) {
            System.err.println("ExifTool fallback execution failed: " + e.getMessage());
            return false;
        } finally {
            if (p != null && p.isAlive()) p.destroyForcibly();
        }
    }

    public List<String> executeWithOutput(List<String> args) {
        if (exifToolBinary == null || !exifToolBinary.exists()) {
            return List.of();
        }

        List<String> command = new ArrayList<>();
        command.add(exifToolBinary.getAbsolutePath());
        command.addAll(args);

        Process process = null;
        try {
            ProcessBuilder pb = new ProcessBuilder(command);
            pb.directory(exifToolBinary.getParentFile());
            pb.redirectError(ProcessBuilder.Redirect.DISCARD);
            process = pb.start();
            return readProcessOutput(process, 10_000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return List.of();
        } catch (Exception e) {
            System.err.println("ExifTool executeWithOutput failed: " + e.getMessage());
            return List.of();
        } finally {
            if (process != null && process.isAlive()) process.destroyForcibly();
        }
    }

    static List<String> readProcessOutput(Process process, long timeoutMillis) throws IOException, InterruptedException {
        Object lock = new Object();
        boolean[] finished = { false };
        boolean[] timedOut = { false };
        long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMillis);
        var timeout = COMMAND_TIMEOUTS.schedule(() -> {
            synchronized (lock) {
                if (!finished[0]) {
                    timedOut[0] = true;
                    process.destroyForcibly();
                }
            }
        }, timeoutMillis, TimeUnit.MILLISECONDS);
        try {
            List<String> output = new ArrayList<>();
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream(), java.nio.charset.StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    if (!line.isBlank()) output.add(line.trim());
                }
            }
            long remaining = Math.max(0, deadline - System.nanoTime());
            if (!process.waitFor(remaining, TimeUnit.NANOSECONDS)) return List.of();
            synchronized (lock) {
                if (timedOut[0] || process.exitValue() != 0) return List.of();
                finished[0] = true;
            }
            return output;
        } finally {
            synchronized (lock) { finished[0] = true; }
            timeout.cancel(false);
        }
    }

    static boolean readCommandStatus(BufferedReader reader, long deadlineMillis) throws IOException {
        String line;
        Boolean success = null;
        while ((line = reader.readLine()) != null) {
            if (System.currentTimeMillis() > deadlineMillis) return false;
            String value = line.trim();
            if (value.startsWith("TAKEOUTFIX_STATUS=")) {
                success = value.equals("TAKEOUTFIX_STATUS=0");
            } else if (value.equals("{ready}")) {
                return Boolean.TRUE.equals(success);
            }
        }
        return false;
    }

    static boolean readCommandStatusWithTimeout(BufferedReader reader, Process process, long timeoutMillis) throws IOException {
        Object lock = new Object();
        boolean[] finished = { false };
        var timeout = COMMAND_TIMEOUTS.schedule(() -> {
            synchronized (lock) {
                if (!finished[0]) process.destroyForcibly();
            }
        }, timeoutMillis, TimeUnit.MILLISECONDS);
        try {
            return readCommandStatus(reader, System.currentTimeMillis() + timeoutMillis);
        } finally {
            synchronized (lock) { finished[0] = true; }
            timeout.cancel(false);
        }
    }

    static void terminateProcess(Process process) {
        if (process == null) return;
        process.destroy();
        try {
            process.waitFor(1, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        if (process.isAlive()) process.destroyForcibly();
    }

    private static class PersistentExifTool {
        private final File binary;
        private Process process;
        private BufferedReader reader;
        private BufferedWriter writer;

        public PersistentExifTool(File binary) throws IOException {
            this.binary = binary;
            start();
        }

        private void start() throws IOException {
            List<String> command = new ArrayList<>();
            command.add(binary.getAbsolutePath());
            command.add("-stay_open");
            command.add("True");
            command.add("-@");
            command.add("-");

            ProcessBuilder pb = new ProcessBuilder(command);
            pb.directory(binary.getParentFile());
            pb.redirectErrorStream(true);
            this.process = pb.start();

            this.reader = new BufferedReader(new InputStreamReader(process.getInputStream(), "UTF-8"));
            this.writer = new BufferedWriter(new OutputStreamWriter(process.getOutputStream(), "UTF-8"));
        }

        public boolean runCommand(List<String> args) {
            try {
                for (String arg : args) {
                    if (arg == null || arg.indexOf('\n') >= 0 || arg.indexOf('\r') >= 0) return false;
                }
                if (process == null || !process.isAlive()) {
                    start();
                }
                for (String arg : args) {
                    writer.write(arg);
                    writer.newLine();
                }
                writer.write("-echo3");
                writer.newLine();
                writer.write("TAKEOUTFIX_STATUS=${status}");
                writer.newLine();
                writer.write("-execute");
                writer.newLine();
                writer.flush();

                return readCommandStatusWithTimeout(reader, process, 60000);
            } catch (Exception e) {
                destroy();
                return false;
            }
        }

        public void destroy() {
            terminateProcess(process);
        }
    }
}
