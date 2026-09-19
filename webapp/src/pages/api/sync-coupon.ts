export const prerender = false;
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { jsonResponse, handleCorsOptions, isAuthorizedRequest } from '../../lib/api/apiResponse';
import { resolveDodoHost } from '../../lib/dodo/client';

export const OPTIONS: APIRoute = handleCorsOptions;

async function createDiscount(dodoHost: string, dodoApiKey: string, body: any): Promise<{ statusCode: number; body: string }> {
  const res = await fetch(`https://${dodoHost}/discounts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${dodoApiKey.trim()}` },
    body: JSON.stringify(body)
  });
  return { statusCode: res.status, body: await res.text() };
}

async function patchDiscount(dodoHost: string, dodoApiKey: string, discountId: string, body: any): Promise<{ statusCode: number; body: string }> {
  const res = await fetch(`https://${dodoHost}/discounts/${discountId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${dodoApiKey.trim()}` },
    body: JSON.stringify(body)
  });
  return { statusCode: res.status, body: await res.text() };
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const raw = await request.text();
    let payload: any = {};
    try {
      payload = JSON.parse(raw || '{}');
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON body' });
    }

    const GATEWAY_API_KEY = (env as any).GATEWAY_API_KEY || import.meta.env.GATEWAY_API_KEY || '';
    const isDev = Boolean(import.meta.env.DEV || process.env.NODE_ENV === 'development');

    if (!isAuthorizedRequest(request, payload, GATEWAY_API_KEY, isDev)) {
      return jsonResponse(401, { error: 'Unauthorized' });
    }

    const { coupon, targets } = payload;
    if (!coupon || !targets || !Array.isArray(targets)) {
      return jsonResponse(400, { error: 'coupon object and targets array are required.' });
    }

    if (coupon.discountType !== 'PERCENTAGE') {
      return jsonResponse(400, { error: 'Only PERCENTAGE-based discounts are supported by Dodo Payments.' });
    }

    const dodoTestModeVal = (env as any).DODO_TEST_MODE || import.meta.env.DODO_TEST_MODE;
    const testMode = payload.testMode !== undefined
      ? Boolean(payload.testMode)
      : (dodoTestModeVal === 'true' || dodoTestModeVal === true);

    const dodoApiKey = String(payload.dodoApiKey || payload.apiKey || (testMode
      ? ((env as any).DODO_TEST_API_KEY || import.meta.env.DODO_TEST_API_KEY)
      : ((env as any).DODO_API_KEY || import.meta.env.DODO_API_KEY)) || '').trim();

    if (!dodoApiKey) {
      return jsonResponse(400, { error: `Dodo API key not configured (${testMode ? 'DODO_TEST_API_KEY' : 'DODO_API_KEY'}).` });
    }

    const { host: dodoHost } = resolveDodoHost(dodoApiKey, testMode);

    // Retrieve active discounts from Dodo
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
      console.warn('[sync-coupon] Failed to fetch existing Dodo discounts:', e.message);
    }

    const results = [];
    for (const target of targets) {
      const { regionCode, planCode, productId } = target;
      if (!productId) {
        results.push({ regionCode, planCode, status: 'FAILED', error: 'No productId provided for target' });
        continue;
      }

      const existingDiscount = dodoDiscountsList.find((d: any) =>
        String(d.code).toUpperCase() === String(coupon.couponCode).toUpperCase() &&
        (Array.isArray(d.restricted_to) ? d.restricted_to.includes(productId) : d.restricted_to === productId)
      );

      const dodoDiscountId = existingDiscount ? (existingDiscount.id || existingDiscount.discount_id) : null;

      let expiresAt: string | null = null;
      if (coupon.validUntil) {
        const d = new Date(coupon.validUntil);
        if (!isNaN(d.getTime())) expiresAt = d.toISOString();
      }

      const discountPayload = {
        code: coupon.couponCode,
        type: 'percentage',
        amount: Math.round(Number(coupon.discountValue || 0) * 100),
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
        results.push({ regionCode, planCode, productId, status: 'FAILED', error: err.message });
      }
    }

    return jsonResponse(200, { success: true, couponId: coupon.id, results });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse(500, { error: 'ServerError', message });
  }
};