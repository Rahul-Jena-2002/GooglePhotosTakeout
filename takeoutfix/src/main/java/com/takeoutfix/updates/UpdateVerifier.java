package com.takeoutfix.updates;

import java.io.File;
import java.io.InputStream;
import java.nio.file.Files;
import java.security.MessageDigest;

/**
 * Validates the cryptographic integrity of downloaded OTA update files.
 * Rejects corrupt or tampered binaries before launch.
 */
public class UpdateVerifier {

    /**
     * Computes the SHA-256 hex checksum of a file.
     */
    public static String computeSha256(File file) throws Exception {
        if (file == null || !file.exists()) {
            throw new IllegalArgumentException("File to verify does not exist");
        }

        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] buffer = new byte[65536];
        try (InputStream in = Files.newInputStream(file.toPath())) {
            int read;
            while ((read = in.read(buffer)) != -1) {
                digest.update(buffer, 0, read);
            }
        }

        byte[] hash = digest.digest();
        StringBuilder hex = new StringBuilder();
        for (byte b : hash) {
            hex.append(String.format("%02x", b));
        }
        return hex.toString();
    }

    /**
     * Verifies that the file matches the expected SHA-256 hash.
     * Missing or malformed checksums fail verification.
     */
    public static boolean verifyFile(File file, String expectedSha256) {
        if (file == null || !file.exists() || file.length() == 0) {
            return false;
        }

        if (!hasValidSha256(expectedSha256)) {
            return false;
        }

        try {
            String actualHash = computeSha256(file);
            return actualHash.equalsIgnoreCase(expectedSha256.trim());
        } catch (Exception e) {
            System.err.println("[UpdateVerifier] Verification failed with exception: " + e.getMessage());
            return false;
        }
    }

    static boolean hasValidSha256(String hash) {
        return hash != null && hash.trim().matches("(?i)[0-9a-f]{64}");
    }
}
