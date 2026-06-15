import fs from 'fs';
import path from 'path';

const actionKeys = ["restore", "recover", "fix", "repair", "merge", "sync", "rebuild", "reconstruct", "retrieve", "preserve", "extract", "convert", "transfer"];
const targetKeys = ["metadata", "exif", "gps", "location", "timestamp", "date-taken", "creation-date", "albums", "people-tags", "camera-data", "photo-information", "video-information"];
const sourceKeys = ["takeout", "photos", "export"];

const baseUrl = "https://takeoutfix.pages.dev";
const today = new Date().toISOString().split('T')[0];

let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- Core Static Pages -->
  <url>
    <loc>${baseUrl}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${baseUrl}/restore-data</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${baseUrl}/pricing</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${baseUrl}/reviews</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>${baseUrl}/support</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <!-- SEO Keyword Permutation Dynamic Landing Pages -->
`;

for (const action of actionKeys) {
  for (const target of targetKeys) {
    for (const source of sourceKeys) {
      const finalSlug = `how-to-${action}-${target}-from-${source}`;
      xml += `  <url>
    <loc>${baseUrl}/${finalSlug}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>\n`;
    }
  }
}

xml += `</urlset>\n`;

const targetPath = path.resolve('public/sitemap.xml');
fs.writeFileSync(targetPath, xml, 'utf8');
console.log(`Generated sitemap.xml at ${targetPath} with ${actionKeys.length * targetKeys.length * sourceKeys.length + 5} URLs.`);
