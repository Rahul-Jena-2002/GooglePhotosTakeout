# Runbook — IndexedDB schema migrations

## Why this matters

IndexedDB persists across browser sessions. A naïve schema change ships
code that crashes on every existing user's first load because their
DB is still at the old version. **Every schema change must bump
`dbVersion` and handle the upgrade path.**

## The rule

In `webapp/src/lib/indexedDbService.ts`:

1. **Bump `private dbVersion`** by 1.
2. Update `request.onupgradeneeded` so the new schema is reached at the
   new version. Use **idempotent** `objectStoreNames` /
   `indexNames` checks — see the existing code.
3. If you add a new field to `FileRecord` or any persisted type, you
   do **not** need to write migration data. IDB stores the row as-is
   on the next read; missing fields read back as `undefined`.
4. If you need to **rename** a field or **change its type**, write a
   one-shot migration inside `onupgradeneeded` using a `readwrite`
   transaction over the affected store.

## Patterns

### Adding an index (used in dbVersion 3)

```ts
request.onupgradeneeded = () => {
  const database = request.result;

  if (!database.objectStoreNames.contains('files')) {
    const filesStore = database.createObjectStore('files');
    filesStore.createIndex('status', 'status', { unique: false });
  } else if (!database.transaction('files', 'readonly')
                .objectStore('files').indexNames.contains('status')) {
    database.transaction('files', 'readwrite')
      .objectStore('files')
      .createIndex('status', 'status', { unique: false });
  }
};
```

The `else if` is the upgrade path — it runs when the user already has a
v2 `files` store. The first `if` runs for fresh installs.

### Renaming a field on existing rows

```ts
request.onupgradeneeded = (e) => {
  const database = request.result;
  if (e.oldVersion < 4) {
    const store = database.transaction('files', 'readwrite').objectStore('files');
    store.openCursor().onsuccess = (ev) => {
      const cursor = ev.target.result;
      if (!cursor) return;
      const row = cursor.value;
      if ('oldName' in row) {
        row.newName = row.oldName;
        delete row.oldName;
        cursor.update(row);
      }
      cursor.continue();
    };
  }
};
```

Key points:
- The version gate (`e.oldVersion < N`) is important if the migration
  is non-trivial — it ensures it runs once per upgrade.
- `cursor.update(row)` writes the row back within the same transaction;
  the transaction auto-commits when the cursor is exhausted.

### Adding a new object store

```ts
if (!database.objectStoreNames.contains('audit')) {
  database.createObjectStore('audit');
}
```

No migration data needed — store starts empty.

## Testing the upgrade path

1. Open the app at the *current* version. Confirm a row exists in
   `files` (or whichever store you're changing).
2. Delete the DB (`Application → IndexedDB → TakeoutFixDB → Delete`).
3. Bump `dbVersion` + change the upgrade handler.
4. Reload. Check DevTools → Application → IndexedDB → TakeoutFixDB.
   Confirm `version` matches the new value and the new index / store
   is present.
5. Now test the **in-place upgrade** path: don't delete the DB. Just
   reload after the version bump. The upgrade handler should run
   (open the Console — you'll see IDB's upgrade events if you log
   them) and the existing data should be intact.

## Gotchas

- ❌ Forgetting to handle `e.oldVersion`. Multiple version bumps in
  one release need cascading branches: `if (e.oldVersion < 3) ... else
  if (e.oldVersion < 4) ...`.
- ❌ Running a `readwrite` cursor inside `onupgradeneeded` while
  another transaction is open on the same store. IDB will throw.
- ❌ Treating the upgrade handler like a normal function. It runs
  synchronously up to the first `await` — anything that returns a
  promise must be awaited inside the handler or you'll get
  TransactionInactiveError.
- ❌ Opening `idb` with the same version twice in a row. If your
  upgrade handler doesn't change anything the browser will not fire
  `onupgradeneeded`, so you won't get a chance to migrate. Always
  bump.
