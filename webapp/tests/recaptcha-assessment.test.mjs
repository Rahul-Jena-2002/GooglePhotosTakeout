import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../src/pages/api/verify-recaptcha.ts';
import { checkAssessmentRateLimit } from '../src/lib/api/assessmentRateLimit.ts';

test('assessment rate limit rejects excess requests and unavailable protection', async () => {
  const request = new Request('https://example.test', { headers: { 'CF-Connecting-IP': '192.0.2.1' } });
  assert.equal(await checkAssessmentRateLimit(request, { limit: async ({ key }) => ({ success: key === '192.0.2.1' }) }), 200);
  assert.equal(await checkAssessmentRateLimit(request, { limit: async () => ({ success: false }) }), 429);
  assert.equal(await checkAssessmentRateLimit(request), 503);
  assert.equal(await checkAssessmentRateLimit(new Request('https://example.test'), { limit: async () => ({ success: true }) }), 503);
  assert.equal(await checkAssessmentRateLimit(request, { limit: async () => { throw new Error('offline'); } }), 503);
});

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

test('assessment fails closed when no key is configured', async () => {
  const originalFirebaseKey = process.env.PUBLIC_FIREBASE_API_KEY;
  const originalRecaptchaKey = process.env.RECAPTCHA_API_KEY;
  delete process.env.PUBLIC_FIREBASE_API_KEY;
  delete process.env.RECAPTCHA_API_KEY;
  try {
    const response = await POST({ request: new Request('https://example.test/api/verify-recaptcha', {
      method: 'POST', body: JSON.stringify({ token: 'test-token', action: 'LOGIN' })
    }) });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).success, false);
  } finally {
    if (originalFirebaseKey !== undefined) process.env.PUBLIC_FIREBASE_API_KEY = originalFirebaseKey;
    if (originalRecaptchaKey !== undefined) process.env.RECAPTCHA_API_KEY = originalRecaptchaKey;
  }
});

test('dedicated reCAPTCHA key takes precedence over the Firebase web key', async () => {
  const originalFetch = globalThis.fetch;
  const originalFirebaseKey = process.env.PUBLIC_FIREBASE_API_KEY;
  const originalRecaptchaKey = process.env.RECAPTCHA_API_KEY;
  process.env.PUBLIC_FIREBASE_API_KEY = 'firebase-key';
  process.env.RECAPTCHA_API_KEY = 'recaptcha-key';
  try {
    let requestedKey;
    globalThis.fetch = async url => {
      requestedKey = new URL(url).searchParams.get('key');
      return Response.json({ tokenProperties: { valid: true, action: 'LOGIN' } });
    };
    const response = await POST({ request: new Request('https://example.test/api/verify-recaptcha', {
      method: 'POST', body: JSON.stringify({ token: 'test-token', action: 'LOGIN' })
    }) });
    assert.equal(response.status, 200);
    assert.equal(requestedKey, 'recaptcha-key');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalFirebaseKey === undefined) delete process.env.PUBLIC_FIREBASE_API_KEY;
    else process.env.PUBLIC_FIREBASE_API_KEY = originalFirebaseKey;
    if (originalRecaptchaKey === undefined) delete process.env.RECAPTCHA_API_KEY;
    else process.env.RECAPTCHA_API_KEY = originalRecaptchaKey;
  }
});
