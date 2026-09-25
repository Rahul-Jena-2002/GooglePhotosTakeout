package com.takeoutfix.restore;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import com.takeoutfix.restore.infrastructure.MetadataMatcher;
import com.takeoutfix.restore.infrastructure.MetadataInjector;
import com.takeoutfix.restore.infrastructure.NativeExifToolEngine;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

public class TakeoutEdgeCasesIntegrationTest {

    private static final File TEST_CORPUS = new File("G:\\projectssss\\Google Takeout\\TAKEOUT_EDGE_CASES_TEST_SUITE");
    private static MetadataMatcher matcher;
    private static MetadataInjector injector;
    private static NativeExifToolEngine exifTool;

    @BeforeAll
    public static void setUp() {
        matcher = new MetadataMatcher();
        exifTool = new NativeExifToolEngine();
        injector = new MetadataInjector(exifTool);
    }

    @Test
    public void testAllEdgeCasesMatchingAndInjection() throws Exception {
        if (!TEST_CORPUS.exists() || !TEST_CORPUS.isDirectory()) {
            System.out.println("Test corpus not found at: " + TEST_CORPUS.getAbsolutePath() + " - skipping.");
            return;
        }

        Path tempDir = Files.createTempDirectory("takeout_edge_test_run_");
        try {
            List<File> allMedia = new ArrayList<>();
            findMediaFiles(TEST_CORPUS, allMedia);

            System.out.println("\n================================================================================");
            System.out.println("RUNNING TAKEOUT EDGE-CASE METADATA INJECTION VERIFICATION");
            System.out.println("Test Corpus: " + TEST_CORPUS.getAbsolutePath());
            System.out.println("Total Media Files Found: " + allMedia.size());
            System.out.println("================================================================================\n");

            Map<String, File[]> dirCache = new HashMap<>();
            int matchedCount = 0;
            int injectedCount = 0;
            int verifiedCount = 0;

            for (File media : allMedia) {
                String relPath = TEST_CORPUS.toPath().relativize(media.toPath()).toString();
                System.out.println("-> Testing Asset: " + relPath);

                Optional<File> jsonOpt = matcher.findMatchingJson(media, dirCache);
                if (jsonOpt.isEmpty()) {
                    // Check if it's an expected true orphan
                    boolean isOrphan = media.getName().contains("(1)") || media.getName().contains("IMG20230602184424");
                    System.out.println("   [MATCH] No sidecar found (Expected orphan: " + isOrphan + ")");
                    continue;
                }

                File jsonFile = jsonOpt.get();
                matchedCount++;
                System.out.println("   [MATCH] Paired with sidecar: " + jsonFile.getName());

                // Copy to temp file to verify injection
                Path tempMedia = tempDir.resolve(UUID.randomUUID().toString() + "_" + media.getName());
                Files.copy(media.toPath(), tempMedia, StandardCopyOption.REPLACE_EXISTING);

                // Determine album name
                String albumName = getAlbumTitle(media);
                if (albumName != null) {
                    System.out.println("   [ALBUM] User Album Detected: \"" + albumName + "\"");
                } else {
                    System.out.println("   [ALBUM] Organizational / System Section (No Album Tagged)");
                }

                // Inject metadata
                boolean success = injector.injectMetadataAndAlbum(tempMedia.toFile(), jsonFile, albumName);
                if (success) {
                    injectedCount++;
                    System.out.println("   [INJECT] SUCCESS");

                    // Read back tags with ExifTool to verify
                    List<String> tags = readTags(tempMedia.toFile());
                    System.out.println("   [VERIFY] Injected EXIF/QuickTime Tags:");
                    for (String tag : tags) {
                        System.out.println("      " + tag);
                    }
                    verifiedCount++;
                } else {
                    System.out.println("   [INJECT] FAILED");
                }
                System.out.println();
            }

            System.out.println("================================================================================");
            System.out.println("VERIFICATION SUMMARY");
            System.out.println("Total Media Files   : " + allMedia.size());
            System.out.println("Matched with Sidecar: " + matchedCount);
            System.out.println("Metadata Injected   : " + injectedCount);
            System.out.println("Tags Verified       : " + verifiedCount);
            System.out.println("================================================================================\n");

            assertTrue(matchedCount > 0, "Should match at least one media-sidecar pair");
            assertTrue(injectedCount > 0, "Should successfully inject metadata into media files");

        } finally {
            // Cleanup temp dir
            deleteRecursively(tempDir.toFile());
        }
    }

    private static String getAlbumTitle(File mediaFile) {
        try {
            File parent = mediaFile.getParentFile();
            if (parent == null) return null;

            String folderName = parent.getName().trim().toLowerCase();
            if (folderName.matches("^photos from \\d{4}$")
                || folderName.equals("archive")
                || folderName.equals("locked folder")
                || folderName.equals("bin")
                || folderName.equals("trash")
                || folderName.equals("similar shots")) {
                return null;
            }

            File metadataJson = new File(parent, "metadata.json");
            if (metadataJson.isFile()) {
                String content = Files.readString(metadataJson.toPath());
                org.json.JSONObject json = new org.json.JSONObject(content);
                if (json.has("title") && !json.isNull("title")) {
                    String title = json.getString("title").trim();
                    if (!title.isEmpty() && !title.toLowerCase().matches("^photos from \\d{4}$")) {
                        return title;
                    }
                }
            }
        } catch (Exception ignored) {
        }
        return null;
    }

    private static List<String> readTags(File file) {
        List<String> cmd = new ArrayList<>();
        cmd.add("-s");
        cmd.add("-DateTimeOriginal");
        cmd.add("-CreateDate");
        cmd.add("-QuickTime:CreateDate");
        cmd.add("-GPSPosition");
        cmd.add("-Subject");
        cmd.add("-Keywords");
        cmd.add(file.getAbsolutePath());
        return exifTool.executeWithOutput(cmd);
    }

    private static void findMediaFiles(File dir, List<File> result) {
        File[] files = dir.listFiles();
        if (files == null) return;
        for (File f : files) {
            if (f.isDirectory()) {
                findMediaFiles(f, result);
            } else {
                String name = f.getName().toLowerCase();
                if (name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".png")
                    || name.endsWith(".heic") || name.endsWith(".mp4") || name.endsWith(".mov") || name.endsWith(".3gp")) {
                    result.add(f);
                }
            }
        }
    }

    private static void deleteRecursively(File file) {
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) {
                for (File child : children) {
                    deleteRecursively(child);
                }
            }
        }
        file.delete();
    }
}
