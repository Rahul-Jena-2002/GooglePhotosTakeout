package com.takeoutfix.metasync.core;

import com.takeoutfix.metasync.model.PhotoPair;

import java.io.File;
import java.util.*;
import java.util.regex.Pattern;

/**
 * Discovers and pairs RAW photo originals with their corresponding JPEG exports and XMP sidecars.
 */
public class FilePairingService {

    private static final Set<String> RAW_EXTENSIONS = Set.of(
            "cr2", "cr3", "nef", "arw", "dng", "raf", "orf", "rw2", "pef", "srw"
    );

    private static final Set<String> EXPORT_EXTENSIONS = Set.of(
            "jpg", "jpeg", "tif", "tiff", "heic"
    );

    // Common export suffix patterns (e.g., _edited, -Enhanced-NR, _v1, -1)
    private static final Pattern SUFFIX_PATTERN = Pattern.compile(
            "([_-](?:edited|edit|enhanced(?:-nr)?|export|v\\d+|\\d+))$",
            Pattern.CASE_INSENSITIVE
    );

    /**
     * Pairs files within a single folder or across separate RAW and JPEG folders.
     */
    public List<PhotoPair> pairFolders(File rawFolder, File exportFolder) {
        List<PhotoPair> pairs = new ArrayList<>();
        if (rawFolder == null || !rawFolder.exists()) {
            return pairs;
        }

        File effectiveExportFolder = (exportFolder != null && exportFolder.exists()) ? exportFolder : rawFolder;

        Map<String, File> rawMap = new LinkedHashMap<>();
        Map<String, File> xmpMap = new HashMap<>();

        // Index RAWs and XMPs
        indexSourceFolder(rawFolder, rawMap, xmpMap);

        // Index Exports
        Map<String, File> exportMap = new HashMap<>();
        indexExportFolder(effectiveExportFolder, exportMap);

        // Pair RAWs with exports
        Set<String> matchedExportKeys = new HashSet<>();

        for (Map.Entry<String, File> entry : rawMap.entrySet()) {
            String rawKey = entry.getKey();
            File rawFile = entry.getValue();
            File xmpFile = xmpMap.get(rawKey);

            File matchingExport = exportMap.get(rawKey);
            if (matchingExport != null) {
                matchedExportKeys.add(rawKey);
                pairs.add(new PhotoPair(rawKey, rawFile, matchingExport, xmpFile));
            } else {
                // Try fuzzy lookup (e.g. export has a suffix like _edited)
                String fuzzyKey = findFuzzyMatch(rawKey, exportMap.keySet());
                if (fuzzyKey != null) {
                    matchedExportKeys.add(fuzzyKey);
                    pairs.add(new PhotoPair(rawKey, rawFile, exportMap.get(fuzzyKey), xmpFile));
                } else {
                    // Unpaired RAW
                    pairs.add(new PhotoPair(rawKey, rawFile, null, xmpFile));
                }
            }
        }

        // Include any remaining unpaired exports
        for (Map.Entry<String, File> entry : exportMap.entrySet()) {
            if (!matchedExportKeys.contains(entry.getKey())) {
                pairs.add(new PhotoPair(entry.getKey(), null, entry.getValue(), null));
            }
        }

        return pairs;
    }

    private void indexSourceFolder(File folder, Map<String, File> rawMap, Map<String, File> xmpMap) {
        File[] files = folder.listFiles();
        if (files == null) return;

        for (File f : files) {
            if (f.isFile()) {
                String ext = getExtension(f).toLowerCase();
                String base = getBaseName(f);
                if (RAW_EXTENSIONS.contains(ext)) {
                    rawMap.put(base.toLowerCase(), f);
                } else if ("xmp".equals(ext)) {
                    xmpMap.put(base.toLowerCase(), f);
                }
            }
        }
    }

    private void indexExportFolder(File folder, Map<String, File> exportMap) {
        File[] files = folder.listFiles();
        if (files == null) return;

        for (File f : files) {
            if (f.isFile()) {
                String ext = getExtension(f).toLowerCase();
                if (EXPORT_EXTENSIONS.contains(ext)) {
                    String base = getBaseName(f);
                    exportMap.put(base.toLowerCase(), f);
                }
            }
        }
    }

    private String findFuzzyMatch(String rawKey, Set<String> exportKeys) {
        for (String expKey : exportKeys) {
            String stripped = SUFFIX_PATTERN.matcher(expKey).replaceFirst("");
            if (stripped.equalsIgnoreCase(rawKey)) {
                return expKey;
            }
        }
        return null;
    }

    public static String getBaseName(File file) {
        String name = file.getName();
        int idx = name.lastIndexOf('.');
        return idx > 0 ? name.substring(0, idx) : name;
    }

    public static String getExtension(File file) {
        String name = file.getName();
        int idx = name.lastIndexOf('.');
        return (idx > 0 && idx < name.length() - 1) ? name.substring(idx + 1) : "";
    }
}
