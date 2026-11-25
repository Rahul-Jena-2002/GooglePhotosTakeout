import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('WebAssembly ExifTool writes and reads metadata without changing the original', async () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  globalThis.window = globalThis;
  globalThis.document = {};
  try {
    const { writeMetadata, parseMetadata } = await import('@uswriting/exiftool');
    const image = await readFile(new URL('../public/favicon-96x96.png', import.meta.url));
    const original = Buffer.from(image);
    const wasm = await readFile(new URL('../public/zeroperl.wasm', import.meta.url));
    const options = { fetch: async () => new Response(wasm), args: ['-m'] };
    const written = await writeMetadata({ name: 'test.png', data: image },
      { Description: 'TakeoutFix verification' }, options);
    assert.equal(written.success, true, written.error);
    assert.deepEqual(image, original);
    const parsed = await parseMetadata({ name: 'test.png', data: new Uint8Array(written.data) },
      { ...options, args: ['-j', '-m'] });
    assert.equal(parsed.success, true, parsed.error);
    assert.match(parsed.data, /TakeoutFix verification/);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});
