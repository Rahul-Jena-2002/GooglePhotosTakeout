package com.takeoutfix.shared.task;

/**
 * Immutable value object representing current progress of a background operation.
 */
public record TaskProgress(
        String phase,
        long completedUnits,
        long totalUnits,
        String currentItem,
        double fraction
) {
    public static TaskProgress of(String phase, long completed, long total, String currentItem) {
        double frac = (total > 0) ? Math.min(1.0, (double) completed / total) : 0.0;
        return new TaskProgress(phase, completed, total, currentItem, frac);
    }

    public static TaskProgress indeterminate(String phase, String message) {
        return new TaskProgress(phase, 0, -1, message, -1.0);
    }

    public boolean isIndeterminate() {
        return totalUnits < 0 || fraction < 0;
    }

    public int percentage() {
        return (int) Math.round(fraction * 100);
    }
}
