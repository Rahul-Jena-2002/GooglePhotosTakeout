export type PlanId = '15gb' | '24hour' | 'lifetime';

export interface RegionalPricing {
  currencyCode: string;
  currencySymbol: string;
  prices: Record<PlanId, string>;
}

const BASE_USD_PRICES = {
  '15gb': 1.00,
  '24hour': 2.99,
  'lifetime': 12.99
};

const defaultPricing: RegionalPricing = {
  currencyCode: 'USD',
  currencySymbol: '$',
  prices: {
    '15gb': BASE_USD_PRICES['15gb'].toFixed(2),
    '24hour': BASE_USD_PRICES['24hour'].toFixed(2),
    'lifetime': BASE_USD_PRICES['lifetime'].toFixed(2)
  }
};

const indiaPricing: RegionalPricing = {
  currencyCode: 'INR',
  currencySymbol: '₹',
  prices: {
    '15gb': '100',
    '24hour': '200',
    'lifetime': '1000'
  }
};

/**
 * Fetches the user's country, determines local currency, and fetches real-time exchange rates.
 */
export async function getRegionalPricing(): Promise<RegionalPricing> {
  try {
    // 1. Get Country Code
    const ipRes = await fetch('https://ipinfo.io/json');
    if (!ipRes.ok) throw new Error('IP lookup failed');
    const ipData = await ipRes.json();
    const country = ipData.country;

    if (country === 'IN') return indiaPricing;
    if (country === 'US') return defaultPricing;

    // 2. Map Country to Currency Code
    const countryRes = await fetch(`https://restcountries.com/v3.1/alpha/${country}`);
    if (!countryRes.ok) throw new Error('Country lookup failed');
    const countryData = await countryRes.json();
    
    const currencies = countryData[0]?.currencies;
    if (!currencies) throw new Error('No currency data found');
    
    const currencyCode = Object.keys(currencies)[0];
    const currencySymbol = currencies[currencyCode].symbol || currencyCode;

    if (currencyCode === 'USD') return defaultPricing;
    if (currencyCode === 'INR') return indiaPricing;

    // 3. Fetch Real-Time Exchange Rate from USD
    const rateRes = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    if (!rateRes.ok) throw new Error('Exchange rate fetch failed');
    const rateData = await rateRes.json();
    
    const rate = rateData.rates[currencyCode];
    if (!rate) throw new Error(`No exchange rate found for ${currencyCode}`);

    // 4. Calculate localized dynamic pricing
    return {
      currencyCode,
      currencySymbol,
      prices: {
        '15gb': (BASE_USD_PRICES['15gb'] * rate).toFixed(2),
        '24hour': (BASE_USD_PRICES['24hour'] * rate).toFixed(2),
        'lifetime': (BASE_USD_PRICES['lifetime'] * rate).toFixed(2),
      }
    };

  } catch (error) {
    console.warn("Failed to generate dynamic regional pricing, falling back to USD.", error);
    return defaultPricing;
  }
}
