import fs from 'fs';
import path from 'path';

const baseUrl = "https://takeoutfix.pages.dev";
const today = new Date().toISOString().split('T')[0];

function collectStaticRoutes(dir, relative = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const routes = new Set();

  for (const entry of entries) {
    if (entry.name.startsWith('_')) continue;

    const relPath = relative ? `${relative}/${entry.name}` : entry.name;
    const absPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (relPath === 'api' || relPath.startsWith('api/') || relPath === 'admin' || relPath.startsWith('admin/')) {
        continue;
      }
      for (const route of collectStaticRoutes(absPath, relPath)) {
        routes.add(route);
      }
      continue;
    }

    if (!entry.name.endsWith('.astro')) continue;
    if (entry.name.includes('[') || entry.name.includes(']')) continue;

    const routePath = relPath
      .replace(/\.astro$/, '')
      .replace(/\/index$/, '')
      .replace(/^index$/, '');
    routes.add(routePath ? `/${routePath}` : '/');
  }

  return routes;
}

function collectCuratedSeoRoutes() {
  const seoConfigPath = path.resolve('src/config/seoPages.ts');
  if (!fs.existsSync(seoConfigPath)) return new Set();
  const content = fs.readFileSync(seoConfigPath, 'utf8');
  const slugMatches = content.matchAll(/"([^"]+)"\s*:\s*{/g);
  const routes = new Set();
  for (const match of slugMatches) {
    routes.add(`/${match[1]}`);
  }
  return routes;
}

function assertSitemapConfigIsValid() {
  const astroConfigPath = path.resolve('astro.config.mjs');
  const astroConfig = fs.readFileSync(astroConfigPath, 'utf8');
  const siteMatch = astroConfig.match(/site:\s*['"]([^'"]+)['"]/);
  if (siteMatch && siteMatch[1] !== baseUrl) {
    throw new Error(`Sitemap base URL (${baseUrl}) does not match astro.config site (${siteMatch[1]}).`);
  }

  const validRoutes = new Set([
    ...collectStaticRoutes(path.resolve('src/pages')),
    ...collectCuratedSeoRoutes(),
  ]);

  const invalidRoutes = indexablePages
    .map((page) => page.loc)
    .filter((route) => !validRoutes.has(route));

  if (invalidRoutes.length > 0) {
    throw new Error(`Sitemap contains routes with no matching page: ${invalidRoutes.join(', ')}`);
  }
}

function assertNoUnsupportedStructuredDataClaims() {
  const layoutPath = path.resolve('src/layouts/Layout.astro');
  const layout = fs.readFileSync(layoutPath, 'utf8');
  const unsupportedClaims = [
    'PhotoVault Verifier',
    'Duplicate Photo Finder - detect bit-for-bit and perceptual duplicate images',
    'MetaSync - synchronize EXIF metadata from RAW to companion JPEG files',
  ];
  const found = unsupportedClaims.filter((claim) => layout.includes(claim));
  if (found.length > 0) {
    throw new Error(`Unsupported structured-data feature claims found: ${found.join('; ')}`);
  }
}

// ─── High-Value Canonical & Editorial Pillar Pages (AdSense Compliant) ────────
const indexablePages = [
  { loc: "/",                                                      changefreq: "weekly",  priority: "1.0" },
  { loc: "/about",                                                 changefreq: "monthly", priority: "0.8" },
  { loc: "/contact",                                               changefreq: "monthly", priority: "0.8" },
  { loc: "/disclaimer",                                            changefreq: "monthly", priority: "0.5" },
  { loc: "/guides",                                                changefreq: "weekly",  priority: "0.9" },
  { loc: "/guides/google-takeout-json-metadata-explained",         changefreq: "monthly", priority: "0.9" },
  { loc: "/guides/how-to-save-takeout-photos-to-hard-drive-nas-cloud", changefreq: "monthly", priority: "0.9" },
  { loc: "/guides/google-takeout-common-errors-fix",               changefreq: "monthly", priority: "0.9" },
  { loc: "/restore-data",                                          changefreq: "weekly",  priority: "0.9" },
  { loc: "/tool",                                                  changefreq: "monthly", priority: "0.9" },
  { loc: "/download",                                              changefreq: "monthly", priority: "0.8" },
  { loc: "/reviews",                                               changefreq: "weekly",  priority: "0.8" },
  { loc: "/support",                                               changefreq: "monthly", priority: "0.7" },
  { loc: "/privacy",                                               changefreq: "monthly", priority: "0.4" },
  { loc: "/terms",                                                 changefreq: "monthly", priority: "0.4" },
  // Distinct Technical Problem-Solving Pillar Guides
  { loc: "/fix-google-takeout-dates",                              changefreq: "monthly", priority: "0.8" },
  { loc: "/restore-gps-google-takeout",                            changefreq: "monthly", priority: "0.8" },
  { loc: "/google-photos-metadata-fix",                            changefreq: "monthly", priority: "0.8" },
  { loc: "/google-takeout-merger",                                 changefreq: "monthly", priority: "0.8" },
  { loc: "/google-takeout-to-apple-photos",                        changefreq: "monthly", priority: "0.8" },
  { loc: "/metadata-fixer",                                        changefreq: "monthly", priority: "0.8" },
];

assertSitemapConfigIsValid();
assertNoUnsupportedStructuredDataClaims();

let mainXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- Core Canonical & Editorial Pillar Pages -->
`;

for (const page of indexablePages) {
  mainXml += `  <url>
    <loc>${baseUrl}${page.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>\n`;
}

mainXml += `</urlset>\n`;

const sitemapPath = path.resolve('public/sitemap.xml');
fs.mkdirSync(path.dirname(sitemapPath), { recursive: true });
fs.writeFileSync(sitemapPath, mainXml, 'utf8');

console.log(`✅ Generated clean sitemap.xml with ${indexablePages.length} high-value URLs (0 thin programmatic doorway pages).`);
