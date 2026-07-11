/**
 * Cloudflare Pages Function: /api/sync-coupon
 *
 * Reads coupon data from Firestore (REST API),
 * resolves Dodo credentials, then creates the discount in Dodo Payments.
 *
 * Environment variables (set in Cloudflare Pages dashboard):
 *   FIREBASE_PROJECT_ID  — e.g. "gt-metadata-merger"
 *   FIREBASE_SA_EMAIL    — Service Account email
 *   FIREBASE_SA_KEY      — Service Account private key (PEM, newlines as \n)
 *   ENCRYPTION_KEY       — MEK used to decrypt enc:v1: values
 *   GATEWAY_API_KEY      — Required x-api-key header value
 */

// ─── Shared Helpers (duplicated from sync-dodo-prices for self-containment) ───

async function getFirestoreToken(env) {
  const { FIREBASE_SA_EMAIL, FIREBASE_SA_KEY } = env
  if (!FIREBASE_SA_EMAIL || !FIREBASE_SA_KEY) {
    throw new Error('FIREBASE_SA_EMAIL and FIREBASE_SA_KEY must be set in Cloudflare environment variables.')
  }

  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: FIREBASE_SA_EMAIL,
    sub: FIREBASE_SA_EMAIL,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/datastore',
  }

  const encode = (obj) => btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const signingInput = `${encode(header)}.${encode(payload)}`

  const pemBody = FIREBASE_SA_KEY.replace(/\\n/g, '\n').replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\s/g, '')
  const der = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput))
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const jwt = `${signingInput}.${sigB64}`

  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  })
  const tokenData = await tokenResp.json()
  if (!tokenData.access_token) throw new Error('Failed to get Firebase access token: ' + JSON.stringify(tokenData))
  return tokenData.access_token
}

async function firestoreGet(projectId, path, token) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!resp.ok) throw new Error(`Firestore GET ${path} failed: ${resp.status}`)
  return resp.json()
}

async function firestoreList(projectId, path, token) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!resp.ok) throw new Error(`Firestore LIST ${path} failed: ${resp.status}`)
  const data = await resp.json()
  return data.documents || []
}

function firestoreField(doc, field) {
  const f = doc?.fields?.[field]
  if (!f) return null
  return f.stringValue ?? f.booleanValue ?? f.integerValue ?? f.doubleValue ?? f.nullValue ?? null
}

async function decryptValue(val, mek) {
  if (!val || !val.startsWith('enc:v1:')) return val
  const hex = val.slice(7)
  const combined = new Uint8Array(hex.match(/.{2}/g).map(b => parseInt(b, 16)))
  const iv = combined.slice(0, 12)
  const ciphertextAndTag = combined.slice(12)
  const salt = new Uint8Array(16)
  const baseKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(mek), 'PBKDF2', false, ['deriveKey'])
  const aesKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  )
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ciphertextAndTag)
  return new TextDecoder().decode(decrypted)
}

async function resolveDodoCredentials(env, token) {
  const projectId = env.FIREBASE_PROJECT_ID
  const mek = env.ENCRYPTION_KEY

  const sysDoc = await firestoreGet(projectId, 'settings/system', token)
  const globalDoc = await firestoreGet(projectId, 'settings/global', token)

  const rawLive = firestoreField(sysDoc, 'dodo_api_key') || ''
  const rawTest = firestoreField(sysDoc, 'dodo_test_api_key') || ''
  const testMode = firestoreField(globalDoc, 'dodo_test_mode') || false

  let liveKey = mek ? await decryptValue(rawLive, mek) : rawLive
  let testKey = mek ? await decryptValue(rawTest, mek) : rawTest

  let dodoApiKey = ''
  let isTestMode = false
  if (testMode && testKey) { dodoApiKey = testKey; isTestMode = true }
  else if (liveKey) { dodoApiKey = liveKey; isTestMode = false }
  else if (testKey) { dodoApiKey = testKey; isTestMode = true }

  if (dodoApiKey.startsWith('sk_test_')) { dodoApiKey = dodoApiKey.slice(8); isTestMode = true }
  else if (dodoApiKey.startsWith('test_')) { dodoApiKey = dodoApiKey.slice(5); isTestMode = true }
  else if (dodoApiKey.startsWith('sk_live_')) { dodoApiKey = dodoApiKey.slice(8) }
  else if (dodoApiKey.startsWith('live_')) { dodoApiKey = dodoApiKey.slice(5) }

  const dodoHost = isTestMode ? 'test.dodopayments.com' : 'live.dodopayments.com'
  return { dodoApiKey, dodoHost }
}

function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

export async function onRequestPost(context) {
  const { request, env } = context

  const apiKey = request.headers.get('x-api-key') || ''
  if (env.GATEWAY_API_KEY && apiKey !== env.GATEWAY_API_KEY) {
    return jsonResp({ error: 'Unauthorized' }, 401)
  }

  let body
  try { body = await request.json() } catch { return jsonResp({ error: 'Invalid JSON body' }, 400) }

  const { couponId } = body || {}
  if (!couponId) return jsonResp({ error: 'couponId is required.' }, 400)

  try {
    const token = await getFirestoreToken(env)
    const projectId = env.FIREBASE_PROJECT_ID

    // 1. Get coupon doc
    const couponDoc = await firestoreGet(projectId, `coupons/${couponId}`, token)
    if (!couponDoc?.fields) return jsonResp({ error: 'Coupon not found.' }, 404)

    const couponCode = firestoreField(couponDoc, 'couponCode') || ''
    const discountType = firestoreField(couponDoc, 'discountType') || 'PERCENTAGE'
    const discountValue = Number(firestoreField(couponDoc, 'discountValue') || 0)
    const usageLimit = firestoreField(couponDoc, 'usageLimit')
    const validUntilRaw = couponDoc.fields?.validUntil
    let validUntil = null
    if (validUntilRaw?.timestampValue) validUntil = new Date(validUntilRaw.timestampValue).toISOString()
    else if (validUntilRaw?.stringValue) validUntil = new Date(validUntilRaw.stringValue).toISOString()

    // 2. Get targets subcollection
    const targetDocs = await firestoreList(projectId, `coupons/${couponId}/targets`, token)
    if (!targetDocs.length) return jsonResp({ error: 'No targets defined for this coupon.' }, 400)

    // 3. Get product map
    const globalDoc = await firestoreGet(projectId, 'settings/global', token)
    const dodoProductsMapRaw = globalDoc?.fields?.dodo_products?.mapValue?.fields || {}
    const dodoProductsMap = {}
    for (const [region, regionField] of Object.entries(dodoProductsMapRaw)) {
      dodoProductsMap[region] = {}
      for (const [plan, planField] of Object.entries(regionField?.mapValue?.fields || {})) {
        dodoProductsMap[region][plan] = planField?.stringValue || ''
      }
    }

    // 4. Get credentials
    const { dodoApiKey, dodoHost } = await resolveDodoCredentials(env, token)
    if (!dodoApiKey) return jsonResp({ error: 'Dodo API key not configured.' }, 500)

    const results = []

    for (const targetDoc of targetDocs) {
      const regionCode = firestoreField(targetDoc, 'regionCode')
      const planCode = firestoreField(targetDoc, 'planCode')
      const productId = dodoProductsMap[regionCode]?.[planCode] || null

      if (!productId) {
        results.push({ regionCode, planCode, status: 'FAILED', error: `No product found for region=${regionCode} plan=${planCode}` })
        continue
      }

      if (discountType !== 'PERCENTAGE') {
        results.push({ regionCode, planCode, status: 'FAILED', error: 'Only percentage discounts are supported by Dodo Payments.' })
        continue
      }

      const dodoPayload = {
        code: couponCode,
        type: 'percentage',
        amount: Math.round(Number(discountValue) * 100), // e.g. 15% → 1500 basis points
        restricted_to: [productId],
        usage_limit: usageLimit ? Number(usageLimit) : null,
        expires_at: validUntil,
        name: firestoreField(couponDoc, 'title') || couponCode,
        metadata: { couponId },
      }

      try {
        const dodoResp = await fetch(`https://${dodoHost}/discounts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${dodoApiKey}` },
          body: JSON.stringify(dodoPayload),
        })
        const respText = await dodoResp.text()
        let parsed = {}
        try { parsed = JSON.parse(respText) } catch (_) {}

        let dodoCouponId = parsed.id || parsed.discount_id || null
        let isSuccess = dodoResp.ok

        // If coupon code already exists, fetch the existing ID
        if (!isSuccess && parsed.code === 'DISCOUNT_CODE_ALREADY_EXISTS') {
          const lookupResp = await fetch(
            `https://${dodoHost}/discounts?page_size=100`,
            { headers: { Authorization: `Bearer ${dodoApiKey}` } }
          )
          if (lookupResp.ok) {
            const lookupData = await lookupResp.json()
            const list = Array.isArray(lookupData) ? lookupData : (lookupData.items || lookupData.data || [])
            const match = list.find(item => String(item.code).toUpperCase() === String(couponCode).toUpperCase())
            if (match) { dodoCouponId = match.id || match.discount_id || null; isSuccess = true }
          }
        }

        results.push({ regionCode, planCode, productId, dodoCouponId, status: isSuccess ? 'SUCCESS' : 'FAILED', ...(isSuccess ? {} : { error: respText }) })
      } catch (e) {
        results.push({ regionCode, planCode, productId, status: 'FAILED', error: e.message })
      }
    }

    return jsonResp({ success: true, couponId, results })
  } catch (err) {
    return jsonResp({ error: err.message }, 500)
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
    },
  })
}
