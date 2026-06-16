// Using native global fetch

const actionKeys = ["restore", "recover", "fix", "repair", "merge", "sync", "rebuild", "reconstruct", "retrieve", "preserve", "extract", "convert", "transfer"];
const targetKeys = ["metadata", "meta-data", "exif", "gps", "location", "timestamp", "date-taken", "creation-date", "albums", "people-tags", "camera-data", "photo-information", "video-information"];
const sourceKeys = ["takeout", "photos", "export"];

const baseUrl = "https://takeoutfix.pages.dev";

// Generate full URL list
const urls = [
  `${baseUrl}/`,
  `${baseUrl}/restore-data`,
  `${baseUrl}/pricing`,
  `${baseUrl}/reviews`,
  `${baseUrl}/support`
];

for (const action of actionKeys) {
  for (const target of targetKeys) {
    for (const source of sourceKeys) {
      urls.push(`${baseUrl}/how-to-${action}-${target}-from-${source}`);
    }
  }
}

const payload = {
  host: "takeoutfix.pages.dev",
  key: "e107aca980264801af5ddd4a7fe361a3",
  keyLocation: `https://takeoutfix.pages.dev/e107aca980264801af5ddd4a7fe361a3.txt`,
  urlList: urls
};

async function main() {
  console.log(`Submitting ${urls.length} URLs to IndexNow...`);
  
  const response = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify(payload)
  });

  if (response.ok) {
    console.log('Successfully submitted to IndexNow! Search engines will now reindex the pages.');
  } else {
    const text = await response.text();
    console.error(`IndexNow submission failed. Status: ${response.status}`);
    console.error(`Response: ${text}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Error running IndexNow submission:', err);
  process.exit(1);
});
