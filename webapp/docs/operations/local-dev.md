# Operations — Local dev, build, deploy

## Prerequisites

- Node ≥ 20
- A modern Chromium-based browser (Chrome / Edge / Arc) — we depend
  on the File System Access API for both read (folder picker) and
  write (output folder)
- A Firebase project with **Firestore** and **Authentication** enabled
  (free tier is enough for local dev)

## Local dev

```bash
cd webapp
npm install
npm run dev
```

The Astro dev server starts on `http://localhost:4321`. The Firebase
config is read from environment variables / the `.firebase/` folder.
For most dev work, you can sign in with the **mock auth** by setting
`VITE_USE_MOCK_AUTH=true` in a local `.env`.

## Build

```bash
npm run build
```

This runs `scripts/generate_sitemap.js` then `astro build`. Output
goes to `dist/`. The build also produces a `sitemap.xml` and
`robots.txt` in `public/` from the canonical config.

## Type check (CI gate)

```bash
node_modules/.bin/tsc -p tsconfig.app.json --noEmit
```

`tsconfig.app.json` enables strict mode + `noUnusedLocals` +
`noUnusedParameters`. Pre-existing warnings on `latitude/longitude
on {}` and a few empty-object index sites are tracked in the issue
list; new code should be clean.

## Lint

```bash
npm run lint
```

ESLint flat config. Add new rules with a justification in the PR
description — don't widen the config without discussion.

## Deploy

Production deploy is Cloudflare Pages. The build command in the
Cloudflare dashboard is `npm run build`. Output dir is `dist/`.

Cloudflare environment bindings (KV, D1, R2) are configured in
`wrangler.json` and surfaced as `import.meta.env.*` in code.

## Firebase emulator (optional but recommended)

```bash
firebase emulators:start --only auth,firestore
```

Then point the app at the emulators with `VITE_USE_FIREBASE_EMULATOR=true`.
Lets you exercise the full admin flow without touching production data.

## Smoke test before each release

1. `npm run build` — must succeed.
2. `npm run preview` — serves the built output.
3. Open `http://localhost:4321/`. Sign in.
4. Pick a takeout folder with ≥ 8 000 files. Run a restore. Confirm
   the renderer heap stays under 600 MB throughout (Chrome Task
   Manager).
5. Refresh mid-run, confirm resume works.

## Common gotchas

- **Stale `dist/`**: delete it before a fresh `npm run build` if you
  see weird `astro build` errors about "file already exists."
- **`firebase.json` vs `firestore.rules`**: rules are deployed
  separately via `firebase deploy --only firestore:rules`. The
  hosting config in `firebase.json` is for the Cloudflare ↔ Firebase
  handshake, not for rules.
- **File System Access permission state**: the user has to re-grant
  the output folder on every page load. There's no way around this
  in the API.
