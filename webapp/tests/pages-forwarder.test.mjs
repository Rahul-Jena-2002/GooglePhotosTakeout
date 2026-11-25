import { test } from 'node:test';
import assert from 'node:assert/strict';
import forwarder from '../pages-forwarder/_worker.js';

test('forwards the original request and response through the service binding', async () => {
  const request = new Request('https://takeoutfix.pages.dev/api/example?q=1', { method: 'POST', body: 'example' });
  const expected = new Response('result', { status: 201, headers: { 'x-test': 'yes' } });
  let received;
  const response = await forwarder.fetch(request, { WEBSITE: { fetch: async value => { received = value; return expected; } } });
  assert.equal(received, request);
  assert.equal(await received.text(), 'example');
  assert.equal(response, expected);
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('x-test'), 'yes');
});
