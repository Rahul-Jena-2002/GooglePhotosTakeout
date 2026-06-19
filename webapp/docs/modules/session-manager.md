# `src/lib/SessionManager.ts`

Owns the lifetime of a restore session: scanning the source, persisting
file records, claiming and confirming work, and exposing paginated read
APIs to the worker loop. This is the single most performance-sensitive
file in the app.

## Why it exists

The restore flow is a long-running state machine (scan → claim → restore →
confirm → next file). Centralising it here gives the UI a stable
`AsyncIterable<ActiveSession>`-shaped surface to drive and keeps the
storage / worker details out of `ToolWorkspace.tsx`.

## Public types

```ts
export interface ActiveSession {
  id: string;
  uid: string;
  status: 'initializing' | 'scanning' | 'processing'
         | 'completed' | 'paused' | 'failed' | 'cancelled';
  takeoutName: string;
  takeoutHandle: FileSystemDirectoryHandle | null;
  zipFile: File | null;
  outputHandle: FileSystemDirectoryHandle | null;
  totalFiles: number;
  scannedCount: number;
  matchedCount: number;
  unmatchedCount: number;
  errorCount: number;
  bytesProcessed: number;
  startedAt: number;
  lastUpdatedAt: number;
}

export interface FileRecord {
  id: string;                       // `${sessionId}:${relativePath.join('/')}`
  sessionId: string;
  filename: string;
  relativePath: string[];
  fileHandle?: FileSystemFileHandle;
  dirHandle?: FileSystemDirectoryHandle;
  zipPath?: string;
  epochSec: number | null;          // resolved during processing, not scan
  lat?: number | null;
  lng?: number | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  bytes: number;
  error?: string;
}
```

## Public methods (UI-facing)

| Method | Purpose | Performance notes |
|---|---|---|
| `createSession(source)` | Allocate a new `ActiveSession`, persist to IDB | One write; cheap. |
| `restoreSession()` | Re-hydrate `currentSession` from IDB on app reload | One read; cheap. |
| `scanAndRegister(onProgress)` | Walk the source, write `FileRecord` rows, return `{count, totalBytes}` | **Batch of 100 + `setTimeout(0)` GC yield every batch** to keep V8 happy. |
| `revertInFlightFiles()` | On reload, flip any `'processing'` rows back to `'pending'` | Cursor over `status` index, single batched `setAll`. |
| `getPendingCount()` | O(1) count of pending rows | `IDBIndex.count(IDBKeyRange.only('pending'))` — no record materialisation. |
| `getPendingFilesPage(offset, limit)` | Next PAGE_SIZE pending records | Cursor on `status` index, only the window is materialised. |
| `getPendingFiles()` | All pending records (UI counter only) | Capped at 50 000. |
| `getInFlightFiles()` | All `'processing'` records | Cursor + cap. |
| `claimFile(fileId)` | Mark one record `'processing'` | Single `set`. |
| `confirmFile(fileId, status, bytes, epoch?, error?)` | Mark one record `'completed'/'failed'` and update session totals | Single `set` + delta-write to session. |

## Internal helpers (the engine room)

```ts
private async scanDirectorySource(root, onProgress): Promise<{count, totalBytes}>
private async scanZipSource(file, onProgress): Promise<{count, totalBytes}>

private async countByStatus(status): Promise<number>
private async cursorPageByStatus(status, offset, limit): Promise<FileRecord[]>
```

The two `cursorPageByStatus` and `countByStatus` are the optimisation
landed in the Aw Snap fix. They sit on top of the new `status` index in
[`indexedDbService`](./indexed-db-service.md) and never call
`getAll('files')`. The full rationale is in
[`runbooks/aw-snap-oom-fix.md`](../runbooks/aw-snap-oom-fix.md).

## Performance contract

| Operation | Heap usage | Notes |
|---|---|---|
| `scanAndRegister` | Flat — writes in 100-row batches and yields to GC every batch | `setTimeout(0)` is load-bearing; do not remove. |
| `getPendingCount` | O(1) | Pure index count, returns a number. |
| `getPendingFilesPage(0, 200)` | 200 records in memory | Drops them at the end of the page loop. |
| `claimFile` | O(1) | One row put. |
| `confirmFile` | O(1) | One row put + session totals update. |

**Never** call `getPendingFiles()` from a hot path — it materialises the
full pending set. It exists only for UI counters that genuinely need all
the rows (and is still capped at 50 000).

## Concurrency model

- Single `SessionManager` instance per app load.
- The worker loop in `ToolWorkspace.tsx` is the only caller of
  `claimFile` / `confirmFile` for a given session. There is no
  cross-tab locking — opening the same session in two tabs is undefined.
- Status transitions are linear: `pending → processing → (completed|failed)`.
  `revertInFlightFiles()` rewinds `processing → pending`.

## How to test

1. **Small takeout (<100 files)**: Scan a folder, confirm `totalFiles`
   matches and the count drops to zero at completion. Open DevTools and
   watch the `files` store transition through statuses.
2. **Large takeout (8 000+ files)**: This is the regression suite for
   the OOM fix. Open Activity Monitor / Task Manager and watch the
   renderer process — should stay under ~500 MB. Before the cursor
   pagination it would spike to 1.5 GB+ and Chrome would kill the tab.
3. **Mid-run reload**: Click Start, then refresh the page before
   completion. On reload, `revertInFlightFiles()` should flip the
   in-flight rows and processing should resume without double-writing
   the same file. Verify by checking `matchedCount` doesn't increment
   past `totalFiles`.
4. **Corrupt / unmatched sidecars**: Drop a stray `foo.json` next to
   a non-JPEG and confirm the file ends up `unmatched` and is still
   written to the output.

## Common mistakes to avoid

- ❌ Calling `getAll('files')` from a hot path. Use
  `cursorPageByStatus` (private) or `getPendingFilesPage` / `getInFlightFiles`.
- ❌ Forgetting to null out the `currentPage` array between pages in the
  worker loop — those `FileRecord`s still hold `FileSystemHandle` refs.
- ❌ Awaiting `setTimeout(0)` away in the scan loop thinking it's
  redundant. It's the only thing preventing the V8 major GC from
  blocking the scan for 200+ ms on big takeouts.
- ❌ Adding a new field to `FileRecord` without thinking about whether
  callers will need to filter on it — if yes, you need an index in
  `indexedDbService.ts` and a dbVersion bump.
