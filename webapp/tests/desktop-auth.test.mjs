import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendDesktopAuth } from '../src/lib/desktopAuth.ts';

test('desktop handoff sends credentials only in the POST body and checks the response', async () => {
  const originalFetch = globalThis.fetch;
  const payload = { state: 'state', idToken: 'id-token', refreshToken: 'refresh-token' };
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, 'http://127.0.0.1:4321/callback');
      assert.equal(options.method, 'POST');
      assert.deepEqual(JSON.parse(options.body), payload);
      return { ok: true };
    };
    await sendDesktopAuth('4321', payload);
    globalThis.fetch = async () => ({ ok: false });
    await assert.rejects(sendDesktopAuth('4321', payload));
    globalThis.fetch = async () => { throw new Error('offline'); };
    await assert.rejects(sendDesktopAuth('4321', payload));
    await assert.rejects(sendDesktopAuth('4321/path', payload));
    await assert.rejects(sendDesktopAuth('4321', { idToken: 'id-token' }));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
