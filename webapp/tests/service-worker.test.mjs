import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('service worker does not cache private or third-party requests', async () => {
  const listeners = new Map();
  const deletedCaches = [];
  const self = {
    location: { hostname: 'takeoutfix.pages.dev', origin: 'https://takeoutfix.pages.dev' },
    clients: { claim: async () => {} },
    addEventListener(type, listener) { listeners.set(type, listener); },
  };
  const script = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
  runInNewContext(script, {
    self, URL, Response,
    caches: {
      open: async () => ({ match: async () => undefined, put: async () => {} }),
      keys: async () => ['takeoutfix-v6', 'takeoutfix-v7', 'another-app'],
      delete: async name => { deletedCaches.push(name); },
    },
    fetch: async () => new Response('', { status: 200 }),
  });

  for (const url of [
    'https://takeoutfix.pages.dev/api/private',
    'https://takeoutfix.pages.dev/api',
    'https://takeoutfix.pages.dev/dashboard',
    'https://takeoutfix.pages.dev/admin/users',
    'https://takeoutfix.pages.dev/profile',
    'https://takeoutfix.pages.dev/auth/callback',
    'https://takeoutfix.pages.dev/login',
    'https://takeoutfix.pages.dev/signup',
    'https://example.com/private.json',
  ]) {
    let intercepted = false;
    listeners.get('fetch')({
      request: { method: 'GET', url, headers: new Headers({ accept: 'text/html' }) },
      respondWith() { intercepted = true; },
    });
    assert.equal(intercepted, false, url);
  }

  let publicResponse;
  listeners.get('fetch')({
    request: {
      method: 'GET',
      url: 'https://takeoutfix.pages.dev/guides',
      headers: new Headers({ accept: 'text/html' }),
    },
    respondWith(response) { publicResponse = response; },
  });
  assert.ok(publicResponse, 'public pages should retain their offline fallback');
  assert.equal((await publicResponse).status, 200);

  let activation;
  listeners.get('activate')({ waitUntil(promise) { activation = promise; } });
  await activation;
  assert.deepEqual(deletedCaches, ['takeoutfix-v6']);
});

test('uncached public pages receive an offline explanation', async () => {
  const listeners = new Map();
  const self = {
    location: { hostname: 'takeoutfix.pages.dev', origin: 'https://takeoutfix.pages.dev' },
    addEventListener(type, listener) { listeners.set(type, listener); },
  };
  const script = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
  runInNewContext(script, {
    self, URL, Response,
    caches: { open: async () => ({ match: async () => undefined }) },
    fetch: async () => { throw new Error('offline'); },
  });
  let response;
  listeners.get('fetch')({
    request: { method: 'GET', url: 'https://takeoutfix.pages.dev/guides', headers: new Headers({ accept: 'text/html' }) },
    respondWith(value) { response = value; },
  });
  const result = await response;
  assert.equal(result.status, 503);
  assert.match(await result.text(), /You're offline/);
});

test('online responses still work when browser cache storage fails', async () => {
  const listeners = new Map();
  const self = {
    location: { hostname: 'takeoutfix.pages.dev', origin: 'https://takeoutfix.pages.dev' },
    addEventListener(type, listener) { listeners.set(type, listener); },
  };
  const script = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
  runInNewContext(script, {
    self, URL, Response,
    caches: { open: async () => { throw new Error('cache unavailable'); } },
    fetch: async () => new Response('online', { status: 200 }),
  });
  for (const path of ['/guides', '/assets/example.js']) {
    let response;
    listeners.get('fetch')({
      request: { method: 'GET', url: `https://takeoutfix.pages.dev${path}`, headers: new Headers({ accept: 'text/html' }) },
      respondWith(value) { response = value; },
    });
    const result = await response;
    assert.equal(result.status, 200);
    assert.equal(await result.text(), 'online');
  }
});

test('offline requests get a 503 when cache storage is unavailable', async () => {
  const listeners = new Map();
  const self = {
    location: { hostname: 'takeoutfix.pages.dev', origin: 'https://takeoutfix.pages.dev' },
    addEventListener(type, listener) { listeners.set(type, listener); },
  };
  const script = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
  runInNewContext(script, {
    self, URL, Response,
    caches: { open: async () => { throw new Error('cache unavailable'); } },
    fetch: async () => { throw new Error('offline'); },
  });
  for (const [path, accept] of [['/guides', 'text/html'], ['/assets/example.js', 'application/javascript']]) {
    let response;
    listeners.get('fetch')({
      request: { method: 'GET', url: `https://takeoutfix.pages.dev${path}`, headers: new Headers({ accept }) },
      respondWith(value) { response = value; },
    });
    assert.equal((await response).status, 503);
  }
});
