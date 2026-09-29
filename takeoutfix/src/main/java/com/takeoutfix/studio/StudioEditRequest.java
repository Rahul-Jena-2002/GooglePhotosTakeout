package com.takeoutfix.studio;

import java.io.File;
import java.time.LocalDateTime;

/**
 * Encapsulates a batch edit request for the Photo Studio suite.
 * Supports relative time shifts (timezone/clock offsets), fixed date with auto-increment,
 * optional GPS tagging/stripping, and copyright/author presets.
 */
public class StudioEditRequest {

    public enum DateMode {
        NONE,
        RELATIVE_SHIFT,
        FIXED_INCREMENT
    }

    // --- Date Adjustments ---
    private DateMode dateMode = DateMode.RELATIVE_SHIFT;
    private int shiftDays = 0;
    private int shiftHours = 0;
    private int shiftMinutes = 0;
    private int shiftSeconds = 0;

    private LocalDateTime baseDateTime = LocalDateTime.now();
    private int incrementSeconds = 60; // Default +1 min per photo

    // --- Geotagging & Privacy ---
    private boolean updateLocation = false;
    private boolean stripGps = false;
    private Double latitude;
    private Double longitude;

    // --- Copyright & Presets ---
    private boolean updatePresets = false;
    private String artist;
    private String copyright;
    private String description;

    // --- Safety & Output ---
    private boolean inPlace = false; // Default safe: export to separate folder
    private File outputDirectory;
    private boolean syncOsTimestamps = true;

    public StudioEditRequest() {}

    // Getters and Setters
    public DateMode getDateMode() { return dateMode; }
    public void setDateMode(DateMode dateMode) { this.dateMode = dateMode; }

    public int getShiftDays() { return shiftDays; }
    public void setShiftDays(int shiftDays) { this.shiftDays = shiftDays; }

    public int getShiftHours() { return shiftHours; }
    public void setShiftHours(int shiftHours) { this.shiftHours = shiftHours; }

    public int getShiftMinutes() { return shiftMinutes; }
    public void setShiftMinutes(int shiftMinutes) { this.shiftMinutes = shiftMinutes; }

    public int getShiftSeconds() { return shiftSeconds; }
    public void setShiftSeconds(int shiftSeconds) { this.shiftSeconds = shiftSeconds; }

    public LocalDateTime getBaseDateTime() { return baseDateTime; }
    public void setBaseDateTime(LocalDateTime baseDateTime) { this.baseDateTime = baseDateTime; }

    public int getIncrementSeconds() { return incrementSeconds; }
    public void setIncrementSeconds(int incrementSeconds) { this.incrementSeconds = incrementSeconds; }

    public boolean isUpdateLocation() { return updateLocation; }
    public void setUpdateLocation(boolean updateLocation) { this.updateLocation = updateLocation; }

    public boolean isStripGps() { return stripGps; }
    public void setStripGps(boolean stripGps) { this.stripGps = stripGps; }

    public Double getLatitude() { return latitude; }
    public void setLatitude(Double latitude) { this.latitude = latitude; }

    public Double getLongitude() { return longitude; }
    public void setLongitude(Double longitude) { this.longitude = longitude; }

    public boolean isUpdatePresets() { return updatePresets; }
    public void setUpdatePresets(boolean updatePresets) { this.updatePresets = updatePresets; }

    public String getArtist() { return artist; }
    public void setArtist(String artist) { this.artist = artist; }

    public String getCopyright() { return copyright; }
    public void setCopyright(String copyright) { this.copyright = copyright; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public boolean isInPlace() { return inPlace; }
    public void setInPlace(boolean inPlace) { this.inPlace = inPlace; }

    public File getOutputDirectory() { return outputDirectory; }
    public void setOutputDirectory(File outputDirectory) { this.outputDirectory = outputDirectory; }

    public boolean isSyncOsTimestamps() { return syncOsTimestamps; }
    public void setSyncOsTimestamps(boolean syncOsTimestamps) { this.syncOsTimestamps = syncOsTimestamps; }

    public long getTotalShiftSeconds() {
        return ((long) shiftDays * 86400) +
               ((long) shiftHours * 3600) +
               ((long) shiftMinutes * 60) +
               shiftSeconds;
    }
}
