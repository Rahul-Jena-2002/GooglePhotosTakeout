package com.rahul.service;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.springframework.stereotype.Service;

import java.io.*;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import org.apache.commons.compress.archivers.tar.TarArchiveEntry;
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream;
import org.apache.commons.compress.compressors.gzip.GzipCompressorInputStream;

@Service
public class NativeExifToolEngine {

    private File exifToolBinary;
    private final BlockingQueue<PersistentExifTool> pool = new LinkedBlockingQueue<>();
    private int activeWorkersCount = 0;

    @PostConstruct
    public void init() {
        try {
            String os = System.getProperty("os.name").toLowerCase();
            Path extractDir = Paths.get(System.getProperty("user.home"), ".gtakeout", "bin");
            Files.createDirectories(extractDir);

            if (os.contains("win")) {
                exifToolBinary = extractWindowsExifTool(extractDir);
            } else {
                exifToolBinary = extractUnixExifTool(extractDir);
            }
            
            if (exifToolBinary != null && exifToolBinary.exists()) {
                int maxProcessors = Runtime.getRuntime().availableProcessors();
                int numWorkers = Math.max(1, (int) Math.round(maxProcessors * 0.80));
                System.out.println("Dynamically initialized ExifTool pool with " + numWorkers + " workers for " + maxProcessors + " detected CPU cores (80% system allocation, 20% OS headroom).");
                for (int i = 0; i < numWorkers; i++) {
                    try {
                        pool.add(new PersistentExifTool(exifToolBinary));
                        activeWorkersCount++;
                    } catch (IOException e) {
                        System.err.println("Failed to start persistent ExifTool worker: " + e.getMessage());
                    }
                }
            } else {
                System.err.println("Failed to provision ExifTool!");
            }
        } catch (Exception e) {
            System.err.println("Error initializing ExifTool engine: " + e.getMessage());
            e.printStackTrace();
        }
    }

    @PreDestroy
    public void cleanup() {
        System.out.println("Cleaning up ExifTool pool...");
        PersistentExifTool worker;
        while ((worker = pool.poll()) != null) {
            worker.destroy();
        }
    }

    private File extractWindowsExifTool(Path extractDir) throws IOException {
        File exe = extractDir.resolve("exiftool.exe").toFile();
        if (exe.exists() && exe.length() > 0) return exe;
        
        try (InputStream is = getClass().getResourceAsStream("/bin/exiftool_win.zip");
             ZipInputStream zis = new ZipInputStream(is)) {
            if (is == null) throw new IOException("exiftool_win.zip not found in resources/bin");
            
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                if (entry.getName().toLowerCase().endsWith(".exe")) {
                    Files.copy(zis, exe.toPath(), StandardCopyOption.REPLACE_EXISTING);
                    break;
                }
            }
        }
        return exe;
    }

    private File extractUnixExifTool(Path extractDir) throws IOException {
        File script = extractDir.resolve("exiftool").toFile();
        if (script.exists() && script.length() > 0) return script;

        try (InputStream is = getClass().getResourceAsStream("/bin/exiftool_unix.tar.gz");
             BufferedInputStream bis = new BufferedInputStream(is);
             GzipCompressorInputStream gzis = new GzipCompressorInputStream(bis);
             TarArchiveInputStream tar = new TarArchiveInputStream(gzis)) {
            if (is == null) throw new IOException("exiftool_unix.tar.gz not found in resources/bin");

            TarArchiveEntry entry;
            while ((entry = (TarArchiveEntry) tar.getNextEntry()) != null) {
                String name = entry.getName();
                if (entry.isDirectory()) continue;
                
                String relativePath = name;
                if (name.contains("/")) {
                    relativePath = name.substring(name.indexOf("/") + 1);
                }

                if (relativePath.equals("exiftool") || relativePath.startsWith("lib/")) {
                    File outFile = extractDir.resolve(relativePath).toFile();
                    outFile.getParentFile().mkdirs();
                    Files.copy(tar, outFile.toPath(), StandardCopyOption.REPLACE_EXISTING);
                    if (relativePath.equals("exiftool")) {
                        outFile.setExecutable(true);
                    }
                }
            }
        }
        return script;
    }

    public boolean execute(List<String> args) {
        if (exifToolBinary == null || !exifToolBinary.exists()) {
            System.err.println("ExifTool binary not available.");
            return false;
        }

        if (activeWorkersCount == 0) {
            return executeFallback(args);
        }

        PersistentExifTool worker = null;
        try {
            // Wait up to 30s for a free worker rather than falling back to slow spawn
            worker = pool.poll(30, TimeUnit.SECONDS);
            if (worker == null) {
                System.err.println("ExifTool pool exhausted after 30s wait — using fallback spawn");
                return executeFallback(args);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        }

        boolean success = false;
        try {
            success = worker.runCommand(args);
            if (!success) {
                worker.destroy();
                try {
                    worker = new PersistentExifTool(exifToolBinary);
                } catch (IOException ex) {
                    worker = null;
                }
            }
        } finally {
            if (worker != null) {
                pool.offer(worker);
            }
        }
        return success;
    }

    private boolean executeFallback(List<String> args) {
        List<String> command = new ArrayList<>();
        command.add(exifToolBinary.getAbsolutePath());
        command.addAll(args);

        try {
            ProcessBuilder pb = new ProcessBuilder(command);
            pb.directory(exifToolBinary.getParentFile());
            Process p = pb.start();
            boolean finished = p.waitFor(10, TimeUnit.SECONDS);
            if (!finished) {
                p.destroyForcibly();
                return false;
            }
            return p.exitValue() == 0;
        } catch (Exception e) {
            System.err.println("ExifTool fallback execution failed: " + e.getMessage());
            return false;
        }
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
                if (process == null || !process.isAlive()) {
                    start();
                }
                for (String arg : args) {
                    writer.write(arg);
                    writer.newLine();
                }
                writer.write("-execute");
                writer.newLine();
                writer.flush();

                // Read response inline — no executor overhead per call
                String line;
                long deadline = System.currentTimeMillis() + 60000;
                while ((line = reader.readLine()) != null) {
                    if (System.currentTimeMillis() > deadline) {
                        destroy();
                        return false;
                    }
                    if (line.trim().startsWith("{ready") || line.trim().equals("{ready}")) {
                        return true;
                    }
                }
                return false;
            } catch (Exception e) {
                destroy();
                return false;
            }
        }

        public void destroy() {
            if (writer != null) {
                try {
                    writer.write("-leave");
                    writer.newLine();
                    writer.write("-execute");
                    writer.newLine();
                    writer.flush();
                } catch (IOException ignored) {}
            }
            if (process != null) {
                process.destroy();
                try {
                    process.waitFor(1, TimeUnit.SECONDS);
                } catch (InterruptedException ignored) {}
                if (process.isAlive()) {
                    process.destroyForcibly();
                }
            }
        }
    }
}
