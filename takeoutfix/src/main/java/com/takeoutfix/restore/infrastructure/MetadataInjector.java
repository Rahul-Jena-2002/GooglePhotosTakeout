package com.takeoutfix.restore.infrastructure;

import org.json.JSONObject;
import org.springframework.stereotype.Component;

import java.io.File;
import java.nio.file.Files;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.TimeZone;

@Component
public class MetadataInjector {

    private NativeExifToolEngine exifToolEngine;

    public MetadataInjector() {
        this(NativeExifToolEngine.getDefault());
    }

    public MetadataInjector(NativeExifToolEngine exifToolEngine) {
        this.exifToolEngine = exifToolEngine != null ? exifToolEngine : NativeExifToolEngine.getDefault();
    }

    public NativeExifToolEngine getExifToolEngine() {
        return exifToolEngine;
    }

    /**
     * Injects ALL metadata (EXIF dates, GPS, description, title, AND album name) in a SINGLE ExifTool call.
     * This is the preferred method — ~2x faster than calling injectMetadata + injectAlbumName separately.
     */
    public boolean injectMetadataAndAlbum(File mediaFile, File jsonFile, String albumName, String albumDescription) {
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

            // 2. GPS Data (with geoDataExif fallback)
            JSONObject geo = json.optJSONObject("geoData");
            if (geo == null || (geo.optDouble("latitude", 0.0) == 0.0 && geo.optDouble("longitude", 0.0) == 0.0)) {
                if (json.has("geoDataExif") && !json.isNull("geoDataExif")) {
                    geo = json.optJSONObject("geoDataExif");
                }
            }
            if (geo != null) {
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

            // 2b. People Tagging
            if (json.has("people") && !json.isNull("people")) {
                org.json.JSONArray peopleArr = json.optJSONArray("people");
                if (peopleArr != null) {
                    for (int i = 0; i < peopleArr.length(); i++) {
                        JSONObject p = peopleArr.optJSONObject(i);
                        if (p != null && p.has("name") && !p.isNull("name")) {
                            String personName = p.getString("name").trim();
                            if (!personName.isEmpty()) {
                                args.add("-XMP-iptcExt:PersonInImage+=" + personName);
                                args.add("-XMP-dc:Subject+=" + personName);
                                args.add("-IPTC:Keywords+=" + personName);
                            }
                        }
                    }
                }
            }

            // 2c. Starred / Favorited Rating (Recognized by Apple Photos & Lightroom)
            if (json.optBoolean("favorited", false)) {
                args.add("-Rating=5");
                args.add("-XMP:Rating=5");
            }

            // 3. Description (Media JSON description has priority; fallback to Album description)
            String desc = null;
            if (json.has("description") && !json.isNull("description")) {
                desc = json.getString("description").trim();
            }
            if ((desc == null || desc.isEmpty()) && albumDescription != null && !albumDescription.isBlank()) {
                desc = albumDescription.trim();
            }
            if (desc != null && !desc.isEmpty()) {
                args.add("-Description=" + desc);
                args.add("-ImageDescription=" + desc);
            }

            // 4. Title
            if (json.has("title") && !json.isNull("title")) {
                String title = json.getString("title").trim();
                if (!title.isEmpty()) {
                    args.add("-Title=" + title);
                    args.add("-ObjectName=" + title);
                }
            }

            // 5. Album Details (merged — avoids a second ExifTool call)
            if (albumName != null && !albumName.isBlank()) {
                args.add("-XMP-dc:Subject+=" + albumName);
                args.add("-IPTC:Keywords+=" + albumName);
                args.add("-XMP-lr:HierarchicalSubject+=Albums|" + albumName);
                args.add("-XMP-xmpDM:album=" + albumName);
                if (isVideo) {
                    args.add("-QuickTime:Album=" + albumName);
                }
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

    public boolean injectMetadataAndAlbum(File mediaFile, File jsonFile, String albumName) {
        return injectMetadataAndAlbum(mediaFile, jsonFile, albumName, null);
    }

    public boolean injectMetadata(File mediaFile, File jsonFile) {
        return injectMetadataAndAlbum(mediaFile, jsonFile, null, null);
    }

    public boolean injectAlbumName(File mediaFile, String albumName) {
        return injectAlbumName(mediaFile, albumName, null);
    }

    public boolean injectAlbumName(File mediaFile, String albumName, String albumDescription) {
        List<String> args = new ArrayList<>();
        args.add("-overwrite_original");
        
        // XMP Subject (recognized by Lightroom, digiKam, Apple Photos)
        args.add("-XMP-dc:Subject+=" + albumName);
        
        // IPTC Keywords (recognized by most photo management apps)
        args.add("-IPTC:Keywords+=" + albumName);
        
        // Lightroom Hierarchical Subject (Albums|AlbumName format)
        args.add("-XMP-lr:HierarchicalSubject+=Albums|" + albumName);

        // XMP Dynamic Media Album schema
        args.add("-XMP-xmpDM:album=" + albumName);

        if (isVideoFile(mediaFile)) {
            args.add("-QuickTime:Album=" + albumName);
        }

        if (albumDescription != null && !albumDescription.isBlank()) {
            args.add("-Description=" + albumDescription.trim());
            args.add("-ImageDescription=" + albumDescription.trim());
        }
        
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
