export type PlanCode = 'recovery_pass' | 'pro' | 'super';

export type RegionCode = 'in' | 'cn' | 'jp' | 'eu' | 't1' | 't2' | 't3' | 't4';

export interface DodoPriceConfig {
  tax_inclusive?: boolean;
  discount?: number;
  purchasing_power_parity?: boolean;
  ppp?: boolean;
  pay_what_you_want?: boolean;
  suggested_price?: number | null;
  amount?: number;
}

export interface DodoRawProduct {
  id?: string;
  product_id?: string;
  name?: string;
  description?: string;
  price?: {
    price?: number;
    amount?: number;
    currency?: string;
    type?: string;
  } | number;
  currency?: string;
}

export interface SyncResultItem {
  regionCode?: string;
  planCode: string;
  productId?: string;
  currency?: string;
  amountMinor?: number;
  envMode?: string;
  actionTaken?: string;
  method?: string;
  status: 'SUCCESS' | 'FAILED';
  response?: any;
  error?: string;
}
