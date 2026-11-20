import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../src/pages/api/verify-recaptcha.ts';

test('assessment checks the action and does not invent a missing score', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.PUBLIC_FIREBASE_API_KEY;
  process.env.PUBLIC_FIREBASE_API_KEY = 'test-key';
  try {
    let result = { tokenProperties: { valid: true, action: 'LOGIN' }, riskAnalysis: {} };
    globalThis.fetch = async () => Response.json(result);
    const assess = async () => (await POST({ request: new Request('https://example.test/api/verify-recaptcha', {
      method: 'POST', body: JSON.stringify({ token: 'test-token', action: 'LOGIN' })
    }) })).json();

    assert.deepEqual(await assess(), { success: true, reasons: [], action: 'LOGIN' });
    result = { tokenProperties: { valid: true, action: 'SIGNUP' }, riskAnalysis: { score: 0.8 } };
    assert.equal((await assess()).success, false);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.PUBLIC_FIREBASE_API_KEY;
    else process.env.PUBLIC_FIREBASE_API_KEY = originalKey;
  }
});
