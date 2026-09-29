package com.takeoutfix.metasync.core;

import com.takeoutfix.restore.infrastructure.NativeExifToolEngine;

import java.io.File;
import java.util.*;

/**
 * Extracts normalized metadata tags from image files (RAW, JPEG, TIFF, XMP) using ExifTool.
 */
public class MetadataReader {

    private final NativeExifToolEngine engine;

    public MetadataReader(NativeExifToolEngine engine) {
        this.engine = engine;
    }

    /**
     * Reads all supported photographic metadata tags for a given file.
     */
    public Map<String, String> readTags(File file) {
        Map<String, String> tags = new HashMap<>();
        if (file == null || !file.exists() || engine == null) {
            return tags;
        }

        List<String> args = new ArrayList<>();
        args.add("-s"); // Short tag names: "Tag: Value"
        args.add("-c"); // Decimal degrees for GPS
        args.add("%.6f");

        for (MetadataMappingRules.TagDefinition def : MetadataMappingRules.getSupportedTags()) {
            args.add("-" + def.key());
        }

        args.add(file.getAbsolutePath());

        List<String> lines = engine.executeWithOutput(args);
        for (String line : lines) {
            int colonIdx = line.indexOf(':');
            if (colonIdx > 0) {
                String key = line.substring(0, colonIdx).trim();
                String val = line.substring(colonIdx + 1).trim();
                if (!val.equalsIgnoreCase("-") && !val.isEmpty()) {
                    tags.put(key, val);
                }
            }
        }

        return tags;
    }
}
