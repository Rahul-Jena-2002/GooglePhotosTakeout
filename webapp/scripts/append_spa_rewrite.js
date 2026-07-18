import fs from 'fs';
import path from 'path';

// 1. Append SPA redirect rules
const redirectsFile = path.resolve('dist/client/_redirects');
if (fs.existsSync(redirectsFile)) {
  // All known admin sub-routes → serve /admin.html (the SPA shell) with 200
  // These must come BEFORE the wildcard rule so they take priority.
  const adminRoutes = [
    'tool', 'users', 'users/dashboard', 'support', 'reviews', 'team',
    'revenue', 'settings', 'statistics', 'audit', 'keys',
    'payment-gateway', 'plan-thresholds', 'tier-features', 'payments', 'dev'
  ];

  const lines = ['\n'];
  for (const route of adminRoutes) {
    // Serve the specific pre-rendered HTML file directly (already exists)
    // so refresh on /admin/team goes to /admin/team.html with 200
    lines.push(`/admin/${route} /admin/${route}.html 200`);
  }
  // Wildcard fallback for anything else under /admin/*
  lines.push('/admin /admin.html 200');
  lines.push('/admin/ /admin.html 200');
  lines.push('/admin/* /admin.html 200');
  lines.push('');

  fs.appendFileSync(redirectsFile, lines.join('\n'));
  console.log('Appended SPA admin rewrites to ' + redirectsFile);
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
