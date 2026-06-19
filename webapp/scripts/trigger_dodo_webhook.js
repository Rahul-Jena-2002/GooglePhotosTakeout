import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import crypto from 'crypto';

// Firebase config — read from environment variables.
// Required env vars:
//   PUBLIC_FIREBASE_API_KEY, PUBLIC_FIREBASE_AUTH_DOMAIN, PUBLIC_FIREBASE_PROJECT_ID
//   PUBLIC_FIREBASE_STORAGE_BUCKET, PUBLIC_FIREBASE_MESSAGING_SENDER_ID
//   PUBLIC_FIREBASE_APP_ID, PUBLIC_FIREBASE_MEASUREMENT_ID
// Copy these from webapp/.env or export them in your shell before running.
const firebaseConfig = {
  apiKey:            process.env.PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.PUBLIC_FIREBASE_APP_ID,
  measurementId:     process.env.PUBLIC_FIREBASE_MEASUREMENT_ID,
};

if (!firebaseConfig.projectId || !firebaseConfig.apiKey) {
  console.error("❌ Missing Firebase env vars. Export PUBLIC_FIREBASE_API_KEY and PUBLIC_FIREBASE_PROJECT_ID before running.");
  process.exit(1);
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const args = process.argv.slice(2);
const userId = args[0];
const plan = args[1] || 'pro';
const defaultUrl = `https://us-central1-${firebaseConfig.projectId}.cloudfunctions.net/geminiToolGateway/dodo-webhook`;
const targetUrl = args[2] || defaultUrl;

if (!userId) {
  console.log("\n❌ Error: Missing user ID argument.\n");
  console.log("Usage: node scripts/trigger_dodo_webhook.js <userId> [plan] [targetUrl]");
  console.log("Example: node scripts/trigger_dodo_webhook.js my-firebase-uid pro");
  console.log("Example local: node scripts/trigger_dodo_webhook.js my-firebase-uid super http://localhost:5001/gt-metadata-merger/us-central1/geminiToolGateway/dodo-webhook\n");
  process.exit(1);
}

async function run() {
  console.log(`\n======================================================`);
  console.log(`🚀 Simulating Dodo Payments webhook event...`);
  console.log(`👤 Target User UID: ${userId}`);
  console.log(`📦 Target Plan:     ${plan}`);
  console.log(`📡 Endpoint URL:    ${targetUrl}`);
  console.log(`======================================================\n`);

  // 1. Fetch webhook key from settings/secure in Firestore to sign the request
  let webhookSecret = "";
  try {
    console.log("Fetching webhook secret key from Firestore (/settings/secure)...");
    const secureSnap = await getDoc(doc(db, 'settings', 'secure'));
    if (secureSnap.exists()) {
      webhookSecret = secureSnap.data().dodo_webhook_key || "";
      console.log(`Found secret key: ${webhookSecret.substring(0, 10)}... (Base64)`);
    } else {
      console.warn("⚠️ Warning: No webhook secret found in /settings/secure. Triggering in unverified (TEST MODE) bypass.");
    }
  } catch (err) {
    console.warn("⚠️ Warning: Firestore read failed (you may not have admin database rules setup). Falling back to unverified test mode:", err.message);
  }

  // 2. Build mock succeeded payment event payload
  const timestamp = Math.floor(Date.now() / 1000);
  const paymentId = `TXN-MOCK-${Date.now()}`;
  
  const payload = {
    type: "payment.succeeded",
    data: {
      payment_id: paymentId,
      total_amount: plan === 'recovery_pass' ? 4.99 : plan === 'super' ? 49.00 : 29.00,
      currency: "USD",
      customer: {
        email: "mock-customer@takeoutfix.local"
      },
      metadata: {
        userId: userId,
        plan: plan
      }
    }
  };

  const rawBody = JSON.stringify(payload);
  const headers = {
    "Content-Type": "application/json",
  };

  // 3. Compute Standard Webhook cryptographic signature headers if key exists
  if (webhookSecret && webhookSecret !== "dodo-webhook-secret-placeholder") {
    console.log("Signing payload standard webhook signature...");
    const webhookId = `msg_${crypto.randomBytes(8).toString('hex')}`;
    const webhookTimestamp = String(timestamp);

    let cleanSecret = webhookSecret;
    if (cleanSecret.startsWith("whsec_")) {
      cleanSecret = cleanSecret.substring(6);
    }
    const secretBuffer = Buffer.from(cleanSecret, "base64");
    const signedContent = `${webhookId}.${webhookTimestamp}.${rawBody}`;
    
    const computedHash = crypto
      .createHmac("sha256", secretBuffer)
      .update(signedContent)
      .digest("base64");

    headers["webhook-id"] = webhookId;
    headers["webhook-timestamp"] = webhookTimestamp;
    headers["webhook-signature"] = `v1,${computedHash}`;
  } else {
    console.log("Sending unsigned request (Gateway must be in developer bypass / settings.dodo_webhook_key set to placeholder).");
  }

  // 4. Send request
  console.log("Sending POST request to webhook endpoint...");
  try {
    const res = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: rawBody
    });

    const text = await res.text();
    console.log(`\nResponse Status: ${res.status} ${res.statusText}`);
    console.log(`Response Body: ${text}`);

    if (res.ok) {
      console.log("\n🟢 Success! Webhook processed. Check your user dashboard or Firestore database to confirm upgrade.");
    } else {
      console.log("\n🔴 Webhook returned error. Check Cloud Functions logs for verification logs.");
    }
  } catch (error) {
    console.error("\n❌ Request failed to connect:", error.message);
  }
}

run().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
