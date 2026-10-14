import fs from 'fs';
import path from 'path';

const baseUrl = "https://takeoutfix.pages.dev";

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
  { loc: "/download",                                              changefreq: "monthly", priority: "0.8" },
  { loc: "/support",                                               changefreq: "monthly", priority: "0.7" },
  { loc: "/privacy",                                               changefreq: "monthly", priority: "0.4" },
  { loc: "/terms",                                                 changefreq: "monthly", priority: "0.4" },
  { loc: "/restore-data",                                          changefreq: "weekly",  priority: "0.9" },
  { loc: "/tool",                                                  changefreq: "weekly",  priority: "0.9" },
];

let mainXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- Core Canonical & Editorial Pillar Pages -->
`;

for (const page of indexablePages) {
  mainXml += `  <url>
    <loc>${baseUrl}${page.loc}</loc>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>\n`;
}

mainXml += `</urlset>\n`;

const sitemapPath = path.resolve('public/sitemap.xml');
fs.mkdirSync(path.dirname(sitemapPath), { recursive: true });
fs.writeFileSync(sitemapPath, mainXml, 'utf8');

console.log(`✅ Generated clean sitemap.xml with ${indexablePages.length} high-value URLs (0 thin programmatic doorway pages).`);
