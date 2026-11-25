export const prerender = false;
import type { APIRoute } from 'astro';
import nodeCrypto from 'node:crypto';
import { env } from 'cloudflare:workers';
import { DodoPayments } from 'dodopayments';

// Decrypt sensitive keys stored in Firestore using AES-256-GCM
function decryptFirestoreValue(val: string, mek: string): string {
  if (!val) return "";
  if (!val.startsWith("enc:v1:")) return val;

  try {
    const salt = Buffer.alloc(16); // 16 bytes of zeros
    const key = nodeCrypto.pbkdf2Sync(mek, salt, 100000, 32, "sha256");

    const hex = val.slice(7);
    const combined = Buffer.from(hex, "hex");

    const iv = combined.subarray(0, 12);
    const ciphertextAndTag = combined.subarray(12);
    const tag = ciphertextAndTag.subarray(ciphertextAndTag.length - 16);
    const ciphertext = ciphertextAndTag.subarray(0, ciphertextAndTag.length - 16);

    const decipher = nodeCrypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(ciphertext, undefined, "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err: any) {
    console.error("❌ Failed to decrypt Firestore value:", err.message);
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
    aud: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/datastore",
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
    .replace(/\\n/g, "\n")
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

function verifyWithDodoSdk(rawBody: string, headers: Record<string, string>, secret: string): boolean {
  try {
    const client = new DodoPayments({ bearerToken: "dummy_key", webhookKey: secret });
    client.webhooks.unwrap(rawBody, { headers });
    return true;
  } catch (error) {
    console.error('Webhook signature verification failed:', error);
    return false;
  }
}

export const POST: APIRoute = async ({ request }) => {
  const webhookHeaders = {
    'webhook-id': request.headers.get('webhook-id') || '',
    'webhook-signature': request.headers.get('webhook-signature') || '',
    'webhook-timestamp': request.headers.get('webhook-timestamp') || '',
  };
  if (Object.values(webhookHeaders).some(value => !value.trim())) {
    return new Response("Missing webhook signature headers", { status: 401 });
  }
  try {
    const rawBody = await request.text();

    // Retrieve environment variables from Cloudflare context
    let dodoWebhookSecret = (env as any).DODO_WEBHOOK_KEY || import.meta.env.DODO_WEBHOOK_KEY;
    const serviceAccountStr = (env as any).FIREBASE_SERVICE_ACCOUNT || import.meta.env.FIREBASE_SERVICE_ACCOUNT;
    const encryptionKey = (env as any).ENCRYPTION_KEY || import.meta.env.ENCRYPTION_KEY || "";
    let signatureVerified = false;
    if (dodoWebhookSecret && dodoWebhookSecret !== "dodo-webhook-secret-placeholder") {
      if (!verifyWithDodoSdk(rawBody, webhookHeaders, dodoWebhookSecret)) {
        return new Response("Invalid signature", { status: 401 });
      }
      signatureVerified = true;
    }

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

    // Fetch global config to determine dodo host and test mode
    let dodoHost = "live.dodopayments.com";
    let isTestMode = false;
    let globalFields: any = null;
    try {
      const globalUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/settings/global`;
      const globalRes = await fetch(globalUrl, { headers });
      if (globalRes.ok) {
        const globalData: any = await globalRes.json();
        globalFields = globalData.fields;
        dodoHost = globalData.fields?.dodo_host?.stringValue || "live.dodopayments.com";
        isTestMode = globalData.fields?.dodo_test_mode?.booleanValue === true;
      }
    } catch (err: any) {
      console.warn("Failed to fetch settings/global in webhook:", err.message);
    }
    const envMode = isTestMode ? "test" : "live";

    // Backup: If webhook secret is not set in Cloudflare env, fetch and decrypt it from Firestore settings/secure
    if (!dodoWebhookSecret && encryptionKey) {
      try {
        console.log("DODO_WEBHOOK_KEY not set in env. Attempting backup Firestore secure fetch...");
        const secureUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/settings/secure`;
        const secureRes = await fetch(secureUrl, { headers });
        if (secureRes.ok) {
          const secureData: any = await secureRes.json();
          const encryptedSecret = secureData.fields?.dodo_webhook_key?.stringValue || "";
          if (encryptedSecret) {
            dodoWebhookSecret = decryptFirestoreValue(encryptedSecret, encryptionKey);
            console.log("Successfully retrieved and decrypted Dodo Webhook Secret from Firestore!");
          }
        }
      } catch (err: any) {
        console.error("Backup webhook secret retrieval failed:", err.message);
      }
    }

    // 1. Mandatory Signature Verification (Fail-Closed)
    if (!dodoWebhookSecret || dodoWebhookSecret === "dodo-webhook-secret-placeholder") {
      console.error("❌ Dodo Webhook Secret is unconfigured. Rejecting unverified webhook event.");
      return new Response("Webhook secret unconfigured", { status: 500 });
    }

    if (!signatureVerified && !verifyWithDodoSdk(rawBody, webhookHeaders, dodoWebhookSecret)) {
      return new Response("Invalid signature", { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    const { type, data } = payload;
    if (!type || !data) {
      return new Response("Missing type or data", { status: 400 });
    }

    console.log(`Processing Dodo webhook event on Cloudflare: ${type}`);

    if (type === "payment.succeeded" || type === "payment.failed" || type === "payment.cancelled" || type === "payment.processing") {
      const userId = data.metadata?.userId || data.metadata?.userid || data.metadata?.metadata_userId;
      const plan = data.metadata?.plan || data.metadata?.plankey || data.metadata?.metadata_plan;
      const regionCode = data.metadata?.region || data.metadata?.metadata_region || "t3";

      if (typeof userId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(userId) ||
          !["recovery_pass", "pro", "super"].includes(plan)) {
        return new Response("Invalid payment metadata", { status: 400 });
      }

      if (type === "payment.succeeded") {
        const productFields = isTestMode
          ? globalFields?.dodo_products_test?.mapValue?.fields
          : (globalFields?.dodo_products_live?.mapValue?.fields || globalFields?.dodo_products?.mapValue?.fields);
        const expectedProduct = productFields?.[regionCode]?.mapValue?.fields?.[plan]?.stringValue;
        if (typeof expectedProduct !== "string" || !expectedProduct) {
          return new Response("Payment product is not configured", { status: 503 });
        }
        if (!Array.isArray(data.product_cart) || data.product_cart.length !== 1 ||
            data.product_cart[0]?.product_id !== expectedProduct || data.product_cart[0]?.quantity !== 1) {
          return new Response("Payment product does not match the requested plan", { status: 400 });
        }
      }

      const timestamp = Date.now();
      const txId = data.payment_id || `TXN-DODO-${timestamp}`;
      const userEmail = data.customer?.email || "";
      const amount = data.total_amount || 0;
      const currency = data.currency || "USD";

      // Map event type to transaction status
      let txStatus = "failed";
      if (type === "payment.succeeded") txStatus = "succeeded";
      else if (type === "payment.cancelled") txStatus = "cancelled";
      else if (type === "payment.processing") txStatus = "processing";

      // 1. Create Transaction Document
      const txUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/transactions?documentId=${encodeURIComponent(txId)}`;
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
          status: { stringValue: txStatus },
          timestamp: { integerValue: String(timestamp) },
          paymentMethod: { stringValue: "Dodo Payments" },
          envMode: { stringValue: envMode }
        }
      };
      const txRes = await fetch(txUrl, { method: "POST", headers, body: JSON.stringify(txBody) });
      if (!txRes.ok) console.warn("Failed to create transaction log:", await txRes.text());

      // ONLY fulfill plan upgrades if payment succeeded
      if (type === "payment.succeeded") {
        // 2. Update User plan, reset quotas
        const userUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${encodeURIComponent(userId)}?updateMask.fieldPaths=plan&updateMask.fieldPaths=usedBytes&updateMask.fieldPaths=usedFiles&updateMask.fieldPaths=updatedAt`;
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

        // 3. Find active campaign → increment currentPurchaseCount → auto-expire if cap hit
        let activeCampaignId: string | null = null;
        try {
          const runQueryUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
          const campaignQueryBody = {
            structuredQuery: {
              from: [{ collectionId: "campaigns" }],
              where: {
                compositeFilter: {
                  op: "AND",
                  filters: [
                    {
                      fieldFilter: {
                        field: { fieldPath: "isEnabled" },
                        op: "EQUAL",
                        value: { booleanValue: true }
                      }
                    },
                    {
                      fieldFilter: {
                        field: { fieldPath: "status" },
                        op: "EQUAL",
                        value: { stringValue: "ACTIVE" }
                      }
                    }
                  ]
                }
              },
              limit: 1
            }
          };

          const campRes = await fetch(runQueryUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(campaignQueryBody)
          });

          if (campRes.ok) {
            const campResults = await campRes.json() as any[];
            if (Array.isArray(campResults) && campResults.length > 0 && campResults[0].document) {
              const doc = campResults[0].document;
              const parts = doc.name.split("/");
              activeCampaignId = parts[parts.length - 1];
              const activeCampaignData = doc.fields;
              
              const currentCount = parseInt(activeCampaignData.currentPurchaseCount?.integerValue || "0") + 1;
              const maxLimit = activeCampaignData.maxPurchaseLimit?.integerValue ? parseInt(activeCampaignData.maxPurchaseLimit.integerValue) : null;
              
              const updateFields: any = {
                currentPurchaseCount: { integerValue: String(currentCount) }
              };
              let updateMask = "updateMask.fieldPaths=currentPurchaseCount";
              
              if (maxLimit !== null && currentCount >= maxLimit) {
                updateFields.status = { stringValue: "EXPIRED" };
                updateFields.isEnabled = { booleanValue: false };
                updateMask += "&updateMask.fieldPaths=status&updateMask.fieldPaths=isEnabled";
                console.log(`Campaign ${activeCampaignId} auto-expired at limit ${maxLimit}`);
              }
              
              const updateUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/campaigns/${activeCampaignId}?${updateMask}`;
              const updateRes = await fetch(updateUrl, {
                method: "PATCH",
                headers,
                body: JSON.stringify({ fields: updateFields })
              });
              if (!updateRes.ok) console.warn("Failed to update campaign purchase count:", await updateRes.text());
              else console.log(`Campaign ${activeCampaignId} purchase count incremented to ${currentCount}.`);
            }
          }
        } catch (campErr: any) {
          console.error("Campaign update error in webhook:", campErr.message);
        }

        // 4. Find matching coupon → increment usedCount
        const discountCode = String(data.discount_code || data.coupon_code || "").toUpperCase();
        let matchedCouponId: string | null = null;
        
        if (discountCode) {
          try {
            const runQueryUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
            const couponQueryBody = {
              structuredQuery: {
                from: [{ collectionId: "coupons" }],
                where: {
                  fieldFilter: {
                    field: { fieldPath: "couponCode" },
                    op: "EQUAL",
                    value: { stringValue: discountCode }
                  }
                },
                limit: 1
              }
            };
            
            const coupRes = await fetch(runQueryUrl, {
              method: "POST",
              headers,
              body: JSON.stringify(couponQueryBody)
            });
            
            if (coupRes.ok) {
              const coupResults = await coupRes.json() as any[];
              if (Array.isArray(coupResults) && coupResults.length > 0 && coupResults[0].document) {
                const doc = coupResults[0].document;
                const parts = doc.name.split("/");
                matchedCouponId = parts[parts.length - 1];
                const couponData = doc.fields;
                
                const currentUsed = parseInt(couponData.usedCount?.integerValue || "0") + 1;
                
                const updateUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/coupons/${matchedCouponId}?updateMask.fieldPaths=usedCount&updateMask.fieldPaths=updatedAt`;
                const updateBody = {
                  fields: {
                    usedCount: { integerValue: String(currentUsed) },
                    updatedAt: { integerValue: String(timestamp) }
                  }
                };
                
                const updateRes = await fetch(updateUrl, {
                  method: "PATCH",
                  headers,
                  body: JSON.stringify(updateBody)
                });
                if (!updateRes.ok) console.warn("Failed to update coupon usage:", await updateRes.text());
                else console.log(`Coupon ${discountCode} usedCount incremented to ${currentUsed}.`);
              }
            }
          } catch (coupErr: any) {
            console.error("Coupon update error in webhook:", coupErr.message);
          }
        }

        // 5. Create Purchase Log and Admin Activity Log Documents (in parallel)
        const logUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/purchase_logs`;
        const logBody = {
          fields: {
            campaignId: activeCampaignId ? { stringValue: activeCampaignId } : { nullValue: null },
            couponId: matchedCouponId ? { stringValue: matchedCouponId } : { nullValue: null },
            couponCode: discountCode ? { stringValue: discountCode } : { nullValue: null },
            productId: data.product_id ? { stringValue: data.product_id } : { nullValue: null },
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

        const activityUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/admin_activity`;
        const activityBody = {
          fields: {
            actorUid: { stringValue: userId },
            actorName: { stringValue: userEmail || "Dodo Customer" },
            actorRole: { stringValue: "USER" },
            action: { stringValue: "PURCHASE" },
            target: { stringValue: plan },
            description: { stringValue: `Purchased ${plan} via Dodo Payments for ${currency} ${amount}${discountCode ? ` using coupon ${discountCode}` : ""}` },
            timestamp: { integerValue: String(timestamp) }
          }
        };

        const [logRes, activityRes] = await Promise.all([
          fetch(logUrl, { method: "POST", headers, body: JSON.stringify(logBody) }),
          fetch(activityUrl, { method: "POST", headers, body: JSON.stringify(activityBody) })
        ]);

        if (!logRes.ok) console.warn("Failed to write purchase log:", await logRes.text());
        if (!activityRes.ok) console.warn("Failed to write admin activity log:", await activityRes.text());

        console.log(`Successfully completed payment webhook upgrade on Cloudflare for user ${userId} to plan ${plan}`);
      } else {
        console.log(`Logged non-success payment transaction status: ${txStatus} for user ${userId}`);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (err: any) {
    console.error("Webhook processing error in Astro endpoint:", err);
    return new Response(JSON.stringify({ error: 'Webhook processing failed.' }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
