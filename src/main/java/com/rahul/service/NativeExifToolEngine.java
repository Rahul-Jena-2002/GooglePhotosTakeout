package com.rahul.service;

import jakarta.annotation.PostConstruct;
import org.springframework.stereotype.Service;

import java.io.*;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import org.apache.commons.compress.archivers.tar.TarArchiveEntry;
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream;
import org.apache.commons.compress.compressors.gzip.GzipCompressorInputStream;

@Service
public class NativeExifToolEngine {

    private File exifToolBinary;

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
            
            if (exifToolBinary != null && !exifToolBinary.exists()) {
                System.err.println("Failed to provision ExifTool!");
            }
        } catch (Exception e) {
            System.err.println("Error initializing ExifTool engine: " + e.getMessage());
            e.printStackTrace();
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
                
                // Keep the 'lib/' directory structure intact for Perl modules
                String relativePath = name;
                if (name.contains("/")) {
                    relativePath = name.substring(name.indexOf("/") + 1); // Remove the top-level 'Image-ExifTool-13.XX/' folder
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

        List<String> command = new ArrayList<>();
        command.add(exifToolBinary.getAbsolutePath());
        command.addAll(args);

        try {
            ProcessBuilder pb = new ProcessBuilder(command);
            pb.directory(exifToolBinary.getParentFile());
            
            // ExifTool uses standard error for warnings, let's capture it.
            Process p = pb.start();
            boolean finished = p.waitFor(30, TimeUnit.SECONDS);
            if (!finished) {
                p.destroyForcibly();
                return false;
            }
            return p.exitValue() == 0;
        } catch (Exception e) {
            System.err.println("ExifTool execution failed: " + e.getMessage());
            return false;
        }
    }
}
