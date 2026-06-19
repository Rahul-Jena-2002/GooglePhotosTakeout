# Changelog — webapp/

Material changes only. Doc-style maintenance (typos, formatting) is
not listed here; it's in git history.

## Unreleased — Keys Sync, Prefix Isolation, and Local App Migration

**Date:** 2026-06-19
**Scope:** `webapp/src/react-pages/AdminKeys.tsx`, `webapp/src/react-pages/AdminPaymentGateway.tsx`, `webapp/src/contexts/AuthContext.tsx`, `webapp/functions/local-server.js`, `webapp/functions/index.js`, `src/main/resources/static/index.html`

### What changed

1. **Keys Prefix Isolation & Hardcoding**:
   - Refactored Dodo Payments API Key input fields to visually isolate prefix indicators (`sk_live_` / `sk_test_`) into non-editable blocks.
   - Automatically strip prefix headers on input copy-paste and restore them during DB writes.
2. **Real-time Synchronization**:
   - Added active Snapshot listeners to both Keys and Payment Gateway pages to sync credentials instantly.
   - Integrated a default Master Encryption Key (MEK) fallback (`92elPvQ63jp_SXOmGbLyOgvfcGHVP-GfDbbiyLV4rpw`) for automatic local decryption.
   - Repositioned the eye toggle icons and set `z-10` to avoid focus overlay selection issues.
3. **Backend Dynamic Pricing Host**:
   - Cloud Functions and local server dynamically route Dodo API requests to sandbox or live based on key prefix rather than manual env variables.
4. **Desktop App Vanilla JS Migration**:
   - Replaced React files inside Spring Boot monolith with a responsive, modern static JS frontend.
   - Added STOMP WebSocket streams for progress telemetry and logs.
   - Handled Firebase Google Sign-In popups and plan validations directly in the desktop app.

## Earlier — OOM fix (cursor pagination)

**Date:** 2026-06-17
**Scope:** `webapp/src/lib/indexedDbService.ts`,
`webapp/src/lib/SessionManager.ts`,
`webapp/src/react-pages/ToolWorkspace.tsx`

### Why

Large Google Takeouts (8 000+ files) were crashing the Chrome renderer
with **"Aw Snap"** — a `STATUS_HEAP_CORRUPTION` / OOM kill.
The previous attempt at pagination
(commit `81c3f59`) did not actually paginate: it still called
`getAll('files')` and filtered in memory before slicing. The function
name changed, the heap behaviour did not.

### What changed

1. **`indexedDbService.ts`** — `dbVersion` bumped 2 → 3; new
   non-unique `status` index on the `files` store. The upgrade
   path is idempotent and adds the index in place for users on v2.
   New `getDb()` accessor for index-aware callers.
2. **`SessionManager.ts`** — replaced the fake pagination with real
   cursor-based reads:
   - `getPendingFilesPage(offset, limit)` now uses
     `idx.openCursor(IDBKeyRange.only('pending'), 'next')` and only
     materialises the requested window.
   - `getPendingCount()` uses `IDBIndex.count()` — O(1), no record
     materialisation.
   - `getInFlightFiles()` and `getPendingFiles()` switched to
     cursor + index, capped at 50 000 for safety.
3. **`ToolWorkspace.tsx`** — added `FileRecord` to the type import;
   restored `pageOffset += PAGE_SIZE` (the earlier `offset=0` shortcut
   was correct only under the broken `getAll + filter` semantics and
   would have caused repeated processing of slow rows).

### What did *not* change

- No UI changes. The page looks and behaves identically from the
  user's perspective.
- `piexifjs` try/catch wrappers, the `scanAndRegister` returning
  `{count, totalBytes}`, the dirCache cap, the log tail flush
  interval — all unchanged from commit `81c3f59`. They were real
  wins and remain in place.

### Verification

- `tsc --noEmit` — 4 fewer errors vs baseline (108 vs 112), 0 new
  errors introduced. All remaining errors are pre-existing in
  unrelated files.
- `npm run build` — 535 pages built, 6.06 s, 0 failures.
- `npm run dev` — boots in 1.4 s; `/` and `/tool` return HTTP 200.
- Aw Snap regression scenario (8 000+ file takeout) — to be verified
  manually before merging.

### Docs added

- `docs/INDEX.md`
- `docs/ARCHITECTURE.md`
- `docs/modules/indexed-db-service.md`
- `docs/modules/session-manager.md`
- `docs/modules/tool-workspace.md`
- `docs/modules/exif-restorer.md`
- `docs/modules/deep-exif-restorer.md`
- `docs/runbooks/aw-snap-oom-fix.md`
- `docs/runbooks/indexeddb-schema-migrations.md`
- `docs/runbooks/idb-cursor-pagination.md`
- `docs/runbooks/memory-hygiene.md`
- `docs/runbooks/ui-optimization.md` *(added later — UI perf audit + checklist)*
- `docs/stack-decision.md` *(added later — why we stay on Cloudflare + Firebase)*
- `docs/operations/local-dev.md`
- `docs/operations/firebase.md`
- `docs/operations/sentry.md`
- `docs/CHANGELOG.md` (this file)

---

## Earlier — `81c3f59` fix: Aw Snap OOM and EXIF writable getter

**Date:** 2026-06-17
**Scope:** SessionManager, ToolWorkspace, ExifRestorer, DeepExifRestorer,
AdminUsers, AdminUserDashboard

- Pagination API added (but later found to be incomplete — see
  Unreleased entry above).
- `piexifjs` writable-getter error wrapped in try/catch with
  fallback to original bytes.
- `dirCache` capped at 500 entries with FIFO eviction.
- Log tail flush interval raised 100 ms → 250 ms; cap 1000 → 300.
- Admin "Reset Quota" action added.

## Earlier — `68e4d01` fix: restoration crash and unmatched ZIP files

**Date:** 2026-06-17
**Scope:** SessionManager, ToolWorkspace, ZipMetadataMatcher, public/sitemap.xml

- Restoration crash root-caused and fixed.
- ZIP entries with no matching JSON sidecar no longer abort the run.
