package com.takeoutfix.culling;

import java.util.Collections;
import java.util.List;

/**
 * A group of visually similar photos identified by the culling pipeline.
 * All members were taken within a 20-second time window and verified as visually similar
 * via dHash Hamming distance (≤10) followed by ORB+RANSAC confirmation when OpenCV is available.
 *
 * The recommended index points to the member with the highest quality score (set in Phase 2).
 * In Phase 1 it defaults to 0 (the first/sharpest-filename-sorted member).
 */
public final class BurstGroup {

    private final List<PhotoEntry> photos;
    private int recommendedIndex;

    public BurstGroup(List<PhotoEntry> photos) {
        this.photos = Collections.unmodifiableList(photos);
        this.recommendedIndex = 0;
    }

    /** All photos in this burst group, ordered by timestamp ascending. */
    public List<PhotoEntry> getPhotos() { return photos; }

    /** Index into {@code photos} for the recommended keeper. Default 0 until Phase 2 ranking runs. */
    public int getRecommendedIndex() { return recommendedIndex; }
    public void setRecommendedIndex(int idx) { this.recommendedIndex = idx; }

    public PhotoEntry getRecommended() { return photos.get(recommendedIndex); }

    public int size() { return photos.size(); }
}
