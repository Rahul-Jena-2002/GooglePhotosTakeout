package com.takeoutfix.dedup.analysis;

import javax.imageio.ImageIO;
import java.awt.Graphics2D;
import java.awt.Image;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.util.Arrays;
import java.util.Locale;
import java.util.Set;

/**
 * Pure Java implementation of Difference Hash (dHash) and DCT-based Perceptual Hash (pHash).
 * Zero external dependencies. Highly resilient against resizing, recompression, and minor adjustments.
 */
public class PerceptualHashAnalyzer implements ImageSimilarityAnalyzer {

    private static final Set<String> SUPPORTED_EXTENSIONS = Set.of(
            "jpg", "jpeg", "png", "bmp", "gif", "wbmp", "webp", "tif", "tiff"
    );

    // Precomputed cosine factors for 32x32 DCT downscaled to 8x8 low frequency
    private static final double[][] COS_TABLE = new double[32][8];

    static {
        for (int i = 0; i < 32; i++) {
            for (int k = 0; k < 8; k++) {
                COS_TABLE[i][k] = Math.cos(((2 * i + 1) * k * Math.PI) / 64.0);
            }
        }
    }

    @Override
    public boolean isSupported(File file) {
        if (file == null || !file.isFile() || file.length() == 0) return false;
        String name = file.getName().toLowerCase(Locale.ROOT);
        int dot = name.lastIndexOf('.');
        if (dot < 0 || dot == name.length() - 1) return false;
        return SUPPORTED_EXTENSIONS.contains(name.substring(dot + 1));
    }

    @Override
    public double calculateSimilarity(File file1, File file2) {
        if (!isSupported(file1) || !isSupported(file2)) return 0.0;
        try {
            BufferedImage img1 = ImageIO.read(file1);
            BufferedImage img2 = ImageIO.read(file2);
            if (img1 == null || img2 == null) return 0.0;

            long pHash1 = computePHash(img1);
            long pHash2 = computePHash(img2);
            long dHash1 = computeDHash(img1);
            long dHash2 = computeDHash(img2);

            double pSim = similarityPercentage(pHash1, pHash2);
            double dSim = similarityPercentage(dHash1, dHash2);

            return Math.max(dSim, (pSim * 0.5 + dSim * 0.5));
        } catch (Exception e) {
            return 0.0;
        }
    }

    @Override
    public String getAlgorithmName() {
        return "Perceptual Hash (pHash + dHash)";
    }

    /**
     * Calculates Hamming distance between two 64-bit perceptual hashes.
     * 0 = identical bitstream, 64 = completely inverted bitstream.
     */
    public static int hammingDistance(long hash1, long hash2) {
        return Long.bitCount(hash1 ^ hash2);
    }

    /**
     * Converts Hamming distance to percentage similarity (0.0% to 100.0%).
     */
    public static double similarityPercentage(long hash1, long hash2) {
        int dist = hammingDistance(hash1, hash2);
        return Math.max(0.0, (64.0 - dist) / 64.0 * 100.0);
    }

    /**
     * Computes 64-bit Difference Hash (dHash) by downscaling to 9x8 and tracking horizontal gradients.
     */
    public static long computeDHash(BufferedImage img) {
        if (img == null) return 0L;
        BufferedImage scaled = resizeGrayscale(img, 9, 8);
        long hash = 0L;

        for (int y = 0; y < 8; y++) {
            for (int x = 0; x < 8; x++) {
                int left = scaled.getRaster().getSample(x, y, 0);
                int right = scaled.getRaster().getSample(x + 1, y, 0);
                if (left > right) {
                    hash |= (1L << (y * 8 + x));
                }
            }
        }
        return hash;
    }

    /**
     * Computes 64-bit Discrete Cosine Transform Perceptual Hash (pHash).
     * Downscales to 32x32, extracts 8x8 low frequencies, and compares against median.
     */
    public static long computePHash(BufferedImage img) {
        if (img == null) return 0L;
        BufferedImage scaled = resizeGrayscale(img, 32, 32);

        double[][] vals = new double[32][32];
        for (int y = 0; y < 32; y++) {
            for (int x = 0; x < 32; x++) {
                vals[y][x] = scaled.getRaster().getSample(x, y, 0);
            }
        }

        // Compute 8x8 low-frequency DCT coefficients
        double[][] dct = new double[8][8];
        double[] coeffList = new double[64];
        int idx = 0;

        for (int u = 0; u < 8; u++) {
            for (int v = 0; v < 8; v++) {
                double sum = 0.0;
                for (int x = 0; x < 32; x++) {
                    for (int y = 0; y < 32; y++) {
                        sum += vals[y][x] * COS_TABLE[x][u] * COS_TABLE[y][v];
                    }
                }
                double cu = (u == 0) ? (1.0 / Math.sqrt(2.0)) : 1.0;
                double cv = (v == 0) ? (1.0 / Math.sqrt(2.0)) : 1.0;
                double val = 0.25 * cu * cv * sum;
                dct[u][v] = val;
                coeffList[idx++] = val;
            }
        }

        // Compute median (excluding DC component at [0][0] for better contrast variance)
        double[] withoutDc = Arrays.copyOfRange(coeffList, 1, 64);
        Arrays.sort(withoutDc);
        double median = withoutDc[withoutDc.length / 2];

        // Construct 64-bit hash
        long hash = 0L;
        for (int i = 0; i < 64; i++) {
            if (coeffList[i] > median) {
                hash |= (1L << i);
            }
        }
        return hash;
    }

    /**
     * Resizes the input image to target dimensions in 8-bit grayscale using progressive multi-step downsampling.
     */
    public static BufferedImage resizeGrayscale(BufferedImage src, int width, int height) {
        int w = src.getWidth();
        int h = src.getHeight();
        BufferedImage current = src;

        // Progressive multi-step half-scaling to prevent high-frequency aliasing
        while (w > width * 2 || h > height * 2) {
            w = Math.max(width, w / 2);
            h = Math.max(height, h / 2);
            BufferedImage next = new BufferedImage(w, h, BufferedImage.TYPE_BYTE_GRAY);
            Graphics2D g = next.createGraphics();
            try {
                g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
                g.drawImage(current, 0, 0, w, h, null);
            } finally {
                g.dispose();
            }
            current = next;
        }

        BufferedImage dest = new BufferedImage(width, height, BufferedImage.TYPE_BYTE_GRAY);
        Graphics2D g2 = dest.createGraphics();
        try {
            g2.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            g2.drawImage(current, 0, 0, width, height, null);
        } finally {
            g2.dispose();
        }
        return dest;
    }

    /**
     * Helper to compute both hashes directly from a file.
     */
    public static LongPair computeFileHashes(File file) {
        if (file == null || !file.exists()) return null;
        try {
            BufferedImage img = ImageIO.read(file);
            if (img == null) return null;
            return new LongPair(computePHash(img), computeDHash(img));
        } catch (IOException e) {
            return null;
        }
    }

    public static class LongPair {
        public final long pHash;
        public final long dHash;

        public LongPair(long pHash, long dHash) {
            this.pHash = pHash;
            this.dHash = dHash;
        }
    }
}
