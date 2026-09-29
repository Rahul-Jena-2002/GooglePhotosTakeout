package com.takeoutfix.dedup.analysis;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("Image Similarity Analyzer Suite Tests")
class ImageSimilarityAnalyzerTest {

    private final ExactHashAnalyzer exactHash = new ExactHashAnalyzer();
    private final OpenCvFeatureMatcher openCvMatcher = new OpenCvFeatureMatcher();

    @Test
    @DisplayName("ExactHashAnalyzer should calculate SHA-256 similarity")
    void testExactHashAnalyzer(@TempDir Path tempDir) throws IOException {
        Path f1 = tempDir.resolve("pic1.jpg");
        Path f2 = tempDir.resolve("pic1_copy.jpg");
        Path f3 = tempDir.resolve("pic2.jpg");

        Files.writeString(f1, "EXACT_PIXEL_DATA_12345", StandardCharsets.UTF_8);
        Files.writeString(f2, "EXACT_PIXEL_DATA_12345", StandardCharsets.UTF_8);
        Files.writeString(f3, "DIFFERENT_PIXEL_DATA_99999", StandardCharsets.UTF_8);

        assertTrue(exactHash.isSupported(f1.toFile()));
        assertEquals("SHA-256 Exact Hash", exactHash.getAlgorithmName());

        assertEquals(100.0, exactHash.calculateSimilarity(f1.toFile(), f2.toFile()));
        assertEquals(0.0, exactHash.calculateSimilarity(f1.toFile(), f3.toFile()));
    }

    @Test
    @DisplayName("OpenCvFeatureMatcher should provide status and graceful fallback without native crash")
    void testOpenCvGracefulFallback(@TempDir Path tempDir) throws IOException {
        assertNotNull(OpenCvFeatureMatcher.getAvailabilityStatus());
        assertNotNull(openCvMatcher.getAlgorithmName());

        Path f1 = tempDir.resolve("photoA.png");
        Path f2 = tempDir.resolve("photoB.png");
        Files.writeString(f1, "SAMPLE_A", StandardCharsets.UTF_8);
        Files.writeString(f2, "SAMPLE_B", StandardCharsets.UTF_8);

        assertTrue(openCvMatcher.isSupported(f1.toFile()));
        // Must execute gracefully without crashing or throwing UnsatisfiedLinkError
        assertDoesNotThrow(() -> {
            double sim = openCvMatcher.calculateSimilarity(f1.toFile(), f2.toFile());
            assertTrue(sim >= 0.0 && sim <= 100.0);
        });
    }
}
