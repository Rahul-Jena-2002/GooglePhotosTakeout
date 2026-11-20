import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchAffiliatePage, isAllowedAffiliateFetchUrl } from '../src/lib/api/affiliateUrl.ts';

test('accepts supported HTTPS retailer hosts', () => {
  for (const url of ['https://www.amazon.com/dp/B000000000', 'https://amzn.to/example', 'https://www.flipkart.com/item']) {
    assert.equal(isAllowedAffiliateFetchUrl(new URL(url)), true, url);
  }
});

test('rejects an unsafe redirect before making a request to it', async () => {
  const originalFetch = globalThis.fetch;
  const requested = [];
  globalThis.fetch = async url => {
    requested.push(url);
    return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } });
  };
  try {
    await assert.rejects(fetchAffiliatePage(new URL('https://amzn.to/example')), /redirects outside/);
    assert.deepEqual(requested, ['https://amzn.to/example']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('follows an allowed redirect using manual redirect mode', async () => {
  const originalFetch = globalThis.fetch;
  const requested = [];
  globalThis.fetch = async (url, options) => {
    requested.push({ url, redirect: options.redirect });
    return requested.length === 1
      ? new Response(null, { status: 302, headers: { location: 'https://www.amazon.com/dp/B000000000' } })
      : new Response('ok');
  };
  try {
    const result = await fetchAffiliatePage(new URL('https://amzn.to/example'));
    assert.equal(result.finalUrl, 'https://www.amazon.com/dp/B000000000');
    assert.deepEqual(requested.map(item => item.redirect), ['manual', 'manual']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('stops redirect loops after a bounded number of requests', async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    return new Response(null, { status: 302, headers: { location: 'https://amzn.to/example' } });
  };
  try {
    await assert.rejects(fetchAffiliatePage(new URL('https://amzn.to/example')), /safely follow/);
    assert.equal(requests, 5);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects an unsupported initial URL without making a request', async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => { called = true; return new Response(); };
  try {
    await assert.rejects(fetchAffiliatePage(new URL('https://example.test/')), /Unsupported retailer/);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects private addresses, lookalike hosts, credentials and nonstandard ports', () => {
  for (const url of ['http://www.amazon.com/', 'https://127.0.0.1/', 'https://amazon.com.example.org/', 'https://amazon.com@evil.test/', 'https://u:p@www.amazon.com/', 'https://www.amazon.com:8443/']) {
    assert.equal(isAllowedAffiliateFetchUrl(new URL(url)), false, url);
  }
});
