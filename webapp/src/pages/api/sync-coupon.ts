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

async function createDiscount(dodoHost: string, dodoApiKey: string, body: any): Promise<{ statusCode: number; body: string }> {
  const res = await fetch(`https://${dodoHost}/discounts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${dodoApiKey}` },
    body: JSON.stringify(body)
  });
  return { statusCode: res.status, body: await res.text() };
}

async function patchDiscount(dodoHost: string, dodoApiKey: string, discountId: string, body: any): Promise<{ statusCode: number; body: string }> {
  const res = await fetch(`https://${dodoHost}/discounts/${discountId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${dodoApiKey}` },
    body: JSON.stringify(body)
  });
  return { statusCode: res.status, body: await res.text() };
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

    const { coupon, targets } = payload;
    if (!coupon || !targets || !Array.isArray(targets)) {
      return json(400, { error: 'coupon object and targets array are required.' });
    }

    if (coupon.discountType !== 'PERCENTAGE') {
      return json(400, { error: 'Only PERCENTAGE-based discounts are supported by Dodo Payments currently.' });
    }

    // Resolve Dodo Keys and Mode directly from Cloudflare environment
    const dodoTestModeVal = (env as any).DODO_TEST_MODE || import.meta.env.DODO_TEST_MODE;
    const dodoTestMode = dodoTestModeVal === 'true' || dodoTestModeVal === true || dodoTestModeVal === undefined; // default to test mode
    
    let dodoApiKey = dodoTestMode 
      ? ((env as any).DODO_TEST_API_KEY || import.meta.env.DODO_TEST_API_KEY)
      : ((env as any).DODO_API_KEY || import.meta.env.DODO_API_KEY);

    if (!dodoApiKey) {
      return json(500, { error: `Dodo API key not configured in Cloudflare environment (${dodoTestMode ? "DODO_TEST_API_KEY" : "DODO_API_KEY"}).` });
    }

    dodoApiKey = dodoApiKey
      .replace(/^sk_test_/, '').replace(/^test_/, '')
      .replace(/^sk_live_/, '').replace(/^live_/, '');

    const dodoHost = dodoTestMode ? "test.dodopayments.com" : "live.dodopayments.com";

    // Retrieve all active discounts from Dodo to check for duplicates
    let dodoDiscountsList: any[] = [];
    try {
      const listRes = await fetch(`https://${dodoHost}/discounts`, {
        headers: { Authorization: `Bearer ${dodoApiKey}` }
      });
      if (listRes.ok) {
        const data = await listRes.json() as any;
        dodoDiscountsList = data.items || data || [];
      }
    } catch (e: any) {
      console.warn("[sync-coupon] Failed to fetch existing Dodo discounts:", e.message);
    }

    const results = [];
    
    for (const target of targets) {
      const { regionCode, planCode, productId } = target;
      if (!productId) {
        results.push({ regionCode, planCode, status: 'FAILED', error: 'No productId provided for target' });
        continue;
      }

      // Check if this coupon code is already registered on Dodo for this product
      const existingDiscount = dodoDiscountsList.find((d: any) => 
        String(d.code).toUpperCase() === String(coupon.couponCode).toUpperCase() &&
        (Array.isArray(d.restricted_to) ? d.restricted_to.includes(productId) : d.restricted_to === productId)
      );

      const dodoDiscountId = existingDiscount ? (existingDiscount.id || existingDiscount.discount_id) : null;

      // Calculate expiry
      let expiresAt: string | null = null;
      if (coupon.validUntil) {
        const d = new Date(coupon.validUntil);
        if (!isNaN(d.getTime())) expiresAt = d.toISOString();
      }

      const discountPayload = {
        code: coupon.couponCode,
        type: 'percentage',
        amount: Math.round(Number(coupon.discountValue || 0) * 100), // basis points (15% -> 1500)
        restricted_to: [productId],
        usage_limit: coupon.usageLimit ? Number(coupon.usageLimit) : null,
        expires_at: expiresAt,
        name: coupon.title || coupon.couponCode,
        metadata: { couponId: coupon.id }
      };

      try {
        let apiResp;
        if (dodoDiscountId) {
          // Update existing
          apiResp = await patchDiscount(dodoHost, dodoApiKey, dodoDiscountId, discountPayload);
        } else {
          // Create new
          apiResp = await createDiscount(dodoHost, dodoApiKey, discountPayload);
        }

        let parsed: any = {};
        try { parsed = JSON.parse(apiResp.body); } catch (_) {}

        const isSuccess = apiResp.statusCode < 300;
        const finalDiscountId = parsed.id || parsed.discount_id || dodoDiscountId || null;

        results.push({
          regionCode,
          planCode,
          productId,
          dodoCouponId: finalDiscountId,
          status: isSuccess ? 'SUCCESS' : 'FAILED',
          response: isSuccess ? parsed : apiResp.body
        });
      } catch (err: any) {
        results.push({
          regionCode,
          planCode,
          productId,
          status: 'FAILED',
          error: err.message
        });
      }
    }

    return json(200, {
      success: true,
      couponId: coupon.id,
      results
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[sync-coupon] Unhandled error:', message);
    return json(500, { error: 'ServerError', message });
  }
};