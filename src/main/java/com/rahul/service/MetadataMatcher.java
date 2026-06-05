package com.rahul.service;

import org.springframework.stereotype.Service;
import java.io.File;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Handles the complex logic for matching media files to their corresponding
 * Google Photos JSON metadata files based on specific naming rules.
 */
@Service
public class MetadataMatcher {

    private static final int MAX_STEM = 46;
    private static final Pattern NUMBERED_PATTERN = Pattern.compile("(.+)(\\(\\d+\\))(\\..+)$");

    private static final String DYNAMIC_REGEX;
    private static final List<String> DYNAMIC_SUFFIXES = new ArrayList<>();

    static {
        String word = "supplemental-metadata";
        List<String> prefixes = new ArrayList<>();
        for (int i = 1; i <= word.length(); i++) {
            String prefix = word.substring(0, i);
            prefixes.add(Pattern.quote(prefix));
            DYNAMIC_SUFFIXES.add("." + prefix);
            DYNAMIC_SUFFIXES.add("_" + prefix);
        }
        DYNAMIC_SUFFIXES.add(".metadata");
        DYNAMIC_SUFFIXES.add("_metadata");
        DYNAMIC_SUFFIXES.add(".m");
        DYNAMIC_SUFFIXES.add("_m");

        // Sort descending by length so regex matches the longest possible prefix first
        prefixes.sort((a, b) -> Integer.compare(b.length(), a.length()));
        DYNAMIC_REGEX = String.join("|", prefixes) + "|metadata|met|m";
    }

    // Matches suffixes like .supplemental-metadata, _metadata, .supp, .supplem, etc.
    // Group 1: Separator (. or _), Group 2: Keyword, Group 3: Optional (N)
    private static final Pattern META_SUFFIX_PATTERN = Pattern.compile("([._])(" + DYNAMIC_REGEX + ")(\\(\\d+\\))?$", Pattern.CASE_INSENSITIVE);

    /**
     * Searches for a matching JSON file for the given media file.
     *
     * @param media The media file.
     * @return An Optional containing the matching JSON file if found.
     */
    public Optional<File> findMatchingJson(File media) {
        File parent = media.getParentFile();
        if (parent == null) return Optional.empty();

        // 1. Try exact match based on Google's common patterns first (fast path)
        Optional<File> exact = findExactMatch(media, parent);
        if (exact.isPresent()) return exact;

        // 2. Check all generated candidate names (handles truncation and numbering correctly)
        for (String candidate : getJsonCandidates(media.getName())) {
            File f = new File(parent, candidate);
            if (f.isFile()) {
                return Optional.of(f);
            }
        }

        // 3. Fallback: Scan folder for files that "look like" metadata for this media
        return findDynamicMatch(media, parent);
    }

    private Optional<File> findExactMatch(File media, File parent) {
        String name = media.getName();
        // Standard modern case: name.ext.supplemental-metadata.json
        File standard = new File(parent, name + ".supplemental-metadata.json");
        if (standard.isFile()) return Optional.of(standard);

        // Basename case: name.supplemental-metadata.json
        int lastDot = name.lastIndexOf('.');
        String nameNoExt = (lastDot > 0 ? name.substring(0, lastDot) : name);
        File baseStandard = new File(parent, nameNoExt + ".supplemental-metadata.json");
        if (baseStandard.isFile()) return Optional.of(baseStandard);

        return Optional.empty();
    }

    private Optional<File> findDynamicMatch(File media, File parent) {
        File[] files = parent.listFiles();
        if (files == null) return Optional.empty();

        String mediaName = media.getName();
        String nameNoExt = mediaName.contains(".") ? mediaName.substring(0, mediaName.lastIndexOf('.')) : mediaName;
        String nameTruncated = nameNoExt.length() > MAX_STEM ? nameNoExt.substring(0, MAX_STEM) : nameNoExt;
        String nameTruncated47 = nameNoExt.length() > 47 ? nameNoExt.substring(0, 47) : nameNoExt;
        
        String numberedBase = null;
        Matcher numMatcher = NUMBERED_PATTERN.matcher(mediaName);
        if (numMatcher.matches()) {
            numberedBase = numMatcher.group(1);
        }

        File bestMatch = null;
        int maxScore = -1;

        for (File f : files) {
            String fileName = f.getName();
            if (!fileName.toLowerCase().endsWith(".json")) continue;

            // The core logic: Does the JSON filename start with the media name, normalized base, or truncated base
            // AND follow with a recognized metadata suffix?
            if (fileName.startsWith(mediaName) || fileName.startsWith(nameNoExt) 
                || fileName.startsWith(nameTruncated) || fileName.startsWith(nameTruncated47)
                || (numberedBase != null && fileName.startsWith(numberedBase))) {
                Matcher m = META_SUFFIX_PATTERN.matcher(fileName);
                if (m.find()) {
                    // Score based on length of match to prefer more specific filenames
                    int score = fileName.length();
                    if (score > maxScore) {
                        maxScore = score;
                        bestMatch = f;
                    }
                }
            }
        }
        return Optional.ofNullable(bestMatch);
    }

    /**
     * Keeps the old candidate generator for backwards compatibility or edge cases
     * if needed by other parts of the system.
     */
    public Set<String> getJsonCandidates(String mediaFilename) {
        // Implementation remains as backup or for specific logic
        Set<String> stems = new LinkedHashSet<>();
        int lastDot = mediaFilename.lastIndexOf('.');
        String nameNoExt = (lastDot > 0 ? mediaFilename.substring(0, lastDot) : mediaFilename);
        String ext = (lastDot > 0 ? mediaFilename.substring(lastDot) : "");
        String normalizedBase = normalizeBase(nameNoExt);

        List<String> baseSources = new ArrayList<>();
        baseSources.add(mediaFilename);
        baseSources.add(nameNoExt);
        if (!normalizedBase.equals(nameNoExt) && !ext.isEmpty()) baseSources.add(normalizedBase + ext);
        if (!normalizedBase.equals(nameNoExt)) baseSources.add(normalizedBase);

        for (String base : baseSources) {
            if (base.length() > MAX_STEM) {
                stems.add(truncate(base, MAX_STEM));
                stems.add(truncate(base, 47));
            } else {
                for (String suffix : DYNAMIC_SUFFIXES) {
                    stems.add(base + suffix);
                }
            }
        }
        stems.addAll(generateNumberedCandidates(mediaFilename));
        stems.add(truncate(nameNoExt, MAX_STEM));
        stems.addAll(withFuzzyTail(stems, 42, 46));

        LinkedHashSet<String> files = new LinkedHashSet<>();
        for (String stem : stems) files.add(stem + ".json");
        return files;
    }

    private String normalizeBase(String base) {
        String s = base.trim();
        s = s.replaceAll("\\s*\\(\\d+\\)$", "");
        s = s.replaceAll("(?i)[\\s_-]*(copy|edited|edit)$", "");
        s = s.replaceAll("[\\s_-]*\\d+$", "");
        s = s.replaceAll("[\\s_]+$", "");
        s = s.replaceAll("-+$", "");
        return s;
    }

    private Set<String> generateNumberedCandidates(String mediaFilename) {
        Set<String> numberedCandidates = new LinkedHashSet<>();
        Matcher m = NUMBERED_PATTERN.matcher(mediaFilename);

        if (m.matches()) {
            String base = m.group(1);
            String numberSuffix = m.group(2);
            String ext = m.group(3);

            for (String s : DYNAMIC_SUFFIXES) {
                numberedCandidates.add(base + ext + s + numberSuffix);
            }
        }
        return numberedCandidates;
    }

    private String truncate(String s, int max) {
        return (s.length() <= max) ? s : s.substring(0, max);
    }

    private Set<String> withFuzzyTail(Set<String> stems, int minLen, int maxLen) {
        Set<String> out = new LinkedHashSet<>();
        for (String stem : stems) {
            int len = stem.length();
            for (int L = minLen; L <= maxLen; L++) {
                if (len >= L) out.add(stem.substring(0, L));
            }
        }
        return out;
    }
}
