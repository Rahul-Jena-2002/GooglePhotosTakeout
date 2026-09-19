import { useState, useEffect } from "react"
import { doc, onSnapshot, setDoc, collection, addDoc } from "firebase/firestore"
import { db } from "../../firebase"
import { useAuth } from "../../contexts/AuthContext"
import { useToastStore } from "../../store/useToastStore"
import {
  Package, RefreshCw, ExternalLink, Copy, Check, Search, Filter,
  DollarSign, Globe, Shield, Sparkles, Tag, ArrowUpRight, Plus,
  Layers, ToggleLeft, ToggleRight, CheckCircle2, AlertCircle
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"

import { REGIONS_CONFIG, PLANS_CONFIG, REGION_DOC_IDS } from "../../lib/dodo/constants"
import type { PlanCode, RegionCode } from "../../lib/dodo/types"

const DODO_REGIONS = Object.values(REGIONS_CONFIG).map(r => ({
  key: r.key,
  label: r.name,
  flag: r.flag,
  currency: r.currency,
  symbol: r.symbol
}))

type PlanKey = PlanCode
const PLAN_KEYS: PlanKey[] = ["recovery_pass", "pro", "super"]

const PLAN_META: Record<PlanKey, { name: string; desc: string; badge: string; badgeColor: string }> = {
  recovery_pass: {
    name: "Recovery Pass",
    desc: "24-hour full access to restore complete metadata",
    badge: "24h Pass",
    badgeColor: "bg-blue-500/10 text-blue-400 border-blue-500/20"
  },
  pro: {
    name: "Pro Lifetime",
    desc: "Lifetime unlimited files, priority restoration queue",
    badge: "Most Popular",
    badgeColor: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
  },
  super: {
    name: "Super Lifetime",
    desc: "All Pro perks + metadata visualizer and duplicate scan",
    badge: "Best Value",
    badgeColor: "bg-purple-500/10 text-purple-400 border-purple-500/20"
  }
}

function resolveSyncUrl(endpoint: string, _storedUrl?: string): string {
  const hostname = window.location.hostname;
  const isCloudflare = hostname.endsWith('.pages.dev') || hostname.endsWith('takeoutfix.com') || (hostname === 'localhost' && window.location.port === '4321');
  if (isCloudflare) {
    return `/api/${endpoint}`;
  }
  return `https://takeoutfix.pages.dev/api/${endpoint}`;
}

export default function AdminProductCatalogue() {
  const { user, adminData, loading: authLoading } = useAuth()
  const isSuperAdminEmail = (user?.email || adminData?.email) === 'rahuljena.dev@gmail.com'
  const isDev = import.meta.env.DEV
  const hasAccess = isDev || isSuperAdminEmail || ["SUPER_ADMIN", "ADMIN"].includes(adminData?.role)

  const [activeGateway, setActiveGateway] = useState<string>("dodo")
  const [dodoTestMode, setDodoTestMode] = useState<boolean>(false)
  const [dodoProducts, setDodoProducts] = useState<Record<string, Record<string, string>>>({})
  const [dodoProductsFull, setDodoProductsFull] = useState<Record<string, Record<string, string>>>({})
  const [pricingTiers, setPricingTiers] = useState<Record<string, any>>({})
  const [credentials, setCredentials] = useState<Record<string, string>>({})
  const [cloudFunctionUrl, setCloudFunctionUrl] = useState("")
  const [gatewayApiKey, setGatewayApiKey] = useState("")

  // Filter and search states
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedRegionFilter, setSelectedRegionFilter] = useState("all")
  const [selectedPlanFilter, setSelectedPlanFilter] = useState("all")

  // Sync states
  const [isFetchingDodo, setIsFetchingDodo] = useState(false)
  const [isProvisioningAll, setIsProvisioningAll] = useState(false)
  const [syncingSinglePlan, setSyncingSinglePlan] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Real-time Firestore Listeners
  useEffect(() => {
    // 1. Global Settings
    const unsubGlobal = onSnapshot(doc(db, "settings", "global"), (snap) => {
      if (snap.exists()) {
        const data = snap.data()
        setActiveGateway(data.active_gateway || "dodo")
        const testMode = data.dodo_test_mode ?? false
        setDodoTestMode(testMode)
        const productsMap = testMode
          ? (data.dodo_products_test || {})
          : (data.dodo_products_live || data.dodo_products || {})
        const fullMap = testMode
          ? (data.dodo_products_full_test || {})
          : (data.dodo_products_full_live || data.dodo_products_full || {})
        setDodoProducts(productsMap)
        setDodoProductsFull(fullMap)
      }
    })

    // 2. Pricing Tiers
    const unsubPricing = onSnapshot(collection(db, "pricing_tiers"), (snap) => {
      const tiers: Record<string, any> = {}
      snap.docs.forEach(d => tiers[d.id] = d.data())
      setPricingTiers(tiers)
    })

    // 3. System Credentials
    const unsubSystem = onSnapshot(doc(db, "settings", "system"), (snap) => {
      if (snap.exists()) {
        const data = snap.data()
        setGatewayApiKey(data.gateway_api_key || "")
        setCloudFunctionUrl(data.cloud_function_url || "")
        setCredentials({
          dodo_api_key: data.dodo_api_key || "",
          dodo_test_api_key: data.dodo_test_api_key || ""
        })
      }
    })

    return () => {
      unsubGlobal()
      unsubPricing()
      unsubSystem()
    }
  }, [])

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    useToastStore.getState().addToast("Copied to clipboard!", "info")
    setTimeout(() => setCopiedId(null), 2000)
  }

  // --- Handlers: Fetch from Dodo ---
  const handleFetchFromDodo = async () => {
    setIsFetchingDodo(true)
    let cfUrl = ''
    try {
      cfUrl = resolveSyncUrl('sync-dodo-prices', cloudFunctionUrl)
      const dodoKeyToSend = dodoTestMode ? credentials.dodo_test_api_key : (credentials.dodo_api_key || credentials.dodo_test_api_key)

      if (!dodoKeyToSend) {
        useToastStore.getState().addToast(`Please configure your Dodo API Key (${dodoTestMode ? 'Test' : 'Live'}) in Payment Gateway settings first.`, 'error')
        setIsFetchingDodo(false)
        return
      }

      const idToken = user ? await user.getIdToken() : ''
      const resp = await fetch(cfUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': gatewayApiKey,
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          action: 'fetch_products',
          dodoApiKey: dodoKeyToSend,
          testMode: dodoTestMode
        })
      })

      const text = await resp.text()
      let data: any = {}
      try { data = text ? JSON.parse(text) : {} } catch (_) {
        throw new Error(`Server returned invalid response: ${text.substring(0, 150)}`)
      }

      if (!resp.ok || !data.success) {
        throw new Error(data.error || `Failed with status ${resp.status}`)
      }

      const mergedMap: Record<string, Record<string, string>> = JSON.parse(JSON.stringify(dodoProducts || {}))
      const mergedFullMap: Record<string, Record<string, string>> = JSON.parse(JSON.stringify(dodoProductsFull || {}))
      let count = 0

      if (data.mappedProducts) {
        for (const [rCode, pMap] of Object.entries(data.mappedProducts as Record<string, Record<string, string>>)) {
          if (!mergedMap[rCode]) mergedMap[rCode] = {}
          for (const [planCode, pId] of Object.entries(pMap)) {
            if (pId) {
              mergedMap[rCode][planCode] = pId
              count++
            }
          }
        }
      }

      if (data.mappedProductsFull) {
        for (const [rCode, pMap] of Object.entries(data.mappedProductsFull as Record<string, Record<string, string>>)) {
          if (!mergedFullMap[rCode]) mergedFullMap[rCode] = {}
          for (const [planCode, pId] of Object.entries(pMap)) {
            if (pId) mergedFullMap[rCode][planCode] = pId
          }
        }
      }

      setDodoProducts(mergedMap)
      setDodoProductsFull(mergedFullMap)

      // Save to settings/global
      const productField = dodoTestMode ? "dodo_products_test" : "dodo_products_live"
      const fullField = dodoTestMode ? "dodo_products_full_test" : "dodo_products_full"
      const updatePayload: any = {
        [productField]: mergedMap,
        [fullField]: mergedFullMap
      }
      if (!dodoTestMode) {
        updatePayload.dodo_products = mergedMap
        updatePayload.dodo_products_full = mergedFullMap
      }
      await setDoc(doc(db, "settings", "global"), updatePayload, { merge: true })

      // Update pricing tiers
      if (data.mappedPrices) {
        for (const [rCode, pPrices] of Object.entries(data.mappedPrices as Record<string, any>)) {
          const docId = REGION_DOC_IDS[rCode]
          if (!docId) continue
          const updateTier: any = {}
          if (pPrices.recovery_pass?.amount) updateTier['recovery_pass.current'] = pPrices.recovery_pass.amount
          if (pPrices.pro?.amount) updateTier['pro_lifetime.current'] = pPrices.pro.amount
          if (pPrices.super?.amount) updateTier['super_lifetime.current'] = pPrices.super.amount
          if (pPrices.recovery_pass?.currency) updateTier['currency_code'] = pPrices.recovery_pass.currency

          if (Object.keys(updateTier).length > 0) {
            try {
              await setDoc(doc(db, "pricing_tiers", docId), updateTier, { merge: true })
            } catch (_) {}
          }
        }
      }

      useToastStore.getState().addToast(`✅ Successfully fetched & linked ${count} products from Dodo (${data.envMode.toUpperCase()} mode)!`, 'success')

    } catch (err: any) {
      useToastStore.getState().addToast(`Fetch failed: ${err.message}`, 'error')
    } finally {
      setIsFetchingDodo(false)
    }
  }

  // --- Handlers: Auto-Provision All 8 Regions ---
  const handleProvisionAll = async () => {
    if (!window.confirm("This will connect to Dodo Payments and auto-create all missing regional products (24 variants total). Existing products will keep their IDs. Proceed?")) {
      return
    }

    setIsProvisioningAll(true)
    try {
      const cfUrl = resolveSyncUrl('sync-dodo-prices', cloudFunctionUrl)
      const dodoKeyToSend = dodoTestMode ? credentials.dodo_test_api_key : (credentials.dodo_api_key || credentials.dodo_test_api_key)

      if (!dodoKeyToSend) {
        useToastStore.getState().addToast(`Please configure your Dodo API Key (${dodoTestMode ? 'Test' : 'Live'}) first.`, 'error')
        setIsProvisioningAll(false)
        return
      }

      const regionalPrices: Record<string, any> = {}
      for (const [rCode, docId] of Object.entries(REGION_DOC_IDS)) {
        const tier = pricingTiers[docId] || {}
        regionalPrices[rCode] = {
          recovery_pass: tier.recovery_pass?.current || 4.99,
          pro: tier.pro_lifetime?.current || 29.00,
          super: tier.super_lifetime?.current || 49.00
        }
      }

      const idToken = user ? await user.getIdToken() : ''
      const resp = await fetch(cfUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': gatewayApiKey,
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          action: 'provision_all',
          dodoApiKey: dodoKeyToSend,
          testMode: dodoTestMode,
          productIds: dodoProducts,
          regionalPrices
        })
      })

      const data = await resp.json()
      if (!resp.ok || !data.success) {
        throw new Error(data.error || `Status ${resp.status}`)
      }

      if (data.updatedProductIds) {
        setDodoProducts(data.updatedProductIds)
        const productField = dodoTestMode ? "dodo_products_test" : "dodo_products_live"
        const updatePayload: any = { [productField]: data.updatedProductIds }
        if (!dodoTestMode) updatePayload.dodo_products = data.updatedProductIds
        await setDoc(doc(db, "settings", "global"), updatePayload, { merge: true })
      }

      const created = (data.results || []).filter((r: any) => r.method === 'CREATE').length
      const patched = (data.results || []).filter((r: any) => r.method === 'PATCH').length
      useToastStore.getState().addToast(`🚀 Dodo Sync Complete: ${created} created, ${patched} updated!`, 'success')

    } catch (err: any) {
      useToastStore.getState().addToast(`Provisioning error: ${err.message}`, 'error')
    } finally {
      setIsProvisioningAll(false)
    }
  }

  // --- Handlers: Sync Single Product Price ---
  const handleSyncSingleProduct = async (regionCode: string, planCode: PlanKey) => {
    const key = `${regionCode}_${planCode}`
    setSyncingSinglePlan(key)
    try {
      const docId = REGION_DOC_IDS[regionCode]
      const tier = pricingTiers[docId] || {}
      const priceVal = planCode === 'recovery_pass' ? tier.recovery_pass?.current || 4.99
        : planCode === 'pro' ? tier.pro_lifetime?.current || 29.00
        : tier.super_lifetime?.current || 49.00

      const cfUrl = resolveSyncUrl('sync-dodo-prices', cloudFunctionUrl)
      const dodoKeyToSend = dodoTestMode ? credentials.dodo_test_api_key : (credentials.dodo_api_key || credentials.dodo_test_api_key)

      const idToken = user ? await user.getIdToken() : ''
      const resp = await fetch(cfUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': gatewayApiKey,
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          regionCode,
          currency: tier.currency_code || 'USD',
          prices: { [planCode]: priceVal },
          dodoApiKey: dodoKeyToSend,
          productIds: { [planCode]: dodoProducts[regionCode]?.[planCode] }
        })
      })

      const data = await resp.json()
      if (resp.ok && data.results?.[0]?.status === 'SUCCESS') {
        const resObj = data.results[0]
        if (resObj.productId) {
          const newMap = {
            ...dodoProducts,
            [regionCode]: {
              ...(dodoProducts[regionCode] || {}),
              [planCode]: resObj.productId
            }
          }
          setDodoProducts(newMap)
          const productField = dodoTestMode ? "dodo_products_test" : "dodo_products_live"
          await setDoc(doc(db, "settings", "global"), { [productField]: newMap }, { merge: true })
        }
        useToastStore.getState().addToast(`✅ ${PLAN_META[planCode].name} synced to Dodo!`, 'success')
      } else {
        throw new Error(data.results?.[0]?.error || 'Failed to sync')
      }
    } catch (err: any) {
      useToastStore.getState().addToast(`Sync failed: ${err.message}`, 'error')
    } finally {
      setSyncingSinglePlan(null)
    }
  }

  // --- Handlers: Update Product ID in Firestore ---
  const handleUpdateProductId = async (regionCode: string, planCode: PlanKey, newId: string) => {
    const trimmed = newId.trim()
    const newMap = {
      ...dodoProducts,
      [regionCode]: {
        ...(dodoProducts[regionCode] || {}),
        [planCode]: trimmed
      }
    }
    setDodoProducts(newMap)
    try {
      const productField = dodoTestMode ? "dodo_products_test" : "dodo_products_live"
      const updatePayload: any = { [productField]: newMap }
      if (!dodoTestMode) updatePayload.dodo_products = newMap
      await setDoc(doc(db, "settings", "global"), updatePayload, { merge: true })
      useToastStore.getState().addToast("Updated Product ID in Firestore", "success")
    } catch (err: any) {
      useToastStore.getState().addToast("Failed to save: " + err.message, "error")
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
        <p className="text-zinc-400 text-sm max-w-sm">Admin credentials required to manage product catalogue.</p>
      </div>
    )
  }

  // Flattened catalog items for display & search
  const catalogItems = DODO_REGIONS.flatMap(region => {
    const docId = REGION_DOC_IDS[region.key]
    const tierData = pricingTiers[docId] || {}
    const activeIds = dodoProducts[region.key] || {}
    const fullIds = dodoProductsFull[region.key] || {}

    return PLAN_KEYS.map(planKey => {
      const planMeta = PLAN_META[planKey]
      const currentPrice = planKey === 'recovery_pass' ? tierData.recovery_pass?.current || 4.99
        : planKey === 'pro' ? tierData.pro_lifetime?.current || 29.00
        : tierData.super_lifetime?.current || 49.00
      const activeProductId = activeIds[planKey] || ""
      const fullProductId = fullIds[planKey] || ""
      const currency = tierData.currency_code || region.currency
      const symbol = tierData.currency_symbol || region.symbol

      return {
        regionKey: region.key,
        regionName: region.label,
        regionFlag: region.flag,
        currency,
        symbol,
        planKey,
        planName: planMeta.name,
        planDesc: planMeta.desc,
        badge: planMeta.badge,
        badgeColor: planMeta.badgeColor,
        price: currentPrice,
        activeProductId,
        fullProductId,
        isConfigured: !!activeProductId,
        checkoutUrl: `/checkout?plan=${planKey}&region=${region.key}`
      }
    })
  })

  // Filter items based on search and selected filters
  const filteredItems = catalogItems.filter(item => {
    if (selectedRegionFilter !== "all" && item.regionKey !== selectedRegionFilter) return false
    if (selectedPlanFilter !== "all" && item.planKey !== selectedPlanFilter) return false
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      const matchName = item.planName.toLowerCase().includes(query)
      const matchRegion = item.regionName.toLowerCase().includes(query)
      const matchId = item.activeProductId.toLowerCase().includes(query) || item.fullProductId.toLowerCase().includes(query)
      if (!matchName && !matchRegion && !matchId) return false
    }
    return true
  })

  const totalConfigured = catalogItems.filter(i => i.isConfigured).length
  const totalItems = catalogItems.length

  return (
    <div className="space-y-8 w-full min-w-0 font-sans transition-all duration-300 t-text-primary">
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-zinc-800/80">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-500 p-0.5 shadow-lg shadow-indigo-500/20">
              <div className="w-full h-full bg-zinc-950 rounded-[10px] flex items-center justify-center">
                <Package className="w-5 h-5 text-indigo-400" />
              </div>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2.5">
                Product Catalogue Hub
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 font-mono">
                  {totalConfigured}/{totalItems} Synced
                </span>
              </h1>
              <p className="text-xs text-zinc-400 mt-0.5">
                Dynamic inventory of all live tiers, localized currencies, and Dodo Payments integration.
              </p>
            </div>
          </div>
        </div>

        {/* Global Catalog Actions */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            type="button"
            onClick={handleFetchFromDodo}
            disabled={isFetchingDodo || isProvisioningAll}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs h-9 px-4 rounded-xl flex items-center gap-2 shadow-lg shadow-indigo-500/20 font-semibold"
          >
            {isFetchingDodo ? (
              <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Fetching Dodo...</>
            ) : (
              <><RefreshCw className="w-3.5 h-3.5" /> Fetch & Sync from Dodo</>
            )}
          </Button>

          <Button
            type="button"
            onClick={handleProvisionAll}
            disabled={isFetchingDodo || isProvisioningAll}
            className="bg-zinc-850 hover:bg-zinc-800 disabled:opacity-50 text-zinc-200 border border-zinc-750 text-xs h-9 px-4 rounded-xl flex items-center gap-2 font-semibold"
          >
            {isProvisioningAll ? (
              <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Provisioning 8 Regions...</>
            ) : (
              <><Sparkles className="w-3.5 h-3.5 text-amber-400" /> Auto-Provision All</>
            )}
          </Button>

          <a
            href={dodoTestMode ? "https://test.dodopayments.com/products" : "https://live.dodopayments.com/products"}
            target="_blank"
            rel="noopener noreferrer"
            className="h-9 px-3 rounded-xl border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 text-zinc-400 hover:text-white text-xs flex items-center gap-1.5 transition-colors"
            title="Open Dodo Payments Dashboard"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Dodo Dashboard</span>
          </a>
        </div>
      </div>

      {/* ── Environment Status Bar ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl border border-zinc-850 bg-zinc-900/30 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Active Gateway</div>
            <div className="text-xs font-bold text-white capitalize">{activeGateway} Payments</div>
          </div>
        </div>

        <div className="p-4 rounded-2xl border border-zinc-850 bg-zinc-900/30 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl border flex items-center justify-center ${dodoTestMode ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'}`}>
              <Globe className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Dodo Environment</div>
              <div className="text-xs font-bold text-white font-mono">
                {dodoTestMode ? "SANDBOX (test.dodopayments.com)" : "LIVE (live.dodopayments.com)"}
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-2xl border border-zinc-850 bg-zinc-900/30 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Catalog Coverage</div>
            <div className="text-xs font-bold text-white font-mono">
              {totalConfigured} of {totalItems} Tier Variants Configured
            </div>
          </div>
        </div>
      </div>

      {/* ── Search & Filters ── */}
      <div className="p-4 rounded-2xl border border-zinc-850 bg-zinc-900/20 flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            type="text"
            placeholder="Search by product name, region, or pdt_ ID..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9 h-9 text-xs bg-zinc-950 border-zinc-800 text-white rounded-xl focus:border-indigo-500"
          />
        </div>

        {/* Region Filter */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-zinc-400 font-semibold shrink-0">Region:</span>
          <select
            value={selectedRegionFilter}
            onChange={e => setSelectedRegionFilter(e.target.value)}
            className="h-9 px-3 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white focus:outline-none focus:border-indigo-500 font-medium"
          >
            <option value="all">All Regions (8)</option>
            {DODO_REGIONS.map(r => (
              <option key={r.key} value={r.key}>
                {r.flag} {r.label} ({r.currency})
              </option>
            ))}
          </select>

          {/* Plan Filter */}
          <span className="text-[11px] text-zinc-400 font-semibold shrink-0 ml-2">Tier:</span>
          <select
            value={selectedPlanFilter}
            onChange={e => setSelectedPlanFilter(e.target.value)}
            className="h-9 px-3 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white focus:outline-none focus:border-indigo-500 font-medium"
          >
            <option value="all">All Tiers (3)</option>
            <option value="recovery_pass">Recovery Pass</option>
            <option value="pro">Pro Lifetime</option>
            <option value="super">Super Lifetime</option>
          </select>
        </div>
      </div>

      {/* ── Product Catalog Cards Grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {filteredItems.map(item => {
          const syncKey = `${item.regionKey}_${item.planKey}`
          const isSyncing = syncingSinglePlan === syncKey

          return (
            <div
              key={syncKey}
              className={`p-5 rounded-2xl border transition-all duration-200 flex flex-col justify-between group ${
                item.isConfigured
                  ? 'bg-zinc-900/30 border-zinc-850 hover:border-zinc-700 hover:bg-zinc-900/50'
                  : 'bg-zinc-950/40 border-dashed border-zinc-800/80 hover:border-zinc-700'
              }`}
            >
              <div>
                {/* Top badges: Flag, Region, Tier Badge */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{item.regionFlag}</span>
                    <span className="text-xs font-bold text-zinc-300">{item.regionName}</span>
                    <span className="text-[10px] font-mono text-zinc-500 uppercase">({item.currency})</span>
                  </div>
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${item.badgeColor}`}>
                    {item.badge}
                  </span>
                </div>

                {/* Plan Title & Price */}
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-sm font-extrabold text-white group-hover:text-indigo-300 transition-colors">
                    {item.planName}
                  </h3>
                  <div className="text-base font-black text-emerald-400 font-mono">
                    {item.symbol}{typeof item.price === 'number' ? item.price.toFixed(2) : item.price}
                  </div>
                </div>
                <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed line-clamp-2">
                  {item.planDesc}
                </p>

                {/* Dodo Product ID input field */}
                <div className="mt-4 pt-3 border-t border-zinc-850/80 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">
                      Dodo Product ID
                    </span>
                    {item.isConfigured ? (
                      <span className="text-[9px] text-emerald-400 font-bold flex items-center gap-1">
                        <Check className="w-2.5 h-2.5" /> Synced
                      </span>
                    ) : (
                      <span className="text-[9px] text-amber-400 font-bold flex items-center gap-1">
                        <AlertCircle className="w-2.5 h-2.5" /> Not Assigned
                      </span>
                    )}
                  </div>

                  <div className="relative flex items-center">
                    <input
                      type="text"
                      value={item.activeProductId}
                      onChange={e => handleUpdateProductId(item.regionKey, item.planKey, e.target.value)}
                      placeholder="pdt_..."
                      className="w-full h-8 pl-2.5 pr-8 rounded-lg bg-zinc-950 border border-zinc-800 text-[11px] font-mono text-zinc-200 focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                    {item.activeProductId && (
                      <button
                        type="button"
                        onClick={() => copyToClipboard(item.activeProductId, syncKey)}
                        className="absolute right-2 text-zinc-500 hover:text-zinc-200 transition-colors"
                        title="Copy Product ID"
                      >
                        {copiedId === syncKey ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>

                  {item.fullProductId && item.fullProductId !== item.activeProductId && (
                    <div className="text-[10px] text-zinc-500 flex items-center gap-1.5 font-mono pt-1">
                      <span className="text-zinc-600">Full Price ID:</span>
                      <span className="truncate max-w-[150px]">{item.fullProductId}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons at bottom of card */}
              <div className="mt-4 pt-3 border-t border-zinc-850/80 flex items-center justify-between gap-2">
                <Button
                  type="button"
                  onClick={() => handleSyncSingleProduct(item.regionKey, item.planKey)}
                  disabled={isSyncing}
                  className="h-7 px-2.5 text-[10px] font-bold rounded-lg bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/30 transition-all flex items-center gap-1.5"
                >
                  {isSyncing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  Sync Price
                </Button>

                <div className="flex items-center gap-1.5">
                  <a
                    href={item.checkoutUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="h-7 px-2 text-[10px] font-semibold rounded-lg bg-zinc-850 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-750 flex items-center gap-1 transition-colors"
                    title="Test Checkout Flow in new tab"
                  >
                    <span>Test Checkout</span>
                    <ArrowUpRight className="w-3 h-3" />
                  </a>

                  {item.activeProductId && (
                    <a
                      href={`https://${dodoTestMode ? 'test' : 'live'}.dodopayments.com/products/${item.activeProductId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="h-7 w-7 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-500 hover:text-zinc-300 flex items-center justify-center transition-colors"
                      title="View in Dodo Dashboard"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {filteredItems.length === 0 && (
        <div className="text-center py-16 border border-dashed border-zinc-800 rounded-2xl bg-zinc-950/40">
          <Package className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-white mb-1">No products match your filters</h3>
          <p className="text-xs text-zinc-500 mb-4">Try clearing the search query or selecting "All Regions".</p>
          <Button
            type="button"
            onClick={() => { setSearchQuery(""); setSelectedRegionFilter("all"); setSelectedPlanFilter("all"); }}
            className="bg-zinc-800 text-white text-xs h-8 px-4 rounded-lg"
          >
            Clear Filters
          </Button>
        </div>
      )}
    </div>
  )
}
