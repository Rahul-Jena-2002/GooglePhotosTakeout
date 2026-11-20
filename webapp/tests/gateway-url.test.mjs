import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveGatewayBase } from '../src/lib/api/gatewayUrl.ts';

test('development rejects missing and remote gateway URLs', () => {
  assert.throws(() => resolveGatewayBase(undefined, true));
  assert.throws(() => resolveGatewayBase('https://us-central1-takeout-fix.cloudfunctions.net/geminiToolGateway', true));
  assert.throws(() => resolveGatewayBase('http://localhost.evil.test/', true));
  assert.throws(() => resolveGatewayBase('http://localhost:3000/?redirect=remote', true));
});

test('development allows a local gateway and production retains its default', () => {
  assert.equal(resolveGatewayBase('http://127.0.0.1:3000/', true), 'http://127.0.0.1:3000');
  assert.match(resolveGatewayBase(undefined, false), /^https:\/\/us-central1-takeout-fix\.cloudfunctions\.net\//);
});
