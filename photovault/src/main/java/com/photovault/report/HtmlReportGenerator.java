package com.photovault.report;

import com.photovault.model.VerificationDiscrepancy;
import com.photovault.model.VerificationResult;
import com.photovault.model.VerificationState;

import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Objects;

/**
 * Generates a self-contained, responsive, 100% offline HTML verification certificate.
 * Zero external web fonts, CDN dependencies, or network scripts.
 */
public class HtmlReportGenerator {

    private static final DateTimeFormatter FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss z")
            .withZone(ZoneId.systemDefault());

    public static String generate(VerificationResult result) {
        Objects.requireNonNull(result, "result cannot be null");

        String badgeBg;
        String badgeText;
        String badgeBorder;
        String iconChar;

        if (result.state() == VerificationState.VERIFIED) {
            badgeBg = "#064e3b";      // Emerald 900
            badgeText = "#34d399";    // Emerald 400
            badgeBorder = "#059669";  // Emerald 600
            iconChar = "&#10003;";    // Checkmark
        } else if (result.state() == VerificationState.DIFFERENCES_FOUND) {
            badgeBg = "#451a03";      // Amber 950
            badgeText = "#fbbf24";    // Amber 400
            badgeBorder = "#d97706";  // Amber 600
            iconChar = "&#9888;";     // Warning triangle
        } else {
            badgeBg = "#4c0519";      // Rose 950
            badgeText = "#fb7185";    // Rose 400
            badgeBorder = "#e11d48";  // Rose 600
            iconChar = "&#10007;";    // Cross
        }

        StringBuilder html = new StringBuilder();
        html.append("<!DOCTYPE html>\n");
        html.append("<html lang=\"en\">\n<head>\n");
        html.append("<meta charset=\"UTF-8\">\n");
        html.append("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n");
        html.append("<title>PhotoVault Verification Certificate — ").append(escapeHtml(result.id().toString())).append("</title>\n");
        html.append("<style>\n");
        html.append(":root {\n");
        html.append("  --bg-main: #09090b;\n");
        html.append("  --bg-card: #18181b;\n");
        html.append("  --border-subtle: #27272a;\n");
        html.append("  --text-main: #fafafa;\n");
        html.append("  --text-muted: #a1a1aa;\n");
        html.append("  --accent-indigo: #6366f1;\n");
        html.append("}\n");
        html.append("body {\n");
        html.append("  margin: 0; padding: 32px 16px;\n");
        html.append("  background-color: var(--bg-main);\n");
        html.append("  color: var(--text-main);\n");
        html.append("  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;\n");
        html.append("  line-height: 1.5;\n");
        html.append("}\n");
        html.append(".container { max-width: 900px; margin: 0 auto; }\n");
        html.append(".card {\n");
        html.append("  background: var(--bg-card);\n");
        html.append("  border: 1px solid var(--border-subtle);\n");
        html.append("  border-radius: 12px;\n");
        html.append("  padding: 24px;\n");
        html.append("  margin-bottom: 24px;\n");
        html.append("}\n");
        html.append(".header {\n");
        html.append("  display: flex; justify-content: space-between; align-items: flex-start;\n");
        html.append("  border-bottom: 1px solid var(--border-subtle); padding-bottom: 20px; margin-bottom: 24px;\n");
        html.append("}\n");
        html.append(".status-badge {\n");
        html.append("  display: inline-flex; align-items: center; gap: 8px; padding: 8px 16px;\n");
        html.append("  border-radius: 9999px; font-weight: 600; font-size: 14px;\n");
        html.append("  background: ").append(badgeBg).append("; color: ").append(badgeText).append(";\n");
        html.append("  border: 1px solid ").append(badgeBorder).append(";\n");
        html.append("}\n");
        html.append(".grid {\n");
        html.append("  display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;\n");
        html.append("  margin-top: 16px;\n");
        html.append("}\n");
        html.append(".stat-box {\n");
        html.append("  background: #111113; border: 1px solid var(--border-subtle); border-radius: 8px; padding: 14px;\n");
        html.append("}\n");
        html.append(".stat-label { font-size: 11px; text-transform: uppercase; color: var(--text-muted); }\n");
        html.append(".stat-val { font-size: 18px; font-weight: 700; color: var(--text-main); margin-top: 4px; }\n");
        html.append("table {\n");
        html.append("  width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px;\n");
        html.append("}\n");
        html.append("th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--border-subtle); }\n");
        html.append("th { color: var(--text-muted); font-weight: 600; font-size: 11px; text-transform: uppercase; }\n");
        html.append(".tag-diff { padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }\n");
        html.append(".tag-diff.missing { background: #451a03; color: #fbbf24; border: 1px solid #78350f; }\n");
        html.append(".tag-diff.extra { background: #1e1b4b; color: #818cf8; border: 1px solid #3730a3; }\n");
        html.append(".tag-diff.mismatch { background: #4c0519; color: #f43f5e; border: 1px solid #9f1239; }\n");
        html.append(".tag-diff.error { background: #3f3f46; color: #e4e4e7; border: 1px solid #52525b; }\n");
        html.append(".mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; }\n");
        html.append(".footer-cert {\n");
        html.append("  font-size: 12px; color: var(--text-muted); text-align: center; margin-top: 32px;\n");
        html.append("  border-top: 1px solid var(--border-subtle); padding-top: 20px;\n");
        html.append("}\n");
        html.append("</style>\n</head>\n<body>\n");

        html.append("<div class=\"container\">\n");

        // Header Card
        html.append("  <div class=\"card\">\n");
        html.append("    <div class=\"header\">\n");
        html.append("      <div>\n");
        html.append("        <h1 style=\"margin: 0 0 6px 0; font-size: 24px;\">PhotoVault Verification Certificate</h1>\n");
        html.append("        <div style=\"color: var(--text-muted); font-size: 13px;\">ID: <span class=\"mono\">")
                .append(escapeHtml(result.id().toString())).append("</span></div>\n");
        html.append("      </div>\n");
        html.append("      <div class=\"status-badge\">")
                .append(iconChar).append(" ")
                .append(escapeHtml(result.state().getDisplayName()))
                .append("</div>\n");
        html.append("    </div>\n");

        html.append("    <p style=\"font-size: 15px; margin: 0 0 16px 0;\">")
                .append(escapeHtml(result.summaryMessage())).append("</p>\n");

        // Telemetry Grid
        html.append("    <div class=\"grid\">\n");
        html.append("      <div class=\"stat-box\"><div class=\"stat-label\">Original Files</div><div class=\"stat-val\">")
                .append(result.originalInventory().totalFiles()).append("</div></div>\n");
        html.append("      <div class=\"stat-box\"><div class=\"stat-label\">Original Size</div><div class=\"stat-val\">")
                .append(String.format("%.2f MB", result.originalInventory().totalBytes() / (1024.0 * 1024.0))).append("</div></div>\n");
        html.append("      <div class=\"stat-box\"><div class=\"stat-label\">Backup Files</div><div class=\"stat-val\">")
                .append(result.backupInventory().totalFiles()).append("</div></div>\n");
        html.append("      <div class=\"stat-box\"><div class=\"stat-label\">Throughput</div><div class=\"stat-val\">")
                .append(String.format("%.2f MB/s", result.metrics().throughputMegabytesPerSec())).append("</div></div>\n");
        html.append("    </div>\n");

        // Scope details
        html.append("    <div style=\"margin-top: 20px; font-size: 13px; color: var(--text-muted);\">\n");
        html.append("      <div><strong>Original:</strong> <span class=\"mono\">").append(escapeHtml(result.originalPath().toString())).append("</span></div>\n");
        html.append("      <div style=\"margin-top: 4px;\"><strong>Backup:</strong> <span class=\"mono\">").append(escapeHtml(result.backupPath().toString())).append("</span></div>\n");
        html.append("      <div style=\"margin-top: 4px;\"><strong>Completed:</strong> ").append(escapeHtml(FORMATTER.format(result.completedAt()))).append("</div>\n");
        html.append("    </div>\n");
        html.append("  </div>\n");

        // Discrepancies Card
        if (!result.discrepancies().isEmpty()) {
            html.append("  <div class=\"card\">\n");
            html.append("    <h2 style=\"margin: 0 0 12px 0; font-size: 18px;\">Audited Discrepancies (")
                    .append(result.discrepancies().size()).append(")</h2>\n");
            html.append("    <table>\n");
            html.append("      <thead><tr><th>Type</th><th>Relative Path</th><th>Size Details</th><th>Details</th></tr></thead>\n");
            html.append("      <tbody>\n");
            for (VerificationDiscrepancy d : result.discrepancies()) {
                String tagClass = switch (d.type()) {
                    case MISSING_IN_BACKUP -> "missing";
                    case EXTRA_IN_BACKUP -> "extra";
                    case SIZE_MISMATCH, HASH_MISMATCH -> "mismatch";
                    default -> "error";
                };
                html.append("        <tr>\n");
                html.append("          <td><span class=\"tag-diff ").append(tagClass).append("\">")
                        .append(escapeHtml(d.type().getLabel())).append("</span></td>\n");
                html.append("          <td class=\"mono\">").append(escapeHtml(d.relativePath())).append("</td>\n");
                html.append("          <td>");
                if (d.originalSize() != null || d.backupSize() != null) {
                    html.append(d.originalSize() != null ? d.originalSize() + " B" : "—")
                            .append(" / ")
                            .append(d.backupSize() != null ? d.backupSize() + " B" : "—");
                } else {
                    html.append("—");
                }
                html.append("</td>\n");
                html.append("          <td>").append(escapeHtml(d.message())).append("</td>\n");
                html.append("        </tr>\n");
            }
            html.append("      </tbody>\n");
            html.append("    </table>\n");
            html.append("  </div>\n");
        }

        // Exclusions Card
        if (!result.excludedFiles().isEmpty()) {
            html.append("  <div class=\"card\">\n");
            html.append("    <h2 style=\"margin: 0 0 12px 0; font-size: 16px;\">OS Metadata Exclusions Disclosed (")
                    .append(result.excludedFiles().size()).append(")</h2>\n");
            html.append("    <p style=\"font-size: 13px; color: var(--text-muted); margin: 0 0 12px 0;\">")
                    .append("Filtered operating system noise files (.DS_Store, Thumbs.db, desktop.ini, ._*).")
                    .append("</p>\n");
            html.append("    <ul style=\"font-size: 13px; color: var(--text-muted); margin: 0; padding-left: 20px;\">\n");
            for (String file : result.excludedFiles()) {
                html.append("      <li class=\"mono\">").append(escapeHtml(file)).append("</li>\n");
            }
            html.append("    </ul>\n");
            html.append("  </div>\n");
        }

        // Certification Footer
        html.append("  <div class=\"footer-cert\">\n");
        html.append("    <strong>Certified Read-Only Cryptographic Verification:</strong><br>\n");
        html.append("    This verification was executed strictly offline using independent streaming SHA-256 digests.<br>\n");
        html.append("    Zero source or destination files were modified, moved, renamed, or altered.\n");
        html.append("  </div>\n");

        html.append("</div>\n");
        html.append("</body>\n</html>\n");

        return html.toString();
    }

    private static String escapeHtml(String text) {
        if (text == null) return "";
        return text.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }
}
