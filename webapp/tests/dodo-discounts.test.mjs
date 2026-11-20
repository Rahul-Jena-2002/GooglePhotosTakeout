import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchDodoDiscounts } from '../src/lib/dodo/client.ts';

test('checks subsequent pages for existing discounts', async () => {
  const originalFetch = globalThis.fetch;
  const pages = [];
  globalThis.fetch = async url => {
    const page = Number(new URL(url).searchParams.get('page_number'));
    pages.push(page);
    return Response.json({ items: page === 0 ? Array.from({ length: 100 }, (_, id) => ({ id })) : [{ id: 100 }] });
  };
  try {
    const discounts = await fetchDodoDiscounts('test.dodopayments.com', 'test-key');
    assert.deepEqual(pages, [0, 1]);
    assert.equal(discounts.length, 101);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects failed or malformed discount lookups', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(null, { status: 503 });
    await assert.rejects(fetchDodoDiscounts('test.dodopayments.com', 'test-key'));
    globalThis.fetch = async () => Response.json({ unexpected: [] });
    await assert.rejects(fetchDodoDiscounts('test.dodopayments.com', 'test-key'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
