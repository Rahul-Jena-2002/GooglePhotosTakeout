import fs from 'fs';
import path from 'path';

const actionKeys = ["restore", "recover", "fix", "repair", "merge", "sync", "rebuild", "reconstruct", "retrieve", "preserve", "extract", "convert", "transfer"];
const targetKeys = ["metadata", "meta-data", "exif", "gps", "location", "timestamp", "date-taken", "creation-date", "albums", "people-tags", "camera-data", "photo-information", "video-information"];
const sourceKeys = ["takeout", "photos", "export"];

const baseUrl = "https://takeoutfix.pages.dev";
const today = new Date().toISOString().split('T')[0];

// ─── Core static pages ────────────────────────────────────────────────────────
const corePages = [
  { loc: "/",                             changefreq: "weekly",  priority: "1.0" },
  { loc: "/restore-data",                 changefreq: "monthly", priority: "0.9" },
  { loc: "/pricing",                      changefreq: "monthly", priority: "0.8" },
  { loc: "/reviews",                      changefreq: "weekly",  priority: "0.7" },
  { loc: "/support",                      changefreq: "monthly", priority: "0.6" },
  // ─── Keyword landing pages ────────────────────────────────────────────────
  { loc: "/takeout-fix",                  changefreq: "monthly", priority: "0.9" },
  { loc: "/takeout-fixer",                changefreq: "monthly", priority: "0.9" },
  { loc: "/metadata-fixer",               changefreq: "monthly", priority: "0.9" },
  { loc: "/google-photos-metadata-fix",   changefreq: "monthly", priority: "0.9" },
  { loc: "/google-takeout-merger",        changefreq: "monthly", priority: "0.9" },
];

let mainXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- Core & Keyword Landing Pages -->
`;

for (const page of corePages) {
  mainXml += `  <url>
    <loc>${baseUrl}${page.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>\n`;
}

mainXml += `  <!-- SEO Keyword Permutation Dynamic Landing Pages -->\n`;

let dynamicCount = 0;
for (const action of actionKeys) {
  for (const target of targetKeys) {
    for (const source of sourceKeys) {
      const slug = `how-to-${action}-${target}-from-${source}`;
      mainXml += `  <url>
    <loc>${baseUrl}/${slug}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>\n`;
      dynamicCount++;
    }
  }
}

mainXml += `</urlset>\n`;

const sitemapPath = path.resolve('public/sitemap.xml');
fs.writeFileSync(sitemapPath, mainXml, 'utf8');

const totalUrls = corePages.length + dynamicCount;
console.log(`✅ Generated sitemap.xml at ${sitemapPath}`);
console.log(`   Core pages: ${corePages.length} | Dynamic SEO pages: ${dynamicCount} | Total: ${totalUrls} URLs`);
