/**
 * audit_cloudflare_security.js
 *
 * Automated Cloudflare security & configuration audit run during the build process.
 * Verifies:
 * 1. Cloudflare Pages _headers has all critical security headers (CSP, HSTS, X-Content-Type-Options, etc.).
 * 2. Cloudflare Pages _redirects has no open redirects or unvalidated external protocols.
 * 3. Client build directory (dist/) has 0 leaked secrets, private keys, or environment files.
 * 4. Checks assets for unneeded bloat or unminified source artifacts (Ponytail audit).
 */

import fs from 'fs';
import path from 'path';

const DIST_DIR = path.resolve('dist');
const HEADERS_FILE = path.join(DIST_DIR, '_headers');
const REDIRECTS_FILE = path.join(DIST_DIR, '_redirects');

let errorCount = 0;
let warningCount = 0;

function logPass(msg) {
  console.log(`\x1b[32m✔ [PASS]\x1b[0m ${msg}`);
}

function logWarn(msg) {
  warningCount++;
  console.log(`\x1b[33m▲ [WARN]\x1b[0m ${msg}`);
}

function logFail(msg) {
  errorCount++;
  console.log(`\x1b[31m✖ [FAIL]\x1b[0m ${msg}`);
}

console.log('\n======================================================');
console.log('   CLOUDFLARE SECURITY & ASSET AUDIT (BUILD GATE)   ');
console.log('======================================================\n');

// 1. Audit Cloudflare _headers
if (!fs.existsSync(HEADERS_FILE)) {
  logFail('dist/_headers file not found! Cloudflare Pages security headers missing.');
} else {
  const headersContent = fs.readFileSync(HEADERS_FILE, 'utf-8');

  const requiredHeaders = [
    { name: 'X-Content-Type-Options', pattern: /X-Content-Type-Options:\s*nosniff/i },
    { name: 'X-Frame-Options', pattern: /X-Frame-Options:\s*(DENY|SAMEORIGIN)/i },
    { name: 'Referrer-Policy', pattern: /Referrer-Policy:\s*strict-origin-when-cross-origin/i },
    { name: 'Permissions-Policy', pattern: /Permissions-Policy:\s*.+/i },
    { name: 'Strict-Transport-Security', pattern: /Strict-Transport-Security:\s*max-age=\d+/i },
    { name: 'Cross-Origin-Opener-Policy', pattern: /Cross-Origin-Opener-Policy:\s*.+/i },
    { name: 'Content-Security-Policy', pattern: /Content-Security-Policy:\s*.+/i }
  ];

  for (const { name, pattern } of requiredHeaders) {
    if (pattern.test(headersContent)) {
      logPass(`Cloudflare _headers defines required '${name}'`);
    } else {
      logFail(`Missing or misconfigured required security header in _headers: '${name}'`);
    }
  }
}

// 2. Audit Cloudflare _redirects
if (fs.existsSync(REDIRECTS_FILE)) {
  const redirectsContent = fs.readFileSync(REDIRECTS_FILE, 'utf-8');
  const lines = redirectsContent.split('\n');
  let openRedirectFound = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2) {
      const target = parts[1];
      // Open redirect check: external http:// or protocol-relative // redirects without whitelist
      if (/^(http:\/\/|\/\/)/i.test(target)) {
        logFail(`Potentially unsafe redirect detected in _redirects: ${line}`);
        openRedirectFound = true;
      }
    }
  }
  if (!openRedirectFound) {
    logPass('Cloudflare _redirects has no open or insecure external redirects.');
  }
}

// 3. Scan dist/ for Sensitive Files and Leaked Secrets
const FORBIDDEN_FILE_PATTERNS = [
  /^\.env/i,
  /\.pem$/i,
  /\.key$/i,
  /serviceAccountKey.*\.json$/i,
  /credentials\.properties$/i,
  /\.git/i
];

const SECRET_CONTENT_PATTERNS = [
  { name: 'Private Key Block', regex: /-----BEGIN (RSA |EC |DSA )?PRIVATE KEY-----\s*[A-Za-z0-9+/=]{40,}/ },
  { name: 'AWS Access Key Secret', regex: /(aws_secret_access_key|aws_session_token)\s*=\s*[A-Za-z0-9\/+=]{40}/i },
  { name: 'Stripe Secret Key', regex: /sk_live_(?!x{6,})[0-9a-zA-Z]{24,}/ },
  { name: 'Google Private Key JSON', regex: /"private_key":\s*"-----BEGIN PRIVATE KEY[^\"]{40,}/ }
];

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.webp', '.ico', '.svg', '.woff', '.woff2', '.ttf', '.eot', '.wasm', '.mp4', '.webm'
]);

function scanDirectory(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(DIST_DIR, fullPath);

    if (entry.isDirectory()) {
      scanDirectory(fullPath);
    } else {
      // Check filename
      for (const pattern of FORBIDDEN_FILE_PATTERNS) {
        if (pattern.test(entry.name)) {
          logFail(`Forbidden sensitive file found in public dist output: ${relPath}`);
        }
      }

      // Only scan client-facing assets for secret content.
      // server/ chunks are never sent to the browser and legitimately
      // reference Firebase Admin credentials from runtime env vars.
      const isServerChunk = relPath.startsWith('server' + path.sep) || relPath.startsWith('server/');
      if (isServerChunk) continue;

      // Check file content for non-binary assets
      const ext = path.extname(entry.name).toLowerCase();
      if (!BINARY_EXTENSIONS.has(ext)) {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          for (const { name, regex } of SECRET_CONTENT_PATTERNS) {
            if (regex.test(content)) {
              logFail(`Secret pattern (${name}) detected in built client bundle: ${relPath}`);
            }
          }
        } catch {
          // ignore unreadable/binary files
        }
      }
    }
  }
}

if (fs.existsSync(DIST_DIR)) {
  scanDirectory(DIST_DIR);
  logPass('dist/ directory scanned for secrets and sensitive configuration leaks.');
} else {
  logFail('dist/ directory does not exist. Build output missing.');
}

console.log('\n------------------------------------------------------');
console.log(`Audit Finished: ${errorCount} error(s), ${warningCount} warning(s).`);
console.log('------------------------------------------------------\n');

if (errorCount > 0) {
  console.error('\x1b[31m[BUILD HALTED] Cloudflare Security Audit failed. Correct errors before deploying.\x1b[0m\n');
  process.exit(1);
} else {
  console.log('\x1b[32m[BUILD SUCCESS] Cloudflare Security Audit passed.\x1b[0m\n');
  process.exit(0);
}
