package com.takeoutfix.service;

import org.json.JSONObject;
import java.io.File;
import java.nio.file.Files;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.TimeZone;

public class MetadataInjector {

    private NativeExifToolEngine exifToolEngine;

    public MetadataInjector() {
        this(new NativeExifToolEngine());
    }

    public MetadataInjector(NativeExifToolEngine exifToolEngine) {
        this.exifToolEngine = exifToolEngine;
    }

    /**
     * Injects ALL metadata (EXIF dates, GPS, description, title, AND album name) in a SINGLE ExifTool call.
     * This is the preferred method — ~2x faster than calling injectMetadata + injectAlbumName separately.
     */
    public boolean injectMetadataAndAlbum(File mediaFile, File jsonFile, String albumName) {
        try {
            String jsonContent = Files.readString(jsonFile.toPath());
            JSONObject json = new JSONObject(jsonContent);

            List<String> args = new ArrayList<>();
            args.add("-overwrite_original");

            boolean isVideo = isVideoFile(mediaFile);
            long timestamp = extractBestTimestamp(json);

            // 1. Timestamp (Photo Taken Time or Creation Time fallback)
            if (timestamp > 0) {
                String formattedDate = formatExifDate(timestamp);
                String formattedIso = formatIsoDate(timestamp);
                args.add("-AllDates=" + formattedDate);

                if (isVideo) {
                    args.add("-api");
                    args.add("QuickTimeUTC");
                    args.add("-QuickTime:CreateDate=" + formattedDate);
                    args.add("-QuickTime:ModifyDate=" + formattedDate);
                    args.add("-TrackCreateDate=" + formattedDate);
                    args.add("-TrackModifyDate=" + formattedDate);
                    args.add("-MediaCreateDate=" + formattedDate);
                    args.add("-MediaModifyDate=" + formattedDate);
                    args.add("-Keys:CreationDate=" + formattedIso);
                    args.add("-UserData:DateTimeOriginal=" + formattedDate);
                    args.add("-XMP-xmp:CreateDate=" + formattedDate);
                    args.add("-XMP-xmp:ModifyDate=" + formattedDate);
                }
            }

            // 2. GPS Data
            if (json.has("geoData") && !json.isNull("geoData")) {
                JSONObject geo = json.getJSONObject("geoData");
                double lat = geo.optDouble("latitude", 0.0);
                double lon = geo.optDouble("longitude", 0.0);
                if (lat != 0.0 || lon != 0.0) {
                    args.add("-GPSLatitude=" + Math.abs(lat));
                    args.add("-GPSLatitudeRef=" + (lat >= 0 ? "N" : "S"));
                    args.add("-GPSLongitude=" + Math.abs(lon));
                    args.add("-GPSLongitudeRef=" + (lon >= 0 ? "E" : "W"));
                    double alt = geo.optDouble("altitude", 0.0);
                    if (alt != 0.0) {
                        args.add("-GPSAltitude=" + Math.abs(alt));
                        args.add("-GPSAltitudeRef=" + (alt >= 0 ? "0" : "1"));
                    }
                }
            }

            // 3. Description
            if (json.has("description") && !json.isNull("description")) {
                String desc = json.getString("description").trim();
                if (!desc.isEmpty()) {
                    args.add("-Description=" + desc);
                    args.add("-ImageDescription=" + desc);
                }
            }

            // 4. Title
            if (json.has("title") && !json.isNull("title")) {
                String title = json.getString("title").trim();
                if (!title.isEmpty()) {
                    args.add("-Title=" + title);
                    args.add("-ObjectName=" + title);
                }
            }

            // 5. Album Name (merged — avoids a second ExifTool call)
            if (albumName != null && !albumName.isBlank()) {
                args.add("-XMP-dc:Subject+=" + albumName);
                args.add("-IPTC:Keywords+=" + albumName);
                args.add("-XMP-lr:HierarchicalSubject+=Albums|" + albumName);
            }

            // In-memory / native MP4 atom injector guarantee for QuickTime/MP4 videos
            if (isVideo && timestamp > 0) {
                Mp4AtomRestorer.injectCreationTime(mediaFile, timestamp);
            }

            if (args.size() > 2) {
                args.add(mediaFile.getAbsolutePath());
                return exifToolEngine.execute(args);
            }
            return true;

        } catch (Exception e) {
            System.err.println("Failed to inject metadata for " + mediaFile.getName() + ": " + e.getMessage());
            return false;
        }
    }

    public boolean injectMetadata(File mediaFile, File jsonFile) {
        return injectMetadataAndAlbum(mediaFile, jsonFile, null);
    }

    public boolean injectAlbumName(File mediaFile, String albumName) {
        List<String> args = new ArrayList<>();
        args.add("-overwrite_original");
        
        // XMP Subject (recognized by Lightroom, digiKam, Apple Photos)
        args.add("-XMP-dc:Subject+=" + albumName);
        
        // IPTC Keywords (recognized by most photo management apps)
        args.add("-IPTC:Keywords+=" + albumName);
        
        // Lightroom Hierarchical Subject (Albums|AlbumName format)
        args.add("-XMP-lr:HierarchicalSubject+=Albums|" + albumName);
        
        args.add(mediaFile.getAbsolutePath());
        return exifToolEngine.execute(args);
    }

    private boolean isVideoFile(File f) {
        if (f == null) return false;
        String name = f.getName().toLowerCase();
        return name.endsWith(".mp4") || name.endsWith(".mov") || name.endsWith(".m4v");
    }

    private long extractBestTimestamp(JSONObject json) {
        if (json.has("photoTakenTime") && !json.isNull("photoTakenTime")) {
            JSONObject pt = json.optJSONObject("photoTakenTime");
            if (pt != null) {
                long ts = parseTimestampField(pt);
                if (ts > 0) return ts;
            }
        }
        if (json.has("creationTime") && !json.isNull("creationTime")) {
            JSONObject ct = json.optJSONObject("creationTime");
            if (ct != null) {
                long ts = parseTimestampField(ct);
                if (ts > 0) return ts;
            }
        }
        if (json.has("modificationTime") && !json.isNull("modificationTime")) {
            JSONObject mt = json.optJSONObject("modificationTime");
            if (mt != null) {
                long ts = parseTimestampField(mt);
                if (ts > 0) return ts;
            }
        }
        return 0L;
    }

    private long parseTimestampField(JSONObject obj) {
        if (obj.has("timestamp")) {
            Object raw = obj.get("timestamp");
            if (raw instanceof Number num) return num.longValue();
            if (raw instanceof String str) {
                try { return Long.parseLong(str.trim()); } catch (Exception ignored) {}
            }
        }
        return 0L;
    }

    private String formatExifDate(long unixTimestamp) {
        Date date = new Date(unixTimestamp * 1000L);
        SimpleDateFormat sdf = new SimpleDateFormat("yyyy:MM:dd HH:mm:ss");
        sdf.setTimeZone(TimeZone.getTimeZone("UTC")); // Google Photos uses UTC natively for timestamps
        return sdf.format(date);
    }

    private String formatIsoDate(long unixTimestamp) {
        Date date = new Date(unixTimestamp * 1000L);
        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'");
        sdf.setTimeZone(TimeZone.getTimeZone("UTC"));
        return sdf.format(date);
    }
}
