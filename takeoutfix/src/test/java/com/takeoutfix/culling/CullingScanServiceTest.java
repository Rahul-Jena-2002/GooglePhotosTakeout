package com.takeoutfix.culling;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Integration tests for CullingScanService.
 * Tests the full walk → timestamp → dHash → grouping pipeline using synthetic images.
 * OpenCV is NOT required — tests are designed to work with the strict-dHash fallback path.
 */
@DisplayName("CullingScanService Tests")
class CullingScanServiceTest {

    private static final CullingScanService SERVICE = new CullingScanService(null /* no ExifTool */);

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    /** Creates a solid-color PNG at {@code path}. */
    private static void writeSolidPng(Path path, Color color) throws IOException {
        BufferedImage img = new BufferedImage(200, 200, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        g.setColor(color);
        g.fillRect(0, 0, 200, 200);
        g.dispose();
        ImageIO.write(img, "png", path.toFile());
    }

    /** Creates a circle-on-white PNG at {@code path}. */
    private static void writeCirclePng(Path path, Color circleColor) throws IOException {
        BufferedImage img = new BufferedImage(400, 400, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, 400, 400);
        g.setColor(circleColor);
        g.fillOval(50, 50, 300, 300);
        g.dispose();
        ImageIO.write(img, "png", path.toFile());
    }

    /** Creates a downscaled copy (simulates resized burst shot). */
    private static void writeResizedPng(Path src, Path dst, int w, int h) throws IOException {
        BufferedImage orig = ImageIO.read(src.toFile());
        assertNotNull(orig, "source image must be readable");
        BufferedImage small = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = small.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
        g.drawImage(orig.getScaledInstance(w, h, Image.SCALE_SMOOTH), 0, 0, null);
        g.dispose();
        ImageIO.write(small, "png", dst.toFile());
    }

    // ------------------------------------------------------------------
    // Tests
    // ------------------------------------------------------------------

    @Test
    @DisplayName("Empty directory → 0 groups, no exception")
    void testEmptyDirectory(@TempDir Path dir) throws Exception {
        List<BurstGroup> groups = SERVICE.scan(dir, null);
        assertNotNull(groups);
        assertTrue(groups.isEmpty());
    }

    @Test
    @DisplayName("Directory with one image → 0 groups (singleton)")
    void testSingleton(@TempDir Path dir) throws Exception {
        writeCirclePng(dir.resolve("only.png"), Color.RED);
        List<BurstGroup> groups = SERVICE.scan(dir, null);
        assertTrue(groups.isEmpty(), "Single image should not form a group");
    }

    @Test
    @DisplayName("Non-image files are ignored")
    void testNonImageFilesIgnored(@TempDir Path dir) throws Exception {
        Files.writeString(dir.resolve("notes.txt"), "some text");
        Files.writeString(dir.resolve("meta.json"), "{}");
        List<BurstGroup> groups = SERVICE.scan(dir, null);
        assertTrue(groups.isEmpty());
    }

    @Test
    @DisplayName("Visually similar resized copies are grouped")
    void testSimilarImagesGrouped(@TempDir Path dir) throws Exception {
        Path orig    = dir.resolve("IMG_001.png");
        Path resized = dir.resolve("IMG_001_web.png");
        Path distinct = dir.resolve("Landscape.png");

        writeCirclePng(orig, Color.RED);
        writeResizedPng(orig, resized, 200, 200); // 2× downscale — stays within Hamming≤6
        writeSolidPng(distinct, Color.DARK_GRAY);

        // Set all mtime to same second so time-window passes
        long now = System.currentTimeMillis() / 1000L;
        Files.setLastModifiedTime(orig.toFile().toPath(),
                java.nio.file.attribute.FileTime.fromMillis(now * 1000));
        Files.setLastModifiedTime(resized.toFile().toPath(),
                java.nio.file.attribute.FileTime.fromMillis(now * 1000));
        Files.setLastModifiedTime(distinct.toFile().toPath(),
                java.nio.file.attribute.FileTime.fromMillis(now * 1000));

        List<BurstGroup> groups = SERVICE.scan(dir, null);

        assertEquals(1, groups.size(), "Original and resized should form one group; distinct should be separate");
        BurstGroup group = groups.get(0);
        assertEquals(2, group.size());

        List<String> names = group.getPhotos().stream()
                .map(p -> p.getFile().getName())
                .toList();
        assertTrue(names.contains("IMG_001.png"), "group must contain original");
        assertTrue(names.contains("IMG_001_web.png"), "group must contain resized copy");
    }

    @Test
    @DisplayName("Completely different images are NOT grouped")
    void testDistinctImagesNotGrouped(@TempDir Path dir) throws Exception {
        writeSolidPng(dir.resolve("a.png"), Color.RED);
        writeSolidPng(dir.resolve("b.png"), Color.BLUE);

        long now = System.currentTimeMillis() / 1000L;
        Files.setLastModifiedTime(dir.resolve("a.png"),
                java.nio.file.attribute.FileTime.fromMillis(now * 1000));
        Files.setLastModifiedTime(dir.resolve("b.png"),
                java.nio.file.attribute.FileTime.fromMillis(now * 1000));

        List<BurstGroup> groups = SERVICE.scan(dir, null);
        // Solid red vs solid blue have very different dHashes — should not group
        assertTrue(groups.isEmpty(), "Completely different images must not be grouped");
    }

    @Test
    @DisplayName("Photos outside 20-second window are NOT grouped regardless of visual similarity")
    void testTimeWindowExcludes(@TempDir Path dir) throws Exception {
        Path a = dir.resolve("early.png");
        Path b = dir.resolve("late.png");
        writeCirclePng(a, Color.RED);
        writeResizedPng(a, b, 120, 120);

        long t0 = System.currentTimeMillis() / 1000L;
        long t1 = t0 + CullingScanService.TIME_WINDOW_SECS + 5; // 5 seconds beyond window

        Files.setLastModifiedTime(a, java.nio.file.attribute.FileTime.fromMillis(t0 * 1000));
        Files.setLastModifiedTime(b, java.nio.file.attribute.FileTime.fromMillis(t1 * 1000));

        List<BurstGroup> groups = SERVICE.scan(dir, null);
        assertTrue(groups.isEmpty(),
                "Images beyond the time window must not group even if visually similar");
    }

    @Test
    @DisplayName("Non-directory path throws IllegalArgumentException")
    void testNonDirectoryThrows(@TempDir Path dir) throws Exception {
        Path file = dir.resolve("img.png");
        writeSolidPng(file, Color.GREEN);
        assertThrows(IllegalArgumentException.class, () -> SERVICE.scan(file, null));
    }
}
