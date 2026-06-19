# `src/react-pages/ToolWorkspace.tsx`

The main restore screen. Hosts the page state machine (select source →
configure → scan → process → done), the worker loop, the live log tail,
the active-workers counter, and all the action buttons.

This doc is the entry point for **UI** changes. The performance contract
lives here too because most OOM regressions arrive via this file.

## Why it exists

The restore flow is too long and stateful to live in a single component.
`ToolWorkspace.tsx` is the page-level orchestrator; helper components
(log tail, file table, action buttons) live in `src/components/` and
are imported in.

## State shape (top of the file)

```ts
const [phase, setPhase] = useState<Phase>(...);          // 'idle' | 'scanning' | 'processing' | 'done' | 'error'
const [logs, setLogs] = useState<LogEntry[]>([]);        // capped at 300 entries, flushed every 250 ms
const [activeWorkers, setActiveWorkers] = useState(0);
const [totalBytes, setTotalBytes] = useState(0);
const isProcessingRef = useRef(false);
const isPausedRef = useRef(false);
// ... more refs for mutable values that shouldn't trigger re-renders
```

Refs are used for values that the worker loop reads on every iteration
(pause flag, abort flag, quota counters). Putting them in `useState` would
re-render the whole tree on every toggle.

## The worker loop

```ts
const processNext = async () => {
  while (isProcessingRef.current && !isPausedRef.current) {
    if (pageIndex >= currentPage.length) {
      currentPage = [];                     // let GC reclaim handles
      pageIndex = 0;
      if (globalFileIndex >= totalPending) break;
      currentPage = await sessionManager.getPendingFilesPage(pageOffset, PAGE_SIZE);
      pageOffset += PAGE_SIZE;              // cursor-paginated, NOT offset=0
    }
    const fileRecord = currentPage[pageIndex++];
    globalFileIndex++;
    await sessionManager.claimFile(fileRecord.id);
    // ... resolve handle, call restorer, write to output, confirmFile
  }
};
```

### Performance contracts you must respect

- **`PAGE_SIZE` is 200.** Don't raise it. 200 keeps the in-memory
  `FileRecord[]` at ~200 × (size of one row) ≈ a few MB even on 50k-file
  takeouts. Each row holds live `FileSystemHandle` refs; raising the
  page size pushes you back toward the pre-fix OOM behaviour.
- **`currentPage = []` between pages is load-bearing.** Without it the
  old array is still referenced by the closure and its `FileSystemHandle`
  members stay pinned.
- **`pageOffset += PAGE_SIZE` (not `pageOffset = 0`).** The cursor
  pagination in `SessionManager` is a true offset; you must advance it.
  The old `offset=0` trick only worked because the previous
  implementation did a full `getAll + filter` each time, which we'd
  removed.
- **The log tail is capped at 300 entries, flushed every 250 ms.** Don't
  try to "fix" this by setting logs from inside the worker loop directly;
  you'll re-render the entire tree on every file completion.

## Quota and admin bypass

```ts
const isBypass = userData?.isAdmin || import.meta.env.DEV;
if (!isBypass && (bytes over cap || files over cap)) {
  await haltDueToQuota();
  return;
}
```

Admins and dev-mode are exempt from quota checks. The cap is enforced
client-side; the server-side enforcement lives in `firestore.rules` and
the `LicenseService`.

## dirCache (folder-source only)

```ts
const dirCache = new Map<string, Set<string>>();
const DIR_CACHE_MAX = 500;                  // FIFO eviction
```

For each unique parent directory, we read its directory handle and cache
its child set. Used to safely resolve "is there already a file at this
path?" without re-reading the directory on every write. Capped at 500
entries with FIFO eviction; archives with thousands of subdirectories
otherwise blow up the heap.

## ExifRestorer integration

```ts
import { isJpeg, restoreExif } from '../services/ExifRestorer';
if (isJpeg(bytes)) {
  const restored = await restoreExif(bytes, exifJson);
  await writeFile(restored, name);
} else {
  await writeFile(bytes, name);
}
```

`restoreExif` may throw on non-standard JPEGs (Snapchat, etc.) — see
[`modules/exif-restorer.md`](./exif-restorer.md) for the fallback
contract.

## Telemetry

Long durations and aggregate counts are pushed into the
`useToolStore`-backed `telemetry` slice; batched to Sentry on session
end. Don't ship per-file Sentry events; you'll blow the rate limit.

## How to test

1. **Happy path**: pick a folder with ~500 JPEGs + JSON sidecars, click
   Start. Expect: scan → process → done, with logs streaming at ≤4 Hz.
2. **Pause / resume**: click Pause mid-run, confirm `activeWorkers`
   drops to 0 and no new file is claimed. Click Resume, confirm
   `activeWorkers` rises back to the configured `maxWorkers`.
3. **Quota hit**: as a non-admin user, exceed `limitBytesRef`. Expect
   the worker to call `haltDueToQuota` and surface a toast.
4. **Snapchat JPEGs**: drop a Snapchat JPEG into the source. The worker
   should log a warning and continue with the original bytes.
5. **Reload mid-run**: refresh during processing. On reload the page
   should resume from where it left off without double-writing.

## Common mistakes to avoid

- ❌ Calling `setLogs(...)` synchronously inside the worker loop. The
  re-render frequency will pin the renderer. Use the buffered
  flush-with-setTimeout pattern that already exists in this file.
- ❌ Replacing `getPendingFilesPage(pageOffset, PAGE_SIZE)` with
  `getPendingFilesPage(0, PAGE_SIZE)`. That re-processes the first
  200 records on every page boundary.
- ❌ Raising `PAGE_SIZE` to "go faster". You'll OOM on big takeouts.
  The bottleneck isn't memory, it's disk IO, and the page size is
  already matched to typical I/O latency.
- ❌ Bypassing `claimFile` and writing directly to disk. The session
  state machine has no way to know the file was handled, and on
  reload it will be restored again — overwriting your output.
