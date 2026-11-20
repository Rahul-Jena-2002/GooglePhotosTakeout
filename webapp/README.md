# TakeoutFix webapp

The webapp uses Astro, React and Firebase. The restoration tool processes selected media in the browser; keep your original Takeout export and verify the output before deleting anything.

## Local development

From the `webapp` folder, install the existing dependencies with `npm install` if needed. Copy `.env.example` to `.env` and configure Firebase values. For an isolated local setup, use a demo project ID such as `demo-takeoutfix`, a dummy public API key, and a dummy app ID; do not put service-account keys in browser variables.

In one terminal, start the Firebase emulators using the same project ID configured in `.env`:

```powershell
npx firebase emulators:start --only auth,firestore --project demo-takeoutfix
```

In another terminal, start the site:

```powershell
npm run dev
```

Open the local URL printed by Astro. During `astro dev`, the browser connects to the Auth emulator on `127.0.0.1:9099` and Firestore emulator on `127.0.0.1:8080` by default. Emulator accounts and data are separate from production. Set `PUBLIC_FIREBASE_USE_LIVE=true` only if you intentionally want local development to use the configured live Firebase project.

The optional `functions/local-server.js` also requires `FIRESTORE_EMULATOR_HOST`, unless live Firebase access is explicitly enabled. Use payment-provider test credentials and a local gateway: some API routes can still contact external services. The normal Astro dev command does not require a production build.

## Checks and deployment

The local readiness audit is in [`docs/adsense-readiness-audit.md`](docs/adsense-readiness-audit.md). Run the relevant tests and a final `npm run build` in an appropriate isolated environment before release; the build includes the Cloudflare security audit script. Check the actual Cloudflare deployment, Firebase rules, Search Console and AdSense configuration separately. Repository changes do not deploy themselves, and AdSense approval or search rankings are not guaranteed.

The checked-in project uses the Astro Cloudflare adapter for server routes, so publishing only the static files does not deploy the API. The existing local `dist` is stale: its generated Worker configuration points to `dist/client`, which is currently missing. Do not deploy that old output. After the final build, verify the generated Worker configuration and assets together in a Cloudflare Workers preview, including the required environment variables and bindings, before changing production routing.

The homepage, tool, and sign-in pages are prerendered. Supply their `PUBLIC_FIREBASE_*` configuration and any needed `PUBLIC_GOOGLE_CLIENT_ID` to the build environment; changing Worker runtime bindings alone does not rewrite already-generated HTML or client bundles. These values are public browser configuration, not service-account credentials. Keep server-only secrets out of `PUBLIC_` variables and configure them separately for the deployed Worker. Verify sign-in against the intended Firebase project in preview without exposing secret values in logs.
