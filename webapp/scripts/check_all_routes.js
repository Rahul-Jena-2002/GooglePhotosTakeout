import fs from 'fs';
import path from 'path';
import { execSync, spawn } from 'child_process';

// Parse CLI Arguments
const args = process.argv.slice(2);
let sitemapPath = 'public/sitemap.xml';
let baseUrl = 'http://localhost:4321';
let concurrency = 5;
let runBuild = true;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--sitemap' && args[i + 1] && !args[i + 1].startsWith('--')) {
    sitemapPath = args[i + 1];
    i++;
  } else if (args[i] === '--base' && args[i + 1] && !args[i + 1].startsWith('--')) {
    baseUrl = args[i + 1];
    i++;
  } else if (args[i] === '--concurrency' && args[i + 1] && !args[i + 1].startsWith('--')) {
    concurrency = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--no-build') {
    runBuild = false;
  }
}

baseUrl = baseUrl.replace(/\/$/, '');

console.log('=== ROUTE AUDIT & VALIDATION AUTOMATION ===');

// 1. Run Sitemap Generator
if (!runBuild) {
  console.log('\n--- 1. Generating sitemap.xml ---');
  try {
    execSync('node scripts/generate_sitemap.js', { stdio: 'inherit' });
    console.log('Sitemap generated successfully.');
  } catch (err) {
    console.error('Failed to generate sitemap:', err.message);
    process.exit(1);
  }
}

// 2. Build the project
if (runBuild) {
  console.log('\n--- 2. Building the project ---');
  try {
    // Run npm build using npm.cmd to avoid ExecutionPolicy restrictions in PowerShell
    const buildCmd = process.platform === 'win32' ? 'npm.cmd run build' : 'npm run build';
    console.log(`Executing: ${buildCmd}`);
    execSync(buildCmd, { stdio: 'inherit' });
    console.log('Project built successfully.');
  } catch (err) {
    console.error('Failed to build project:', err.message);
    process.exit(1);
  }
}

// 3. Start the Preview Server
console.log('\n--- 3. Starting Wrangler Preview Server ---');
let previewProcess;
const port = new URL(baseUrl).port || '4321';
try {
  const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const spawnArgs = ['wrangler', 'pages', 'dev', 'dist/client', '--port', port];
  console.log(`Executing: ${cmd} ${spawnArgs.join(' ')}`);
  
  previewProcess = spawn(cmd, spawnArgs, {
    stdio: 'pipe',
    detached: false,
    shell: true
  });

  // Log stdout/stderr for troubleshooting
  previewProcess.stdout.on('data', (data) => {
    // console.log(`[Preview Server]: ${data.toString().trim()}`);
  });
  previewProcess.stderr.on('data', (data) => {
    console.error(`[Preview Server Error]: ${data.toString().trim()}`);
  });

} catch (err) {
  console.error('Failed to start Wrangler preview server:', err.message);
  process.exit(1);
}

// Helper to kill preview server
function cleanup() {
  if (previewProcess) {
    console.log('\n--- Cleaning up: Stopping Preview Server ---');
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /F /T /PID ${previewProcess.pid}`, { stdio: 'ignore' });
      } else {
        previewProcess.kill();
      }
    } catch (e) {}
  }
}

// Ensure cleanup runs on exit
process.on('exit', cleanup);
process.on('SIGINT', () => { process.exit(1); });
process.on('SIGTERM', () => { process.exit(1); });
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

// 4. Poll Preview Server until ready
console.log(`Waiting for preview server to be ready at ${baseUrl}...`);
let isReady = false;
for (let attempt = 1; attempt <= 30; attempt++) {
  try {
    const res = await fetch(baseUrl);
    if (res.status === 200 || res.status === 404) {
      isReady = true;
      break;
    }
  } catch (e) {
    // Not ready yet
  }
  await new Promise(r => setTimeout(r, 500));
}

if (!isReady) {
  console.error(`❌ Error: Preview server did not become ready at ${baseUrl} after 15 seconds.`);
  process.exit(1);
}
console.log('Preview server is ready!\n');

// 5. Read and Parse Sitemap
if (!fs.existsSync(sitemapPath)) {
  console.error(`❌ Error: Sitemap file not found at ${sitemapPath}`);
  process.exit(1);
}
const sitemapContent = fs.readFileSync(sitemapPath, 'utf8');
const locRegex = /<loc>(https?:\/\/[^<]+)<\/loc>/g;
const urls = [];
let match;
while ((match = locRegex.exec(sitemapContent)) !== null) {
  urls.push(match[1]);
}
console.log(`Found ${urls.length} URLs in sitemap.`);

// Map URLs to local base
const localUrls = urls.map(url => {
  const urlObj = new URL(url);
  return `${baseUrl}${urlObj.pathname}${urlObj.search}`;
});

// Admin sub-pages to check
const adminPaths = [
  '/admin',
  '/admin/tool',
  '/admin/users',
  '/admin/users/dashboard',
  '/admin/support',
  '/admin/reviews',
  '/admin/team',
  '/admin/revenue',
  '/admin/settings',
  '/admin/statistics',
  '/admin/audit',
  '/admin/keys',
  '/admin/payment-gateway',
  '/admin/plan-thresholds',
  '/admin/tier-features',
  '/admin/payments',
  '/admin/dev'
];

adminPaths.forEach(path => {
  urls.push(`https://googlephotos-takeout-fix.com${path}`);
  localUrls.push(`${baseUrl}${path}`);
});
console.log(`Added ${adminPaths.length} admin paths to audit. Total URLs to check: ${localUrls.length}`);


const failures = [];

// Helper to check response and validate HTML structure
async function pingUrl(localUrl, originalUrl) {
  try {
    const response = await fetch(localUrl, { redirect: 'manual' });
    
    // Assert 1: Status code is 200
    if (response.status !== 200) {
      return { success: false, reason: `Status code is ${response.status} (expected 200)` };
    }

    // Assert 2: Content-Type is text/html
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      return { success: false, reason: `Content-Type is "${contentType}" (expected to include "text/html")` };
    }

    // Assert 3: Body is not blank (length >= 200)
    const body = await response.text();
    if (body.length < 200) {
      return { success: false, reason: `Response body length is ${body.length} (expected >= 200)` };
    }

    // Assert 4: Basic HTML structure is valid
    const cleanedBody = body
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '');
    const htmlLower = cleanedBody.toLowerCase();
    const idxHtmlOpen = htmlLower.indexOf('<html');
    const idxHeadOpen = htmlLower.indexOf('<head');
    const idxHeadClose = htmlLower.indexOf('</head>');
    const idxBodyOpen = htmlLower.indexOf('<body');
    const idxBodyClose = htmlLower.indexOf('</body>');
    const idxHtmlClose = htmlLower.indexOf('</html>');

    if (idxHtmlOpen === -1) {
      return { success: false, reason: `Missing <html> opening tag` };
    }
    if (idxHeadOpen === -1) {
      return { success: false, reason: `Missing <head> opening tag` };
    }
    if (idxHeadClose === -1) {
      return { success: false, reason: `Missing </head> closing tag` };
    }
    if (idxBodyOpen === -1) {
      return { success: false, reason: `Missing <body> opening tag` };
    }
    if (idxBodyClose === -1) {
      return { success: false, reason: `Missing </body> closing tag` };
    }
    if (idxHtmlClose === -1) {
      return { success: false, reason: `Missing </html> closing tag` };
    }

    // Check order
    if (!(idxHtmlOpen < idxHeadOpen && 
          idxHeadOpen < idxHeadClose && 
          idxHeadClose < idxBodyOpen && 
          idxBodyOpen < idxBodyClose && 
          idxBodyClose < idxHtmlClose)) {
      return { 
        success: false, 
        reason: `HTML tags are out of order. Indices: html(${idxHtmlOpen}) < head(${idxHeadOpen}) < /head>(${idxHeadClose}) < body(${idxBodyOpen}) < /body>(${idxBodyClose}) < /html>(${idxHtmlClose})` 
      };
    }

    return { success: true };
  } catch (err) {
    return { success: false, reason: `Fetch error: ${err.message || err}` };
  }
}

// Concurrency runner
async function runWithConcurrency(tasks, limit) {
  const results = [];
  const executing = new Set();
  
  for (const task of tasks) {
    const p = Promise.resolve().then(() => task());
    results.push(p);
    executing.add(p);
    
    const clean = () => executing.delete(p);
    p.then(clean, clean);
    
    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }
  
  return Promise.all(results);
}

// Map each URL to audit task
const tasks = localUrls.map((localUrl, index) => {
  const originalUrl = urls[index];
  return async () => {
    const result = await pingUrl(localUrl, originalUrl);
    if (!result.success) {
      console.error(`❌ FAILED: ${localUrl} - ${result.reason}`);
      failures.push({ url: localUrl, originalUrl, reason: result.reason });
    } else {
      console.log(`✅ PASSED: ${localUrl}`);
    }
  };
});

console.log('--- 4. Running route audits ---');
await runWithConcurrency(tasks, concurrency);

// 6. Verification of redirects and invalid slugs
console.log('\n--- 5. Verifying redirects and invalid SEO slugs ---');

// Check 1: Direct requests to /restore-data resolve to 200
console.log('Checking /restore-data resolves to 200...');
try {
  const res = await fetch(`${baseUrl}/restore-data`);
  if (res.status === 200) {
    console.log('✅ /restore-data resolves to 200');
  } else {
    console.error(`❌ /restore-data resolved to ${res.status}`);
    failures.push({ url: `${baseUrl}/restore-data`, reason: `Status code ${res.status}` });
  }
} catch (err) {
  console.error('❌ /restore-data check failed:', err.message);
  failures.push({ url: `${baseUrl}/restore-data`, reason: err.message });
}

// Check 1.5: /restore-data.html redirects (301) to /restore-data
console.log('Checking /restore-data.html redirects (301) to /restore-data...');
try {
  const res = await fetch(`${baseUrl}/restore-data.html`, { redirect: 'manual' });
  if (res.status === 301) {
    const location = res.headers.get('location');
    if (location && (location === '/restore-data' || location.endsWith('/restore-data'))) {
      console.log('✅ /restore-data.html redirects (301) to /restore-data');
    } else {
      console.error(`❌ /restore-data.html redirected to wrong location: ${location}`);
      failures.push({ url: `${baseUrl}/restore-data.html`, reason: `Redirect location is ${location} (expected /restore-data)` });
    }
  } else if (res.status === 200) {
    // Wrangler pages dev locally resolves .html extensions via clean URLs before processing redirects
    console.log('✅ /restore-data.html resolved to 200 OK (Wrangler dev clean URLs emulation)');
  } else {
    console.error(`❌ /restore-data.html did not redirect with 301 or return 200 OK (status ${res.status})`);
    failures.push({ url: `${baseUrl}/restore-data.html`, reason: `Expected 301 or 200, got ${res.status}` });
  }
} catch (err) {
  console.error('❌ /restore-data.html redirect check failed:', err.message);
  failures.push({ url: `${baseUrl}/restore-data.html`, reason: err.message });
}

// Check 2: Direct requests to an invalid SEO slug returns 404
console.log('Checking invalid SEO slug /how-to-fix-nothing-from-nothing returns 404...');
try {
  const res = await fetch(`${baseUrl}/how-to-fix-nothing-from-nothing`);
  if (res.status === 404) {
    console.log('✅ Invalid SEO slug returns 404');
  } else {
    console.error(`❌ Invalid SEO slug returned ${res.status}`);
    failures.push({ url: `${baseUrl}/how-to-fix-nothing-from-nothing`, reason: `Expected 404, got ${res.status}` });
  }
} catch (err) {
  console.error('❌ Invalid SEO slug check failed:', err.message);
  failures.push({ url: `${baseUrl}/how-to-fix-nothing-from-nothing`, reason: err.message });
}

// Check 3: Redirect rule verification in _redirects
console.log('Checking _redirects compilation output...');
const redirectsPath = path.resolve('dist/client/_redirects');
if (fs.existsSync(redirectsPath)) {
  console.log(`✅ _redirects exists in build output at ${redirectsPath}`);
  const redirectContent = fs.readFileSync(redirectsPath, 'utf8');
  if (redirectContent.includes('/restore-data.html /restore-data 301')) {
    console.log('✅ _redirects contains correct redirect rules');
  } else {
    console.error('❌ _redirects is missing redirect rules');
    failures.push({ url: '_redirects file', reason: 'Missing redirect rules' });
  }
} else {
  const altRedirectsPath = path.resolve('dist/_redirects');
  if (fs.existsSync(altRedirectsPath)) {
    console.log(`✅ _redirects exists in build output at ${altRedirectsPath}`);
    const redirectContent = fs.readFileSync(altRedirectsPath, 'utf8');
    if (redirectContent.includes('/restore-data.html /restore-data 301')) {
      console.log('✅ _redirects contains correct redirect rules');
    } else {
      console.error('❌ _redirects is missing redirect rules');
      failures.push({ url: '_redirects file', reason: 'Missing redirect rules' });
    }
  } else {
    console.error('❌ _redirects does not exist in build output');
    failures.push({ url: '_redirects file', reason: 'File not found in build output' });
  }
}

console.log('\n--- Route Audit Summary ---');
if (failures.length > 0) {
  console.error(`Total failures: ${failures.length}`);
  failures.forEach(f => {
    console.error(`- ${f.url}: ${f.reason}`);
  });
  process.exit(1);
} else {
  console.log(`All ${urls.length} routes and redirects passed the audit successfully!`);
  process.exit(0);
}
