package com.takeoutfix.shared.util;

import java.io.InputStream;
import java.util.Properties;

/**
 * Single source of truth for runtime application versioning.
 * Stamped dynamically at build time.
 */
public class AppVersion {

    private static String version = "2.1.7";
    private static int buildNumber = 117;
    private static String buildTimestamp = "";

    static {
        try (InputStream is = AppVersion.class.getResourceAsStream("/version.properties")) {
            if (is != null) {
                Properties props = new Properties();
                props.load(is);
                version = props.getProperty("app.version", version);
                buildNumber = Integer.parseInt(props.getProperty("build.number", "102"));
                buildTimestamp = props.getProperty("build.timestamp", "");
            }
        } catch (Exception ignored) {}
    }

    public static String getVersion() {
        return version;
    }

    public static int getBuildNumber() {
        return buildNumber;
    }

    public static String getBuildTimestamp() {
        return buildTimestamp;
    }

    public static String getFullVersionString() {
        return "v" + version + " (Build " + buildNumber + ")";
    }

    /**
     * Compares two semantic version strings (e.g., "2.0.3" vs "2.0.2").
     * Returns:
     *   > 0 if v1 > v2
     *   < 0 if v1 < v2
     *   0 if equal
     */
    public static int compareVersions(String v1, String v2) {
        if (v1 == null && v2 == null) return 0;
        if (v1 == null) return -1;
        if (v2 == null) return 1;

        // Clean any leading 'v' or 'V' or trailing whitespace
        String clean1 = v1.trim().replaceAll("^[vV]", "");
        String clean2 = v2.trim().replaceAll("^[vV]", "");

        // Split by non-alphanumeric except dots (e.g. 2.0.1-preview or build suffix)
        String[] parts1 = clean1.split("[-_+]")[0].split("\\.");
        String[] parts2 = clean2.split("[-_+]")[0].split("\\.");

        int length = Math.max(parts1.length, parts2.length);
        for (int i = 0; i < length; i++) {
            int num1 = 0;
            int num2 = 0;
            if (i < parts1.length) {
                try { num1 = Integer.parseInt(parts1[i]); } catch (NumberFormatException ignored) {}
            }
            if (i < parts2.length) {
                try { num2 = Integer.parseInt(parts2[i]); } catch (NumberFormatException ignored) {}
            }
            if (num1 != num2) {
                return Integer.compare(num1, num2);
            }
        }
        return 0;
    }

    public static boolean isNewerThanCurrent(String remoteVersion) {
        return compareVersions(remoteVersion, version) > 0;
    }
}
