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
async function createDiscount(dodoHost, dodoApiKey, body) {
  const res = await fetch(`https://${dodoHost}/discounts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${dodoApiKey}` },
    body: JSON.stringify(body)
  });
  return { statusCode: res.status, body: await res.text() };
}
async function patchDiscount(dodoHost, dodoApiKey, discountId, body) {
  const res = await fetch(`https://${dodoHost}/discounts/${discountId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${dodoApiKey}` },
    body: JSON.stringify(body)
  });
  return { statusCode: res.status, body: await res.text() };
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
    const { coupon, targets } = payload;
    if (!coupon || !targets || !Array.isArray(targets)) {
      return json(400, { error: "coupon object and targets array are required." });
    }
    if (coupon.discountType !== "PERCENTAGE") {
      return json(400, { error: "Only PERCENTAGE-based discounts are supported by Dodo Payments currently." });
    }
    const dodoTestModeVal = env.DODO_TEST_MODE || void 0;
    const dodoTestMode = dodoTestModeVal === "true" || dodoTestModeVal === true || dodoTestModeVal === void 0;
    let dodoApiKey = dodoTestMode ? env.DODO_TEST_API_KEY || void 0 : env.DODO_API_KEY || void 0;
    if (!dodoApiKey) {
      return json(500, { error: `Dodo API key not configured in Cloudflare environment (${dodoTestMode ? "DODO_TEST_API_KEY" : "DODO_API_KEY"}).` });
    }
    dodoApiKey = dodoApiKey.replace(/^sk_test_/, "").replace(/^test_/, "").replace(/^sk_live_/, "").replace(/^live_/, "");
    const dodoHost = dodoTestMode ? "test.dodopayments.com" : "live.dodopayments.com";
    let dodoDiscountsList = [];
    try {
      const listRes = await fetch(`https://${dodoHost}/discounts`, {
        headers: { Authorization: `Bearer ${dodoApiKey}` }
      });
      if (listRes.ok) {
        const data = await listRes.json();
        dodoDiscountsList = data.items || data || [];
      }
    } catch (e) {
      console.warn("[sync-coupon] Failed to fetch existing Dodo discounts:", e.message);
    }
    const results = [];
    for (const target of targets) {
      const { regionCode, planCode, productId } = target;
      if (!productId) {
        results.push({ regionCode, planCode, status: "FAILED", error: "No productId provided for target" });
        continue;
      }
      const existingDiscount = dodoDiscountsList.find(
        (d) => String(d.code).toUpperCase() === String(coupon.couponCode).toUpperCase() && (Array.isArray(d.restricted_to) ? d.restricted_to.includes(productId) : d.restricted_to === productId)
      );
      const dodoDiscountId = existingDiscount ? existingDiscount.id || existingDiscount.discount_id : null;
      let expiresAt = null;
      if (coupon.validUntil) {
        const d = new Date(coupon.validUntil);
        if (!isNaN(d.getTime())) expiresAt = d.toISOString();
      }
      const discountPayload = {
        code: coupon.couponCode,
        type: "percentage",
        amount: Math.round(Number(coupon.discountValue || 0) * 100),
        // basis points (15% -> 1500)
        restricted_to: [productId],
        usage_limit: coupon.usageLimit ? Number(coupon.usageLimit) : null,
        expires_at: expiresAt,
        name: coupon.title || coupon.couponCode,
        metadata: { couponId: coupon.id }
      };
      try {
        let apiResp;
        if (dodoDiscountId) {
          apiResp = await patchDiscount(dodoHost, dodoApiKey, dodoDiscountId, discountPayload);
        } else {
          apiResp = await createDiscount(dodoHost, dodoApiKey, discountPayload);
        }
        let parsed = {};
        try {
          parsed = JSON.parse(apiResp.body);
        } catch (_) {
        }
        const isSuccess = apiResp.statusCode < 300;
        const finalDiscountId = parsed.id || parsed.discount_id || dodoDiscountId || null;
        results.push({
          regionCode,
          planCode,
          productId,
          dodoCouponId: finalDiscountId,
          status: isSuccess ? "SUCCESS" : "FAILED",
          response: isSuccess ? parsed : apiResp.body
        });
      } catch (err) {
        results.push({
          regionCode,
          planCode,
          productId,
          status: "FAILED",
          error: err.message
        });
      }
    }
    return json(200, {
      success: true,
      couponId: coupon.id,
      results
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[sync-coupon] Unhandled error:", message);
    return json(500, { error: "ServerError", message });
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
