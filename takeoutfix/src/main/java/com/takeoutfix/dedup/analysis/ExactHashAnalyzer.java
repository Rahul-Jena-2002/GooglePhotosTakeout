package com.takeoutfix.dedup.analysis;

import java.io.File;
import java.io.FileInputStream;
import java.security.MessageDigest;

/**
 * Computes exact byte similarity using cryptographic SHA-256 hashing.
 */
public class ExactHashAnalyzer implements ImageSimilarityAnalyzer {

    @Override
    public boolean isSupported(File file) {
        return file != null && file.isFile() && file.length() > 0;
    }

    @Override
    public double calculateSimilarity(File file1, File file2) {
        if (!isSupported(file1) || !isSupported(file2)) return 0.0;
        if (file1.length() != file2.length()) return 0.0;

        String h1 = computeSha256(file1);
        String h2 = computeSha256(file2);
        if (h1 == null || h2 == null) return 0.0;

        return h1.equalsIgnoreCase(h2) ? 100.0 : 0.0;
    }

    @Override
    public String getAlgorithmName() {
        return "SHA-256 Exact Hash";
    }

    public String computeSha256(File file) {
        try (FileInputStream fis = new FileInputStream(file)) {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] buf = new byte[65536];
            int read;
            while ((read = fis.read(buf)) != -1) {
                md.update(buf, 0, read);
            }
            byte[] digest = md.digest();
            StringBuilder sb = new StringBuilder();
            for (byte b : digest) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception e) {
            return null;
        }
    }
}
