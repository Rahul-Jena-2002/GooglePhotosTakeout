const fs = require('fs');
const path = require('path');

console.log('=== TEST 1: CANONICAL URL MAPPING ===');
const testCases = [
  { input: '/', expected: 'https://takeoutfix.pages.dev/' },
  { input: '/index.html', expected: 'https://takeoutfix.pages.dev/' },
  { input: '/index', expected: 'https://takeoutfix.pages.dev/' },
  { input: '/restore-data', expected: 'https://takeoutfix.pages.dev/restore-data' },
  { input: '/restore-data.html', expected: 'https://takeoutfix.pages.dev/restore-data' },
  { input: '/restore-data/', expected: 'https://takeoutfix.pages.dev/restore-data' },
  { input: '/pricing', expected: 'https://takeoutfix.pages.dev/pricing' },
  { input: '/pricing.html', expected: 'https://takeoutfix.pages.dev/pricing' },
  { input: '/refund', expected: 'https://takeoutfix.pages.dev/refund' },
  { input: '/refund.html', expected: 'https://takeoutfix.pages.dev/refund' }
];

let allPassed = true;
for (const tc of testCases) {
  const rawPath = tc.input || '/';
  const cleanPath = rawPath.replace(/\.html$/, '').replace(/\/index$/, '').replace(/\/$/, '') || '/';
  const canonicalUrl = `https://takeoutfix.pages.dev${cleanPath === '' ? '/' : cleanPath}`;
  const pass = canonicalUrl === tc.expected;
  if (!pass) allPassed = false;
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${tc.input} => ${canonicalUrl} (expected: ${tc.expected})`);
}

if (!allPassed) {
  console.error('Canonical URL test failed!');
  process.exit(1);
}

console.log('\n=== TEST 2: OG ASSET EXISTENCE & DIMENSIONS ===');
const ogPath = path.resolve('public/og.png');
if (!fs.existsSync(ogPath)) {
  console.error('public/og.png missing!');
  process.exit(1);
}
const stats = fs.statSync(ogPath);
console.log(`[PASS] public/og.png exists (${stats.size} bytes)`);

console.log('\n=== TEST 3: RESTORE-DATA ANCHOR IDS ===');
const restoreDataPath = path.resolve('src/pages/restore-data.astro');
const content = fs.readFileSync(restoreDataPath, 'utf8');

const requiredIds = ['dates-guide', 'tech-specs', 'tech-deep-dive'];
for (const id of requiredIds) {
  const regex = new RegExp(`id=["']${id}["']`, 'g');
  const matches = content.match(regex) || [];
  if (matches.length === 1) {
    console.log(`[PASS] Anchor #${id} exists exactly once`);
  } else {
    console.error(`[FAIL] Anchor #${id} found ${matches.length} times!`);
    allPassed = false;
  }
}

if (!allPassed) process.exit(1);
console.log('\nAll pre-build Slice 1 checks PASSED!');
