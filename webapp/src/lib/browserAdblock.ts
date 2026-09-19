import { detectAdBlock } from "../services/monetization/AdBlockDetector";

const isDismissedInSession = (): boolean => {
  try {
    return sessionStorage.getItem("takeoutfix_adblock_dismissed") === "true";
  } catch (_) {
    return false;
  }
};

export let adblockState = {
  isAdFree: false,
  isBannerDismissed: isDismissedInSession(),
  hasUserInteracted: false,
};

export const setAdFree = (val: boolean) => {
  adblockState.isAdFree = val;
};

export const setUserInteracted = (val: boolean) => {
  adblockState.hasUserInteracted = val;
};

export const showBanner = () => {
  if (adblockState.isBannerDismissed || isDismissedInSession()) return;
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
  if (adblockState.isAdFree || adblockState.isBannerDismissed || isDismissedInSession()) {
    hideBanner();
    return;
  }

  const isBlocked = await detectAdBlock();
  if (isBlocked && !adblockState.isBannerDismissed && !isDismissedInSession()) {
    showBanner();
  } else {
    hideBanner();
  }
};

export const setupAdblockEvents = () => {
  const whitelistBtn = document.getElementById("adblock-whitelist-btn");
  const closeBtn = document.getElementById("adblock-close-btn");

  if (closeBtn && !closeBtn.dataset.bound) {
    closeBtn.dataset.bound = "true";
    closeBtn.addEventListener("click", () => {
      adblockState.isBannerDismissed = true;
      try {
        sessionStorage.setItem("takeoutfix_adblock_dismissed", "true");
      } catch (_) {}
      hideBanner();
    });
  }

  if (whitelistBtn && !whitelistBtn.dataset.bound) {
    whitelistBtn.dataset.bound = "true";
    whitelistBtn.addEventListener("click", async () => {
      whitelistBtn.classList.add("animate-pulse");
      const isBlocked = await detectAdBlock();
      if (isBlocked && !adblockState.isAdFree) {
        (window as any).showVanillaToast("Ad blocker is still active. Please disable it for TakeoutFix or refresh the page.", "error");
      } else {
        (window as any).showVanillaToast("Thank you for supporting TakeoutFix!", "success");
        hideBanner();
      }
      whitelistBtn.classList.remove("animate-pulse");
    });
  }
};
