globalThis.process ??= {};
globalThis.process.env ??= {};
const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS"
};
function jsonResponse(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: CORS_HEADERS
  });
}
const handleCorsOptions = async () => {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS
  });
};
function isAuthorizedRequest(request, _payload, gatewayApiKey, isDev = false) {
  if (isDev) return true;
  if (!gatewayApiKey) return false;
  const headerKey = request.headers.get("x-api-key") || request.headers.get("authorization")?.replace("Bearer ", "");
  if (headerKey && headerKey === gatewayApiKey) return true;
  return false;
}
function resolveDodoHost(apiKey, testMode = false) {
  const isTestKey = apiKey.startsWith("test_") || apiKey.startsWith("sk_test_");
  const isTest = isTestKey || testMode;
  return {
    host: isTest ? "test.dodopayments.com" : "live.dodopayments.com",
    envMode: isTest ? "test" : "live"
  };
}
async function fetchDodoProducts(dodoHost, dodoApiKey) {
  const endpoints = [
    `https://${dodoHost}/products`,
    `https://${dodoHost}/v1/products`
  ];
  for (const url of endpoints) {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${dodoApiKey.trim()}`,
          Accept: "application/json"
        }
      });
      if (response.ok) {
        const body = await response.json();
        if (Array.isArray(body)) return body;
        if (Array.isArray(body.items)) return body.items;
        if (Array.isArray(body.data)) return body.data;
        if (Array.isArray(body.products)) return body.products;
      }
    } catch (err) {
      console.warn(`Fetch error for ${url}:`, err.message);
    }
  }
  return [];
}
async function createDodoProduct(dodoHost, dodoApiKey, name, amountMinor, currencyCode, dodoCfg = {}) {
  let finalCurrency = currencyCode.toUpperCase();
  if (finalCurrency === "JPY" || finalCurrency === "CNY") {
    finalCurrency = "USD";
  }
  const priceObj = {
    type: "one_time_price",
    currency: finalCurrency,
    price: amountMinor,
    discount: Number(dodoCfg.discount || 0),
    purchasing_power_parity: Boolean(dodoCfg.purchasing_power_parity || dodoCfg.ppp || false),
    tax_inclusive: dodoCfg.tax_inclusive ?? true
  };
  if (dodoCfg.pay_what_you_want) {
    priceObj.pay_what_you_want = true;
    if (dodoCfg.suggested_price && Number(dodoCfg.suggested_price) > 0) {
      priceObj.suggested_price = Math.round(Number(dodoCfg.suggested_price) * 100);
    }
  }
  const payload = {
    name,
    tax_category: "digital_products",
    price: priceObj
  };
  const url = `https://${dodoHost}/products`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${dodoApiKey.trim()}`
    },
    body: JSON.stringify(payload)
  });
  const text = await response.text();
  let productId = "";
  try {
    const data = JSON.parse(text);
    productId = data.product_id || data.id || "";
  } catch (_) {
  }
  return { statusCode: response.status, productId, body: text };
}
async function patchDodoProductPrice(dodoHost, dodoApiKey, productId, amountMinor, currencyCode, dodoCfg = {}) {
  let finalCurrency = currencyCode.toUpperCase();
  if (finalCurrency === "JPY" || finalCurrency === "CNY") {
    finalCurrency = "USD";
  }
  const priceObj = {
    type: "one_time_price",
    currency: finalCurrency,
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
      Authorization: `Bearer ${dodoApiKey.trim()}`
    },
    body: payload
  });
  const body = await response.text();
  return { statusCode: response.status, body };
}
export {
  createDodoProduct as c,
  fetchDodoProducts as f,
  handleCorsOptions as h,
  isAuthorizedRequest as i,
  jsonResponse as j,
  patchDodoProductPrice as p,
  resolveDodoHost as r
};
