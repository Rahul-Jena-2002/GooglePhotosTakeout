# PhotoVault — Backup Integrity Verifier & Engineering Specification

**Status:** Authoritative Merged Engineering Contract & Implementation Plan  
**Target:** Free, open-source, offline-first desktop utility (Windows native distribution via `jpackage`) + Web Companion  
**Version:** 1.0.0-MVP  
**License Target:** MIT or Apache-2.0 (Clean FOSS attribution, zero proprietary telemetry)  

---

## 1. Executive Summary & Core Philosophy

PhotoVault helps photographers and archivists verify with high cryptographic confidence that an external backup folder (e.g., portable SSD, external hard drive, or NAS share) contains the exact bit-for-bit files as an original directory tree (e.g., SD card copy or primary workstation drive).

The application is built around one simple, unshakeable promise:
> **"Does this backup folder contain the exact same files as my original folder?"**

### Core Axioms
1. **100% Offline & Private:** Zero cloud calls, zero accounts, zero analytics, zero external network sockets.
2. **Strict Read-Only Access:** Files are opened strictly with `StandardOpenOption.READ`. The tool never modifies, touches, renames, syncs, or deletes files on source or backup drives.
3. **No False Positives / No False Success:** If any file cannot be read, if a drive disconnects, or if verification is cancelled, the result is marked **Incomplete**—never "Verified".
4. **Transparent Disclosures:** Operating system noise (e.g. `.DS_Store`, `Thumbs.db`) is filtered deliberately, with the filtered count and list explicitly disclosed in the UI and exported report.
5. **Honest Cryptographic Scope:** SHA-256 matching provides extremely strong cryptographic evidence of content equality at the exact moment of verification—not mathematical immortality or a guarantee against future magnetic bit-rot.

---

## 2. Definitive Verification States

To prevent user confusion between read failures, partial scans, and true byte mismatches, PhotoVault classifies runs into exactly three distinct states:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        VERIFICATION OUTCOME                            │
├─────────────────────┬───────────────────────────┬──────────────────────┤
│ 1. VERIFIED         │ 2. DIFFERENCES FOUND      │ 3. INCOMPLETE        │
│ [✓] Green Indicator │ [▲] Amber Indicator       │ [!] Red/Grey Alert   │
│ All in-scope files  │ Discrepancies detected    │ Scan was not able to │
│ matched bit-for-bit │ between original & backup │ finish successfully  │
│ with 0 errors.      │ directory trees.          │ or had read errors.  │
└─────────────────────┴───────────────────────────┴──────────────────────┘
```

### State 1: Verified (Full Bit-for-Bit Match)
- Every in-scope file in the Original folder exists in the Backup folder at the same relative path.
- File sizes match down to the exact byte.
- Independent SHA-256 stream digests match with zero collisions or errors.
- No unreadable, locked, or changing files were encountered.
- *Note on extra files:* If the backup contains extra files not present in the original, PhotoVault displays a notice so the user is informed, while confirming all original files are safely backed up.

### State 2: Differences Found (Discrepancies Detected)
Triggered when all files were readable, but one or more content differences exist:
- **Missing in Backup:** File exists in Original but is absent from Backup (failed transfer).
- **Extra in Backup:** File exists in Backup that was not in Original (debris or older files).
- **Size Mismatch:** File exists in both with identical relative paths, but differing byte lengths (truncated copy).
- **Hash Mismatch:** File sizes are identical, but SHA-256 stream hashes differ (bit-rot or silent corruption).

### State 3: Incomplete (Unresolved Errors / Interrupted)
Triggered when verification cannot be asserted with certainty:
- **User Cancelled:** Operation was aborted prior to inspecting all in-scope files.
- **Read Error / Permission Denied:** A file could not be opened due to OS file locks or permission issues.
- **Drive Disconnected / I/O Timeout:** Source or destination media became unreachable mid-verification.
- **Unstable / Changing File:** A file was modified by another process while PhotoVault was reading it (size or timestamp changed between inventory scan and hash stream).

---

## 3. User Experience & Monochromatic Design System

PhotoVault adopts a modern, high-contrast, distraction-free neutral dark design language (`Zinc 950 / 900 / 800`) with high legibility for photo editors working in darkened studios.

### Design Tokens
| Token | Value | Semantic Role |
| :--- | :--- | :--- |
| `bg-primary` | `#09090B` (Zinc 950) | Main window canvas |
| `bg-surface` | `#18181B` (Zinc 900) | Folder picker cards & telemetry surfaces |
| `border-subtle` | `#27272A` (Zinc 800) | Structural card borders and dividers |
| `text-primary` | `#FAFAFA` (Zinc 50) | High-emphasis headers and primary counts |
| `text-muted` | `#A1A1AA` (Zinc 400) | Secondary metadata and labels |
| `accent-indicator`| `#6366F1` (Indigo 500) | Active scanning pulse & progress bar |
| `status-verified` | `#10B981` (Emerald 500) | Full match verified icon & receipt badge |
| `status-diff` | `#F59E0B` (Amber 500) | Discrepancy warning icon & item count |
| `status-error` | `#EF4444` (Rose 500) | Incomplete / read failure indicator |

### Core Workflow
```
[ 1. Select Folders ] ──► [ 2. Safety Validation ] ──► [ 3. Inventory Scan ] ──► [ 4. SHA-256 Streaming ] ──► [ 5. Result & Report ]
 Original & Backup         Prevent nesting/overlap      Count files & bytes       Independent digests          3-state card + HTML
```

1. **Step 1 — Folder Selection:**
   - Two large drop targets: **Original Folder** (SD card / source drive) and **Backup Folder** (external SSD / HDD).
   - Shows detected path, total drive free space, and drive volume label.
2. **Step 2 — Path & Safety Validation:**
   - Validates that paths exist, are readable, and are not identical.
   - Prevents selecting a nested directory (e.g. backup folder located inside original folder).
   - Validates junction and symlink rules (symlinks escaping root are skipped and flagged).
3. **Step 3 — Quick Inventory & Size Comparison:**
   - Traverses both trees recursively.
   - Filters recognized OS noise files (`.DS_Store`, `Thumbs.db`, `desktop.ini`, `._*`).
   - Categorizes missing, extra, and candidate identical files.
4. **Step 4 — Streaming SHA-256 Verification:**
   - Multi-threaded stream hashing using bounded concurrency (optimized for NVMe/SSD without thrashing spinning HDDs).
   - Displays real-time progress: percentage, processed MB/GB, throughput (MB/s), and estimated time remaining (ETA).
   - Cancellation button acknowledges promptly and closes open stream handles cleanly.
5. **Step 5 — Results Summary & Report:**
   - Clear non-color-dependent status card (Title + Icon + Subtitle).
   - Searchable, filterable list of all discrepancies.
   - Single-click **"Export Verification Report"** generating self-contained HTML and TXT receipts.

---

## 4. Software Architecture & Java Package Layout

The application is structured into modular packages within `photovault`:

```
com.photovault
├── app/
│   ├── PhotoVaultApplication.java        // Main entry point & lifecycle
│   └── AppConfiguration.java             // User settings (buffer size, thread limits)
├── core/
│   ├── DirectoryScanner.java             // Recursive NIO.2 directory traversal & inventory
│   ├── PathValidator.java                // Overlap, nesting & symlink validation
│   ├── FileStabilityGuard.java           // Detects files modified mid-verification
│   └── ExclusionFilter.java              // Configurable OS noise filter (.DS_Store, Thumbs.db)
├── hashing/
│   ├── Sha256StreamHasher.java           // Streaming MessageDigest (SHA-256) implementation
│   ├── HashingTask.java                  // Callable task for bounded ExecutorService
│   └── VerificationEngine.java           // Pipeline coordinator (Inventory -> Hashing -> Comparison)
├── model/
│   ├── FileRecord.java                   // Relative path, size, lastModified, hash
│   ├── DirectoryInventory.java           // Map of relative paths to FileRecords
│   ├── VerificationResult.java           // 3-state outcome: Verified, Differences, Incomplete
│   ├── VerificationDiscrepancy.java      // Missing, Extra, SizeMismatch, HashMismatch, ReadError
│   └── VerificationMetrics.java          // Throughput, elapsed time, byte counts, worker count
├── report/
│   ├── HtmlReportGenerator.java          // Self-contained, responsive HTML verification receipt
│   └── TxtReportGenerator.java           // Plaintext auditable manifest for CLI/archive
└── ui/
    ├── MainWindow.java                   // FlatLaf dark monochromatic frame
    ├── FolderSelectionCard.java          // Reusable source/backup picker component
    ├── VerificationProgressBar.java      // Multi-metric live progress & throughput meter
    ├── DiscrepanciesTable.java           // Filterable table (Missing, Extra, Corrupted, Skipped)
    └── ResultBanner.java                 // Accessible 3-state outcome card
```

---

## 5. Filesystem Safety & Edge Case Engineering

### 5.1. Path Safety & Boundary Protection
- **No Overlapping Paths:** If `Path(Backup).startsWith(Path(Original))` or vice versa, the tool disables the "Verify" action with an explicit warning: *"Source and Backup directories cannot be nested inside each other."*
- **Symlink & Junction Policy:** Symlinks pointing outside the designated root are treated as external references; they are not traversed recursively to prevent directory traversal loops or reading system files.
- **Drive Disconnection Recovery:** In the event of an `IOException` or `NoSuchFileException` during mid-stream hashing, the engine halts the queue, preserves existing verified logs, and marks the result as `Incomplete: Drive Disconnected`.

### 5.2. File Stability & Concurrency Guard
- Before hashing, the file's `size` and `lastModifiedTime` are recorded.
- After the SHA-256 stream completes, the attributes are queried again.
- If the file was modified while being hashed, it is marked as `Unstable / Concurrently Modified` and flagged in the report.

### 5.3. Controlled Resource Utilization
- **Heap Envelope:** Uses fixed streaming buffers (64 KB to 256 KB) directly through `InputStream`. Heap memory never scales with file size; processing a 50 GB video file consumes the exact same ~256 KB RAM buffer as a 2 MB photo.
- **Thread Throttling:** Detects underlying drive type if available, or defaults to `Math.min(Runtime.getRuntime().availableProcessors(), 8)` for SSDs, and bounded to 2-4 threads on spinning external disks to prevent head contention.

---

## 6. Verification Report Specification (HTML & TXT)

When verification finishes, users can export an official **Verification Certificate** to store alongside their archives.

### 6.1. Report Sections
1. **Header & Metadata:**
   - Verification ID (UUID)
   - Completed Timestamp (ISO 8601 & Local Time)
   - PhotoVault Version & Engine Build
2. **Execution Scope:**
   - Original Directory (Sanitized relative view or full local path)
   - Backup Directory
   - Total files scanned & Total bytes verified
   - Verification Mode: `Full Bit-for-Bit SHA-256 Stream Verification`
3. **Outcome Summary Card:**
   - State: `VERIFIED`, `DIFFERENCES FOUND`, or `INCOMPLETE`
   - Matched count, missing count, extra count, checksum mismatch count, and read error count.
4. **Disclosures & Exclusions:**
   - Explicit list of excluded OS noise files (e.g. `2x .DS_Store, 1x Thumbs.db`).
5. **Discrepancy Manifest (if applicable):**
   - Table containing relative paths, expected file size vs backup size, and error reason.
6. **Integrity Signature Block:**
   - Engine certification statement confirming 100% read-only local execution.

---

## 7. Quality Gates & Acceptance Test Matrix

| Test ID | Test Scenario | Acceptance Requirement |
| :--- | :--- | :--- |
| **TEST-01** | Identical 50,000+ photo archive | Status = **Verified**. Zero memory leaks; heap stays `< 256MB`. |
| **TEST-02** | Truncated copy (partial video file) | Status = **Differences Found**. Identifies exact size mismatch. |
| **TEST-03** | Corrupted 1-byte alteration (bit-rot) | Same size, but status = **Differences Found** with SHA-256 mismatch. |
| **TEST-04** | Missing file in backup | Status = **Differences Found**. Missing file displayed in red/amber. |
| **TEST-05** | Extra files in backup | Status = **Differences Found** (or Verified with Extra Files Notice). |
| **TEST-06** | Drive disconnected during run | Status = **Incomplete**. Graceful error dialog; no unhandled crash. |
| **TEST-07** | Cancel during active hashing | UI acknowledges `< 500ms`. Workers shut down orderly. |
| **TEST-08** | Offline network isolation | Zero outbound socket connections made under Wi-Fi disabled or active. |
| **TEST-09** | Strict read-only verification | Source & destination file modification dates remain 100% unaltered. |
| **TEST-10** | HTML/TXT report generation | Exports valid self-contained HTML/TXT within 2 seconds. |

---

## 8. Implementation Roadmap

### Phase 1: MVP (Desktop Java Engine + Web Verification Panel)
- [x] Independent Maven build (`photovault/pom.xml`) with zero parent POM dependencies.
- [x] Monochromatic UI styling and layout specification.
- [ ] Implement `core/DirectoryScanner.java` and `core/PathValidator.java`.
- [ ] Implement `hashing/Sha256StreamHasher.java` and bounded thread pool.
- [ ] Implement `report/HtmlReportGenerator.java` and `report/TxtReportGenerator.java`.
- [ ] Wire up `ui/MainWindow.java` with FlatLaf dark theme.
- [ ] Build Web Companion in `webapp` at `/tool?tab=photovault` with the browser File System Access API.

### Phase 2: Post-MVP Enhancements
- Direct external drive health SMART indicator check.
- Exportable checksum manifests compatible with standard `sha256sum -c` utilities.
- Sound notifications / completion chime for long-running multi-terabyte verification runs.
