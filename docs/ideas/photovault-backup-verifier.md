# PhotoVault — Local Photo Backup Verifier

**Status:** Authoritative Engineering Contract & PRD (MVP)  
**Authoritative Implementation Plan:** [`photovault/plans/photovault-engineering-specification.md`](file:///g:/projectssss/Google%20Takeout/photovault/plans/photovault-engineering-specification.md)  
**Product Type:** Free, open-source, offline-first Windows desktop utility + Web Companion  
**Primary Implementation:** Java (Desktop Native) & Browser Web Worker (Web Edition)  
**License Target:** MIT or Apache-2.0 (Subject to dependency audit & clean FOSS attribution)  

---

## 1. Summary

PhotoVault helps photographers verify that a backup folder contains the same files as an original photo folder or memory-card copy. It compares folder contents and uses independent SHA-256 stream digests to identify missing, extra, or changed files.

The product is designed for non-technical users. Its core experience is:

> **Select folders → Verify → Understand the result → Export a report**

PhotoVault is a verifier, not a backup manager. The MVP does **not** delete, move, rename, overwrite, or synchronize photo files. It opens files in read-only mode and writes a report file only when the user explicitly chooses an export destination.

All verification runs locally on the user's computer. No accounts, cloud services, API calls, telemetry, or media uploads are required.

---

## 2. Problem

Photographers commonly copy large photo and video collections from SD cards to external hard drives, SSDs, NAS-mounted shares, or secondary backup drives. A completed OS copy operation (Windows Explorer / macOS Finder) does not provide a clear, understandable confirmation that every file arrived intact. Silent drive errors, failing USB cables, or interrupted transfers can cause undetected file corruption.

Users may not know how to use command-line hashing tools (`rsync`, `rhash`, `sha256sum`), compare large directory trees, or interpret hex checksum errors. They need a clear, reliable answer to a practical question:

> **"Does this backup folder contain the exact same files as my original folder?"**

PhotoVault makes that verification accessible without requiring users to understand cryptographic digests, filesystems, or CLI syntax.

---

## 3. Goals

- Verify file presence and content between two selected directory trees.
- Identify missing, extra, size-mismatched, and content-mismatched files.
- Make verification status understandable at a glance (non-color dependent).
- Remain 100% offline and process all files locally.
- Avoid modifying source and backup media (strict read-only access).
- Handle large collections smoothly through streaming and bounded concurrency.
- Provide a clear, shareable verification report (HTML / TXT).
- Package the Windows application with a self-contained Java runtime (`jpackage`) for a portable, zero-install distribution.

---

## 4. Non-Goals for MVP

- ❌ Copying or offloading files from memory cards (ingest workflow).
- ❌ Automatic repair, synchronization, deletion, renaming, or overwriting of photos.
- ❌ Cloud backup, accounts, remote storage integrations, or telemetry.
- ❌ Photo editing, RAW conversion, AI culling, or image similarity analysis.
- ❌ Diagnosing physical drive health or guaranteeing future media longevity.
- ❌ Cryptographically signing reports or claiming that plain HTML/JSON reports are tamper-proof.
- ❌ Browser-based edition in the initial release (desktop-first for hardware throughput).

---

## 5. Target Users & Needs

### Primary Users
- Hobbyist and professional photographers who maintain archives on external hard drives and SSDs.
- Users who manage multi-gigabyte photo/video shoots but are uncomfortable with command-line tools.
- Commercial, wedding, and event photographers who want a repeatable, documented verification step before re-formatting camera memory cards.

### User Needs
- Plain-language status rather than hexadecimal hash strings.
- Absolute certainty whether verification completed in full.
- An actionable list of files requiring attention.
- Complete confidence that the tool did not alter or endanger original media.
- An exportable receipt of the verification run to archive alongside client projects.

---

## 6. Product Principles

1. **Local-First:** Photo contents and metadata never leave the user's machine. Zero cloud dependency.
2. **Read-Only Verification:** Selected source and backup files are opened strictly with `StandardOpenOption.READ`.
3. **No False Success:** Any unresolved read error, unstable file, or incomplete scan strictly prevents a full-match result.
4. **Simple by Default:** Present two folder pickers and one primary "Verify" button.
5. **Transparent:** Clearly display what was checked, what was excluded as OS noise, and what could not be read.
6. **Conservative:** Never automatically touch, repair, or delete discrepancies in the MVP.
7. **Honest Claims:** SHA-256 matching provides extremely strong cryptographic confidence in content equality—not a mathematical proof or a guarantee against future drive decay.

---

## 7. Core User Workflow

```text
1. Launch App ──► 2. Select Folders ──► 3. Path Validation ──► 4. Scan & Compare ──► 5. SHA-256 Verification ──► 6. Result & Report
   Zero-install      Original & Backup     Prevent overlap        Inventory check        Bounded streaming            Clear status card
```

1. Launch PhotoVault.
2. Select the **Original folder** (e.g. Memory card or Working SSD).
3. Select the **Backup folder** (e.g. External Backup Drive or NAS mount).
4. PhotoVault validates paths and prevents unsafe, identical, or nested selections.
5. User clicks **Verify**.
6. PhotoVault scans both directory trees and compares relative paths and file sizes.
7. PhotoVault hashes corresponding files using independent buffered SHA-256 streams.
8. Interface displays real-time progress, files processed, throughput, and error counts.
9. When finished, PhotoVault presents a definitive result state.
10. User may optionally export a verification report (HTML / TXT) to a destination of their choice.

---

## 8. MVP Functional Requirements

### 8.1 Folder Selection & Validation
- Separate directory choosers for Original and Backup.
- Recursive traversal of all subdirectories.
- Match files strictly by normalized relative path within the selected roots.
- Detect identical, nested, or overlapping roots and disallow ambiguous comparisons with clear error messages.
- **Link & Junction Policy:** Avoid following symbolic links or Windows directory junctions that point outside the selected root.
- Allow clean user cancellation at any point during scanning or hashing.

### 8.2 Exclusions
- Documented default exclusion list for common OS noise:
  - `.DS_Store`
  - `Thumbs.db`
  - `desktop.ini`
  - `$RECYCLE.BIN`
- Exclusions are visible and reviewable in an Advanced drawer.
- Excluded items must be summarized in the final report so the user knows they were bypassed.

### 8.3 Inventory Comparison
- Build a lightweight relative-path inventory for both trees.
- Store only minimal metadata: relative path, file size, last-modified timestamp (diagnostics only).
- Classify discrepancies:
  - **Missing in Backup:** Exists in Original, absent from Backup.
  - **Extra in Backup:** Exists in Backup, absent from Original.
  - **Size Mismatch:** Same relative path exists in both, but file byte lengths differ.
  - **Content Mismatch:** Same path and size, but independent SHA-256 digests differ.
  - **Could Not Verify:** File unreadable, locked by another process, or changed during hashing.

### 8.4 Content Verification (SHA-256)
- Independent, streaming SHA-256 computation using fixed-size buffers (e.g. 64KB–256KB). Never load whole files into RAM.
- Compare resulting digests byte-by-byte.
- Bounded concurrency (`ExecutorService` tuned to storage type) to prevent disk head thrashing on external HDDs.
- Detect files whose size or timestamp changes mid-verification; mark as **Unstable / Unverified**.
- Unresolved I/O failures record as errors, never matches.

### 8.5 Result States (Tri-State Model)
Do **not** rely on color alone; always pair text labels and distinct icons:

1. **Verified — All Matching (🟢 + Checkmark):** All in-scope files from Original exist in Backup and have matching SHA-256 digests. Zero unresolved read errors. Any extra files are explicitly disclosed and not hidden.
2. **Differences Found (🔴 + Alert Triangle):** One or more missing, extra, size-mismatched, or content-mismatched files detected.
3. **Incomplete / Cancelled (🟡 + Pause/Warning):** One or more files/folders were unreadable, permissions failed, or the user cancelled the operation.

### 8.6 Progress & User Feedback
- Current stage banner: Scanning, Comparing, Hashing, or Completed.
- Quantitative counters: Files verified, bytes processed, throughput (MB/s), elapsed time.
- Low-noise activity log for non-trivial events and errors.
- UI updates marshaled to the Swing Event Dispatch Thread (EDT) at steady 30–60 FPS.

### 8.7 Report Export
- Export destination chosen explicitly by user via file dialog.
- Formats: Clean, self-contained HTML report (readable in any web browser) + optional plain text log.
- Contents: PhotoVault version, timestamp + timezone, folder labels, hashing method (SHA-256), exclusion summary, discrepancy table, and clear disclaimer that the report reflects observed run state without digital signatures.

---

## 9. Safety & Privacy Architecture

- Media files opened strictly in read-only mode (`StandardOpenOption.READ`).
- Zero metadata writes, renames, moves, or deletions in source or backup roots.
- Zero network connectivity, telemetry, remote logging, or crash-report uploads.
- Reports and logs contain zero file content, image thumbnails, or personal information.
- Windows API sleep prevention via `SetThreadExecutionState` (`PowerManager.java`) to prevent system sleep during long drive verifications.

---

## 10. Monochromatic Design System (Photographer-Centric)

In alignment with standard professional photography software (Lightroom, Capture One, DaVinci Resolve), PhotoVault adopts a **clean, monochromatic dark aesthetic**. High-contrast status colors are reserved strictly for semantic states.

### Visual Design Tokens

| Token | Swing / FlatLaf Value | Web / Tailwind Equivalent | Role |
| :--- | :--- | :--- | :--- |
| **Canvas Background** | `#09090b` | `bg-zinc-950` | Pitch dark neutral background |
| **Surface Card** | `#18181b` | `bg-zinc-900` | Elevated panels & containers |
| **Borders & Dividers** | `#27272a` | `border-zinc-800` | Subtle 1px structural outlines |
| **Primary Text** | `#fafafa` | `text-zinc-50` | Headers and verified file counts |
| **Muted Text** | `#a1a1aa` | `text-zinc-400` | Folder paths, labels, file sizes |
| **Success Status** | `#10b981` | `text-emerald-500` | Verified matching state |
| **Difference Status** | `#f43f5e` | `text-rose-500` | Discrepancies and mismatches |
| **Incomplete Status** | `#f59e0b` | `text-amber-500` | Read errors and cancelled runs |

### UI Component Layout
- **Main Screen:** Two large folder selection cards ("Original Folder", "Backup Folder") + prominent "Verify" button. Optional expandable "Advanced Options" drawer (exclusions, concurrency).
- **Results Screen:** Bold status banner (**Verified**, **Differences Found**, or **Incomplete**), summary counters, scrollable discrepancy table, and prominent "Export Report" button.

---

## 11. Technical Approach & Class Structure

### Suggested Java Package Layout
```text
com.photovault
├── ui/
│   ├── MainWindow.java                 # Primary FlatLaf JFrame shell
│   ├── FolderSelectionPanel.java       # Original & Backup path selectors
│   ├── VerificationStatusCard.java     # Tri-state banner (Verified/Diffs/Incomplete)
│   ├── ProgressPanel.java              # Live progress bar, rate, and counters
│   └── DiscrepancyTable.java           # Filterable table of differences
├── core/
│   ├── VerificationService.java        # High-level pipeline coordinator
│   ├── DirectoryScanner.java           # Recursive NIO directory walker & inventory builder
│   ├── FileHasher.java                 # Buffered streaming SHA-256 implementation
│   ├── ComparisonEngine.java           # Inventory & hash diff evaluator
│   └── VerificationCoordinator.java   # Bounded thread executor & worker management
├── model/
│   ├── FileEntry.java                  # Relative path, size, modified time
│   ├── Discrepancy.java                # Enum: MISSING, EXTRA, SIZE_MISMATCH, HASH_MISMATCH, UNREADABLE
│   ├── VerificationProgress.java       # Processed bytes, current file, ETA
│   └── VerificationResult.java         # Tri-state outcome, counters, discrepancy collection
├── report/
│   ├── ReportGenerator.java            # Abstract report contract
│   ├── HtmlReportGenerator.java        # Self-contained dark-mode HTML report
│   └── TextReportGenerator.java        # Plain text log generator
├── safety/
│   ├── PathValidator.java              # Path normalization, loop & junction checks
│   └── CancellationController.java     # Thread-safe atomic cancellation token
└── platform/
    └── PowerManager.java               # Windows SetThreadExecutionState sleep blocker
```

### Packaging & Distribution
- Packaged as a self-contained Windows application using Java LTS `jpackage`.
- Bundles a trimmed, lightweight Java runtime image (no external JRE installation required).
- Produces a direct, portable folder or standalone runner (`PhotoVault.exe`).

---

## 12. Performance & Hardware Discipline

- **No Speculative Marketing Numbers:** Real-world throughput depends on drive bus speeds (USB 2.0 vs USB 3.2 Gen 2x2 vs NVMe).
- **Streaming Buffers:** Files are read sequentially in 64KB–256KB chunks; memory overhead remains constant regardless of file size (e.g. 50MB RAW files vs 80GB 4K video clips).
- **Bounded Queues:** Concurrency is bounded to avoid queueing millions of file descriptors or thrashing mechanical disk arms.
- **Benchmarks Required:** Formal capacity claims will be published only after benchmarking on representative external media.

---

## 13. Error Handling & Edge Cases

- **Unreadable / Locked Files:** Reported explicitly as "Could Not Verify" (flips state to Incomplete).
- **Drive Disconnection:** Catches `NoSuchFileException` / `IOException` gracefully, halts further traversal, and records drive unmount.
- **In-Flight Mutation:** Detected if file length changes mid-stream.
- **Path Lengths & Characters:** Handles Windows extended-length paths (`\\?\`) and Unicode file names.
- **Junctions & Reparse Points:** Traverses directories without following links outside the designated root.

---

## 14. Acceptance Criteria (Definition of Done)

1. **Exact Match:** Identical directory trees produce a `Verified — all matching` result.
2. **Missing Detection:** Files present in Original but missing from Backup are listed by relative path.
3. **Extra Detection:** Files present in Backup but not Original are clearly disclosed.
4. **Content Detection:** Files with identical paths and byte lengths but altered contents are caught by SHA-256.
5. **Size Mismatch:** Detected and reported during pre-hash inventory comparison.
6. **Inaccessible Fail-Safe:** Unreadable files produce an `Incomplete` result, never a false match.
7. **Mutation Handling:** Files modified mid-run are flagged as `Unstable` and not verified.
8. **Clean Cancellation:** Cancel button halts worker threads within 500ms and releases all file handles.
9. **Constant Memory:** Processing multi-gigabyte video files causes zero heap memory spikes.
10. **UI Fluidity:** Directory traversal with 50,000+ files keeps the UI responsive (>30 FPS on EDT).
11. **Strict Read-Only:** File attributes, timestamps, and data remain byte-for-byte unchanged on tested folders.
12. **Zero Network:** Packet inspection confirms zero outbound connections or DNS lookups.
13. **Report Fidelity:** Exported HTML report accurately matches observed run counts and discrepancies.
14. **Safe Paths:** Selecting identical or overlapping folders triggers immediate path validation errors.

---

## 15. Open-Source & Licensing Discipline

- **License:** MIT or Apache 2.0.
- **Permissive Stack:** Uses Java standard libraries (`java.nio`, `java.security.MessageDigest`) and Apache 2.0 / MIT libraries (FlatLaf). Zero GPL or AGPL dependencies.
- **Attribution & SBOM:** A dedicated `THIRD_PARTY_NOTICES` file records all direct and transitive dependencies, bundled fonts, and SVG icons.
- **Asset Integrity:** All icons (Lucide SVG) and fonts are permissively licensed with full redistribution rights.

---

## 16. Sustainability & Monetization

- 100% Free and open-source core application.
- No subscriptions, activation keys, feature gates, or accounts.
- Voluntary community support via GitHub Sponsors / "Buy Me a Coffee" link in the About dialog.
- Zero advertisements, sponsored bundles, or telemetry.

---

## 17. 3-Phase Roadmap

### Phase 1 — MVP (Current Target)
- Windows Java desktop application with FlatLaf monochromatic dark theme.
- Folder selection, path validation, and junction protection.
- Inventory scan + streaming SHA-256 verification.
- Tri-state results card + discrepancy table.
- HTML & text report export.
- Self-contained Windows packaging via `jpackage`.

### Phase 2 — Usability & Refinement
- Full keyboard navigation and screen-reader accessibility.
- Configurable exclusions drawer.
- Benchmark telemetry reporting for storage media profiling.
- Optional saved verification profiles (stored in local user preferences).

### Phase 3 — Optional Extensions
- Verification manifest saving (for instant re-checks against prior runs).
- Browser companion edition for smaller web-friendly folders.
- Separate, opt-in "Copy Missing Files" assistant (strictly decoupled from verifier core).

---

## 18. Success Metrics (Telemetry-Free)

Product quality is validated through reproducible test suites and user research:
- Non-technical photographers can complete a verification on their first attempt without documentation.
- Zero false-positive "Verified" states on corrupted, missing, or unreadable test suites.
- Peak heap memory consumption remains <256MB during multi-hour verification runs.
- Zero byte modifications to source or target media verified via filesystem audit.

---

## 19. Key Product Promise

> **"PhotoVault checks whether your backup matches your original files — locally, read-only, and without requiring technical knowledge."**
