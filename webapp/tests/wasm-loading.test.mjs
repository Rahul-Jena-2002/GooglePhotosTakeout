import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getWasmResponse } from '../src/services/restoration/DeepExifRestorer.ts';

test('concurrent WASM loads share one fetch and failures can be retried', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (calls === 1) return new Response(null, { status: 503, statusText: 'Unavailable' });
    return new Response(new Uint8Array([1, 2, 3]));
  };
  try {
    await assert.rejects(getWasmResponse());
    const [first, second] = await Promise.all([getWasmResponse(), getWasmResponse()]);
    assert.equal(calls, 2);
    assert.deepEqual(new Uint8Array(await first.arrayBuffer()), new Uint8Array([1, 2, 3]));
    assert.deepEqual(new Uint8Array(await second.arrayBuffer()), new Uint8Array([1, 2, 3]));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
