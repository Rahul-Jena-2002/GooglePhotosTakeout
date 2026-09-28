/**
 * browserAdblock.ts
 *
 * Ad blocking state manager.
 * Note: Adblock detection messaging and whitelist requests are now natively handled
 * by Google's official Funding Choices Ad Blocking Recovery tag (in Layout.astro)
 * to comply with Google AdSense policies.
 */

export let adblockState = {
  isAdFree: false,
  isBannerDismissed: true,
  hasUserInteracted: false,
};

export const setAdFree = (val: boolean) => {
  adblockState.isAdFree = val;
};

export const setUserInteracted = (val: boolean) => {
  adblockState.hasUserInteracted = val;
};

// Custom banner retired in favor of Google Funding Choices Ad Blocking Recovery modal
export const showBanner = () => {};
export const hideBanner = () => {};
export const checkAdBlock = async () => {};
export const setupAdblockEvents = () => {};
