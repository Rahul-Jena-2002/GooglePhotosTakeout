import type { DodoPriceConfig, DodoRawProduct } from './types';

export function resolveDodoHost(apiKey: string, testMode: boolean = false): { host: string; envMode: string } {
  const isTestKey = apiKey.startsWith('test_') || apiKey.startsWith('sk_test_');
  const isTest = isTestKey || testMode;
  return {
    host: isTest ? 'test.dodopayments.com' : 'live.dodopayments.com',
    envMode: isTest ? 'test' : 'live'
  };
}

/**
 * Lists all products from Dodo Payments account.
 */
export async function fetchDodoProducts(dodoHost: string, dodoApiKey: string): Promise<DodoRawProduct[]> {
  const endpoints = [
    `https://${dodoHost}/products`,
    `https://${dodoHost}/v1/products`
  ];

  for (const url of endpoints) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${dodoApiKey.trim()}`,
          Accept: 'application/json'
        }
      });
      if (response.ok) {
        const body: any = await response.json();
        if (Array.isArray(body)) return body;
        if (Array.isArray(body.items)) return body.items;
        if (Array.isArray(body.data)) return body.data;
        if (Array.isArray(body.products)) return body.products;
      }
    } catch (err: any) {
      console.warn(`Fetch error for ${url}:`, err.message);
    }
  }
  return [];
}

/**
 * Creates a new product on Dodo Payments.
 */
export async function createDodoProduct(
  dodoHost: string,
  dodoApiKey: string,
  name: string,
  amountMinor: number,
  currencyCode: string,
  dodoCfg: DodoPriceConfig = {}
): Promise<{ statusCode: number; productId?: string; body: string }> {
  let finalCurrency = currencyCode.toUpperCase();
  if (finalCurrency === 'JPY' || finalCurrency === 'CNY') {
    finalCurrency = 'USD';
  }

  const priceObj: Record<string, any> = {
    type: 'one_time_price',
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
    tax_category: 'digital_products',
    price: priceObj
  };

  const url = `https://${dodoHost}/products`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${dodoApiKey.trim()}`
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  let productId = '';
  try {
    const data = JSON.parse(text);
    productId = data.product_id || data.id || '';
  } catch (_) {}

  return { statusCode: response.status, productId, body: text };
}

/**
 * Updates an existing product's price on Dodo Payments.
 */
export async function patchDodoProductPrice(
  dodoHost: string,
  dodoApiKey: string,
  productId: string,
  amountMinor: number,
  currencyCode: string,
  dodoCfg: DodoPriceConfig = {}
): Promise<{ statusCode: number; body: string }> {
  let finalCurrency = currencyCode.toUpperCase();
  if (finalCurrency === 'JPY' || finalCurrency === 'CNY') {
    finalCurrency = 'USD';
  }

  const priceObj: Record<string, any> = {
    type: 'one_time_price',
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
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${dodoApiKey.trim()}`
    },
    body: payload
  });

  const body = await response.text();
  return { statusCode: response.status, body };
}
