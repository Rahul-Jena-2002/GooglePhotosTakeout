package com.takeoutfix.metasync.core;

import com.takeoutfix.metasync.model.TagGroup;

import java.util.*;

/**
 * Field-aware synchronization rules governing which metadata tags can be safely copied
 * between RAW originals, XMP sidecars, and JPEG exports without corrupting destination files.
 */
public final class MetadataMappingRules {

    public record TagDefinition(String key, String label, TagGroup group, boolean safeToCopy) {}

    private static final List<TagDefinition> SUPPORTED_TAGS = List.of(
            // Capture Group
            new TagDefinition("DateTimeOriginal", "Capture Date & Time", TagGroup.CAPTURE, true),
            new TagDefinition("Make", "Camera Manufacturer", TagGroup.CAPTURE, true),
            new TagDefinition("Model", "Camera Model", TagGroup.CAPTURE, true),
            new TagDefinition("LensModel", "Lens Model", TagGroup.CAPTURE, true),
            new TagDefinition("FocalLength", "Focal Length", TagGroup.CAPTURE, true),
            new TagDefinition("ExposureTime", "Shutter Speed", TagGroup.CAPTURE, true),
            new TagDefinition("FNumber", "Aperture (F-Stop)", TagGroup.CAPTURE, true),
            new TagDefinition("ISO", "ISO Speed", TagGroup.CAPTURE, true),

            // Location Group
            new TagDefinition("GPSLatitude", "GPS Latitude", TagGroup.LOCATION, true),
            new TagDefinition("GPSLongitude", "GPS Longitude", TagGroup.LOCATION, true),
            new TagDefinition("GPSAltitude", "GPS Altitude", TagGroup.LOCATION, true),

            // Copyright Group
            new TagDefinition("Artist", "Creator / Artist", TagGroup.COPYRIGHT, true),
            new TagDefinition("Copyright", "Copyright Notice", TagGroup.COPYRIGHT, true),
            new TagDefinition("Rights", "Usage Terms & Rights", TagGroup.COPYRIGHT, true),

            // Descriptive Group
            new TagDefinition("Title", "Photo Title", TagGroup.DESCRIPTIVE, true),
            new TagDefinition("Description", "Caption / Description", TagGroup.DESCRIPTIVE, true),

            // Keywords Group
            new TagDefinition("Keywords", "Keywords & Tags", TagGroup.KEYWORDS, true),
            new TagDefinition("Subject", "IPTC Subject", TagGroup.KEYWORDS, true),

            // Ratings Group
            new TagDefinition("Rating", "Star Rating (0-5)", TagGroup.RATINGS, true),
            new TagDefinition("Label", "Color Label", TagGroup.RATINGS, true)
    );

    // Explicitly blocked tag prefixes (RAW development recipes, proprietary maker notes)
    private static final Set<String> BLOCKED_PREFIXES = Set.of(
            "maker", "makernotes", "crs:", "darktable:", "raw:", "sensor", "calibration"
    );

    public static List<TagDefinition> getSupportedTags() {
        return SUPPORTED_TAGS;
    }

    public static boolean isTagSafeToCopy(String tagKey) {
        if (tagKey == null || tagKey.isBlank()) return false;
        String lower = tagKey.toLowerCase(Locale.ROOT);
        for (String blocked : BLOCKED_PREFIXES) {
            if (lower.startsWith(blocked)) {
                return false;
            }
        }
        return SUPPORTED_TAGS.stream().anyMatch(t -> t.key().equalsIgnoreCase(tagKey) && t.safeToCopy());
    }

    public static Optional<TagDefinition> findDefinition(String tagKey) {
        return SUPPORTED_TAGS.stream()
                .filter(t -> t.key().equalsIgnoreCase(tagKey))
                .findFirst();
    }
}
