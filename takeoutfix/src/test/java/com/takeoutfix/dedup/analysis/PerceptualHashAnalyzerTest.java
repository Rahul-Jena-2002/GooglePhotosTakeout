package com.takeoutfix.dedup.analysis;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.Image;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("Perceptual Hash Analyzer Tests")
class PerceptualHashAnalyzerTest {

    private final PerceptualHashAnalyzer analyzer = new PerceptualHashAnalyzer();

    private BufferedImage createSampleImage(int width, int height, boolean patternA) {
        BufferedImage img = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D g2 = img.createGraphics();
        try {
            g2.setColor(Color.WHITE);
            g2.fillRect(0, 0, width, height);

            if (patternA) {
                // Diagonal stripes & circle pattern
                g2.setColor(Color.BLUE);
                g2.fillOval(width / 4, height / 4, width / 2, height / 2);
                g2.setColor(Color.RED);
                g2.drawLine(0, 0, width, height);
            } else {
                // Completely different solid checkerboard pattern
                g2.setColor(Color.BLACK);
                for (int x = 0; x < width; x += width / 4) {
                    for (int y = 0; y < height; y += height / 4) {
                        if (((x / (width / 4)) + (y / (height / 4))) % 2 == 0) {
                            g2.fillRect(x, y, width / 4, height / 4);
                        }
                    }
                }
            }
        } finally {
            g2.dispose();
        }
        return img;
    }

    @Test
    @DisplayName("Should detect 100% similarity for identical images")
    void testExactSimilarity() {
        BufferedImage img = createSampleImage(200, 200, true);
        long pHash1 = PerceptualHashAnalyzer.computePHash(img);
        long pHash2 = PerceptualHashAnalyzer.computePHash(img);
        long dHash1 = PerceptualHashAnalyzer.computeDHash(img);
        long dHash2 = PerceptualHashAnalyzer.computeDHash(img);

        assertEquals(0, PerceptualHashAnalyzer.hammingDistance(pHash1, pHash2));
        assertEquals(0, PerceptualHashAnalyzer.hammingDistance(dHash1, dHash2));
        assertEquals(100.0, PerceptualHashAnalyzer.similarityPercentage(pHash1, pHash2), 0.001);
    }

    @Test
    @DisplayName("Should detect high similarity between original and resized photo (Google Photos Storage Saver scenario)")
    void testResizedSimilarity() {
        BufferedImage original = createSampleImage(600, 600, true);
        BufferedImage resized = new BufferedImage(120, 120, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = resized.createGraphics();
        g.drawImage(original.getScaledInstance(120, 120, Image.SCALE_SMOOTH), 0, 0, null);
        g.dispose();

        long pHashOrig = PerceptualHashAnalyzer.computePHash(original);
        long pHashResized = PerceptualHashAnalyzer.computePHash(resized);

        int pDist = PerceptualHashAnalyzer.hammingDistance(pHashOrig, pHashResized);
        double pSim = PerceptualHashAnalyzer.similarityPercentage(pHashOrig, pHashResized);

        // Distance should be small (<= 4 bits difference across 64 bits)
        assertTrue(pDist <= 4, "Hamming distance of resized image should be <= 4, was " + pDist);
        assertTrue(pSim >= 93.0, "Similarity of resized image should be >= 93%, was " + pSim);
    }

    @Test
    @DisplayName("Should detect distinctly low similarity between two unrelated images")
    void testDifferentImagesSimilarity() {
        BufferedImage imgA = createSampleImage(200, 200, true);
        BufferedImage imgB = createSampleImage(200, 200, false);

        long pHashA = PerceptualHashAnalyzer.computePHash(imgA);
        long pHashB = PerceptualHashAnalyzer.computePHash(imgB);

        int dist = PerceptualHashAnalyzer.hammingDistance(pHashA, pHashB);
        double sim = PerceptualHashAnalyzer.similarityPercentage(pHashA, pHashB);

        assertTrue(dist >= 12, "Hamming distance between unrelated images should be >= 12, was " + dist);
        assertTrue(sim <= 80.0, "Similarity between unrelated images should be <= 80%, was " + sim);
    }

    @Test
    @DisplayName("Should calculate file-based similarity correctly via ImageSimilarityAnalyzer contract")
    void testFileBasedSimilarity(@TempDir Path tempDir) throws IOException {
        Path f1 = tempDir.resolve("original.png");
        Path f2 = tempDir.resolve("thumbnail.png");
        Path f3 = tempDir.resolve("unrelated.png");

        ImageIO.write(createSampleImage(400, 400, true), "png", f1.toFile());
        ImageIO.write(createSampleImage(100, 100, true), "png", f2.toFile());
        ImageIO.write(createSampleImage(400, 400, false), "png", f3.toFile());

        assertTrue(analyzer.isSupported(f1.toFile()));

        double simSimilar = analyzer.calculateSimilarity(f1.toFile(), f2.toFile());
        double simDifferent = analyzer.calculateSimilarity(f1.toFile(), f3.toFile());

        assertTrue(simSimilar >= 90.0, "Resized thumbnail similarity should be >= 90%, was " + simSimilar);
        assertTrue(simDifferent < 80.0, "Unrelated image similarity should be < 80%, was " + simDifferent);
    }
}
