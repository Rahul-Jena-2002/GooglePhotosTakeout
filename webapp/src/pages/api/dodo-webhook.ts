import type { APIRoute } from 'astro';

// Verification helper for Dodo Payments Webhooks using native Web Crypto API
async function verifyDodoSignature(
  rawBody: string,
  webhookId: string,
  webhookTimestamp: string,
  webhookSignature: string,
  webhookSecret: string
): Promise<boolean> {
  let secretStr = webhookSecret;
  if (secretStr.startsWith("whsec_")) {
    secretStr = secretStr.substring(6);
  }

  // Base64 decode the secret to binary
  const binarySecret = atob(secretStr);
  const secretBuffer = new Uint8Array(binarySecret.length);
  for (let i = 0; i < binarySecret.length; i++) {
    secretBuffer[i] = binarySecret.charCodeAt(i);
  }

  const key = await crypto.subtle.importKey(
    "raw",
    secretBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify", "sign"]
  );

  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(`${webhookId}.${webhookTimestamp}.${rawBody}`);
  
  const signatures = webhookSignature.split(" ");
  for (const sig of signatures) {
    const parts = sig.split(",");
    if (parts.length === 2 && parts[0] === "v1") {
      const signatureHashHex = parts[1];
      // Convert hex signature to Uint8Array
      const signatureBuffer = new Uint8Array(
        signatureHashHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
      );
      const isValid = await crypto.subtle.verify(
        "HMAC",
        key,
        signatureBuffer,
        dataBuffer
      );
      if (isValid) return true;
    }
  }
  return false;
}

// Decrypt AES-256-GCM encrypted values using Web Crypto API
async function decryptFirestoreValue(val: string, mek: string): Promise<string> {
  if (!val) return "";
  if (!val.startsWith("enc:v1:")) return val;

  try {
    const hex = val.slice(7);
    const combined = new Uint8Array(
      hex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
    );

    const iv = combined.slice(0, 12);
    const ciphertextAndTag = combined.slice(12);
    const ciphertext = ciphertextAndTag.slice(0, ciphertextAndTag.length - 16);
    const tag = ciphertextAndTag.slice(ciphertextAndTag.length - 16);

    // Concatenate ciphertext and tag for Web Crypto GCM decrypt
    const encryptedBuffer = new Uint8Array(ciphertext.length + tag.length);
    encryptedBuffer.set(ciphertext);
    encryptedBuffer.set(tag, ciphertext.length);

    const encoder = new TextEncoder();
    const baseKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode(mek),
      "PBKDF2",
      false,
      ["deriveKey", "deriveBits"]
    );

    const salt = new Uint8Array(16); // 16 bytes of zeros
    const aesKey = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt,
        iterations: 100000,
        hash: "SHA-256"
      },
      baseKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );

    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv,
        additionalData: new Uint8Array(0),
        tagLength: 128
      },
      aesKey,
      encryptedBuffer
    );

    return new TextDecoder().decode(decryptedBuffer);
  } catch (err: any) {
    console.error("Failed to decrypt Firestore value via Web Crypto:", err.message);
    return "";
  }
}

// Generate Google OAuth2 Token using Service Account Private Key in Cloudflare Workers
async function getGoogleAuthToken(serviceAccount: any): Promise<string> {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600;
  
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: "https://firestore.googleapis.com/google.firestore.v1.Firestore",
    iat,
    exp
  };

  const base64UrlEncode = (str: string) =>
    btoa(str).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const unsignedToken = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;

  // Clean PEM key
  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  const pemContents = serviceAccount.private_key
    .replace(pemHeader, "")
    .replace(pemFooter, "")
    .replace(/\s/g, "");
  
  const binaryKey = atob(pemContents);
  const keyBuffer = new Uint8Array(binaryKey.length);
  for (let i = 0; i < binaryKey.length; i++) {
    keyBuffer[i] = binaryKey.charCodeAt(i);
  }

  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    encoder.encode(unsignedToken)
  );

  const signedToken = `${unsignedToken}.${btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${signedToken}`
  });
  
  if (!res.ok) {
    throw new Error(`Google Auth exchange failed: ${await res.text()}`);
  }

  const data: any = await res.json();
  return data.access_token;
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const rawBody = await request.text();
    const payload = JSON.parse(rawBody);

    // Retrieve environment variables from Cloudflare context
    const runtimeEnv = (locals as any)?.runtime?.env || {};
    let dodoWebhookSecret = runtimeEnv.DODO_WEBHOOK_KEY || import.meta.env.DODO_WEBHOOK_KEY;
    const serviceAccountStr = runtimeEnv.FIREBASE_SERVICE_ACCOUNT || import.meta.env.FIREBASE_SERVICE_ACCOUNT;
    const encryptionKey = runtimeEnv.ENCRYPTION_KEY || import.meta.env.ENCRYPTION_KEY || "92elPvQ63jp_SXOmGbLyOgvfcGHVP-GfDbbiyLV4rpw";

    if (!serviceAccountStr) {
      console.error("Missing FIREBASE_SERVICE_ACCOUNT environment variable.");
      return new Response("Server configuration error", { status: 500 });
    }

    const serviceAccount = JSON.parse(serviceAccountStr);
    const projectId = serviceAccount.project_id || "takeout-fix";

    // Obtain Access Token for Firestore REST API
    const token = await getGoogleAuthToken(serviceAccount);
    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    };

    // 2. Fetch webhook secret dynamically from Firestore if not hardcoded in Cloudflare env
    if (!dodoWebhookSecret) {
      try {
        const secureUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/settings/secure`;
        const secureRes = await fetch(secureUrl, { method: "GET", headers });
        if (secureRes.ok) {
          const secureData: any = await secureRes.json();
          const encryptedKey = secureData.fields?.dodo_webhook_key?.stringValue;
          if (encryptedKey) {
            dodoWebhookSecret = await decryptFirestoreValue(encryptedKey, encryptionKey);
            console.log("Successfully fetched and decrypted Dodo Webhook Secret dynamically from Firestore.");
          }
        }
      } catch (err: any) {
        console.error("Failed to read secure settings dynamically from Firestore:", err.message);
      }
    }

    // Default fallback placeholder
    if (!dodoWebhookSecret) {
      dodoWebhookSecret = "dodo-webhook-secret-placeholder";
    }

    // 3. Signature Verification
    if (dodoWebhookSecret !== "dodo-webhook-secret-placeholder") {
      const webhookId = request.headers.get("webhook-id") || "";
      const webhookTimestamp = request.headers.get("webhook-timestamp") || "";
      const webhookSignature = request.headers.get("webhook-signature") || "";

      const isVerified = await verifyDodoSignature(rawBody, webhookId, webhookTimestamp, webhookSignature, dodoWebhookSecret);
      if (!isVerified) {
        console.warn("Invalid webhook signature received.");
        return new Response("Invalid signature", { status: 401 });
      }
    } else {
      console.log("Placeholder secret detected. Skipping verification (TEST/LOCAL MODE).");
    }

    const { type, data: eventData } = payload;
    if (!type || !eventData) {
      return new Response("Missing type or data", { status: 400 });
    }

    console.log(`Processing Dodo webhook event on Cloudflare: ${type}`);

    if (type === "payment.succeeded") {
      const userId = eventData.metadata?.userId || eventData.metadata?.userid;
      const plan = eventData.metadata?.plan || eventData.metadata?.plankey;
      const regionCode = eventData.metadata?.region || eventData.metadata?.metadata_region || "t3";

      if (!userId || !plan) {
        console.error("Missing userId or plan in metadata:", eventData.metadata);
        return new Response("Missing metadata", { status: 400 });
      }

      const timestamp = Date.now();
      const txId = eventData.payment_id || `TXN-DODO-${timestamp}`;
      const userEmail = eventData.customer?.email || "";
      const amount = eventData.total_amount || 0;
      const currency = eventData.currency || "USD";

      // 1. Create Transaction Document
      const txUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/transactions?documentId=${txId}`;
      const txBody = {
        fields: {
          txId: { stringValue: txId },
          uid: { stringValue: userId },
          email: { stringValue: userEmail },
          displayName: { stringValue: userEmail.split("@")[0] || "Dodo Customer" },
          plan: { stringValue: plan },
          amount: { integerValue: String(amount) },
          currency: { stringValue: currency },
          displayAmount: { stringValue: `${currency === "INR" ? "₹" : "$"}${amount}` },
          status: { stringValue: "succeeded" },
          timestamp: { integerValue: String(timestamp) },
          paymentMethod: { stringValue: "Dodo Payments" }
        }
      };
      const txRes = await fetch(txUrl, { method: "POST", headers, body: JSON.stringify(txBody) });
      if (!txRes.ok) console.warn("Failed to create transaction log:", await txRes.text());

      // 2. Update User plan, reset quotas
      const userUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${userId}?updateMask.fieldPaths=plan&updateMask.fieldPaths=usedBytes&updateMask.fieldPaths=usedFiles&updateMask.fieldPaths=updatedAt`;
      const userBody = {
        fields: {
          plan: { stringValue: plan },
          usedBytes: { integerValue: "0" },
          usedFiles: { integerValue: "0" },
          updatedAt: { integerValue: String(timestamp) }
        }
      };
      const userRes = await fetch(userUrl, { method: "PATCH", headers, body: JSON.stringify(userBody) });
      if (!userRes.ok) {
        console.error("Failed to update user plan:", await userRes.text());
        return new Response("Database update failed", { status: 500 });
      }

      // 3. Create Purchase Log Document
      const logUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/purchase_logs`;
      const logBody = {
        fields: {
          customerEmail: { stringValue: userEmail },
          userId: { stringValue: userId },
          plan: { stringValue: plan },
          regionCode: { stringValue: regionCode },
          amount: { integerValue: String(amount) },
          currency: { stringValue: currency },
          purchasedAt: { integerValue: String(timestamp) },
          dodoPaymentId: { stringValue: txId }
        }
      };
      const logRes = await fetch(logUrl, { method: "POST", headers, body: JSON.stringify(logBody) });
      if (!logRes.ok) console.warn("Failed to write purchase log:", await logRes.text());

      // 4. Create Admin Activity Log Document
      const activityUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/admin_activity`;
      const activityBody = {
        fields: {
          actorUid: { stringValue: userId },
          actorName: { stringValue: userEmail || "Dodo Customer" },
          actorRole: { stringValue: "USER" },
          action: { stringValue: "PURCHASE" },
          target: { stringValue: plan },
          description: { stringValue: `Purchased ${plan} via Dodo Payments for ${currency} ${amount}` },
          timestamp: { integerValue: String(timestamp) }
        }
      };
      const activityRes = await fetch(activityUrl, { method: "POST", headers, body: JSON.stringify(activityBody) });
      if (!activityRes.ok) console.warn("Failed to write admin activity log:", await activityRes.text());

      console.log(`Successfully completed payment webhook upgrade on Cloudflare for user ${userId} to plan ${plan}`);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (err: any) {
    console.error("Webhook processing error in Astro endpoint:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
