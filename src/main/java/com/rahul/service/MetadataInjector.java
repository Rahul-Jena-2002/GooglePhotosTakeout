package com.rahul.service;

import org.json.JSONObject;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.File;
import java.nio.file.Files;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.TimeZone;

@Service
public class MetadataInjector {

    @Autowired
    private NativeExifToolEngine exifToolEngine;

    public boolean injectMetadata(File mediaFile, File jsonFile) {
        try {
            String jsonContent = Files.readString(jsonFile.toPath());
            JSONObject json = new JSONObject(jsonContent);

            List<String> args = new ArrayList<>();
            args.add("-overwrite_original");
            args.add("-q");

            // 1. Photo Taken Time
            if (json.has("photoTakenTime") && !json.isNull("photoTakenTime")) {
                JSONObject pt = json.getJSONObject("photoTakenTime");
                if (pt.has("timestamp")) {
                    long timestamp = pt.getLong("timestamp");
                    String formattedDate = formatExifDate(timestamp);
                    args.add("-AllDates=" + formattedDate);
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
            
            // 4. Title (often mapped to ObjectName or Title)
            if (json.has("title") && !json.isNull("title")) {
                String title = json.getString("title").trim();
                if (!title.isEmpty()) {
                    args.add("-Title=" + title);
                    args.add("-ObjectName=" + title);
                }
            }

            // Only run if we actually have metadata tags to add
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

    private String formatExifDate(long unixTimestamp) {
        Date date = new Date(unixTimestamp * 1000L);
        SimpleDateFormat sdf = new SimpleDateFormat("yyyy:MM:dd HH:mm:ss");
        sdf.setTimeZone(TimeZone.getTimeZone("UTC")); // Google Photos uses UTC natively for timestamps
        return sdf.format(date);
    }
}
