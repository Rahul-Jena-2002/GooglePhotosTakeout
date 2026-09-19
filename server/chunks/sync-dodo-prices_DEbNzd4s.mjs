globalThis.process ??= {};
globalThis.process.env ??= {};
import { env } from "cloudflare:workers";
import { f as fetchDodoProducts, p as patchDodoProductPrice, c as createDodoProduct, h as handleCorsOptions, j as jsonResponse, i as isAuthorizedRequest, r as resolveDodoHost } from "./client_B0zx0kbw.mjs";
const REGIONS_CONFIG = {
  in: { key: "in", name: "India", currency: "INR", symbol: "₹", flag: "🇮🇳", keywords: ["india", " in ", "in-", "🇮🇳"] },
  cn: { key: "cn", name: "China", currency: "CNY", symbol: "¥", flag: "🇨🇳", keywords: ["china", " cn ", "cn-", "🇨🇳"] },
  jp: { key: "jp", name: "Japan", currency: "JPY", symbol: "¥", flag: "🇯🇵", keywords: ["japan", " jp ", "jp-", "🇯🇵"] },
  eu: { key: "eu", name: "Europe", currency: "EUR", symbol: "€", flag: "🇪🇺", keywords: ["europe", " eu ", "eu-", "eur", "🇪🇺"] },
  t1: { key: "t1", name: "Tier 1", currency: "USD", symbol: "$", flag: "🌐", keywords: ["tier 1", "tier1", "t1"] },
  t2: { key: "t2", name: "Tier 2", currency: "USD", symbol: "$", flag: "🌐", keywords: ["tier 2", "tier2", "t2"] },
  t3: { key: "t3", name: "US (Tier 3)", currency: "USD", symbol: "$", flag: "🇺🇸", keywords: ["tier 3", "tier3", "t3", "united states", "usa", " us "] },
  t4: { key: "t4", name: "Tier 4", currency: "USD", symbol: "$", flag: "🌐", keywords: ["tier 4", "tier4", "t4"] }
};
const PLANS_CONFIG = [
  {
    key: "recovery_pass",
    name: "Recovery Pass",
    desc: "24-hour unlimited restoration pass",
    badge: "24h Pass",
    keywords: ["recovery", "pass", "24h", "24 hour"]
  },
  {
    key: "super",
    name: "Super Lifetime",
    desc: "Pro benefits + metadata inspector and duplicate scanner",
    badge: "Best Value",
    keywords: ["super", "ultimate", "max"]
  },
  {
    key: "pro",
    name: "Pro Lifetime",
    desc: "Unlimited lifetime processing and priority queue",
    badge: "Most Popular",
    keywords: ["pro", "lifetime"]
  }
];
function mapDodoProductsToTiers(products) {
  const mappedProducts = {};
  const mappedProductsFull = {};
  const mappedPrices = {};
  const unassignedProducts = [];
  const globalPlanProducts = {};
  for (const r of Object.keys(REGIONS_CONFIG)) {
    mappedProducts[r] = {};
    mappedProductsFull[r] = {};
    mappedPrices[r] = {};
  }
  for (const item of products) {
    const pId = item.product_id || item.id;
    if (!pId) continue;
    const rawName = String(item.name || "").trim();
    const lowerName = rawName.toLowerCase();
    let matchedPlan = "";
    for (const planDef of PLANS_CONFIG) {
      if (planDef.keywords.some((kw) => lowerName.includes(kw))) {
        matchedPlan = planDef.key;
        break;
      }
    }
    let amount = 0;
    let currency = "USD";
    if (item.price && typeof item.price === "object") {
      amount = Number(item.price.price || item.price.amount || 0) / 100;
      currency = String(item.price.currency || "USD").toUpperCase();
    } else if (typeof item.price === "number") {
      amount = item.price / 100;
      currency = String(item.currency || "USD").toUpperCase();
    }
    let matchedRegion = "";
    for (const [rCode, rDef] of Object.entries(REGIONS_CONFIG)) {
      if (rDef.keywords.some((kw) => lowerName.includes(kw))) {
        matchedRegion = rCode;
        break;
      }
    }
    if (!matchedRegion) {
      if (currency === "INR") matchedRegion = "in";
      else if (currency === "EUR") matchedRegion = "eu";
      else if (currency === "JPY") matchedRegion = "jp";
      else if (currency === "CNY") matchedRegion = "cn";
    }
    const isFullPrice = lowerName.includes("full price") || lowerName.includes("full p") || lowerName.includes("(full");
    const isFounding = lowerName.includes("founding");
    if (matchedPlan && matchedRegion) {
      if (isFullPrice) {
        mappedProductsFull[matchedRegion][matchedPlan] = pId;
        if (!mappedProducts[matchedRegion][matchedPlan]) {
          mappedProducts[matchedRegion][matchedPlan] = pId;
          mappedPrices[matchedRegion][matchedPlan] = { amount, currency, rawName, productId: pId };
        }
      } else if (isFounding) {
        mappedProducts[matchedRegion][matchedPlan] = pId;
        mappedPrices[matchedRegion][matchedPlan] = { amount, currency, rawName, productId: pId };
      } else {
        if (!mappedProducts[matchedRegion][matchedPlan] || !isFounding) {
          mappedProducts[matchedRegion][matchedPlan] = pId;
          mappedPrices[matchedRegion][matchedPlan] = { amount, currency, rawName, productId: pId };
        }
        if (!mappedProductsFull[matchedRegion][matchedPlan]) {
          mappedProductsFull[matchedRegion][matchedPlan] = pId;
        }
      }
    } else if (matchedPlan && !matchedRegion) {
      globalPlanProducts[matchedPlan] = { id: pId, price: amount, currency };
      unassignedProducts.push({ id: pId, name: rawName, plan: matchedPlan, currency, amount });
    } else {
      unassignedProducts.push({ id: pId, name: rawName, currency, amount });
    }
  }
  for (const r of Object.keys(REGIONS_CONFIG)) {
    for (const p of ["recovery_pass", "pro", "super"]) {
      if (!mappedProducts[r][p] && mappedProductsFull[r][p]) {
        mappedProducts[r][p] = mappedProductsFull[r][p];
      }
      if (!mappedProductsFull[r][p] && mappedProducts[r][p]) {
        mappedProductsFull[r][p] = mappedProducts[r][p];
      }
    }
  }
  for (const [planCode, prod] of Object.entries(globalPlanProducts)) {
    for (const rCode of Object.keys(REGIONS_CONFIG)) {
      if (!mappedProducts[rCode][planCode]) {
        mappedProducts[rCode][planCode] = prod.id;
        mappedProductsFull[rCode][planCode] = prod.id;
        if (!mappedPrices[rCode][planCode]) {
          mappedPrices[rCode][planCode] = {
            amount: prod.price,
            currency: prod.currency,
            productId: prod.id,
            isUniversal: true
          };
        }
      }
    }
  }
  return { mappedProducts, mappedProductsFull, mappedPrices, unassignedProducts };
}
const FALLBACK_RATES = { JPY: 150, CNY: 7.25 };
const CACHE_TTL_MS = 60 * 60 * 1e3;
let cachedRates = null;
let lastFetchTime = 0;
async function fetchUsdExchangeRates() {
  const now = Date.now();
  if (cachedRates && now - lastFetchTime < CACHE_TTL_MS) {
    return cachedRates;
  }
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    if (res.ok) {
      const parsed = await res.json();
      if (parsed?.result === "success" && parsed?.rates) {
        cachedRates = {
          JPY: parsed.rates.JPY ? Number(parsed.rates.JPY) : FALLBACK_RATES.JPY,
          CNY: parsed.rates.CNY ? Number(parsed.rates.CNY) : FALLBACK_RATES.CNY
        };
        lastFetchTime = now;
        return cachedRates;
      }
    }
  } catch (err) {
    console.warn("Failed to fetch exchange rates, using fallback:", err.message);
  }
  return cachedRates || FALLBACK_RATES;
}
async function fetchProductsCatalog(dodoHost, dodoApiKey, envMode) {
  const rawProducts = await fetchDodoProducts(dodoHost, dodoApiKey);
  if (!rawProducts.length) {
    return {
      success: true,
      count: 0,
      envMode,
      dodoHost,
      mappedProducts: {},
      mappedProductsFull: {},
      mappedPrices: {}
    };
  }
  const mapping = mapDodoProductsToTiers(rawProducts);
  return {
    success: true,
    count: rawProducts.length,
    envMode,
    dodoHost,
    products: rawProducts,
    ...mapping
  };
}
async function provisionAllRegions(dodoHost, dodoApiKey, envMode, payload) {
  const existingProductIds = payload.productIds || {};
  const regionalPrices = payload.regionalPrices || {};
  const results = [];
  const updatedProductIds = JSON.parse(JSON.stringify(existingProductIds));
  const rates = await fetchUsdExchangeRates();
  for (const [rCode, rDef] of Object.entries(REGIONS_CONFIG)) {
    if (!updatedProductIds[rCode]) updatedProductIds[rCode] = {};
    const regionPrices = regionalPrices[rCode] || { recovery_pass: 4.99, pro: 29, super: 49 };
    for (const [planCode, rawVal] of Object.entries(regionPrices)) {
      const isObj = rawVal !== null && typeof rawVal === "object";
      let amount = Number(isObj ? rawVal.amount : rawVal);
      if (!isFinite(amount) || amount <= 0) continue;
      let targetCurrency = rDef.currency;
      if (rCode === "jp") {
        targetCurrency = "USD";
        amount = Number((amount / rates.JPY).toFixed(2));
      } else if (rCode === "cn") {
        targetCurrency = "USD";
        amount = Number((amount / rates.CNY).toFixed(2));
      }
      const amountMinor = Math.round(amount * 100);
      const dodoCfg = isObj ? rawVal : {};
      const existingId = updatedProductIds[rCode]?.[planCode];
      let isSuccess = false;
      let finalId = existingId;
      let method = "NONE";
      if (existingId) {
        const patchRes = await patchDodoProductPrice(dodoHost, dodoApiKey, existingId, amountMinor, targetCurrency, dodoCfg);
        if (patchRes.statusCode < 300) {
          isSuccess = true;
          method = "PATCH";
        }
      }
      if (!isSuccess) {
        const planDef = PLANS_CONFIG.find((p) => p.key === planCode);
        const prodName = `TakeoutFix ${planDef ? planDef.name : planCode} — ${rDef.name}`;
        const createRes = await createDodoProduct(dodoHost, dodoApiKey, prodName, amountMinor, targetCurrency, dodoCfg);
        if (createRes.statusCode < 300 && createRes.productId) {
          isSuccess = true;
          finalId = createRes.productId;
          updatedProductIds[rCode][planCode] = createRes.productId;
          method = "CREATE";
        }
      }
      results.push({
        regionCode: rCode,
        planCode,
        productId: finalId,
        status: isSuccess ? "SUCCESS" : "FAILED",
        method
      });
    }
  }
  return {
    success: true,
    envMode,
    results,
    updatedProductIds
  };
}
async function syncSingleRegionPrices(dodoHost, dodoApiKey, envMode, payload) {
  const { regionCode, prices, currency, productIds } = payload;
  let currencyCode = String(currency || "INR").toUpperCase();
  const effectiveProductIds = productIds && typeof productIds === "object" ? { ...productIds } : {};
  const updatedProductIds = { ...effectiveProductIds };
  let finalPrices = { ...prices };
  if (regionCode === "jp" || regionCode === "cn") {
    currencyCode = "USD";
    const rates = await fetchUsdExchangeRates();
    const rate = regionCode === "jp" ? rates.JPY : rates.CNY;
    for (const plan of Object.keys(finalPrices)) {
      const val = finalPrices[plan];
      const amt = val !== null && typeof val === "object" ? Number(val.amount) : Number(val);
      const conv = Number((amt / rate).toFixed(2));
      finalPrices[plan] = val !== null && typeof val === "object" ? { ...val, amount: conv } : conv;
    }
  }
  const results = [];
  for (const [planCode, priceVal] of Object.entries(finalPrices)) {
    try {
      const isObj = priceVal !== null && typeof priceVal === "object";
      const rupees = Number(isObj ? priceVal.amount : priceVal);
      if (!isFinite(rupees) || rupees <= 0) continue;
      const amountMinor = Math.round(rupees * 100);
      const dodoCfg = isObj ? priceVal : {};
      const existingId = effectiveProductIds[planCode];
      let isSuccess = false;
      let apiResp = null;
      let finalId = existingId;
      let actionTaken = "NONE";
      if (existingId) {
        apiResp = await patchDodoProductPrice(dodoHost, dodoApiKey, existingId, amountMinor, currencyCode, dodoCfg);
        if (apiResp.statusCode < 300) {
          isSuccess = true;
          actionTaken = "PATCH";
        }
      }
      if (!isSuccess) {
        const regConfig = REGIONS_CONFIG[regionCode];
        const planDef = PLANS_CONFIG.find((p) => p.key === planCode);
        const regionName = regConfig ? regConfig.name : regionCode.toUpperCase();
        const planName = planDef ? planDef.name : planCode;
        const prodName = `TakeoutFix ${planName} — ${regionName}`;
        const createResp = await createDodoProduct(dodoHost, dodoApiKey, prodName, amountMinor, currencyCode, dodoCfg);
        if (createResp.statusCode < 300 && createResp.productId) {
          isSuccess = true;
          finalId = createResp.productId;
          updatedProductIds[planCode] = createResp.productId;
          actionTaken = "CREATE";
        } else {
          apiResp = createResp;
        }
      }
      results.push({
        planCode,
        productId: finalId,
        currency: currencyCode,
        amountMinor,
        envMode,
        actionTaken,
        status: isSuccess ? "SUCCESS" : "FAILED",
        response: isSuccess ? null : apiResp?.body || "Unknown error"
      });
    } catch (err) {
      results.push({ planCode, status: "FAILED", error: err.message });
    }
  }
  return {
    success: true,
    regionCode,
    currency: currencyCode,
    envMode,
    results,
    updatedProductIds
  };
}
const prerender = false;
const OPTIONS = handleCorsOptions;
const POST = async ({ request }) => {
  try {
    const raw = await request.text();
    let payload = {};
    try {
      payload = JSON.parse(raw || "{}");
    } catch {
      return jsonResponse(400, { error: "Invalid JSON body" });
    }
    const GATEWAY_API_KEY = env.GATEWAY_API_KEY || void 0 || "";
    const isDev = Boolean(false);
    if (!isAuthorizedRequest(request, payload, GATEWAY_API_KEY, isDev)) {
      return jsonResponse(401, { error: "Unauthorized" });
    }
    const dodoTestModeVal = env.DODO_TEST_MODE || void 0;
    const testMode = payload.testMode !== void 0 ? Boolean(payload.testMode) : dodoTestModeVal === "true" || dodoTestModeVal === true;
    const dodoApiKey = String(payload.dodoApiKey || payload.apiKey || (testMode ? env.DODO_TEST_API_KEY || void 0 || (typeof process !== "undefined" ? process.env.DODO_TEST_API_KEY : void 0) : env.DODO_API_KEY || void 0 || (typeof process !== "undefined" ? process.env.DODO_API_KEY : void 0)) || "").trim();
    if (!dodoApiKey) {
      return jsonResponse(400, {
        error: `Dodo API key not provided (${testMode ? "DODO_TEST_API_KEY" : "DODO_API_KEY"}).`
      });
    }
    const { host: dodoHost, envMode } = resolveDodoHost(dodoApiKey, testMode);
    const action = payload.action || "sync_region";
    if (action === "fetch_products") {
      const result2 = await fetchProductsCatalog(dodoHost, dodoApiKey, envMode);
      return jsonResponse(200, result2);
    }
    if (action === "provision_all") {
      const result2 = await provisionAllRegions(dodoHost, dodoApiKey, envMode, payload);
      return jsonResponse(200, result2);
    }
    if (!payload.regionCode || !payload.prices || typeof payload.prices !== "object") {
      return jsonResponse(400, { error: "regionCode and prices object are required." });
    }
    const result = await syncSingleRegionPrices(dodoHost, dodoApiKey, envMode, payload);
    return jsonResponse(200, result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse(500, { error: "ProxyError", message });
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
