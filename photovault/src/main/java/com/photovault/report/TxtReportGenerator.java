package com.photovault.report;

import com.photovault.model.VerificationDiscrepancy;
import com.photovault.model.VerificationResult;

import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Objects;

/**
 * Generates an auditable plaintext verification certificate suitable for archival.
 */
public class TxtReportGenerator {

    private static final DateTimeFormatter FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss z")
            .withZone(ZoneId.systemDefault());

    public static String generate(VerificationResult result) {
        Objects.requireNonNull(result, "result cannot be null");

        StringBuilder sb = new StringBuilder();
        sb.append("================================================================================\n");
        sb.append("                   PHOTOVAULT — VERIFICATION CERTIFICATE                        \n");
        sb.append("================================================================================\n\n");

        sb.append(String.format("VERIFICATION OUTCOME : %s\n", result.state().getDisplayName()));
        sb.append(String.format("Summary              : %s\n", result.summaryMessage()));
        sb.append(String.format("Verification ID      : %s\n", result.id()));
        sb.append(String.format("Timestamp            : %s\n", FORMATTER.format(result.completedAt())));
        sb.append(String.format("Engine Mode          : Full Bit-for-Bit SHA-256 Stream Verification\n\n"));

        sb.append("--------------------------------------------------------------------------------\n");
        sb.append("1. EXECUTION SCOPE\n");
        sb.append("--------------------------------------------------------------------------------\n");
        sb.append(String.format("Original Directory   : %s\n", result.originalPath()));
        sb.append(String.format("Backup Directory     : %s\n", result.backupPath()));
        sb.append(String.format("Original Files Found : %d\n", result.originalInventory().totalFiles()));
        sb.append(String.format("Original Total Bytes : %d (%.2f MB)\n",
                result.originalInventory().totalBytes(),
                result.originalInventory().totalBytes() / (1024.0 * 1024.0)));
        sb.append(String.format("Backup Files Found   : %d\n", result.backupInventory().totalFiles()));
        sb.append(String.format("Backup Total Bytes   : %d (%.2f MB)\n",
                result.backupInventory().totalBytes(),
                result.backupInventory().totalBytes() / (1024.0 * 1024.0)));
        sb.append(String.format("Elapsed Time         : %d ms\n", result.metrics().elapsedMillis()));
        sb.append(String.format("Throughput           : %.2f MB/s\n\n", result.metrics().throughputMegabytesPerSec()));

        sb.append("--------------------------------------------------------------------------------\n");
        sb.append("2. OS METADATA EXCLUSIONS (DISCLOSED)\n");
        sb.append("--------------------------------------------------------------------------------\n");
        if (result.excludedFiles().isEmpty()) {
            sb.append("No OS metadata noise files were excluded.\n\n");
        } else {
            sb.append(String.format("Total Excluded Files : %d (.DS_Store, Thumbs.db, desktop.ini, ._*)\n",
                    result.excludedFiles().size()));
            for (String excluded : result.excludedFiles()) {
                sb.append(String.format("  - %s\n", excluded));
            }
            sb.append("\n");
        }

        sb.append("--------------------------------------------------------------------------------\n");
        sb.append("3. AUDITED DISCREPANCIES\n");
        sb.append("--------------------------------------------------------------------------------\n");
        if (result.discrepancies().isEmpty()) {
            sb.append("Zero discrepancies found. All verified original files match byte-for-byte.\n\n");
        } else {
            sb.append(String.format("Total Discrepancies  : %d\n\n", result.discrepancies().size()));
            for (VerificationDiscrepancy d : result.discrepancies()) {
                sb.append(String.format("[%s] %s\n", d.type().getLabel(), d.relativePath()));
                if (d.originalSize() != null || d.backupSize() != null) {
                    sb.append(String.format("   Size: Original=%s bytes, Backup=%s bytes\n",
                            d.originalSize() != null ? d.originalSize() : "N/A",
                            d.backupSize() != null ? d.backupSize() : "N/A"));
                }
                if (d.originalHash() != null || d.backupHash() != null) {
                    sb.append(String.format("   SHA-256 Original: %s\n", d.originalHash()));
                    sb.append(String.format("   SHA-256 Backup  : %s\n", d.backupHash()));
                }
                if (d.message() != null && !d.message().isBlank()) {
                    sb.append(String.format("   Details: %s\n", d.message()));
                }
                sb.append("\n");
            }
        }

        sb.append("================================================================================\n");
        sb.append("CERTIFICATION: 100% offline, read-only bit-for-bit cryptographic verification.  \n");
        sb.append("No source or backup files were altered, renamed, or modified during verification.\n");
        sb.append("================================================================================\n");

        return sb.toString();
    }
}
