import { test } from 'node:test';
import assert from 'node:assert/strict';
import { secureApiResponse } from '../src/lib/apiSecurityHeaders.ts';

test('API security headers preserve status, body, and CORS', async () => {
  const original = new Response('{"ok":true}', {
    status: 201,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'https://example.test' },
  });
  const response = secureApiResponse(original);
  assert.equal(response.status, 201);
  assert.equal(await response.text(), '{"ok":true}');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://example.test');
  assert.equal(response.headers.get('Cache-Control'), 'no-store, no-cache, must-revalidate');
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
  assert.equal(response.headers.get('Referrer-Policy'), 'strict-origin-when-cross-origin');
  assert.equal(response.headers.get('Permissions-Policy'), 'camera=(), microphone=(), geolocation=()');
  assert.match(response.headers.get('Strict-Transport-Security'), /max-age=31536000/);
  assert.equal(response.headers.get('Cross-Origin-Opener-Policy'), 'same-origin-allow-popups');
  assert.match(response.headers.get('Content-Security-Policy'), /default-src 'none'/);
});

test('API security headers preserve empty preflight responses', () => {
  const response = secureApiResponse(new Response(null, { status: 204 }));
  assert.equal(response.status, 204);
  assert.equal(response.body, null);
});
