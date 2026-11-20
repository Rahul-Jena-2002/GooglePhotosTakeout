import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAuthorizedRequest, parseJsonObject, readJsonObject } from '../src/lib/api/apiResponse.ts';

test('rejects missing or incorrect gateway keys', () => {
  const missing = new Request('https://example.invalid/');
  const wrong = new Request('https://example.invalid/', { headers: { 'x-api-key': 'wrong' } });
  assert.equal(isAuthorizedRequest(missing, {}, undefined), false);
  assert.equal(isAuthorizedRequest(missing, {}, 'expected'), false);
  assert.equal(isAuthorizedRequest(wrong, {}, 'expected'), false);
});

test('accepts a matching key in either supported header', () => {
  const apiKey = new Request('https://example.invalid/', { headers: { 'x-api-key': 'expected' } });
  const bearer = new Request('https://example.invalid/', { headers: { authorization: 'Bearer expected' } });
  assert.equal(isAuthorizedRequest(apiKey, {}, 'expected'), true);
  assert.equal(isAuthorizedRequest(bearer, {}, 'expected'), true);
});

test('gateway payloads must be JSON objects', () => {
  assert.deepEqual(parseJsonObject(''), {});
  assert.deepEqual(parseJsonObject('{"action":"fetch_products"}'), { action: 'fetch_products' });
  for (const raw of ['null', '[]', '42', '"text"', '{']) {
    assert.throws(() => parseJsonObject(raw));
  }
});

test('gateway body reader enforces the byte limit and handles split UTF-8', async () => {
  const bytes = new TextEncoder().encode('{"name":"é"}');
  const request = { body: new ReadableStream({
    start(controller) {
      controller.enqueue(bytes.slice(0, 10));
      controller.enqueue(bytes.slice(10));
      controller.close();
    }
  }) };
  assert.deepEqual(await readJsonObject(request, bytes.length), { name: 'é' });

  let cancelled = false;
  const oversized = { body: new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(5)); },
    cancel() { cancelled = true; }
  }) };
  await assert.rejects(readJsonObject(oversized, 4), RangeError);
  assert.equal(cancelled, true);
});
