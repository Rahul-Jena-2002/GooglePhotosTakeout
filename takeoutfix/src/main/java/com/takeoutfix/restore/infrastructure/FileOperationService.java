package com.takeoutfix.restore.infrastructure;

import org.springframework.stereotype.Service;

import java.io.File;
import java.io.IOException;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Instant;
import java.util.UUID;

/**
 * Handles filesystem operations such as copying files and preserving directory structures.
 */
@Service
public class FileOperationService {

    public PrintWriter createRestoreLog(Path outputDirectory) throws IOException {
        Path log = outputDirectory.resolve("restoration_log-" + UUID.randomUUID() + ".log");
        return new PrintWriter(Files.newBufferedWriter(log, StandardCharsets.UTF_8,
                StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE));
    }

    private void prepareOutputDirectory(Path outputRoot, Path directory) throws IOException {
        Path root = outputRoot.toAbsolutePath().normalize();
        Path target = directory.toAbsolutePath().normalize();
        if (!target.startsWith(root)) throw new IOException("Output path leaves the chosen restore folder.");
        Files.createDirectories(root);
        Path realRoot = root.toRealPath();
        if (target.equals(root)) return;
        Path current = root;
        // shortcut: concurrent folder swaps can race these checks; use secure directory handles for adversarial locations.
        for (Path component : root.relativize(target)) {
            current = current.resolve(component);
            try {
                Files.createDirectory(current);
            } catch (FileAlreadyExistsException ignored) {
                // Check existing directories below before writing into them.
            }
            if (Files.isSymbolicLink(current) || !Files.isDirectory(current, LinkOption.NOFOLLOW_LINKS)
                    || !current.toRealPath().startsWith(realRoot)) {
                throw new IOException("Output contains a linked or unsafe folder: " + current);
            }
        }
    }

    public static void requireSeparateDirectories(File input, File output) throws IOException {
        Path source = resolveExistingParents(input.toPath());
        Path destination = resolveExistingParents(output.toPath());
        if (source.startsWith(destination) || destination.startsWith(source)) {
            throw new IOException("Choose a restore folder separate from the source folder.");
        }
    }

    private static Path resolveExistingParents(Path path) throws IOException {
        Path absolute = path.toAbsolutePath().normalize();
        Path existing = absolute;
        while (existing != null && !Files.exists(existing)) existing = existing.getParent();
        if (existing == null) throw new IOException("Cannot resolve the selected folder.");
        return existing.toRealPath().resolve(existing.relativize(absolute)).normalize();
    }

    public Path createArchiveCopy(File source) throws IOException {
        Path temporary = Files.createTempFile("takeoutfix-archive-", ".media");
        try {
            Files.copy(source.toPath(), temporary, StandardCopyOption.REPLACE_EXISTING);
            return temporary;
        } catch (IOException | RuntimeException e) {
            try {
                Files.deleteIfExists(temporary);
            } catch (IOException cleanupError) {
                e.addSuppressed(cleanupError);
            }
            throw e;
        }
    }

    public File createArchiveTemp(File source) throws IOException {
        String name = source.getName();
        int dot = name.lastIndexOf('.');
        String extension = dot >= 0 && name.length() - dot <= 16 ? name.substring(dot) : ".tmp";
        return File.createTempFile("takeoutfix-", extension);
    }

    public Path createArchivePart(Path outputDirectory, int part) throws IOException {
        return Files.createTempFile(outputDirectory, "Restored_Takeout_Part" + part + "-", ".zip.partial");
    }

    public Path finishArchivePart(Path partial, int part) throws IOException {
        String base = "Restored_Takeout_Part" + part;
        for (int suffix = 0; ; suffix++) {
            String name = base + (suffix == 0 ? "" : " (" + suffix + ")") + ".zip";
            try {
                return Files.move(partial, partial.resolveSibling(name));
            } catch (FileAlreadyExistsException ignored) {
                // Try another name without replacing an existing archive.
            }
        }
    }

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

        prepareOutputDirectory(outputRoot.toPath(), destinationFile.getParent());
        fastCopy(sourceFile, destinationFile);

        return relativePath;
    }

    /**
     * Fast zero-copy file transfer using NIO FileChannel.
     */
    public void fastCopy(Path src, Path dst) throws IOException {
        try (java.nio.channels.FileChannel in = java.nio.channels.FileChannel.open(src, StandardOpenOption.READ)) {
            java.nio.channels.FileChannel out = java.nio.channels.FileChannel.open(dst, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE);
            try (out) {
                long size = in.size();
                long position = 0;
                while (position < size) {
                    long transferred = in.transferTo(position, size - position, out);
                    if (transferred <= 0) throw new IOException("Copy stopped before the entire source file was written.");
                    position += transferred;
                }
            } catch (IOException error) {
                throw new IOException("Could not finish copying " + src + ". A partial file may remain at " + dst + ".", error);
            }
        }
    }

    /**
     * Copies a media file preserving its original album/subfolder structure from inputRoot,
     * and creating year/month subfolders inside that album
     * (e.g. outputRoot/AlbumName/2023/08/photo.jpg), automatically resolving duplicate collisions.
     *
     * @param media The source media file.
     * @param inputRoot The root of the input directory.
     * @param outputRoot The root of the output directory.
     * @param timestamp The resolved capture timestamp (or null if unknown).
     * @return The resolved File at the destination.
     * @throws IOException If the copy operation fails.
     */
    public File copyToChronologicalOutput(File media, File inputRoot, File outputRoot, Instant timestamp) throws IOException {
        Path relativeParent = null;
        try {
            Path rel = inputRoot.toPath().relativize(media.toPath());
            relativeParent = rel.getParent();
        } catch (Exception ignored) {}

        Path targetDir;
        if (relativeParent != null && !relativeParent.toString().isEmpty()) {
            targetDir = datedDirectory(outputRoot.toPath().resolve(relativeParent), timestamp);
        } else {
            targetDir = datedDirectory(outputRoot.toPath(), timestamp);
        }

        prepareOutputDirectory(outputRoot.toPath(), targetDir);
        Path destPath = resolveUniqueDestination(targetDir, media.getName());
        fastCopy(media.toPath(), destPath);
        return destPath.toFile();
    }

    public File copyToChronologicalOutput(File media, File outputRoot, Instant timestamp) throws IOException {
        return copyToChronologicalOutput(media, media.getParentFile() != null ? media.getParentFile() : outputRoot, outputRoot, timestamp);
    }

    public File copyToChronologicalFolder(File media, File inputRoot, File outputRoot, String subFolder, Instant timestamp) throws IOException {
        Path relativeParent = null;
        try {
            Path rel = inputRoot.toPath().relativize(media.toPath());
            relativeParent = rel.getParent();
        } catch (Exception ignored) {}

        Path baseDir = outputRoot.toPath().resolve(subFolder);
        Path targetDir;
        if (relativeParent != null && !relativeParent.toString().isEmpty()) {
            targetDir = datedDirectory(baseDir.resolve(relativeParent), timestamp);
        } else {
            targetDir = datedDirectory(baseDir, timestamp);
        }

        prepareOutputDirectory(outputRoot.toPath(), targetDir);
        Path destPath = resolveUniqueDestination(targetDir, media.getName());
        fastCopy(media.toPath(), destPath);
        return destPath.toFile();
    }

    public File copyToChronologicalFolder(File media, File outputRoot, String subFolder, Instant timestamp) throws IOException {
        return copyToChronologicalFolder(media, media.getParentFile() != null ? media.getParentFile() : outputRoot, outputRoot, subFolder, timestamp);
    }

    private Path datedDirectory(Path base, Instant timestamp) {
        if (timestamp == null) return base.resolve("Unknown_Date");
        java.time.ZonedDateTime date = timestamp.atZone(java.time.ZoneId.systemDefault());
        return base.resolve(String.format(java.util.Locale.ROOT, "%04d", date.getYear()))
                .resolve(String.format(java.util.Locale.ROOT, "%02d", date.getMonthValue()));
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

        prepareOutputDirectory(outputRoot.toPath(), destinationFile.getParent());
        fastCopy(sourceFile, destinationFile);

        return destinationFile.toFile();
    }

    public File copyToUnmatched(File media, File inputRoot, File outputRoot) throws IOException {
        Path sourceFile = media.toPath();
        Path noMetaRoot = outputRoot.toPath().resolve("metadata_not_found");
        Path relativePath = inputRoot.toPath().relativize(sourceFile);
        Path destinationFile = noMetaRoot.resolve(relativePath);

        prepareOutputDirectory(outputRoot.toPath(), destinationFile.getParent());
        fastCopy(sourceFile, destinationFile);
        return destinationFile.toFile();
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
        if (directoryToBeDeleted == null || !directoryToBeDeleted.exists()) {
            return false;
        }
        // Safety boundary check: Never delete a filesystem root or top-level directory
        java.nio.file.Path normalized = directoryToBeDeleted.toPath().toAbsolutePath().normalize();
        if (normalized.getNameCount() <= 1) {
            System.err.println("[SECURITY] Refusing to delete root or top-level directory: " + normalized);
            return false;
        }
        File[] allContents = directoryToBeDeleted.listFiles();
        if (allContents != null) {
            for (File file : allContents) {
                deleteDirectory(file);
            }
        }
        return directoryToBeDeleted.delete();
    }
}
