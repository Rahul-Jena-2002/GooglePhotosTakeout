import fs from 'fs';
import path from 'path';

// 1. Append SPA redirect rule to dist/_redirects if it exists
const redirectsFile = path.resolve('dist/_redirects');
if (fs.existsSync(redirectsFile)) {
  fs.appendFileSync(redirectsFile, '\n/admin/* /admin.html 200\n');
  console.log('Appended SPA rewrite to ' + redirectsFile);
}

// 2. If dist/client exists, recursively move non-conflicting assets from dist/client/ to dist/
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
        const srcStat = fs.statSync(srcPath);
        const destStat = fs.statSync(destPath);
        // CRITICAL PROTECTION: Never overwrite a rendered HTML file with a 0-byte placeholder
        if (srcStat.size === 0 && destStat.size > 0) {
          console.log(`Preserving rendered ${entry.name} (${destStat.size} bytes), ignoring 0-byte placeholder`);
          fs.unlinkSync(srcPath);
          continue;
        }
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
