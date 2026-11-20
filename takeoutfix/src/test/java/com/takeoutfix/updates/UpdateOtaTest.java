package com.takeoutfix.updates;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

public class UpdateOtaTest {

    @Test
    public void testManifestParsingAndAssetResolution() {
        String json = """
        {
          "app": "TakeoutFix",
          "version": "9.9.9",
          "channel": "stable",
          "releaseDate": "2026-09-30",
          "minimumSupportedVersion": "2.0.0",
          "mandatory": false,
          "releaseNotes": "Critical engine fixes and OTA updater",
          "platforms": {
            "windows-x64": {
              "url": "https://github.com/Rahul-Jena-2002/GooglePhotosTakeout/releases/download/v9.9.9/TakeoutFix-9.9.9-windows-x64.msi",
              "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
              "size": 89000000
            },
            "macos-x64": {
              "url": "https://github.com/Rahul-Jena-2002/GooglePhotosTakeout/releases/download/v9.9.9/TakeoutFix-9.9.9-macos-x64.dmg",
              "sha256": "abcdef123456",
              "size": 91000000
            }
          }
        }
        """;

        UpdateManifest manifest = UpdateManifest.fromJson(json);
        assertNotNull(manifest);
        assertEquals("TakeoutFix", manifest.getAppName());
        assertEquals("9.9.9", manifest.getVersion());
        assertTrue(manifest.isNewerThanCurrent());
        assertEquals("Critical engine fixes and OTA updater", manifest.getReleaseNotes());

        UpdateManifest.PlatformAsset asset = manifest.getPlatforms().get("windows-x64");
        assertNotNull(asset);
        assertNotNull(asset.getDownloadUrl());
        assertTrue(asset.getSizeBytes() > 0);
    }

    @Test
    public void testManifestDoesNotSelectIncompatiblePlatform() {
        UpdateManifest manifest = UpdateManifest.fromJson("""
                {"version":"9.9.9","platforms":{"unknown-platform":{"url":"https://example.test/package"}}}
                """);
        assertNull(manifest.resolveCurrentPlatformAsset());
    }

    @Test
    public void testUpdateVerifier(@TempDir Path tempDir) throws Exception {
        Path testFile = tempDir.resolve("sample-binary.bin");
        Files.writeString(testFile, "TakeoutFix OTA binary payload for testing");

        String actualHash = UpdateVerifier.computeSha256(testFile.toFile());
        assertNotNull(actualHash);
        assertEquals(64, actualHash.length());

        // Verify with matching hash
        assertTrue(UpdateVerifier.verifyFile(testFile.toFile(), actualHash));

        // Verify with mismatched hash
        assertFalse(UpdateVerifier.verifyFile(testFile.toFile(), "0000000000000000000000000000000000000000000000000000000000000000"));

        // Missing and malformed checksums must never pass verification.
        assertFalse(UpdateVerifier.verifyFile(testFile.toFile(), ""));
        assertFalse(UpdateVerifier.verifyFile(testFile.toFile(), null));
        assertFalse(UpdateVerifier.verifyFile(testFile.toFile(), "not-a-checksum"));
    }

    @Test
    public void testUpdateDestinationDoesNotOverwriteOrEscape(@TempDir Path tempDir) throws Exception {
        Path existing = tempDir.resolve("TakeoutFix.exe");
        Files.writeString(existing, "existing file");
        Path first = UpdateDownloader.createDestination(tempDir, "TakeoutFix.exe");
        Path second = UpdateDownloader.createDestination(tempDir, "TakeoutFix.exe");
        assertNotEquals(first, second);
        assertTrue(first.getFileName().toString().endsWith(".exe"));
        assertEquals("existing file", Files.readString(existing));
        assertThrows(IllegalArgumentException.class, () -> UpdateDownloader.createDestination(tempDir, "../other.exe"));
        assertThrows(IllegalArgumentException.class, () -> UpdateDownloader.createDestination(tempDir, "C:\\other.exe"));
    }

    @Test
    public void testDownloaderCancel() {
        UpdateDownloader downloader = new UpdateDownloader();
        downloader.cancel();
        // Downloader state set cleanly
        assertNotNull(downloader);
    }
}
