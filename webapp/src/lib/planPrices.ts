/**
 * Static pricing data extracted from AuthContext.
 * Import this instead of AuthContext when you only need price maps at build time
 * (e.g., in Astro .astro pages) to avoid pulling the entire Firebase SDK into the build graph.
 */

export interface PlanPrices {
  recovery_pass: string;
  pro: string;
  super: string;
}

export interface RegionPricingConfig {
  currency: string;
  symbol: string;
  recoveryPass: number;
  finalPro: number;
  finalSuper: number;
}

// Cleaned up config: Removed hardcoded launch prices entirely
export const REGION_PRICING_CONFIGS: Record<string, RegionPricingConfig> = {
  in: {
    currency: "INR",
    symbol: "₹",
    recoveryPass: 249,
    finalPro: 799,
    finalSuper: 1499
  },
  t3: {
    currency: "USD",
    symbol: "$",
    recoveryPass: 4.99,
    finalPro: 29.00,
    finalSuper: 49.00
  },
  eu: {
    currency: "EUR",
    symbol: "€",
    recoveryPass: 4.99,
    finalPro: 29.00,
    finalSuper: 49.00
  },
  jp: {
    currency: "JPY",
    symbol: "¥",
    recoveryPass: 899,
    finalPro: 5900,
    finalSuper: 9900
  },
  cn: {
    currency: "CNY",
    symbol: "¥",
    recoveryPass: 49,
    finalPro: 199,
    finalSuper: 399
  },
  t1: {
    currency: "USD",
    symbol: "$",
    recoveryPass: 1.99,
    finalPro: 9.99,
    finalSuper: 19.99
  },
  t2: {
    currency: "USD",
    symbol: "$",
    recoveryPass: 3.99,
    finalPro: 19.00,
    finalSuper: 39.00
  },
  t4: {
    currency: "USD",
    symbol: "$",
    recoveryPass: 5.99,
    finalPro: 39.00,
    finalSuper: 69.00
  }
};

// Helper utility to safely format currency
export const formatPrice = (symbol: string, val: number, currency: string): string => {
  return `${symbol}${val.toFixed(2)}`;
};

export const getActivePrice = (tier: string, plan: string, foundingCount: number): number => {
  const config = REGION_PRICING_CONFIGS[tier] || REGION_PRICING_CONFIGS.t3;
  if (plan === 'recovery_pass') return config.recoveryPass;
  
  const isLaunch = foundingCount < 200;
  if (plan === 'pro') {
    return isLaunch ? config.finalPro * 0.85 : config.finalPro; // Dynamic 15% Off
  }
  if (plan === 'super') {
    return isLaunch ? config.finalSuper * 0.90 : config.finalSuper; // Dynamic 10% Off
  }
  return 0;
};

// Fallback initial cache dictionary string mappings
export const PLAN_PRICES: Record<string, PlanPrices> = {
  in: { recovery_pass: "₹249", pro: "₹799", super: "₹1499" },
  t3: { recovery_pass: "$4.99", pro: "$29.00", super: "$49.00" },
  eu: { recovery_pass: "€4.99", pro: "€29.00", super: "€49.00" },
  jp: { recovery_pass: "¥899", pro: "¥5900", super: "¥9900" },
  cn: { recovery_pass: "¥49", pro: "¥199", super: "¥399" },
  t1: { recovery_pass: "$1.99", pro: "$9.99", super: "$19.99" },
  t2: { recovery_pass: "$3.99", pro: "$19.00", super: "$39.00" },
  t4: { recovery_pass: "$5.99", pro: "$39.00", super: "$69.00" },
};

export interface CountryOption {
  code: string;
  name: string;
  tier: string;
}

export const COUNTRIES: CountryOption[] = [
  { code: "IN", name: "India", tier: "in" },
  { code: "PK", name: "Pakistan", tier: "t1" },
  { code: "BD", name: "Bangladesh", tier: "t1" },
  { code: "NP", name: "Nepal", tier: "t1" },
  { code: "LK", name: "Sri Lanka", tier: "t1" },
  { code: "ID", name: "Indonesia", tier: "t1" },
  { code: "VN", name: "Vietnam", tier: "t1" },
  { code: "PH", name: "Philippines", tier: "t1" },
  { code: "NG", name: "Nigeria", tier: "t1" },
  { code: "KE", name: "Kenya", tier: "t1" },
  { code: "EG", name: "Egypt", tier: "t1" },
  { code: "CN", name: "China", tier: "cn" },
  { code: "MY", name: "Malaysia", tier: "t2" },
  { code: "TH", name: "Thailand", tier: "t2" },
  { code: "MX", name: "Mexico", tier: "t2" },
  { code: "BR", name: "Brazil", tier: "t2" },
  { code: "TR", name: "Turkey", tier: "t2" },
  { code: "ZA", name: "South Africa", tier: "t2" },
  { code: "AR", name: "Argentina", tier: "t2" },
  { code: "CL", name: "Chile", tier: "t2" },
  { code: "PL", name: "Poland", tier: "t2" },
  { code: "RO", name: "Romania", tier: "t2" },
  { code: "US", name: "United States", tier: "t3" },
  { code: "GB", name: "United Kingdom", tier: "t3" },
  { code: "DE", name: "Germany", tier: "t3" },
  { code: "FR", name: "France", tier: "t3" },
  { code: "NL", name: "Netherlands", tier: "t3" },
  { code: "BE", name: "Belgium", tier: "t3" },
  { code: "AT", name: "Austria", tier: "t3" },
  { code: "SE", name: "Sweden", tier: "t3" },
  { code: "NO", name: "Norway", tier: "t3" },
  { code: "DK", name: "Denmark", tier: "t3" },
  { code: "FI", name: "Finland", tier: "t3" },
  { code: "IE", name: "Ireland", tier: "t3" },
  { code: "NZ", name: "New Zealand", tier: "t3" },
  { code: "AU", name: "Australia", tier: "t3" },
  { code: "CA", name: "Canada", tier: "t3" },
  { code: "JP", name: "Japan", tier: "jp" },
  { code: "CH", name: "Switzerland", tier: "t3" },
  { code: "LU", name: "Luxembourg", tier: "t3" },
  { code: "IS", name: "Iceland", tier: "t3" },
  { code: "SG", name: "Singapore", tier: "t3" },
  { code: "KR", name: "South Korea", tier: "t3" },
  { code: "HK", name: "Hong Kong", tier: "t3" }
];

export const getRegionFromCountry = (countryCode: string): string => {
  const country = countryCode.toUpperCase();
  
  if (country === 'IN') return 'in';
  if (country === 'CN') return 'cn';
  if (country === 'JP') return 'jp';
  
  const eurozone = [
    'AT', 'BE', 'CY', 'EE', 'FI', 'FR', 'DE', 'GR', 'IE', 'IT', 
    'LV', 'LT', 'LU', 'MT', 'NL', 'PT', 'SK', 'SI', 'ES'
  ];
  if (eurozone.includes(country)) return 'eu';
  
  const t1 = [
    'AF','BD','BF','KH','CM','TD','CD','EG','ET','GH','GT','HN',
    'ID','KE','MA','MM','NP','NG','PK','PH','SN','LK','TZ','UG',
    'VN','ZM','ZW'
  ];
  if (t1.includes(country)) return 't1';

  const t2 = [
    'DZ','AR','BO','BA','BR','BG','CO','CR','DO','EC','SV','GE',
    'IR','IQ','JM','JO','KZ','LY','MY','MX','MD','MN','ME','NA',
    'PY','PE','RO','RS','ZA','TH','TN','TR','UA','VE'
  ];
  if (t2.includes(country)) return 't2';

  const t4 = [
    'AD','BN','KY','KW','LI','MC','SM'
  ];
  if (t4.includes(country)) return 't4';

  return 't3';
};
