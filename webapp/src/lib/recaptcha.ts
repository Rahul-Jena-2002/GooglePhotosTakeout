/**
 * Google Cloud reCAPTCHA Enterprise Client Helper
 * Site Key: 6LdDpb4tAAAAADJHZzjrMIC-gvDXkAw0rhdgB5Sb
 * Project: takeout-fix
 */

export const RECAPTCHA_SITE_KEY = "6LdDpb4tAAAAADJHZzjrMIC-gvDXkAw0rhdgB5Sb";

declare global {
  interface Window {
    grecaptcha?: {
      enterprise?: {
        ready: (callback: () => void) => void;
        execute: (siteKey: string, options: { action: string }) => Promise<string>;
      };
    };
  }
}

/**
 * Executes reCAPTCHA Enterprise and returns the evaluation token.
 * Non-blocking fallback: resolves to null if reCAPTCHA is blocked by ad-blocker or script fails.
 */
export async function executeRecaptcha(action: string = "submit"): Promise<string | null> {
  if (typeof window === "undefined") return null;

  try {
    // If grecaptcha enterprise is already available
    if (window.grecaptcha?.enterprise?.execute) {
      return await new Promise<string | null>((resolve) => {
        window.grecaptcha!.enterprise!.ready(async () => {
          try {
            const token = await window.grecaptcha!.enterprise!.execute(RECAPTCHA_SITE_KEY, { action });
            resolve(token);
          } catch (err) {
            console.warn("[reCAPTCHA Enterprise] Execute error:", err);
            resolve(null);
          }
        });
      });
    }

    // Wait up to 2.5 seconds if script is currently loading asynchronously
    const startTime = Date.now();
    while (Date.now() - startTime < 2500) {
      if (window.grecaptcha?.enterprise?.execute) {
        return await new Promise<string | null>((resolve) => {
          window.grecaptcha!.enterprise!.ready(async () => {
            try {
              const token = await window.grecaptcha!.enterprise!.execute(RECAPTCHA_SITE_KEY, { action });
              resolve(token);
            } catch (err) {
              console.warn("[reCAPTCHA Enterprise] Execute error:", err);
              resolve(null);
            }
          });
        });
      }
      await new Promise((r) => setTimeout(r, 100));
    }

    console.info("[reCAPTCHA Enterprise] Script not detected, continuing smoothly.");
    return null;
  } catch (err) {
    console.warn("[reCAPTCHA Enterprise] General error:", err);
    return null;
  }
}
