/**
 * audit_cloudflare_security.js
 *
 * Automated Cloudflare security & configuration audit run during the build process.
 * Verifies:
 * 1. Cloudflare Pages _headers has all critical security headers (CSP, HSTS, X-Content-Type-Options, etc.).
 * 2. Cloudflare Pages _redirects has no open redirects or unvalidated external protocols.
 * 3. Client build directory (dist/client/) has 0 leaked secrets, private keys, or environment files.
 * 4. Checks generated static assets against Cloudflare's per-file size limit.
 */

import fs from 'fs';
import path from 'path';
import { isSafeRedirectTarget } from './redirect_policy.js';

const DIST_DIR = path.resolve('dist/client');
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
  logFail('dist/client/_headers file not found! Cloudflare security headers missing.');
} else {
  const headersContent = fs.readFileSync(HEADERS_FILE, 'utf-8');
  for (const [index, line] of headersContent.split(/\r?\n/).entries()) {
    if (line.length > 2000) logFail(`Cloudflare _headers line ${index + 1} exceeds 2,000 characters.`);
  }

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
      if (!isSafeRedirectTarget(target)) {
        logFail(`Potentially unsafe redirect detected in _redirects: ${line}`);
        openRedirectFound = true;
      }
    }
  }
  if (!openRedirectFound) {
    logPass('Cloudflare _redirects has no open or insecure external redirects.');
  }
}

// 3. Scan public client assets for sensitive files and leaked secrets.
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
const MAX_STATIC_ASSET_BYTES = 25 * 1024 * 1024;

function scanDirectory(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(DIST_DIR, fullPath);

    if (entry.isDirectory()) {
      scanDirectory(fullPath);
    } else {
      try {
        if (fs.statSync(fullPath).size > MAX_STATIC_ASSET_BYTES) {
          logFail(`Static asset exceeds the 25 MiB Cloudflare Workers limit: ${relPath}`);
        }
      } catch {
        logFail(`Could not check static asset size: ${relPath}`);
      }
      // Check filename
      for (const pattern of FORBIDDEN_FILE_PATTERNS) {
        if (pattern.test(entry.name)) {
          logFail(`Forbidden sensitive file found in public dist output: ${relPath}`);
        }
      }

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
          logFail(`Could not inspect client output: ${relPath}`);
        }
      }
    }
  }
}

if (fs.existsSync(DIST_DIR)) {
  const errorsBeforeScan = errorCount;
  scanDirectory(DIST_DIR);
  if (errorCount === errorsBeforeScan) {
    logPass('Scanned client output for known secret patterns and forbidden files.');
  }
} else {
  logFail('dist/client/ directory does not exist. Client build output missing.');
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
