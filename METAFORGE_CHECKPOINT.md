# METAFORGE WORKSPACE CHECKPOINT

This file serves as a handoff checkpoint to align both Windows and Linux (Fedora) Antigravity AI agents on the status and resolution of the deployment and routing architecture.

---

## 🚀 Status Summary

We have migrated the Astro project from SSR/Server mode to **Static Output mode**, pre-rendering all pages (like `/pricing`, `/restore-data`, etc.) to static files. We have also resolved layout bugs, database rules crashes, and Cloudflare Pages compatibility issues on Windows and Linux.

All modifications are successfully committed and pushed to `main`.

---

## 🛠️ Key Improvements & Fixes

### 1. Astro Configuration Update (`output: 'static'`)
* **File**: `webapp/astro.config.mjs`
* **Change**: Changed the configuration from `output: 'server'` to `output: 'static'` (which replaces the deprecated `hybrid` mode in Astro v6).
* **Why**: SSR mode returned `404 Not Found` errors for standard pages because Cloudflare Pages was looking for pre-rendered static HTML files (`dist/client/**/*.html`) which did not exist. Changing to `static` generates physical static files for all pages, and delegates dynamic `/api/*` endpoints to edge workers.

### 2. Live Firestore Security Rules Refactoring
* **File**: `webapp/firestore.rules`
* **Change**: Refactored role helper functions to check `request.auth != null` before evaluating paths (like `/admins/$(request.auth.uid)`).
* **Why**: The rules engine threw null pointer evaluation crashes on unauthenticated queries, returning `permission-denied` (Code 403) for the reviews list and settings page. The updated guarded rules have been deployed to production and are live.

### 3. SVG Scaling Fix for Mobile View
* **File**: `webapp/src/layouts/Layout.astro`
* **Change**: Added explicit `width` and `height` dimensions to key SVGs (logo, hamburger menu, close icons).
* **Why**: Unstyled SVGs expanded to fill the entire container width during ClientRouter client-side navigations on mobile browsers. Physical sizing prevents layout shifts.

### 4. Dynamic Chunk Loading Recovery Handler
* **File**: `webapp/src/layouts/Layout.astro`
* **Change**: Added global event listeners for `error` and `unhandledrejection` in the head script.
* **Why**: If a user has a tab open and you deploy a new version (changing the hash filenames of JS chunks), any client-side lazy loading on the old page returns `404`. The script catches this and automatically reloads the page to retrieve the fresh build.

### 5. Automated Route Audit Tool
* **File**: `webapp/scripts/check_all_routes.js`
* **Change**: Added a comprehensive node checker that builds the project, runs Wrangler dev server, and fetches all 65 paths (sitemap + 17 admin routes) to verify they return `200 OK` and contain valid HTML.
* **Compatibility Notes**: 
  - To prevent background node process leaks on Windows, it uses `taskkill /F /T`.
  - On Windows, it handles Wrangler's Clean URL emulation (`200 OK` for redirect pages).
  - **Linux vs Windows Caveat**: On Windows, Wrangler fails to ignore `webapp/functions` due to path backslashes (`\` vs `/`), trying to compile Firebase Functions dependencies. On Linux, it works perfectly because the path matches `**/node_modules/**` ignore patterns.

### 6. Linux/Cloudflare Build Fix
* **Files**: `webapp/package.json`, `webapp/scripts/append_spa_rewrite.js` (NEW)
* **Change**: Replaced inline backslash-escaped Node commands (`node -e ...`) in the package.json build script with a clean execution of `append_spa_rewrite.js`.
* **Why**: Escaping double quotes inside package.json scripts works on Windows CMD/PowerShell but throws shell syntax parsing errors on Linux bash (which Cloudflare Pages runs), causing deployment builds to crash on upload.

---

## 🔍 How to Verify Local Routes
To verify all routes locally, run:
```bash
cd webapp
node scripts/check_all_routes.js
```
*Expected output: All 65 routes successfully pass audits.*
