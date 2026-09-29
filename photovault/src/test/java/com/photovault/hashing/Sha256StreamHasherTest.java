package com.photovault.hashing;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.*;

class Sha256StreamHasherTest {

    @Test
    @DisplayName("Streaming hash matches Java standard MessageDigest")
    void testStandardDigestMatch(@TempDir Path tempDir) throws Exception {
        Path file = tempDir.resolve("sample.raw");
        byte[] content = "The quick brown fox jumps over the lazy dog".getBytes(StandardCharsets.UTF_8);
        Files.write(file, content);

        MessageDigest md = MessageDigest.getInstance("SHA-256");
        String expectedHex = HexFormat.of().formatHex(md.digest(content));

        AtomicLong bytesReported = new AtomicLong();
        Sha256StreamHasher.HashResult result = Sha256StreamHasher.hashFile(file, bytesReported::addAndGet);

        assertEquals(expectedHex, result.hashHex());
        assertEquals(content.length, result.bytesRead());
        assertEquals(content.length, bytesReported.get());
        assertTrue(result.isStable());
    }

    @Test
    @DisplayName("Empty file SHA-256 produces standard known empty digest")
    void testEmptyFileHash(@TempDir Path tempDir) throws IOException {
        Path file = tempDir.resolve("empty.txt");
        Files.createFile(file);

        // Known SHA-256 of empty byte array
        String knownEmptyHex = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

        Sha256StreamHasher.HashResult result = Sha256StreamHasher.hashFile(file, null);
        assertEquals(knownEmptyHex, result.hashHex());
        assertEquals(0, result.bytesRead());
        assertTrue(result.isStable());
    }
}
