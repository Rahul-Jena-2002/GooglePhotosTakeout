/**
 * Persistent File System Handle Store
 *
 * Chrome/Edge allow storing FileSystemDirectoryHandle and FileSystemFileHandle
 * objects directly in IndexedDB. The browser handles serialisation natively.
 *
 * On page reload, the stored handles are VALID but need a fresh `requestPermission()`
 * call — exactly one user gesture, then they work until the tab is closed again.
 *
 * This mirrors how VS Code for the Web remembers your workspace folder.
 *
 * Storage key layout:
 *   handles store in TakeoutFixDB:
 *     "takeout"  → FileSystemDirectoryHandle  (source folder)
 *     "output"   → FileSystemDirectoryHandle  (destination folder)
 *     "zipfile"  → File                       (NOT storable — File refs die on close, handled separately)
 */

const DB_NAME    = 'TakeoutFixDB';
const DB_VERSION = 4;          // bump from 3 → adds 'handles' store
const STORE      = 'handles';

function openHandlesDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      // Preserve existing stores, only add 'handles' if missing
      if (!db.objectStoreNames.contains('telemetry'))   db.createObjectStore('telemetry');
      if (!db.objectStoreNames.contains('checkpoints')) db.createObjectStore('checkpoints');
      if (!db.objectStoreNames.contains('sessions'))    db.createObjectStore('sessions');
      if (!db.objectStoreNames.contains(STORE))         db.createObjectStore(STORE);

      // Migrate 'files' store if needed (preserve existing index)
      if (!db.objectStoreNames.contains('files')) {
        const filesStore = db.createObjectStore('files');
        filesStore.createIndex('status', 'status', { unique: false });
      }
    };
  });
}

async function dbGet<T>(key: string): Promise<T | null> {
  const db = await openHandlesDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function dbSet(key: string, value: unknown): Promise<void> {
  const db = await openHandlesDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function dbDelete(key: string): Promise<void> {
  const db = await openHandlesDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

export type StoredHandles = {
  takeout: FileSystemDirectoryHandle | null;
  output:  FileSystemDirectoryHandle | null;
};

/**
 * Persist the user's chosen source and output folder handles to IndexedDB.
 * Call this immediately after the user selects folders.
 */
export async function saveHandles(
  takeout: FileSystemDirectoryHandle | null,
  output:  FileSystemDirectoryHandle | null
): Promise<void> {
  try {
    if (takeout) await dbSet('takeout', takeout);
    else         await dbDelete('takeout');
    if (output)  await dbSet('output', output);
    else         await dbDelete('output');
  } catch (err) {
    // Non-fatal — user will just need to re-pick folders
    console.warn('[HandleStore] Failed to persist handles:', err);
  }
}

/**
 * Load previously persisted handles from IndexedDB.
 * Returns { takeout, output } — either or both may be null if not stored.
 */
export async function loadHandles(): Promise<StoredHandles> {
  try {
    const [takeout, output] = await Promise.all([
      dbGet<FileSystemDirectoryHandle>('takeout'),
      dbGet<FileSystemDirectoryHandle>('output'),
    ]);
    return { takeout, output };
  } catch {
    return { takeout: null, output: null };
  }
}

/**
 * Request read/write permission for a persisted handle.
 * Must be called in response to a user gesture.
 *
 * Returns:
 *   'granted'  — handle is ready to use
 *   'denied'   — user refused (or handle is stale)
 *   'unavailable' — File System Access API not supported
 */
export async function requestHandlePermission(
  handle: FileSystemDirectoryHandle,
  mode: 'read' | 'readwrite' = 'readwrite'
): Promise<'granted' | 'denied' | 'unavailable'> {
  if (typeof handle.requestPermission !== 'function') return 'unavailable';
  try {
    const result = await handle.requestPermission({ mode });
    return result === 'granted' ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

/**
 * Check permission WITHOUT prompting. Safe to call anytime.
 */
export async function queryHandlePermission(
  handle: FileSystemDirectoryHandle,
  mode: 'read' | 'readwrite' = 'readwrite'
): Promise<'granted' | 'denied' | 'prompt'> {
  if (typeof handle.queryPermission !== 'function') return 'denied';
  try {
    return await handle.queryPermission({ mode }) as 'granted' | 'denied' | 'prompt';
  } catch {
    return 'denied';
  }
}

/**
 * Clear all stored handles (e.g. on sign-out or "forget this device").
 */
export async function clearHandles(): Promise<void> {
  try {
    await dbDelete('takeout');
    await dbDelete('output');
  } catch { /* ignore */ }
}

/**
 * Request navigator.storage.persist() so the browser won't evict IndexedDB
 * under storage pressure (same as what VS Code does).
 */
export async function requestStoragePersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  try {
    const persisted = await navigator.storage.persisted();
    if (persisted) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
