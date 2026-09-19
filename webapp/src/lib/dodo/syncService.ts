import { REGIONS_CONFIG, PLANS_CONFIG } from './constants';
import { fetchDodoProducts, createDodoProduct, patchDodoProductPrice } from './client';
import { mapDodoProductsToTiers } from './mapper';
import { fetchUsdExchangeRates } from '../api/exchangeRates';
import type { SyncResultItem, RegionCode, PlanCode } from './types';

export interface SyncServiceResponse {
  success: boolean;
  [key: string]: any;
}

/**
 * Action 1: Fetch and heuristically map all products currently defined in Dodo account.
 */
export async function fetchProductsCatalog(
  dodoHost: string,
  dodoApiKey: string,
  envMode: string
): Promise<SyncServiceResponse> {
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

/**
 * Action 2: Provision all 8 regional tiers on Dodo (patch existing or create if missing).
 */
export async function provisionAllRegions(
  dodoHost: string,
  dodoApiKey: string,
  envMode: string,
  payload: {
    productIds?: Record<string, Record<string, string>>;
    regionalPrices?: Record<string, any>;
  }
): Promise<SyncServiceResponse> {
  const existingProductIds = payload.productIds || {};
  const regionalPrices = payload.regionalPrices || {};
  const results: SyncResultItem[] = [];
  const updatedProductIds: Record<string, Record<string, string>> = JSON.parse(JSON.stringify(existingProductIds));
  const rates = await fetchUsdExchangeRates();

  for (const [rCode, rDef] of Object.entries(REGIONS_CONFIG)) {
    if (!updatedProductIds[rCode]) updatedProductIds[rCode] = {};
    const regionPrices = regionalPrices[rCode] || { recovery_pass: 4.99, pro: 29.00, super: 49.00 };

    for (const [planCode, rawVal] of Object.entries(regionPrices)) {
      const isObj = rawVal !== null && typeof rawVal === 'object';
      let amount = Number(isObj ? (rawVal as any).amount : rawVal);
      if (!isFinite(amount) || amount <= 0) continue;

      let targetCurrency = rDef.currency;
      if (rCode === 'jp') {
        targetCurrency = 'USD';
        amount = Number((amount / rates.JPY).toFixed(2));
      } else if (rCode === 'cn') {
        targetCurrency = 'USD';
        amount = Number((amount / rates.CNY).toFixed(2));
      }

      const amountMinor = Math.round(amount * 100);
      const dodoCfg = isObj ? rawVal : {};
      const existingId = updatedProductIds[rCode]?.[planCode];

      let isSuccess = false;
      let finalId = existingId;
      let method = 'NONE';

      if (existingId) {
        const patchRes = await patchDodoProductPrice(dodoHost, dodoApiKey, existingId, amountMinor, targetCurrency, dodoCfg);
        if (patchRes.statusCode < 300) {
          isSuccess = true;
          method = 'PATCH';
        }
      }

      if (!isSuccess) {
        const planDef = PLANS_CONFIG.find(p => p.key === planCode);
        const prodName = `TakeoutFix ${planDef ? planDef.name : planCode} — ${rDef.name}`;
        const createRes = await createDodoProduct(dodoHost, dodoApiKey, prodName, amountMinor, targetCurrency, dodoCfg);
        if (createRes.statusCode < 300 && createRes.productId) {
          isSuccess = true;
          finalId = createRes.productId;
          updatedProductIds[rCode][planCode] = createRes.productId;
          method = 'CREATE';
        }
      }

      results.push({
        regionCode: rCode,
        planCode,
        productId: finalId,
        status: isSuccess ? 'SUCCESS' : 'FAILED',
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

/**
 * Action 3: Sync prices for a single region (patch or create if missing).
 */
export async function syncSingleRegionPrices(
  dodoHost: string,
  dodoApiKey: string,
  envMode: string,
  payload: {
    regionCode: string;
    prices: Record<string, any>;
    currency?: string;
    productIds?: Record<string, string>;
  }
): Promise<SyncServiceResponse> {
  const { regionCode, prices, currency, productIds } = payload;
  let currencyCode = String(currency || 'INR').toUpperCase();

  const effectiveProductIds = (productIds && typeof productIds === 'object') ? { ...productIds } : {};
  const updatedProductIds: Record<string, string> = { ...effectiveProductIds };

  let finalPrices = { ...(prices as Record<string, any>) };
  if (regionCode === 'jp' || regionCode === 'cn') {
    currencyCode = 'USD';
    const rates = await fetchUsdExchangeRates();
    const rate = regionCode === 'jp' ? rates.JPY : rates.CNY;
    for (const plan of Object.keys(finalPrices)) {
      const val = finalPrices[plan];
      const amt = val !== null && typeof val === 'object' ? Number(val.amount) : Number(val);
      const conv = Number((amt / rate).toFixed(2));
      finalPrices[plan] = (val !== null && typeof val === 'object') ? { ...val, amount: conv } : conv;
    }
  }

  const results: SyncResultItem[] = [];
  for (const [planCode, priceVal] of Object.entries(finalPrices)) {
    try {
      const isObj = priceVal !== null && typeof priceVal === 'object';
      const rupees = Number(isObj ? priceVal.amount : priceVal);
      if (!isFinite(rupees) || rupees <= 0) continue;

      const amountMinor = Math.round(rupees * 100);
      const dodoCfg = isObj ? priceVal : {};
      const existingId = effectiveProductIds[planCode];

      let isSuccess = false;
      let apiResp: any = null;
      let finalId = existingId;
      let actionTaken = 'NONE';

      if (existingId) {
        apiResp = await patchDodoProductPrice(dodoHost, dodoApiKey, existingId, amountMinor, currencyCode, dodoCfg);
        if (apiResp.statusCode < 300) {
          isSuccess = true;
          actionTaken = 'PATCH';
        }
      }

      // Auto-create product in Dodo if missing or patch 404
      if (!isSuccess) {
        const regConfig = REGIONS_CONFIG[regionCode as RegionCode];
        const planDef = PLANS_CONFIG.find(p => p.key === planCode);
        const regionName = regConfig ? regConfig.name : regionCode.toUpperCase();
        const planName = planDef ? planDef.name : planCode;
        const prodName = `TakeoutFix ${planName} — ${regionName}`;

        const createResp = await createDodoProduct(dodoHost, dodoApiKey, prodName, amountMinor, currencyCode, dodoCfg);
        if (createResp.statusCode < 300 && createResp.productId) {
          isSuccess = true;
          finalId = createResp.productId;
          updatedProductIds[planCode] = createResp.productId;
          actionTaken = 'CREATE';
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
        status: isSuccess ? 'SUCCESS' : 'FAILED',
        response: isSuccess ? null : (apiResp?.body || 'Unknown error')
      });
    } catch (err: any) {
      results.push({ planCode, status: 'FAILED', error: err.message });
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
