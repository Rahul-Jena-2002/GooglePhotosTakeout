# Tasks: All-in-One Photo Studio & Batch EXIF Editor

## Phase 1: Core Engine & Data Models (Foundation)
- [x] **Task 1: Photo Studio Models & Date Shift Calculator**
  - **Acceptance Criteria:**
    - `StudioEditRequest` model encapsulating date shifts, GPS coordinates, author/copyright presets, and output mode.
    - `DateShiftCalculator` supports relative offsets (`±days, ±hours, ±minutes, ±seconds`) and sequential increments (`baseDate + i * stepSeconds`).
    - Handles leap years, cross-month boundaries, and timezone offsets correctly.
  - **Verification:** Unit tests in `DateShiftCalculatorTest.java` (`mvn test -Dtest=DateShiftCalculatorTest -pl takeoutfix`) passed (5/5).
  - **Scope:** Small (2 files).

- [x] **Task 2: Batch PhotoStudioService Engine**
  - **Acceptance Criteria:**
    - `PhotoStudioService` generates precise ExifTool arguments for images (JPEG, HEIC, PNG, DNG) and videos (MP4, MOV).
    - Dry-run preview mode calculates simulated results without writing to disk.
    - Leverages existing `NativeExifToolEngine` pool with zero new dependencies.
  - **Verification:** Unit tests in `PhotoStudioServiceTest.java` (`mvn test -Dtest=PhotoStudioServiceTest -pl takeoutfix`) passed (3/3).
  - **Scope:** Small (2 files).

## Checkpoint 1: Foundation Quality Gate
- [x] All unit tests pass: `mvn test -pl takeoutfix` (83 tests pass, 0 errors, 0 failures)
- [x] Clean build: `mvn test-compile -pl takeoutfix`

---

## Phase 2: JavaFX UI Implementation (Vertical Slice)
- [x] **Task 3: PhotoStudioFxView Layout & File Selection**
  - **Acceptance Criteria:**
    - Modern shadcn-inspired interface with responsive split pane (Queue table on left, Control cards on right).
    - Drag-and-drop file and directory ingestion.
    - Columns: Filename, Original Date, New Date Preview, Location, Status.
  - **Verification:** UI visual verification in Light & Dark modes.
  - **Scope:** Medium (2-3 files).

- [x] **Task 4: Batch Date Control Panel (Primary Focus)**
  - **Acceptance Criteria:**
    - Segmented selector for **Time Shift** vs. **Fixed Date & Auto-Increment**.
    - Relative sliders / spinners for Days, Hours, Minutes, Seconds.
    - Real-time updates to the "New Date Preview" column in the file table as controls change.
    - Quick presets buttons: `+1 Hour (DST)`, `-1 Hour`, `+1 Min per Photo (Scans)`.
  - **Verification:** Live UI testing of date adjustments.
  - **Scope:** Small (1-2 files).

- [x] **Task 5: Optional Modules (GPS Geotag & Copyright Presets)**
  - **Acceptance Criteria:**
    - Collapsible Location Card with latitude/longitude inputs and one-click "Strip GPS" toggle.
    - Collapsible Presets Card with Artist, Copyright, and Description inputs.
  - **Verification:** UI controls bind cleanly to `StudioEditRequest`.
  - **Scope:** Small (1-2 files).

## Checkpoint 2: UI & Interaction Quality Gate
- [x] Workspace components render cleanly in both Light and Dark themes.
- [x] Zero layout jitter or UI freezes on file ingestion.

---

## Phase 3: Execution, Safety & Integration
- [x] **Task 6: Execution Pipeline & Workspace Registration**
  - **Acceptance Criteria:**
    - Asynchronous batch execution with progress bar, cancellation support, and error summary.
    - Safe non-destructive output mode (copies to export folder by default).
    - `WorkspaceType.PHOTO_STUDIO` registered in `TakeoutFxApplication`, `SidebarNav`, and `UiIcons`.
  - **Verification:** 83/83 unit tests passing cleanly.
  - **Scope:** Medium (3 files).

## Checkpoint 3: Complete & Production Ready
- [x] All unit tests pass (`mvn test -pl takeoutfix`) — 83 tests total.
- [x] AST knowledge graph refreshed (`python -m graphify update .`).
- [x] User review and demonstration.
