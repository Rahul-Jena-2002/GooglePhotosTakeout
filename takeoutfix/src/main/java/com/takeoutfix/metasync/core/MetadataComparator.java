package com.takeoutfix.metasync.core;

import com.takeoutfix.metasync.model.DiffStatus;
import com.takeoutfix.metasync.model.TagDifference;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Computes field-by-field differences between source and destination photograph metadata.
 */
public class MetadataComparator {

    public List<TagDifference> compare(Map<String, String> sourceTags, Map<String, String> destTags) {
        List<TagDifference> differences = new ArrayList<>();

        for (MetadataMappingRules.TagDefinition def : MetadataMappingRules.getSupportedTags()) {
            String srcVal = sourceTags != null ? sourceTags.get(def.key()) : null;
            String dstVal = destTags != null ? destTags.get(def.key()) : null;

            boolean hasSrc = srcVal != null && !srcVal.isBlank();
            boolean hasDst = dstVal != null && !dstVal.isBlank();

            if (!hasSrc && !hasDst) {
                // Neither file has this metadata tag; omit from diff table to reduce noise
                continue;
            }

            DiffStatus status;
            if (hasSrc && hasDst) {
                if (normalizeValue(srcVal).equalsIgnoreCase(normalizeValue(dstVal))) {
                    status = DiffStatus.MATCH;
                } else {
                    status = DiffStatus.DIFFERENT;
                }
            } else if (hasSrc) {
                status = DiffStatus.SOURCE_ONLY;
            } else {
                status = DiffStatus.DEST_ONLY;
            }

            differences.add(new TagDifference(
                    def.key(),
                    def.label(),
                    def.group(),
                    srcVal != null ? srcVal : "—",
                    dstVal != null ? dstVal : "—",
                    status
            ));
        }

        return differences;
    }

    private String normalizeValue(String val) {
        if (val == null) return "";
        // Clean whitespace and potential trailing zeroes in decimals
        return val.trim().replaceAll("\\.0+$", "");
    }
}
