import * as Sentry from '@sentry/astro';

/**
 * Lightweight analytics helper.
 * - Records a Sentry breadcrumb for every CTA / key action.
 * - Dispatches a CustomEvent on `window` so future analytics
 *   integrations (GA4, Plausible, PostHog, etc.) can listen
 *   without touching this module.
 * - No external network calls. No PII collected.
 */
export function trackEvent(
  name: string,
  props?: Record<string, string>,
): void {
  // Sentry breadcrumb (captured in next error/transaction)
  try {
    Sentry.addBreadcrumb({
      category: 'cta',
      message: name,
      data: props,
      level: 'info',
    });
  } catch {
    // Sentry may not be initialised in dev / SSR – silently ignore
  }

  // CustomEvent for future integrations
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('tf:track', {
        detail: { name, props },
      }),
    );
  }
}
