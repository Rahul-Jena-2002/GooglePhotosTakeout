import { REGIONS_CONFIG, PLANS_CONFIG } from './constants';
import type { DodoRawProduct } from './types';

export interface CatalogMappingResult {
  mappedProducts: Record<string, Record<string, string>>;
  mappedProductsFull: Record<string, Record<string, string>>;
  mappedPrices: Record<string, Record<string, any>>;
  unassignedProducts: any[];
}

/**
 * Intelligent catalog parser that maps raw Dodo products to TakeoutFix regions and tiers.
 * Distinguishes between Founding/Active and Full Price variants.
 */
export function mapDodoProductsToTiers(products: DodoRawProduct[]): CatalogMappingResult {
  const mappedProducts: Record<string, Record<string, string>> = {};
  const mappedProductsFull: Record<string, Record<string, string>> = {};
  const mappedPrices: Record<string, Record<string, any>> = {};
  const unassignedProducts: any[] = [];
  const globalPlanProducts: Record<string, { id: string; price: number; currency: string }> = {};

  for (const r of Object.keys(REGIONS_CONFIG)) {
    mappedProducts[r] = {};
    mappedProductsFull[r] = {};
    mappedPrices[r] = {};
  }

  for (const item of products) {
    const pId = item.product_id || item.id;
    if (!pId) continue;

    const rawName = String(item.name || '').trim();
    const lowerName = rawName.toLowerCase();

    // 1. Determine plan
    let matchedPlan = '';
    for (const planDef of PLANS_CONFIG) {
      if (planDef.keywords.some(kw => lowerName.includes(kw))) {
        matchedPlan = planDef.key;
        break;
      }
    }

    // 2. Determine price and currency
    let amount = 0;
    let currency = 'USD';
    if (item.price && typeof item.price === 'object') {
      amount = Number(item.price.price || item.price.amount || 0) / 100;
      currency = String(item.price.currency || 'USD').toUpperCase();
    } else if (typeof item.price === 'number') {
      amount = item.price / 100;
      currency = String(item.currency || 'USD').toUpperCase();
    }

    // 3. Determine region
    let matchedRegion = '';
    for (const [rCode, rDef] of Object.entries(REGIONS_CONFIG)) {
      if (rDef.keywords.some(kw => lowerName.includes(kw))) {
        matchedRegion = rCode;
        break;
      }
    }

    // Fallback: match by currency if region not explicit in name
    if (!matchedRegion) {
      if (currency === 'INR') matchedRegion = 'in';
      else if (currency === 'EUR') matchedRegion = 'eu';
      else if (currency === 'JPY') matchedRegion = 'jp';
      else if (currency === 'CNY') matchedRegion = 'cn';
    }

    const isFullPrice = lowerName.includes('full price') || lowerName.includes('full p') || lowerName.includes('(full');
    const isFounding = lowerName.includes('founding');

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
      // General product without region in name
      globalPlanProducts[matchedPlan] = { id: pId, price: amount, currency };
      unassignedProducts.push({ id: pId, name: rawName, plan: matchedPlan, currency, amount });
    } else {
      unassignedProducts.push({ id: pId, name: rawName, currency, amount });
    }
  }

  // Ensure every region has both active and full populated if either exists
  for (const r of Object.keys(REGIONS_CONFIG)) {
    for (const p of ['recovery_pass', 'pro', 'super']) {
      if (!mappedProducts[r][p] && mappedProductsFull[r][p]) {
        mappedProducts[r][p] = mappedProductsFull[r][p];
      }
      if (!mappedProductsFull[r][p] && mappedProducts[r][p]) {
        mappedProductsFull[r][p] = mappedProducts[r][p];
      }
    }
  }

  // If general products exist, populate any unassigned regions as universal fallback
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
