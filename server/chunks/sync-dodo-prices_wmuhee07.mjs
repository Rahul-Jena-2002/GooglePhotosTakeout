globalThis.process ??= {};
globalThis.process.env ??= {};
import { env } from "cloudflare:workers";
const prerender = false;
function json(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
const OPTIONS = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key"
    }
  });
};
async function fetchUsdExchangeRates() {
  const fallback = { JPY: 150, CNY: 7.2 };
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    if (!res.ok) {
      return fallback;
    }
    const parsed = await res.json();
    if (parsed && parsed.result === "success" && parsed.rates) {
      const jpy = parsed.rates.JPY ? Number(parsed.rates.JPY) : fallback.JPY;
      const cny = parsed.rates.CNY ? Number(parsed.rates.CNY) : fallback.CNY;
      return { JPY: jpy, CNY: cny };
    }
  } catch (e) {
  }
  return fallback;
}
async function patchProductPrice(dodoHost, productId, amountMinor, currencyCode, dodoApiKey, dodoCfg = {}) {
  const payload = JSON.stringify({
    price: {
      type: "one_time_price",
      currency: currencyCode,
      price: amountMinor,
      tax_inclusive: dodoCfg.tax_inclusive ?? true,
      discount: dodoCfg.discount ?? 0,
      purchasing_power_parity: dodoCfg.purchasing_power_parity ?? false,
      pay_what_you_want: dodoCfg.pay_what_you_want ?? false,
      suggested_price: dodoCfg.suggested_price ?? null
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
const POST = async ({ request }) => {
  try {
    const GATEWAY_API_KEY = env.GATEWAY_API_KEY || void 0 || "";
    const headerKey = request.headers.get("x-api-key") || request.headers.get("authorization")?.replace("Bearer ", "");
    const isLocalDev = false;
    if (!isLocalDev) {
      if (!GATEWAY_API_KEY || !headerKey || headerKey !== GATEWAY_API_KEY) {
        return json(401, { error: "Unauthorized" });
      }
    }
    const raw = await request.text();
    let payload = {};
    try {
      payload = JSON.parse(raw || "{}");
    } catch {
      return json(400, { error: "Invalid JSON body" });
    }
    const { regionCode, prices, currency } = payload;
    let currencyCode = String(currency || "INR").toUpperCase();
    if (!regionCode || !prices || typeof prices !== "object") {
      return json(400, { error: "regionCode and prices object are required." });
    }
    const dodoTestModeVal = env.DODO_TEST_MODE || void 0;
    const dodoTestMode = dodoTestModeVal === "true" || dodoTestModeVal === true || dodoTestModeVal === void 0;
    let dodoApiKey = dodoTestMode ? env.DODO_TEST_API_KEY || void 0 : env.DODO_API_KEY || void 0;
    if (!dodoApiKey) {
      return json(500, { error: `Dodo API key not configured in Cloudflare environment (${dodoTestMode ? "DODO_TEST_API_KEY" : "DODO_API_KEY"}).` });
    }
    dodoApiKey = dodoApiKey.replace(/^sk_test_/, "").replace(/^test_/, "").replace(/^sk_live_/, "").replace(/^live_/, "");
    const dodoHost = dodoTestMode ? "test.dodopayments.com" : "live.dodopayments.com";
    const envMode = dodoTestMode ? "test" : "live";
    const dodoProductsLiveStr = env.DODO_PRODUCTS_LIVE || void 0 || "{}";
    const dodoProductsTestStr = env.DODO_PRODUCTS_TEST || void 0 || "{}";
    let dodoProductsMap = {};
    try {
      dodoProductsMap = dodoTestMode ? JSON.parse(dodoProductsTestStr) : JSON.parse(dodoProductsLiveStr);
    } catch (e) {
      return json(500, { error: "Invalid DODO_PRODUCTS config mapping on Cloudflare", message: e.message });
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
    const results = [];
    for (const [planCode, priceVal] of Object.entries(finalPrices)) {
      try {
        const productId = dodoProductsMap?.[regionCode]?.[planCode] || null;
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
        try {
          parsed = JSON.parse(apiResp.body);
        } catch (_) {
        }
        const isSuccess = apiResp.statusCode && apiResp.statusCode < 300;
        results.push({
          planCode,
          productId,
          currency: currencyCode,
          amountMinor,
          envMode,
          status: isSuccess ? "SUCCESS" : "FAILED",
          response: isSuccess ? parsed || null : apiResp.body
        });
      } catch (e) {
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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json(500, {
      error: "ProxyError",
      message
    });
  }
};
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  OPTIONS,
  POST,
  prerender
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
export {
  page
};
