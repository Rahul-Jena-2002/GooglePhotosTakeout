/**
 * Cloudflare Pages Function: /api/sync-dodo-prices
 *
 * Reads Dodo API credentials from Firestore (REST API),
 * decrypts them with Web Crypto (AES-256-GCM),
 * then updates each Dodo product price via PATCH.
 *
 * Environment variables (set in Cloudflare Pages dashboard):
 *   FIREBASE_PROJECT_ID  — e.g. "gt-metadata-merger"
 *   FIREBASE_API_KEY     — Firebase Web API key (for auth token exchange)
 *   FIREBASE_SA_EMAIL    — Service Account email
 *   FIREBASE_SA_KEY      — Service Account private key (PEM, newlines as \n)
 *   ENCRYPTION_KEY       — MEK used to decrypt enc:v1: values
 *   GATEWAY_API_KEY      — Required x-api-key header value
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getFirestoreToken(env) {
  // Use Firebase service account JWT to get an access token
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

  // Import RSA private key
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
  if (!resp.ok) throw new Error(`Firestore GET ${path} failed: ${resp.status} ${await resp.text()}`)
  return resp.json()
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

  // Derive key using PBKDF2 (same as local-server)
  const salt = new Uint8Array(16) // 16 zero bytes
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

  if (testMode && testKey) {
    dodoApiKey = testKey; isTestMode = true
  } else if (liveKey) {
    dodoApiKey = liveKey; isTestMode = false
  } else if (testKey) {
    dodoApiKey = testKey; isTestMode = true
  }

  // Strip key prefixes
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

  // Auth check
  const apiKey = request.headers.get('x-api-key') || ''
  if (env.GATEWAY_API_KEY && apiKey !== env.GATEWAY_API_KEY) {
    return jsonResp({ error: 'Unauthorized' }, 401)
  }

  let body
  try { body = await request.json() } catch { return jsonResp({ error: 'Invalid JSON body' }, 400) }

  const { regionCode, prices, currency } = body || {}
  if (!regionCode || !prices || typeof prices !== 'object') {
    return jsonResp({ error: 'regionCode and prices object are required.' }, 400)
  }

  let currencyCode = (currency || 'INR').toUpperCase()

  try {
    const token = await getFirestoreToken(env)
    const projectId = env.FIREBASE_PROJECT_ID

    // Auto-convert JPY/CNY to USD (Dodo doesn't support these)
    let finalPrices = { ...prices }
    if (regionCode === 'jp' || regionCode === 'cn') {
      currencyCode = 'USD'
      const ratesResp = await fetch('https://api.exchangerate-api.com/v4/latest/USD')
      const ratesData = await ratesResp.json()
      const rate = regionCode === 'jp' ? ratesData.rates.JPY : ratesData.rates.CNY
      for (const plan of Object.keys(finalPrices)) {
        const val = finalPrices[plan]
        const isObj = val !== null && typeof val === 'object'
        finalPrices[plan] = isObj
          ? { ...val, amount: Number((Number(val.amount) / rate).toFixed(2)) }
          : Number((Number(val) / rate).toFixed(2))
      }
    }

    const { dodoApiKey, dodoHost } = await resolveDodoCredentials(env, token)
    if (!dodoApiKey) {
      return jsonResp({ error: 'Dodo API key not configured. Save it in Admin Settings → Dodo Live API Key.' }, 500)
    }

    // Load product ID map
    const globalDoc = await firestoreGet(projectId, 'settings/global', token)
    const dodoProductsMapRaw = globalDoc?.fields?.dodo_products?.mapValue?.fields || {}
    const dodoProductsMap = {}
    for (const [region, regionField] of Object.entries(dodoProductsMapRaw)) {
      dodoProductsMap[region] = {}
      for (const [plan, planField] of Object.entries(regionField?.mapValue?.fields || {})) {
        dodoProductsMap[region][plan] = planField?.stringValue || ''
      }
    }

    const results = []
    for (const [planCode, priceVal] of Object.entries(finalPrices)) {
      const productId = dodoProductsMap?.[regionCode]?.[planCode] || null
      if (!productId) {
        results.push({ planCode, status: 'FAILED', error: `No productId for region=${regionCode} plan=${planCode}` })
        continue
      }
      const isObj = priceVal !== null && typeof priceVal === 'object'
      const rupees = Number(isObj ? priceVal.amount : priceVal)
      if (!isFinite(rupees) || rupees <= 0) {
        results.push({ planCode, productId, status: 'FAILED', error: `Invalid amount: ${rupees}` })
        continue
      }
      const amountMinor = Math.round(rupees * 100)
      const dodoCfg = isObj ? priceVal : {}

      try {
        const patchResp = await fetch(`https://${dodoHost}/products/${productId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${dodoApiKey}` },
          body: JSON.stringify({
            price: {
              type: 'one_time_price',
              currency: currencyCode,
              price: amountMinor,
              tax_inclusive: dodoCfg.tax_inclusive ?? true,
              discount: dodoCfg.discount ?? 0,
              purchasing_power_parity: dodoCfg.purchasing_power_parity ?? false,
              pay_what_you_want: dodoCfg.pay_what_you_want ?? false,
              suggested_price: dodoCfg.suggested_price ?? null,
            },
          }),
        })
        const respText = await patchResp.text()
        let parsed = {}
        try { parsed = JSON.parse(respText) } catch (_) {}
        results.push({
          planCode, productId, currency: currencyCode, amountMinor,
          status: patchResp.ok ? 'SUCCESS' : 'FAILED',
          response: patchResp.ok ? parsed : respText,
        })
      } catch (e) {
        results.push({ planCode, status: 'FAILED', error: e.message })
      }
    }

    return jsonResp({ success: true, regionCode, currency: currencyCode, results })
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
