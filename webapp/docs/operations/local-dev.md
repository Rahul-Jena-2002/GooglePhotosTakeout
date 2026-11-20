# Operations — local development and deployment

The browser tool processes selected files on the device. Keep the original export and verify restored copies.

## Local development

Follow the [webapp README](../../README.md#local-development) for the current Firebase emulator setup and `npm run dev` command. Astro development connects Auth and Firestore to local emulators by default. Only set `PUBLIC_FIREBASE_USE_LIVE=true` if you intentionally want development to use the configured live Firebase project.

## Before release

- Run the relevant web tests and one final `npm run build` in an appropriate isolated environment. The build generates the sitemap, builds Astro, updates redirects, and runs the Cloudflare security audit.
- Test representative Takeout files, cancellation, resume, downloads, account changes, and errors. Check both the output and the unchanged originals.
- The current Astro configuration uses server output and the Cloudflare adapter. Static assets alone do not deploy the server routes. The existing local `dist` is stale; after a fresh build, inspect the generated Worker configuration and asset paths together.
- Check Firebase rules separately, then verify a Cloudflare Workers preview with the required bindings and environment variables before changing production routing. The current live project and its deployment settings have not been verified.
- Verify public routes, headers, sign-in, consent, ads, and support in the deployed preview. Review Search Console and AdSense in their respective accounts.

The [readiness audit](../adsense-readiness-audit.md) and the repository's [progress tracker](../../../PROGRESS.md) list unresolved issues. Do not deploy the old `dist` output or assume a static Pages deployment runs the API routes.
