export const prerender = false;
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { jsonResponse, handleCorsOptions, isAuthorizedRequest, readJsonObject } from '../../lib/api/apiResponse';
import { resolveDodoHost } from '../../lib/dodo/client';
import {
  fetchProductsCatalog,
  provisionAllRegions,
  syncSingleRegionPrices
} from '../../lib/dodo/syncService';

export const OPTIONS: APIRoute = handleCorsOptions;

export const POST: APIRoute = async ({ request }) => {
  try {
    const GATEWAY_API_KEY = (env as any).GATEWAY_API_KEY || import.meta.env.GATEWAY_API_KEY || '';
    if (!isAuthorizedRequest(request, {}, GATEWAY_API_KEY)) {
      return jsonResponse(401, { error: 'Unauthorized' });
    }

    let payload: any = {};
    try {
      payload = await readJsonObject(request);
    } catch (error) {
      if (error instanceof RangeError) return jsonResponse(413, { error: 'Request body too large' });
      return jsonResponse(400, { error: 'Invalid JSON body' });
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
    if (import.meta.env.DEV && envMode === 'live') {
      return jsonResponse(403, { error: 'Local development requires Dodo test mode and test credentials.' });
    }
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
    console.error('[sync-dodo-prices] Request failed:', err instanceof Error ? err.name : typeof err);
    return jsonResponse(500, { error: 'ProxyError', message: 'Price synchronization failed. Please try again.' });
  }
};
