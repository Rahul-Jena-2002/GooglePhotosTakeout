import fs from 'fs';
import path from 'path';

const baseUrl = "https://takeoutfix.pages.dev";
const today = new Date().toISOString().split('T')[0];

// ─── High-Value Canonical & Editorial Pillar Pages (AdSense Compliant) ────────
const indexablePages = [
  { loc: "/",                              changefreq: "weekly",  priority: "1.0" },
  { loc: "/restore-data",                  changefreq: "weekly",  priority: "0.9" },
  { loc: "/pricing",                       changefreq: "monthly", priority: "0.8" },
  { loc: "/download",                      changefreq: "monthly", priority: "0.8" },
  { loc: "/reviews",                       changefreq: "weekly",  priority: "0.8" },
  { loc: "/support",                       changefreq: "monthly", priority: "0.7" },
  { loc: "/privacy",                       changefreq: "monthly", priority: "0.4" },
  { loc: "/terms",                         changefreq: "monthly", priority: "0.4" },
  { loc: "/refund",                        changefreq: "monthly", priority: "0.4" },
  { loc: "/tool",                          changefreq: "monthly", priority: "0.9" },
  // Distinct Technical Problem-Solving Pillar Guides
  { loc: "/fix-google-takeout-dates",      changefreq: "monthly", priority: "0.8" },
  { loc: "/restore-gps-google-takeout",    changefreq: "monthly", priority: "0.8" },
  { loc: "/google-takeout-to-apple-photos", changefreq: "monthly", priority: "0.8" },
  { loc: "/metadata-fixer",                changefreq: "monthly", priority: "0.8" },
];

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
