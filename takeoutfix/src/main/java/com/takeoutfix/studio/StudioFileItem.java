package com.takeoutfix.studio;

import java.io.File;
import java.time.LocalDateTime;

/**
 * Represents a single file queued in the Photo Studio table with original metadata,
 * calculated preview metadata, and batch processing status.
 */
public class StudioFileItem {

    private final File file;
    private final String fileName;
    private final long fileSize;
    private boolean selected = true;
    private LocalDateTime originalDate;
    private LocalDateTime newDate;
    private String status = "Ready";
    private String details = "";

    public StudioFileItem(File file, LocalDateTime originalDate) {
        this.file = file;
        this.fileName = file.getName();
        this.fileSize = file.length();
        this.originalDate = originalDate;
        this.newDate = originalDate;
    }

    public File getFile() { return file; }
    public String getFileName() { return fileName; }
    public long getFileSize() { return fileSize; }
    public boolean isSelected() { return selected; }
    public void setSelected(boolean selected) { this.selected = selected; }

    public LocalDateTime getOriginalDate() { return originalDate; }
    public void setOriginalDate(LocalDateTime originalDate) { this.originalDate = originalDate; }

    public LocalDateTime getNewDate() { return newDate; }
    public void setNewDate(LocalDateTime newDate) { this.newDate = newDate; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getDetails() { return details; }
    public void setDetails(String details) { this.details = details; }

    public String getFormattedSize() {
        if (fileSize < 1024) return fileSize + " B";
        if (fileSize < 1024 * 1024) return String.format("%.1f KB", fileSize / 1024.0);
        return String.format("%.1f MB", fileSize / (1024.0 * 1024.0));
    }
}
