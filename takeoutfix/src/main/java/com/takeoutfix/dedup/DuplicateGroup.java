package com.takeoutfix.dedup;

import java.io.File;
import java.util.Collections;
import java.util.List;

/**
 * Group of duplicate files associated with a primary original file.
 */
public class DuplicateGroup {
    private final String groupId;
    private final File primaryFile;
    private final List<DuplicateCandidate> candidates;
    private final long originalFileSize;
    private final String matchType;

    public DuplicateGroup(String groupId, File primaryFile, List<DuplicateCandidate> candidates, long originalFileSize, String matchType) {
        this.groupId = groupId;
        this.primaryFile = primaryFile;
        this.candidates = Collections.unmodifiableList(candidates);
        this.originalFileSize = originalFileSize;
        this.matchType = matchType;
    }

    public String getGroupId() {
        return groupId;
    }

    public File getPrimaryFile() {
        return primaryFile;
    }

    public List<DuplicateCandidate> getCandidates() {
        return candidates;
    }

    public long getOriginalFileSize() {
        return originalFileSize;
    }

    public String getMatchType() {
        return matchType;
    }

    public long getReclaimableBytes() {
        long sum = 0;
        for (DuplicateCandidate candidate : candidates) {
            if (candidate.getFile() != null && candidate.getFile().exists()) {
                sum += candidate.getFile().length();
            } else {
                sum += originalFileSize;
            }
        }
        return sum;
    }
}
