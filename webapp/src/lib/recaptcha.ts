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
 * Dynamically loads the reCAPTCHA Enterprise script if not yet loaded.
 */
export function ensureRecaptchaLoaded(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.grecaptcha?.enterprise) return Promise.resolve(true);

  if (document.getElementById("recaptcha-enterprise-script")) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.id = "recaptcha-enterprise-script";
    s.src = `https://www.google.com/recaptcha/enterprise.js?render=${RECAPTCHA_SITE_KEY}`;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve(true);
    s.onerror = (err) => {
      console.warn("[reCAPTCHA Enterprise] Failed to load script:", err);
      resolve(false);
    };
    document.head.appendChild(s);
  });
}

/**
 * Executes reCAPTCHA Enterprise and returns the evaluation token.
 * Non-blocking fallback: resolves to null if reCAPTCHA is blocked by ad-blocker or script fails.
 */
export async function executeRecaptcha(action: string = "submit"): Promise<string | null> {
  if (typeof window === "undefined") return null;

  try {
    await ensureRecaptchaLoaded();

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

/**
 * Executes reCAPTCHA on the client and submits the token to the backend assessment API.
 * This satisfies Google Cloud reCAPTCHA Enterprise requirement for backend token verification.
 */
export async function executeAndVerifyRecaptcha(action: string = "submit"): Promise<{ success: boolean; score?: number; token?: string | null }> {
  const token = await executeRecaptcha(action);
  if (!token) {
    return { success: true, token: null };
  }

  try {
    const res = await fetch("/api/verify-recaptcha", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, action })
    });
    const data = await res.json();
    return {
      success: data.success ?? true,
      score: data.score,
      token
    };
  } catch (err) {
    console.warn("[reCAPTCHA Enterprise] Backend assessment request failed:", err);
    return { success: true, token };
  }
}
