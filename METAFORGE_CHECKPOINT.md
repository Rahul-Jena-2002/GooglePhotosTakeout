# METAFORGE WORKSPACE CHECKPOINT & HISTORY

This file serves as a cumulative handoff checkpoint to align both Windows and Linux (Fedora) Antigravity AI agents on the status and historical progress of the TakeoutFix workspace.

---

## 🚀 Status Summary (Recent Session: July 14, 2026)

We have migrated the Astro project from SSR/Server mode to **Static Output mode**, pre-rendering all pages (like `/pricing`, `/restore-data`, etc.) to static files. We have also resolved layout bugs, database rules crashes, and Cloudflare Pages compatibility issues on Windows and Linux.

All modifications are successfully committed and pushed to `main`.

---

## 💻 Platform-Specific Issues & Workarounds

### 🔴 Windows Issues
1. **Wrangler `node_modules` Compilation Crash**: 
   * **Why**: Wrangler Pages Dev's file watcher and ignore engine fails to ignore `webapp/functions/node_modules` due to path backslashes (`\`). It attempts to compile TypeScript declaration files inside `ci-info` and fails.
   * **Workaround**: Rename or move the `webapp/functions` folder temporarily when running local Wrangler audits on Windows, or rely on Fedora for local Wrangler server route checks.
2. **Process Port Leaking (Port 4321)**:
   * **Why**: Spawning node commands leaves background server wrapper processes running when terminated via basic process signals on Windows.
   * **Workaround**: We integrated process tree termination (`taskkill /F /T`) inside `check_all_routes.js` to clean up the port on exit.
3. **PowerShell Script Execution Restrictions**:
   * **Why**: Windows restricts script runs (e.g. blocking direct `.ps1` executions of `firebase`).
   * **Workaround**: Always run Firebase CLI commands prepended with `npx` inside a CMD context (e.g., `cmd /c "npx firebase deploy"`).

### 🔵 Fedora (Linux) Issues
1. **Strict Case-Sensitive File Loading**:
   * **Why**: Linux filesystems are strictly case-sensitive. Windows-created imports (like `import "./layouts/layout.astro"` referencing `Layout.astro` uppercase) will crash during compilation on Fedora.
   * **Workaround**: Always keep all import casings identical to file name casing.
2. **CRLF Line Ending Corruptions**:
   * **Why**: Saving configuration files on Windows can inject CRLF (`\r\n`) line endings. When built on Linux/Fedora, files like `_redirects` or `.env` fail to parse properly, causing live routing mismatches (returning `404`).
   * **Workaround**: Ensure your editor saves files using LF (`\n`). Git staging is now configured to automatically normalize file line-endings to LF.

---

## 🛠️ Key Improvements & Fixes (July 14, 2026)

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

### 6. Linux/Cloudflare Build Fix
* **Files**: `webapp/package.json`, `webapp/scripts/append_spa_rewrite.js` (NEW)
* **Change**: Replaced inline backslash-escaped Node commands (`node -e ...`) in the package.json build script with a clean execution of `append_spa_rewrite.js`.
* **Why**: Escaping double quotes inside package.json scripts works on Windows CMD/PowerShell but throws shell syntax parsing errors on Linux bash (which Cloudflare Pages runs), causing deployment builds to crash on upload.

---

## 📜 Historical Session Summary (June 19, 2026 Overhaul)

### Security & Encryption (Area A)

#### A.1 Browser-Side AES-256-GCM Utilities
- Created `/webapp/src/lib/crypto.ts` with Web Crypto API implementation
- Functions: `deriveKeyFromPassword()`, `encrypt()`, `decrypt()`
- Prefix: `enc:v1:` identifies encrypted values
- Uses PBKDF2 (100k iterations) + AES-256-GCM

#### A.2 Master Encryption Key (MEK) Session Management
- Integrated MEK input banner in AdminKeys.tsx
- Admin enters 32-byte hex MEK once per session
- MEK stored in React state only (never localStorage/Firestore)
- Sensitive fields:
  - Show as locked (🔒) without MEK
  - Decrypt and become editable with MEK
  - Re-encrypt before saving
- Supported fields: Gateway API Key, Dodo Live/Test API Keys, Dodo Webhook Secret, Gemini API Key

#### A.3 Node.js Crypto Helper
- Created `/webapp/functions/lib/crypto.js`
- Uses Node.js `crypto` module for AES-256-GCM
- Ready for integration in Cloud Functions (local-server.js, index.js)

#### A.4 Hardcoded Secrets Cleanup
- Updated `setup_dodo_products.js` to use `FIREBASE_OAUTH_CLIENT_ID`/`FIREBASE_OAUTH_CLIENT_SECRET` env vars
- Scripts already configured for env vars:
  - `submit_indexnow.js` - uses INDEXNOW_KEY, SITE_URL
  - `trigger_dodo_webhook.js` - uses Firebase config env vars

#### A.5 Key Management Documentation
- Created `/webapp/docs/KEYS.md` (comprehensive reference)
- Contents:
  - Classification of all 19 keys (sensitive vs. plaintext)
  - Encryption procedures & MEK generation
  - Setup instructions & environment variables
  - Firestore structure & security rules
  - Key rotation & troubleshooting

### Routing Fix (Area B)

#### B.1 Admin Keys 404 Bug Fix
- Fixed `/admin/keys` route returning 404 in production
- Added `{ params: { all: 'keys' } }` to `getStaticPaths()` in `[admin/[...all].astro]
- Now pre-renders `/admin/keys/index.html` during build

### Performance Optimization (Area C)

#### C.1 Firebase Firestore Lazy-Loading
- Modified `/webapp/src/firebase.ts` to defer Firestore module loading
- `getDb()` function handles lazy initialization
- Functions using Firestore (`initUser`, `addCloudUsage`, `logExtractionEvent`) use dynamic imports
- Backward-compatible export: `db` lazily initialized
- **Expected savings:** ~120 KB gzip on landing page

#### C.4 AdminRouter Code-Splitting
- Implemented `React.lazy()` + `Suspense` for all admin routes
- Lazy-loaded components:
  - AdminDashboard, AdminUsers, AdminUserDashboard, AdminSupport
  - AdminReviews, AdminTeam, AdminRevenue, AdminSettings
  - AdminStatistics, AdminAudit, AdminKeys
- LoadingFallback component for consistent UX
- **Expected savings:** ~150 KB gzip on landing page bundle
- Admin routes now load on-demand

---

## 🔍 How to Verify Local Routes
To verify all routes locally, run:
```bash
cd webapp
node scripts/check_all_routes.js
```
*Expected output: All 65 routes successfully pass audits.*
