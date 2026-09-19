export const prerender = false;
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { jsonResponse, handleCorsOptions, isAuthorizedRequest } from '../../lib/api/apiResponse';
import { resolveDodoHost } from '../../lib/dodo/client';
import {
  fetchProductsCatalog,
  provisionAllRegions,
  syncSingleRegionPrices
} from '../../lib/dodo/syncService';

export const OPTIONS: APIRoute = handleCorsOptions;

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

    // Resolve Dodo key & environment
    const dodoTestModeVal = (env as any).DODO_TEST_MODE || import.meta.env.DODO_TEST_MODE;
    const testMode = payload.testMode !== undefined
      ? Boolean(payload.testMode)
      : (dodoTestModeVal === 'true' || dodoTestModeVal === true);

    const dodoApiKey = String(payload.dodoApiKey || payload.apiKey || (testMode
      ? ((env as any).DODO_TEST_API_KEY || import.meta.env.DODO_TEST_API_KEY || (typeof process !== 'undefined' ? process.env.DODO_TEST_API_KEY : undefined))
      : ((env as any).DODO_API_KEY || import.meta.env.DODO_API_KEY || (typeof process !== 'undefined' ? process.env.DODO_API_KEY : undefined))) || '').trim();

    if (!dodoApiKey) {
      return jsonResponse(400, {
        error: `Dodo API key not provided (${testMode ? 'DODO_TEST_API_KEY' : 'DODO_API_KEY'}).`
      });
    }

    const { host: dodoHost, envMode } = resolveDodoHost(dodoApiKey, testMode);
    const action = payload.action || 'sync_region';

    // ── Dispatch to modular syncService ─────────────────────────────
    if (action === 'fetch_products') {
      const result = await fetchProductsCatalog(dodoHost, dodoApiKey, envMode);
      return jsonResponse(200, result);
    }

    if (action === 'provision_all') {
      const result = await provisionAllRegions(dodoHost, dodoApiKey, envMode, payload);
      return jsonResponse(200, result);
    }

    if (!payload.regionCode || !payload.prices || typeof payload.prices !== 'object') {
      return jsonResponse(400, { error: 'regionCode and prices object are required.' });
    }

    const result = await syncSingleRegionPrices(dodoHost, dodoApiKey, envMode, payload);
    return jsonResponse(200, result);

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse(500, { error: 'ProxyError', message });
  }
};