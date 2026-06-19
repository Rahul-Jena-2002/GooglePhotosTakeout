# Runbook — Cursor-paginated reads from IndexedDB

A copy-paste template for the pattern used to fix the Aw Snap OOM
crash. Use this any time you need to iterate over a large object store
in batches without loading it all into memory at once.

## When to use this

- The store can grow to **>1 000 rows** and you only need a window.
- You're tempted to write `getAll(storeName).filter(...)`. **Stop.**
- You need a count. Use `IDBIndex.count()` — never `getAll(...).length`.

## The pattern (with offset + limit)

```ts
async function cursorPageByStatus(
  db: IDBDatabase,
  storeName: string,
  indexName: string,
  indexValue: IDBValidKey | IDBKeyRange,
  offset: number,
  limit: number,
): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const out: any[] = [];
    let skipped = 0;
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName)
      .index(indexName)
      .openCursor(indexValue, 'next');
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return resolve(out);          // exhausted
      if (skipped < offset) {
        skipped++;
        cursor.continue();
        return;
      }
      out.push(cursor.value);
      if (out.length >= limit) return resolve(out);
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}
```

Notes:
- `cursor.continue()` walks the index in key order. Each call yields
  the next record. **The V8 GC reclaims skipped records as soon as
  the cursor advances** — they are never simultaneously in memory.
- `out.length >= limit` is the only condition that short-circuits the
  cursor. Returning from `onsuccess` does **not** auto-close the
  transaction; the GC will collect the open transaction once the
  promise resolves and the event loop is free.
- `IDBKeyRange.only(value)` for an exact match. Use
  `IDBKeyRange.bound(lo, hi)` for ranges.

## The count pattern

```ts
async function countByIndex(
  db: IDBDatabase,
  storeName: string,
  indexName: string,
  indexValue: IDBValidKey | IDBKeyRange,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(storeName, 'readonly')
      .objectStore(storeName).index(indexName).count(indexValue);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
```

`IDBIndex.count()` is **O(log n) for the seek + O(1) for the count**
— it does not materialise records. Perfect for "how many more?" checks
in a progress bar.

## Full call site (matches what `ToolWorkspace.tsx` does)

```ts
const totalPending = await countByIndex(db, 'files', 'status', 'pending');
let pageOffset = 0;
const PAGE_SIZE = 200;

while (true) {
  const page = await cursorPageByStatus(
    db, 'files', 'status', 'pending', pageOffset, PAGE_SIZE
  );
  if (page.length === 0) break;
  for (const record of page) {
    await processRecord(record);
  }
  pageOffset += PAGE_SIZE;
  // null out `page` to drop the FileSystemHandle refs
}
```

## Gotchas

- ❌ Using `IDBObjectStore.getAll()` with a `count` argument. That's a
  full scan up to `count` records; the call still materialises
  whatever it returns. If you don't need the records, use
  `index.count()`.
- ❌ Forgetting to call `cursor.continue()` after handling a record.
  The cursor stalls, the transaction never completes, and the next
  call site waits forever.
- ❌ Returning the open transaction from a function and expecting it
  to stay alive. The transaction is tied to the event loop tick that
  created it; once you return a promise, the GC can collect it.
- ❌ Reopening the same `IDBDatabase` for every cursor call. Open it
  once and reuse — `indexedDbService.getDb()` caches the connection.
- ❌ Using the same field as both the primary key and an index value
  for the same query. Use the primary key, which is already an
  implicit index.
