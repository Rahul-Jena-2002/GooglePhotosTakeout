import crypto from 'crypto';

const LOCAL_SERVER = 'http://localhost:3000';
const ASTRO_SERVER = 'http://localhost:4321';
const GATEWAY_API_KEY = 'local-gateway-secret-123';
const WEBHOOK_SECRET = 'dGVzdC1zZWNyZXQtMTIzNDU2Nzg5MA=='; // "test-secret-1234567890" in base64

async function runTests() {
  console.log("Starting Empirical Validation Tests...\n");
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${message}`);
      failed++;
    }
  }

  // 1. Direct POST to /sync-dodo-prices
  console.log("--- Test 1: Direct POST /sync-dodo-prices authentication ---");
  
  // Case A: Missing API Key
  try {
    const res = await fetch(`${LOCAL_SERVER}/sync-dodo-prices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ regionCode: 'in', prices: { pro: 799 }, currency: 'INR' })
    });
    const body = await res.json();
    assert(res.status === 401 && body.error === 'Unauthorized', "Direct POST with no key returns 401");
  } catch (err) {
    assert(false, `Direct POST no key error: ${err.message}`);
  }

  // Case B: Incorrect API Key
  try {
    const res = await fetch(`${LOCAL_SERVER}/sync-dodo-prices`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-api-key': 'incorrect-key'
      },
      body: JSON.stringify({ regionCode: 'in', prices: { pro: 799 }, currency: 'INR' })
    });
    const body = await res.json();
    assert(res.status === 401 && body.error === 'Unauthorized', "Direct POST with incorrect key returns 401");
  } catch (err) {
    assert(false, `Direct POST incorrect key error: ${err.message}`);
  }

  // Case C: Correct API Key
  try {
    const res = await fetch(`${LOCAL_SERVER}/sync-dodo-prices`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-api-key': GATEWAY_API_KEY
      },
      body: JSON.stringify({ regionCode: 'in', prices: { pro: 799 }, currency: 'INR' })
    });
    const body = await res.json();
    assert(res.status === 200 && body.success === true, "Direct POST with correct key returns 200 OK");
  } catch (err) {
    assert(false, `Direct POST correct key error: ${err.message}`);
  }

  // 2. Astro API Route proxy /api/sync-dodo-prices
  console.log("\n--- Test 2: Astro API Route proxy ---");
  try {
    const res = await fetch(`${ASTRO_SERVER}/api/sync-dodo-prices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ regionCode: 'in', prices: { pro: 799 }, currency: 'INR' })
    });
    const bodyText = await res.text();
    let body = {};
    try {
      body = JSON.parse(bodyText);
    } catch (_) {}
    assert(res.status === 200 && body.success === true, `Astro API route proxies and returns 200 OK (Status: ${res.status}, Body: ${bodyText})`);
  } catch (err) {
    assert(false, `Astro proxy error: ${err.message}`);
  }

  // 3. Webhook /dodo-webhook signature verification
  console.log("\n--- Test 3: Webhook signature verification ---");
  const webhookId = 'evt_test_123';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const webhookBody = JSON.stringify({
    type: "payment.succeeded",
    data: {
      payment_id: "TXN-TEST-123",
      total_amount: 799,
      currency: "INR",
      customer: { email: "test-challenger@example.com" },
      metadata: {
        userId: "test-challenger-uid-123",
        plan: "pro"
      }
    }
  });

  // Case A: Valid Signature
  try {
    const secretBuffer = Buffer.from(WEBHOOK_SECRET, "base64");
    const signedContent = `${webhookId}.${timestamp}.${webhookBody}`;
    const computedHash = crypto
      .createHmac("sha256", secretBuffer)
      .update(signedContent)
      .digest("base64");
    const signature = `v1,${computedHash}`;

    const res = await fetch(`${LOCAL_SERVER}/dodo-webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'webhook-id': webhookId,
        'webhook-timestamp': timestamp,
        'webhook-signature': signature
      },
      body: webhookBody
    });
    const body = await res.json();
    assert(res.status === 200 && body.received === true, "Webhook with valid signature returns 200");
  } catch (err) {
    assert(false, `Webhook valid signature error: ${err.message}`);
  }

  // Case B: Invalid Signature
  try {
    const res = await fetch(`${LOCAL_SERVER}/dodo-webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'webhook-id': webhookId,
        'webhook-timestamp': timestamp,
        'webhook-signature': 'v1,invalidhash'
      },
      body: webhookBody
    });
    assert(res.status === 401, "Webhook with invalid signature returns 401");
  } catch (err) {
    assert(false, `Webhook invalid signature error: ${err.message}`);
  }

  // 4. Bypass Paths
  console.log("\n--- Test 4: Bypass paths ---");
  const bypassPaths = [
    '/dodo-webhook',
    '/create-dodo-upgrade-discount',
    '/create-stripe-session'
  ];

  for (const path of bypassPaths) {
    try {
      const res = await fetch(`${LOCAL_SERVER}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const body = await res.json();
      // Ensure we don't get the gateway 401 error
      const isBypassed = !(res.status === 401 && body.message === 'Invalid or missing API key. Please check headers.');
      assert(isBypassed, `Path ${path} successfully bypasses API key check (Status: ${res.status}, Message: ${body.message || 'none'})`);
    } catch (err) {
      assert(false, `Path ${path} bypass error: ${err.message}`);
    }
  }

  // 5. Edge cases: trailing slash, query parameters, case sensitivity
  console.log("\n--- Test 5: Edge cases on bypass paths ---");
  
  // Case A: Trailing slash
  try {
    const res = await fetch(`${LOCAL_SERVER}/dodo-webhook/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const body = await res.json();
    const isBypassed = !(res.status === 401 && body.message === 'Invalid or missing API key. Please check headers.');
    assert(isBypassed, `Path /dodo-webhook/ (trailing slash) bypasses API key check`);
  } catch (err) {
    assert(false, `Trailing slash error: ${err.message}`);
  }

  // Case B: Query parameters
  try {
    const res = await fetch(`${LOCAL_SERVER}/dodo-webhook?test=1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const body = await res.json();
    const isBypassed = !(res.status === 401 && body.message === 'Invalid or missing API key. Please check headers.');
    assert(isBypassed, `Path /dodo-webhook?test=1 (query params) bypasses API key check`);
  } catch (err) {
    assert(false, `Query parameters error: ${err.message}`);
  }

  // Case C: Case sensitivity
  try {
    const res = await fetch(`${LOCAL_SERVER}/Dodo-Webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const body = await res.json();
    const isBypassed = !(res.status === 401 && body.message === 'Invalid or missing API key. Please check headers.');
    assert(isBypassed, `Path /Dodo-Webhook (case sensitivity) bypasses API key check`);
  } catch (err) {
    assert(false, `Case sensitivity error: ${err.message}`);
  }

  console.log(`\nValidation complete. Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
