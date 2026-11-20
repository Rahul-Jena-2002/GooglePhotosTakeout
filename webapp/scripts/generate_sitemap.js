import fs from 'fs';
import path from 'path';

const baseUrl = "https://takeoutfix.pages.dev";

// Canonical public pages intended for indexing.
const indexablePages = [
  { loc: "/" },
  { loc: "/about" },
  { loc: "/contact" },
  { loc: "/support" },
  { loc: "/download" },
  { loc: "/privacy" },
  { loc: "/terms" },
  { loc: "/disclaimer" },
  { loc: "/guides" },
  { loc: "/docs" },
  { loc: "/guides/google-takeout-json-metadata-explained" },
  { loc: "/guides/how-to-save-takeout-photos-to-hard-drive-nas-cloud" },
  { loc: "/guides/google-takeout-common-errors-fix" },
  { loc: "/guides/verify-restored-photo-metadata" },
  { loc: "/guides/google-takeout-missing-photo-location" },
  { loc: "/restore-data" },
  { loc: "/tool" },
];

let mainXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- Core Canonical & Editorial Pillar Pages -->
`;

for (const page of indexablePages) {
  mainXml += `  <url>
    <loc>${baseUrl}${page.loc}</loc>
  </url>\n`;
}

mainXml += `</urlset>\n`;

const sitemapPath = path.resolve('public/sitemap.xml');
fs.mkdirSync(path.dirname(sitemapPath), { recursive: true });
fs.writeFileSync(sitemapPath, mainXml, 'utf8');

console.log(`✅ Generated clean sitemap.xml with ${indexablePages.length} high-value URLs (0 thin programmatic doorway pages).`);
