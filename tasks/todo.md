# Todo: AdSense "Low Value Content" Resolution & Content Authority Overhaul

## Phase 1: Essential Trust, Legal & Transparency Pages
- [x] **Task 1: Build comprehensive `/about` page**
  - **Acceptance Criteria:**
    - Creates `webapp/src/pages/about.astro` using `Layout.astro`.
    - Includes developer background, mission, architecture explanation (why local-first matters), photo security principles, and Schema.org `AboutPage` & `Organization` JSON-LD.
    - Responsive, dark/light theme compatible, zero placeholder text.
  - **Verification:** Astro page renders cleanly with 200 OK.

- [x] **Task 2: Build dedicated `/contact` page**
  - **Acceptance Criteria:**
    - Creates `webapp/src/pages/contact.astro` using `Layout.astro`.
    - Includes direct email (`takeoutfix.support@gmail.com`), GitHub repository link, issue tracker link, FAQ shortcuts, response time expectations (within 24-48 hours), and Schema.org `ContactPage`.
    - Includes clean client-side feedback/inquiry form.
  - **Verification:** Form and layout render cleanly.

- [x] **Task 3: Build dedicated `/disclaimer` page**
  - **Acceptance Criteria:**
    - Creates `webapp/src/pages/disclaimer.astro`.
    - Includes explicit non-affiliation disclaimers regarding Google LLC and Apple Inc., trademark acknowledgments, data loss disclaimers, and warranty limitations.
  - **Verification:** Rendered and styled consistently with terms and privacy pages.

- [x] **Checkpoint 1: Trust & Transparency Verification**
  - All three trust pages render without errors, linked cleanly in footer.

---

## Phase 2: High-Value Original Pillar Content Hub
- [x] **Task 4: Create Guides Index Page (`/guides`)**
  - **Acceptance Criteria:**
    - Creates `webapp/src/pages/guides/index.astro`.
    - Clean grid displaying deep technical guides, reading times, tags, and summaries.
  - **Verification:** Page renders and links to pillar guides.

- [x] **Task 5: Author Pillar Guide 1 — The Definitive Guide to Google Takeout JSON Sidecars**
  - **Acceptance Criteria:**
    - Creates `webapp/src/pages/guides/google-takeout-json-metadata-explained.astro`.
    - Over 1,200 words of original, comprehensive technical content: why Google splits files, JSON schema breakdown (`photoTakenTime`, `geoData`), EXIF standard tags (0x9003, 0x0002), Unix timestamps vs local offsets, and step-by-step restoration logic.
    - Includes code snippets, comparison tables, and FAQ section with Schema.org `TechArticle`.
  - **Verification:** High information density, zero generic AI filler.

- [x] **Task 6: Author Pillar Guide 2 — How to Save Google Takeout Photos to External Storage, NAS, and Cloud**
  - **Acceptance Criteria:**
    - Creates `webapp/src/pages/guides/how-to-save-takeout-photos-to-hard-drive-nas-cloud.astro`.
    - Over 1,200 words covering complete workflow: saving restored photos to USB, external SSDs, Synology/QNAP NAS, local drives, or any cloud provider.
    - Schema.org `HowTo` and `TechArticle`.
  - **Verification:** Practical, actionable, universal storage guidance.

- [x] **Task 7: Author Pillar Guide 3 — Troubleshooting Common Google Takeout Errors**
  - **Acceptance Criteria:**
    - Creates `webapp/src/pages/guides/google-takeout-common-errors-fix.astro`.
    - Over 1,200 words covering: truncated filenames (`image(1).json` vs `image.json(1)`), missing GPS coordinates in shared albums, timezone shifts (UTC vs local), and 2GB/50GB split archive quirks.
  - **Verification:** Comprehensive solutions for real user pain points.

- [x] **Checkpoint 2: Content Hub & Pillar Verification**
  - Guides index and 3 in-depth pillar articles build and render with valid structured data.

---

## Phase 3: De-Index Thin Pages & Clean Programmatic Slugs
- [x] **Task 8: Clean `[seoSlug].astro` Combinations & Set Noindex**
  - **Acceptance Criteria:**
    - Remove the 30 generic programmatic loops in `[seoSlug].astro` from `getStaticPaths()`, redirecting uncurated pages to `/restore-data`.
    - Only substantial, high-value pages are allowed in the Google index.
  - **Verification:** Only curated pages rendered.

- [x] **Task 9: Enhance Curated Landing Pages with Unique Content**
  - **Acceptance Criteria:**
    - Upgrade `fix-google-takeout-dates`, `restore-gps-google-takeout`, and `google-takeout-to-apple-photos` with deep, unique copy and links to pillar guides.
  - **Verification:** Unique text across all curated slugs.

- [x] **Checkpoint 3: Thin Page Remediation Verification**
  - Zero duplicate or thin pages exposed to Googlebot as indexable.

---

## Phase 4: Navigation, Sitemap & SEO Optimization
- [x] **Task 10: Update Header & Footer Navigation in `Layout.astro`**
  - **Acceptance Criteria:**
    - Add "Guides" to top header navigation.
    - Add "About", "Contact", "Disclaimer", and "Guides" to footer columns.
    - Ensure all links resolve to active 200 OK pages.
  - **Verification:** Check header and footer in browser/HTML.

- [x] **Task 11: Update `sitemap.xml`**
  - **Acceptance Criteria:**
    - Add `/about`, `/contact`, `/disclaimer`, `/guides`, and the 3 pillar guides with accurate `lastmod` dates.
    - Remove any obsolete or low-value routes.
  - **Verification:** Validate XML structure.

- [x] **Task 12: Verify robots.txt and Schema.org Structured Data**
  - **Acceptance Criteria:**
    - `robots.txt` points cleanly to `sitemap.xml`.
    - Valid JSON-LD graph across all new pages.
  - **Verification:** Valid JSON in script tags.

- [x] **Checkpoint 4: Navigation & Sitemap Verification**
  - All links are live, sitemap contains only 200 OK canonicals.

---

## Phase 5: Verification, Cloudflare Security Gate & Quality Review
- [x] **Task 13: Execute `npm run build` in `webapp/`**
  - **Acceptance Criteria:**
    - Build passes with 0 TypeScript/Astro errors.
    - Cloudflare security audit gate (`scripts/audit_cloudflare_security.js`) passes with 0 errors.
  - **Verification:** Clean build log (Exit code 0, 0 security warnings).

- [x] **Task 14: Final Adversarial Review against AdSense Master Checklist**
  - **Acceptance Criteria:**
    - Check against all 36 points of the AdSense master checklist.
    - Deployed to Cloudflare Pages production (`takeoutfix.pages.dev`).
  - **Verification:** Comprehensive compliance report generated; deployed successfully.
