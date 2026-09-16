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
      console.warn(`Exchange rate API returned status ${res.status}. Using fallback.`);
      return fallback;
    }
    const parsed = await res.json();
    if (parsed && parsed.result === "success" && parsed.rates) {
      const jpy = parsed.rates.JPY ? Number(parsed.rates.JPY) : fallback.JPY;
      const cny = parsed.rates.CNY ? Number(parsed.rates.CNY) : fallback.CNY;
      console.log(`Successfully fetched dynamic USD rates: JPY=${jpy}, CNY=${cny}`);
      return { JPY: jpy, CNY: cny };
    }
  } catch (e) {
    console.warn("Failed to parse exchange rate response:", e.message);
  }
  return fallback;
}
async function patchProductPrice(dodoHost, productId, amountMinor, currencyCode, dodoApiKey, dodoCfg = {}) {
  const priceObj = {
    type: "one_time_price",
    currency: currencyCode,
    price: amountMinor,
    tax_inclusive: dodoCfg.tax_inclusive ?? true
  };
  if (dodoCfg.discount && Number(dodoCfg.discount) > 0) {
    priceObj.discount = Number(dodoCfg.discount);
  }
  if (dodoCfg.pay_what_you_want) {
    priceObj.pay_what_you_want = true;
    if (dodoCfg.suggested_price && Number(dodoCfg.suggested_price) > 0) {
      priceObj.suggested_price = Math.round(Number(dodoCfg.suggested_price) * 100);
    }
  }
  const payload = JSON.stringify({ price: priceObj });
  const url = `https://${dodoHost}/products/${productId}`;
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${dodoApiKey.trim()}`
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
    const { regionCode, prices, currency, productIds } = payload;
    let currencyCode = String(currency || "INR").toUpperCase();
    if (!regionCode || !prices || typeof prices !== "object") {
      return json(400, { error: "regionCode and prices object are required." });
    }
    const dodoTestModeVal = env.DODO_TEST_MODE || void 0;
    const dodoTestMode = dodoTestModeVal === "true" || dodoTestModeVal === true;
    let dodoApiKey = payload.dodoApiKey || payload.apiKey || (dodoTestMode ? env.DODO_TEST_API_KEY || void 0 || (typeof process !== "undefined" ? process.env.DODO_TEST_API_KEY : void 0) : env.DODO_API_KEY || void 0 || (typeof process !== "undefined" ? process.env.DODO_API_KEY : void 0)) || "";
    if (!dodoApiKey) {
      return json(400, {
        error: `Dodo Payments API key not configured (${dodoTestMode ? "DODO_TEST_API_KEY" : "DODO_API_KEY"}). Please enter your Dodo API Key in the Gateway Credentials tab and click Save, or set it in your environment variables.`
      });
    }
    dodoApiKey = String(dodoApiKey).trim();
    const isTestKey = dodoApiKey.startsWith("test_") || dodoApiKey.startsWith("sk_test_");
    const dodoHost = isTestKey || dodoTestMode ? "test.dodopayments.com" : "live.dodopayments.com";
    const envMode = isTestKey || dodoTestMode ? "test" : "live";
    const dodoProductsLiveStr = env.DODO_PRODUCTS_LIVE || void 0 || "{}";
    const dodoProductsTestStr = env.DODO_PRODUCTS_TEST || void 0 || "{}";
    let dodoProductsMap = {};
    try {
      dodoProductsMap = dodoTestMode ? JSON.parse(dodoProductsTestStr) : JSON.parse(dodoProductsLiveStr);
    } catch (e) {
      dodoProductsMap = {};
    }
    const effectiveProductIds = productIds && typeof productIds === "object" && Object.keys(productIds).length > 0 ? productIds : dodoProductsMap?.[regionCode] || {};
    let finalPrices = { ...prices };
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
        const productId = effectiveProductIds?.[planCode] || dodoProductsMap?.[regionCode]?.[planCode] || null;
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
