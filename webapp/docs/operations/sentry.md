# Operations — Sentry / observability

Sentry is configured for both **client** (browser) and **server**
(Cloudflare Worker) errors. Use the configs in
`sentry.client.config.js` and `sentry.server.config.js` as the
canonical source.

## What we capture

- **Unhandled exceptions** in the React tree (via
  `<Sentry.ErrorBoundary>` at the page level).
- **Performance traces** for the scan + process loops, sampled at
  10% in production.
- **Per-session summaries**: file count, total bytes, total duration,
  matched / unmatched / errored counts. One Sentry event per
  session — **not** per file.

## What we *don't* capture

- File contents, paths, or filenames (PII risk on shared takeouts).
- User IDs in event tags. We use a per-install anonymous ID set in
  localStorage.
- EXIF contents (could contain GPS coords of the user's home).

## Local dev

Set `VITE_SENTRY_DSN` in your `.env` to your dev DSN. Without it,
the client SDK is a no-op and the config does nothing.

## Releasing with a source map

Sentry releases are tied to the Cloudflare Pages deployment SHA.
We upload source maps via `sentry-cli releases new <sha> && sentry-cli
releases files <sha> upload-sourcemaps ./dist`.

## Gotchas

- **Sampling rates**: bumping the trace sample rate above 10% will
  hit the team plan's event cap within hours on a busy day.
- **PII filtering**: Sentry's default `sendDefaultPii` is **off**.
  Don't turn it on without a security review.
- **Session storage**: the `telemetry` IDB store is the buffer
  between event creation and Sentry upload. If the user is offline,
  events queue there and flush on the next online session. Don't
  clear it from a "reset session" UI without a graceful flush.
