import fs from 'fs';
import path from 'path';

// 1. Append SPA redirect rule to dist/_redirects if it exists
const redirectsFile = path.resolve('dist/_redirects');
if (fs.existsSync(redirectsFile)) {
  fs.appendFileSync(redirectsFile, '\n/admin/* /admin.html 200\n');
  console.log('Appended SPA rewrite to ' + redirectsFile);
}

// 2. Safely create .prerender directory and dummy wrangler.json if Cloudflare adapter expects it
const prerenderDir = path.resolve('dist/server/.prerender');
if (!fs.existsSync(prerenderDir)) {
  fs.mkdirSync(prerenderDir, { recursive: true });
}
const prerenderWrangler = path.join(prerenderDir, 'wrangler.json');
if (!fs.existsSync(prerenderWrangler)) {
  fs.writeFileSync(prerenderWrangler, JSON.stringify({ name: "takeoutfix", compatibility_date: "2026-04-15" }));
}

// 3. If dist/client exists, recursively move everything from dist/client/ to dist/
const srcDir = path.resolve('dist/client');
const destDir = path.resolve('dist');

function moveDirSync(src, dest) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (let entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      moveDirSync(srcPath, destPath);
    } else {
      if (fs.existsSync(destPath)) {
        fs.unlinkSync(destPath);
      }
      fs.renameSync(srcPath, destPath);
    }
  }
  try {
    fs.rmdirSync(src);
  } catch {}
}

if (fs.existsSync(srcDir)) {
  console.log('Moving static assets from dist/client/ to dist/ for Cloudflare Pages static hosting...');
  moveDirSync(srcDir, destDir);
  console.log('Static assets moved successfully.');
}
