# Project Development Recap (Google Photos Takeout Extractor Webapp)

This document contains a quick, high-level summary of recent development updates, structural changes, and optimization work implemented on the TakeoutFix webapp. Subsequent agents must read this to avoid context/token waste.

---

## 1. Modular Admin Settings Restructuring
To keep the main Admin Settings panel clean and modular, configuration areas were separated:
*   **Plan Thresholds (`/admin/plan-thresholds`)**: Handles file count and size (MB) constraints for Free, Single Pass, Pro, and Super plans. Enforces unlimited values dynamically.
*   **Tier Features Customizer (`/admin/tier-features`)**: Configures titles, descriptions, feature bullet items (including bold highlight options), the **7-Day Refund Policy** text editor, and the **Plan Comparison Table**.
*   **Core Settings & FAQs (`/admin/settings`)**: Exclusively handles maintenance mode toggles, star review auto-approvals, and FAQ Q&A database entries.

---

## 2. Default Region Optimization (India / Tier 3 defaults)
*   Defaulted navigation context, checkout pages, and Payment Gateway country detection to **India (`IN` / `in`)** if no browser cache or timezone indicates otherwise.

---

## 3. IndexedDB & Processing Pipeline Optimizations (OOM "Aw, Snap!" Fixes)
*   **Schema Upgrade**: Incremented IndexedDB database version to `3` and created a `status` index on the files table.
*   **Cursor-Based Pagination**: Refactored the restoration loop in `ToolWorkspace.tsx` to read pending records sequentially using cursor-based pagination (tracking `lastFileId` instead of loading entire tables into memory).
*   **Memory Hygiene**: Removed massive runtime file name logs rendering lists and replaced them with dynamic outer ring loading indicators during active scan/restores.

---

## 4. Telemetry-Driven Recovery Center Redesign
*   **Command Center Sidebar (28% width)**: Houses real-time telemetry gauges (CPU load, active thread count, JS heap memory usage), progress tracking stats, and an upgrade premium promotion widget.
*   **Workspace (72% width)**: Stacks Source and Destination controls side-by-side on desktop. Stacks progress controls and action buttons on the right. Formats logs console at the bottom with estimated time remaining (ETA) and filter tabs.
*   **Responsive Flow**: Workspace controls display on top on mobile/tablets (`<1025px`), and Telemetry sidebar stacks at the bottom.

---

## 5. Dynamic Compare Plans Matrix
*   Moved the Plan Comparison Table parameters out of static source files. It is now loaded dynamically from `settings/global.comparisonRows` on Firestore via `AuthContext.tsx`.
*   Supports full customization from the `/admin/tier-features` panel.
*   Applied horizontal scrolling classes to table containers with the first column (labels) locked (`sticky left-0`) using theme-responsive solid backgrounds (`bg-white dark:bg-[#0A0A0A]`) to prevent text overlap.

---

## 6. Admin Panel Keyboard Formatting Shortcuts
*   Enabled **`Ctrl+B` (Bold)**, **`Ctrl+I` (Italic)**, and **`Ctrl+U` (Underline)** shortcuts on textareas (FAQ answers, refund policy editor, support replies) and bullet text inputs.
*   Handles empty selections intelligently by placing the text cursor between the inserted markdown/HTML tags (e.g. `**|**`).
*   Added visual hotkey guidelines to the editor panels.

---

## 7. Premium Plan Status & Source Card Enhancements
*   Redesigned the **Plan Status** card inside the client workspace (`ToolWorkspace.tsx`) to utilize clean, flat backgrounds (flat light-grey `bg-zinc-50` in light mode, and flat dark `bg-zinc-900` in dark mode) with simple borders and contextual icons (`Sparkles`, `ShieldCheck`, `AlertCircle`) depending on the active plan.
*   Added helper text `or drag & drop your folder / ZIP file here` below the Source selection buttons in `ToolWorkspace.tsx`.
*   Differentiated status badges (`Free Tier`, `Single Pass`, `Pro Active`, `Super Active`) for all 4 plans and enforced theme-responsive text colors (dark in light mode, bright in dark mode) to guarantee heading text remains perfectly legible.

---

## 8. Bold / Italic / Underline Formatting Renderers
*   Implemented `renderFormattedText` tokenization functions inside `PricingPage.tsx`, `ExpandableFaq.tsx`, and `SupportPage.tsx`.
*   Parses and renders inline formatted tags (`**bold**` as strong, `*italic*` as em, and `<u>underline</u>` as u) into standard HTML/JSX.
*   Applied format parsing to pricing tier feature bullets, comparison matrix cells, refund policies, FAQs, support tickets, and support replies to make sure Ctrl+B, Ctrl+I, and Ctrl+U formatting renders properly on the frontend.
*   Ensured formatted text elements inherit parent cell/bullet colors naturally (removing hardcoded text-white overrides) and replaced invalid `text-indigo-650` classes with the valid Tailwind standard `text-indigo-600`.
*   Added a content-aware cell styling helper `getTableCellStyle` in `PricingPage.tsx` to differentiate cell colors dynamically (rendering "Unlimited"/"Included"/"Enabled" in premium green on the Super column, branding-specific blue/indigo for all highlighted Pro values, and omitted cells in muted gray).

---

## 9. Dodo API Key Prefix Isolation & Hardcoded UI
*   **Visual Flex Addon**: Refactored key input fields in [AdminKeys.tsx](file:///run/media/rahul/Rahulllllll/UBUNTU/DESKTOP/Rahul/Java/Projects/takeout%20extractor/GoogleTakeout%20-%20Copy%20%282%29/webapp/src/react-pages/AdminKeys.tsx) and [AdminPaymentGateway.tsx](file:///run/media/rahul/Rahulllllll/UBUNTU/DESKTOP/Rahul/Java/Projects/takeout%20extractor/GoogleTakeout%20-%20Copy%20%282%29/webapp/src/react-pages/AdminPaymentGateway.tsx). The `sk_live_` and `sk_test_` prefixes are visually isolated in a grey, border-separated, non-editable prefix block on the left of the input container.
*   **Input Auto-Parsing**: Paste events auto-detect and strip any `sk_live_`/`sk_test_` prefix so that only the raw suffix is editable in the text field.
*   **Auto-Prepend on Save**: The UI automatically prepends the correct prefix on save before writing to Firestore.

---

## 10. Real-time Keys Sync & MEK Fallback
*   **Real-time `onSnapshot` Sync**: Subscribed both admin configuration pages to `settings/system` and `settings/secure` snapshots, synchronizing keys instantly between the Keys and Payment Gateway dashboards without a browser refresh.
*   **Default Master Encryption Key (MEK) Fallback**: Auto-falls back to the default MEK (`92elPvQ63jp_SXOmGbLyOgvfcGHVP-GfDbbiyLV4rpw`) if none is active, decrypting all keys automatically upon visiting the panel.
*   **Eye Visibility Button Fix**: Centered the eye toggle buttons and adjusted z-indices to prevent focus/overlay click blocking.

---

## 11. Dynamic Gateway Hosts & Backend Decryption
*   **Mode Detection based on Prefix**: Updated `local-server.js` and Cloud Functions `index.js` to route requests to Dodo Payments sandbox (`test.dodopayments.com`) or production (`live.dodopayments.com`) dynamically based on the decrypted key's prefix (`sk_test_` or `sk_live_`).
*   **Zero-Config Local Backend Decryption**: Pre-loaded the default MEK inside the backend decrypt utility, allowing local server runs without manual terminal environment variables.

---

## 12. Admin Verification Performance Optimization
*   **Parallel Queries**: Fetches user profile and admin records concurrently using `Promise.all` in `AuthContext.tsx`, cutting RTT in half.
*   **Write Elimination**: Tracks profile changes and skips database write operations unless fields changed.

---

## 13. Spring Boot App UI & WebSocket Migration
*   **Vanilla JS Migration**: Replaced the React frontend inside the local desktop app with a fast, high-performance, dark Vanilla JS interface styled with Inter/Outfit typography.
*   **Stomp WebSockets Logs Stream**: Subscribed to backend WebSocket topics to stream progress execution and log messages in real-time.
*   **Firebase Google Auth Redirection**: Authenticates local desktop users with Firebase Google sign-in and verifies plan levels.

---

## How to Verify
Run the Astro static build check:
```bash
node node_modules/astro/bin/astro.mjs build
```
Build should execute cleanly in under 15 seconds.
