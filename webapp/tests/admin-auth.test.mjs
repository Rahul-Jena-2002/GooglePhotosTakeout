import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isEmulatorDevelopment, isVerifiedSuperAdmin } from '../src/lib/adminAuth.ts';

test('root-admin UI access requires the configured email and a verified identity', () => {
  assert.equal(isVerifiedSuperAdmin({ email: 'rahuljena.dev@gmail.com', emailVerified: true }), true);
  assert.equal(isVerifiedSuperAdmin({ email: 'rahuljena.dev@gmail.com', emailVerified: false }), false);
  assert.equal(isVerifiedSuperAdmin({ email: 'other@example.com', emailVerified: true }), false);
  assert.equal(isVerifiedSuperAdmin(null), false);
});

test('development shortcuts do not apply to live Firebase or production', () => {
  assert.equal(isEmulatorDevelopment({ DEV: true }), true);
  assert.equal(isEmulatorDevelopment({ DEV: true, PUBLIC_FIREBASE_USE_LIVE: 'true' }), false);
  assert.equal(isEmulatorDevelopment({ DEV: false }), false);
});
