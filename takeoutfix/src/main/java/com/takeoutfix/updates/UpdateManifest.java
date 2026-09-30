package com.takeoutfix.updates;

import com.takeoutfix.shared.util.AppVersion;
import org.json.JSONObject;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Parsed representation of an Over-The-Air (OTA) update manifest (update.json).
 * Follows desktop application standard specifications with platform-specific binaries,
 * SHA-256 integrity checksums, and semantic version gating.
 */
public class UpdateManifest {

    public static class PlatformAsset {
        private final String platformKey;
        private final String downloadUrl;
        private final String sha256;
        private final long sizeBytes;

        public PlatformAsset(String platformKey, String downloadUrl, String sha256, long sizeBytes) {
            this.platformKey = platformKey;
            this.downloadUrl = downloadUrl;
            this.sha256 = sha256;
            this.sizeBytes = sizeBytes;
        }

        public String getPlatformKey() { return platformKey; }
        public String getDownloadUrl() { return downloadUrl; }
        public String getSha256() { return sha256; }
        public long getSizeBytes() { return sizeBytes; }
    }

    private final String appName;
    private final String version;
    private final String channel;
    private final String releaseDate;
    private final String minimumSupportedVersion;
    private final boolean mandatory;
    private final String releaseNotes;
    private final Map<String, PlatformAsset> platforms = new HashMap<>();

    public UpdateManifest(String appName, String version, String channel, String releaseDate,
                          String minimumSupportedVersion, boolean mandatory, String releaseNotes) {
        this.appName = appName;
        this.version = version;
        this.channel = channel;
        this.releaseDate = releaseDate;
        this.minimumSupportedVersion = minimumSupportedVersion;
        this.mandatory = mandatory;
        this.releaseNotes = releaseNotes;
    }

    public static UpdateManifest fromJson(String jsonStr) {
        if (jsonStr == null || jsonStr.isBlank()) {
            throw new IllegalArgumentException("Manifest JSON cannot be empty");
        }

        JSONObject root = new JSONObject(jsonStr);
        String app = root.optString("app", "TakeoutFix");
        String ver = root.optString("version", root.optString("tag_name", ""));
        String chan = root.optString("channel", "stable");
        String date = root.optString("releaseDate", "");
        String minVer = root.optString("minimumSupportedVersion", "1.0.0");
        boolean mand = root.optBoolean("mandatory", false);
        String notes = root.optString("releaseNotes", root.optString("body", ""));

        UpdateManifest manifest = new UpdateManifest(app, ver, chan, date, minVer, mand, notes);

        if (root.has("platforms")) {
            JSONObject plats = root.getJSONObject("platforms");
            for (String key : plats.keySet()) {
                JSONObject pObj = plats.getJSONObject(key);
                String url = pObj.optString("url", "");
                String hash = pObj.optString("sha256", "");
                long sz = pObj.optLong("size", 0L);
                manifest.platforms.put(key.toLowerCase(Locale.ROOT), new PlatformAsset(key, url, hash, sz));
            }
        }

        return manifest;
    }

    public String getAppName() { return appName; }
    public String getVersion() { return version; }
    public String getChannel() { return channel; }
    public String getReleaseDate() { return releaseDate; }
    public String getMinimumSupportedVersion() { return minimumSupportedVersion; }
    public boolean isMandatory() { return mandatory; }
    public String getReleaseNotes() { return releaseNotes; }
    public Map<String, PlatformAsset> getPlatforms() { return platforms; }

    public boolean isNewerThanCurrent() {
        return AppVersion.isNewerThanCurrent(version);
    }

    /**
     * Resolves the matching asset for the running operating system and architecture.
     */
    public PlatformAsset resolveCurrentPlatformAsset() {
        String os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
        String arch = System.getProperty("os.arch", "").toLowerCase(Locale.ROOT);

        String targetKey;
        if (os.contains("win")) {
            targetKey = arch.contains("aarch64") || arch.contains("arm") ? "windows-arm64" : "windows-x64";
        } else if (os.contains("mac") || os.contains("darwin")) {
            targetKey = arch.contains("aarch64") || arch.contains("arm") ? "macos-aarch64" : "macos-x64";
        } else {
            targetKey = arch.contains("aarch64") || arch.contains("arm") ? "linux-arm64" : "linux-x64";
        }

        if (platforms.containsKey(targetKey)) {
            return platforms.get(targetKey);
        }

        // Fallback: return the first available asset if exact architecture is not specified
        return platforms.values().stream().findFirst().orElse(null);
    }
}
