import { test } from 'node:test';
import assert from 'node:assert/strict';
import { protectPreview } from '../scripts/preview-access.mjs';

test('denies access without the configured preview key and forwards authorized requests', async () => {
  const app = protectPreview({ fetch: request => new Response(new URL(request.url).pathname) });
  const request = new Request('https://example.test/_astro/site.js');
  assert.equal((await app.fetch(request, {})).status, 404);
  assert.equal((await app.fetch(request, { PREVIEW_ACCESS_KEY: 'test-key' })).status, 404);
  const wrongKey = new Request(request, { headers: { 'x-preview-key': 'wrong-key' } });
  assert.equal((await app.fetch(wrongKey, { PREVIEW_ACCESS_KEY: 'test-key' })).status, 404);
  const authorized = new Request(request, { headers: { 'x-preview-key': 'test-key' } });
  assert.equal(await (await app.fetch(authorized, { PREVIEW_ACCESS_KEY: 'test-key' })).text(), '/_astro/site.js');
});

test('redirects authorized legacy URLs while preserving the query', async () => {
  const app = protectPreview({ fetch: () => new Response('unexpected') }, new Map([['/legal/privacy', ['/privacy', 301]]]));
  const request = new Request('https://example.test/legal/privacy?from=test', { headers: { 'x-preview-key': 'test-key' } });
  const response = await app.fetch(request, { PREVIEW_ACCESS_KEY: 'test-key' });
  assert.equal(response.status, 301);
  assert.equal(response.headers.get('location'), 'https://example.test/privacy?from=test');
});
