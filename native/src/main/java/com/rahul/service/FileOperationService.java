package com.rahul.service;

import org.springframework.stereotype.Service;
import java.io.File;
import java.io.IOException;
import java.nio.file.*;

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
        Files.copy(sourceFile, destinationFile, StandardCopyOption.REPLACE_EXISTING);

        return relativePath;
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
        Files.copy(sourceFile, destinationFile, StandardCopyOption.REPLACE_EXISTING);

        return destinationFile.toFile();
    }

    /**
     * Copies an unmatched media file to the "metadata_not_found" folder in the output directory.
     *
     * @param media The source media file.
     * @param inputRoot The root of the input directory.
     * @param outputRoot The root of the output directory.
     * @throws IOException If the copy operation fails.
     */
    public void copyToUnmatched(File media, File inputRoot, File outputRoot) throws IOException {
        Path sourceFile = media.toPath();
        Path noMetaRoot = outputRoot.toPath().resolve("metadata_not_found");
        Path relativePath = inputRoot.toPath().relativize(sourceFile);
        Path destinationFile = noMetaRoot.resolve(relativePath);

        Files.createDirectories(destinationFile.getParent());
        Files.copy(sourceFile, destinationFile, StandardCopyOption.REPLACE_EXISTING);
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
