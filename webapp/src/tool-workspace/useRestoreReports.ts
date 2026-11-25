import { useRef, type RefObject } from "react";
import type { ActiveSession } from "../lib/SessionManager";

type ReportTotals = { scanned: number; matched: number; unmatched: number; exifFailed: number; errors: number };

export function useRestoreReports(currentSessionRef: RefObject<ActiveSession | null>) {
  const auditLogLinesRef = useRef<string[]>([]);
  const issuesLogLinesRef = useRef<string[]>([]);
  const latestAuditLogRef = useRef<string>("");
  const latestIssuesLogRef = useRef<string>("");

  const resetReports = (resumed: boolean) => {
    const notice = 'Earlier file details are unavailable after resuming; check the original output and any earlier reports.';
    auditLogLinesRef.current = resumed ? [notice] : [];
    issuesLogLinesRef.current = resumed ? [notice] : [];
    latestAuditLogRef.current = '';
    latestIssuesLogRef.current = '';
  };

  const downloadReport = (filename: string, finalText: string, lines: string[], emptyText: string) => {
    let text = finalText || lines.join('\r\n') || emptyText;
    if (!finalText && currentSessionRef.current?.outputMode === 'zip') {
      text = "This ZIP restore has not produced a final report. Entries may belong to an archive that was not saved; check your downloads.\r\n\r\n" + text;
    }
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const downloadAuditLog = () => downloadReport('restoration_log.txt', latestAuditLogRef.current, auditLogLinesRef.current, 'No logs recorded.');
  const downloadIssuesLog = () => downloadReport('restoration_issues.txt', latestIssuesLogRef.current, issuesLogLinesRef.current, 'No issues recorded.');

  const finalizeReports = (stats: ReportTotals) => {
    const auditText = [
      "==================================================================",
      "TAKEOUTFIX - RESTORATION LOG",
      "==================================================================",
      `Generated: ${new Date().toISOString()}`,
      `Application: TakeoutFix Metadata Restorer`,
      `Files Processed: ${stats.scanned}`,
      `Metadata Writes Reported Successful: ${stats.matched}`,
      `Files Needing Review: ${stats.unmatched}`,
      `Metadata Fallbacks: ${stats.exifFailed}`,
      `Errors: ${stats.errors}`,
      "==================================================================",
      "Check restored files in your photo app; metadata is not independently verified by this report.",
      "",
      ...auditLogLinesRef.current
    ].join('\r\n');

    const issuesText = [
      "==================================================================",
      "TAKEOUTFIX - RESTORATION ISSUES & REVIEW REPORT",
      "==================================================================",
      `Generated: ${new Date().toISOString()}`,
      `Files Needing Review: ${stats.unmatched}`,
      `Metadata Fallbacks: ${stats.exifFailed}`,
      `Errors: ${stats.errors}`,
      "==================================================================",
      "",
      ...(issuesLogLinesRef.current.length > 0
        ? issuesLogLinesRef.current
        : [stats.unmatched || stats.exifFailed || stats.errors
          ? "Issues were recorded in the totals; details may be unavailable from a previous session."
          : "No errors or files needing review were recorded."])
    ].join('\r\n');

    latestAuditLogRef.current = auditText;
    latestIssuesLogRef.current = issuesText;
    return { auditText, issuesText };
  };

  return { auditLogLinesRef, issuesLogLinesRef, resetReports, downloadAuditLog, downloadIssuesLog, finalizeReports };
}
