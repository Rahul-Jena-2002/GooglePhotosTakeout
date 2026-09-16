import * as Sentry from "@sentry/astro";

const isLocalhost = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

Sentry.init({
  dsn: import.meta.env.PUBLIC_SENTRY_DSN,
  enabled: import.meta.env.PROD && !isLocalhost,
});

