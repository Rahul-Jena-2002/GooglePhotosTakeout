package com.takeoutfix.dedup;

/**
 * Categorizes duplicate match confidence based on similarity percentage.
 */
public enum DuplicateConfidence {
    EXACT("100% Exact Match"),
    VERY_HIGH("95%+ Near-Identical"),
    HIGH("90%+ Resized / Compressed"),
    MODERATE("80%+ Likely Edit / Crop"),
    LOW("Under 80% Uncertain");

    private final String label;

    DuplicateConfidence(String label) {
        this.label = label;
    }

    public String getLabel() {
        return label;
    }

    public static DuplicateConfidence fromSimilarity(double similarityPercentage) {
        if (similarityPercentage >= 99.9) return EXACT;
        if (similarityPercentage >= 95.0) return VERY_HIGH;
        if (similarityPercentage >= 90.0) return HIGH;
        if (similarityPercentage >= 80.0) return MODERATE;
        return LOW;
    }
}
