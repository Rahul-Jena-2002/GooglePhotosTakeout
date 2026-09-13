/**
 * usePersistentHandles — Hook for native-like folder handle persistence
 *
 * On mount:
 *  1. Checks IndexedDB for stored takeout + output handles
 *  2. Queries permission silently (no prompt)
 *  3. If permission is 'granted' already → restores handles immediately
 *  4. If permission is 'prompt' → shows one-tap "Re-grant Access" banner
 *  5. If stale/unavailable → clears stored handles silently
 *
 * Usage in RestorePanel:
 *   const { restoredHandles, needsReGrant, reGrantAccess, forgetHandles } = usePersistentHandles()
 */

import { useState, useEffect, useCallback } from 'react';
import {
  loadHandles, saveHandles, clearHandles,
  requestHandlePermission, queryHandlePermission,
  requestStoragePersistence, type StoredHandles
} from '../lib/handleStore';

export type ReGrantState = 'idle' | 'checking' | 'needs_grant' | 'granting' | 'granted' | 'failed';

export interface PersistentHandlesResult {
  /** Handles loaded from IDB that are ready to use (already granted) */
  restoredHandles: StoredHandles | null;
  /** True if stored handles exist but need a permission re-grant tap */
  needsReGrant: boolean;
  /** Human-readable name of the stored takeout folder, for the banner */
  storedFolderName: string | null;
  reGrantState: ReGrantState;
  /** Call in response to user tap — requests permissions then resolves handles */
  reGrantAccess: () => Promise<StoredHandles | null>;
  /** Persist newly selected handles to IDB */
  persistHandles: (takeout: FileSystemDirectoryHandle | null, output: FileSystemDirectoryHandle | null) => Promise<void>;
  /** Clear handles from IDB (sign-out, "forget device", etc.) */
  forgetHandles: () => Promise<void>;
}

export function usePersistentHandles(): PersistentHandlesResult {
  const [restoredHandles, setRestoredHandles] = useState<StoredHandles | null>(null);
  const [needsReGrant, setNeedsReGrant] = useState(false);
  const [storedFolderName, setStoredFolderName] = useState<string | null>(null);
  const [reGrantState, setReGrantState] = useState<ReGrantState>('idle');

  // On mount: check for stored handles + silently probe permission
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      setReGrantState('checking');
      await requestStoragePersistence(); // ask browser not to evict our IDB

      const stored = await loadHandles();
      if (cancelled) return;

      if (!stored.takeout && !stored.output) {
        setReGrantState('idle');
        return;
      }

      setStoredFolderName(stored.takeout?.name ?? null);

      // Silent permission check — no prompt
      const takeoutPerm = stored.takeout
        ? await queryHandlePermission(stored.takeout, 'read')
        : 'granted';
      const outputPerm = stored.output
        ? await queryHandlePermission(stored.output, 'readwrite')
        : 'granted';

      if (cancelled) return;

      if (takeoutPerm === 'granted' && outputPerm === 'granted') {
        // Already have permission (same browser session) — restore immediately
        setRestoredHandles(stored);
        setNeedsReGrant(false);
        setReGrantState('granted');
      } else if (takeoutPerm === 'prompt' || outputPerm === 'prompt') {
        // Need one user tap to re-grant
        setNeedsReGrant(true);
        setReGrantState('needs_grant');
      } else {
        // Handle is stale/denied — clear it
        await clearHandles();
        setReGrantState('idle');
      }
    };

    check().catch(() => setReGrantState('idle'));
    return () => { cancelled = true; };
  }, []);

  // Called when user taps the "Re-grant Access" banner
  const reGrantAccess = useCallback(async (): Promise<StoredHandles | null> => {
    setReGrantState('granting');
    const stored = await loadHandles();

    if (!stored.takeout && !stored.output) {
      setReGrantState('idle');
      setNeedsReGrant(false);
      return null;
    }

    try {
      const results: StoredHandles = { takeout: null, output: null };

      if (stored.takeout) {
        const perm = await requestHandlePermission(stored.takeout, 'read');
        if (perm === 'granted') {
          results.takeout = stored.takeout;
        } else {
          await clearHandles();
          setReGrantState('failed');
          setNeedsReGrant(false);
          return null;
        }
      }

      if (stored.output) {
        const perm = await requestHandlePermission(stored.output, 'readwrite');
        if (perm === 'granted') {
          results.output = stored.output;
        } else {
          // Output permission failed — clear output but keep source
          await saveHandles(results.takeout, null);
        }
      }

      setRestoredHandles(results);
      setNeedsReGrant(false);
      setReGrantState('granted');
      return results;
    } catch {
      setReGrantState('failed');
      setNeedsReGrant(false);
      return null;
    }
  }, []);

  const persistHandles = useCallback(async (
    takeout: FileSystemDirectoryHandle | null,
    output: FileSystemDirectoryHandle | null
  ) => {
    await saveHandles(takeout, output);
    if (takeout) setStoredFolderName(takeout.name);
  }, []);

  const forgetHandles = useCallback(async () => {
    await clearHandles();
    setRestoredHandles(null);
    setNeedsReGrant(false);
    setStoredFolderName(null);
    setReGrantState('idle');
  }, []);

  return {
    restoredHandles,
    needsReGrant,
    storedFolderName,
    reGrantState,
    reGrantAccess,
    persistHandles,
    forgetHandles,
  };
}
