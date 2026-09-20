// --- Config Types & Constants ---
export interface GatewayConfig {
  id: string
  label: string
  description: string
  firestorePath: string
  firestoreField: string
  placeholder: string
  sensitive: boolean
}

export const GATEWAY_CREDENTIALS: Record<string, GatewayConfig[]> = {
  dodo: [
    {
      id: "dodo_api_key",
      label: "Dodo Live API Key",
      description: "Live secret API key for Dodo Payments. Used by backend to update products & sync discounts.",
      firestorePath: "settings/system",
      firestoreField: "dodo_api_key",
      placeholder: "Live API Key from Dodo Dashboard",
      sensitive: true,
    },
    {
      id: "dodo_test_api_key",
      label: "Dodo Test API Key",
      description: "Test/sandbox secret API key for Dodo Payments.",
      firestorePath: "settings/system",
      firestoreField: "dodo_test_api_key",
      placeholder: "Test API Key from Dodo Dashboard",
      sensitive: true,
    },
    {
      id: "dodo_webhook_key",
      label: "Dodo Webhook Signing Secret",
      description: "Webhook secret used to verify incoming Dodo payments.",
      firestorePath: "settings/secure",
      firestoreField: "dodo_webhook_key",
      placeholder: "whsec_xxxxxxxxxxxxxxxxxxxx",
      sensitive: true,
    }
  ],
  stripe: [
    {
      id: "stripe_secret_key",
      label: "Stripe Live Secret Key",
      description: "Stripe secret key used server-side to initiate sessions.",
      firestorePath: "settings/system",
      firestoreField: "stripe_secret_key",
      placeholder: "sk_live_51xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      sensitive: true,
    },
    {
      id: "stripe_test_secret_key",
      label: "Stripe Test Secret Key",
      description: "Stripe test key used for sandbox mode testing.",
      firestorePath: "settings/system",
      firestoreField: "stripe_test_secret_key",
      placeholder: "sk_test_51xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      sensitive: true,
    },
    {
      id: "stripe_webhook_secret",
      label: "Stripe Webhook Signing Secret",
      description: "Stripe webhook endpoint signing secret to prevent spoofing.",
      firestorePath: "settings/secure",
      firestoreField: "stripe_webhook_secret",
      placeholder: "whsec_xxxxxxxxxxxxxxxxxxxx",
      sensitive: true,
    }
  ],
  lemonsqueezy: [
    {
      id: "lemonsqueezy_api_key",
      label: "Lemon Squeezy API Key",
      description: "API Key for authentication with Lemon Squeezy API.",
      firestorePath: "settings/system",
      firestoreField: "lemonsqueezy_api_key",
      placeholder: "ls_xxxxxx...",
      sensitive: true,
    },
    {
      id: "lemonsqueezy_webhook_secret",
      label: "Lemon Squeezy Webhook Secret",
      description: "Secret string configured in Lemon Squeezy webhook panel.",
      firestorePath: "settings/secure",
      firestoreField: "lemonsqueezy_webhook_secret",
      placeholder: "your-signing-secret",
      sensitive: true,
    }
  ],
  paddle: [
    {
      id: "paddle_vendor_id",
      label: "Paddle Vendor / Seller ID",
      description: "Public seller ID provided in your Paddle developer settings.",
      firestorePath: "settings/system",
      firestoreField: "paddle_vendor_id",
      placeholder: "12345",
      sensitive: false,
    },
    {
      id: "paddle_api_key",
      label: "Paddle API Key",
      description: "Secret API key generated in vendor dashboard.",
      firestorePath: "settings/system",
      firestoreField: "paddle_api_key",
      placeholder: "paddle_live_xxxx...",
      sensitive: true,
    },
    {
      id: "paddle_webhook_secret",
      label: "Paddle Webhook Secret key",
      description: "Secret key used to verify Paddle webhook signatures.",
      firestorePath: "settings/secure",
      firestoreField: "paddle_webhook_secret",
      placeholder: "p_whsec_xxxx...",
      sensitive: true,
    }
  ]
}

export const DODO_REGIONS = [
  { key: "in", label: "India", currency: "INR" },
  { key: "cn", label: "China", currency: "CNY" },
  { key: "jp", label: "Japan", currency: "JPY" },
  { key: "eu", label: "Europe", currency: "EUR" },
  { key: "t1", label: "Tier 1", currency: "USD" },
  { key: "t2", label: "Tier 2", currency: "USD" },
  { key: "t3", label: "US (Tier 3)", currency: "USD" },
  { key: "t4", label: "Tier 4", currency: "USD" }
]

export const DODO_PLANS = ['recovery_pass', 'pro', 'super'] as const

export const PLAN_LABELS: Record<string, string> = {
  recovery_pass: "Recovery Pass",
  pro: "Pro Lifetime",
  super: "Super Lifetime"
}

export const REGION_DOC_IDS: Record<string, string> = {
  in: "India",
  cn: "China",
  jp: "Japan",
  eu: "Europe",
  t1: "Tier 1",
  t2: "Tier 2",
  t3: "US (Tier 3)",
  t4: "Tier 4"
}

export const COUPON_REGIONS = [
  { key: 'in', label: 'India' }, { key: 't1', label: 'Tier 1' }, { key: 't2', label: 'Tier 2' },
  { key: 't3', label: 'Tier 3' }, { key: 't4', label: 'Tier 4' },
  { key: 'eu', label: 'Europe' }, { key: 'jp', label: 'Japan' }, { key: 'cn', label: 'China' },
]

export const COUPON_PLANS = ['recovery_pass', 'pro', 'super']

import { getApiUrl } from '../../../lib/api/apiUrl'

export function resolveSyncUrl(endpoint: string, _storedUrl?: string): string {
  return getApiUrl(`api/${endpoint}`)
}

