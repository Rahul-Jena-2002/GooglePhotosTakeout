import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

// Run only in isolation with local-server.js and DODO_WEBHOOK_KEY=dGVzdC1zZWNyZXQtMTIzNDU2Nzg5MA==.
test('webhook verification rejects stale, future and malformed timestamps', async () => {
  const secret = Buffer.from('dGVzdC1zZWNyZXQtMTIzNDU2Nzg5MA==', 'base64');
  const body = JSON.stringify({ type: 'test.ignored', data: {} });
  const id = 'msg-isolated-test';
  const now = Math.floor(Date.now() / 1000);
  for (const [timestamp, expected] of [[String(now), 200], [String(now - 600), 401], [String(now + 600), 401], ['invalid', 401]]) {
    const signature = createHmac('sha256', secret).update(`${id}.${timestamp}.${body}`).digest('base64');
    const response = await fetch('http://127.0.0.1:3000/dodo-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': `v1,${signature}` },
      body,
    });
    assert.equal(response.status, expected);
  }

  for (const metadata of [{ userId: 'user/test', plan: 'pro' }, { userId: 'user-test', plan: 'administrator' }]) {
    const payload = JSON.stringify({ type: 'payment.succeeded', data: { metadata } });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac('sha256', secret).update(`${id}.${timestamp}.${payload}`).digest('base64');
    const response = await fetch('http://127.0.0.1:3000/dodo-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': `v1,${signature}` },
      body: payload,
    });
    assert.equal(response.status, 400);
  }

  // A fresh emulator has no product mapping; never fulfill a plan in that case.
  const payload = JSON.stringify({ type: 'payment.succeeded', data: {
    metadata: { userId: 'user-test', plan: 'pro', region: 't2' },
    product_cart: [{ product_id: 'unconfigured-product', quantity: 1 }],
  } });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', secret).update(`${id}.${timestamp}.${payload}`).digest('base64');
  const response = await fetch('http://127.0.0.1:3000/dodo-webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': `v1,${signature}` },
    body: payload,
  });
  assert.equal(response.status, 503);
});
