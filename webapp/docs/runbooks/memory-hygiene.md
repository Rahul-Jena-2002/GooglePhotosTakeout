# Runbook — Memory hygiene for large-file browser workloads

The webapp processes takeouts that can be 50 GB+ and contain 10 000+
files. Most of that data lives in the browser, in V8. The OS will kill
the renderer long before the user's task is done if we don't police
memory. This runbook is the set of rules we apply, with the rationale
for each.

## Rule 1 — Never load the full object store

`getAll('files')` allocates a fresh array of every row, each row
holding live `FileSystemHandle` references. For 10 000 rows, this can
be **300–500 MB** of heap. Use a cursor with the right index, as
described in [`idb-cursor-pagination.md`](./idb-cursor-pagination.md).

The trigger: any code path that calls `indexedDbService.getAll(...)`
on a store whose row count grows with the takeout. **All other
stores (`telemetry`, `checkpoints`, `sessions`) are small and
`getAll` is fine on them.**

## Rule 2 — Drop references between batches

```ts
currentPage = await sessionManager.getPendingFilesPage(pageOffset, PAGE_SIZE);
// ... use currentPage
currentPage = [];                  // ← load-bearing
pageIndex = 0;
```

The array, and the `FileSystemHandle` members inside it, are
GC-collectable the moment the old reference is dropped. Without the
explicit null-out, the closure can keep the previous page alive for
the duration of the next page's processing.

## Rule 3 — Yield to V8 in tight loops

```ts
if (fileCount % batchSize === 0) {
  await new Promise(r => setTimeout(r, 0));    // GC yield
}
```

`setTimeout(r, 0)` lets the event loop drain, which gives V8 a
window to run a major GC. **Removing this** on a long scan will cause
GC pauses of 200+ ms that show up as UI jank and "page unresponsive"
warnings.

## Rule 4 — Cap any in-memory log/state to a small bound

The live log tail is capped at **300 entries**, flushed every **250 ms**:

```ts
if (logs.length > 300) logs.shift();         // FIFO drop
```

The active-workers counter is in `useState` (cheap), but the *log
array* used to be updated synchronously per file. That re-rendered
the whole tree on every file completion. The fix is to buffer
updates and flush in a single `setLogs(...)` per flush interval.

Rule of thumb: any array that can grow unboundedly during a long
operation needs both a **cap** and a **flush interval**.

## Rule 5 — Cap the dirCache

```ts
const dirCache = new Map<string, Set<string>>();
const DIR_CACHE_MAX = 500;
if (dirCache.size >= DIR_CACHE_MAX) {
  const firstKey = dirCache.keys().next().value;
  if (firstKey !== undefined) dirCache.delete(firstKey);   // FIFO
}
```

For folder-source takeouts with thousands of subdirectories, the
"list children of this dir" cache will otherwise grow until the
process OOMs. 500 entries is enough to cover the typical active
working set; the cap is a hard ceiling.

## Rule 6 — Don't keep `File` references around

A `File` from a `FileSystemFileHandle.getFile()` call holds a
buffered copy of the entire file in memory. If you need to read
a file's bytes more than once, **stream** them via the handle
rather than calling `getFile()` repeatedly.

## Rule 7 — Prefer streaming over buffering

`@zip.js/zip.js` exposes readers and writers that work on
`ReadableStream`s. Use them rather than `entry.getData()` (which
returns the entire decompressed entry as a `Blob`).

## How to measure

- **Chrome Task Manager** (`Shift + Esc`) — shows the renderer process
  memory. Watch the JS heap.
- **DevTools → Performance → Memory** — record a 30-second sample of
  a restore. Look for the JS heap size and detached `FileSystemHandle`
  count.
- **Heap snapshot** (DevTools → Memory → Heap snapshot) — diff two
  snapshots taken 1 minute apart on a long restore. Anything growing
  linearly is a leak.

## Pre-release checklist

Before shipping any change that touches the scan, claim, or confirm
hot paths:

- [ ] No new `getAll('files')` calls.
- [ ] No new unbounded arrays (logs, caches, page buffers).
- [ ] `setTimeout(0)` yield present in any new tight loop.
- [ ] Tested on a takeout with **≥ 8 000 files** — heap stays under
      600 MB throughout.
- [ ] Heap snapshot before/after shows no detached `FileSystemHandle`
      growth.
