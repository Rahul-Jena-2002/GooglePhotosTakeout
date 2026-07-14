import fs from 'fs';
import path from 'path';

// 1. Append SPA redirect rule first
const redirectsFile = path.resolve('dist/client/_redirects');
if (fs.existsSync(redirectsFile)) {
  fs.appendFileSync(redirectsFile, '\n/admin/* /admin.html 200\n');
  console.log('Appended SPA rewrite to ' + redirectsFile);
}

// 2. Recursively move everything from dist/client/ to dist/
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
      fs.renameSync(srcPath, destPath);
    }
  }
  fs.rmdirSync(src);
}

if (fs.existsSync(srcDir)) {
  console.log('Moving static assets from dist/client/ to dist/ for Cloudflare Pages static hosting...');
  moveDirSync(srcDir, destDir);
  console.log('Static assets moved successfully.');
}
