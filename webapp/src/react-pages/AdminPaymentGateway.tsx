import { useState, useEffect, useCallback } from "react"
import { doc, getDoc, setDoc, onSnapshot, collection, addDoc, getDocs, deleteDoc, updateDoc, serverTimestamp, Timestamp, query, where } from "firebase/firestore"
import { db } from "../firebase"
import { useAuth } from "../contexts/AuthContext"
import { useToastStore } from "../store/useToastStore"
import { decrypt, encrypt, deriveKeyFromPassword } from "../lib/crypto"
import {
  CreditCard, Shield, Lock, Save, RefreshCw, Key, AlertTriangle, Check, Info, Settings,
  Eye, EyeOff, Tag, Gift, Plus, Trash2, Sliders, DollarSign, Database, ChevronUp, ChevronDown, ChevronRight, X,
  Calendar, ToggleLeft, ToggleRight, Loader2, Link2, Copy
} from "lucide-react"
import { Input } from "../components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { Button } from "../components/ui/button"

// --- Config Types & Constants ---
interface GatewayConfig {
  id: string
  label: string
  description: string
  firestorePath: string
  firestoreField: string
  placeholder: string
  sensitive: boolean
}

const GATEWAY_CREDENTIALS: Record<string, GatewayConfig[]> = {
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

const DODO_REGIONS = [
  { key: "in", label: "India", currency: "INR" },
  { key: "cn", label: "China", currency: "CNY" },
  { key: "jp", label: "Japan", currency: "JPY" },
  { key: "eu", label: "Europe", currency: "EUR" },
  { key: "t1", label: "Tier 1", currency: "USD" },
  { key: "t2", label: "Tier 2", currency: "USD" },
  { key: "t3", label: "US (Tier 3)", currency: "USD" },
  { key: "t4", label: "Tier 4", currency: "USD" }
]

const DODO_PLANS = ['recovery_pass', 'pro', 'super'] as const
const PLAN_LABELS: Record<string, string> = {
  recovery_pass: "Recovery Pass",
  pro: "Pro Lifetime",
  super: "Super Lifetime"
}

const REGION_DOC_IDS: Record<string, string> = {
  in: "India",
  cn: "China",
  jp: "Japan",
  eu: "Europe",
  t1: "Tier 1",
  t2: "Tier 2",
  t3: "US (Tier 3)",
  t4: "Tier 4"
}

const COUPON_REGIONS = [
  { key: 'in', label: 'India' }, { key: 't1', label: 'Tier 1' }, { key: 't2', label: 'Tier 2' },
  { key: 't3', label: 'Tier 3' }, { key: 't4', label: 'Tier 4' },
  { key: 'eu', label: 'Europe' }, { key: 'jp', label: 'Japan' }, { key: 'cn', label: 'China' },
]
const COUPON_PLANS = ['recovery_pass', 'pro', 'super']

/**
 * Resolves the correct URL for a sync operation.
 * - If no URL configured → throws with guidance to set Cloud Function URL
 * - Strips accidental webhook suffixes the user may have pasted
 * - Cloudflare Pages deployments (pages.dev, takeoutfix.*) → routes to /api/<endpoint>
 * - Everything else → routes to <base>/<endpoint>
 */
function resolveSyncUrl(endpoint: string, storedUrl: string): string {
  // Route through local Astro proxy endpoint in local development
  if (import.meta.env.DEV || window.location.hostname === 'localhost') {
    return `/api/${endpoint}`;
  }
  // In production (Cloudflare Pages), direct-fetch the Cloud Function since it supports CORS
  // and static hosting has no worker backend to execute the proxy.
  let base = (storedUrl || 'https://us-central1-takeout-fix.cloudfunctions.net/geminiToolGateway').replace(/\/$/, '');
  
  // Strip any accidental webhook or pricing sync endpoint suffixes the user may have pasted
  base = base.replace(/\/dodo-webhook$/, '')
             .replace(/\/sync-dodo-prices$/, '')
             .replace(/\/sync-coupon$/, '')
             .replace(/\/$/, '');

  return `${base}/${endpoint}`;
}


export default function AdminPaymentGateway() {
  const { adminData, loading: authLoading } = useAuth()
  const role = adminData?.role ?? "ADMIN"
  const isSuperAdmin = role === "SUPER_ADMIN"
  const isDev = import.meta.env.DEV
  const hasAccess = isDev || isSuperAdmin || role === "ADMIN"

  const [isLight, setIsLight] = useState(false)
  const [activeTab, setActiveTab] = useState<string>("providers")

  // --- MEK Encryption states ---
  const [mek, setMek] = useState<string>("")
  const [mekInput, setMekInput] = useState<string>("")
  const [mekKey, setMekKey] = useState<CryptoKey | null>(null)

  // --- Active gateway selection state ---
  const [activeGateway, setActiveGateway] = useState<string>("dodo")
  const [originalActiveGateway, setOriginalActiveGateway] = useState<string>("dodo")
  const [savingGateway, setSavingGateway] = useState(false)

  // --- Credentials State ---
  const [credentials, setCredentials] = useState<Record<string, string>>({})
  const [decryptedValues, setDecryptedValues] = useState<Record<string, string>>({})
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({})
  const [savingCreds, setSavingCreds] = useState<string | null>(null)
  const [showDodoApiKey, setShowDodoApiKey] = useState(false)

  const toggleVisibility = (id: string) => {
    setVisibleKeys(prev => ({ ...prev, [id]: !prev[id] }))
  }

  // --- Product Maps State ---
  const [dodoProducts, setDodoProducts] = useState<Record<string, Record<string, string>>>({})

  // --- Regional Pricing state ---
  const [pricingTiers, setPricingTiers] = useState<Record<string, any>>({})
  const [selectedConfigTier, setSelectedConfigTier] = useState("in")
  const [currencyCode, setCurrencyCode] = useState("USD")
  const [currencySymbol, setCurrencySymbol] = useState("$")
  const [recoveryPassCurrent, setRecoveryPassCurrent] = useState("4.99")
  const [proLifetimeCurrent, setProLifetimeCurrent] = useState("29.00")
  const [superLifetimeCurrent, setSuperLifetimeCurrent] = useState("49.00")
  const [priceIncludesTax, setPriceIncludesTax] = useState(false)
  const [savingPricing, setSavingPricing] = useState(false)
  const [syncingPrices, setSyncingPrices] = useState(false)
  const [priceSyncResults, setPriceSyncResults] = useState<any[]>([])

  type DodoPlanCfg = { taxInclusive: boolean; discount: number; ppp: boolean; pwyw: boolean; suggestedPrice: string }
  const defaultDodoPlanCfg = (): DodoPlanCfg => ({ taxInclusive: true, discount: 0, ppp: false, pwyw: false, suggestedPrice: '' })
  const [dodoPriceCfg, setDodoPriceCfg] = useState<Record<string, DodoPlanCfg>>({
    recovery_pass: defaultDodoPlanCfg(),
    pro: defaultDodoPlanCfg(),
    super: defaultDodoPlanCfg(),
  })

  // --- Campaign Manager state ---
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [showCampaignForm, setShowCampaignForm] = useState(false)
  const [editingCampaign, setEditingCampaign] = useState<any | null>(null)
  const [savingCampaignNew, setSavingCampaignNew] = useState(false)
  const [campaignForm, setCampaignForm] = useState({
    campaignName: '', description: '', status: 'DRAFT', isEnabled: false,
    expirationType: 'NONE', expirationDateTime: '', maxPurchaseLimit: '',
    isGlobal: true
  })
  const [campaignTargets, setCampaignTargets] = useState<Record<string, boolean>>({}) // key = "regionCode"
  const [campaignDiscounts, setCampaignDiscounts] = useState([
    { planCode: 'recovery_pass', discountType: 'PERCENTAGE', discountValue: 0 },
    { planCode: 'pro', discountType: 'PERCENTAGE', discountValue: 0 },
    { planCode: 'super', discountType: 'PERCENTAGE', discountValue: 0 },
  ])
  const [deletingCampaignId, setDeletingCampaignId] = useState<string | null>(null)
  const [confirmDeleteCampaignId, setConfirmDeleteCampaignId] = useState<string | null>(null)

  // --- Coupon Manager state ---
  const [coupons, setCoupons] = useState<any[]>([])
  const [showCouponForm, setShowCouponForm] = useState(false)
  const [editingCoupon, setEditingCoupon] = useState<any | null>(null)
  const [savingCoupon, setSavingCoupon] = useState(false)
  const [syncingCoupon, setSyncingCoupon] = useState(false)
  const [couponForm, setCouponForm] = useState({
    couponCode: '', title: '', description: '', campaignId: '',
    discountType: 'PERCENTAGE', discountValue: 0, stackable: false,
    active: true, validFrom: '', validUntil: '', usageLimit: ''
  })
  const [couponTargets, setCouponTargets] = useState<Record<string, boolean>>({}) // key = "regionCode_planCode"
  const [syncLog, setSyncLog] = useState<any[]>([])
  const [deletingCouponId, setDeletingCouponId] = useState<string | null>(null)
  const [confirmDeleteCouponId, setConfirmDeleteCouponId] = useState<string | null>(null)

  // System Settings local API gateway key
  const [gatewayApiKey, setGatewayApiKey] = useState("")
  const [cloudFunctionUrl, setCloudFunctionUrl] = useState("")
  const [showWebhookModal, setShowWebhookModal] = useState(false)
  const [savingCfUrl, setSavingCfUrl] = useState(false)
  const [dodoTestMode, setDodoTestMode] = useState(false)
  const [savingTestMode, setSavingTestMode] = useState(false)

  // --- Theme Observer ---
  useEffect(() => {
    const checkTheme = () => {
      setIsLight(document.documentElement.classList.contains("light"))
    }
    checkTheme()
    const observer = new MutationObserver(checkTheme)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    return () => observer.disconnect()
  }, [])

  // --- Restore MEK from sessionStorage ---
  useEffect(() => {
    const restoreMek = async () => {
      const savedMek = sessionStorage.getItem("tf_mek") || "92elPvQ63jp_SXOmGbLyOgvfcGHVP-GfDbbiyLV4rpw"
      if (savedMek) {
        try {
          const salt = new Uint8Array(16)
          const { key } = await deriveKeyFromPassword(savedMek, salt)
          setMekKey(key)
          setMek(savedMek)
        } catch (err) {
          console.error("Failed to restore MEK:", err)
        }
      }
    }
    restoreMek()
  }, [])

  // --- Real-time Listeners (Pricing, Campaigns, Coupons) ---
  useEffect(() => {
    // 1. Pricing Tiers
    const unsubPricing = onSnapshot(collection(db, "pricing_tiers"), (snap) => {
      const tiers: Record<string, any> = {}
      snap.docs.forEach(d => tiers[d.id] = d.data())
      setPricingTiers(tiers)
    })

    // 2. Campaigns
    const unsubCampaigns = onSnapshot(collection(db, "campaigns"), (snap) => {
      setCampaigns(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })

    // 3. Coupons
    const unsubCoupons = onSnapshot(collection(db, "coupons"), (snap) => {
      setCoupons(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })

    // 4. Global Settings (active gateway + maps)
    const unsubGlobal = onSnapshot(doc(db, "settings", "global"), (snap) => {
      if (snap.exists()) {
        const data = snap.data()
        if (data.active_gateway) {
          setActiveGateway(data.active_gateway)
          setOriginalActiveGateway(data.active_gateway)
        }
        const testMode = data.dodo_test_mode ?? false
        setDodoTestMode(testMode)
        const productsMap = testMode
          ? (data.dodo_products_test || {})
          : (data.dodo_products_live || data.dodo_products || {})
        setDodoProducts(productsMap)
      }
    })

    // 5. System secrets (dodo_api_key, gateway_api_key)
    const unsubSystem = onSnapshot(doc(db, "settings", "system"), (snap) => {
      if (snap.exists()) {
        const data = snap.data()
        setGatewayApiKey(data.gateway_api_key || "")
        setCloudFunctionUrl(data.cloud_function_url || "")
        // Populate credentials state
        setCredentials(prev => ({
          ...prev,
          dodo_api_key: data.dodo_api_key || "",
          dodo_test_api_key: data.dodo_test_api_key || "",
          stripe_secret_key: data.stripe_secret_key || "",
          stripe_test_secret_key: data.stripe_test_secret_key || "",
          lemonsqueezy_api_key: data.lemonsqueezy_api_key || "",
          paddle_vendor_id: data.paddle_vendor_id || "",
          paddle_api_key: data.paddle_api_key || "",
        }))
      }
    })

    // 6. Secure secrets (webhook secrets)
    const unsubSecure = onSnapshot(doc(db, "settings", "secure"), (snap) => {
      if (snap.exists()) {
        const data = snap.data()
        setCredentials(prev => ({
          ...prev,
          dodo_webhook_key: data.dodo_webhook_key || "",
          stripe_webhook_secret: data.stripe_webhook_secret || "",
          lemonsqueezy_webhook_secret: data.lemonsqueezy_webhook_secret || "",
          paddle_webhook_secret: data.paddle_webhook_secret || "",
        }))
      }
    })

    return () => {
      unsubPricing()
      unsubCampaigns()
      unsubCoupons()
      unsubGlobal()
      unsubSystem()
      unsubSecure()
    }
  }, [])

  // --- Decrypt dynamic credentials when MEK changes ---
  useEffect(() => {
    const decryptAll = async () => {
      const decMap: Record<string, string> = {}
      for (const [id, value] of Object.entries(credentials)) {
        const def = Object.values(GATEWAY_CREDENTIALS).flat().find(x => x.id === id)
        if (def && def.sensitive && value.startsWith("enc:v1:") && mekKey) {
          try {
            decMap[id] = await decrypt(value, mekKey)
          } catch (e) {
            decMap[id] = ""
          }
        }
      }
      setDecryptedValues(decMap)
    }
    if (mekKey) {
      decryptAll()
    } else {
      setDecryptedValues({})
    }
  }, [credentials, mekKey])

  // --- Fetch selected pricing tier config ---
  useEffect(() => {
    const docId = REGION_DOC_IDS[selectedConfigTier]
    if (!docId || !pricingTiers[docId]) return

    const data = pricingTiers[docId]
    setCurrencyCode(data.currency_code || "USD")
    setCurrencySymbol(data.currency_symbol || "$")
    setPriceIncludesTax(data.price_includes_tax ?? false)
    setRecoveryPassCurrent(String(data.recovery_pass?.current ?? "4.99"))
    setProLifetimeCurrent(String(data.pro_lifetime?.current ?? "29.00"))
    setSuperLifetimeCurrent(String(data.super_lifetime?.current ?? "49.00"))

    setDodoPriceCfg({
      recovery_pass: {
        taxInclusive: data.recovery_pass?.dodo_cfg?.tax_inclusive ?? true,
        discount: data.recovery_pass?.dodo_cfg?.discount ?? 0,
        ppp: data.recovery_pass?.dodo_cfg?.purchasing_power_parity ?? false,
        pwyw: data.recovery_pass?.dodo_cfg?.pay_what_you_want ?? false,
        suggestedPrice: data.recovery_pass?.dodo_cfg?.suggested_price != null ? String(data.recovery_pass.dodo_cfg.suggested_price) : ''
      },
      pro: {
        taxInclusive: data.pro_lifetime?.dodo_cfg?.tax_inclusive ?? true,
        discount: data.pro_lifetime?.dodo_cfg?.discount ?? 0,
        ppp: data.pro_lifetime?.dodo_cfg?.purchasing_power_parity ?? false,
        pwyw: data.pro_lifetime?.dodo_cfg?.pay_what_you_want ?? false,
        suggestedPrice: data.pro_lifetime?.dodo_cfg?.suggested_price != null ? String(data.pro_lifetime.dodo_cfg.suggested_price) : ''
      },
      super: {
        taxInclusive: data.super_lifetime?.dodo_cfg?.tax_inclusive ?? true,
        discount: data.super_lifetime?.dodo_cfg?.discount ?? 0,
        ppp: data.super_lifetime?.dodo_cfg?.purchasing_power_parity ?? false,
        pwyw: data.super_lifetime?.dodo_cfg?.pay_what_you_want ?? false,
        suggestedPrice: data.super_lifetime?.dodo_cfg?.suggested_price != null ? String(data.super_lifetime.dodo_cfg.suggested_price) : ''
      }
    })
  }, [selectedConfigTier, pricingTiers])

  const updatePlanCfg = (plan: string, field: keyof DodoPlanCfg, value: any) =>
    setDodoPriceCfg(prev => ({ ...prev, [plan]: { ...prev[plan], [field]: value } }))

  // --- Timestamp Helpers ---
  const tsToDatetimeLocal = (ts: any): string => {
    if (!ts) return ''
    const d = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts)
    if (isNaN(d.getTime())) return ''
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  // --- MEK Setup handlers ---
  const handleMekSubmit = async () => {
    if (!mekInput.trim()) return
    try {
      const val = mekInput.trim()
      const salt = new Uint8Array(16)
      const { key } = await deriveKeyFromPassword(val, salt)
      setMekKey(key)
      setMek(val)
      sessionStorage.setItem("tf_mek", val)
      setMekInput("")
      useToastStore.getState().addToast("Master Encryption Key verified. Credentials unlocked.", "success")
    } catch (err: any) {
      useToastStore.getState().addToast("Failed to process MEK: " + err.message, "error")
    }
  }

  const handleMekClear = () => {
    setMek("")
    setMekKey(null)
    setMekInput("")
    sessionStorage.removeItem("tf_mek")
    setDecryptedValues({})
    useToastStore.getState().addToast("Session lock applied. Credentials hidden.", "info")
  }

  // --- Credentials Save helpers ---
  const handleSaveActiveGateway = async () => {
    setSavingGateway(true)
    try {
      await setDoc(doc(db, "settings", "global"), {
        active_gateway: activeGateway
      }, { merge: true })
      setOriginalActiveGateway(activeGateway)
      useToastStore.getState().addToast(`Successfully toggled active provider to: ${activeGateway.toUpperCase()}`, "success")
    } catch (err: any) {
      useToastStore.getState().addToast("Failed to update active gateway: " + err.message, "error")
    } finally {
      setSavingGateway(false)
    }
  }

  const handleToggleTestMode = async (enabled: boolean) => {
    setSavingTestMode(true)
    try {
      await setDoc(doc(db, "settings", "global"), {
        dodo_test_mode: enabled
      }, { merge: true })
      setDodoTestMode(enabled)
      useToastStore.getState().addToast(`Dodo Test Mode ${enabled ? 'enabled (sandbox)' : 'disabled (live production)'}!`, "success")
    } catch (err: any) {
      useToastStore.getState().addToast("Failed to toggle test mode: " + err.message, "error")
    } finally {
      setSavingTestMode(false)
    }
  }

  const handleSaveCredential = async (def: GatewayConfig, rawVal: string) => {
    setSavingCreds(def.id)
    try {
      let valToSave = rawVal.trim()
      if (def.sensitive && valToSave) {
        if (!valToSave.startsWith("enc:v1:")) {
          if (mekKey) {
            valToSave = await encrypt(valToSave, mekKey)
          } else {
            const proceed = window.confirm(
              `Warning: No Master Encryption Key (MEK) is set. ${def.label} will be saved as plain text in Firestore. Do you want to proceed?`
            );
            if (!proceed) {
              setSavingCreds(null)
              return
            }
          }
        }
      }
      const paths = def.firestorePath.split("/")
      await setDoc(doc(db, paths[0], paths[1]), {
        [def.firestoreField]: valToSave
      }, { merge: true })
      useToastStore.getState().addToast(`Saved key configuration for ${def.label}`, "success")
    } catch (err: any) {
      useToastStore.getState().addToast("Failed to save credentials: " + err.message, "error")
    } finally {
      setSavingCreds(null)
    }
  }

  const handleSaveCloudFunctionUrl = async () => {
    setSavingCfUrl(true)
    try {
      await setDoc(doc(db, "settings", "system"), {
        cloud_function_url: cloudFunctionUrl.trim()
      }, { merge: true })
      useToastStore.getState().addToast("Cloud Function Base URL updated successfully.", "success")
    } catch (err: any) {
      useToastStore.getState().addToast("Failed to update URL: " + err.message, "error")
    } finally {
      setSavingCfUrl(false)
    }
  }

  // --- Pricing Settings helpers ---
  const handleSaveRegionConfig = async () => {
    const docId = REGION_DOC_IDS[selectedConfigTier]
    if (!docId) return
    setSavingPricing(true)
    try {
      const buildDodoCfg = (plan: string) => ({
        tax_inclusive: dodoPriceCfg[plan]?.taxInclusive ?? true,
        discount: Number(dodoPriceCfg[plan]?.discount ?? 0),
        purchasing_power_parity: dodoPriceCfg[plan]?.ppp ?? false,
        pay_what_you_want: dodoPriceCfg[plan]?.pwyw ?? false,
        suggested_price: dodoPriceCfg[plan]?.suggestedPrice ? Number(dodoPriceCfg[plan].suggestedPrice) : null,
      })

      // 1. Update pricing_tiers Collection
      await setDoc(doc(db, "pricing_tiers", docId), {
        currency_code: currencyCode,
        currency_symbol: currencySymbol,
        price_includes_tax: priceIncludesTax,
        recovery_pass: { current: Number(recoveryPassCurrent), dodo_cfg: buildDodoCfg('recovery_pass') },
        pro_lifetime:   { current: Number(proLifetimeCurrent),  dodo_cfg: buildDodoCfg('pro') },
        super_lifetime: { current: Number(superLifetimeCurrent), dodo_cfg: buildDodoCfg('super') },
      }, { merge: true })

      // 2. Save active products map depending on test mode
      const productField = dodoTestMode ? "dodo_products_test" : "dodo_products_live"
      const updatePayload: any = {
        [productField]: dodoProducts
      }
      if (!dodoTestMode) {
        updatePayload.dodo_products = dodoProducts
      }
      await setDoc(doc(db, "settings", "global"), updatePayload, { merge: true })

      // 3. Log admin activity
      await addDoc(collection(db, "admin_activity"), {
        actorUid: adminData?.uid || "system",
        actorName: adminData?.displayName || "Admin",
        actorRole: role,
        action: "REGION_CONFIG_CHANGE",
        description: `Updated regional config for ${docId}: currency=${currencyCode}, rates=[recov:${recoveryPassCurrent}, pro:${proLifetimeCurrent}, super:${superLifetimeCurrent}].`,
        timestamp: Date.now()
      })

      useToastStore.getState().addToast(`Pricing & Dodo configuration for ${docId} saved successfully.`, "success")
    } catch (err: any) {
      useToastStore.getState().addToast("Failed to save region config: " + err.message, "error")
    } finally {
      setSavingPricing(false)
    }
  }

  const handleSyncPricesToDodo = async () => {
    setSyncingPrices(true)
    setPriceSyncResults([])
    let cfUrl = ''
    try {
      const regionCode = selectedConfigTier
      const prices: Record<string, any> = {
        recovery_pass: { amount: Number(recoveryPassCurrent), tax_inclusive: dodoPriceCfg.recovery_pass.taxInclusive, discount: Number(dodoPriceCfg.recovery_pass.discount), purchasing_power_parity: dodoPriceCfg.recovery_pass.ppp, pay_what_you_want: dodoPriceCfg.recovery_pass.pwyw, suggested_price: dodoPriceCfg.recovery_pass.suggestedPrice ? Number(dodoPriceCfg.recovery_pass.suggestedPrice) : null },
        pro:           { amount: Number(proLifetimeCurrent),  tax_inclusive: dodoPriceCfg.pro.taxInclusive, discount: Number(dodoPriceCfg.pro.discount), purchasing_power_parity: dodoPriceCfg.pro.ppp, pay_what_you_want: dodoPriceCfg.pro.pwyw, suggested_price: dodoPriceCfg.pro.suggestedPrice ? Number(dodoPriceCfg.pro.suggestedPrice) : null },
        super:         { amount: Number(superLifetimeCurrent), tax_inclusive: dodoPriceCfg.super.taxInclusive, discount: Number(dodoPriceCfg.super.discount), purchasing_power_parity: dodoPriceCfg.super.ppp, pay_what_you_want: dodoPriceCfg.super.pwyw, suggested_price: dodoPriceCfg.super.suggestedPrice ? Number(dodoPriceCfg.super.suggestedPrice) : null },
      }
      const currency = currencyCode

      cfUrl = resolveSyncUrl('sync-dodo-prices', cloudFunctionUrl)

      const resp = await fetch(cfUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': gatewayApiKey },
        body: JSON.stringify({ regionCode, prices, currency })
      })
      const text = await resp.text()
      let data: any = {}
      try {
        data = text ? JSON.parse(text) : {}
      } catch (e) {
        throw new Error(`Invalid response from server (Status ${resp.status}): ${text.substring(0, 150)}`)
      }
      if (resp.ok && data.results) {
        setPriceSyncResults(data.results)
        const allOk = data.results.every((r: any) => r.status === 'SUCCESS')
        useToastStore.getState().addToast(
          allOk ? `✅ All prices synced to Dodo for ${regionCode}!` : `⚠️ Partial sync — check results.`,
          allOk ? 'success' : 'error'
        )
      } else {
        useToastStore.getState().addToast(`Sync failed: ${data.error || resp.status} for endpoint ${cfUrl}`, 'error')
      }
    } catch (err: any) {
      useToastStore.getState().addToast(`Price sync error: ${err.message} (endpoint: ${cfUrl})`, 'error')
    } finally {
      setSyncingPrices(false)
    }
  }

  // --- Campaign Manager helpers ---
  const resetCampaignForm = () => {
    setCampaignForm({
      campaignName: '', description: '', status: 'DRAFT', isEnabled: false,
      expirationType: 'NONE', expirationDateTime: '', maxPurchaseLimit: '',
      isGlobal: true
    })
    setCampaignTargets({})
    setCampaignDiscounts([
      { planCode: 'recovery_pass', discountType: 'PERCENTAGE', discountValue: 0 },
      { planCode: 'pro', discountType: 'PERCENTAGE', discountValue: 0 },
      { planCode: 'super', discountType: 'PERCENTAGE', discountValue: 0 },
    ])
    setEditingCampaign(null)
    setShowCampaignForm(false)
  }

  const handleEditCampaign = async (camp: any) => {
    setEditingCampaign(camp)
    setShowCampaignForm(true)
    const isGlobal = camp.isGlobal !== false
    setCampaignForm({
      campaignName: camp.campaignName || '',
      description: camp.description || '',
      status: camp.status || 'DRAFT',
      isEnabled: !!camp.isEnabled,
      expirationType: camp.expirationType || 'NONE',
      expirationDateTime: tsToDatetimeLocal(camp.expirationDateTime),
      maxPurchaseLimit: camp.maxPurchaseLimit != null ? String(camp.maxPurchaseLimit) : '',
      isGlobal: isGlobal
    })

    const initialTargets: Record<string, boolean> = {}
    if (camp.targetRegions && Array.isArray(camp.targetRegions)) {
      camp.targetRegions.forEach((r: string) => {
        initialTargets[r] = true
      })
    }
    setCampaignTargets(initialTargets)

    try {
      const discSnap = await getDocs(collection(db, 'campaigns', camp.id, 'discounts'))
      if (!discSnap.empty) {
        const merged = [
          { planCode: 'recovery_pass', discountType: 'PERCENTAGE', discountValue: 0 },
          { planCode: 'pro', discountType: 'PERCENTAGE', discountValue: 0 },
          { planCode: 'super', discountType: 'PERCENTAGE', discountValue: 0 },
        ]
        discSnap.docs.forEach(d => {
          const m = merged.find(item => item.planCode === d.id)
          if (m) {
            m.discountType = d.data().discountType || 'PERCENTAGE'
            m.discountValue = d.data().discountValue || 0
          }
        })
        setCampaignDiscounts(merged)
      }
    } catch (e) {
      console.error('Failed to load campaign discounts:', e)
    }
  }

  const handleSaveCampaignNew = async () => {
    if (!campaignForm.campaignName.trim()) {
      useToastStore.getState().addToast('Campaign name is required.', 'error')
      return
    }
    setSavingCampaignNew(true)
    try {
      const isActivating = campaignForm.status === 'ACTIVE' && campaignForm.isEnabled
      if (isActivating) {
        const activeCamps = campaigns.filter(c => c.status === 'ACTIVE' && c.isEnabled && c.id !== editingCampaign?.id)
        for (const ac of activeCamps) {
          await updateDoc(doc(db, 'campaigns', ac.id), { status: 'PAUSED', updatedAt: serverTimestamp() })
        }
      }

      const targetRegions = campaignForm.isGlobal
        ? []
        : Object.keys(campaignTargets).filter(k => campaignTargets[k])

      const payload: any = {
        campaignName: campaignForm.campaignName.trim(),
        description: campaignForm.description.trim(),
        status: campaignForm.status,
        isEnabled: campaignForm.isEnabled,
        expirationType: campaignForm.expirationType,
        expirationDateTime: (campaignForm.expirationType === 'TIME_ONLY' || campaignForm.expirationType === 'BOTH') && campaignForm.expirationDateTime
          ? Timestamp.fromDate(new Date(campaignForm.expirationDateTime))
          : null,
        maxPurchaseLimit: (campaignForm.expirationType === 'PURCHASE_LIMIT_ONLY' || campaignForm.expirationType === 'BOTH') && campaignForm.maxPurchaseLimit
          ? Number(campaignForm.maxPurchaseLimit)
          : null,
        isGlobal: campaignForm.isGlobal,
        targetRegions: targetRegions,
        updatedAt: serverTimestamp(),
      }

      let campaignId: string
      if (editingCampaign) {
        await updateDoc(doc(db, 'campaigns', editingCampaign.id), payload)
        campaignId = editingCampaign.id
      } else {
        payload.currentPurchaseCount = 0
        payload.createdAt = serverTimestamp()
        const ref = await addDoc(collection(db, 'campaigns'), payload)
        campaignId = ref.id
      }

      // Save subcollection discounts
      for (const disc of campaignDiscounts) {
        await setDoc(doc(db, 'campaigns', campaignId, 'discounts', disc.planCode), {
          discountType: disc.discountType,
          discountValue: Number(disc.discountValue)
        })
      }

      await addDoc(collection(db, 'admin_activity'), {
        actorUid: adminData?.uid || 'system',
        actorName: adminData?.displayName || 'Admin',
        actorRole: role,
        action: editingCampaign ? 'CAMPAIGN_UPDATE' : 'CAMPAIGN_CREATE',
        description: `${editingCampaign ? 'Updated' : 'Created'} campaign "${payload.campaignName}" status=${payload.status}`,
        timestamp: Date.now()
      })

      useToastStore.getState().addToast(`Campaign ${editingCampaign ? 'updated' : 'created'} successfully.`, 'success')
      resetCampaignForm()
    } catch (err: any) {
      useToastStore.getState().addToast('Failed to save campaign: ' + err.message, 'error')
    } finally {
      setSavingCampaignNew(false)
    }
  }

  const handleDeleteCampaign = async (campaignId: string) => {
    setDeletingCampaignId(campaignId)
    try {
      const discSnap = await getDocs(collection(db, 'campaigns', campaignId, 'discounts'))
      for (const d of discSnap.docs) await deleteDoc(d.ref)
      await deleteDoc(doc(db, 'campaigns', campaignId))
      await addDoc(collection(db, 'admin_activity'), {
        actorUid: adminData?.uid || 'system', actorName: adminData?.displayName || 'Admin',
        actorRole: role, action: 'CAMPAIGN_DELETE',
        description: `Deleted campaign ${campaignId}`, timestamp: Date.now()
      })
      useToastStore.getState().addToast('Campaign deleted.', 'success')
    } catch (err: any) {
      useToastStore.getState().addToast('Failed to delete campaign: ' + err.message, 'error')
    } finally {
      setDeletingCampaignId(null)
      setConfirmDeleteCampaignId(null)
    }
  }

  const handleToggleCampaignEnabled = async (camp: any) => {
    try {
      const newEnabled = !camp.isEnabled
      if (newEnabled && camp.status === 'ACTIVE') {
        const activeCamps = campaigns.filter(c => c.status === 'ACTIVE' && c.isEnabled && c.id !== camp.id)
        for (const ac of activeCamps) {
          await updateDoc(doc(db, 'campaigns', ac.id), { status: 'PAUSED', updatedAt: serverTimestamp() })
        }
      }
      await updateDoc(doc(db, 'campaigns', camp.id), { isEnabled: newEnabled, updatedAt: serverTimestamp() })
    } catch (err: any) {
      useToastStore.getState().addToast('Failed to toggle campaign: ' + err.message, 'error')
    }
  }

  // --- Coupon Manager helpers ---
  const resetCouponForm = () => {
    setCouponForm({ couponCode: '', title: '', description: '', campaignId: '', discountType: 'PERCENTAGE', discountValue: 0, stackable: false, active: true, validFrom: '', validUntil: '', usageLimit: '' })
    setCouponTargets({})
    setSyncLog([])
    setEditingCoupon(null)
    setShowCouponForm(false)
  }

  const buildAutoTargets = (): Record<string, boolean> => {
    const targets: Record<string, boolean> = {}
    COUPON_REGIONS.forEach(r => {
      COUPON_PLANS.forEach(plan => {
        if (dodoProducts[r.key]?.[plan]) {
          targets[`${r.key}_${plan}`] = true
        }
      })
    })
    return targets
  }

  const handleEditCoupon = async (coup: any) => {
    setEditingCoupon(coup)
    setShowCouponForm(true)
    setCouponForm({
      couponCode: coup.couponCode || '',
      title: coup.title || '',
      description: coup.description || '',
      campaignId: coup.campaignId || '',
      discountType: coup.discountType || 'PERCENTAGE',
      discountValue: coup.discountValue || 0,
      stackable: !!coup.stackable,
      active: !!coup.active,
      validFrom: tsToDatetimeLocal(coup.validFrom),
      validUntil: tsToDatetimeLocal(coup.validUntil),
      usageLimit: coup.usageLimit != null ? String(coup.usageLimit) : '',
    })

    try {
      const targSnap = await getDocs(collection(db, 'coupons', coup.id, 'targets'))
      const newTargets: Record<string, boolean> = {}
      targSnap.docs.forEach(d => {
        const data = d.data()
        if (data.regionCode && data.planCode) newTargets[`${data.regionCode}_${data.planCode}`] = true
      })
      setCouponTargets(newTargets)
    } catch (e) { console.error('Failed to load targets:', e) }

    try {
      const logSnap = await getDocs(collection(db, 'coupons', coup.id, 'sync_log'))
      setSyncLog(logSnap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (e) { console.error('Failed to load sync log:', e) }
  }

  const syncPricingAndDodoForRegion = async (regionCode: string) => {
    try {
      const docId = REGION_DOC_IDS[regionCode]
      if (!docId) return
      
      const docSnap = await getDoc(doc(db, "pricing_tiers", docId))
      if (!docSnap.exists()) return
      const tierData = docSnap.data()
      
      const prices = {
        recovery_pass: {
          amount: Number(tierData.recovery_pass?.current || 0),
          tax_inclusive: tierData.recovery_pass?.dodo_cfg?.tax_inclusive ?? true,
          discount: Number(tierData.recovery_pass?.dodo_cfg?.discount ?? 0),
          purchasing_power_parity: tierData.recovery_pass?.dodo_cfg?.purchasing_power_parity ?? false,
          pay_what_you_want: tierData.recovery_pass?.dodo_cfg?.pay_what_you_want ?? false,
          suggested_price: tierData.recovery_pass?.dodo_cfg?.suggested_price ? Number(tierData.recovery_pass.dodo_cfg.suggested_price) : null
        },
        pro: {
          amount: Number(tierData.pro_lifetime?.current || 0),
          tax_inclusive: tierData.pro_lifetime?.dodo_cfg?.tax_inclusive ?? true,
          discount: Number(tierData.pro_lifetime?.dodo_cfg?.discount ?? 0),
          purchasing_power_parity: tierData.pro_lifetime?.dodo_cfg?.purchasing_power_parity ?? false,
          pay_what_you_want: tierData.pro_lifetime?.dodo_cfg?.pay_what_you_want ?? false,
          suggested_price: tierData.pro_lifetime?.dodo_cfg?.suggested_price ? Number(tierData.pro_lifetime.dodo_cfg.suggested_price) : null
        },
        super: {
          amount: Number(tierData.super_lifetime?.current || 0),
          tax_inclusive: tierData.super_lifetime?.dodo_cfg?.tax_inclusive ?? true,
          discount: Number(tierData.super_lifetime?.dodo_cfg?.discount ?? 0),
          purchasing_power_parity: tierData.super_lifetime?.dodo_cfg?.purchasing_power_parity ?? false,
          pay_what_you_want: tierData.super_lifetime?.dodo_cfg?.pay_what_you_want ?? false,
          suggested_price: tierData.super_lifetime?.dodo_cfg?.suggested_price ? Number(tierData.super_lifetime.dodo_cfg.suggested_price) : null
        }
      }

      const currency = tierData.currency_code || 'USD'
      const cfUrl = resolveSyncUrl('sync-dodo-prices', cloudFunctionUrl)

      const resp = await fetch(cfUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': gatewayApiKey },
        body: JSON.stringify({ regionCode, prices, currency })
      })
      if (!resp.ok) {
        console.warn(`Auto Dodo price sync failed for region ${regionCode}:`, resp.statusText)
      }
    } catch (e) {
      console.error(`Auto Dodo sync error for region ${regionCode}:`, e)
    }
  }

  const autoSyncCouponCampaignAndPricing = async (targetCampaignId: string | null) => {
    try {
      // 1. Get all coupons
      const couponsSnap = await getDocs(collection(db, 'coupons'))
      const allCoupons = couponsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any))
      const activeCoupons = allCoupons.filter(c => c.active === true)

      // 2. Auto-update Campaign Manager discounts if campaign is linked
      if (targetCampaignId) {
        const campaignCoupons = activeCoupons.filter(c => c.campaignId === targetCampaignId)
        
        // Group discounts by planCode
        const planDiscounts: Record<string, number> = { recovery_pass: 0, pro: 0, super: 0 }
        
        for (const coup of campaignCoupons) {
          const targetsSnap = await getDocs(collection(db, 'coupons', coup.id, 'targets'))
          targetsSnap.docs.forEach(t => {
            const td = t.data()
            if (td.planCode) {
              planDiscounts[td.planCode] = Math.max(planDiscounts[td.planCode], Number(coup.discountValue || 0))
            }
          })
        }

        // Write the discounts back to the campaign subcollection
        for (const planCode of ['recovery_pass', 'pro', 'super']) {
          await setDoc(doc(db, 'campaigns', targetCampaignId, 'discounts', planCode), {
            discountType: 'PERCENTAGE',
            discountValue: planDiscounts[planCode]
          }, { merge: true })
        }
      }

      // 3. Auto-update Regional Pricing discounts in Firestore and auto-sync Dodo Payments
      const regionPlanDiscounts: Record<string, Record<string, number>> = {}
      
      // Initialize discounts for all known regions to 0
      Object.keys(REGION_DOC_IDS).forEach(rCode => {
        regionPlanDiscounts[rCode] = { recovery_pass: 0, pro: 0, super: 0 }
      })

      // Find targets of all active coupons
      for (const coup of activeCoupons) {
        const targetsSnap = await getDocs(collection(db, 'coupons', coup.id, 'targets'))
        targetsSnap.docs.forEach(t => {
          const td = t.data()
          if (td.regionCode && td.planCode) {
            if (!regionPlanDiscounts[td.regionCode]) {
              regionPlanDiscounts[td.regionCode] = { recovery_pass: 0, pro: 0, super: 0 }
            }
            regionPlanDiscounts[td.regionCode][td.planCode] = Math.max(
              regionPlanDiscounts[td.regionCode][td.planCode] || 0,
              Number(coup.discountValue || 0)
            )
          }
        })
      }

      // Update and sync each region
      const syncPromises = Object.keys(regionPlanDiscounts).map(async (rCode) => {
        const docId = REGION_DOC_IDS[rCode]
        if (!docId) return

        const discounts = regionPlanDiscounts[rCode]
        
        // Update Firestore pricing_tiers
        await setDoc(doc(db, "pricing_tiers", docId), {
          recovery_pass: { dodo_cfg: { discount: discounts.recovery_pass } },
          pro_lifetime: { dodo_cfg: { discount: discounts.pro } },
          super_lifetime: { dodo_cfg: { discount: discounts.super } }
        }, { merge: true })

        // Trigger Dodo sync for this region
        await syncPricingAndDodoForRegion(rCode)
      })

      await Promise.all(syncPromises)
    } catch (e) {
      console.error('autoSyncCouponCampaignAndPricing failed:', e)
    }
  }

  const handleSaveCoupon = async () => {
    if (!couponForm.couponCode.trim()) {
      useToastStore.getState().addToast('Coupon code is required.', 'error')
      return
    }
    setSavingCoupon(true)
    try {
      const payload: any = {
        couponCode: couponForm.couponCode.trim().toUpperCase(),
        title: couponForm.title.trim(),
        description: couponForm.description.trim(),
        campaignId: couponForm.campaignId || null,
        discountType: couponForm.discountType,
        discountValue: Number(couponForm.discountValue),
        stackable: couponForm.stackable,
        active: couponForm.active,
        validFrom: (!couponForm.campaignId && couponForm.validFrom) ? Timestamp.fromDate(new Date(couponForm.validFrom)) : null,
        validUntil: (!couponForm.campaignId && couponForm.validUntil) ? Timestamp.fromDate(new Date(couponForm.validUntil)) : null,
        usageLimit: (!couponForm.campaignId && couponForm.usageLimit) ? Number(couponForm.usageLimit) : null,
        updatedAt: serverTimestamp(),
      }
      
      const oldCampaignId = editingCoupon?.campaignId || null
      const newCampaignId = payload.campaignId || null

      let couponId: string
      if (editingCoupon) {
        await updateDoc(doc(db, 'coupons', editingCoupon.id), payload)
        couponId = editingCoupon.id
      } else {
        payload.usedCount = 0
        payload.createdAt = serverTimestamp()
        const ref = await addDoc(collection(db, 'coupons'), payload)
        couponId = ref.id
      }

      const existingTargSnap = await getDocs(collection(db, 'coupons', couponId, 'targets'))
      for (const d of existingTargSnap.docs) await deleteDoc(d.ref)
      for (const key of Object.keys(couponTargets)) {
        if (!couponTargets[key]) continue
        const sepIdx = key.indexOf('_')
        if (sepIdx === -1) continue
        const regionCode = key.slice(0, sepIdx)
        const planCode = key.slice(sepIdx + 1)
        await addDoc(collection(db, 'coupons', couponId, 'targets'), { regionCode, planCode })
      }

      await addDoc(collection(db, 'admin_activity'), {
        actorUid: adminData?.uid || 'system', actorName: adminData?.displayName || 'Admin',
        actorRole: role, action: editingCoupon ? 'COUPON_UPDATE' : 'COUPON_CREATE',
        description: `${editingCoupon ? 'Updated' : 'Created'} coupon "${payload.couponCode}"`, timestamp: Date.now()
      })

      // Run auto-sync updates for campaigns and regional pricing
      if (oldCampaignId) await autoSyncCouponCampaignAndPricing(oldCampaignId)
      if (newCampaignId && newCampaignId !== oldCampaignId) await autoSyncCouponCampaignAndPricing(newCampaignId)
      if (!oldCampaignId && !newCampaignId) await autoSyncCouponCampaignAndPricing(null)

      useToastStore.getState().addToast(`Coupon ${editingCoupon ? 'updated' : 'created'} and synced successfully.`, 'success')
      resetCouponForm()
    } catch (err: any) {
      useToastStore.getState().addToast('Failed to save coupon: ' + err.message, 'error')
    } finally {
      setSavingCoupon(false)
    }
  }

  const handleDeleteCoupon = async (couponId: string) => {
    setDeletingCouponId(couponId)
    try {
      const couponDoc = await getDoc(doc(db, 'coupons', couponId))
      const campaignId = couponDoc.exists() ? couponDoc.data()?.campaignId : null

      const targSnap = await getDocs(collection(db, 'coupons', couponId, 'targets'))
      for (const d of targSnap.docs) await deleteDoc(d.ref)
      const logSnap = await getDocs(collection(db, 'coupons', couponId, 'sync_log'))
      for (const d of logSnap.docs) await deleteDoc(d.ref)
      await deleteDoc(doc(db, 'coupons', couponId))
      await addDoc(collection(db, 'admin_activity'), {
        actorUid: adminData?.uid || 'system', actorName: adminData?.displayName || 'Admin',
        actorRole: role, action: 'COUPON_DELETE',
        description: `Deleted coupon ${couponId}`, timestamp: Date.now()
      })

      // Perform auto-sync to Campaigns & Regional Pricing
      await autoSyncCouponCampaignAndPricing(campaignId || null)

      useToastStore.getState().addToast('Coupon deleted and synced successfully.', 'success')
    } catch (err: any) {
      useToastStore.getState().addToast('Failed to delete coupon: ' + err.message, 'error')
    } finally {
      setDeletingCouponId(null)
      setConfirmDeleteCouponId(null)
    }
  }

  const handleToggleCouponActive = async (coup: any) => {
    try {
      const newActive = !coup.active
      await updateDoc(doc(db, 'coupons', coup.id), { active: newActive, updatedAt: serverTimestamp() })
      
      // Perform auto-sync to Campaigns & Regional Pricing
      await autoSyncCouponCampaignAndPricing(coup.campaignId || null)
      
      useToastStore.getState().addToast(`Coupon toggled successfully.`, 'success')
    } catch (err: any) {
      useToastStore.getState().addToast('Failed to toggle coupon: ' + err.message, 'error')
    }
  }

  const handleSyncCoupon = async (couponId: string) => {
    setSyncingCoupon(true)
    try {
      const cfUrl = resolveSyncUrl('sync-coupon', cloudFunctionUrl)

      const productIdsPayload: Record<string, Record<string, string>> = {}
      DODO_REGIONS.forEach(r => {
        const rp = dodoProducts[r.key] || {}
        if (rp.recovery_pass || rp.pro || rp.super) {
          productIdsPayload[r.key] = {
            recovery_pass: rp.recovery_pass || '',
            pro: rp.pro || '',
            super: rp.super || ''
          }
        }
      })

      const resp = await fetch(cfUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': gatewayApiKey
        },
        body: JSON.stringify({ couponId, productIds: productIdsPayload })
      })
      const text = await resp.text()
      let result: any = {}
      try {
        result = text ? JSON.parse(text) : {}
      } catch (e) {
        throw new Error(`Invalid response from server (Status ${resp.status}): ${text.substring(0, 150)}`)
      }
      const logSnap = await getDocs(collection(db, 'coupons', couponId, 'sync_log'))
      setSyncLog(logSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      if (resp.ok) {
        useToastStore.getState().addToast('Sync completed successfully.', 'success')
      } else {
        useToastStore.getState().addToast('Sync failed: ' + (result.error || resp.status), 'error')
      }
    } catch (err: any) {
      useToastStore.getState().addToast('Sync error: ' + err.message, 'error')
    } finally {
      setSyncingCoupon(false)
    }
  }

  if (authLoading && !isDev) {
    return (
      <div className="flex items-center gap-3 text-zinc-500 py-12 justify-center">
        <div className="w-4 h-4 border-2 border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
        Verifying permissions...
      </div>
    )
  }

  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center space-y-4">
        <Shield className="w-12 h-12 text-red-500" />
        <h2 className="text-xl font-bold text-white">Access Denied</h2>
        <p className="text-zinc-400 text-sm max-w-sm">
          You do not have the required permissions to view this page. Super Admin access only.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto px-4 py-8 font-sans transition-all duration-300 w-full min-w-0" style={{ color: isLight ? '#1f2937' : '#f3f4f6' }}>
      
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6" style={{ borderColor: isLight ? '#e5e7eb' : '#27272a' }}>
        <div>
          <h1 className="text-3xl font-black tracking-tight" style={{ color: isLight ? '#111827' : '#ffffff' }}>
            Universal Payment Gateway
          </h1>
          <p className="text-sm mt-1" style={{ color: isLight ? '#6b7280' : '#a1a1aa' }}>
            Manage merchant integrations, localized regional pricing tiers, promotions, campaigns, and dynamic coupons.
          </p>
        </div>
        
        <div className="flex items-center gap-2.5 px-4 py-2 rounded-xl border text-xs font-semibold"
             style={{
               backgroundColor: isLight ? '#f3f4f6' : '#1e1b4b',
               borderColor: isLight ? '#e5e7eb' : '#312e81',
               color: isLight ? '#374151' : '#c7d2fe'
             }}>
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          Active Gateway: <strong className="uppercase">{originalActiveGateway}</strong>
        </div>
      </div>

      {/* ── MEK Input Banner ── */}
      <div className="p-5 rounded-2xl border transition-all"
           style={{
             backgroundColor: isLight ? '#fffbeb' : '#1c1917',
             borderColor: isLight ? '#fde68a' : '#44403c'
           }}>
        {!mek ? (
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
            <div className="flex gap-3">
              <Lock className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold" style={{ color: isLight ? '#92400e' : '#f59e0b' }}>
                  Credentials Locked (No Session Key)
                </h4>
                <p className="text-xs mt-0.5" style={{ color: isLight ? '#b45309' : '#d6d3d1' }}>
                  Enter your 32-byte hex MEK to decrypt and edit sensitive keys. Secrets will not be readable otherwise.
                </p>
              </div>
            </div>
            
            <div className="flex gap-2">
              <input
                type="password"
                placeholder="Enter 32-byte hex key..."
                className="px-3.5 py-1.5 rounded-lg border text-xs font-mono w-full sm:w-64 focus:outline-none"
                style={{
                  backgroundColor: isLight ? '#ffffff' : '#09090b',
                  borderColor: isLight ? '#d1d5db' : '#27272a',
                  color: isLight ? '#1f2937' : '#f3f4f6'
                }}
                value={mekInput}
                onChange={(e) => setMekInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleMekSubmit()}
              />
              <button
                onClick={handleMekSubmit}
                className="px-4 py-1.5 rounded-lg text-xs font-bold text-black bg-amber-500 hover:bg-amber-400 transition-colors"
              >
                Unlock
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between items-stretch sm:items-start">
            <div className="flex gap-3">
              <Check className="w-5 h-5 text-emerald-500 flex-shrink-0" />
              <div>
                <h4 className="text-sm font-bold text-emerald-500">
                  Credentials Decrypted & Unlocked
                </h4>
                <p className="text-xs mt-0.5" style={{ color: isLight ? '#78350f' : '#a8a29e' }}>
                  Active session key is active. Saving sensitive inputs will encrypt them dynamically.
                </p>
              </div>
            </div>
            <button
              onClick={handleMekClear}
              className="w-full sm:w-auto px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-red-600 hover:bg-red-500 transition-colors text-center"
            >
              Lock Session
            </button>
          </div>
        )}
      </div>

      {/* ── Navigation Tabs ── */}
      {/* Mobile Select Tab Selector (Scrollable pills row) */}
      <div className="md:hidden mb-6 overflow-x-auto whitespace-nowrap scrollbar-none pb-2 border-b" style={{ borderColor: isLight ? '#e5e7eb' : '#27272a' }}>
        <div className="flex gap-2">
          {[
            { id: "providers", label: "Credentials" },
            { id: "pricing", label: "Regional Pricing" },
            { id: "campaigns", label: "Campaigns" },
            { id: "coupons", label: "Coupons" }
          ].map((t) => {
            const isActive = activeTab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className="px-3.5 py-1.5 rounded-full text-xs font-bold transition-all border"
                style={{
                  backgroundColor: isActive ? '#6366f1' : (isLight ? '#ffffff' : '#18181b'),
                  borderColor: isActive ? '#6366f1' : (isLight ? '#d1d5db' : '#27272a'),
                  color: isActive ? '#ffffff' : (isLight ? '#4b5563' : '#a1a1aa')
                }}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Desktop/Tablet Tab Bar */}
      <div className="hidden md:flex border-b overflow-x-auto whitespace-nowrap scrollbar-none mb-6" style={{ borderColor: isLight ? '#e5e7eb' : '#27272a' }}>
        {[
          { id: "providers", label: "Gateway Credentials", icon: Key },
          { id: "pricing", label: "Regional Pricing & Sync", icon: DollarSign },
          { id: "campaigns", label: "Campaign Manager", icon: Tag },
          { id: "coupons", label: "Coupon Manager", icon: Gift }
        ].map((t) => {
          const Icon = t.icon
          const isActive = activeTab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className="flex items-center gap-2 px-6 py-3 border-b-2 text-xs font-bold transition-all"
              style={{
                borderColor: isActive ? '#6366f1' : 'transparent',
                color: isActive ? (isLight ? '#4f46e5' : '#a5b4fc') : (isLight ? '#6b7280' : '#9a9a9e')
              }}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* ── TAB CONTENT ── */}
      <div className="space-y-6">

        {/* 1. PROVIDERS & CREDENTIALS TAB */}
        {activeTab === "providers" && (
          <div className="grid lg:grid-cols-3 gap-8 w-full min-w-0">
            <div className="lg:col-span-2 space-y-8 w-full min-w-0">
              
              {/* Selector */}
              <div className="p-4 sm:p-6 rounded-2xl border w-full min-w-0" style={{ backgroundColor: isLight ? '#ffffff' : '#09090b', borderColor: isLight ? '#e5e7eb' : '#27272a' }}>
                <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: isLight ? '#111827' : '#ffffff' }}>
                  <Settings className="w-5 h-5 text-indigo-500" />
                  Gateway Provider Selection
                </h2>
                <p className="text-xs mt-1 mb-6" style={{ color: isLight ? '#6b7280' : '#a1a1aa' }}>
                  Choose which merchant interface acts as the live payment gate on checkout.
                </p>

                <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-end">
                  <div className="flex-1 w-full">
                    <label className="text-xs font-bold block mb-2" style={{ color: isLight ? '#4b5563' : '#d1d5db' }}>
                      Select Provider
                    </label>
                    <select
                      value={activeGateway}
                      onChange={(e) => setActiveGateway(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      style={{
                        backgroundColor: isLight ? '#ffffff' : '#18181b',
                        borderColor: isLight ? '#d1d5db' : '#27272a',
                        color: isLight ? '#1f2937' : '#f3f4f6'
                      }}
                    >
                      <option value="dodo">Dodo Payments (Merchant of Record - Default)</option>
                      <option value="stripe">Stripe (Direct Checkout Sessions)</option>
                      <option value="lemonsqueezy">Lemon Squeezy (Merchant of Record)</option>
                      <option value="paddle">Paddle (Merchant of Record)</option>
                    </select>
                  </div>

                  <button
                    disabled={savingGateway || activeGateway === originalActiveGateway}
                    onClick={handleSaveActiveGateway}
                    className="w-full sm:w-auto h-10 px-5 rounded-lg text-xs font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
                    style={{
                      backgroundColor: isLight ? '#111827' : '#ffffff',
                      color: isLight ? '#ffffff' : '#000000'
                    }}
                  >
                    {savingGateway ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Activate {activeGateway.toUpperCase()}
                  </button>
                </div>

                {activeGateway === "dodo" && (
                  <div className="w-full pt-4 mt-4 border-t flex justify-between items-center" style={{ borderColor: isLight ? '#f3f4f6' : '#27272a' }}>
                    <div>
                      <label className="text-xs font-bold block" style={{ color: isLight ? '#4b5563' : '#d1d5db' }}>
                        Dodo Sandbox / Test Mode
                      </label>
                      <span className="text-[10px] block mt-0.5" style={{ color: isLight ? '#6b7280' : '#a1a1aa' }}>
                        Toggle between live payment processing and test sandbox environment.
                      </span>
                    </div>
                    <button
                      disabled={savingTestMode}
                      onClick={() => handleToggleTestMode(!dodoTestMode)}
                      className="flex items-center gap-1.5 focus:outline-none transition-colors hover:opacity-85"
                      style={{ color: dodoTestMode ? '#10b981' : (isLight ? '#6b7280' : '#a1a1aa') }}
                    >
                      {dodoTestMode ? (
                        <ToggleRight className="w-9 h-9" />
                      ) : (
                        <ToggleLeft className="w-9 h-9 text-gray-400" />
                      )}
                      <span className="text-xs font-bold min-w-12 select-none">
                        {dodoTestMode ? "Active (Test)" : "Inactive (Live)"}
                      </span>
                    </button>
                  </div>
                )}
              </div>

              {/* Credentials Fields */}
              <div className="p-4 sm:p-6 rounded-2xl border w-full min-w-0" style={{ backgroundColor: isLight ? '#ffffff' : '#09090b', borderColor: isLight ? '#e5e7eb' : '#27272a' }}>
                <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: isLight ? '#111827' : '#ffffff' }}>
                  <Key className="w-5 h-5 text-indigo-500" />
                  API Credentials for <span className="uppercase">{activeGateway}</span>
                </h2>
                <p className="text-xs mt-1 mb-6" style={{ color: isLight ? '#6b7280' : '#a1a1aa' }}>
                  Configure keys and signature validators required for transaction initialization.
                </p>

                <div className="space-y-6">
                  {(GATEWAY_CREDENTIALS[activeGateway] || []).map((def) => {
                    const encryptedVal = credentials[def.id] || ""
                    const isEncrypted = def.sensitive && encryptedVal.startsWith("enc:v1:")
                    const decryptedVal = decryptedValues[def.id] || ""
                    let displayVal = def.sensitive
                      ? (isEncrypted ? (mekKey ? decryptedVal : "") : encryptedVal)
                      : encryptedVal
                    return (
                      <div key={def.id} className="p-3 sm:p-4 rounded-xl border space-y-3 w-full min-w-0" style={{ borderColor: isLight ? '#f3f4f6' : '#1c1c1e' }}>
                        <div className="flex justify-between items-start w-full min-w-0 gap-2">
                          <div className="min-w-0 flex-1">
                            <label className="text-xs font-extrabold block truncate" style={{ color: isLight ? '#111827' : '#f3f4f6' }}>
                              {def.label}
                            </label>
                            <span className="text-[10px] block mt-0.5" style={{ color: isLight ? '#6b7280' : '#9a9a9e' }}>
                              {def.description}
                            </span>
                          </div>
                          {isEncrypted && (
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full border shrink-0"
                                  style={{
                                    backgroundColor: mekKey ? '#10b98115' : '#ef444415',
                                    borderColor: mekKey ? '#10b98130' : '#ef444430',
                                    color: mekKey ? '#10b981' : '#ef4444'
                                  }}>
                              {mekKey ? "🔓 Decrypted" : "🔒 Encrypted"}
                            </span>
                          )}
                        </div>

                        <div className="flex gap-2 w-full min-w-0">
                          <div className="relative flex-1 min-w-0">
                            <div className="flex items-center rounded-lg border focus-within:ring-1 focus-within:ring-indigo-500 focus-within:border-indigo-500 transition-all overflow-hidden h-9 w-full min-w-0"
                              style={{
                                backgroundColor: isLight ? '#f9fafb' : '#09090b',
                                borderColor: isLight ? '#d1d5db' : '#27272a',
                              }}
                            >
                              <input
                                type={def.sensitive && !visibleKeys[def.id] ? "password" : "text"}
                                disabled={isEncrypted && !mekKey}
                                placeholder={isEncrypted && !mekKey 
                                  ? "🔒 Locked — Enter MEK in banner above to decrypt" 
                                  : def.placeholder}
                                value={displayVal}
                                onChange={(e) => {
                                  setCredentials(prev => ({ ...prev, [def.id]: e.target.value }))
                                }}
                                className="w-full min-w-0 flex-grow h-full px-3 border-none bg-transparent text-xs font-mono focus:outline-none disabled:opacity-60"
                                style={{
                                  color: isLight ? '#1f2937' : '#f3f4f6'
                                }}
                              />
                            </div>
                            {def.sensitive && (!(isEncrypted && !mekKey)) && (
                              <button
                                type="button"
                                onClick={() => toggleVisibility(def.id)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 hover:opacity-80 z-10"
                              >
                                {visibleKeys[def.id] ? <EyeOff className="w-4 h-4 text-zinc-500" /> : <Eye className="w-4 h-4 text-zinc-500" />}
                              </button>
                            )}
                          </div>

                          <button
                            disabled={savingCreds === def.id || (isEncrypted && !mekKey)}
                            onClick={() => handleSaveCredential(def, displayVal)}
                            className="h-9 px-4 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-500 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                          >
                            {savingCreds === def.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                            Save
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Mappings Summary Grid */}
            <div className="space-y-8 w-full min-w-0">
              <div className="p-4 sm:p-6 rounded-2xl border bg-zinc-950/40 border-zinc-800 w-full min-w-0" style={{ backgroundColor: isLight ? '#ffffff' : '#09090b', borderColor: isLight ? '#e5e7eb' : '#27272a' }}>
                <h2 className="text-sm font-bold flex items-center gap-2 mb-3" style={{ color: isLight ? '#111827' : '#ffffff' }}>
                  <Info className="w-4 h-4 text-indigo-400" /> Webhook Endpoints Setup
                </h2>
                
                {/* Cloud Function URL Editor */}
                <div className="mb-4 p-3.5 bg-zinc-900/10 border border-zinc-850 rounded-xl space-y-2">
                  <div className="font-extrabold text-[10px] uppercase tracking-wider text-zinc-500">Cloud Function Base URL</div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={cloudFunctionUrl}
                      onChange={(e) => setCloudFunctionUrl(e.target.value)}
                      placeholder="https://us-central1-your-project.cloudfunctions.net/geminiToolGateway"
                      className="flex-1 w-full min-w-0 px-3 py-1.5 text-xs rounded-xl bg-zinc-900/50 border border-zinc-800 focus:outline-none focus:border-indigo-500 font-mono text-[10px]"
                      style={{
                        backgroundColor: isLight ? "#f9fafb" : "#09090b",
                        borderColor: isLight ? "#e5e7eb" : "#27272a",
                        color: isLight ? "#111827" : "#ffffff",
                      }}
                    />
                    <button
                      onClick={handleSaveCloudFunctionUrl}
                      disabled={savingCfUrl}
                      className="px-3 py-1.5 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 transition-all text-[10px] uppercase tracking-wider"
                    >
                      {savingCfUrl ? "Saving..." : "Save"}
                    </button>
                  </div>
                  <div className="text-[10px] text-zinc-550 leading-relaxed">
                    Set your deployed gateway URL to automatically generate your active webhook endpoints below.
                  </div>
                </div>

                <div className="font-extrabold text-[10px] uppercase tracking-wider text-zinc-550 mb-2">Target Webhook Endpoints</div>
                <button
                  onClick={() => setShowWebhookModal(true)}
                  className="w-full py-3 px-4 rounded-xl border border-zinc-800 hover:border-zinc-700 bg-zinc-900/10 hover:bg-zinc-900/20 text-zinc-200 hover:text-white flex items-center justify-between text-xs font-bold transition-all group"
                  style={{ borderColor: isLight ? '#e5e7eb' : '#27272a', color: isLight ? '#4b5563' : '#e4e4e7' }}
                >
                  <span className="flex items-center gap-2">
                    <Link2 className="w-4.5 h-4.5 text-indigo-400" /> Setup & View Webhook URLs
                  </span>
                  <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 2. REGIONAL PRICING & SYNC TAB */}
        {activeTab === "pricing" && (
          <Card className="bg-zinc-900/10 border-zinc-800 shadow-none md:col-span-2" style={{ borderColor: isLight ? '#e5e7eb' : '#27272a' }}>
            <CardHeader className="border-b" style={{ borderColor: isLight ? '#e5e7eb' : '#27272a' }}>
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-zinc-200" style={{ color: isLight ? '#1f2937' : '#ffffff' }}>
                <DollarSign className="w-4 h-4 text-emerald-400" /> Dynamic Regional Pricing Configurator
              </CardTitle>
              <CardDescription className="text-zinc-500 text-xs font-medium">
                Adjust standard pricing values, tax configurations, and sync Dodo Payment catalog identifiers by region tier.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              
              {/* Horizontal Tabs for Region Selection */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1.5">Select Configuration Region</label>
                <div className="flex flex-wrap gap-2 mb-4">
                  {DODO_REGIONS.map(r => (
                    <button
                      type="button"
                      key={r.key}
                      onClick={() => setSelectedConfigTier(r.key)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${
                        selectedConfigTier === r.key
                          ? 'bg-indigo-600 border-indigo-500 text-white'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-650'
                      }`}
                      style={selectedConfigTier === r.key ? {} : {
                        backgroundColor: isLight ? '#ffffff' : '#0e0e11',
                        borderColor: isLight ? '#d1d5db' : '#27272a',
                        color: isLight ? '#4b5563' : '#a1a1aa'
                      }}
                    >
                      {r.currency} {r.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Currency Code & Currency Symbol & Webhook secret key */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-b pb-6" style={{ borderColor: isLight ? '#e5e7eb' : '#27272a' }}>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">Currency Code</label>
                    <Input 
                      type="text" 
                      value={currencyCode} 
                      onChange={(e) => setCurrencyCode(e.target.value.toUpperCase())}
                      placeholder="USD"
                      className="bg-zinc-955 border-zinc-800 text-zinc-100 text-xs h-9 font-mono" 
                      style={{
                        backgroundColor: isLight ? '#ffffff' : '#0a0a0c',
                        borderColor: isLight ? '#d1d5db' : '#27272a',
                        color: isLight ? '#1f2937' : '#f3f4f6'
                      }}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">Currency Symbol</label>
                    <Input 
                      type="text" 
                      value={currencySymbol} 
                      onChange={(e) => setCurrencySymbol(e.target.value)}
                      placeholder="$"
                      className="bg-zinc-955 border-zinc-800 text-zinc-100 text-xs h-9 font-mono" 
                      style={{
                        backgroundColor: isLight ? '#ffffff' : '#0a0a0c',
                        borderColor: isLight ? '#d1d5db' : '#27272a',
                        color: isLight ? '#1f2937' : '#f3f4f6'
                      }}
                    />
                  </div>
                </div>

                <div className="flex flex-col justify-center">
                  {/* Tax inclusion toggle */}
                  <button
                    type="button"
                    onClick={() => setPriceIncludesTax(v => !v)}
                    className="flex items-center gap-2 self-start mt-2 group"
                  >
                    <span className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                      priceIncludesTax ? 'bg-emerald-500' : 'bg-zinc-750'
                    }`}>
                      <span className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                        priceIncludesTax ? 'translate-x-3' : 'translate-x-0'
                      }`} />
                    </span>
                    <span className="text-[10px] font-bold" style={{ color: priceIncludesTax ? '#10b981' : '#6b7280' }}>
                      {priceIncludesTax ? 'Prices include tax (GST/VAT)' : 'Prices exclude tax'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Pricing Config + Product IDs Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {(['recovery_pass', 'pro', 'super'] as const).map((planKey) => {
                  const label = PLAN_LABELS[planKey]
                  const rateVal = planKey === 'recovery_pass' ? recoveryPassCurrent : planKey === 'pro' ? proLifetimeCurrent : superLifetimeCurrent
                  const setRate = planKey === 'recovery_pass' ? setRecoveryPassCurrent : planKey === 'pro' ? setProLifetimeCurrent : setSuperLifetimeCurrent
                  const cfg = dodoPriceCfg[planKey] || defaultDodoPlanCfg()

                  return (
                    <div key={planKey} className="p-4 border rounded-xl space-y-3" style={{ borderColor: isLight ? '#e5e7eb' : '#27272a', backgroundColor: isLight ? '#f9fafb' : '#0e0e11' }}>
                      <div className="text-xs font-bold border-b pb-2" style={{ color: isLight ? '#1f2937' : '#ffffff', borderColor: isLight ? '#e5e7eb' : '#1f1f23' }}>
                        {label}
                      </div>

                      {/* Standard Rate */}
                      <div>
                        <label className="text-[9px] font-bold uppercase tracking-wider text-zinc-550 block mb-1">Standard Rate</label>
                        <div className="relative flex items-center">
                          <span className="text-zinc-550 absolute left-3 text-xs">{currencySymbol}</span>
                          <Input type="number" step="any" value={rateVal} onChange={e => setRate(e.target.value)}
                            className="bg-zinc-950 border-zinc-800 text-zinc-100 text-xs pl-6 h-9" 
                            style={{
                              backgroundColor: isLight ? '#ffffff' : '#050507',
                              borderColor: isLight ? '#d1d5db' : '#27272a',
                              color: isLight ? '#1f2937' : '#f3f4f6'
                            }}
                          />
                        </div>
                      </div>

                      {/* Dodo Product ID */}
                      <div>
                        <label className="text-[9px] font-bold uppercase tracking-wider text-zinc-550 block mb-1">Dodo Product ID</label>
                        <Input type="text" value={dodoProducts[selectedConfigTier]?.[planKey] || ''}
                          onChange={e => {
                            const val = e.target.value;
                            setDodoProducts(prev => ({
                              ...prev,
                              [selectedConfigTier]: { ...prev[selectedConfigTier], [planKey]: val }
                            }))
                          }}
                          placeholder="pdt_..." 
                          className="bg-zinc-950 border-zinc-800 text-zinc-100 text-xs h-9 font-mono" 
                          style={{
                            backgroundColor: isLight ? '#ffffff' : '#050507',
                            borderColor: isLight ? '#d1d5db' : '#27272a',
                            color: isLight ? '#1f2937' : '#f3f4f6'
                          }}
                        />
                      </div>

                      {/* Dodo Configuration Toggles */}
                      <div className="pt-2 border-t space-y-2" style={{ borderColor: isLight ? '#e5e7eb' : '#1f1f23' }}>
                        <div className="text-[9px] font-extrabold uppercase tracking-wider text-zinc-550">Gateway Details (Dodo)</div>

                        {/* Tax Inclusive */}
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-zinc-505">Tax Inclusive</span>
                          <button type="button" onClick={() => updatePlanCfg(planKey, 'taxInclusive', !cfg.taxInclusive)}
                            className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${cfg.taxInclusive ? 'bg-emerald-500' : 'bg-zinc-700'}`}>
                            <span className={`pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow transform transition-transform ${cfg.taxInclusive ? 'translate-x-3' : 'translate-x-0'}`} />
                          </button>
                        </div>

                        {/* Discount */}
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] text-zinc-505">Discount %</span>
                          <div className="relative w-16">
                            <Input type="number" min="0" step="1" value={String(cfg.discount)}
                              onChange={e => updatePlanCfg(planKey, 'discount', Number(e.target.value))}
                              className="bg-zinc-950 border-zinc-800 text-zinc-100 text-[10px] h-6 pr-4 text-right" 
                              style={{
                                backgroundColor: isLight ? '#ffffff' : '#050507',
                                borderColor: isLight ? '#d1d5db' : '#27272a',
                                color: isLight ? '#1f2937' : '#f3f4f6'
                              }}
                            />
                            <span className="absolute right-1 text-[9px] text-zinc-500 top-1.5">%</span>
                          </div>
                        </div>

                        {/* Purchasing Power Parity */}
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-zinc-505">PPP Pricing</span>
                          <button type="button" onClick={() => updatePlanCfg(planKey, 'ppp', !cfg.ppp)}
                            className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${cfg.ppp ? 'bg-indigo-500' : 'bg-zinc-700'}`}>
                            <span className={`pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow transform transition-transform ${cfg.ppp ? 'translate-x-3' : 'translate-x-0'}`} />
                          </button>
                        </div>

                        {/* Pay What You Want */}
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-zinc-550">PWYW Mode</span>
                          <button type="button" onClick={() => updatePlanCfg(planKey, 'pwyw', !cfg.pwyw)}
                            className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${cfg.pwyw ? 'bg-purple-500' : 'bg-zinc-700'}`}>
                            <span className={`pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow transform transition-transform ${cfg.pwyw ? 'translate-x-3' : 'translate-x-0'}`} />
                          </button>
                        </div>

                        {/* PWYW Suggested Price */}
                        {cfg.pwyw && (
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] text-zinc-550">Suggested</span>
                            <div className="relative w-16">
                              <span className="absolute left-1 top-1 text-[9px] text-zinc-500">{currencySymbol}</span>
                              <Input type="number" min="0" step="any" value={cfg.suggestedPrice}
                                onChange={e => updatePlanCfg(planKey, 'suggestedPrice', e.target.value)}
                                className="bg-zinc-950 border-zinc-800 text-zinc-100 text-[10px] h-6 pl-4" 
                                style={{
                                  backgroundColor: isLight ? '#ffffff' : '#050507',
                                  borderColor: isLight ? '#d1d5db' : '#27272a',
                                  color: isLight ? '#1f2937' : '#f3f4f6'
                                }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Overview grid */}
              <div className="p-4 rounded-xl border" style={{ borderColor: isLight ? '#e5e7eb' : '#27272a', backgroundColor: isLight ? '#f9fafb' : '#050507' }}>
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-550 mb-3">Gateway Mapping Summary</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-[10px]">
                  {DODO_REGIONS.map(r => {
                    const filled = DODO_PLANS.filter(p => dodoProducts[r.key]?.[p]).length
                    return (
                      <div key={r.key} className="space-y-0.5">
                        <div className={`font-bold ${
                          filled === 3 ? 'text-emerald-500' : filled > 0 ? 'text-amber-500' : 'text-zinc-500'
                        }`}>
                          {r.currency} {r.label} {filled === 3 ? '✓' : filled > 0 ? `(${filled}/3)` : '—'}
                        </div>
                        {DODO_PLANS.map(p => (
                          <div key={p} className="text-zinc-500 truncate">
                            {dodoProducts[r.key]?.[p] ? `${dodoProducts[r.key][p].substring(0, 15)}…` : `${PLAN_LABELS[p]}: empty`}
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-6 border-t flex items-center justify-between flex-wrap gap-4" style={{ borderColor: isLight ? '#e5e7eb' : '#27272a' }}>
                <div className="flex gap-2">
                  {priceSyncResults.map((r) => (
                    <span key={r.planCode} className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded border ${
                      r.status === 'SUCCESS'
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-red-500/10 border-red-500/30 text-red-400'
                    }`}>
                      {r.status === 'SUCCESS' ? '✓' : '✗'}
                      {r.planCode === 'recovery_pass' ? 'Recovery' : r.planCode === 'pro' ? 'Pro' : 'Super'}
                    </span>
                  ))}
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={handleSyncPricesToDodo}
                    disabled={syncingPrices || savingPricing}
                    className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white px-4 h-9 text-xs font-semibold rounded-lg flex items-center gap-1.5"
                  >
                    {syncingPrices ? <><span className="animate-spin inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full"></span> Syncing...</> : <>🔄 Sync Prices → Dodo</>}
                  </Button>
                  <Button 
                    type="button"
                    onClick={handleSaveRegionConfig} 
                    disabled={savingPricing}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-5 h-9 text-xs font-semibold rounded-lg"
                  >
                    {savingPricing ? "Saving..." : "Save Region Config"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 3. CAMPAIGN MANAGER TAB */}
        {activeTab === "campaigns" && (
          <Card className="bg-zinc-900/10 border-zinc-800 shadow-none md:col-span-2" style={{ borderColor: isLight ? '#e5e7eb' : '#27272a' }}>
            <CardHeader className="border-b" style={{ borderColor: isLight ? '#e5e7eb' : '#27272a' }}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-sm font-bold flex items-center gap-2 text-zinc-200" style={{ color: isLight ? '#1f2937' : '#ffffff' }}>
                    <Tag className="w-4 h-4 text-purple-400" /> Active Promotional Campaigns
                  </CardTitle>
                  <CardDescription className="text-zinc-500 text-xs">
                    Create campaigns linked to Firebase Checkout. Only one campaign can be ACTIVE and enabled at any time.
                  </CardDescription>
                </div>
                {!showCampaignForm && (
                  <Button
                    onClick={() => { resetCampaignForm(); setShowCampaignForm(true) }}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 h-9 text-xs font-bold rounded-lg flex items-center justify-center gap-1 w-full sm:w-auto"
                  >
                    <Plus className="w-4 h-4" /> New Campaign
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-6">

              {/* Form panel */}
              {showCampaignForm && (
                <div className="p-5 border rounded-2xl mb-6 space-y-4" style={{ borderColor: isLight ? '#e5e7eb' : '#27272a', backgroundColor: isLight ? '#f9fafb' : '#050507' }}>
                  <div className="flex justify-between items-center border-b pb-3 mb-2" style={{ borderColor: isLight ? '#e5e7eb' : '#1f1f23' }}>
                    <h3 className="text-sm font-bold">{editingCampaign ? "Edit Campaign details" : "Create New Campaign"}</h3>
                    <button onClick={resetCampaignForm} className="text-zinc-500 hover:text-zinc-300">
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">Campaign Name</label>
                      <Input
                        value={campaignForm.campaignName}
                        onChange={e => setCampaignForm(prev => ({ ...prev, campaignName: e.target.value }))}
                        className="h-9 text-xs"
                        style={{ backgroundColor: isLight ? '#ffffff' : '#0f0f12', color: isLight ? '#1f2937' : '#f3f4f6' }}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">Description</label>
                      <Input
                        value={campaignForm.description}
                        onChange={e => setCampaignForm(prev => ({ ...prev, description: e.target.value }))}
                        className="h-9 text-xs"
                        style={{ backgroundColor: isLight ? '#ffffff' : '#0f0f12', color: isLight ? '#1f2937' : '#f3f4f6' }}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">Status</label>
                      <select
                        value={campaignForm.status}
                        onChange={e => setCampaignForm(prev => ({ ...prev, status: e.target.value }))}
                        className="w-full h-9 border rounded-lg text-xs px-2.5"
                        style={{ backgroundColor: isLight ? '#ffffff' : '#0f0f12', color: isLight ? '#1f2937' : '#f3f4f6' }}
                      >
                        <option value="DRAFT">DRAFT</option>
                        <option value="ACTIVE">ACTIVE (One Active at a time)</option>
                        <option value="PAUSED">PAUSED</option>
                        <option value="EXPIRED">EXPIRED</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2 pt-5">
                      <button
                        type="button"
                        onClick={() => setCampaignForm(prev => ({ ...prev, isGlobal: !prev.isGlobal }))}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ${
                          campaignForm.isGlobal ? 'bg-indigo-500/20 border border-indigo-500/30' : 'bg-zinc-700/30 border border-zinc-800'
                        }`}
                      >
                        <span className={`pointer-events-none absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-all duration-200 ${
                          campaignForm.isGlobal ? 'left-6' : 'left-1'
                        }`} />
                      </button>
                      <span className="text-xs font-semibold text-zinc-405">Global Campaign (Applies to all regions)</span>
                    </div>
                    <div className="flex items-center gap-2 pt-5">
                      <button
                        type="button"
                        onClick={() => setCampaignForm(prev => ({ ...prev, isEnabled: !prev.isEnabled }))}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ${
                          campaignForm.isEnabled ? 'bg-emerald-500/20 border border-emerald-500/30' : 'bg-rose-500/20 border border-rose-500/30'
                        }`}
                      >
                        <span className={`pointer-events-none absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-all duration-200 ${
                          campaignForm.isEnabled ? 'left-6' : 'left-1'
                        }`} />
                      </button>
                      <span className="text-xs font-semibold text-zinc-405">Enable and show in portal checks</span>
                    </div>
                  </div>

                  {!campaignForm.isGlobal && (
                    <div className="pt-4 border-t" style={{ borderColor: isLight ? '#e5e7eb' : '#1f1f23' }}>
                      <h4 className="text-xs font-bold text-zinc-400 mb-3">Target Regions (Check to enable)</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        {COUPON_REGIONS.map((region) => {
                          const isChecked = !!campaignTargets[region.key]
                          return (
                            <label key={region.key} className="flex items-center gap-1.5 cursor-pointer select-none p-3 border rounded-xl" style={{ borderColor: isLight ? '#e5e7eb' : '#1e1e22', backgroundColor: isLight ? '#ffffff' : '#0a0a0d' }}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  const checked = e.target.checked
                                  setCampaignTargets(prev => ({ ...prev, [region.key]: checked }))
                                }}
                                className="w-3.5 h-3.5 rounded text-indigo-600"
                              />
                              <span className="text-[10px] font-semibold text-zinc-400 capitalize">{region.label}</span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Dynamic Campaign Discounts Mapping */}
                  <div className="pt-4 border-t" style={{ borderColor: isLight ? '#e5e7eb' : '#1f1f23' }}>
                    <h4 className="text-xs font-bold text-zinc-400 mb-3">Configure Campaign Plan Discounts %</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {campaignDiscounts.map((disc, idx) => (
                        <div key={disc.planCode} className="p-3 border rounded-xl" style={{ borderColor: isLight ? '#e5e7eb' : '#1f1f23', backgroundColor: isLight ? '#ffffff' : '#0b0b0e' }}>
                          <div className="text-[10px] font-extrabold text-zinc-500 uppercase mb-2">{PLAN_LABELS[disc.planCode]}</div>
                          <div className="relative">
                            <Input
                              type="number"
                              min="0"
                              value={disc.discountValue}
                              onChange={e => {
                                const copy = [...campaignDiscounts]
                                copy[idx].discountValue = Number(e.target.value)
                                setCampaignDiscounts(copy)
                              }}
                              className="h-8 text-xs font-mono pr-5 text-right"
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-zinc-500">%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-4 border-t" style={{ borderColor: isLight ? '#e5e7eb' : '#1f1f23' }}>
                    <Button onClick={resetCampaignForm} variant="outline" className="h-8 text-xs font-bold">
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSaveCampaignNew}
                      disabled={savingCampaignNew}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 h-8 text-xs font-bold rounded-lg"
                    >
                      {savingCampaignNew ? "Saving..." : "Save Campaign"}
                    </Button>
                  </div>
                </div>
              )}

              {/* Campaigns list */}
              {campaigns.length === 0 && !showCampaignForm && (
                <div className="text-center py-8 text-zinc-500 text-xs">No active promotional campaigns yet.</div>
              )}

              {!showCampaignForm && (
                <div className="grid md:grid-cols-2 gap-4">
                  {campaigns.map((camp) => {
                    const statusColors: Record<string, string> = {
                      DRAFT: 'bg-zinc-700/40 text-zinc-400 border-zinc-700/40',
                      ACTIVE: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
                      PAUSED: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                      EXPIRED: 'bg-red-500/10 text-red-400 border-red-500/20',
                    }
                    return (
                      <div key={camp.id} className="p-4 border rounded-2xl flex flex-col justify-between" style={{ borderColor: isLight ? '#e5e7eb' : '#1e1e21', backgroundColor: isLight ? '#ffffff' : '#0a0a0c' }}>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${statusColors[camp.status] || 'bg-zinc-800'}`}>
                              {camp.status}
                            </span>
                            <button
                              onClick={() => handleToggleCampaignEnabled(camp)}
                              className="text-zinc-550 hover:text-indigo-400 text-xs flex items-center gap-1.5"
                            >
                              {camp.isEnabled ? <ToggleRight className="w-5 h-5 text-indigo-500" /> : <ToggleLeft className="w-5 h-5 text-zinc-600" />}
                            </button>
                          </div>
                          <h4 className="text-sm font-bold" style={{ color: isLight ? '#111827' : '#ffffff' }}>{camp.campaignName}</h4>
                          <p className="text-xs" style={{ color: isLight ? '#6b7280' : '#88888b' }}>{camp.description || "No description provided."}</p>
                          
                           <div className="text-[10px] text-zinc-500 font-semibold space-y-1">
                            <div>Target: <strong className="text-indigo-400">{camp.isGlobal !== false ? "Global" : (camp.targetRegions?.map((r: string) => r.toUpperCase()).join(", ") || "None")}</strong></div>
                            <div>Purchases: <strong>{camp.currentPurchaseCount || 0}</strong> {camp.maxPurchaseLimit ? `/ ${camp.maxPurchaseLimit}` : ''}</div>
                            {camp.expirationDateTime && <div>Expires: <strong>{tsToDatetimeLocal(camp.expirationDateTime).substring(0, 16)}</strong></div>}
                          </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-4 border-t mt-4" style={{ borderColor: isLight ? '#e5e7eb' : '#1b1b1e' }}>
                          <button
                            onClick={() => handleEditCampaign(camp)}
                            className="px-2.5 py-1.5 rounded-lg border text-[10px] font-bold hover:bg-zinc-800 hover:text-white"
                            style={{ borderColor: isLight ? '#d1d5db' : '#27272a', color: isLight ? '#4b5563' : '#a1a1aa' }}
                          >
                            Edit Config
                          </button>
                          <button
                            onClick={() => handleDeleteCampaign(camp.id)}
                            className="px-2.5 py-1.5 rounded-lg border text-[10px] font-bold bg-red-500/10 hover:bg-red-500 hover:text-white border-red-500/20 text-red-500"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* 4. COUPON MANAGER TAB */}
        {activeTab === "coupons" && (
          <Card className="bg-zinc-900/10 border-zinc-800 shadow-none md:col-span-2" style={{ borderColor: isLight ? '#e5e7eb' : '#27272a' }}>
            <CardHeader className="border-b" style={{ borderColor: isLight ? '#e5e7eb' : '#27272a' }}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-sm font-bold flex items-center gap-2 text-zinc-200" style={{ color: isLight ? '#1f2937' : '#ffffff' }}>
                    <Gift className="w-4 h-4 text-purple-400" /> Active Coupons & Discounts
                  </CardTitle>
                  <CardDescription className="text-zinc-500 text-xs">
                    Create dynamic coupons, associate them with campaigns, and push/sync them with your active provider.
                  </CardDescription>
                </div>
                {!showCouponForm && (
                  <Button
                    onClick={() => { resetCouponForm(); setShowCouponForm(true) }}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 h-9 text-xs font-bold rounded-lg flex items-center justify-center gap-1 w-full sm:w-auto"
                  >
                    <Plus className="w-4 h-4" /> New Coupon
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-6">

              {/* Coupon Form */}
              {showCouponForm && (
                <div className="p-5 border rounded-2xl mb-6 space-y-4" style={{ borderColor: isLight ? '#e5e7eb' : '#27272a', backgroundColor: isLight ? '#f9fafb' : '#050507' }}>
                  <div className="flex justify-between items-center border-b pb-3 mb-2" style={{ borderColor: isLight ? '#e5e7eb' : '#1f1f23' }}>
                    <h3 className="text-sm font-bold">{editingCoupon ? "Edit Coupon Settings" : "Create New Discount Coupon"}</h3>
                    <button onClick={resetCouponForm} className="text-zinc-500 hover:text-zinc-300">
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">Coupon Code</label>
                      <Input
                        value={couponForm.couponCode}
                        onChange={e => setCouponForm(prev => ({ ...prev, couponCode: e.target.value.toUpperCase() }))}
                        className="h-9 text-xs font-mono font-bold"
                        placeholder="SUMMER50"
                        style={{ backgroundColor: isLight ? '#ffffff' : '#0f0f12', color: isLight ? '#1f2937' : '#f3f4f6' }}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">Discount Value</label>
                      <div className="relative">
                        <Input
                          type="number"
                          value={couponForm.discountValue}
                          onChange={e => setCouponForm(prev => ({ ...prev, discountValue: Number(e.target.value) }))}
                          className="h-9 text-xs pr-5 text-right font-mono"
                          style={{ backgroundColor: isLight ? '#ffffff' : '#0f0f12', color: isLight ? '#1f2937' : '#f3f4f6' }}
                        />
                        <span className="absolute right-2 top-2.5 text-xs text-zinc-500">%</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">Campaign Link</label>
                      <select
                        value={couponForm.campaignId}
                        onChange={(e) => {
                          const campaignId = e.target.value
                          setCouponForm(prev => ({ ...prev, campaignId }))
                          
                          if (campaignId) {
                            const campaignObj = campaigns.find(c => c.id === campaignId)
                            if (campaignObj) {
                              const targets: Record<string, boolean> = {}
                              
                              // Check if campaign targets are set
                              if (campaignObj.isGlobal === false && campaignObj.targetRegions && Array.isArray(campaignObj.targetRegions)) {
                                campaignObj.targetRegions.forEach((rCode: string) => {
                                  COUPON_PLANS.forEach(plan => {
                                    targets[`${rCode}_${plan}`] = true
                                  })
                                })
                              } else {
                                // If it is global, we can check all regions that have Dodo products configured
                                COUPON_REGIONS.forEach(r => {
                                  COUPON_PLANS.forEach(plan => {
                                    if (dodoProducts[r.key]?.[plan]) {
                                      targets[`${r.key}_${plan}`] = true
                                    }
                                  })
                                })
                              }
                              setCouponTargets(targets)
                            }
                          }
                        }}
                        className="w-full h-9 border rounded-lg text-xs px-2.5"
                        style={{ backgroundColor: isLight ? '#ffffff' : '#0f0f12', color: isLight ? '#1f2937' : '#f3f4f6' }}
                      >
                        <option value="">[None] Static Coupon (Uses date limits below)</option>
                        {campaigns.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.campaignName} ({c.status})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Coupon Target Region Checklist Grid */}
                  <div className="pt-4 border-t" style={{ borderColor: isLight ? '#e5e7eb' : '#1f1f23' }}>
                    <div className="flex justify-between items-center flex-wrap gap-2 mb-3">
                      <h4 className="text-xs font-bold text-zinc-400">Target Region & Plan mappings (Check to enable)</h4>
                      <select
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === 'deselect') {
                            setCouponTargets({});
                          } else if (val === 'super') {
                            const targets: Record<string, boolean> = {};
                            COUPON_REGIONS.forEach(r => {
                              targets[`${r.key}_super`] = true;
                            });
                            setCouponTargets(targets);
                          } else if (val === 'pro') {
                            const targets: Record<string, boolean> = {};
                            COUPON_REGIONS.forEach(r => {
                              targets[`${r.key}_pro`] = true;
                            });
                            setCouponTargets(targets);
                          } else if (val === 'single') {
                            const targets: Record<string, boolean> = {};
                            COUPON_REGIONS.forEach(r => {
                              targets[`${r.key}_recovery_pass`] = true;
                            });
                            setCouponTargets(targets);
                          } else if (val === 'all') {
                            const targets: Record<string, boolean> = {};
                            COUPON_REGIONS.forEach(r => {
                              COUPON_PLANS.forEach(p => {
                                targets[`${r.key}_${p}`] = true;
                              });
                            });
                            setCouponTargets(targets);
                          } else if (val === 'auto') {
                            setCouponTargets(buildAutoTargets());
                          }
                          // Reset selection back to default label
                          e.target.value = "";
                        }}
                        className="bg-zinc-950 border border-zinc-800 text-[10px] h-7 rounded px-2 text-indigo-400 font-bold focus:outline-none cursor-pointer"
                        style={{
                          backgroundColor: isLight ? '#ffffff' : '#050507',
                          borderColor: isLight ? '#d1d5db' : '#27272a',
                        }}
                      >
                        <option value="">Bulk Select / Actions...</option>
                        <option value="auto">Auto Check Configured Regions</option>
                        <option value="all">All Regions & Plans</option>
                        <option value="single">Only Single (Recovery Pass)</option>
                        <option value="pro">Only Pro</option>
                        <option value="super">Only Super</option>
                        <option value="deselect">Deselect All</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      {COUPON_REGIONS.map((region) => (
                        <div key={region.key} className="p-3 border rounded-xl space-y-2" style={{ borderColor: isLight ? '#e5e7eb' : '#1e1e22', backgroundColor: isLight ? '#ffffff' : '#0a0a0d' }}>
                          <div className="text-[9px] font-extrabold text-zinc-500 uppercase">{region.label}</div>
                          <div className="space-y-1.5">
                            {COUPON_PLANS.map(plan => {
                              const cellKey = `${region.key}_${plan}`
                              const isChecked = !!couponTargets[cellKey]
                              return (
                                <label key={plan} className="flex items-center gap-1.5 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(e) => {
                                      const checked = e.target.checked
                                      setCouponTargets(prev => ({ ...prev, [cellKey]: checked }))
                                    }}
                                    className="w-3.5 h-3.5 rounded text-indigo-600"
                                  />
                                  <span className="text-[10px] font-semibold text-zinc-400 capitalize">{plan.replace('_', ' ')}</span>
                                </label>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-4 border-t" style={{ borderColor: isLight ? '#e5e7eb' : '#1f1f23' }}>
                    <Button onClick={resetCouponForm} variant="outline" className="h-8 text-xs font-bold">
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSaveCoupon}
                      disabled={savingCoupon}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 h-8 text-xs font-bold rounded-lg"
                    >
                      {savingCoupon ? "Saving..." : "Save Coupon"}
                    </Button>
                  </div>
                </div>
              )}

              {/* Coupons list */}
              {coupons.length === 0 && !showCouponForm && (
                <div className="text-center py-8 text-zinc-500 text-xs">No active coupons configured.</div>
              )}

              {!showCouponForm && (
                <div className="space-y-3">
                  {coupons.map((coup) => {
                    const hasCampaign = !!coup.campaignId
                    const campaignObj = hasCampaign ? campaigns.find(c => c.id === coup.campaignId) : null

                    return (
                      <div key={coup.id} className="p-4 border rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4" style={{ borderColor: isLight ? '#e5e7eb' : '#1e1e21', backgroundColor: isLight ? '#ffffff' : '#0a0a0c' }}>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black font-mono tracking-wider px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                              {coup.couponCode}
                            </span>
                            <span className="text-xs font-bold" style={{ color: isLight ? '#1f2937' : '#f3f4f6' }}>
                              {coup.discountValue}% Off
                            </span>
                            {coup.active ? (
                              <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">ACTIVE</span>
                            ) : (
                              <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-zinc-700/30 text-zinc-500 border border-zinc-800">DISABLED</span>
                            )}
                          </div>
                          <h5 className="text-xs font-bold" style={{ color: isLight ? '#374151' : '#d1d5db' }}>{coup.title || "Discount Coupon"}</h5>
                          <p className="text-[11px]" style={{ color: isLight ? '#6b7280' : '#88888b' }}>{coup.description || "Valid on checkout pass products."}</p>
                          
                          <div className="text-[9px] text-zinc-500 font-semibold">
                            {hasCampaign ? (
                              <span>Linked to Campaign: <strong className="text-purple-400">{campaignObj?.campaignName || "Unknown Campaign"}</strong></span>
                            ) : (
                              <span>Static Coupon {coup.validUntil ? `· Expires: ${tsToDatetimeLocal(coup.validUntil).substring(0, 10)}` : ""}</span>
                            )}
                            <span> · Used: <strong>{coup.usedCount || 0}</strong> {coup.usageLimit ? `/ ${coup.usageLimit}` : ""}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end md:self-center">
                          <button
                            onClick={() => handleSyncCoupon(coup.id)}
                            disabled={syncingCoupon}
                            className="px-2.5 py-1.5 rounded-lg border text-[10px] font-bold bg-amber-500/10 hover:bg-amber-500 hover:text-white border-amber-500/25 text-amber-500 flex items-center gap-1"
                          >
                            <RefreshCw className="w-3 h-3" /> Sync Gateway
                          </button>
                          <button
                            onClick={() => handleEditCoupon(coup)}
                            className="px-2.5 py-1.5 rounded-lg border text-[10px] font-bold hover:bg-zinc-800 hover:text-white"
                            style={{ borderColor: isLight ? '#d1d5db' : '#27272a', color: isLight ? '#4b5563' : '#a1a1aa' }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteCoupon(coup.id)}
                            className="px-2.5 py-1.5 rounded-lg border text-[10px] font-bold bg-red-500/10 hover:bg-red-500 hover:text-white border-red-500/20 text-red-500"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Webhook Endpoints Modal */}
      {showWebhookModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div 
            className="w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200"
            style={{ 
              backgroundColor: isLight ? '#ffffff' : '#09090b', 
              borderColor: isLight ? '#e5e7eb' : '#27272a',
              boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
            }}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: isLight ? '#e5e7eb' : '#27272a' }}>
              <div>
                <h3 className="text-sm font-bold flex items-center gap-2" style={{ color: isLight ? '#111827' : '#ffffff' }}>
                  <Link2 className="w-4 h-4 text-indigo-400" /> Webhook Endpoints Configuration
                </h3>
                <p className="text-[10px] text-zinc-550 font-medium mt-0.5">
                  Configure these listener URLs in your payment dashboards to capture transactions and upgrades.
                </p>
              </div>
              <button 
                onClick={() => setShowWebhookModal(false)}
                className="p-1 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
                style={{ color: isLight ? '#4b5563' : '#a1a1aa' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 max-h-[65vh] overflow-y-auto">
              {[
                { gw: "Stripe", path: "/webhooks/stripe", desc: "For processing Stripe card checkout events" },
                { gw: "Dodo Payments", path: "/dodo-webhook", desc: "For processing live/test Dodo Payments subscription & upgrade checkouts" },
                { gw: "Lemon Squeezy", path: "/webhooks/lemonsqueezy", desc: "For Lemon Squeezy checkout webhooks" },
                { gw: "Paddle", path: "/webhooks/paddle", desc: "For Paddle checkout subscription events" }
              ].map((x) => {
                const fullUrl = cloudFunctionUrl 
                  ? `${cloudFunctionUrl.replace(/\/$/, "")}${x.path}` 
                  : `https://us-central1-takeout-fix.cloudfunctions.net/geminiToolGateway${x.path}`;

                return (
                  <div key={x.gw} className="p-4 bg-zinc-900/10 border border-zinc-850 rounded-xl space-y-2" style={{ backgroundColor: isLight ? '#f9fafb' : 'rgba(24,24,27,0.2)', borderColor: isLight ? '#e5e7eb' : '#27272a' }}>
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-[10px] uppercase tracking-wider" style={{ color: isLight ? '#374151' : '#a1a1aa' }}>{x.gw} Hook</span>
                      <span className="text-[9px] text-zinc-500 font-medium">{x.desc}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 font-mono text-[10px] p-2 bg-zinc-950/50 border border-zinc-900 rounded-lg overflow-x-auto whitespace-nowrap text-indigo-400 select-all scrollbar-none" style={{ backgroundColor: isLight ? '#ffffff' : '#09090b', borderColor: isLight ? '#e5e7eb' : '#27272a' }}>
                        {fullUrl}
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(fullUrl);
                          useToastStore.getState().addToast(`${x.gw} webhook URL copied!`, "success", 3000, "Copied");
                        }}
                        className="p-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-all flex items-center justify-center flex-shrink-0 cursor-pointer"
                        title="Copy to clipboard"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end px-6 py-4 border-t bg-zinc-950/20" style={{ borderColor: isLight ? '#e5e7eb' : '#27272a', backgroundColor: isLight ? '#f9fafb' : '#09090b' }}>
              <button
                onClick={() => setShowWebhookModal(false)}
                className="px-4 py-2 text-xs font-bold rounded-xl border border-zinc-800 hover:bg-zinc-800 text-zinc-300 hover:text-white transition-all cursor-pointer"
                style={{ borderColor: isLight ? '#e5e7eb' : '#27272a', color: isLight ? '#4b5563' : '#e4e4e7' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
