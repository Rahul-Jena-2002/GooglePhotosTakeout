import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDecipheriv, createHmac, pbkdf2Sync } from 'node:crypto';
import nodeCrypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { DodoPayments } from 'dodopayments';
import { deriveKeyFromPassword, encrypt, decrypt, hexToBytes } from '../src/lib/crypto.ts';

test('encrypted values can be decrypted with a key derived from the original salt bytes', async () => {
  const backing = new Uint8Array(20);
  for (let i = 0; i < backing.length; i++) backing[i] = i;
  const salt = backing.subarray(2, 18);
  const { key, salt: savedSalt } = await deriveKeyFromPassword('example password', salt);
  assert.deepEqual(savedSalt, new Uint8Array(salt));

  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode('example password'), 'PBKDF2', false, ['deriveKey']);
  const originalKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: new Uint8Array(salt), iterations: 100000, hash: 'SHA-256' },
    material, { name: 'AES-GCM', length: 256 }, false, ['decrypt'],
  );
  const encrypted = await encrypt('example secret', key);
  assert.match(encrypted, /^enc:v1:/);
  assert.equal(await decrypt(encrypted, originalKey), 'example secret');
  assert.throws(() => hexToBytes('0g'), /Invalid hexadecimal/);
  assert.throws(() => hexToBytes('abc'), /Invalid hexadecimal/);
  await assert.rejects(decrypt('enc:v1:00', originalKey), /Invalid encrypted data/);
  await assert.rejects(decrypt('enc:v1:zz', originalKey), /Invalid hexadecimal/);
});

test('browser v1 encryption remains compatible with the server zero-salt format', async () => {
  const password = 'example master key';
  const { key } = await deriveKeyFromPassword(password, new Uint8Array(16));
  const encrypted = await encrypt('example secret', key);
  const combined = Buffer.from(encrypted.slice('enc:v1:'.length), 'hex');
  const serverKey = pbkdf2Sync(password, Buffer.alloc(16), 100000, 32, 'sha256');
  const decipher = createDecipheriv('aes-256-gcm', serverKey, combined.subarray(0, 12));
  decipher.setAuthTag(combined.subarray(-16));
  const plaintext = Buffer.concat([decipher.update(combined.subarray(12, -16)), decipher.final()]);
  assert.equal(plaintext.toString('utf8'), 'example secret');
});

function loadWebhook({ env = {}, fetchImpl = () => { throw new Error('Unexpected network request'); } } = {}) {
  const source = readFileSync(new URL('../src/pages/api/dodo-webhook.ts', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {};
  runInNewContext(`${code.replaceAll('import.meta.env', '({})')}\nexports.decryptForTest = decryptFirestoreValue; exports.setTokenForTest = fn => { getGoogleAuthToken = fn; };`, {
    exports, Buffer, console, Response,
    fetch: fetchImpl,
    require: name => name === 'node:crypto' ? nodeCrypto : name === 'cloudflare:workers' ? { env } : name === 'dodopayments' ? { DodoPayments } : {},
  });
  return exports;
}

test('Dodo webhook decrypts browser values, including multibyte text', async () => {
  const exports = loadWebhook();
  const password = 'test master key';
  const { key } = await deriveKeyFromPassword(password, new Uint8Array(16));
  const encrypted = await encrypt('secret 🔑', key);
  assert.equal(exports.decryptForTest(encrypted, password), 'secret 🔑');
  assert.equal(exports.decryptForTest(encrypted, 'wrong key'), '');
});

test('Dodo webhook uses SDK signature verification for valid, forged and expired events', async () => {
  const rawSecret = Buffer.from('test-only-webhook-secret');
  const secret = `whsec_${rawSecret.toString('base64')}`;
  let tokenRequests = 0;
  let configRequests = 0;
  const webhook = loadWebhook({
    env: { DODO_WEBHOOK_KEY: secret, FIREBASE_SERVICE_ACCOUNT: '{}' },
    fetchImpl: async () => { configRequests++; return Response.json({ fields: {} }); },
  });
  webhook.setTokenForTest(async () => { tokenRequests++; return 'test-only-token'; });
  const body = JSON.stringify({ type: 'test.event', data: {} });
  const sign = (id, date) => `v1,${createHmac('sha256', rawSecret).update(`${id}.${Math.floor(date.getTime() / 1000)}.${body}`).digest('base64')}`;
  const request = (date, signature, requestBody = body) => new Request('https://example.invalid/', {
    method: 'POST', body: requestBody,
    headers: { 'webhook-id': 'test-id', 'webhook-timestamp': String(Math.floor(date.getTime() / 1000)), 'webhook-signature': signature },
  });
  const now = new Date();
  const valid = sign('test-id', now);
  assert.equal((await webhook.POST({ request: request(now, sign('other-id', now)) })).status, 401);
  assert.equal((await webhook.POST({ request: request(now, valid, '{') })).status, 401);
  const old = new Date(Date.now() - 10 * 60 * 1000);
  assert.equal((await webhook.POST({ request: request(old, sign('test-id', old)) })).status, 401);
  assert.equal(tokenRequests, 0);
  assert.equal(configRequests, 0);
  assert.equal((await webhook.POST({ request: request(now, valid) })).status, 200);
  assert.equal(tokenRequests, 1);
  assert.equal(configRequests, 1);
});

test('Dodo webhook verifies with an encrypted fallback key when no environment key is set', async () => {
  const rawSecret = Buffer.from('test-only-webhook-secret');
  const secret = `whsec_${rawSecret.toString('base64')}`;
  const password = 'test master key';
  const { key } = await deriveKeyFromPassword(password, new Uint8Array(16));
  const encrypted = await encrypt(secret, key);
  const webhook = loadWebhook({
    env: { FIREBASE_SERVICE_ACCOUNT: '{}', ENCRYPTION_KEY: password },
    fetchImpl: async url => Response.json({ fields: String(url).endsWith('/settings/secure')
      ? { dodo_webhook_key: { stringValue: encrypted } } : {} }),
  });
  webhook.setTokenForTest(async () => 'test-only-token');
  const body = JSON.stringify({ type: 'test.event', data: {} });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = `v1,${createHmac('sha256', rawSecret).update(`test-id.${timestamp}.${body}`).digest('base64')}`;
  const request = new Request('https://example.invalid/', { method: 'POST', body,
    headers: { 'webhook-id': 'test-id', 'webhook-timestamp': timestamp, 'webhook-signature': signature } });
  assert.equal((await webhook.POST({ request })).status, 200);
  const forged = new Request('https://example.invalid/', { method: 'POST', body,
    headers: { 'webhook-id': 'different-id', 'webhook-timestamp': timestamp, 'webhook-signature': signature } });
  assert.equal((await webhook.POST({ request: forged })).status, 401);
});

test('Dodo webhook rejects missing signature headers before external calls', async () => {
  const webhook = loadWebhook();
  for (const headers of [{}, { 'webhook-id': 'test', 'webhook-signature': 'test' }]) {
    const response = await webhook.POST({ request: new Request('https://example.invalid/', {
      method: 'POST', headers, body: '{}',
    }) });
    assert.equal(response.status, 401);
  }
});
