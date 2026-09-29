package com.takeoutfix.metasync.model;

import javafx.beans.property.BooleanProperty;
import javafx.beans.property.SimpleBooleanProperty;

/**
 * Represents the comparison state for a single metadata tag between source and destination files.
 */
public class TagDifference {

    private final String tagKey;
    private final String displayName;
    private final TagGroup group;
    private final String sourceValue;
    private final String destValue;
    private final DiffStatus status;
    private final BooleanProperty selected = new SimpleBooleanProperty(false);

    public TagDifference(String tagKey, String displayName, TagGroup group,
                         String sourceValue, String destValue, DiffStatus status) {
        this.tagKey = tagKey;
        this.displayName = displayName;
        this.group = group;
        this.sourceValue = sourceValue != null ? sourceValue.trim() : "";
        this.destValue = destValue != null ? destValue.trim() : "";
        this.status = status;
        // Default select if source exists and destination differs or is missing
        this.selected.set(status == DiffStatus.SOURCE_ONLY || status == DiffStatus.DIFFERENT);
    }

    public String getTagKey() {
        return tagKey;
    }

    public String getDisplayName() {
        return displayName;
    }

    public TagGroup getGroup() {
        return group;
    }

    public String getSourceValue() {
        return sourceValue;
    }

    public String getDestValue() {
        return destValue;
    }

    public DiffStatus getStatus() {
        return status;
    }

    public boolean isSelected() {
        return selected.get();
    }

    public void setSelected(boolean val) {
        this.selected.set(val);
    }

    public BooleanProperty selectedProperty() {
        return selected;
    }

    @Override
    public String toString() {
        return String.format("[%s] %s: source='%s', dest='%s' (%s)",
                group, displayName, sourceValue, destValue, status);
    }
}
