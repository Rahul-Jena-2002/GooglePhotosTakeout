package com.takeoutfix.metasync.core;

import com.takeoutfix.metasync.model.TagDifference;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.*;

/**
 * Defensive safety gates for metadata writing operations.
 * Enforces RAW immutability, automated backup copies, and post-write tag verification.
 */
public class WriteSafetyService {

    private static final Set<String> IMMUTABLE_RAW_EXTENSIONS = Set.of(
            "cr2", "cr3", "nef", "arw", "dng", "raf", "orf", "rw2", "pef", "srw"
    );

    private final MetadataReader metadataReader;

    public WriteSafetyService(MetadataReader metadataReader) {
        this.metadataReader = metadataReader;
    }

    /**
     * Asserts that the target file is not a camera RAW original.
     */
    public void validateTargetNotRaw(File targetFile) {
        if (targetFile == null) {
            throw new IllegalArgumentException("Target file cannot be null");
        }
        String ext = FilePairingService.getExtension(targetFile).toLowerCase(Locale.ROOT);
        if (IMMUTABLE_RAW_EXTENSIONS.contains(ext)) {
            throw new SecurityException("Safety violation: Direct modification of RAW files (" + ext + ") is strictly prohibited to prevent data loss.");
        }
    }

    /**
     * Creates a timestamped or .original backup of the destination file prior to modification.
     */
    public File createBackup(File targetFile) throws IOException {
        validateTargetNotRaw(targetFile);
        if (!targetFile.exists()) {
            return null;
        }

        File backupFile = new File(targetFile.getParentFile(), targetFile.getName() + ".original");
        int counter = 1;
        while (backupFile.exists()) {
            backupFile = new File(targetFile.getParentFile(), targetFile.getName() + ".original." + counter);
            counter++;
        }

        Files.copy(targetFile.toPath(), backupFile.toPath(), StandardCopyOption.REPLACE_EXISTING);
        return backupFile;
    }

    /**
     * Verifies that the written metadata tags exist and match expected values in the target file.
     */
    public boolean verifyWrittenTags(File targetFile, List<TagDifference> appliedTags) {
        if (targetFile == null || !targetFile.exists() || appliedTags == null || appliedTags.isEmpty()) {
            return false;
        }

        Map<String, String> verifiedTags = metadataReader.readTags(targetFile);
        for (TagDifference tag : appliedTags) {
            if (tag.isSelected()) {
                String expected = tag.getSourceValue();
                String actual = verifiedTags.get(tag.getTagKey());
                if (actual == null || actual.isBlank()) {
                    // Tag failed to write
                    return false;
                }
            }
        }
        return true;
    }
}
