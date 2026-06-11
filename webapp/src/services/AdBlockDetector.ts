/**
 * AdBlockDetector
 * ---------------
 * Uses two strategies for maximum coverage:
 * 1. Checks if the bait script (public/ads/bait.js) was blocked by the browser.
 * 2. Creates a honeypot DOM element with ad-like classes and checks if it is hidden.
 */
export async function detectAdBlock(): Promise<boolean> {
  // Strategy 1: The ultimate test - dynamically load the official Google AdSense script
  // Brave and all adblockers MUST block this URL.
  // We use a HEAD fetch instead of a script tag to prevent downloading and parsing 1MB of Unused JS.
  const adSenseBlocked = await fetch('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7628736172233995', {
    method: 'HEAD',
    mode: 'no-cors',
    cache: 'no-store'
  }).then(() => false).catch(() => true);

  if (adSenseBlocked) {
    console.log('AdBlock Strategy 1 failed: Official Google AdSense script was blocked.');
    return true;
  }

  // Strategy 2: DOM honeypot test (Cosmetic filtering)
  return new Promise((resolve) => {
    const bait = document.createElement('div');
    // These specific classes are universally targeted by EasyList / Brave
    bait.setAttribute('class', 'pub_300x250 pub_300x250m pub_728x90 text-ad textAd text_ad text_ads text-ads text-ad-links ad-banner ad-placement google-ads');
    bait.setAttribute(
      'style',
      'width:1px;height:1px;position:absolute;top:-9999px;left:-9999px;pointer-events:none;'
    );
    document.body.appendChild(bait);

    // Give the browser's cosmetic filters a bit of time to inject stylesheets (50ms)
    setTimeout(() => {
      const computedStyle = window.getComputedStyle(bait);
      
      const c1 = bait.offsetParent === null;
      const c2 = bait.offsetHeight === 0;
      const c3 = bait.offsetWidth === 0;
      const c4 = computedStyle.display === 'none';
      const c5 = computedStyle.visibility === 'hidden';
      
      const isHidden = c1 || c2 || c3 || c4 || c5;
      
      if (isHidden) {
        console.log('AdBlock DOM check failed:', { offsetParentNull: c1, height0: c2, width0: c3, displayNone: c4, visibilityHidden: c5 });
      }
      
      document.body.removeChild(bait);
      resolve(isHidden);
    }, 50);
  });
}
