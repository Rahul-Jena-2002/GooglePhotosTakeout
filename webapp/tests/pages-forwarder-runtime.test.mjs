import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare } from 'miniflare';

test('Cloudflare service binding preserves URL and access header', async () => {
  const manifest = contents => ({ mainModule: 'index.js', modules: { 'index.js': { type: 'esm', contents } } });
  const forwarder = await readFile(new URL('../pages-forwarder/_worker.js', import.meta.url), 'utf8');
  const target = `export default { fetch(request) {
    if (request.headers.get('x-preview-key') !== 'test') return new Response('denied', { status: 404 });
    return new Response(request.url, { status: 201 });
  } }`;
  const runtime = new Miniflare({ workers: [
    { config: { name: 'pages', type: 'worker', compatibilityDate: '2026-04-15', manifest: manifest(forwarder), env: { WEBSITE: { type: 'worker', worker: 'target' } } } },
    { config: { name: 'target', type: 'worker', compatibilityDate: '2026-04-15', manifest: manifest(target) } },
  ] });
  try {
    const url = 'http://localhost:8787/path?q=1';
    assert.equal((await runtime.dispatchFetch(url)).status, 404);
    const response = await runtime.dispatchFetch(url, { headers: { 'x-preview-key': 'test' } });
    assert.equal(response.status, 201);
    assert.equal(await response.text(), url);
  } finally {
    await runtime.dispose();
  }
});
