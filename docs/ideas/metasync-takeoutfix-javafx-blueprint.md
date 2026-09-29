# MetaSync & TakeoutFix: JavaFX Migration and Metadata Sync Architecture

## 1. Problem Statement
**How might we** unify Google Takeout metadata restoration and professional RAW/JPEG/XMP metadata synchronization into a single, high-performance JavaFX desktop application—with a clean, shadcn-inspired minimal SaaS workspace—without compromising the proven stability of the underlying ExifTool engine?

---

## 2. Decision Record: Why Merging MetaSync into TakeoutFix is the Right Move

| Model | Verdict | Analysis |
|---|---|---|
| **1. The Monolithic Suite (All 3 in 1: TakeoutFix + MetaSync + PhotoVault)** | ❌ **Rejected** | Violates the single-responsibility principle. PhotoVault is a pure bit-level SHA-256 byte validator; TakeoutFix and MetaSync are photographic metadata parsers and EXIF/XMP injectors. Merging all three into one binary bloats dependencies, complicates security audits, and creates confusion about whether PhotoVault modifies files (PhotoVault is strictly read-only). |
| **2. Independent Standalone Tools (3 Separate Apps)** | ❌ **Rejected** | Forces the user to download and manage multiple runtimes, duplicates ExifTool process orchestration, and fractures the user base for two features (Takeout recovery and RAW/JPEG sync) that target the exact same photo library lifecycle. |
| **3. Domain-Aligned Split (2+1 Model: TakeoutFix Studio [Takeout + MetaSync] & PhotoVault Standalone)** | ✅ **Selected** | **Maximum cohesion and reuse.** TakeoutFix and MetaSync share the same core capabilities: ExifTool binary pooling, tag mapping dictionaries, timestamp parsing, and folder scanning. PhotoVault remains an uncompromised, isolated bit-integrity verifier. |

---

## 3. UI Framework Decision: JavaFX 23 (The shadcn Minimal Desktop Standard)

### Why JavaFX 23 over Swing/FlatLaf for the new unified shell:
1. **Consistency with PhotoVault:** `PhotoVaultFxApp` has already established the project's modern design language: clean vector glyphs, looked-up CSS color tokens, hardware-accelerated rendering, and fluid responsive grids.
2. **True Component Architecture:** JavaFX nodes cleanly decouple layout containers (`HBox`, `VBox`, `BorderPane`, `StackPane`) from styling (`takeoutfix-dark.css` and `takeoutfix-light.css`).
3. **Responsive Comparison Grid:** MetaSync requires interactive side-by-side metadata comparisons with selective diff checkboxes, badge highlights (`Match`, `Different`, `Missing`), and live filtering. JavaFX `TableView` with custom cell factories provides superior performance and virtual scrolling over Swing `JTable`.
4. **Clean Decoupling from Spring:** Spring Core DI continues to wire background engines (`NativeExifToolEngine`, `ExtractionService`, `MetadataSyncService`) on worker threads (`javafx.concurrent.Task`), keeping the JavaFX Application Thread completely responsive.

---

## 4. UI Shell & Navigation Blueprint

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ PhotoTools Studio — TakeoutFix & MetaSync                                 [—] [□] [✕]      │
├──────────────┬──────────────────────────────────────────────────────────────────────────────┤
│ ❖ PhotoTools │ ≡ Header Bar: Current Workspace / Breadcrumb      [Theme ☀/☾] [Help] [User] │
├──────────────┼──────────────────────────────────────────────────────────────────────────────┤
│              │                                                                              │
│  WORKSPACES  │                                                                              │
│              │                                                                              │
│ [⟲ Takeout]  │  [ ACTIVE WORKSPACE CONTAINER (StackPane) ]                                  │
│   Restore    │                                                                              │
│              │  • TakeoutFix Workspace: Archive Picker, Extraction Deck, Live Log Console    │
│ [⇄ MetaSync] │  • MetaSync Workspace: RAW/JPEG Pair Explorer, Tag Diff Table, Sync Rules    │
│   Sync & Diff│                                                                              │
│              │                                                                              │
│  ──────────  │                                                                              │
│              │                                                                              │
│ [🗁 History] │                                                                              │
│ [⚙ Settings] │                                                                              │
│              │                                                                              │
│              │                                                                              │
│ ───────────  │                                                                              │
│ 🔒 100% Local│                                                                              │
│ No Cloud Sync│                                                                              │
└──────────────┴──────────────────────────────────────────────────────────────────────────────┘
```

### Key UI Features:
- **Left Navigation Sidebar (Collapsible):** 220px fixed width (collapsible to 64px icon-only rail). Features Lucide-style vector SVG icons, active indicator bars, and a clear "100% Local Processing" trust badge.
- **Top Header Bar:** Workspace title, breadcrumbs, theme toggle (Dark `#09090B` / Light `#FFFFFF`), and quick status indicators.
- **Workspace Switcher:** Instant, zero-flicker transitions using a managed `StackPane` (switching node visibility without destroying cached state or running tasks).

---

## 5. MetaSync: Core Architecture & Workflow

### A. The 4-Stage Synchronization Pipeline
1. **File Pairing (`FilePairingService`):**
   - Scans Source folder (RAW: `.CR3`, `.NEF`, `.ARW`, `.DNG`, `.RAF`, `.ORF`) and Destination folder (Exported `.JPG`, `.JPEG`, `.TIF`, `.XMP`).
   - Normalizes basenames (handles common export suffixes like `_edited`, `-1`, `-Enhanced-NR`).
   - Groups into `MatchedPair`, `UnpairedSource`, and `AmbiguousMatches`.
2. **Metadata Inspection & Extraction (`MetadataReader`):**
   - Leverages `NativeExifToolEngine` in persistent batch mode (`-stay_open True`).
   - Extracts standardized tags: EXIF capture date, camera make/model, lens, exposure, GPS (lat/long/alt), IPTC/XMP copyright, creator, title, description, keywords, star ratings.
3. **Comparison & Rules Matrix (`MetadataComparator` & `MetadataMappingRules`):**
   - Field-by-field diff: `MATCH`, `DIFF`, `SOURCE_ONLY`, `DEST_ONLY`.
   - Protects technical RAW MakerNotes and non-destructive RAW editing instructions from being erroneously injected into JPEGs.
4. **Safe Synchronization (`MetadataWriter` & `WriteSafetyService`):**
   - **Default: Safe Copy Mode:** Writes changes to a new file or sidecar (`.XMP`) first.
   - **In-Place Mode (Opt-In):** Creates `.original` backup prior to modification.
   - **Post-Write Verification:** Re-reads written metadata via ExifTool to ensure bit-level tag conformance.

---

## 6. Implementation Scope

### In Scope (MVP):
- [x] Configure JavaFX 23 Maven dependencies and plugins in `takeoutfix/pom.xml`.
- [x] Create modular design system CSS (`takeoutfix-dark.css`, `takeoutfix-light.css`) using shadcn tokens.
- [x] Build core JavaFX shell: `AppShell`, `SidebarNav`, `HeaderBar`, and `WorkspaceManager`.
- [x] Port TakeoutFix's restore workflow to JavaFX (`TakeoutRestoreView`).
- [x] Implement MetaSync pairing and diff engine (`FilePairingService`, `MetadataComparator`, `MetaSyncView`).
- [x] ExifTool tag copy execution via persistent process.
- [x] Safe write with verification pass.

### Out of Scope (Not Doing in MVP):
- ❌ **No Cloud Sync or Server Auth:** All operations remain 100% strictly local and offline.
- ❌ **No Modifying RAW Pixels or RAW In-Place Writing:** RAW files remain read-only source references; only JPEGs, TIFFs, or XMP sidecars are updated.
- ❌ **No Monolithic PhotoVault Merging:** PhotoVault remains a dedicated, standalone hashing application in `photovault/`.
- ❌ **No Proprietary Raw Converter Emulation:** MetaSync handles metadata (EXIF, IPTC, XMP), not color profiles, tone curves, or pixel demosaicing.

---

## 7. Migration Roadmap

1. **Phase 1: Maven & JavaFX Scaffolding**
   - Update `takeoutfix/pom.xml` with `javafx-controls`, `javafx-graphics`, `javafx-fxml`, and `javafx-maven-plugin`.
   - Introduce JavaFX theming stylesheets in `src/main/resources/css/`.
2. **Phase 2: Modern JavaFX Application Shell**
   - Create `TakeoutFxApplication.java` entrypoint.
   - Build sidebar navigation with Lucide SVG vector icons.
3. **Phase 3: JavaFX TakeoutRestore Workspace**
   - Re-wire `ExtractionService` and `SessionStatsService` into modern JavaFX cards (`FolderCards`, `ProgressDeck`, `AuditLogTable`).
4. **Phase 4: MetaSync Engine & Workspace**
   - Implement `com.takeoutfix.metasync.core` (`FilePairingService`, `MetadataComparator`, `MetadataSyncService`).
   - Implement `MetaSyncView` with side-by-side comparison `TableView` and tag selection checkboxes.
5. **Phase 5: Verification & Safety Gates**
   - JUnit 5 test suite for pairing rules, tag mapping, and verification gates.
   - End-to-end dry-run verification.
