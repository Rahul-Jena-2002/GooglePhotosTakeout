import { detectAdBlock } from "../services/AdBlockDetector";

export let adblockState = {
  isAdFree: false,
  isBannerDismissed: false,
  hasUserInteracted: false,
};

export const setAdFree = (val: boolean) => {
  adblockState.isAdFree = val;
};

export const setUserInteracted = (val: boolean) => {
  adblockState.hasUserInteracted = val;
};

export const showBanner = () => {
  const banner = document.getElementById("adblock-banner");
  if (banner) {
    banner.classList.remove("hidden");
    setTimeout(() => {
      banner.classList.remove("-translate-y-full");
    }, 50);
  }
};

export const hideBanner = () => {
  const banner = document.getElementById("adblock-banner");
  if (banner) {
    banner.classList.add("-translate-y-full");
    setTimeout(() => {
      banner.classList.add("hidden");
    }, 500);
  }
};

export const checkAdBlock = async () => {
  const isToolPage = window.location.pathname.replace(/\/$/, '') === "/tool";
  if (!isToolPage) return;

  if (adblockState.isAdFree || adblockState.isBannerDismissed) {
    hideBanner();
    return;
  }

  if (!adblockState.hasUserInteracted) return;

  const isBlocked = await detectAdBlock();
  if (isBlocked) {
    showBanner();
  } else {
    hideBanner();
  }
};

export const setupAdblockEvents = () => {
  const whitelistBtn = document.getElementById("adblock-whitelist-btn");
  const closeBtn = document.getElementById("adblock-close-btn");

  whitelistBtn?.addEventListener("click", async () => {
    whitelistBtn.classList.add("animate-pulse");
    adblockState.hasUserInteracted = true;
    const isBlocked = await detectAdBlock();
    if (isBlocked && !adblockState.isAdFree) {
      (window as any).showVanillaToast("Ad blocker is still active. Please disable it for TakeoutFix or refresh the page.", "error");
    } else {
      hideBanner();
    }
    whitelistBtn.classList.remove("animate-pulse");
  });

  closeBtn?.addEventListener("click", () => {
    adblockState.isBannerDismissed = true;
    hideBanner();
  });
};
