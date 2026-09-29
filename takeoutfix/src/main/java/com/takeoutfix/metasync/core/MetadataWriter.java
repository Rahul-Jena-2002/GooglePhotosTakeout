package com.takeoutfix.metasync.core;

import com.takeoutfix.metasync.model.PhotoPair;
import com.takeoutfix.metasync.model.TagDifference;
import com.takeoutfix.restore.infrastructure.NativeExifToolEngine;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;

/**
 * Executes controlled, selective metadata synchronization from source photos/sidecars to destinations.
 */
public class MetadataWriter {

    private final NativeExifToolEngine engine;
    private final WriteSafetyService safetyService;

    public MetadataWriter(NativeExifToolEngine engine, WriteSafetyService safetyService) {
        this.engine = engine;
        this.safetyService = safetyService;
    }

    /**
     * Synchronizes selected metadata tags from source to destination.
     *
     * @param pair The matched photo pair
     * @param selectedTags List of tags to synchronize
     * @param inPlaceWithBackup If true, modifies destFile in-place after creating a .original backup
     * @param safeOutputDir If inPlaceWithBackup is false, writes copy to this directory
     * @return The target file that was modified/created
     */
    public File syncPair(PhotoPair pair, List<TagDifference> selectedTags,
                         boolean inPlaceWithBackup, File safeOutputDir) throws IOException {
        if (pair == null || pair.getSourceFile() == null || pair.getDestFile() == null) {
            throw new IllegalArgumentException("Invalid PhotoPair: both source and destination must exist.");
        }

        List<TagDifference> activeTags = selectedTags.stream()
                .filter(TagDifference::isSelected)
                .toList();

        if (activeTags.isEmpty()) {
            return pair.getDestFile();
        }

        File targetFile;

        if (inPlaceWithBackup) {
            targetFile = pair.getDestFile();
            safetyService.validateTargetNotRaw(targetFile);
            safetyService.createBackup(targetFile);
        } else {
            if (safeOutputDir == null) {
                safeOutputDir = new File(pair.getDestFile().getParentFile(), "MetaSync_Output");
            }
            safeOutputDir.mkdirs();
            targetFile = new File(safeOutputDir, pair.getDestFile().getName());
            Files.copy(pair.getDestFile().toPath(), targetFile.toPath(), StandardCopyOption.REPLACE_EXISTING);
        }

        // Build ExifTool arguments
        List<String> args = new ArrayList<>();
        args.add("-tagsFromFile");
        args.add(pair.getSourceFile().getAbsolutePath());

        for (TagDifference tag : activeTags) {
            if (MetadataMappingRules.isTagSafeToCopy(tag.getTagKey())) {
                args.add("-" + tag.getTagKey());
            }
        }

        args.add("-overwrite_original");
        args.add(targetFile.getAbsolutePath());

        boolean ok = engine.execute(args);
        if (!ok) {
            throw new IOException("ExifTool command failed while synchronizing metadata for " + pair.getBaseName());
        }

        return targetFile;
    }
}
