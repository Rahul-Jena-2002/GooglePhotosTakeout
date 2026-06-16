// Using native global fetch

const actionKeys = ["restore", "recover", "fix", "repair", "merge", "sync", "rebuild", "reconstruct", "retrieve", "preserve", "extract", "convert", "transfer"];
const targetKeys = ["metadata", "meta-data", "exif", "gps", "location", "timestamp", "date-taken", "creation-date", "albums", "people-tags", "camera-data", "photo-information", "video-information"];
const sourceKeys = ["takeout", "photos", "export"];

const baseUrl = "https://takeoutfix.pages.dev";
const INDEXNOW_KEY = "e107aca980264801af5ddd4a7fe361a3";

// ─── Core + keyword landing pages ─────────────────────────────────────────────
const urls = [
  `${baseUrl}/`,
  `${baseUrl}/restore-data`,
  `${baseUrl}/pricing`,
  `${baseUrl}/reviews`,
  `${baseUrl}/support`,
  // Keyword landing pages
  `${baseUrl}/takeout-fix`,
  `${baseUrl}/takeout-fixer`,
  `${baseUrl}/metadata-fixer`,
  `${baseUrl}/google-photos-metadata-fix`,
  `${baseUrl}/google-takeout-merger`,
];

// ─── Dynamic SEO permutation pages ────────────────────────────────────────────
for (const action of actionKeys) {
  for (const target of targetKeys) {
    for (const source of sourceKeys) {
      urls.push(`${baseUrl}/how-to-${action}-${target}-from-${source}`);
    }
  }
}

const payload = {
  host: "takeoutfix.pages.dev",
  key: INDEXNOW_KEY,
  keyLocation: `${baseUrl}/${INDEXNOW_KEY}.txt`,
  urlList: urls
};

// Submit to a given IndexNow endpoint
async function submitTo(name, endpoint) {
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload)
    });
    if (res.ok || res.status === 202) {
      console.log(`✅ ${name}: ${res.status} — ${urls.length} URLs accepted`);
    } else {
      const text = await res.text();
      console.warn(`⚠️  ${name}: ${res.status} — ${text.substring(0, 200)}`);
    }
  } catch (err) {
    console.error(`❌ ${name}: ${err.message}`);
  }
}

async function main() {
  console.log(`\n🔔 Submitting ${urls.length} URLs to IndexNow...`);
  console.log(`   Core pages: 10 | Dynamic SEO pages: ${urls.length - 10}\n`);

  await Promise.all([
    submitTo('IndexNow (api.indexnow.org)',  'https://api.indexnow.org/indexnow'),
    submitTo('Bing IndexNow',                'https://www.bing.com/indexnow'),
  ]);

  console.log('\n✅ Done. Bing and other IndexNow-supported search engines will re-crawl shortly.');
  console.log('   Note: Google does not support IndexNow — use Google Search Console to re-submit sitemap.\n');
}

main().catch(err => {
  console.error('Error running IndexNow submission:', err);
  process.exit(1);
});

