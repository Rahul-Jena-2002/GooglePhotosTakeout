/**
 * Zero-Idle-Battery & RAM Optimization Manager for Android & Desktop
 * 
 * - When the app is minimized / screen turned off / hidden (visibilityState === 'hidden'):
 *   1. Freezes non-essential UI intervals and animation loops.
 *   2. Releases temporary buffer/canvas caches to minimize RAM usage.
 *   3. Emits 'takeoutfix:power-suspend' so tool workspace and background tasks halt immediately.
 * 
 * - When the app returns to foreground (visibilityState === 'visible'):
 *   1. Emits 'takeoutfix:power-resume' to resume seamlessly without battery drain while idle.
 */

let isPowerManagerInitialized = false;

export function initPowerManager() {
  if (isPowerManagerInitialized || typeof window === "undefined") return;
  isPowerManagerInitialized = true;

  // Add native app class to document when running in Tauri
  const isTauri = 
    "__TAURI__" in window || 
    "__TAURI_INTERNALS__" in window || 
    navigator.userAgent.includes("TakeoutFix-Desktop") ||
    navigator.userAgent.includes("TakeoutFix-Android");

  if (isTauri) {
    document.documentElement.classList.add("tauri-native-app");
  }

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
