# Runbook — Aw Snap OOM fix

## TL;DR

On takeouts with **8 000+ files**, the Chrome renderer process was being
killed with **"Aw Snap"** (Chrome's `STATUS_HEAP_CORRUPTION` / `OOM`
crash). The cause was `SessionManager` calling
`indexedDbService.getAll('files')` to read every `FileRecord` row at
once. Each row holds live `FileSystemHandle` references, which are
expensive to retain in V8. For a 10 000-row takeout the heap spiked to
~1.5 GB before the kill.

The fix was a real cursor-paginated read using a new `status` index
on the `files` store, so we only ever materialise `PAGE_SIZE = 200`
records at a time.

## Timeline

| Date | Symptom | Action |
|---|---|---|
| Pre-fix | "Aw Snap" tab crash on large takeouts | — |
| Commit `68e4d01` | — | Restoration crash fix (unrelated) |
| Commit `81c3f59` | First attempt at pagination | **Incomplete**: the new `getPendingFilesPage` still did a full `getAll + filter` internally. The function name suggested pagination but the behaviour didn't change. |
| This change | True cursor pagination | New `status` index + cursor + `IDBIndex.count`. Verified with local 8k+ takeout. |

## Why commit `81c3f59` didn't actually fix it

```ts
// Before this runbook's fix:
public async getPendingFilesPage(offset: number, limit: number = 200): Promise<FileRecord[]> {
  const all = await indexedDbService.getAll('files') as FileRecord[];   // ← still O(n)
  const pending = all.filter(f => f.status === 'pending');              // ← still O(n)
  return pending.slice(offset, offset + limit);                          // ← discards after materialising
}
```

`getAll` returns the entire array. `filter` allocates a second array.
`slice` allocates a third. The `limit` is enforced only after the heap
spike. **The function was paginated in name only.**

Worse: `ToolWorkspace.tsx` was changed to call
`getPendingFilesPage(0, PAGE_SIZE)` on every iteration, on the
assumption that completed records would "drop out of the filter."
That would have been fine if `getAll` was cheap, but it wasn't — and
even if it were, the first 200 records would still be the same first
200 records on every call, leading to repeated processing of any
slow-completing row that hadn't yet flipped to `'completed'`.

## The actual fix

### 1. New `status` index in IndexedDB

`webapp/src/lib/indexedDbService.ts`:

```ts
private dbVersion = 3;     // was 2
// ...
if (!database.objectStoreNames.contains('files')) {
  const filesStore = database.createObjectStore('files');
  filesStore.createIndex('status', 'status', { unique: false });
} else if (!database.transaction('files', 'readonly').objectStore('files').indexNames.contains('status')) {
  database.transaction('files', 'readwrite').objectStore('files')
    .createIndex('status', 'status', { unique: false });
}
```

The `else if` handles the upgrade path for users whose DB is at v2:
the index is added in place, no data migration needed.

### 2. Cursor-paginated reads in `SessionManager`

`webapp/src/lib/SessionManager.ts`:

```ts
public async getPendingFilesPage(offset: number, limit: number = 200): Promise<FileRecord[]> {
  return this.cursorPageByStatus('pending', offset, limit);
}

public async getPendingCount(): Promise<number> {
  return this.countByStatus('pending');
}

private async countByStatus(status): Promise<number> {
  const db = await indexedDbService.getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('files', 'readonly');
    const req = tx.objectStore('files').index('status').count(IDBKeyRange.only(status));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

private async cursorPageByStatus(status, offset, limit): Promise<FileRecord[]> {
  const db = await indexedDbService.getDb();
  return new Promise((resolve, reject) => {
    const out: FileRecord[] = [];
    let skipped = 0;
    const req = db.transaction('files', 'readonly')
      .objectStore('files').index('status')
      .openCursor(IDBKeyRange.only(status), 'next');
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return resolve(out);
      if (skipped < offset) { skipped++; cursor.continue(); return; }
      out.push(cursor.value);
      if (out.length >= limit) return resolve(out);
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}
```

Only the requested window of records is materialised. V8 GC reclaims
skipped records immediately.

### 3. Worker loop in `ToolWorkspace.tsx` uses real offset

```ts
let pageOffset = 0;
// ...
currentPage = await sessionManager.getPendingFilesPage(pageOffset, PAGE_SIZE);
pageOffset += PAGE_SIZE;
```

The `offset=0` shortcut from `81c3f59` was reverted — it depended on
the broken `getAll + filter` behaviour and would have caused
double-processing under cursor pagination.

## How to verify

1. Open the running app.
2. Pick a takeout with **≥ 8 000 files**.
3. Open Chrome Task Manager (`Shift + Esc`). Watch the renderer
   process.
4. Start the restore. The renderer's memory should **plateau around
   400–500 MB** regardless of takeout size. It used to spike to
   1.5 GB+ and crash.
5. Confirm the restore completes successfully.
6. Sanity-check the IDB store:

   ```js
   // in DevTools console
   const req = indexedDB.open('TakeoutFixDB');
   req.onsuccess = () => {
     const db = req.result;
     console.log('version:', db.version);                              // should be 3
     const idx = db.transaction('files').objectStore('files').index('status');
     idx.count('pending').onsuccess = e => console.log('pending:', e.target.result);
   };
   ```

## Gotchas

- The `files` index is on `status`, but **`FileRecord.status` is mutated
  in place** by `claimFile` and `confirmFile`. The index updates
  automatically (IDB indexes are live) — no manual re-indexing.
- `offset` semantics: the cursor skips `offset` *matching* records, not
  `offset` rows from the start of the store. If statuses shift between
  two cursor calls, you'll see slight drift. Acceptable for our use
  case; the page loop terminates when `globalFileIndex >= totalPending`.
- The 50 000-row cap on `getPendingFiles()` is a safety net for the UI
  counter use case. It is **not** a license to call it on the hot path.
