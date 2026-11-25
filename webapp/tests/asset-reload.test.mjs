import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const layout = readFileSync(new URL('../src/layouts/Layout.astro', import.meta.url), 'utf8');
const script = layout.match(/<!-- Global Asset Error Handler[^]*?<script is:inline>([^]*?)<\/script>/)?.[1];
assert.ok(script, 'asset error handler must exist');

test('asset failures reload at most once per page per tab', () => {
  const values = new Map();
  let reloads = 0;
  const listeners = {};
  const context = {
    window: { location: { hostname: 'example.test', pathname: '/guides', reload: () => reloads++ },
      addEventListener: (type, listener) => { listeners[type] = listener; } },
    sessionStorage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) },
    console: { warn() {} }
  };
  const fail = () => listeners.error({ target: { tagName: 'SCRIPT', src: '/_astro/missing.js' } });
  runInNewContext(script, { ...context });
  fail();
  runInNewContext(script, { ...context });
  fail();
  assert.equal(reloads, 1);
  context.window.location.pathname = '/support';
  fail();
  assert.equal(reloads, 2);
});

test('asset failures do not reload if session storage is unavailable', () => {
  let handler;
  let reloads = 0;
  runInNewContext(script, {
    window: { location: { hostname: 'example.test', pathname: '/', reload: () => reloads++ },
      addEventListener: (type, listener) => { if (type === 'error') handler = listener; } },
    sessionStorage: { getItem() { throw new Error('blocked'); } },
    console: { warn() {} }
  });
  handler({ target: { tagName: 'LINK', href: '/_astro/missing.css' } });
  assert.equal(reloads, 0);
});
