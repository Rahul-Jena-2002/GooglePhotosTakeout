import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Model Cloudflare Pages' ordered header rules for the paths whose caching matters here.
function cacheControl(path) {
  const rules = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8').split(/\r?\n/);
  let matches = false;
  let values = [];
  for (const line of rules) {
    if (line.startsWith('/')) {
      const pattern = line.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace('*', '.*');
      matches = new RegExp(`^${pattern}$`).test(path);
    } else if (matches && line.trim() === '! Cache-Control') {
      values = [];
    } else if (matches && line.trim().startsWith('Cache-Control:')) {
      values.push(line.trim().slice('Cache-Control:'.length).trim());
    }
  }
  return values;
}

test('specific caching policies override the global policy', () => {
  assert.deepEqual(cacheControl('/_astro/app.js'), ['public, max-age=31536000, immutable']);
  assert.deepEqual(cacheControl('/sw.js'), ['no-cache, no-store, must-revalidate']);
  assert.deepEqual(cacheControl('/admin.html'), ['no-store, max-age=0, must-revalidate']);
  assert.deepEqual(cacheControl('/api/example.js'), ['no-store, no-cache, must-revalidate']);
});
