import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authorizeAffiliateAdmin } from '../src/lib/api/affiliateAdmin.ts';

const request = token => new Request('https://example.test/api/extract-metadata', {
  headers: token ? { Authorization: `Bearer ${token}` } : {}
});

test('emulator mode uses only the local identity and Firestore endpoints', async () => {
  const originalFetch = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async url => {
    urls.push(String(url));
    return urls.length === 1
      ? Response.json({ users: [{ localId: 'uid', email: 'admin@example.invalid' }] })
      : Response.json({ fields: { role: { stringValue: 'ADMIN' } } });
  };
  try {
    assert.equal(await authorizeAffiliateAdmin(request('token'), 'test-key', true), 200);
    assert.ok(urls[0].startsWith('http://127.0.0.1:9099/identitytoolkit.googleapis.com/'));
    assert.ok(urls[1].startsWith('http://127.0.0.1:8080/'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects missing credentials and fails closed without configuration', async () => {
  assert.equal(await authorizeAffiliateAdmin(request(), 'key'), 401);
  assert.equal(await authorizeAffiliateAdmin(request('token'), ''), 503);
});

test('requires a verified Firebase identity and an authorized role', async () => {
  const originalFetch = globalThis.fetch;
  try {
    let account = { localId: 'uid', email: 'other@example.invalid', emailVerified: true };
    let role = 'ADMIN';
    globalThis.fetch = async url => String(url).includes('identitytoolkit.googleapis.com')
      ? Response.json({ users: [account] }) : Response.json({ fields: { role: { stringValue: role } } });
    assert.equal(await authorizeAffiliateAdmin(request('token'), 'key'), 200);
    role = 'SUPPORT';
    assert.equal(await authorizeAffiliateAdmin(request('token'), 'key'), 403);
    account = { localId: 'uid', email: 'rahuljena.dev@gmail.com', emailVerified: false };
    assert.equal(await authorizeAffiliateAdmin(request('token'), 'key'), 403);
    account.emailVerified = true;
    assert.equal(await authorizeAffiliateAdmin(request('token'), 'key'), 200);
    account.disabled = true;
    assert.equal(await authorizeAffiliateAdmin(request('token'), 'key'), 403);
    account.disabled = false;
    account.localId = '../invalid';
    assert.equal(await authorizeAffiliateAdmin(request('token'), 'key'), 401);
    globalThis.fetch = async () => new Response(null, { status: 401 });
    assert.equal(await authorizeAffiliateAdmin(request('bad-token'), 'key'), 401);
    globalThis.fetch = async () => { throw new Error('offline'); };
    assert.equal(await authorizeAffiliateAdmin(request('token'), 'key'), 503);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
