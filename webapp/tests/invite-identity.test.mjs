import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidInviteId, readInviteIdentity } from '../src/lib/api/inviteIdentity.ts';

const token = payload => `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;

test('accepts only a single safe invitation document ID', () => {
  assert.equal(isValidInviteId('aB123_-'), true);
  for (const value of ['', '../users/me', 'x/y', 'x?foo=bar', null]) assert.equal(isValidInviteId(value), false);
});

test('requires a verified email and a valid user ID in authenticated token claims', () => {
  assert.equal(readInviteIdentity(token({ sub: 'user', email: 'admin@example.test', email_verified: false })), null);
  assert.equal(readInviteIdentity(token({ sub: 'a/b', email: 'admin@example.test', email_verified: true })), null);
  assert.equal(readInviteIdentity('bad-token'), null);
  assert.deepEqual(readInviteIdentity(token({ sub: 'user', email: 'admin@example.test', email_verified: true, name: 'Zoë' })), {
    uid: 'user', email: 'admin@example.test', name: 'Zoë'
  });
});
