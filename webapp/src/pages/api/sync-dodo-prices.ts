export const prerender = false;
import type { APIRoute } from 'astro';
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

export const POST: APIRoute = async ({ request }) => {
  try {
    const GATEWAY_API_KEY = (env as any).GATEWAY_API_KEY || import.meta.env.GATEWAY_API_KEY || '';
    const headerKey = request.headers.get('x-api-key') || request.headers.get('authorization')?.replace('Bearer ', '');
    
    if (!GATEWAY_API_KEY || !headerKey || headerKey !== GATEWAY_API_KEY) {
      return json(401, { error: 'Unauthorized' });
    }

    const raw = await request.text();
    let payload: any = {};
    try {
      payload = JSON.parse(raw || '{}');
    } catch {
      return json(400, { error: 'Invalid JSON body' });
    }

    const { regionCode, prices, currency } = payload;
    let currencyCode = String(currency || "INR").toUpperCase();

    if (!regionCode || !prices || typeof prices !== "object") {
      return json(400, { error: "regionCode and prices object are required." });
    }

    // Resolve Dodo Keys and Mode directly from Cloudflare environment
    const dodoTestModeVal = (env as any).DODO_TEST_MODE || import.meta.env.DODO_TEST_MODE;
    const dodoTestMode = dodoTestModeVal === 'true' || dodoTestModeVal === true || dodoTestModeVal === undefined; // default to test mode if not configured
    
    let dodoApiKey = dodoTestMode 
      ? ((env as any).DODO_TEST_API_KEY || import.meta.env.DODO_TEST_API_KEY)
      : ((env as any).DODO_API_KEY || import.meta.env.DODO_API_KEY);

    if (!dodoApiKey) {
      return json(500, { error: `Dodo API key not configured in Cloudflare environment (${dodoTestMode ? "DODO_TEST_API_KEY" : "DODO_API_KEY"}).` });
    }

    // Strip sk_test_ / test_ / sk_live_ / live_ prefixes if present
    dodoApiKey = dodoApiKey
      .replace(/^sk_test_/, '').replace(/^test_/, '')
      .replace(/^sk_live_/, '').replace(/^live_/, '');

    const dodoHost = dodoTestMode ? "test.dodopayments.com" : "live.dodopayments.com";
    const envMode = dodoTestMode ? "test" : "live";

    // Resolve Product mappings from env
    const dodoProductsLiveStr = (env as any).DODO_PRODUCTS_LIVE || import.meta.env.DODO_PRODUCTS_LIVE || '{}';
    const dodoProductsTestStr = (env as any).DODO_PRODUCTS_TEST || import.meta.env.DODO_PRODUCTS_TEST || '{}';
    let dodoProductsMap: Record<string, any> = {};
    try {
      dodoProductsMap = dodoTestMode ? JSON.parse(dodoProductsTestStr) : JSON.parse(dodoProductsLiveStr);
    } catch (e: any) {
      return json(500, { error: "Invalid DODO_PRODUCTS config mapping on Cloudflare", message: e.message });
    }

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

    const results = [];
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