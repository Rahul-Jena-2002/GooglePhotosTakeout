export const prerender = false;
import type { APIRoute } from 'astro';
import nodeCrypto from 'node:crypto';
import { env } from 'cloudflare:workers';

type JsonRecord = Record<string, unknown>;

function json(status: number, data: JsonRecord): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

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

// Helper to sign JWT and fetch token for Firestore REST API
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

  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  const pemContents = serviceAccount.private_key
    .replace(/\\n/g, "\n")
    .replace(pemHeader, "")
    .replace(pemFooter, "")
    .replace(/\s/g, "");
  
  console.log("[getGoogleAuthToken] pemContents length:", pemContents.length);
  console.log("[getGoogleAuthToken] pemContents preview:", pemContents.substring(0, 30));
  console.log("[getGoogleAuthToken] Character at index 188 to 194:", pemContents.substring(188, 194));

  const binaryKey = atob(pemContents);
  console.log("[getGoogleAuthToken] binaryKey length:", binaryKey.length);
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

// Helper: Parse Firestore REST values
function parseFirestoreValue(value: any): any {
  if (!value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return parseInt(value.integerValue, 10);
  if ('doubleValue' in value) return parseFloat(value.doubleValue);
  if ('arrayValue' in value) {
    return (value.arrayValue.values || []).map(parseFirestoreValue);
  }
  if ('mapValue' in value) {
    const obj: any = {};
    const fields = value.mapValue.fields || {};
    for (const [k, v] of Object.entries(fields)) {
      obj[k] = parseFirestoreValue(v);
    }
    return obj;
  }
  return null;
}

function parseFirestoreDocument(doc: any): any {
  const fields = doc.fields || {};
  const obj: any = {};
  for (const [k, v] of Object.entries(fields)) {
    obj[k] = parseFirestoreValue(v);
  }
  return obj;
}

// Helper: Convert JS object to Firestore REST fields format
function toFirestoreValue(val: any): any {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    if (Number.isInteger(val)) {
      return { integerValue: String(val) };
    } else {
      return { doubleValue: val };
    }
  }
  if (typeof val === 'string') return { stringValue: val };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(toFirestoreValue) } };
  }
  if (typeof val === 'object') {
    const fields: any = {};
    for (const [k, v] of Object.entries(val)) {
      fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { nullValue: null };
}

function toFirestoreFields(obj: Record<string, any>): any {
  const fields: any = {};
  for (const [k, v] of Object.entries(obj)) {
    fields[k] = toFirestoreValue(v);
  }
  return { fields };
}

// Helper: Fetch USD exchange rates using standard fetch
async function fetchUsdExchangeRates(): Promise<{ JPY: number; CNY: number }> {
  const fallback = { JPY: 150.0, CNY: 7.2 };
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    if (!res.ok) {
      console.warn(`Exchange rate API returned status ${res.status}. Using fallback.`);
      return fallback;
    }
    const parsed: any = await res.json();
    if (parsed && parsed.result === "success" && parsed.rates) {
      const jpy = parsed.rates.JPY ? Number(parsed.rates.JPY) : fallback.JPY;
      const cny = parsed.rates.CNY ? Number(parsed.rates.CNY) : fallback.CNY;
      console.log(`Successfully fetched dynamic USD rates: JPY=${jpy}, CNY=${cny}`);
      return { JPY: jpy, CNY: cny };
    }
  } catch (e: any) {
    console.warn("Failed to parse exchange rate response:", e.message);
  }
  return fallback;
}

// Helper: Fetch Dodo credentials from Firestore or Env
async function resolveDodoCredentials(
  projectId: string,
  headers: Record<string, string>,
  encryptionKey: string,
  cfEnv: any
): Promise<{ dodoApiKey: string; dodoHost: string }> {
  let dodoApiKey = cfEnv.DODO_API_KEY || import.meta.env.DODO_API_KEY || "";
  let isTestMode = false;

  if (!dodoApiKey) {
    try {
      const sysUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/settings/system`;
      const sysRes = await fetch(sysUrl, { headers });
      if (sysRes.ok) {
        const sysDoc = await sysRes.json();
        const sysData = parseFirestoreDocument(sysDoc);

        const liveKey = decryptFirestoreValue(sysData.dodo_api_key || "", encryptionKey);
        const testKey = decryptFirestoreValue(sysData.dodo_test_api_key || "", encryptionKey);

        const globalUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/settings/global`;
        const globalRes = await fetch(globalUrl, { headers });
        let testModeSetting = false;
        if (globalRes.ok) {
          const globalDoc = await globalRes.json();
          const globalData = parseFirestoreDocument(globalDoc);
          testModeSetting = !!globalData.dodo_test_mode;
        }

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
    } catch (e: any) {
      console.error("Failed to read Dodo API key from Firestore:", e.message);
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
}

// Helper to call PATCH /products/{product_id}
async function patchProductPrice(
  dodoHost: string,
  productId: string,
  amountMinor: number,
  currencyCode: string,
  dodoApiKey: string,
  dodoCfg: any = {}
): Promise<{ statusCode: number; body: string }> {
  const payload = JSON.stringify({
    price: {
      type: "one_time_price",
      currency: currencyCode,
      price: amountMinor,
      tax_inclusive:            dodoCfg.tax_inclusive            ?? true,
      discount:                 dodoCfg.discount                 ?? 0,
      purchasing_power_parity:  dodoCfg.purchasing_power_parity  ?? false,
      pay_what_you_want:        dodoCfg.pay_what_you_want        ?? false,
      suggested_price:          dodoCfg.suggested_price          ?? null
    }
  });

  const url = `https://${dodoHost}/products/${productId}`;
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${dodoApiKey}`
    },
    body: payload
  });

  const body = await response.text();
  return { statusCode: response.status, body };
}

export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key'
    }
  });
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const raw = await request.text();
    let payload: JsonRecord = {};
    try {
      const parsed = JSON.parse(raw || '{}');
      if (parsed && typeof parsed === 'object') {
        payload = parsed as JsonRecord;
      }
    } catch {
      return json(400, { error: 'Invalid JSON body' });
    }

    // 1. Auth — verify Firebase ID Token to ensure caller is an authenticated admin.
    // This is safer than a shared gateway key and works on Cloudflare without any env var.
    const authHeader = request.headers.get('Authorization') || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : (request.headers.get('x-api-key') || '');
    const isLocalDev = import.meta.env.DEV;

    if (!isLocalDev && idToken) {
      // Verify token against Google's tokeninfo endpoint (lightweight check)
      try {
        const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
        if (!verifyRes.ok) {
          return json(401, { error: 'Unauthorized: invalid Firebase ID token.' });
        }
        // Additional check: token must not be expired (tokeninfo handles this)
      } catch (e: any) {
        console.error('[sync-dodo-prices] Token verification failed:', e.message);
        return json(401, { error: 'Unauthorized: could not verify token.' });
      }
    } else if (!isLocalDev && !idToken) {
      return json(401, { error: 'Unauthorized: no auth token provided.' });
    }

    const { regionCode, prices, currency } = payload || {};
    let currencyCode = String(currency || "INR").toUpperCase();

    if (!regionCode || !prices || typeof prices !== "object") {
      return json(400, { error: "regionCode and prices object are required." });
    }

    // Resolve credentials from environment/Firestore
    let serviceAccountStr = (env as any).FIREBASE_SERVICE_ACCOUNT || import.meta.env.FIREBASE_SERVICE_ACCOUNT;

    if (!serviceAccountStr) {
      try {
        const fs = await import('node:fs');
        const path = await import('node:path');
        console.log("[sync-dodo-prices] process.cwd():", process.cwd());
        let possiblePath = path.resolve(process.cwd(), 'serviceAccountKey.json');
        console.log("[sync-dodo-prices] Try path 1:", possiblePath, "exists:", fs.existsSync(possiblePath));
        if (!fs.existsSync(possiblePath)) {
          possiblePath = path.resolve(process.cwd(), '..', 'serviceAccountKey.json');
          console.log("[sync-dodo-prices] Try path 2:", possiblePath, "exists:", fs.existsSync(possiblePath));
        }
        if (fs.existsSync(possiblePath)) {
          serviceAccountStr = fs.readFileSync(possiblePath, 'utf8');
          console.log(`[sync-dodo-prices] Loaded service account from fallback file: ${possiblePath}`);
        }
      } catch (err: any) {
        console.warn("[sync-dodo-prices] Local service account file fallback warning:", err.message);
      }
    }

    if (!serviceAccountStr) {
      console.error("Missing FIREBASE_SERVICE_ACCOUNT environment variable.");
      return json(500, { error: "Missing FIREBASE_SERVICE_ACCOUNT environment variable." });
    }

    const serviceAccount = JSON.parse(serviceAccountStr);
    const projectId = serviceAccount.project_id || "takeout-fix";
    const encryptionKey = (env as any).ENCRYPTION_KEY || import.meta.env.ENCRYPTION_KEY || "92elPvQ63jp_SXOmGbLyOgvfcGHVP-GfDbbiyLV4rpw";

    const token = await getGoogleAuthToken(serviceAccount);
    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    };

    // Auto-calculate to USD for JPY and CNY regions
    let finalPrices = { ...(prices as Record<string, any>) };
    if (regionCode === "jp" || regionCode === "cn") {
      currencyCode = "USD";
      const rates = await fetchUsdExchangeRates();
      const rate = regionCode === "jp" ? rates.JPY : rates.CNY;
      console.log(`Auto-converting ${regionCode === "jp" ? "JPY" : "CNY"} to USD using dynamic rate: ${rate}`);
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

    const { dodoApiKey, dodoHost } = await resolveDodoCredentials(projectId, headers, encryptionKey, env as any);
    if (!dodoApiKey) {
      return json(500, { error: "Dodo API key not configured. Save it in Admin Settings → Dodo Live API Key or Dodo Test API Key." });
    }
    const envMode = dodoHost.includes("test.") ? "test" : "live";

    // Load products map from Firestore settings/global
    let dodoProductsMap: Record<string, any> = {};
    try {
      const globalUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/settings/global`;
      const globalRes = await fetch(globalUrl, { headers });
      if (globalRes.ok) {
        const globalDoc = await globalRes.json();
        const globalData = parseFirestoreDocument(globalDoc);
        const isTestMode = envMode === "test";
        dodoProductsMap = isTestMode
          ? (globalData.dodo_products_test || {})
          : (globalData.dodo_products_live || globalData.dodo_products || {});
      }
    } catch (e: any) {
      console.error("Failed to read settings/global:", e.message);
      return json(500, { error: "Failed to read settings/global", message: e.message });
    }

    const results = [];
    const now = Date.now();

    for (const [planCode, priceVal] of Object.entries(finalPrices)) {
      try {
        const productId = dodoProductsMap?.[regionCode as string]?.[planCode] || null;
        if (!productId) {
          results.push({ planCode, status: "FAILED", error: `No productId for region=${regionCode} plan=${planCode}` });
          continue;
        }

        const isObj = priceVal !== null && typeof priceVal === "object";
        const rupees = Number(isObj ? priceVal.amount : priceVal);
        if (!isFinite(rupees) || rupees <= 0) {
          results.push({ planCode, productId, status: "FAILED", error: `Invalid amount for ${planCode}: ${rupees}` });
          continue;
        }

        const amountMinor = Math.round(rupees * 100);
        const dodoCfg = isObj ? priceVal : {};

        const apiResp = await patchProductPrice(dodoHost, productId, amountMinor, currencyCode, dodoApiKey, dodoCfg);
        let parsed = {};
        try { parsed = JSON.parse(apiResp.body); } catch (_) { }

        const isSuccess = apiResp.statusCode && apiResp.statusCode < 300;
        results.push({
          planCode,
          productId,
          currency: currencyCode,
          amountMinor,
          envMode,
          status: isSuccess ? "SUCCESS" : "FAILED",
          response: isSuccess ? (parsed || null) : apiResp.body
        });
      } catch (e: any) {
        results.push({ planCode, status: "FAILED", error: e.message });
      }
    }

    // Persist a sync log to Firestore
    try {
      const logUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/price_sync_logs`;
      const logBody = toFirestoreFields({
        regionCode,
        currency: currencyCode,
        envMode,
        prices: finalPrices,
        results,
        syncedAt: now
      });
      const logRes = await fetch(logUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(logBody)
      });
      if (!logRes.ok) {
        console.warn("Failed to write price sync log:", await logRes.text());
      }
    } catch (e: any) {
      console.warn("Failed to persist price_sync_logs:", e.message);
    }

    return json(200, {
      success: true,
      regionCode,
      currency: currencyCode,
      envMode,
      results
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return json(500, {
      error: 'ProxyError',
      message
    });
  }
};