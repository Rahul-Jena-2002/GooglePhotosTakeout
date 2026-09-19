interface ExchangeRates {
  JPY: number;
  CNY: number;
}

const FALLBACK_RATES: ExchangeRates = { JPY: 150.0, CNY: 7.25 };
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour cache

let cachedRates: ExchangeRates | null = null;
let lastFetchTime = 0;

/**
 * Fetches dynamic USD exchange rates for JPY and CNY with 1-hour in-memory caching.
 */
export async function fetchUsdExchangeRates(): Promise<ExchangeRates> {
  const now = Date.now();
  if (cachedRates && (now - lastFetchTime) < CACHE_TTL_MS) {
    return cachedRates;
  }

  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    if (res.ok) {
      const parsed: any = await res.json();
      if (parsed?.result === 'success' && parsed?.rates) {
        cachedRates = {
          JPY: parsed.rates.JPY ? Number(parsed.rates.JPY) : FALLBACK_RATES.JPY,
          CNY: parsed.rates.CNY ? Number(parsed.rates.CNY) : FALLBACK_RATES.CNY
        };
        lastFetchTime = now;
        return cachedRates;
      }
    }
  } catch (err: any) {
    console.warn('Failed to fetch exchange rates, using fallback:', err.message);
  }

  return cachedRates || FALLBACK_RATES;
}
