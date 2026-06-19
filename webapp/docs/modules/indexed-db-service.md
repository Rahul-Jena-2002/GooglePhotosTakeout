# `src/lib/indexedDbService.ts`

Thin Promise wrapper around the browser `IDBDatabase` for the app's
`TakeoutFixDB` database. One singleton, one set of object stores, one
set of typed helpers.

## Why it exists

`SessionManager` and a handful of other services need to read/write a few
object stores (`files`, `sessions`, `telemetry`, `checkpoints`). Without
this wrapper every caller re-implements the `request → onsuccess / onerror`
boilerplate, and we'd be at the mercy of whoever forgot to close a
transaction. Centralising it also gives us **one** place to bump the DB
version and add indexes.

## Public API

```ts
class IndexedDbService {
  set(storeName, key, value): Promise<void>
  setAll(storeName, items): Promise<void>      // batched put in one tx
  get(storeName, key): Promise<any | undefined>
  remove(storeName, key): Promise<void>
  getAll(storeName): Promise<any[]>             // full scan — AVOID for 'files'
  getAllKeys(storeName): Promise<string[]>
  clearStore(storeName): Promise<void>
  getDb(): Promise<IDBDatabase>                 // exposed for index-aware callers
}
```

Plus the singleton export:

```ts
export const indexedDbService = new IndexedDbService();
```

> **`getDb()` is the only escape hatch.** Everything else goes through the
> wrapper. New code should prefer adding a method here over reaching for
> the raw `IDBDatabase` — keeps upgrade logic in one file.

## Stores and indexes

```
TakeoutFixDB  (dbVersion = 3)
├── telemetry     (key: string)
├── checkpoints   (key: string)
├── files         (key: string)               ← the hot one
│     └── index: status (non-unique on .status)
└── sessions      (key: string)
```

The **`status` index on `files` is the keystone of the OOM fix** — see
[`runbooks/aw-snap-oom-fix.md`](../runbooks/aw-snap-oom-fix.md). It lets
`SessionManager` count and page through pending files without ever loading
the full `FileRecord[]` array (each row holds live `FileSystemHandle`
references that are heavy in V8).

## Schema migration history

| dbVersion | Change | Why |
|---|---|---|
| 1 | Initial: `telemetry`, `checkpoints`, `files`, `sessions` | First ship |
| 2 | (no schema change, just a checkpoint rev) | — |
| 3 | Add `status` index on `files` | Enable cursor-paginated reads to stop Aw Snap OOM |

The upgrade handler is **idempotent** — it checks `objectStoreNames` and
`indexNames` before creating, so a user upgrading from v2 sees the index
added in place, and a fresh install goes straight to v3. Migration steps
in detail: [`runbooks/indexeddb-schema-migrations.md`](../runbooks/indexeddb-schema-migrations.md).

## Behavioural contracts

- `setAll` does a single transaction. If any `put` fails, the whole batch
  rolls back. **Don't** call `set` 200 times in a hot loop; build a batch
  and call `setAll`.
- `getAll` is `O(n)`. It's fine for `telemetry` and `checkpoints`. **Never
  use it on `files` from a hot path** — use a cursor on the `status`
  index instead (see [`SessionManager`](./session-manager.md)).
- `clearStore` does **not** call `onupgradeneeded`; it just runs
  `IDBObjectStore.clear()` inside a `readwrite` transaction. Bumping the
  version is a different concern (handled in `init`).

## How to test

1. **Open the running app**, open DevTools → Application → IndexedDB.
2. **Confirm version 3**: right-click `TakeoutFixDB` → "Delete database",
   reload, scan a small takeout. The DB should re-open at version 3 with
   the `files` store having a `status` index listed under it.
3. **Inspect a record**: `files` → any key → confirm `status` is one of
   `'pending' | 'processing' | 'completed' | 'failed'`.
4. **Verify the index is actually used**: in DevTools, pick a file record
   and use the IDB inspector to run `files.index('status').count('pending')`
   manually — should return a number, not an error.

## Common mistakes to avoid

- ❌ Calling `setAll` with an empty array — the wrapper short-circuits
  (returns early), but a future refactor that drops the guard will trigger
  an `IDBTransaction` error. Always check the length at the call site too.
- ❌ Bumping `dbVersion` without updating `onupgradeneeded` — the user's
  DB stays at the old version, and the new code silently runs against the
  old schema.
- ❌ Adding a new field to `FileRecord` without bumping `dbVersion` and
  adding an index if you'll filter on it. The read path will fall back to
  a full scan and OOM you.
