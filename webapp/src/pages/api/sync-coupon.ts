export const prerender = false;
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

type JsonRecord = Record<string, unknown>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function json(status: number, data: JsonRecord): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}

function parseFirestoreValue(value: any): any {
  if (!value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return parseInt(value.integerValue, 10);
  if ('doubleValue' in value) return parseFloat(value.doubleValue);
  if ('timestampValue' in value) return new Date(value.timestampValue);
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(parseFirestoreValue);
  if ('mapValue' in value) {
    const obj: any = {};
    for (const [k, v] of Object.entries(value.mapValue.fields || {})) obj[k] = parseFirestoreValue(v);
    return obj;
  }
  return null;
}

function parseFirestoreDoc(doc: any): any {
  const obj: any = {};
  for (const [k, v] of Object.entries(doc.fields || {})) obj[k] = parseFirestoreValue(v);
  return obj;
}

function toFirestoreValue(val: any): any {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  if (typeof val === 'string') return { stringValue: val };
  if (val instanceof Date) return { timestampValue: val.toISOString() };
  if (Array.isArray(val)) return { arrayValue: { values: val.map(toFirestoreValue) } };
  if (typeof val === 'object') {
    const fields: any = {};
    for (const [k, v] of Object.entries(val)) fields[k] = toFirestoreValue(v);
    return { mapValue: { fields } };
  }
  return { nullValue: null };
}

function toFirestoreFields(obj: Record<string, any>): any {
  const fields: any = {};
  for (const [k, v] of Object.entries(obj)) fields[k] = toFirestoreValue(v);
  return { fields };
}

// ─── Google Auth (Service Account JWT → Access Token) ─────────────────────────

async function getGoogleAuthToken(serviceAccount: any): Promise<string> {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600;

  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/datastore',
    iat,
    exp
  };

  const b64u = (str: string) => btoa(str).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const unsignedToken = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(payload))}`;

  const pem = serviceAccount.private_key
    .replace(/\\n/g, '\n')
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');

  const binary = atob(pem);
  const keyBuffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) keyBuffer[i] = binary.charCodeAt(i);

  const key = await crypto.subtle.importKey(
    'pkcs8', keyBuffer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsignedToken));
  const signedToken = `${unsignedToken}.${btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${signedToken}`
  });
  if (!res.ok) throw new Error(`Google Auth failed: ${await res.text()}`);
  return (await res.json() as any).access_token;
}

// ─── Dodo Credential Resolver ─────────────────────────────────────────────────

function decryptValue(val: string, mek: string): string {
  // Stored encrypted values start with "enc:v1:" — if not encrypted, return as-is
  if (!val || !val.startsWith('enc:v1:')) return val;
  // Decryption requires Node crypto (not available in CF Workers edge runtime).
  // Values should be stored decrypted or passed via env vars for CF Workers.
  console.warn('[sync-coupon] Encrypted Firestore value detected. Decryption requires Node crypto — skipping.');
  return '';
}

async function resolveDodoCredentials(
  projectId: string,
  authHeaders: Record<string, string>,
  cfEnv: any
): Promise<{ dodoApiKey: string; dodoHost: string }> {
  let dodoApiKey: string = cfEnv.DODO_API_KEY || import.meta.env.DODO_API_KEY || '';
  let isTestMode = false;

  if (!dodoApiKey) {
    try {
      const sysUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/settings/system`;
      const sysRes = await fetch(sysUrl, { headers: authHeaders });
      if (sysRes.ok) {
        const sysData = parseFirestoreDoc(await sysRes.json());
        const encKey = cfEnv.ENCRYPTION_KEY || import.meta.env.ENCRYPTION_KEY || '';
        const liveKey = decryptValue(sysData.dodo_api_key || '', encKey);
        const testKey = decryptValue(sysData.dodo_test_api_key || '', encKey);

        const globalUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/settings/global`;
        const globalRes = await fetch(globalUrl, { headers: authHeaders });
        let testModeOn = false;
        if (globalRes.ok) {
          const globalData = parseFirestoreDoc(await globalRes.json());
          testModeOn = !!globalData.dodo_test_mode;
        }

        if (testModeOn && testKey) { dodoApiKey = testKey; isTestMode = true; }
        else if (liveKey) { dodoApiKey = liveKey; isTestMode = false; }
        else if (testKey) { dodoApiKey = testKey; isTestMode = true; }
      }
    } catch (e: any) {
      console.error('[sync-coupon] Failed to resolve Dodo credentials from Firestore:', e.message);
    }
  }

  // Strip known prefixes and detect mode
  if (dodoApiKey.startsWith('sk_test_') || dodoApiKey.startsWith('test_')) isTestMode = true;
  else if (dodoApiKey.startsWith('sk_live_') || dodoApiKey.startsWith('live_')) isTestMode = false;

  dodoApiKey = dodoApiKey
    .replace(/^sk_test_/, '').replace(/^test_/, '')
    .replace(/^sk_live_/, '').replace(/^live_/, '');

  const dodoHost = isTestMode ? 'test.dodopayments.com' : 'live.dodopayments.com';
  return { dodoApiKey, dodoHost };
}

// ─── Dodo API Helpers ─────────────────────────────────────────────────────────

async function createDiscount(dodoHost: string, dodoApiKey: string, body: any): Promise<{ statusCode: number; body: string }> {
  const res = await fetch(`https://${dodoHost}/discounts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${dodoApiKey}` },
    body: JSON.stringify(body)
  });
  return { statusCode: res.status, body: await res.text() };
}

async function fetchDiscountByCode(dodoHost: string, dodoApiKey: string, code: string): Promise<{ statusCode: number; body: string }> {
  const res = await fetch(`https://${dodoHost}/discounts?code=${encodeURIComponent(code)}`, {
    headers: { Authorization: `Bearer ${dodoApiKey}` }
  });
  return { statusCode: res.status, body: await res.text() };
}

// ─── Route ────────────────────────────────────────────────────────────────────

export const OPTIONS: APIRoute = async () => new Response(null, {
  status: 204,
  headers: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key'
  }
});

export const POST: APIRoute = async ({ request }) => {
  try {
    // ── 1. Auth — verify Firebase ID Token
    const authHeader = request.headers.get('Authorization') || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : (request.headers.get('x-api-key') || '');
    const isLocalDev = import.meta.env.DEV;

    if (!isLocalDev && idToken) {
      try {
        const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
        if (!verifyRes.ok) return json(401, { error: 'Unauthorized: invalid Firebase ID token.' });
      } catch (e: any) {
        return json(401, { error: 'Unauthorized: could not verify token.' });
      }
    } else if (!isLocalDev && !idToken) {
      return json(401, { error: 'Unauthorized: no auth token provided.' });
    }

    // ── 2. Parse body ──────────────────────────────────────────────────────
    let body: JsonRecord = {};
    try { body = JSON.parse(await request.text() || '{}'); } catch { return json(400, { error: 'Invalid JSON body' }); }

    const { couponId } = body;
    if (!couponId || typeof couponId !== 'string') return json(400, { error: 'couponId is required.' });

    // ── 3. Resolve Firebase service account ────────────────────────────────
    const serviceAccountStr = (env as any).FIREBASE_SERVICE_ACCOUNT || import.meta.env.FIREBASE_SERVICE_ACCOUNT;
    if (!serviceAccountStr) return json(500, { error: 'Missing FIREBASE_SERVICE_ACCOUNT environment variable.' });

    const serviceAccount = JSON.parse(serviceAccountStr);
    const projectId: string = serviceAccount.project_id || 'takeout-fix';
    const token = await getGoogleAuthToken(serviceAccount);
    const authHeaders: Record<string, string> = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    const fsBase = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

    // ── 4. Load coupon document ────────────────────────────────────────────
    const couponRes = await fetch(`${fsBase}/coupons/${couponId}`, { headers: authHeaders });
    if (!couponRes.ok) return couponRes.status === 404 ? json(404, { error: 'Coupon not found.' }) : json(couponRes.status, { error: 'Failed to load coupon.' });
    const coupon = parseFirestoreDoc(await couponRes.json());

    // ── 5. Load coupon targets (sub-collection) ────────────────────────────
    const targetsRes = await fetch(`${fsBase}/coupons/${couponId}/targets`, { headers: authHeaders });
    if (!targetsRes.ok) return json(500, { error: 'Failed to load coupon targets.' });
    const targetsData = await targetsRes.json() as any;
    const targetDocs: any[] = targetsData.documents || [];
    if (targetDocs.length === 0) return json(400, { error: 'No targets defined for this coupon.' });

    // ── 6. Resolve Dodo credentials ────────────────────────────────────────
    const { dodoApiKey, dodoHost } = await resolveDodoCredentials(projectId, authHeaders, env as any);
    if (!dodoApiKey) return json(500, { error: 'Dodo API key not configured. Save it in Admin Settings → Dodo Live API Key.' });

    // ── 7. Load settings/global for product map ────────────────────────────
    const globalRes = await fetch(`${fsBase}/settings/global`, { headers: authHeaders });
    const globalData = globalRes.ok ? parseFirestoreDoc(await globalRes.json()) : {};
    const isTestMode = !!globalData.dodo_test_mode;
    const dodoProductsMap: Record<string, any> = isTestMode
      ? (globalData.dodo_products_test || {})
      : (globalData.dodo_products_live || globalData.dodo_products || {});

    // ── 8. Validate: only PERCENTAGE discounts supported ──────────────────
    if (coupon.discountType !== 'PERCENTAGE') {
      return json(400, { error: 'Only PERCENTAGE-based discounts are supported by Dodo Payments currently.' });
    }

    const results: any[] = [];

    // ── 9. Sync each target ────────────────────────────────────────────────
    for (const targetDoc of targetDocs) {
      const target = parseFirestoreDoc(targetDoc);
      const targetId = (targetDoc.name as string).split('/').pop()!;
      const { regionCode, planCode } = target;

      const productId: string | null = dodoProductsMap?.[regionCode]?.[planCode] || null;

      if (!productId) {
        const logEntry = {
          couponId, targetId, regionCode, planCode, dodoCouponId: null,
          syncStatus: 'FAILED',
          errorMessage: `No dodo_product found for region=${regionCode} plan=${planCode} in settings/global.dodo_products`,
          syncedAt: Date.now()
        };
        await fetch(`${fsBase}/coupons/${couponId}/sync_log`, {
          method: 'POST', headers: authHeaders, body: JSON.stringify(toFirestoreFields(logEntry))
        });
        results.push({ regionCode, planCode, status: 'FAILED', error: 'No product found' });
        continue;
      }

      // Calculate expiry
      let expiresAt: string | null = null;
      if (coupon.validUntil) {
        const d = coupon.validUntil instanceof Date ? coupon.validUntil : new Date(coupon.validUntil);
        if (!isNaN(d.getTime())) expiresAt = d.toISOString();
      }

      const discountPayload = {
        code: coupon.couponCode,
        type: 'percentage',
        amount: Math.round(Number(coupon.discountValue || 0) * 100), // basis points (15% → 1500)
        restricted_to: [productId],
        usage_limit: coupon.usageLimit ? Number(coupon.usageLimit) : null,
        expires_at: expiresAt,
        name: coupon.title || coupon.couponCode,
        metadata: { couponId }
      };

      try {
        let dodoResp = await createDiscount(dodoHost, dodoApiKey, discountPayload);
        let parsed: any = {};
        try { parsed = JSON.parse(dodoResp.body); } catch (_) { }

        let dodoCouponId: string | null = parsed.id || parsed.discount_id || null;
        let isSuccess = dodoResp.statusCode < 300;

        // If code already exists → look up existing ID by code
        if (!isSuccess && parsed.code === 'DISCOUNT_CODE_ALREADY_EXISTS') {
          console.log(`[sync-coupon] Code "${coupon.couponCode}" already exists. Looking up existing discount ID...`);
          try {
            const lookupResp = await fetchDiscountByCode(dodoHost, dodoApiKey, coupon.couponCode);
            let lookupData: any = {};
            try { lookupData = JSON.parse(lookupResp.body); } catch (_) { }
            const list = Array.isArray(lookupData) ? lookupData : (lookupData.items || lookupData.data || []);
            const match = list.find((item: any) => String(item.code).toUpperCase() === String(coupon.couponCode).toUpperCase());
            if (match?.id || match?.discount_id) {
              dodoCouponId = match.id || match.discount_id;
              isSuccess = true;
              console.log(`[sync-coupon] Retrieved existing Dodo discount ID: ${dodoCouponId}`);
            }
          } catch (lookupErr: any) {
            console.error('[sync-coupon] Failed to look up existing discount:', lookupErr.message);
          }
        }

        const logEntry = {
          couponId, targetId, regionCode, planCode, productId,
          dodoCouponId,
          syncStatus: isSuccess ? 'SUCCESS' : 'FAILED',
          errorMessage: isSuccess ? null : dodoResp.body,
          syncedAt: Date.now()
        };
        await fetch(`${fsBase}/coupons/${couponId}/sync_log`, {
          method: 'POST', headers: authHeaders, body: JSON.stringify(toFirestoreFields(logEntry))
        });
        results.push({ regionCode, planCode, productId, dodoCouponId, status: isSuccess ? 'SUCCESS' : 'FAILED' });
      } catch (apiErr: any) {
        await fetch(`${fsBase}/coupons/${couponId}/sync_log`, {
          method: 'POST', headers: authHeaders,
          body: JSON.stringify(toFirestoreFields({
            couponId, targetId, regionCode, planCode, productId,
            dodoCouponId: null, syncStatus: 'FAILED', errorMessage: apiErr.message, syncedAt: Date.now()
          }))
        });
        results.push({ regionCode, planCode, productId, status: 'FAILED', error: apiErr.message });
      }
    }

    return json(200, { success: true, couponId, results } as JsonRecord);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[sync-coupon] Unhandled error:', message);
    return json(500, { error: 'ServerError', message });
  }
};