/**
 * Service Worker registration + lifecycle management for TakeoutFix PWA.
 *
 * Registers /sw.js, handles updates gracefully (prompts user to refresh),
 * and listens for SW_FLUSH_USAGE messages from the SW background sync.
 *
 * Call registerServiceWorker() once from your app root (e.g. MainLayout useEffect).
 * Pass onFlushUsage to commit any pending Firestore session usage when the SW
 * signals it (triggered when the browser Background Sync fires after reconnect).
 */

export interface SWRegistrationOptions {
  /** Called when SW background sync fires SW_FLUSH_USAGE — commit pending Firestore usage */
  onFlushUsage?: () => void;
  /** Called when a new SW version is waiting — prompt user to refresh */
  onUpdateAvailable?: (applyUpdate: () => void) => void;
}

let registered = false;

export async function registerServiceWorker(options: SWRegistrationOptions = {}): Promise<void> {
  if (registered) return;
  if (!('serviceWorker' in navigator)) return;

  registered = true;

  try {
    const reg = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none', // always check for SW update on navigation
    });

    // Listen for SW messages (Background Sync flush, etc.)
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'SW_FLUSH_USAGE') {
        options.onFlushUsage?.();
      }
    });

    // Handle update available
    const handleUpdate = (sw: ServiceWorker) => {
      const apply = () => {
        sw.postMessage({ type: 'SKIP_WAITING' });
        window.location.reload();
      };
      options.onUpdateAvailable?.(apply);
    };

    if (reg.waiting) {
      handleUpdate(reg.waiting);
    }

    reg.addEventListener('updatefound', () => {
      const newSW = reg.installing;
      if (!newSW) return;
      newSW.addEventListener('statechange', () => {
        if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
          handleUpdate(newSW);
        }
      });
    });

    // Register background sync for offline usage flush
    if ('sync' in reg) {
      try {
        await (reg as any).sync.register('flush-usage');
      } catch { /* not critical */ }
    }

  } catch (err) {
    console.warn('[SW] Registration failed:', err);
  }
}

export async function unregisterServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(regs.map(r => r.unregister()));
  registered = false;
}
