package com.takeoutfix.dedup;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("Duplicate Scan Service Tests")
class DuplicateScanServiceTest {

    private final DuplicateScanService scanService = new DuplicateScanService();

    @Test
    @DisplayName("Should detect byte-identical duplicate files using SHA-256")
    void testDuplicateDetection(@TempDir Path tempDir) throws IOException {
        Path f1 = tempDir.resolve("IMG_001.JPG");
        Path f2 = tempDir.resolve("IMG_001_copy.JPG");
        Path f3 = tempDir.resolve("IMG_002_unique.JPG");

        Files.writeString(f1, "IDENTICAL_PHOTO_DATA_12345", StandardCharsets.UTF_8);
        Files.writeString(f2, "IDENTICAL_PHOTO_DATA_12345", StandardCharsets.UTF_8);
        Files.writeString(f3, "DIFFERENT_PHOTO_DATA_99999", StandardCharsets.UTF_8);

        DuplicateScanService.ScanResult result = scanService.scanDirectory(tempDir, DuplicateScanService.MatchStrategy.EXACT_HASH);

        assertEquals(3, result.getTotalFilesScanned());
        assertEquals(1, result.getClusters().size());

        DuplicateScanService.DuplicateCluster cluster = result.getClusters().get(0);
        assertEquals(1, cluster.getDuplicateCopies().size());
        assertEquals(f1.toFile().length(), cluster.getFileSize());
        assertEquals("SHA-256 Exact", cluster.getMatchType());
    }

    @Test
    @DisplayName("Should detect duplicate media files by filename across folders")
    void testFilenameMatching(@TempDir Path tempDir) throws IOException {
        Path sub1 = tempDir.resolve("Album1");
        Path sub2 = tempDir.resolve("Album2");
        Files.createDirectories(sub1);
        Files.createDirectories(sub2);

        Path f1 = sub1.resolve("vacation.png");
        Path f2 = sub2.resolve("vacation.png");
        Path f3 = sub1.resolve("other.png");

        Files.writeString(f1, "IMAGE_BYTES_1", StandardCharsets.UTF_8);
        Files.writeString(f2, "IMAGE_BYTES_2", StandardCharsets.UTF_8);
        Files.writeString(f3, "IMAGE_BYTES_3", StandardCharsets.UTF_8);

        DuplicateScanService.ScanResult result = scanService.scanDirectory(tempDir, DuplicateScanService.MatchStrategy.FILENAME);

        assertEquals(3, result.getTotalFilesScanned());
        assertEquals(1, result.getClusters().size());
        assertEquals("Filename Match", result.getClusters().get(0).getMatchType());
        assertEquals("vacation.png", result.getClusters().get(0).getPrimaryFile().getName());
    }

    @Test
    @DisplayName("Should ignore .json sidecars and non-media files completely")
    void testIgnoreJsonSidecars(@TempDir Path tempDir) throws IOException {
        Path sub1 = tempDir.resolve("Dir1");
        Path sub2 = tempDir.resolve("Dir2");
        Files.createDirectories(sub1);
        Files.createDirectories(sub2);

        // Media file
        Files.writeString(sub1.resolve("photo.jpg"), "PHOTO_DATA", StandardCharsets.UTF_8);

        // JSON files that must NOT be treated as duplicates or scanned
        Files.writeString(sub1.resolve("metadata.json"), "{}", StandardCharsets.UTF_8);
        Files.writeString(sub2.resolve("metadata.json"), "{}", StandardCharsets.UTF_8);
        Files.writeString(sub1.resolve("photo.jpg.supplemental-metadata.json"), "{}", StandardCharsets.UTF_8);

        DuplicateScanService.ScanResult result = scanService.scanDirectory(tempDir, DuplicateScanService.MatchStrategy.FILENAME);

        // Only photo.jpg should be scanned (1 file), 0 duplicate clusters (metadata.json ignored)
        assertEquals(1, result.getTotalFilesScanned());
        assertEquals(0, result.getClusters().size());
    }

    @Test
    @DisplayName("Should detect visually similar resized copies using Perceptual Hashing (pHash)")
    void testVisualSimilarityDetection(@TempDir Path tempDir) throws IOException {
        Path orig = tempDir.resolve("IMG_2020.png");
        Path resized = tempDir.resolve("IMG_2020_web.png");
        Path distinct = tempDir.resolve("Landscape.png");

        java.awt.image.BufferedImage imgA = new java.awt.image.BufferedImage(400, 400, java.awt.image.BufferedImage.TYPE_INT_RGB);
        java.awt.Graphics2D gA = imgA.createGraphics();
        gA.setColor(java.awt.Color.WHITE);
        gA.fillRect(0, 0, 400, 400);
        gA.setColor(java.awt.Color.RED);
        gA.fillOval(50, 50, 300, 300);
        gA.dispose();

        java.awt.image.BufferedImage imgResized = new java.awt.image.BufferedImage(100, 100, java.awt.image.BufferedImage.TYPE_INT_RGB);
        java.awt.Graphics2D gR = imgResized.createGraphics();
        gR.drawImage(imgA.getScaledInstance(100, 100, java.awt.Image.SCALE_SMOOTH), 0, 0, null);
        gR.dispose();

        java.awt.image.BufferedImage imgDistinct = new java.awt.image.BufferedImage(400, 400, java.awt.image.BufferedImage.TYPE_INT_RGB);
        java.awt.Graphics2D gD = imgDistinct.createGraphics();
        gD.setColor(java.awt.Color.DARK_GRAY);
        gD.fillRect(0, 0, 400, 400);
        gD.setColor(java.awt.Color.YELLOW);
        gD.fillRect(100, 100, 200, 200);
        gD.dispose();

        javax.imageio.ImageIO.write(imgA, "png", orig.toFile());
        javax.imageio.ImageIO.write(imgResized, "png", resized.toFile());
        javax.imageio.ImageIO.write(imgDistinct, "png", distinct.toFile());

        DuplicateScanService.ScanResult result = scanService.scanDirectory(tempDir, DuplicateScanService.MatchStrategy.PERCEPTUAL_HASH, 90.0);

        assertEquals(3, result.getTotalFilesScanned());
        assertEquals(1, result.getClusters().size());

        DuplicateScanService.DuplicateCluster cluster = result.getClusters().get(0);
        assertEquals(orig.toFile().getName(), cluster.getPrimaryFile().getName());
        assertEquals(1, cluster.getDuplicateCopies().size());
        assertEquals(resized.toFile().getName(), cluster.getDuplicateCopies().get(0).getName());
        assertTrue(cluster.getSimilarityPercentage() >= 90.0, "Expected similarity >= 90%, was " + cluster.getSimilarityPercentage());
        assertTrue(cluster.getMatchType().contains("Visual Match"));
    }
}
