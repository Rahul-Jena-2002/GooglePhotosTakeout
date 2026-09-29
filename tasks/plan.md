# Implementation Plan: All-in-One Photo Studio & EXIF Editor (Batch Date, Geotag, Presets)

## Overview
The **Photo Studio Suite** is an advanced batch metadata editor integrated directly into TakeoutFix Studio as a dedicated workspace. While EXIF Viewer is strictly read-only, Photo Studio gives photographers and archivists non-destructive batch editing capabilities. Its primary focus is **Batch Date Remediation** (relative time-shifting for travel/timezone offsets and sequential auto-incrementing for scanned film/albums), supplemented by **Location Tagging/Stripping** and **Copyright Presets**.

---

## Architectural Principles (Ponytail & Safe Engineering)
1. **Reuse Over Reinvention (Ponytail):**
   - Leverage the existing `NativeExifToolEngine` worker pool (`-stay_open 1`) for all deep metadata writes (JPEG, HEIC, PNG, MP4, MOV, DNG, RAW).
   - Standard Java 26 NIO (`Files`, `BasicFileAttributeView`) for filesystem timestamp synchronizations.
   - Zero new external libraries or Maven dependencies.
2. **Safety & Zero Data Loss (Safe Engineering):**
   - **Safe Copy Pipeline:** By default, writes output to an export destination or preserves an untouched backup before mutating.
   - Atomic in-place operations (`-overwrite_original_in_place`) only when explicitly requested by user with safety checks.
   - Pre-flight validation: verifies read/write permissions and disk space before initiating batch processing.
3. **Responsive UI (JavaFX SaaS Architecture):**
   - Heavy ExifTool I/O runs asynchronously on background thread pools (`CompletableFuture` / virtual threads).
   - Real-time progress bar, live thumbnail strip/grid, and before-and-after date comparison preview table.

---

## Architecture & Dependency Map
```text
TakeoutFxApplication (WorkspaceType.PHOTO_STUDIO)
  │
  ├── SidebarNav / HeaderBar (Studio Nav Item)
  │
  ├── PhotoStudioFxView (UI Container)
  │     ├── FileQueuePanel (Table / File List with Status)
  │     ├── DateRemediationCard (Shift ±H/M/S or Base + Increment)
  │     ├── LocationCard (GPS Coordinates & Privacy Strip)
  │     ├── PresetCard (Artist, Copyright, Description)
  │     └── StudioExecutionFooter (Progress Bar, Dry Run, Execute Batch)
  │
  └── PhotoStudioService (Backend Core Engine)
        ├── NativeExifToolEngine (Reused persistent worker pool)
        ├── DateShiftCalculator (Calculates timestamps and dry-run preview)
        └── OutputSafetyManager (Destination directory & backup handler)
```

---

## Task List

### Phase 1: Core Engine & Data Models (Foundation)
- [ ] **Task 1: Photo Studio Models & Date Shift Calculator**
  - Define `StudioEditRequest` (date shifts, GPS coordinates, presets, destination settings).
  - Implement `DateShiftCalculator` supporting relative offset (`±days, ±hours, ±minutes`) and sequential increment (`baseDate + i * step`).
  - Unit tests covering edge cases (leap years, month rollovers, negative shifts).
- [ ] **Task 2: Batch PhotoStudioService Engine**
  - Implement `PhotoStudioService` interfacing with `NativeExifToolEngine`.
  - Build command arguments: `-DateTimeOriginal`, `-CreateDate`, `-ModifyDate`, `-GPSLatitude`, `-GPSLongitude`, `-Artist`, `-Copyright`.
  - Implement dry-run preview generator (shows before vs. calculated after dates without touching disk).

### Checkpoint: Foundation
- [ ] All unit tests pass (`mvn test -pl takeoutfix`).
- [ ] No regression on existing TakeoutFix or MetaSync suites.

### Phase 2: JavaFX UI Implementation (Vertical Slice)
- [ ] **Task 3: PhotoStudioFxView Layout & File Selection**
  - Create `PhotoStudioFxView` following shadcn-inspired dark/light theme.
  - Implement drag-and-drop file ingestion, file table with status columns (Filename, Original Date, New Date, Location, Status).
- [ ] **Task 4: Batch Date Control Panel (Primary Focus)**
  - Implement segmented tab selector: `[ Time Shift (± Offset) ]` vs `[ Fixed Date + Auto-Increment ]`.
  - Add quick presets: `+1 Hour (DST)`, `-1 Hour`, `Match Timezone`, `Scanned Photo Album (+1 min/photo)`.
  - Live table preview updating in real-time as offset sliders/pickers change.
- [ ] **Task 5: Optional Modules (GPS Geotag & Copyright Presets)**
  - Expandable `LocationCard`: Decimal lat/long inputs, quick clear/strip GPS toggle.
  - Expandable `PresetsCard`: Artist/Photographer name, Copyright notice, description.

### Checkpoint: UI & Interaction
- [ ] Workspace renders cleanly in both Light and Dark themes.
- [ ] Drag-and-drop adds files and parses initial EXIF dates asynchronously.

### Phase 3: Execution, Safety & Integration
- [ ] **Task 6: Execution Pipeline & Workspace Registration**
  - Implement asynchronous batch execution with progress bar, cancellation token, and error handling.
  - Register `WorkspaceType.PHOTO_STUDIO` in `TakeoutFxApplication`, `SidebarNav`, and `HeaderBar`.
  - Output handling: option to write to designated output directory or in-place with `.original` safety.

### Checkpoint: Final Verification
- [ ] End-to-end execution on sample JPEG, HEIC, and MP4 files.
- [ ] All 75+ unit tests passing cleanly.
- [ ] Knowledge graph updated via `python -m graphify update .`.

---

## Risks and Mitigations
| Risk | Impact | Mitigation |
| :--- | :--- | :--- |
| **File Corruption during In-Place Write** | High | Default to exporting modified photos to a separate directory, preserving folder hierarchy. If in-place is chosen, enforce atomic copy or `.original` backup. |
| **Video Metadata Formatting (MP4/MOV)** | Medium | QuickTime atom tags require `-CreateDate` and `-TrackCreateDate` in UTC format; `NativeExifToolEngine` encapsulates QuickTime formatting. |
| **Slow Batch Parsing on 5,000+ Photos** | Medium | Initial file queue loads metadata via multi-threaded worker pool with progressive UI table population. |

---

## Open Decisions & Feedback
1. **Destination Default:** Should the studio default to outputting to a separate folder (`[Source]_studio_export/`) to prevent modifying originals? *(Recommended: Yes, per safe engineering).*
2. **Sidebar Placement:** Position directly under **EXIF Viewer** in the primary navigation list.
