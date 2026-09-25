package com.takeoutfix.restore.infrastructure;

import org.springframework.stereotype.Service;

import java.io.File;
import java.io.IOException;
import java.nio.file.*;
import java.time.Instant;

/**
 * Handles filesystem operations such as copying files and preserving directory structures.
 */
@Service
public class FileOperationService {

    /**
     * Copies a media file to the output folder, preserving its original directory structure.
     *
     * @param media The source media file.
     * @param inputRoot The root of the input directory.
     * @param outputRoot The root of the output directory.
     * @return The relative path of the copied file.
     * @throws IOException If the copy operation fails.
     */
    public Path copyToOutput(File media, File inputRoot, File outputRoot) throws IOException {
        Path sourceFile = media.toPath();
        Path relativePath = inputRoot.toPath().relativize(sourceFile);
        Path destinationFile = outputRoot.toPath().resolve(relativePath);

        Files.createDirectories(destinationFile.getParent());
        fastCopy(sourceFile, destinationFile);

        return relativePath;
    }

    /**
     * Fast zero-copy file transfer using NIO FileChannel.
     */
    public void fastCopy(Path src, Path dst) throws IOException {
        try (java.nio.channels.FileChannel in = java.nio.channels.FileChannel.open(src, StandardOpenOption.READ);
             java.nio.channels.FileChannel out = java.nio.channels.FileChannel.open(dst, StandardOpenOption.CREATE, StandardOpenOption.WRITE, StandardOpenOption.TRUNCATE_EXISTING)) {
            long size = in.size();
            long position = 0;
            while (position < size) {
                long transferred = in.transferTo(position, size - position, out);
                if (transferred <= 0) break;
                position += transferred;
            }
        }
    }

    /**
     * Copies a media file preserving its original album/subfolder structure from inputRoot,
     * and creating a clean chronological Month-Year subfolder inside that album
     * (e.g. outputRoot/AlbumName/2023-08/photo.jpg), automatically resolving duplicate collisions.
     *
     * @param media The source media file.
     * @param inputRoot The root of the input directory.
     * @param outputRoot The root of the output directory.
     * @param timestamp The resolved capture timestamp (or null if unknown).
     * @return The resolved File at the destination.
     * @throws IOException If the copy operation fails.
     */
    public File copyToChronologicalOutput(File media, File inputRoot, File outputRoot, Instant timestamp) throws IOException {
        String yearMonth = "Unknown_Date";
        if (timestamp != null) {
            java.time.ZonedDateTime zdt = timestamp.atZone(java.time.ZoneId.systemDefault());
            yearMonth = String.format("%04d-%02d", zdt.getYear(), zdt.getMonthValue());
        }

        Path relativeParent = null;
        try {
            Path rel = inputRoot.toPath().relativize(media.toPath());
            relativeParent = rel.getParent();
        } catch (Exception ignored) {}

        Path targetDir;
        if (relativeParent != null && !relativeParent.toString().isEmpty()) {
            targetDir = outputRoot.toPath().resolve(relativeParent).resolve(yearMonth);
        } else {
            targetDir = outputRoot.toPath().resolve(yearMonth);
        }

        Files.createDirectories(targetDir);
        Path destPath = resolveUniqueDestination(targetDir, media.getName());
        fastCopy(media.toPath(), destPath);
        return destPath.toFile();
    }

    public File copyToChronologicalOutput(File media, File outputRoot, Instant timestamp) throws IOException {
        return copyToChronologicalOutput(media, media.getParentFile() != null ? media.getParentFile() : outputRoot, outputRoot, timestamp);
    }

    public File copyToChronologicalFolder(File media, File inputRoot, File outputRoot, String subFolder, Instant timestamp) throws IOException {
        String yearMonth = "Unknown_Date";
        if (timestamp != null) {
            java.time.ZonedDateTime zdt = timestamp.atZone(java.time.ZoneId.systemDefault());
            yearMonth = String.format("%04d-%02d", zdt.getYear(), zdt.getMonthValue());
        }

        Path relativeParent = null;
        try {
            Path rel = inputRoot.toPath().relativize(media.toPath());
            relativeParent = rel.getParent();
        } catch (Exception ignored) {}

        Path baseDir = outputRoot.toPath().resolve(subFolder);
        Path targetDir;
        if (relativeParent != null && !relativeParent.toString().isEmpty()) {
            targetDir = baseDir.resolve(relativeParent).resolve(yearMonth);
        } else {
            targetDir = baseDir.resolve(yearMonth);
        }

        Files.createDirectories(targetDir);
        Path destPath = resolveUniqueDestination(targetDir, media.getName());
        fastCopy(media.toPath(), destPath);
        return destPath.toFile();
    }

    public File copyToChronologicalFolder(File media, File outputRoot, String subFolder, Instant timestamp) throws IOException {
        return copyToChronologicalFolder(media, media.getParentFile() != null ? media.getParentFile() : outputRoot, outputRoot, subFolder, timestamp);
    }

    private Path resolveUniqueDestination(Path targetDir, String originalFilename) {
        Path target = targetDir.resolve(originalFilename);
        if (!Files.exists(target)) {
            return target;
        }

        String base = originalFilename;
        String ext = "";
        int dot = originalFilename.lastIndexOf('.');
        if (dot > 0) {
            base = originalFilename.substring(0, dot);
            ext = originalFilename.substring(dot);
        }

        int count = 1;
        while (Files.exists(target)) {
            target = targetDir.resolve(base + " (" + count + ")" + ext);
            count++;
        }
        return target;
    }

    /**
     * Copies an estimated/interpolated media file to the "estimated_metadata" folder in the output directory.
     *
     * @param media The source media file.
     * @param inputRoot The root of the input directory.
     * @param outputRoot The root of the output directory.
     * @return The copied destination file.
     * @throws IOException If the copy operation fails.
     */
    public File copyToEstimated(File media, File inputRoot, File outputRoot) throws IOException {
        Path sourceFile = media.toPath();
        Path estimatedRoot = outputRoot.toPath().resolve("estimated_metadata");
        Path relativePath = inputRoot.toPath().relativize(sourceFile);
        Path destinationFile = estimatedRoot.resolve(relativePath);

        Files.createDirectories(destinationFile.getParent());
        fastCopy(sourceFile, destinationFile);

        return destinationFile.toFile();
    }

    public void copyToUnmatched(File media, File inputRoot, File outputRoot) throws IOException {
        Path sourceFile = media.toPath();
        Path noMetaRoot = outputRoot.toPath().resolve("metadata_not_found");
        Path relativePath = inputRoot.toPath().relativize(sourceFile);
        Path destinationFile = noMetaRoot.resolve(relativePath);

        Files.createDirectories(destinationFile.getParent());
        fastCopy(sourceFile, destinationFile);
    }

    /**
     * A safe wrapper for copyToUnmatched that catches and ignores exceptions.
     */
    public void copyToUnmatchedSafe(File media, File inputRoot, File outputRoot) {
        try {
            copyToUnmatched(media, inputRoot, outputRoot);
        } catch (Exception ignored) {
            // Secondary operation failure should not crash the main loop.
        }
    }

    /**
     * Recursively deletes a directory and its contents.
     *
     * @param directoryToBeDeleted The root directory to delete.
     * @return true if successfully deleted.
     */
    public boolean deleteDirectory(File directoryToBeDeleted) {
        File[] allContents = directoryToBeDeleted.listFiles();
        if (allContents != null) {
            for (File file : allContents) {
                deleteDirectory(file);
            }
        }
        return directoryToBeDeleted.delete();
    }
}
