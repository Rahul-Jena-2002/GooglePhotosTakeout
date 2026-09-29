package com.photovault.report;

import com.photovault.model.*;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

class ReportGeneratorTest {

    @Test
    @DisplayName("Generate valid HTML and TXT reports with discrepancies")
    void testReportGenerationWithDiscrepancies() {
        UUID id = UUID.randomUUID();
        Path orig = Path.of("C:/Photos/Original");
        Path backup = Path.of("D:/Backup/Photos");

        FileRecord origFile = new FileRecord("vacation/img1.jpg", 1024L * 1024L, 1000L);
        DirectoryInventory origInv = DirectoryInventory.of(Map.of("vacation/img1.jpg", origFile), List.of(".DS_Store"));
        DirectoryInventory backupInv = DirectoryInventory.empty();

        VerificationDiscrepancy diff = VerificationDiscrepancy.missing("vacation/img1.jpg", 1024L * 1024L);
        VerificationMetrics metrics = VerificationMetrics.compute(1, 1024L * 1024L, 100, 4);

        VerificationResult result = new VerificationResult(
                id, VerificationState.DIFFERENCES_FOUND, Instant.now(),
                orig, backup, origInv, backupInv, List.of(diff), List.of(".DS_Store"),
                metrics, "Differences found: 1 missing"
        );

        // 1. Plaintext Report Verification
        String txt = TxtReportGenerator.generate(result);
        assertNotNull(txt);
        assertTrue(txt.contains("PHOTOVAULT — VERIFICATION CERTIFICATE"));
        assertTrue(txt.contains("Differences Found"));
        assertTrue(txt.contains("vacation/img1.jpg"));
        assertTrue(txt.contains(".DS_Store"));
        assertTrue(txt.contains("100% offline, read-only"));

        // 2. HTML Report Verification
        String html = HtmlReportGenerator.generate(result);
        assertNotNull(html);
        assertTrue(html.contains("<!DOCTYPE html>"));
        assertTrue(html.contains("PhotoVault Verification Certificate"));
        assertTrue(html.contains("Differences Found"));
        assertTrue(html.contains("vacation/img1.jpg"));
        assertTrue(html.contains(".DS_Store"));
        assertTrue(html.contains("Certified Read-Only Cryptographic Verification"));
    }

    @Test
    @DisplayName("Generate HTML and TXT reports for fully VERIFIED match")
    void testVerifiedReport() {
        UUID id = UUID.randomUUID();
        Path orig = Path.of("C:/Photos");
        Path backup = Path.of("D:/Backup");

        DirectoryInventory inv = DirectoryInventory.of(Map.of("test.jpg", new FileRecord("test.jpg", 500, 100)), List.of());
        VerificationMetrics metrics = VerificationMetrics.compute(1, 1000, 50, 2);

        VerificationResult result = new VerificationResult(
                id, VerificationState.VERIFIED, Instant.now(),
                orig, backup, inv, inv, List.of(), List.of(),
                metrics, "All 1 files matched"
        );

        String txt = TxtReportGenerator.generate(result);
        assertTrue(txt.contains("VERIFICATION OUTCOME : Verified"));
        assertTrue(txt.contains("Zero discrepancies found"));

        String html = HtmlReportGenerator.generate(result);
        assertTrue(html.contains("Verified"));
        assertFalse(html.contains("Audited Discrepancies"));
    }
}
