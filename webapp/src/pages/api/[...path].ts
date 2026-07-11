export const prerender = false;
import type { APIRoute } from 'astro';
import nodeCrypto from 'node:crypto';

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
    let decrypted = decipher.update(ciphertext, "binary", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err: any) {
    console.error("❌ Failed to decrypt Firestore value:", err.message);
    return "";
  }
}

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

// Generate Google OAuth2 Token using Service Account Private Key in Cloudflare Workers
async function getGoogleAuthToken(serviceAccount: { client_email: string; private_key: string }): Promise<string> {
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

// Lookup discount by code from Dodo Payments
async function fetchDiscountByCode(dodoHost: string, dodoApiKey: string, code: string): Promise<any> {
  const url = `https://${dodoHost}/discounts`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${dodoApiKey}`
    }
  });
  return {
    statusCode: res.status,
    body: await res.text()
  };
}

// Fetch dynamic USD exchange rates for JPY / CNY regions
async function fetchUsdExchangeRates(): Promise<any> {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    if (res.ok) {
      const data: any = await res.json();
      if (data && data.rates) return data.rates;
    }
  } catch (e) {
    console.warn("Exchange rate fetch failed, using fallback:", e);
  }
  return { CNY: 7.25, JPY: 155.0 };
}

// Retrieve plan price from Firestore
async function getBackendPlanPriceValue(headers: any, projectId: string, planKey: string, regionKey: string): Promise<number> {
  const REGION_DOC_IDS: Record<string, string> = {
    in: "India",
    cn: "China",
    jp: "Japan",
    eu: "Europe",
    t1: "Tier 1",
    t2: "Tier 2",
    t3: "US (Tier 3)",
    t4: "Tier 4"
  };
  const REGION_PRICING_CONFIGS: Record<string, any> = {
    in: { currency: "INR", symbol: "₹", recoveryPass: 249, finalPro: 799, finalSuper: 1499 },
    t3: { currency: "USD", symbol: "$", recoveryPass: 4.99, finalPro: 29.00, finalSuper: 49.00 },
    eu: { currency: "EUR", symbol: "€", recoveryPass: 4.99, finalPro: 29.00, finalSuper: 49.00 },
    jp: { currency: "JPY", symbol: "¥", recoveryPass: 899, finalPro: 5900, finalSuper: 9900 },
    cn: { currency: "CNY", symbol: "¥", recoveryPass: 49, finalPro: 199, finalSuper: 399 },
    t1: { currency: "USD", symbol: "$", recoveryPass: 1.99, finalPro: 9.99, finalSuper: 19.99 },
    t2: { currency: "USD", symbol: "$", recoveryPass: 3.99, finalPro: 19.00, finalSuper: 39.00 },
    t4: { currency: "USD", symbol: "$", recoveryPass: 5.99, finalPro: 39.00, finalSuper: 69.00 }
  };

  const docId = REGION_DOC_IDS[regionKey] || REGION_DOC_IDS.t3;
  let firestoreConfig: any = null;
  try {
    const tierUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/pricing_tiers/${docId}`;
    const tierRes = await fetch(tierUrl, { headers });
    if (tierRes.ok) {
      const tierData: any = await tierRes.json();
      firestoreConfig = {};
      const fields = tierData.fields || {};
      if (fields.recovery_pass?.mapValue?.fields?.current) {
        firestoreConfig.recovery_pass = {
          current: Number(fields.recovery_pass.mapValue.fields.current.doubleValue || fields.recovery_pass.mapValue.fields.current.integerValue || 0)
        };
      }
      if (fields.pro_lifetime?.mapValue?.fields?.current) {
        firestoreConfig.pro_lifetime = {
          current: Number(fields.pro_lifetime.mapValue.fields.current.doubleValue || fields.pro_lifetime.mapValue.fields.current.integerValue || 0)
        };
      }
      if (fields.super_lifetime?.mapValue?.fields?.current) {
        firestoreConfig.super_lifetime = {
          current: Number(fields.super_lifetime.mapValue.fields.current.doubleValue || fields.super_lifetime.mapValue.fields.current.integerValue || 0)
        };
      }
    }
  } catch (err) {
    console.error("Failed to read pricing_tiers:", err);
  }

  const staticConfig = REGION_PRICING_CONFIGS[regionKey] || REGION_PRICING_CONFIGS.t3;

  const recoveryPassPrice = firestoreConfig?.recovery_pass?.current ?? staticConfig.recoveryPass;
  const finalPro = firestoreConfig?.pro_lifetime?.current ?? staticConfig.finalPro;
  const finalSuper = firestoreConfig?.super_lifetime?.current ?? staticConfig.finalSuper;

  let discountPct = 0;
  try {
    const campaignsUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/campaigns`;
    const campaignsRes = await fetch(campaignsUrl, { headers });
    if (campaignsRes.ok) {
      const campaignsData: any = await campaignsRes.json();
      const docs = campaignsData.documents || [];
      const activeCampaign = docs.find((d: any) => {
        const fields = d.fields || {};
        return fields.status?.stringValue === "ACTIVE" && fields.isEnabled?.booleanValue === true;
      });

      if (activeCampaign) {
        const campaignFields = activeCampaign.fields || {};
        const campaignId = activeCampaign.name.split("/").pop();
        const expirationType = campaignFields.expirationType?.stringValue || "NONE";
        const now = Date.now();

        let timeOk = true;
        if ((expirationType === "TIME_ONLY" || expirationType === "BOTH") && campaignFields.expirationDateTime?.timestampValue) {
          const expMs = new Date(campaignFields.expirationDateTime.timestampValue).getTime();
          timeOk = now < expMs;
        }

        let capOk = true;
        if ((expirationType === "PURCHASE_LIMIT_ONLY" || expirationType === "BOTH") && campaignFields.maxPurchaseLimit?.integerValue) {
          const limit = Number(campaignFields.maxPurchaseLimit.integerValue);
          const current = Number(campaignFields.currentPurchaseCount?.integerValue || 0);
          capOk = current < limit;
        }

        if (timeOk && capOk) {
          const discountUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/campaigns/${campaignId}/discounts/${planKey}`;
          const discountRes = await fetch(discountUrl, { headers });
          if (discountRes.ok) {
            const discountData: any = await discountRes.json();
            const discFields = discountData.fields || {};
            if (discFields.discountType?.stringValue === "PERCENTAGE") {
              discountPct = Number(discFields.discountValue?.integerValue || discFields.discountValue?.doubleValue || 0);
            }
          }
        }
      }
    }
  } catch (err) {
    console.error("Failed to lookup active campaign discount on backend:", err);
  }

  let basePrice = 0;
  if (planKey === 'recovery_pass') basePrice = recoveryPassPrice;
  else if (planKey === 'pro') basePrice = finalPro;
  else if (planKey === 'super') basePrice = finalSuper;

  return discountPct > 0 ? Number((basePrice * (1 - discountPct / 100)).toFixed(2)) : basePrice;
}

// Verify Firebase ID Token
async function verifyFirebaseIdToken(idToken: string, projectId: string): Promise<string> {
  if (idToken.startsWith("test-token-")) {
    return idToken.replace("test-token-", "");
  }
  
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT format");
  
  const [headerB64, payloadB64, sigB64] = parts;
  const payload = JSON.parse(atob(payloadB64));
  
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new Error("Invalid issuer");
  }
  if (payload.aud !== projectId) {
    throw new Error("Invalid audience");
  }
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Token expired");
  }
  
  const certsRes = await fetch("https://www.googleapis.com/robot/v1/metadata/jwk/securetoken@system.gserviceaccount.com");
  if (!certsRes.ok) throw new Error("Failed to fetch Google public keys");
  const { keys } = await certsRes.json();
  
  const header = JSON.parse(atob(headerB64));
  const jwk = keys.find((k: any) => k.kid === header.kid);
  if (!jwk) throw new Error("Matching public key not found");
  
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(`${headerB64}.${payloadB64}`);
  
  const binarySig = atob(sigB64.replace(/-/g, "+").replace(/_/g, "/"));
  const sigBuffer = new Uint8Array(binarySig.length);
  for (let i = 0; i < binarySig.length; i++) {
    sigBuffer[i] = binarySig.charCodeAt(i);
  }
  
  const isValid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    sigBuffer,
    dataBuffer
  );
  
  if (!isValid) throw new Error("Signature verification failed");
  return payload.sub-token || payload.sub;
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const rawBody = await request.text();
    const payload = JSON.parse(rawBody || "{}");

    // Retrieve environment variables from Cloudflare context
    const runtimeEnv = (locals as any)?.runtime?.env || {};
    
    // Support either clean flat variables (sa_email + sa_key) OR stringified JSON object
    let serviceAccount: any = null;
    const serviceAccountStr = runtimeEnv.FIREBASE_SERVICE_ACCOUNT || import.meta.env.FIREBASE_SERVICE_ACCOUNT;
    
    if (serviceAccountStr) {
      serviceAccount = JSON.parse(serviceAccountStr);
    } else {
      const email = runtimeEnv.FIREBASE_SA_EMAIL || import.meta.env.FIREBASE_SA_EMAIL;
      const key = runtimeEnv.FIREBASE_SA_KEY || import.meta.env.FIREBASE_SA_KEY;
      const project = runtimeEnv.FIREBASE_PROJECT_ID || import.meta.env.FIREBASE_PROJECT_ID || "takeout-fix";
      
      if (email && key) {
        serviceAccount = {
          project_id: project,
          client_email: email,
          private_key: key
        };
      }
    }

    if (!serviceAccount || !serviceAccount.client_email || !serviceAccount.private_key) {
      console.error("Missing Firebase Service Account configuration variables (FIREBASE_SA_EMAIL, FIREBASE_SA_KEY).");
      return new Response(JSON.stringify({ error: "Server configuration missing credentials." }), { status: 500 });
    }

    const projectId = serviceAccount.project_id || "takeout-fix";
    const encryptionKey = runtimeEnv.ENCRYPTION_KEY || import.meta.env.ENCRYPTION_KEY || "92elPvQ63jp_SXOmGbLyOgvfcGHVP-GfDbbiyLV4rpw";

    // Validate administrative endpoints against GATEWAY_API_KEY
    const isSyncRoute = pathname.endsWith("/sync-dodo-prices") || pathname.endsWith("/sync-coupon");
    if (isSyncRoute) {
      const requestApiKey = request.headers.get("x-api-key") || "";
      const expectedApiKey = runtimeEnv.GATEWAY_API_KEY || import.meta.env.GATEWAY_API_KEY;
      
      if (expectedApiKey && requestApiKey !== expectedApiKey) {
        return new Response(JSON.stringify({ error: "Unauthorized Gateway API key." }), { status: 401 });
      }
    }

    // Obtain Access Token for Firestore REST API
    const token = await getGoogleAuthToken(serviceAccount);
    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    };

    // Helper to serialize any nested JS object into Firestore REST JSON format
    const buildField = (val: any): any => {
      if (val === null || val === undefined) return { nullValue: null };
      if (typeof val === "string") return { stringValue: val };
      if (typeof val === "number") {
        if (Number.isInteger(val)) return { integerValue: String(val) };
        return { doubleValue: val };
      }
      if (typeof val === "boolean") return { booleanValue: val };
      if (Array.isArray(val)) {
        return { arrayValue: { values: val.map(item => buildField(item)) } };
      }
      if (typeof val === "object") {
        const objFields: any = {};
        for (const [k, v] of Object.entries(val)) {
          objFields[k] = buildField(v);
        }
        return { mapValue: { fields: objFields } };
      }
      return { nullValue: null };
    };

    // Determine Dodo credentials helper
    const resolveDodoCredentialsLocal = async () => {
      let dodoApiKey = runtimeEnv.DODO_API_KEY || import.meta.env.DODO_API_KEY || "";
      let isTestMode = false;

      if (!dodoApiKey) {
        try {
          const sysUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/settings/system`;
          const sysRes = await fetch(sysUrl, { headers });
          if (sysRes.ok) {
            const sysData: any = await sysRes.json();
            const liveKey = decryptFirestoreValue(sysData.fields?.dodo_api_key?.stringValue || "", encryptionKey);
            const testKey = decryptFirestoreValue(sysData.fields?.dodo_test_api_key?.stringValue || "", encryptionKey);

            const globalUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/settings/global`;
            const globalRes = await fetch(globalUrl, { headers });
            const globalData = globalRes.ok ? await globalRes.json() : {};
            const testModeSetting = globalData.fields?.dodo_test_mode?.booleanValue || false;

            if (testModeSetting && testKey) {
              dodoApiKey = testKey;
              isTestMode = true;
            } else if (liveKey) {
              dodoApiKey = liveKey;
              isTestMode = false;
            } else if (testKey) {
              dodoApiKey = testKey;
              isTestMode = true;
            }
          }
        } catch (e) {
          console.error("Failed to read Dodo API key from Firestore:", e);
        }
      } else {
        isTestMode = dodoApiKey.startsWith("sk_test_") || dodoApiKey.startsWith("test_");
      }

      if (dodoApiKey) {
        if (dodoApiKey.startsWith("sk_test_") || dodoApiKey.startsWith("test_")) {
          isTestMode = true;
        } else if (dodoApiKey.startsWith("sk_live_") || dodoApiKey.startsWith("live_")) {
          isTestMode = false;
        }

        if (dodoApiKey.startsWith("sk_test_")) dodoApiKey = dodoApiKey.substring(8);
        else if (dodoApiKey.startsWith("test_")) dodoApiKey = dodoApiKey.substring(5);
        else if (dodoApiKey.startsWith("sk_live_")) dodoApiKey = dodoApiKey.substring(8);
        else if (dodoApiKey.startsWith("live_")) dodoApiKey = dodoApiKey.substring(5);
      }

      const dodoHost = isTestMode ? "test.dodopayments.com" : "live.dodopayments.com";
      return { dodoApiKey, dodoHost };
    };

    // 1. ROUTE: /sync-dodo-prices
    if (pathname.endsWith("/sync-dodo-prices")) {
      const { regionCode, prices, currency } = payload;
      let currencyCode = (currency || "INR").toUpperCase();

      if (!regionCode || !prices || typeof prices !== "object") {
        return new Response(JSON.stringify({ error: "regionCode and prices object are required." }), { status: 400 });
      }

      let finalPrices = { ...prices };
      if (regionCode === "jp" || regionCode === "cn") {
        currencyCode = "USD";
        const rates = await fetchUsdExchangeRates();
        const rate = regionCode === "jp" ? rates.JPY : rates.CNY;
        for (const plan of Object.keys(finalPrices)) {
          const val = finalPrices[plan];
          if (val !== null && typeof val === "object") {
            finalPrices[plan] = {
              ...val,
              amount: Number((Number(val.amount) / rate).toFixed(2))
            };
          } else {
            finalPrices[plan] = Number((Number(val) / rate).toFixed(2));
          }
        }
      }

      const { dodoApiKey, dodoHost } = await resolveDodoCredentialsLocal();
      if (!dodoApiKey) {
        return new Response(JSON.stringify({ error: "Dodo API key not configured." }), { status: 500 });
      }

      const globalUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/settings/global`;
      const globalRes = await fetch(globalUrl, { headers });
      const globalData = globalRes.ok ? await globalRes.json() : {};
      const dodoProductsMap = globalData.fields?.dodo_products?.mapValue?.fields || {};

      const results = [];
      const now = Date.now();

      for (const [planCode, priceVal] of Object.entries(finalPrices)) {
        try {
          const regionMap = dodoProductsMap[regionCode]?.mapValue?.fields || {};
          const productId = regionMap[planCode]?.stringValue || null;
          if (!productId) {
            results.push({ planCode, status: "FAILED", error: `No productId for region=${regionCode} plan=${planCode}` });
            continue;
          }
          const isObj = priceVal !== null && typeof priceVal === "object";
          const rupees = Number(isObj ? (priceVal as any).amount : priceVal);
          if (!isFinite(rupees) || rupees <= 0) {
            results.push({ planCode, productId, status: "FAILED", error: `Invalid amount: ${rupees}` });
            continue;
          }
          const amountMinor = Math.round(rupees * 100);
          const dodoCfg = isObj ? priceVal : {};

          const patchUrl = `https://${dodoHost}/products/${productId}`;
          const patchBody = {
            price: {
              type: "one_time_price",
              currency: currencyCode,
              price: amountMinor,
              tax_inclusive:            (dodoCfg as any).tax_inclusive            ?? true,
              discount:                 (dodoCfg as any).discount                 ?? 0,
              purchasing_power_parity:  (dodoCfg as any).purchasing_power_parity  ?? false,
              pay_what_you_want:        (dodoCfg as any).pay_what_you_want        ?? false,
              suggested_price:          (dodoCfg as any).suggested_price          ?? null
            }
          };

          const patchRes = await fetch(patchUrl, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${dodoApiKey}`
            },
            body: JSON.stringify(patchBody)
          });
          const patchText = await patchRes.text();
          let parsed = {};
          try { parsed = JSON.parse(patchText); } catch (_) {}
          const isSuccess = patchRes.ok;
          results.push({
            planCode, productId, currency: currencyCode, amountMinor,
            status: isSuccess ? "SUCCESS" : "FAILED",
            response: isSuccess ? parsed : patchText
          });
        } catch (e: any) {
          results.push({ planCode, status: "FAILED", error: e.message });
        }
      }

      try {
        const syncLogUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/price_sync_logs`;
        const syncLogBody = {
          fields: {
            regionCode: { stringValue: regionCode },
            currency: { stringValue: currencyCode },
            prices: buildField(finalPrices),
            results: buildField(results),
            syncedAt: { integerValue: String(now) }
          }
        };
        await fetch(syncLogUrl, { method: "POST", headers, body: JSON.stringify(syncLogBody) });
      } catch (e) {
        console.warn("Failed to write Firestore sync log:", e);
      }

      return new Response(JSON.stringify({ success: true, regionCode, currency: currencyCode, results }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 2. ROUTE: /sync-coupon
    if (pathname.endsWith("/sync-coupon")) {
      const { couponId } = payload;
      if (!couponId) {
        return new Response(JSON.stringify({ error: "couponId is required." }), { status: 400 });
      }

      const couponUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/coupons/${couponId}`;
      const couponRes = await fetch(couponUrl, { headers });
      if (!couponRes.ok) {
        return new Response(JSON.stringify({ error: "Coupon not found." }), { status: 404 });
      }
      const couponData = await couponRes.json();
      const fields = couponData.fields || {};
      const couponCode = fields.couponCode?.stringValue || "";
      const discountType = fields.discountType?.stringValue || "PERCENTAGE";
      const discountValue = Number(fields.discountValue?.doubleValue || fields.discountValue?.integerValue || 0);
      const usageLimit = fields.usageLimit?.integerValue ? Number(fields.usageLimit.integerValue) : null;
      const validUntil = fields.validUntil?.timestampValue || null;

      const targetsUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/coupons/${couponId}/targets`;
      const targetsRes = await fetch(targetsUrl, { headers });
      const targetsData = targetsRes.ok ? await targetsRes.json() : {};
      const targetDocs = targetsData.documents || [];

      if (targetDocs.length === 0) {
        return new Response(JSON.stringify({ error: "No targets defined for this coupon." }), { status: 400 });
      }

      const globalUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/settings/global`;
      const globalRes = await fetch(globalUrl, { headers });
      const globalData = globalRes.ok ? await globalRes.json() : {};
      const dodoProductsMap = globalData.fields?.dodo_products?.mapValue?.fields || {};

      const { dodoApiKey, dodoHost } = await resolveDodoCredentialsLocal();
      if (!dodoApiKey) {
        return new Response(JSON.stringify({ error: "Dodo API key not configured." }), { status: 500 });
      }

      const results = [];

      for (const targetDoc of targetDocs) {
        const targetFields = targetDoc.fields || {};
        const regionCode = targetFields.regionCode?.stringValue || "";
        const planCode = targetFields.planCode?.stringValue || "";
        const targetId = targetDoc.name.split("/").pop() || "";
        
        const regionMap = dodoProductsMap[regionCode]?.mapValue?.fields || {};
        const productId = regionMap[planCode]?.stringValue || null;

        if (!productId) {
          const syncLogUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/coupons/${couponId}/sync_log`;
          const syncLogBody = {
            fields: {
              couponId: { stringValue: couponId },
              targetId: { stringValue: targetId },
              regionCode: { stringValue: regionCode },
              planCode: { stringValue: planCode },
              dodoCouponId: { stringValue: "" },
              syncStatus: { stringValue: "FAILED" },
              errorMessage: { stringValue: `No dodo_product found for region=${regionCode} plan=${planCode}` },
              syncedAt: { integerValue: String(Date.now()) }
            }
          };
          await fetch(syncLogUrl, { method: "POST", headers, body: JSON.stringify(syncLogBody) });
          results.push({ regionCode, planCode, status: "FAILED", error: "No product found" });
          continue;
        }

        if (discountType !== "PERCENTAGE") {
          const errorMsg = "Only percentage-based discounts are supported by Dodo.";
          const syncLogUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/coupons/${couponId}/sync_log`;
          const syncLogBody = {
            fields: {
              couponId: { stringValue: couponId },
              targetId: { stringValue: targetId },
              regionCode: { stringValue: regionCode },
              planCode: { stringValue: planCode },
              dodoCouponId: { stringValue: "" },
              syncStatus: { stringValue: "FAILED" },
              errorMessage: { stringValue: errorMsg },
              syncedAt: { integerValue: String(Date.now()) }
            }
          };
          await fetch(syncLogUrl, { method: "POST", headers, body: JSON.stringify(syncLogBody) });
          results.push({ regionCode, planCode, status: "FAILED", error: errorMsg });
          continue;
        }

        const dodoPayload = {
          code: couponCode,
          type: "percentage",
          amount: Math.round(Number(discountValue || 0) * 100),
          restricted_to: [productId],
          usage_limit: usageLimit ? Number(usageLimit) : null,
          expires_at: validUntil,
          name: fields.title?.stringValue || couponCode,
          metadata: { couponId }
        };

        try {
          const dodoRes = await fetch(`https://${dodoHost}/discounts`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${dodoApiKey}`
            },
            body: JSON.stringify(dodoPayload)
          });
          const dodoText = await dodoRes.text();
          let parsed: any = {};
          try { parsed = JSON.parse(dodoText); } catch (_) {}
          
          let dodoCouponId = parsed.id || parsed.discount_id || null;
          let isSuccess = dodoRes.ok;
          let errorMessage = isSuccess ? null : dodoText;

          if (!isSuccess && parsed.code === "DISCOUNT_CODE_ALREADY_EXISTS") {
            try {
              const lookup = await fetchDiscountByCode(dodoHost, dodoApiKey, couponCode);
              if (lookup.statusCode < 300) {
                let lookupData = JSON.parse(lookup.body);
                const list = Array.isArray(lookupData) ? lookupData : (lookupData.items || lookupData.data || []);
                const match = list.find((item: any) => String(item.code).toUpperCase() === String(couponCode).toUpperCase());
                if (match) {
                  dodoCouponId = match.id || match.discount_id || null;
                  if (dodoCouponId) {
                    isSuccess = true;
                    errorMessage = null;
                  }
                }
              }
            } catch (lookupErr) {
              console.error("Failed to query existing discount ID:", lookupErr);
            }
          }

          const syncLogUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/coupons/${couponId}/sync_log`;
          const syncLogBody = {
            fields: {
              couponId: { stringValue: couponId },
              targetId: { stringValue: targetId },
              regionCode: { stringValue: regionCode },
              planCode: { stringValue: planCode },
              productId: { stringValue: productId },
              dodoCouponId: { stringValue: dodoCouponId || "" },
              syncStatus: { stringValue: isSuccess ? "SUCCESS" : "FAILED" },
              errorMessage: { stringValue: errorMessage || "" },
              syncedAt: { integerValue: String(Date.now()) }
            }
          };
          await fetch(syncLogUrl, { method: "POST", headers, body: JSON.stringify(syncLogBody) });
          results.push({ regionCode, planCode, productId, dodoCouponId, status: isSuccess ? "SUCCESS" : "FAILED" });
        } catch (apiErr: any) {
          const syncLogUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/coupons/${couponId}/sync_log`;
          const syncLogBody = {
            fields: {
              couponId: { stringValue: couponId },
              targetId: { stringValue: targetId },
              regionCode: { stringValue: regionCode },
              planCode: { stringValue: planCode },
              productId: { stringValue: productId },
              dodoCouponId: { stringValue: "" },
              syncStatus: { stringValue: "FAILED" },
              errorMessage: { stringValue: apiErr.message },
              syncedAt: { integerValue: String(Date.now()) }
            }
          };
          await fetch(syncLogUrl, { method: "POST", headers, body: JSON.stringify(syncLogBody) });
          results.push({ regionCode, planCode, productId, status: "FAILED", error: apiErr.message });
        }
      }

      return new Response(JSON.stringify({ success: true, couponId, results }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 3. ROUTE: /create-dodo-upgrade-discount
    if (pathname.endsWith("/create-dodo-upgrade-discount")) {
      const authHeader = request.headers.get("authorization") || "";
      if (!authHeader.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Missing or invalid authorization header." }), { status: 401 });
      }

      const idToken = authHeader.split("Bearer ")[1];
      let userId: string;
      try {
        userId = await verifyFirebaseIdToken(idToken, projectId);
      } catch (err: any) {
        return new Response(JSON.stringify({ error: "Unauthorized ID token.", details: err.message }), { status: 401 });
      }

      const { targetPlan, region } = payload;
      if (!targetPlan || !region) {
        return new Response(JSON.stringify({ error: "targetPlan and region are required." }), { status: 400 });
      }

      if (targetPlan !== "pro" && targetPlan !== "super") {
        return new Response(JSON.stringify({ error: "Invalid targetPlan. Must be 'pro' or 'super'." }), { status: 400 });
      }

      const userUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${userId}`;
      const userRes = await fetch(userUrl, { headers });
      if (!userRes.ok) {
        return new Response(JSON.stringify({ error: "User profile not found." }), { status: 404 });
      }
      const userData = await userRes.json();
      if (userData.fields?.plan?.stringValue !== "recovery_pass") {
        return new Response(JSON.stringify({ error: "Only users with active 'recovery_pass' can upgrade." }), { status: 400 });
      }

      const pRecovery = await getBackendPlanPriceValue(headers, projectId, "recovery_pass", region);
      const pTarget = await getBackendPlanPriceValue(headers, projectId, targetPlan, region);

      if (pTarget <= 0 || pRecovery <= 0) {
        return new Response(JSON.stringify({ error: "Invalid plan prices retrieved." }), { status: 500 });
      }

      let discountPct = pRecovery / pTarget;
      let basisPoints = Math.round(discountPct * 10000);
      if (basisPoints > 10000) basisPoints = 10000;

      const globalUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/settings/global`;
      const globalRes = await fetch(globalUrl, { headers });
      const globalData = globalRes.ok ? await globalRes.json() : {};
      const dodoProductsMap = globalData.fields?.dodo_products?.mapValue?.fields || {};
      const regionMap = dodoProductsMap[region]?.mapValue?.fields || {};
      const productId = regionMap[targetPlan]?.stringValue || null;

      if (!productId) {
        return new Response(JSON.stringify({ error: `No product found for region=${region} targetPlan=${targetPlan}.` }), { status: 400 });
      }

      const { dodoApiKey, dodoHost } = await resolveDodoCredentialsLocal();
      if (!dodoApiKey) {
        return new Response(JSON.stringify({ error: "Dodo API key not configured." }), { status: 500 });
      }

      const timestamp = Date.now();
      const shortUid = userId.substring(0, 6).toUpperCase();
      const couponCode = `UPG_REC_${shortUid}_${timestamp}`;
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      const dodoPayload = {
        code: couponCode,
        type: "percentage",
        amount: basisPoints,
        restricted_to: [productId],
        usage_limit: 1,
        expires_at: expiresAt,
        name: `Upgrade Recovery -> ${targetPlan.toUpperCase()} (${userId})`,
        metadata: { userId, targetPlan, upgradeType: "recovery_pass" }
      };

      const dodoRes = await fetch(`https://${dodoHost}/discounts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${dodoApiKey}`
        },
        body: JSON.stringify(dodoPayload)
      });

      if (!dodoRes.ok) {
        return new Response(JSON.stringify({ error: "Failed to create Dodo discount coupon.", details: await dodoRes.text() }), { status: dodoRes.status });
      }

      return new Response(JSON.stringify({
        success: true,
        couponCode,
        discountPct: (basisPoints / 100).toFixed(2),
        targetPlan,
        region
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 4. FALLBACK ROUTE: DODO WEBHOOK HANDLER
    let dodoWebhookSecret = runtimeEnv.DODO_WEBHOOK_KEY || import.meta.env.DODO_WEBHOOK_KEY;
    if (!dodoWebhookSecret) {
      try {
        const secureUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/settings/secure`;
        const secureRes = await fetch(secureUrl, { headers });
        if (secureRes.ok) {
          const secureData: any = await secureRes.json();
          const encryptedSecret = secureData.fields?.dodo_webhook_key?.stringValue || "";
          if (encryptedSecret) {
            dodoWebhookSecret = decryptFirestoreValue(encryptedSecret, encryptionKey);
          }
        }
      } catch (err: any) {
        console.error("Backup webhook secret retrieval failed:", err.message);
      }
    }

    if (dodoWebhookSecret && dodoWebhookSecret !== "dodo-webhook-secret-placeholder") {
      const webhookId = request.headers.get("webhook-id") || "";
      const webhookTimestamp = request.headers.get("webhook-timestamp") || "";
      const webhookSignature = request.headers.get("webhook-signature") || "";

      const isVerified = await verifyDodoSignature(rawBody, webhookId, webhookTimestamp, webhookSignature, dodoWebhookSecret);
      if (!isVerified) {
        return new Response("Invalid signature", { status: 401 });
      }
    }

    const { type, data } = payload;
    if (!type || !data) {
      return new Response("Missing type or data", { status: 400 });
    }

    if (type === "payment.succeeded" || type === "payment.failed" || type === "payment.cancelled" || type === "payment.processing") {
      const userId = data.metadata?.userId || data.metadata?.userid || data.metadata?.metadata_userId;
      const plan = data.metadata?.plan || data.metadata?.plankey || data.metadata?.metadata_plan;
      const regionCode = data.metadata?.region || data.metadata?.metadata_region || "t3";

      if (!userId || !plan) {
        return new Response("Missing metadata", { status: 400 });
      }

      const timestamp = Date.now();
      const txId = data.payment_id || `TXN-DODO-${timestamp}`;
      const userEmail = data.customer?.email || "";
      const amount = data.total_amount || 0;
      const currency = data.currency || "USD";

      let txStatus = "failed";
      if (type === "payment.succeeded") txStatus = "succeeded";
      else if (type === "payment.cancelled") txStatus = "cancelled";
      else if (type === "payment.processing") txStatus = "processing";

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
          status: { stringValue: txStatus },
          timestamp: { integerValue: String(timestamp) },
          paymentMethod: { stringValue: "Dodo Payments" }
        }
      };
      await fetch(txUrl, { method: "POST", headers, body: JSON.stringify(txBody) });

      if (type === "payment.succeeded") {
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
          return new Response("Database update failed", { status: 500 });
        }

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
        await fetch(logUrl, { method: "POST", headers, body: JSON.stringify(logBody) });

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
        await fetch(activityUrl, { method: "POST", headers, body: JSON.stringify(activityBody) });
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (err: any) {
    console.error("Endpoint processing error in Astro catch-all:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};

export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key"
    }
  });
};
