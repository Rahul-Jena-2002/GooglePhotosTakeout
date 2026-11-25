/**
 * Emits visibility events and updates the mobile viewport height.
 * Restore processing does not currently listen for these events.
 */

let isPowerManagerInitialized = false;

export function initPowerManager() {
  if (isPowerManagerInitialized || typeof window === "undefined") return;
  isPowerManagerInitialized = true;

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      // 1. Dispatch suspend event to stop polling / animations
      window.dispatchEvent(new CustomEvent("takeoutfix:power-suspend"));

      // 2. Clear non-essential image/canvas caches to reduce RAM footprint
      if ((window as any).gc && typeof (window as any).gc === "function") {
        try { (window as any).gc(); } catch (_) {}
      }
    } else if (document.visibilityState === "visible") {
      // 3. Dispatch resume event
      window.dispatchEvent(new CustomEvent("takeoutfix:power-resume"));
    }
  });

  // Safe area viewport height stability for Android gesture navigation
  const setAppHeight = () => {
    document.documentElement.style.setProperty(
      "--app-height",
      `${window.innerHeight}px`
    );
  };
  window.addEventListener("resize", setAppHeight, { passive: true });
  setAppHeight();
}
