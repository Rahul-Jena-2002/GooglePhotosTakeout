import React, { useState, useEffect } from "react"
import { useAuth, REGION_PRICING_CONFIGS, type FeatureItem, type FeaturesConfig, DEFAULT_FEATURES_CONFIG } from "../contexts/AuthContext"
import { db } from "../firebase"
import { doc, setDoc, getDoc, onSnapshot, collection, addDoc, getDocs, deleteDoc, updateDoc, serverTimestamp, Timestamp, query, where } from "firebase/firestore"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Shield, Settings, Sliders, DollarSign, Database, Lock, Plus, Trash2, Tag, Calendar, Users, MessageSquare, ChevronUp, ChevronDown, RefreshCw, ToggleLeft, ToggleRight, X, Check, Loader2 } from "lucide-react"
import { useToastStore } from "../store/useToastStore"

export default function AdminSettings() {
  const { adminData } = useAuth()

  // ─── FAQ ──────────────────────────────────────────────────────────────────
  interface FaqItem { id: string; question: string; answer: string; tag: string; }
  const FAQ_TAGS = ["Guide","Metadata","Privacy","Pricing","Billing","Formats","About","Problem","Limits","Feature","Technical","General"] as const;
  const DEFAULT_FAQS: FaqItem[] = [
    { id: "download-takeout", tag: "Guide",    question: "How do I download my Google Takeout?",                                                        answer: "Go to takeout.google.com, select Google Photos, and create an export. Once finished, download and unzip the folder." },
    { id: "missing-dates",   tag: "Metadata", question: "Why are my photos missing dates?",                                                              answer: "Google removes EXIF metadata when you download through Takeout. Instead, it places the data in separate JSON sidecar files. TakeoutFix merges these files back together." },
    { id: "upload-privacy",  tag: "Privacy",  question: "Does TakeoutFix upload my photos?",                                                             answer: "No. Everything is processed 100% locally on your machine. Your photos never leave your device." },
    { id: "free-limit",      tag: "Pricing",  question: "Is there a limit on the free plan?",                                                            answer: "Yes, the free plan processes up to 500 MB or 250 files to let you test the tool. Upgrading removes this limit." },
    { id: "refund-policy",   tag: "Billing",  question: "What is your refund policy?",                                                                   answer: "We want you to have a great experience with Takeout Fix. If you experience a genuine technical issue that prevents the software from working as described, and our support team is unable to resolve it, you may request a refund within 7 days of purchase. See our Refund Policy page for full details." },
    { id: "server-upload",   tag: "Privacy",  question: "Are my photos uploaded to your servers?",                                                       answer: "No. Never. The entire application runs locally inside your web browser using HTML5 File APIs. Your photos and metadata never leave your computer." },
    { id: "offline-work",    tag: "Privacy",  question: "Does this work completely offline?",                                                            answer: "Once the web app has loaded in your browser, you can disconnect from the internet and it will still process all your files locally." },
    { id: "out-of-order",    tag: "Metadata", question: "Why are my photos showing today's date or out of order after exporting from Google Takeout?",   answer: "When you export your photos, Google Photos separates the EXIF metadata into separate JSON sidecar files. Without this metadata, your phone or computer defaults to showing today's date (the file modification date), causing your gallery to be completely out of order. TakeoutFix fixes this by merging the JSON sidecars back into your images." },
    { id: "metadata-types",  tag: "Metadata", question: "What metadata can be recovered?",                                                               answer: "We recover original creation dates (timestamps), GPS coordinates (latitude, longitude, altitude), and camera device information if it exists in the Google JSON sidecars." },
    { id: "video-support",   tag: "Formats",  question: "Does it support videos?",                                                                       answer: "Yes! We support .mp4 and .mov files alongside standard image formats like .jpg, .heic, and .png." },
    { id: "no-install",      tag: "About",    question: "Can I fix Google Takeout metadata online without downloading any software?",                     answer: "Yes! TakeoutFix is a browser-based, no-install Google Takeout fixer tool. It does not require any software downloads or CLI commands like ExifTool. Everything runs directly inside your web browser 100% offline." },
  ];
  const [faqItems, setFaqItems] = useState<FaqItem[]>(DEFAULT_FAQS);
  const [savingFaqs, setSavingFaqs] = useState(false);
  const [maintenance, setMaintenance] = useState(false)
  const [reviewAutoApprove, setReviewAutoApprove] = useState(true)
  const [ticketSlaHours, setTicketSlaHours] = useState("24")  // kept silently for legacy
  const [freeQuotaMB, setFreeQuotaMB] = useState("500")

  // Per-tier tool thresholds
  const [tierThresholds, setTierThresholds] = useState({
    free:          { maxFiles: "250",    maxSizeMB: "500"    },
    recovery_pass: { maxFiles: "3000",   maxSizeMB: "3072"   },
    pro:           { maxFiles: "50000",  maxSizeMB: "51200"  },
    super:         { maxFiles: "100000", maxSizeMB: "102400" },
  });
  
  // Regional Pricing states
  const [pricingTiers, setPricingTiers] = useState<Record<string, any>>({})
  const [selectedConfigTier, setSelectedConfigTier] = useState("t3")
  const [currencyCode, setCurrencyCode] = useState("USD")
  const [currencySymbol, setCurrencySymbol] = useState("$")
  const [recoveryPassCurrent, setRecoveryPassCurrent] = useState("4.99")
  const [proLifetimeCurrent, setProLifetimeCurrent] = useState("29.00")
  const [superLifetimeCurrent, setSuperLifetimeCurrent] = useState("49.00")
  const [priceIncludesTax, setPriceIncludesTax] = useState(false)

  // ─── Campaign Manager state ───────────────────────────────────────────────
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [showCampaignForm, setShowCampaignForm] = useState(false)
  const [editingCampaign, setEditingCampaign] = useState<any | null>(null)
  const [campaignForm, setCampaignForm] = useState({
    campaignName: '', description: '', status: 'DRAFT', isEnabled: false,
    expirationType: 'NONE', expirationDateTime: '', maxPurchaseLimit: '',
  })
  const [campaignDiscounts, setCampaignDiscounts] = useState([
    { planCode: 'recovery_pass', discountType: 'PERCENTAGE', discountValue: 0 },
    { planCode: 'pro', discountType: 'PERCENTAGE', discountValue: 0 },
    { planCode: 'super', discountType: 'PERCENTAGE', discountValue: 0 },
  ])
  const [deletingCampaignId, setDeletingCampaignId] = useState<string | null>(null)
  const [confirmDeleteCampaignId, setConfirmDeleteCampaignId] = useState<string | null>(null)

  // ─── Coupon Manager state ─────────────────────────────────────────────────
  const [coupons, setCoupons] = useState<any[]>([])
  const [showCouponForm, setShowCouponForm] = useState(false)
  const [editingCoupon, setEditingCoupon] = useState<any | null>(null)
  const [couponForm, setCouponForm] = useState({
    couponCode: '', title: '', description: '', campaignId: '',
    discountType: 'PERCENTAGE', discountValue: 0, stackable: false,
    active: true, validFrom: '', validUntil: '', usageLimit: ''
  })
  const [couponTargets, setCouponTargets] = useState<Record<string, boolean>>({}) // key = "regionCode_planCode"
  const [syncLog, setSyncLog] = useState<any[]>([])
  const [syncingCoupon, setSyncingCoupon] = useState(false)
  const [savingCoupon, setSavingCoupon] = useState(false)
  const [deletingCouponId, setDeletingCouponId] = useState<string | null>(null)
  const [confirmDeleteCouponId, setConfirmDeleteCouponId] = useState<string | null>(null)

  // Dynamic Features customizer states
  const [freeFeatures, setFreeFeatures] = useState<FeatureItem[]>([]);
  const [recoveryFeatures, setRecoveryFeatures] = useState<FeatureItem[]>([]);
  const [proFeatures, setProFeatures] = useState<FeatureItem[]>([]);
  const [superFeatures, setSuperFeatures] = useState<FeatureItem[]>([]);

  // Card heading and subheading editable texts
  const [headings, setHeadings] = useState({
    free: DEFAULT_FEATURES_CONFIG.headings.free,
    recovery_pass: DEFAULT_FEATURES_CONFIG.headings.recovery_pass,
    pro: DEFAULT_FEATURES_CONFIG.headings.pro,
    super: DEFAULT_FEATURES_CONFIG.headings.super,
  });
  const [subheadings, setSubheadings] = useState({
    free: DEFAULT_FEATURES_CONFIG.subheadings.free,
    recovery_pass: DEFAULT_FEATURES_CONFIG.subheadings.recovery_pass,
    pro: DEFAULT_FEATURES_CONFIG.subheadings.pro,
    super: DEFAULT_FEATURES_CONFIG.subheadings.super,
  });

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

  // Dodo Product IDs — nested region → plan map
  const DODO_REGIONS = [
    { key: 'in',  label: 'India',    currency: '₹' },
    { key: 't1',  label: 'Tier 1',   currency: '$' },
    { key: 't2',  label: 'Tier 2',   currency: '$' },
    { key: 't3',  label: 'Tier 3',   currency: '$' },
    { key: 't4',  label: 'Tier 4',   currency: '$' },
    { key: 'eu',  label: 'Europe',   currency: '€' },
    { key: 'jp',  label: 'Japan',    currency: '¥' },
    { key: 'cn',  label: 'China',    currency: '¥' },
  ]
  const DODO_PLANS = ['recovery_pass', 'pro', 'super'] as const
  const PLAN_LABELS: Record<string, string> = {
    recovery_pass: 'Recovery Pass',
    pro: 'Pro Lifetime (Full)',
    super: 'Super Lifetime (Full)'
  }
  const buildEmptyDodoProducts = () => Object.fromEntries(
    DODO_REGIONS.map(r => [r.key, Object.fromEntries(DODO_PLANS.map(p => [p, '']))])
  )
  const [dodoProducts, setDodoProducts] = useState<Record<string, Record<string, string>>>(buildEmptyDodoProducts())
  const [dodoWebhookKey, setDodoWebhookKey] = useState("")
  const [dodoLiveApiKey, setDodoLiveApiKey] = useState("")
  const [showDodoApiKey, setShowDodoApiKey] = useState(false)

  const [savingPricing, setSavingPricing] = useState(false)
  const [syncingPrices, setSyncingPrices] = useState(false)
  const [priceSyncResults, setPriceSyncResults] = useState<Array<{planCode:string; status:string; error?:string; amountMinor?:number}>>([]) 
  const [savingCampaignNew, setSavingCampaignNew] = useState(false)
  const [savingGlobal, setSavingGlobal] = useState(false)
  const role = adminData?.role || "ADMIN"

  // Load global settings, pricing tiers, and promo config in real-time
  useEffect(() => {
    const unsubGlobal = onSnapshot(doc(db, "settings", "global"), (snap) => {
      if (snap.exists()) {
        const data = snap.data()
        setMaintenance(data.maintenance ?? false)
        setReviewAutoApprove(data.reviewAutoApprove ?? true)
        setTicketSlaHours(String(data.ticketSlaHours ?? "24"))
        setFreeQuotaMB(String(data.freeQuotaMB ?? "500"))

        // Load per-tier thresholds
        const stored = data.tierThresholds as typeof tierThresholds | undefined;
        if (stored) {
          setTierThresholds({
            free:          { maxFiles: String(stored.free?.maxFiles ?? "250"),    maxSizeMB: String(stored.free?.maxSizeMB ?? "500")    },
            recovery_pass: { maxFiles: String(stored.recovery_pass?.maxFiles ?? "3000"),   maxSizeMB: String(stored.recovery_pass?.maxSizeMB ?? "3072")   },
            pro:           { maxFiles: String(stored.pro?.maxFiles ?? "50000"),  maxSizeMB: String(stored.pro?.maxSizeMB ?? "51200")  },
            super:         { maxFiles: String(stored.super?.maxFiles ?? "100000"), maxSizeMB: String(stored.super?.maxSizeMB ?? "102400") },
          });
        }
        setDodoProducts(prev => {
          const merged = buildEmptyDodoProducts()
          const storedActive = data.dodo_products as Record<string, Record<string, string>> | undefined
          
          DODO_REGIONS.forEach(r => {
            if (storedActive && storedActive[r.key]) {
              merged[r.key]['recovery_pass'] = storedActive[r.key]['recovery_pass'] || ''
              merged[r.key]['pro'] = storedActive[r.key]['pro'] || ''
              merged[r.key]['super'] = storedActive[r.key]['super'] || ''
            }
          })
          return merged
        })

        const storedFeatures = data.features_config as FeaturesConfig | undefined;
        if (storedFeatures) {
          setFreeFeatures(storedFeatures.free || DEFAULT_FEATURES_CONFIG.free);
          setRecoveryFeatures(storedFeatures.recovery_pass || DEFAULT_FEATURES_CONFIG.recovery_pass);
          setProFeatures(storedFeatures.pro || DEFAULT_FEATURES_CONFIG.pro);
          setSuperFeatures(storedFeatures.super || DEFAULT_FEATURES_CONFIG.super);
          setHeadings({
            free: storedFeatures.headings?.free ?? DEFAULT_FEATURES_CONFIG.headings.free,
            recovery_pass: storedFeatures.headings?.recovery_pass ?? DEFAULT_FEATURES_CONFIG.headings.recovery_pass,
            pro: storedFeatures.headings?.pro ?? DEFAULT_FEATURES_CONFIG.headings.pro,
            super: storedFeatures.headings?.super ?? DEFAULT_FEATURES_CONFIG.headings.super,
          });
          setSubheadings({
            free: storedFeatures.subheadings?.free ?? DEFAULT_FEATURES_CONFIG.subheadings.free,
            recovery_pass: storedFeatures.subheadings?.recovery_pass ?? DEFAULT_FEATURES_CONFIG.subheadings.recovery_pass,
            pro: storedFeatures.subheadings?.pro ?? DEFAULT_FEATURES_CONFIG.subheadings.pro,
            super: storedFeatures.subheadings?.super ?? DEFAULT_FEATURES_CONFIG.subheadings.super,
          });
        } else {
          setFreeFeatures(DEFAULT_FEATURES_CONFIG.free);
          setRecoveryFeatures(DEFAULT_FEATURES_CONFIG.recovery_pass);
          setProFeatures(DEFAULT_FEATURES_CONFIG.pro);
          setSuperFeatures(DEFAULT_FEATURES_CONFIG.super);
          setHeadings({ ...DEFAULT_FEATURES_CONFIG.headings });
          setSubheadings({ ...DEFAULT_FEATURES_CONFIG.subheadings });
        }
      }
    }, (err) => {
      console.error("Settings listener error:", err)
    })

    const unsubTiers = onSnapshot(collection(db, "pricing_tiers"), (snap) => {
      const data: Record<string, any> = {}
      snap.forEach((doc) => {
        data[doc.id] = doc.data()
      })
      setPricingTiers(data)
    }, (err) => {
      console.error("Pricing tiers listener error:", err)
    })

    const unsubCampaigns = onSnapshot(collection(db, 'campaigns'), (snap) => {
      setCampaigns(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }, (err) => {
      console.error("Campaigns listener error:", err)
    })

    const unsubCoupons = onSnapshot(collection(db, 'coupons'), (snap) => {
      setCoupons(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }, (err) => {
      console.error("Coupons listener error:", err)
    })

    // FAQ listener
    const unsubFaqs = onSnapshot(doc(db, "settings", "faqs"), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (Array.isArray(data.items) && data.items.length > 0) {
          setFaqItems(data.items);
        }
      }
    });

    return () => {
      unsubGlobal()
      unsubTiers()
      unsubCampaigns()
      unsubCoupons()
      unsubFaqs()
    }
  }, [])

  // Sync inputs with selected region pricing tier
  useEffect(() => {
    const docId = REGION_DOC_IDS[selectedConfigTier]
    if (docId && pricingTiers[docId]) {
      const tierData = pricingTiers[docId]
      setCurrencyCode(tierData.currency_code ?? "")
      setCurrencySymbol(tierData.currency_symbol ?? "")
      setRecoveryPassCurrent(String(tierData.recovery_pass?.current ?? ""))
      setProLifetimeCurrent(String(tierData.pro_lifetime?.current ?? ""))
      setSuperLifetimeCurrent(String(tierData.super_lifetime?.current ?? ""))
      setPriceIncludesTax(tierData.price_includes_tax ?? false)
    } else {
      // Fallback
      const staticConfig = REGION_PRICING_CONFIGS[selectedConfigTier] || REGION_PRICING_CONFIGS.t3
      setCurrencyCode(staticConfig.currency)
      setCurrencySymbol(staticConfig.symbol)
      setRecoveryPassCurrent(String(staticConfig.recoveryPass))
      setProLifetimeCurrent(String(staticConfig.finalPro))
      setSuperLifetimeCurrent(String(staticConfig.finalSuper))
      setPriceIncludesTax(false)
    }
  }, [selectedConfigTier, pricingTiers])

  // Load secure + system settings on mount
  useEffect(() => {
    const loadSecureSettings = async () => {
      try {
        const secureDoc = await getDoc(doc(db, "settings", "secure"))
        if (secureDoc.exists()) {
          setDodoWebhookKey(secureDoc.data().dodo_webhook_key || "")
        }
      } catch (err) {
        console.error("Failed to load secure settings:", err)
      }
      try {
        const systemDoc = await getDoc(doc(db, "settings", "system"))
        if (systemDoc.exists()) {
          setDodoLiveApiKey(systemDoc.data().dodo_api_key || "")
        }
      } catch (err) {
        console.error("Failed to load system settings:", err)
      }
    }
    loadSecureSettings()
  }, [])

  // ─── Sync current region prices to Dodo Payments ─────────────────────────
  const handleSyncPricesToDodo = async () => {
    setSyncingPrices(true)
    setPriceSyncResults([])
    try {
      // Map selectedConfigTier → region code key used by Dodo product map
      // (selectedConfigTier is already the region code: 'in', 't1', etc.)
      const regionCode = selectedConfigTier

      // Build prices object from current form state
      const prices: Record<string, number> = {
        recovery_pass: Number(recoveryPassCurrent),
        pro: Number(proLifetimeCurrent),
        super: Number(superLifetimeCurrent),
      }

      // Currency from current region config
      const currency = currencyCode

      // URL: localhost in dev, Cloud Function in prod
      let cfUrl = `https://us-central1-gt-metadata-merger.cloudfunctions.net/geminiToolGateway/sync-dodo-prices`
      if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
        cfUrl = 'http://localhost:3001/sync-dodo-prices'
      } else {
        try {
          const sysDoc = await getDoc(doc(db, 'settings', 'system'))
          if (sysDoc.exists() && sysDoc.data().cloud_function_url) {
            cfUrl = sysDoc.data().cloud_function_url.replace(/\/$/, '') + '/sync-dodo-prices'
          }
        } catch (_) { /* use default */ }
      }

      const resp = await fetch(cfUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': 'takeoutfix-gemini-secret-2026' },
        body: JSON.stringify({ regionCode, prices, currency })
      })

      const data = await resp.json()
      if (resp.ok && data.results) {
        setPriceSyncResults(data.results)
        const allOk = data.results.every((r: any) => r.status === 'SUCCESS')
        useToastStore.getState().addToast(
          allOk ? `✅ All prices synced to Dodo for ${regionCode}!` : `⚠️ Partial sync — check results below.`,
          allOk ? 'success' : 'error'
        )
      } else {
        useToastStore.getState().addToast('Sync failed: ' + (data.error || resp.status), 'error')
      }
    } catch (err: any) {
      useToastStore.getState().addToast('Price sync error: ' + err.message, 'error')
    } finally {
      setSyncingPrices(false)
    }
  }

  const handleSaveRegionConfig = async () => {
    const docId = REGION_DOC_IDS[selectedConfigTier];
    if (!docId) return;

    setSavingPricing(true);
    try {
      // 1. Save pricing tier details
      await setDoc(doc(db, "pricing_tiers", docId), {
        currency_code: currencyCode,
        currency_symbol: currencySymbol,
        price_includes_tax: priceIncludesTax,
        recovery_pass: {
          current: Number(recoveryPassCurrent),
        },
        pro_lifetime: {
          current: Number(proLifetimeCurrent),
        },
        super_lifetime: {
          current: Number(superLifetimeCurrent),
        }
      }, { merge: true });

      // 2. Prepare and save Dodo products map
      const activeProductsMap: Record<string, Record<string, string>> = {};
      DODO_REGIONS.forEach(r => {
        const regionProducts = dodoProducts[r.key] || {};
        activeProductsMap[r.key] = {
          recovery_pass: regionProducts.recovery_pass || '',
          pro: regionProducts.pro || '',
          super: regionProducts.super || ''
        };
      });

      await setDoc(doc(db, "settings", "global"), {
        dodo_products: activeProductsMap
      }, { merge: true });

      // 3. Save secure settings (webhook key)
      await setDoc(doc(db, "settings", "secure"), {
        dodo_webhook_key: dodoWebhookKey
      }, { merge: true });

      // 4. Save system settings (Live API key — read by Cloud Functions at runtime)
      if (dodoLiveApiKey.trim()) {
        await setDoc(doc(db, "settings", "system"), {
          dodo_api_key: dodoLiveApiKey.trim()
        }, { merge: true });
      }

      // 4. Log action to audit activity logs
      await addDoc(collection(db, "admin_activity"), {
        actorUid: adminData?.uid || "system",
        actorName: adminData?.displayName || "Admin",
        actorRole: role,
        action: "REGION_CONFIG_CHANGE",
        description: `Updated regional config for ${docId}: currency=${currencyCode}, rates=[recov:${recoveryPassCurrent}, pro:${proLifetimeCurrent}, super:${superLifetimeCurrent}], WebhookKeyUpdated=${!!dodoWebhookKey}.`,
        timestamp: Date.now()
      });

      useToastStore.getState().addToast(`Pricing & Dodo configuration for ${docId} saved successfully.`, "success");
    } catch (err: any) {
      console.error(err);
      useToastStore.getState().addToast("Failed to save region configuration: " + err.message, "error");
    } finally {
      setSavingPricing(false);
    }
  };

  const getCouponInheritedFields = (coup: any) => {
    if (!coup.campaignId) return null;
    const camp = campaigns.find(c => c.id === coup.campaignId);
    if (!camp) return null;
    return {
      expirationType: camp.expirationType,
      expirationDateTime: camp.expirationDateTime,
      maxPurchaseLimit: camp.maxPurchaseLimit,
      currentPurchaseCount: camp.currentPurchaseCount ?? 0,
      campaignName: camp.campaignName,
      isEnabled: camp.isEnabled,
      status: camp.status
    };
  };

  // ─── Campaign Manager helpers ──────────────────────────────────────────────
  const PLAN_LABELS_CM: Record<string, string> = {
    recovery_pass: 'Recovery Pass',
    pro: 'Pro',
    super: 'Super',
  }

  const resetCampaignForm = () => {
    setCampaignForm({ campaignName: '', description: '', status: 'DRAFT', isEnabled: false, expirationType: 'NONE', expirationDateTime: '', maxPurchaseLimit: '' })
    setCampaignDiscounts([
      { planCode: 'recovery_pass', discountType: 'PERCENTAGE', discountValue: 0 },
      { planCode: 'pro', discountType: 'PERCENTAGE', discountValue: 0 },
      { planCode: 'super', discountType: 'PERCENTAGE', discountValue: 0 },
    ])
    setEditingCampaign(null)
    setShowCampaignForm(false)
  }

  const tsToDatetimeLocal = (ts: any): string => {
    if (!ts) return ''
    const d = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts)
    if (isNaN(d.getTime())) return ''
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  const handleEditCampaign = async (camp: any) => {
    setEditingCampaign(camp)
    setShowCampaignForm(true)
    setCampaignForm({
      campaignName: camp.campaignName || '',
      description: camp.description || '',
      status: camp.status || 'DRAFT',
      isEnabled: camp.isEnabled ?? false,
      expirationType: camp.expirationType || 'NONE',
      expirationDateTime: tsToDatetimeLocal(camp.expirationDateTime),
      maxPurchaseLimit: camp.maxPurchaseLimit != null ? String(camp.maxPurchaseLimit) : '',
    })
    // Load discounts subcollection
    try {
      const discSnap = await getDocs(collection(db, 'campaigns', camp.id, 'discounts'))
      if (!discSnap.empty) {
        const loaded = discSnap.docs.map(d => ({ planCode: d.data().planCode, discountType: d.data().discountType || 'PERCENTAGE', discountValue: d.data().discountValue || 0 }))
        const merged = ['recovery_pass', 'pro', 'super'].map(pc => {
          const found = loaded.find(l => l.planCode === pc)
          return found || { planCode: pc, discountType: 'PERCENTAGE', discountValue: 0 }
        })
        setCampaignDiscounts(merged)
      } else {
        setCampaignDiscounts([
          { planCode: 'recovery_pass', discountType: 'PERCENTAGE', discountValue: 0 },
          { planCode: 'pro', discountType: 'PERCENTAGE', discountValue: 0 },
          { planCode: 'super', discountType: 'PERCENTAGE', discountValue: 0 },
        ])
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

      // One-active-at-a-time: pause all other ACTIVE campaigns
      if (isActivating) {
        const activeCamps = campaigns.filter(c => c.status === 'ACTIVE' && c.isEnabled && c.id !== editingCampaign?.id)
        for (const ac of activeCamps) {
          await updateDoc(doc(db, 'campaigns', ac.id), { status: 'PAUSED', updatedAt: serverTimestamp() })
        }
      }

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
        updatedAt: serverTimestamp(),
      }

      let campaignId: string
      if (editingCampaign) {
        await updateDoc(doc(db, 'campaigns', editingCampaign.id), payload)
        campaignId = editingCampaign.id
      } else {
        payload.currentPurchaseCount = 0
        payload.createdBy = adminData?.uid || 'system'
        payload.createdAt = serverTimestamp()
        const ref = await addDoc(collection(db, 'campaigns'), payload)
        campaignId = ref.id
      }

      // Save discounts subcollection
      for (const disc of campaignDiscounts) {
        const discRef = doc(db, 'campaigns', campaignId, 'discounts', disc.planCode)
        await setDoc(discRef, { planCode: disc.planCode, discountType: disc.discountType, discountValue: Number(disc.discountValue) }, { merge: true })
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
      console.error(err)
      useToastStore.getState().addToast('Failed to save campaign: ' + err.message, 'error')
    } finally {
      setSavingCampaignNew(false)
    }
  }

  const handleDeleteCampaign = async (campaignId: string) => {
    setDeletingCampaignId(campaignId)
    try {
      // Delete discounts subcollection docs
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
      // If enabling+ACTIVE, pause others
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

  // ─── Coupon Manager helpers ────────────────────────────────────────────────
  const COUPON_REGIONS = [
    { key: 'in', label: 'India' }, { key: 't1', label: 'Tier 1' }, { key: 't2', label: 'Tier 2' },
    { key: 't3', label: 'Tier 3' }, { key: 't4', label: 'Tier 4' },
    { key: 'eu', label: 'Europe' }, { key: 'jp', label: 'Japan' }, { key: 'cn', label: 'China' },
  ]
  const COUPON_PLANS = ['recovery_pass', 'pro', 'super']

  const resetCouponForm = () => {
    setCouponForm({ couponCode: '', title: '', description: '', campaignId: '', discountType: 'PERCENTAGE', discountValue: 0, stackable: false, active: true, validFrom: '', validUntil: '', usageLimit: '' })
    setCouponTargets({})
    setSyncLog([])
    setEditingCoupon(null)
    setShowCouponForm(false)
  }

  // Build a couponTargets map with every region×plan cell that has a Dodo product ID pre-checked.
  // Used to auto-populate new coupons so the admin doesn't have to manually tick every box.
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
      stackable: coup.stackable ?? false,
      active: coup.active ?? true,
      validFrom: tsToDatetimeLocal(coup.validFrom),
      validUntil: tsToDatetimeLocal(coup.validUntil),
      usageLimit: coup.usageLimit != null ? String(coup.usageLimit) : '',
    })
    // Load targets subcollection
    try {
      const targSnap = await getDocs(collection(db, 'coupons', coup.id, 'targets'))
      const newTargets: Record<string, boolean> = {}
      targSnap.docs.forEach(d => {
        const data = d.data()
        if (data.regionCode && data.planCode) newTargets[`${data.regionCode}_${data.planCode}`] = true
      })
      setCouponTargets(newTargets)
    } catch (e) { console.error('Failed to load coupon targets:', e) }
    // Load sync_log subcollection
    try {
      const logSnap = await getDocs(collection(db, 'coupons', coup.id, 'sync_log'))
      setSyncLog(logSnap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (e) { console.error('Failed to load sync log:', e) }
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
      // Save targets: delete all existing then re-create from checkbox state
      const existingTargSnap = await getDocs(collection(db, 'coupons', couponId, 'targets'))
      for (const d of existingTargSnap.docs) await deleteDoc(d.ref)
      for (const key of Object.keys(couponTargets)) {
        if (!couponTargets[key]) continue
        // Use indexOf to correctly split "t3_recovery_pass" → regionCode="t3", planCode="recovery_pass"
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
      useToastStore.getState().addToast(`Coupon ${editingCoupon ? 'updated' : 'created'} successfully.`, 'success')
      resetCouponForm()
    } catch (err: any) {
      console.error(err)
      useToastStore.getState().addToast('Failed to save coupon: ' + err.message, 'error')
    } finally {
      setSavingCoupon(false)
    }
  }

  const handleDeleteCoupon = async (couponId: string) => {
    setDeletingCouponId(couponId)
    try {
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
      useToastStore.getState().addToast('Coupon deleted.', 'success')
    } catch (err: any) {
      useToastStore.getState().addToast('Failed to delete coupon: ' + err.message, 'error')
    } finally {
      setDeletingCouponId(null)
      setConfirmDeleteCouponId(null)
    }
  }

  const handleToggleCouponActive = async (coup: any) => {
    try {
      await updateDoc(doc(db, 'coupons', coup.id), { active: !coup.active, updatedAt: serverTimestamp() })
    } catch (err: any) {
      useToastStore.getState().addToast('Failed to toggle coupon: ' + err.message, 'error')
    }
  }

  const handleSyncCoupon = async (couponId: string) => {
    setSyncingCoupon(true)
    try {
      // Read cloud function URL from settings/system or fallback
      let cfUrl = `https://us-central1-gt-metadata-merger.cloudfunctions.net/geminiToolGateway/sync-coupon`
      if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
        cfUrl = 'http://localhost:3001/sync-coupon'
      } else {
        try {
          const sysDoc = await getDoc(doc(db, 'settings', 'system'))
          if (sysDoc.exists() && sysDoc.data().cloud_function_url) {
            cfUrl = sysDoc.data().cloud_function_url.replace(/\/$/, '') + '/sync-coupon'
          }
        } catch (e) { /* use fallback */ }
      }

      // Build the productIds map from dodoProducts so the cloud function
      // knows which Dodo product IDs correspond to each region×plan target.
      // Shape: { t3: { recovery_pass: "pdt_...", pro: "pdt_...", super: "pdt_..." }, ... }
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
          'x-api-key': 'takeoutfix-gemini-secret-2026'
        },
        body: JSON.stringify({ couponId, productIds: productIdsPayload })
      })
      const result = await resp.json()
      // Reload sync log
      const logSnap = await getDocs(collection(db, 'coupons', couponId, 'sync_log'))
      setSyncLog(logSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      if (resp.ok) {
        useToastStore.getState().addToast('Sync completed successfully.', 'success')
      } else {
        useToastStore.getState().addToast('Sync returned an error: ' + (result.error || resp.status), 'error')
      }
    } catch (err: any) {
      useToastStore.getState().addToast('Sync failed: ' + err.message, 'error')
    } finally {
      setSyncingCoupon(false)
    }
  }

  // ─── FAQ handlers ─────────────────────────────────────────────────────────
  const handleSaveFaqs = async () => {
    setSavingFaqs(true);
    try {
      await setDoc(doc(db, "settings", "faqs"), { items: faqItems }, { merge: true });
      useToastStore.getState().addToast("FAQs saved successfully!", "success");
    } catch (e: any) {
      useToastStore.getState().addToast("Failed to save FAQs: " + e.message, "error");
    } finally {
      setSavingFaqs(false);
    }
  };

  const moveFaq = (idx: number, dir: -1 | 1) => {
    const next = idx + dir;
    if (next < 0 || next >= faqItems.length) return;
    setFaqItems(prev => { const a = [...prev]; [a[idx], a[next]] = [a[next], a[idx]]; return a; });
  };

  const updateFaq = (idx: number, field: keyof { id:string; question:string; answer:string; tag:string }, value: string) =>
    setFaqItems(prev => prev.map((f, i) => i === idx ? { ...f, [field]: value } : f));

  const deleteFaq = (idx: number) =>
    setFaqItems(prev => prev.filter((_, i) => i !== idx));

  const addFaq = () =>
    setFaqItems(prev => [...prev, { id: `faq-${Date.now()}`, tag: "General", question: "", answer: "" }]);

  // Ctrl+B / Cmd+B → wrap selected text in **bold**
  const handleAnswerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, idx: number) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart ?? 0;
      const end   = el.selectionEnd   ?? 0;
      if (start === end) return; // nothing selected
      const val      = el.value;
      const newValue = val.slice(0, start) + '**' + val.slice(start, end) + '**' + val.slice(end);
      updateFaq(idx, 'answer', newValue);
      // restore cursor position after React re-render
      setTimeout(() => {
        el.selectionStart = start + 2;
        el.selectionEnd   = end   + 2;
        el.focus();
      }, 0);
    }
  };

  const handleSaveGlobalSettings = async () => {
    setSavingGlobal(true);
    try {
      const activeProductsMap: Record<string, Record<string, string>> = {};

      DODO_REGIONS.forEach(r => {
        const regionProducts = dodoProducts[r.key] || {};
        activeProductsMap[r.key] = {
          recovery_pass: regionProducts.recovery_pass || '',
          pro: regionProducts.pro || '',
          super: regionProducts.super || ''
        };
      });

      // 1. Save global settings
      await setDoc(doc(db, "settings", "global"), {
        maintenance,
        reviewAutoApprove,
        ticketSlaHours: Number(ticketSlaHours),
        freeQuotaMB: Number(tierThresholds.free.maxSizeMB), // mirror from free tier
        dodo_products: activeProductsMap,
        tierThresholds: {
          free:          { maxFiles: Number(tierThresholds.free.maxFiles),          maxSizeMB: Number(tierThresholds.free.maxSizeMB)          },
          recovery_pass: { maxFiles: Number(tierThresholds.recovery_pass.maxFiles), maxSizeMB: Number(tierThresholds.recovery_pass.maxSizeMB) },
          pro:           { maxFiles: Number(tierThresholds.pro.maxFiles),           maxSizeMB: Number(tierThresholds.pro.maxSizeMB)           },
          super:         { maxFiles: Number(tierThresholds.super.maxFiles),         maxSizeMB: Number(tierThresholds.super.maxSizeMB)         },
        },
        features_config: {
          free: freeFeatures,
          recovery_pass: recoveryFeatures,
          pro: proFeatures,
          super: superFeatures,
          headings,
          subheadings,
        }
      }, { merge: true });

      // 2. Save secure settings
      await setDoc(doc(db, "settings", "secure"), {
        dodo_webhook_key: dodoWebhookKey
      }, { merge: true });

      // 3. Save system settings (Live API key — read by Cloud Functions at runtime)
      if (dodoLiveApiKey.trim()) {
        await setDoc(doc(db, "settings", "system"), {
          dodo_api_key: dodoLiveApiKey.trim()
        }, { merge: true });
      }

      // Log action to audit activity logs
      await addDoc(collection(db, "admin_activity"), {
        actorUid: adminData?.uid || "system",
        actorName: adminData?.displayName || "Admin",
        actorRole: role,
        action: "GLOBAL_SETTINGS_CHANGE",
        description: `Updated global/Dodo settings: Maintenance=${maintenance}, AutoApprove=${reviewAutoApprove}, SLA=${ticketSlaHours}h, FreeQuota=${freeQuotaMB}MB, WebhookKeyUpdated=${!!dodoWebhookKey}.`,
        timestamp: Date.now()
      });

      useToastStore.getState().addToast("System settings updated successfully.", "success");
    } catch (err: any) {
      console.error(err);
      useToastStore.getState().addToast("Failed to save system settings: " + err.message, "error");
    } finally {
      setSavingGlobal(false);
    }
  };

  return (
    <div className="space-y-8 font-sans text-zinc-100">
      
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
          <Settings className="w-6 h-6 text-indigo-400" /> System Settings
        </h1>
        <p className="text-zinc-400 text-sm mt-1">Configure global pricing overrides, maintenance toggles, and feature flags.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        
        {/* Maintenance & Rules */}
        <Card className="bg-zinc-900 border-zinc-800 shadow-none">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-zinc-200">
              <Shield className="w-4 h-4 text-indigo-400" /> Platform Maintenance
            </CardTitle>
            <CardDescription className="text-zinc-500 text-xs">Temporarily gate public actions or toggle debug behaviors.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between p-4 bg-zinc-950/40 border border-zinc-800/80 rounded-xl">
              <div>
                <div className="text-xs font-bold text-zinc-200">Global Maintenance Mode</div>
                <div className="text-[10px] text-zinc-500 mt-0.5">Locks all public tool workspace routes for updates.</div>
              </div>
              <button 
                onClick={() => setMaintenance(!maintenance)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${maintenance ? 'bg-indigo-500' : 'bg-zinc-800'}`}
              >
                <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${maintenance ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>

            <div className="flex items-center justify-between p-4 bg-zinc-950/40 border border-zinc-800/80 rounded-xl">
              <div>
                <div className="text-xs font-bold text-zinc-200">Auto-Approve Star Reviews</div>
                <div className="text-[10px] text-zinc-500 mt-0.5">Automatically publish 5-star submissions on landing section.</div>
              </div>
              <button 
                onClick={() => setReviewAutoApprove(!reviewAutoApprove)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${reviewAutoApprove ? 'bg-indigo-500' : 'bg-zinc-800'}`}
              >
                <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${reviewAutoApprove ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Tool Thresholds */}
        <Card className="bg-zinc-900 border-zinc-800 shadow-none">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-zinc-200">
              <Sliders className="w-4 h-4 text-purple-400" /> Plan Tool Thresholds
            </CardTitle>
            <CardDescription className="text-zinc-500 text-xs">
              Set the max files and max size (MB) allowed per plan. Pro and Super are unlimited — only Free and Recovery Pass have capped thresholds.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {([
                { tierKey: 'free'          as const, label: 'Free',          color: 'text-green-400',  border: 'border-green-500/20',  bg: 'bg-green-500/5'  },
                { tierKey: 'recovery_pass' as const, label: 'Recovery Pass', color: 'text-zinc-300',   border: 'border-zinc-600/30',   bg: 'bg-zinc-800/20'  },
              ]).map(({ tierKey, label, color, border, bg }) => (
                <div key={tierKey} className={`rounded-xl border ${border} ${bg} p-4 space-y-4`}>
                  <div className={`text-xs font-bold ${color} border-b border-zinc-800/60 pb-2`}>{label}</div>

                  {/* Max Files */}
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-1.5">
                      Max No. of Files
                    </label>
                    <div className="relative flex items-center">
                      <Database className="w-3.5 h-3.5 text-zinc-600 absolute left-3" />
                      <Input
                        type="number"
                        min="0"
                        value={tierThresholds[tierKey].maxFiles}
                        onChange={(e) => setTierThresholds(prev => ({
                          ...prev,
                          [tierKey]: { ...prev[tierKey], maxFiles: e.target.value }
                        }))}
                        className="bg-zinc-950 border-zinc-800 text-zinc-100 text-xs pl-9 h-9"
                        placeholder="e.g. 250"
                      />
                    </div>
                  </div>

                  {/* Max Size MB */}
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-1.5">
                      Max Quota Size (MB)
                    </label>
                    <div className="relative flex items-center">
                      <Sliders className="w-3.5 h-3.5 text-zinc-600 absolute left-3" />
                      <Input
                        type="number"
                        min="0"
                        value={tierThresholds[tierKey].maxSizeMB}
                        onChange={(e) => setTierThresholds(prev => ({
                          ...prev,
                          [tierKey]: { ...prev[tierKey], maxSizeMB: e.target.value }
                        }))}
                        className="bg-zinc-950 border-zinc-800 text-zinc-100 text-xs pl-9 h-9"
                        placeholder="e.g. 500"
                      />
                    </div>
                    <p className="text-[10px] text-zinc-655 mt-1">
                      ≈ {(Number(tierThresholds[tierKey].maxSizeMB) / 1024).toFixed(1)} GB
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Global Tier Pricing & Dodo Payments Integration */}
        <Card className="bg-zinc-900 border-zinc-800 shadow-none md:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-zinc-200">
              <DollarSign className="w-4 h-4 text-emerald-400" /> 💰 Global Tier Pricing & Dodo Payments Integration
            </CardTitle>
            <CardDescription className="text-zinc-500 text-xs font-medium">
              Adjust pricing values and sync payment identifiers directly for each region tier.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            
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
                  >
                    {r.currency} {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Currency Code & Currency Symbol & Webhook secret key */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-zinc-800/85 pb-6">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">Currency Code</label>
                <Input 
                  type="text" 
                  value={currencyCode} 
                  onChange={(e) => setCurrencyCode(e.target.value.toUpperCase())}
                  placeholder="USD"
                  className="bg-zinc-955 border-zinc-800 text-zinc-100 text-xs h-9 font-mono" 
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
                />
                {/* Tax inclusion toggle */}
                <button
                  type="button"
                  id="toggle-price-includes-tax"
                  onClick={() => setPriceIncludesTax(v => !v)}
                  className={`mt-2.5 flex items-center gap-2 w-full group`}
                >
                  <span className={`relative inline-flex h-4 w-7 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                    priceIncludesTax ? 'bg-emerald-500' : 'bg-zinc-700'
                  }`}>
                    <span className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                      priceIncludesTax ? 'translate-x-3' : 'translate-x-0'
                    }`} />
                  </span>
                  <span className={`text-[10px] font-semibold transition-colors ${
                    priceIncludesTax ? 'text-emerald-400' : 'text-zinc-500'
                  }`}>
                    {priceIncludesTax ? 'Prices incl. tax' : 'Prices excl. tax'}
                  </span>
                  {priceIncludesTax && (
                    <span className="ml-auto text-[9px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 px-1.5 py-0.5 rounded">
                      TAX INCLUDED
                    </span>
                  )}
                </button>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
                  Dodo Webhook Secret Key
                </label>
                <div className="relative flex items-center">
                  <span className="text-zinc-500 absolute left-3 text-xs">whsec_</span>
                  <Input 
                    type="password"
                    value={dodoWebhookKey.startsWith("whsec_") ? dodoWebhookKey.substring(6) : dodoWebhookKey}
                    onChange={(e) => {
                      const rawVal = e.target.value;
                      setDodoWebhookKey(rawVal.startsWith("whsec_") ? rawVal : `whsec_${rawVal}`);
                    }}
                    placeholder="Enter webhook secret key"
                    className="bg-zinc-955 border-zinc-800 text-zinc-100 text-xs pl-16 h-9"
                  />
                </div>
              </div>

              {/* Dodo Live API Key */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
                  Dodo Live API Key
                  <span className="ml-2 text-[9px] font-normal text-amber-400/70 normal-case">⚡ used by Cloud Functions at runtime — no redeploy needed</span>
                </label>
                <div className="relative flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 text-xs pointer-events-none select-none">sk_live_</span>
                    <Input
                      type={showDodoApiKey ? "text" : "password"}
                      value={dodoLiveApiKey.startsWith("sk_live_") ? dodoLiveApiKey.substring(8) : dodoLiveApiKey}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setDodoLiveApiKey(raw.startsWith("sk_live_") ? raw : `sk_live_${raw}`);
                      }}
                      placeholder="Paste your sk_live_... key here"
                      className="bg-zinc-955 border-zinc-800 text-zinc-100 text-xs pl-16 h-9 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowDodoApiKey(p => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                      title={showDodoApiKey ? "Hide key" : "Reveal key"}
                    >
                      {showDodoApiKey
                        ? <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 4.411m0 0L21 21" /></svg>
                        : <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                      }
                    </button>
                  </div>
                  {dodoLiveApiKey.trim().replace("sk_live_", "").length > 8 && (
                    <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-400 whitespace-nowrap">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block"></span>
                      KEY SET
                    </span>
                  )}
                </div>
                <p className="text-[9px] text-zinc-600 mt-1">Stored in <code className="text-zinc-500">settings/system.dodo_api_key</code> — never exposed to users.</p>
              </div>
            </div>

            {/* Pricing Config + Product IDs Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Recovery Pass Config */}
              <div className="bg-zinc-950/30 p-4 border border-zinc-800/60 rounded-xl space-y-4">
                <div className="text-xs font-semibold text-zinc-300 border-b border-zinc-800/80 pb-2">Recovery Pass</div>
                <div>
                  <label className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">Standard Rate</label>
                  <div className="relative flex items-center">
                    <span className="text-zinc-650 absolute left-3 text-xs">{currencySymbol}</span>
                    <Input 
                      type="number" 
                      step="any"
                      value={recoveryPassCurrent} 
                      onChange={(e) => setRecoveryPassCurrent(e.target.value)}
                      className="bg-zinc-950 border-zinc-800 text-zinc-100 text-xs pl-6 h-9" 
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">Dodo Product ID</label>
                  <Input
                    type="text"
                    value={dodoProducts[selectedConfigTier]?.recovery_pass || ''}
                    onChange={e => {
                      const val = e.target.value
                      setDodoProducts(prev => ({
                        ...prev,
                        [selectedConfigTier]: { ...prev[selectedConfigTier], recovery_pass: val }
                      }))
                    }}
                    placeholder="pdt_..."
                    className="bg-zinc-950 border-zinc-800 text-zinc-100 text-xs h-9 font-mono"
                  />
                </div>
              </div>

              {/* Pro Lifetime Config */}
              <div className="bg-zinc-950/30 p-4 border border-zinc-800/60 rounded-xl space-y-4">
                <div className="text-xs font-semibold text-zinc-300 border-b border-zinc-800/80 pb-2">Pro Lifetime</div>
                <div>
                  <label className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">Standard Rate</label>
                  <div className="relative flex items-center">
                    <span className="text-zinc-650 absolute left-3 text-xs">{currencySymbol}</span>
                    <Input 
                      type="number" 
                      step="any"
                      value={proLifetimeCurrent} 
                      onChange={(e) => setProLifetimeCurrent(e.target.value)}
                      className="bg-zinc-950 border-zinc-800 text-zinc-100 text-xs pl-6 h-9" 
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">Dodo Product ID</label>
                  <Input
                    type="text"
                    value={dodoProducts[selectedConfigTier]?.pro || ''}
                    onChange={e => {
                      const val = e.target.value
                      setDodoProducts(prev => ({
                        ...prev,
                        [selectedConfigTier]: { ...prev[selectedConfigTier], pro: val }
                      }))
                    }}
                    placeholder="pdt_..."
                    className="bg-zinc-950 border-zinc-800 text-zinc-100 text-xs h-9 font-mono"
                  />
                </div>
              </div>

              {/* Super Lifetime Config */}
              <div className="bg-zinc-950/30 p-4 border border-zinc-800/60 rounded-xl space-y-4">
                <div className="text-xs font-semibold text-zinc-300 border-b border-zinc-800/80 pb-2">Super Lifetime</div>
                <div>
                  <label className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">Standard Rate</label>
                  <div className="relative flex items-center">
                    <span className="text-zinc-650 absolute left-3 text-xs">{currencySymbol}</span>
                    <Input 
                      type="number" 
                      step="any"
                      value={superLifetimeCurrent} 
                      onChange={(e) => setSuperLifetimeCurrent(e.target.value)}
                      className="bg-zinc-950 border-zinc-800 text-zinc-100 text-xs pl-6 h-9" 
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">Dodo Product ID</label>
                  <Input
                    type="text"
                    value={dodoProducts[selectedConfigTier]?.super || ''}
                    onChange={e => {
                      const val = e.target.value
                      setDodoProducts(prev => ({
                        ...prev,
                        [selectedConfigTier]: { ...prev[selectedConfigTier], super: val }
                      }))
                    }}
                    placeholder="pdt_..."
                    className="bg-zinc-950 border-zinc-800 text-zinc-100 text-xs h-9 font-mono"
                  />
                </div>
              </div>

            </div>

            {/* Configured IDs Overview Summary Grid */}
            <div className="p-4 bg-zinc-950/60 border border-zinc-800/60 rounded-xl">
              <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-3">All Configured IDs Overview</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {DODO_REGIONS.map(r => {
                  const filled = DODO_PLANS.filter(p => dodoProducts[r.key]?.[p]).length
                  return (
                    <div key={r.key} className="text-[10px] space-y-0.5">
                      <div className={`font-semibold ${
                        filled === 3 ? 'text-emerald-400' : filled > 0 ? 'text-amber-400' : 'text-zinc-600'
                      }`}>
                        {r.currency} {r.label} {filled === 3 ? '✓' : filled > 0 ? `(${filled}/3)` : '—'}
                      </div>
                      {DODO_PLANS.map(p => (
                        <div key={p} className="text-zinc-650 truncate">
                          {dodoProducts[r.key]?.[p] ? `${dodoProducts[r.key][p].substring(0, 14)}…` : `${PLAN_LABELS[p].split(' ')[0]}: empty`}
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Save Region Config + Sync Prices to Dodo */}
            <div className="pt-6 border-t border-zinc-800/80 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  {/* Sync results badges */}
                  {priceSyncResults.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      {priceSyncResults.map((r) => (
                        <span key={r.planCode} className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded border ${
                          r.status === 'SUCCESS'
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                            : 'bg-red-500/10 border-red-500/30 text-red-400'
                        }`}>
                          {r.status === 'SUCCESS' ? '✓' : '✗'}
                          {r.planCode === 'recovery_pass' ? 'Recovery' : r.planCode === 'pro' ? 'Pro' : 'Super'}
                          {r.status === 'SUCCESS' && r.amountMinor ? ` ${currencyCode} ${(r.amountMinor/100).toFixed(0)}` : ''}
                          {r.status !== 'SUCCESS' && r.error ? ` — ${String(r.error).substring(0, 30)}` : ''}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  <Button
                    type="button"
                    onClick={handleSyncPricesToDodo}
                    disabled={syncingPrices || savingPricing}
                    className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white px-4 h-9 text-xs font-semibold rounded-lg flex items-center gap-1.5"
                    title="Push current prices to Dodo Payments product catalog"
                  >
                    {syncingPrices
                      ? <><span className="animate-spin inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full"></span> Syncing to Dodo...</>
                      : <>🔄 Sync Prices → Dodo</>}
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
              {priceSyncResults.length === 0 && (
                <p className="text-[9px] text-zinc-600 text-right">"Sync Prices → Dodo" pushes these prices to the actual Dodo product catalog. Requires local server running (dev) or Firebase Blaze plan (prod).</p>
              )}
            </div>

          </CardContent>
        </Card>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* Campaign Manager */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <Card className="bg-zinc-900 border-zinc-800 shadow-none md:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-zinc-200">
              <Tag className="w-4 h-4 text-purple-400" /> Campaign Manager
            </CardTitle>
            <CardDescription className="text-zinc-500 text-xs">
              Create and manage promotional campaigns backed by Firestore. Only one campaign can be ACTIVE+enabled at a time.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">

            {/* Campaign List */}
            {campaigns.length === 0 && !showCampaignForm && (
              <div className="text-center py-8 text-zinc-600 text-xs">No campaigns yet. Click "New Campaign" to create one.</div>
            )}
            <div className="space-y-2">
              {campaigns.map((camp) => {
                const statusColors: Record<string, string> = {
                  DRAFT: 'bg-zinc-700/40 text-zinc-400 border-zinc-700/40',
                  ACTIVE: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
                  PAUSED: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                  EXPIRED: 'bg-red-500/10 text-red-400 border-red-500/20',
                }
                const statusColor = statusColors[camp.status] || statusColors.DRAFT
                const isEditing = editingCampaign?.id === camp.id && showCampaignForm
                return (
                  <div key={camp.id} className="bg-zinc-950/40 border border-zinc-800/80 rounded-xl overflow-hidden">
                    <div className="flex items-center gap-3 p-3 flex-wrap">
                      {/* Status badge */}
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${statusColor} flex items-center gap-1 shrink-0`}>
                        {camp.status === 'ACTIVE' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                        {camp.status}
                      </span>
                      {/* Name & desc */}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-zinc-200 truncate">{camp.campaignName}</div>
                        {camp.description && <div className="text-[10px] text-zinc-500 truncate mt-0.5">{camp.description}</div>}
                      </div>
                      {/* isEnabled toggle */}
                      <button
                        type="button"
                        title={camp.isEnabled ? 'Enabled' : 'Disabled'}
                        onClick={() => handleToggleCampaignEnabled(camp)}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${camp.isEnabled ? 'bg-indigo-500' : 'bg-zinc-800'}`}
                      >
                        <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${camp.isEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                      </button>
                      {/* Edit button */}
                      <button
                        type="button"
                        onClick={() => isEditing ? resetCampaignForm() : handleEditCampaign(camp)}
                        className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-zinc-700 text-zinc-300 hover:border-indigo-500 hover:text-indigo-400 transition-all"
                      >
                        {isEditing ? 'Close' : 'Edit'}
                      </button>
                      {/* Delete button */}
                      {confirmDeleteCampaignId === camp.id ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-red-400">Confirm?</span>
                          <button type="button" onClick={() => handleDeleteCampaign(camp.id)} disabled={deletingCampaignId === camp.id}
                            className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-600 hover:bg-red-500 text-white disabled:opacity-50">
                            {deletingCampaignId === camp.id ? '...' : 'Yes'}
                          </button>
                          <button type="button" onClick={() => setConfirmDeleteCampaignId(null)}
                            className="text-[10px] font-bold px-2 py-0.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300">No</button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => setConfirmDeleteCampaignId(camp.id)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Inline Edit Form */}
                    {isEditing && (
                      <div className="border-t border-zinc-800/80 p-4 space-y-4 bg-zinc-950/60">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">Campaign Name *</label>
                            <Input type="text" value={campaignForm.campaignName} onChange={e => setCampaignForm(p => ({ ...p, campaignName: e.target.value }))} placeholder="e.g. Summer Sale" className="bg-zinc-950 border-zinc-800 text-zinc-100 text-xs h-9" />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">Status</label>
                            <select value={campaignForm.status} onChange={e => setCampaignForm(p => ({ ...p, status: e.target.value }))} className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 w-full h-9">
                              <option value="DRAFT">DRAFT</option>
                              <option value="ACTIVE">ACTIVE</option>
                              <option value="PAUSED">PAUSED</option>
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">Description</label>
                          <textarea value={campaignForm.description} onChange={e => setCampaignForm(p => ({ ...p, description: e.target.value }))} rows={2} placeholder="Optional description…" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-indigo-500 resize-none" />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="flex items-center justify-between p-3 bg-zinc-950/40 border border-zinc-800/80 rounded-xl">
                            <div className="text-xs font-bold text-zinc-300">Enabled</div>
                            <button type="button" onClick={() => setCampaignForm(p => ({ ...p, isEnabled: !p.isEnabled }))} className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${campaignForm.isEnabled ? 'bg-indigo-500' : 'bg-zinc-800'}`}>
                              <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${campaignForm.isEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                            </button>
                          </div>
                          <div>
                            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">Expiration Type</label>
                            <select value={campaignForm.expirationType} onChange={e => setCampaignForm(p => ({ ...p, expirationType: e.target.value }))} className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 w-full h-9">
                              <option value="NONE">NONE</option>
                              <option value="TIME_ONLY">TIME_ONLY</option>
                              <option value="PURCHASE_LIMIT_ONLY">PURCHASE_LIMIT_ONLY</option>
                              <option value="BOTH">BOTH</option>
                            </select>
                          </div>
                          <div className="flex items-center gap-2 p-3 bg-zinc-950/40 border border-zinc-800/80 rounded-xl">
                            <div className="text-xs text-zinc-400">Claims so far:</div>
                            <span className="text-sm font-bold text-indigo-400">{camp.currentPurchaseCount ?? 0}</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">Expiration Date/Time</label>
                            <Input type="datetime-local" value={campaignForm.expirationDateTime} onChange={e => setCampaignForm(p => ({ ...p, expirationDateTime: e.target.value }))} disabled={campaignForm.expirationType !== 'TIME_ONLY' && campaignForm.expirationType !== 'BOTH'} className="bg-zinc-950 border-zinc-800 text-zinc-100 text-xs h-9 disabled:opacity-40" />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">Max Purchase Limit</label>
                            <Input type="number" value={campaignForm.maxPurchaseLimit} onChange={e => setCampaignForm(p => ({ ...p, maxPurchaseLimit: e.target.value }))} disabled={campaignForm.expirationType !== 'PURCHASE_LIMIT_ONLY' && campaignForm.expirationType !== 'BOTH'} placeholder="e.g. 200" className="bg-zinc-950 border-zinc-800 text-zinc-100 text-xs h-9 disabled:opacity-40" />
                          </div>
                        </div>
                        {/* Per-plan discounts table */}
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-2">Per-Plan Discounts</div>
                          <div className="border border-zinc-800/60 rounded-xl overflow-hidden">
                            <table className="w-full text-xs">
                              <thead className="bg-zinc-950/60">
                                <tr>
                                  <th className="px-3 py-2 text-left text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Plan</th>
                                  <th className="px-3 py-2 text-left text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Type</th>
                                  <th className="px-3 py-2 text-left text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Value</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-zinc-800/40">
                                {campaignDiscounts.map((disc, idx) => (
                                  <tr key={disc.planCode}>
                                    <td className="px-3 py-2 font-semibold text-zinc-300">{PLAN_LABELS_CM[disc.planCode]}</td>
                                    <td className="px-3 py-2">
                                      <select value={disc.discountType} onChange={e => setCampaignDiscounts(p => p.map((d, i) => i === idx ? { ...d, discountType: e.target.value } : d))} className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-[11px] text-white focus:outline-none focus:border-indigo-500 w-full">
                                        <option value="PERCENTAGE">PERCENTAGE</option>
                                        <option value="FIXED">FIXED</option>
                                      </select>
                                    </td>
                                    <td className="px-3 py-2">
                                      <Input type="number" min="0" value={disc.discountValue} onChange={e => setCampaignDiscounts(p => p.map((d, i) => i === idx ? { ...d, discountValue: Number(e.target.value) } : d))} className="bg-zinc-950 border-zinc-800 text-zinc-100 text-xs h-7 w-24" />
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800/60">
                          <Button type="button" onClick={resetCampaignForm} className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 h-8 text-xs font-semibold rounded-lg">Cancel</Button>
                          <Button type="button" onClick={handleSaveCampaignNew} disabled={savingCampaignNew} className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 h-8 text-xs font-semibold rounded-lg">
                            {savingCampaignNew ? 'Saving…' : 'Save Campaign'}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* New Campaign Form (when not editing an existing one) */}
            {showCampaignForm && !editingCampaign && (
              <div className="border border-indigo-500/20 rounded-xl p-4 space-y-4 bg-indigo-500/5">
                <div className="text-xs font-bold text-indigo-400 mb-2">New Campaign</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">Campaign Name *</label>
                    <Input type="text" value={campaignForm.campaignName} onChange={e => setCampaignForm(p => ({ ...p, campaignName: e.target.value }))} placeholder="e.g. Summer Sale" className="bg-zinc-950 border-zinc-800 text-zinc-100 text-xs h-9" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">Status</label>
                    <select value={campaignForm.status} onChange={e => setCampaignForm(p => ({ ...p, status: e.target.value }))} className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 w-full h-9">
                      <option value="DRAFT">DRAFT</option>
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="PAUSED">PAUSED</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">Description</label>
                  <textarea value={campaignForm.description} onChange={e => setCampaignForm(p => ({ ...p, description: e.target.value }))} rows={2} placeholder="Optional description…" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-indigo-500 resize-none" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center justify-between p-3 bg-zinc-950/40 border border-zinc-800/80 rounded-xl">
                    <div className="text-xs font-bold text-zinc-300">Enabled</div>
                    <button type="button" onClick={() => setCampaignForm(p => ({ ...p, isEnabled: !p.isEnabled }))} className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${campaignForm.isEnabled ? 'bg-indigo-500' : 'bg-zinc-800'}`}>
                      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${campaignForm.isEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                    </button>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">Expiration Type</label>
                    <select value={campaignForm.expirationType} onChange={e => setCampaignForm(p => ({ ...p, expirationType: e.target.value }))} className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 w-full h-9">
                      <option value="NONE">NONE</option>
                      <option value="TIME_ONLY">TIME_ONLY</option>
                      <option value="PURCHASE_LIMIT_ONLY">PURCHASE_LIMIT_ONLY</option>
                      <option value="BOTH">BOTH</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">Expiration Date/Time</label>
                    <Input type="datetime-local" value={campaignForm.expirationDateTime} onChange={e => setCampaignForm(p => ({ ...p, expirationDateTime: e.target.value }))} disabled={campaignForm.expirationType !== 'TIME_ONLY' && campaignForm.expirationType !== 'BOTH'} className="bg-zinc-950 border-zinc-800 text-zinc-100 text-xs h-9 disabled:opacity-40" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">Max Purchase Limit</label>
                    <Input type="number" value={campaignForm.maxPurchaseLimit} onChange={e => setCampaignForm(p => ({ ...p, maxPurchaseLimit: e.target.value }))} disabled={campaignForm.expirationType !== 'PURCHASE_LIMIT_ONLY' && campaignForm.expirationType !== 'BOTH'} placeholder="e.g. 200" className="bg-zinc-950 border-zinc-800 text-zinc-100 text-xs h-9 disabled:opacity-40" />
                  </div>
                </div>
                {/* Per-plan discounts table */}
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-2">Per-Plan Discounts</div>
                  <div className="border border-zinc-800/60 rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-zinc-950/60">
                        <tr>
                          <th className="px-3 py-2 text-left text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Plan</th>
                          <th className="px-3 py-2 text-left text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Type</th>
                          <th className="px-3 py-2 text-left text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Value</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/40">
                        {campaignDiscounts.map((disc, idx) => (
                          <tr key={disc.planCode}>
                            <td className="px-3 py-2 font-semibold text-zinc-300">{PLAN_LABELS_CM[disc.planCode]}</td>
                            <td className="px-3 py-2">
                              <select value={disc.discountType} onChange={e => setCampaignDiscounts(p => p.map((d, i) => i === idx ? { ...d, discountType: e.target.value } : d))} className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-[11px] text-white focus:outline-none focus:border-indigo-500 w-full">
                                <option value="PERCENTAGE">PERCENTAGE</option>
                                <option value="FIXED">FIXED</option>
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <Input type="number" min="0" value={disc.discountValue} onChange={e => setCampaignDiscounts(p => p.map((d, i) => i === idx ? { ...d, discountValue: Number(e.target.value) } : d))} className="bg-zinc-950 border-zinc-800 text-zinc-100 text-xs h-7 w-24" />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800/60">
                  <Button type="button" onClick={resetCampaignForm} className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 h-8 text-xs font-semibold rounded-lg">Cancel</Button>
                  <Button type="button" onClick={handleSaveCampaignNew} disabled={savingCampaignNew} className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 h-8 text-xs font-semibold rounded-lg">
                    {savingCampaignNew ? 'Saving…' : 'Save Campaign'}
                  </Button>
                </div>
              </div>
            )}

            {/* New Campaign button */}
            {!showCampaignForm && (
              <div className="flex justify-end">
                <Button type="button" onClick={() => { resetCampaignForm(); setShowCampaignForm(true) }} className="bg-purple-700 hover:bg-purple-600 text-white px-4 h-8 text-xs font-semibold rounded-lg flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> New Campaign
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* Coupon Manager */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <Card className="bg-zinc-900 border-zinc-800 shadow-none md:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-zinc-200">
              <Tag className="w-4 h-4 text-cyan-400" /> Coupon Manager
            </CardTitle>
            <CardDescription className="text-zinc-500 text-xs">
              Create and manage discount coupons with region × plan targeting and Dodo Payments sync.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">

            {/* Coupon List */}
            {coupons.length === 0 && !showCouponForm && (
              <div className="text-center py-8 text-zinc-600 text-xs">No coupons yet. Click "New Coupon" to create one.</div>
            )}
            <div className="space-y-2">
              {coupons.map((coup) => {
                const isEditing = editingCoupon?.id === coup.id && showCouponForm
                const inherited = getCouponInheritedFields(coup)
                return (
                  <div key={coup.id} className="bg-zinc-950/40 border border-zinc-800/80 rounded-xl overflow-hidden">
                    <div className="flex items-center gap-3 p-3 flex-wrap">
                      {/* Code badge */}
                      <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-cyan-300 shrink-0">{coup.couponCode}</span>
                      {/* Title + usage */}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-zinc-200 truncate">{coup.title || '(no title)'}</div>
                        <div className="text-[10px] text-zinc-500 mt-0.5">
                          {inherited ? (
                            <>
                              {inherited.campaignName} (Linked) · 
                              {inherited.maxPurchaseLimit != null ? ` Claims: ${inherited.currentPurchaseCount} / ${inherited.maxPurchaseLimit}` : ' Claims: ∞'}
                              {inherited.expirationDateTime && <> · Expires: {tsToDatetimeLocal(inherited.expirationDateTime).substring(0, 10)}</>}
                            </>
                          ) : (
                            <>
                              Used: {coup.usedCount ?? 0}{coup.usageLimit ? ` / ${coup.usageLimit}` : ' / ∞'}
                              {coup.validUntil && <> · Expires: {tsToDatetimeLocal(coup.validUntil).substring(0, 10)}</>}
                            </>
                          )}
                        </div>
                      </div>
                      {/* active toggle */}
                      <button type="button" title={coup.active ? 'Active' : 'Inactive'} onClick={() => handleToggleCouponActive(coup)}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${coup.active ? 'bg-emerald-500' : 'bg-zinc-800'}`}>
                        <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${coup.active ? 'translate-x-4' : 'translate-x-0'}`} />
                      </button>
                      {/* Edit */}
                      <button type="button" onClick={() => isEditing ? resetCouponForm() : handleEditCoupon(coup)} className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-zinc-700 text-zinc-300 hover:border-cyan-500 hover:text-cyan-400 transition-all">
                        {isEditing ? 'Close' : 'Edit'}
                      </button>
                      {/* Delete */}
                      {confirmDeleteCouponId === coup.id ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-red-400">Confirm?</span>
                          <button type="button" onClick={() => handleDeleteCoupon(coup.id)} disabled={deletingCouponId === coup.id} className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-600 hover:bg-red-500 text-white disabled:opacity-50">
                            {deletingCouponId === coup.id ? '...' : 'Yes'}
                          </button>
                          <button type="button" onClick={() => setConfirmDeleteCouponId(null)} className="text-[10px] font-bold px-2 py-0.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300">No</button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => setConfirmDeleteCouponId(coup.id)} className="w-7 h-7 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Inline Edit Form */}
                    {isEditing && (
                      <div className="border-t border-zinc-800/80 p-4 space-y-4 bg-zinc-950/60">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">Coupon Code *</label>
                            <Input type="text" value={couponForm.couponCode} onChange={e => setCouponForm(p => ({ ...p, couponCode: e.target.value.toUpperCase() }))} placeholder="e.g. SUMMER20" className="bg-zinc-950 border-zinc-800 text-cyan-300 font-mono text-xs h-9" />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">Title</label>
                            <Input type="text" value={couponForm.title} onChange={e => setCouponForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Summer Sale 20% off" className="bg-zinc-950 border-zinc-800 text-zinc-100 text-xs h-9" />
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">Description</label>
                          <textarea value={couponForm.description} onChange={e => setCouponForm(p => ({ ...p, description: e.target.value }))} rows={2} placeholder="Optional…" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-cyan-500 resize-none" />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">Link to Campaign</label>
                            <select value={couponForm.campaignId} onChange={e => setCouponForm(p => ({ ...p, campaignId: e.target.value }))} className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 w-full h-9">
                              <option value="">None</option>
                              {campaigns.map(c => <option key={c.id} value={c.id}>{c.campaignName}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">Discount Type</label>
                            <select value={couponForm.discountType} onChange={e => setCouponForm(p => ({ ...p, discountType: e.target.value }))} className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 w-full h-9">
                              <option value="PERCENTAGE">PERCENTAGE</option>
                              <option value="FIXED">FIXED</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">Discount Value</label>
                            <Input type="number" min="0" value={couponForm.discountValue} onChange={e => setCouponForm(p => ({ ...p, discountValue: Number(e.target.value) }))} className="bg-zinc-950 border-zinc-800 text-zinc-100 text-xs h-9" />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <div className="flex items-center justify-between p-3 bg-zinc-950/40 border border-zinc-800/80 rounded-xl">
                            <div className="text-xs font-bold text-zinc-300">Stackable</div>
                            <button type="button" onClick={() => setCouponForm(p => ({ ...p, stackable: !p.stackable }))} className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${couponForm.stackable ? 'bg-indigo-500' : 'bg-zinc-800'}`}>
                              <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${couponForm.stackable ? 'translate-x-4' : 'translate-x-0'}`} />
                            </button>
                          </div>
                          <div className="flex items-center justify-between p-3 bg-zinc-950/40 border border-zinc-800/80 rounded-xl">
                            <div className="text-xs font-bold text-zinc-300">Active</div>
                            <button type="button" onClick={() => setCouponForm(p => ({ ...p, active: !p.active }))} className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${couponForm.active ? 'bg-emerald-500' : 'bg-zinc-800'}`}>
                              <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${couponForm.active ? 'translate-x-4' : 'translate-x-0'}`} />
                            </button>
                          </div>
                          {couponForm.campaignId ? (
                            <div className="md:col-span-2 flex items-center p-3 bg-zinc-950/40 border border-zinc-800/80 rounded-xl text-zinc-400 text-xs font-semibold">
                              <span>ℹ️ Validity timing is dynamically inherited from the linked campaign.</span>
                            </div>
                          ) : (
                            <>
                              <div>
                                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">Valid From</label>
                                <Input type="datetime-local" value={couponForm.validFrom} onChange={e => setCouponForm(p => ({ ...p, validFrom: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-zinc-100 text-xs h-9" />
                              </div>
                              <div>
                                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">Valid Until</label>
                                <Input type="datetime-local" value={couponForm.validUntil} onChange={e => setCouponForm(p => ({ ...p, validUntil: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-zinc-100 text-xs h-9" />
                              </div>
                            </>
                          )}
                        </div>
                        {couponForm.campaignId ? (
                          <div className="p-3 bg-zinc-950/40 border border-zinc-800/80 rounded-xl text-zinc-400 text-xs max-w-md font-semibold">
                            <span>ℹ️ Usage limit is dynamically inherited from the linked campaign.</span>
                          </div>
                        ) : (
                          <div>
                            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">Usage Limit (blank = unlimited)</label>
                            <Input type="number" min="0" value={couponForm.usageLimit} onChange={e => setCouponForm(p => ({ ...p, usageLimit: e.target.value }))} placeholder="Leave blank for unlimited" className="bg-zinc-950 border-zinc-800 text-zinc-100 text-xs h-9 w-48" />
                          </div>
                        )}
                        {/* Target Selector: Region × Plan grid */}
                        <div>
                          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Target Selector — Region × Plan</div>
                            <div className="flex items-center gap-2">
                              {/* Auto-select button */}
                              <button
                                type="button"
                                onClick={() => setCouponTargets(prev => ({ ...prev, ...buildAutoTargets() }))}
                                className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 transition-all"
                              >
                                <Check className="w-3 h-3" />
                                Auto-select by product ID ({Object.values(buildAutoTargets()).filter(Boolean).length} configured)
                              </button>
                              <div className="flex items-center gap-2 text-[9px] text-zinc-500">
                                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>has ID</span>
                                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-zinc-700 inline-block"></span>no ID</span>
                              </div>
                            </div>
                          </div>
                          <div className="border border-zinc-800/60 rounded-xl overflow-hidden">
                            <table className="w-full text-xs">
                              <thead className="bg-zinc-950/60">
                                <tr>
                                  <th className="px-3 py-2 text-left text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Region</th>
                                  {COUPON_PLANS.map(plan => <th key={plan} className="px-3 py-2 text-center text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{PLAN_LABELS_CM[plan]}</th>)}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-zinc-800/40">
                                {COUPON_REGIONS.map(region => (
                                  <tr key={region.key}>
                                    <td className="px-3 py-2 font-semibold text-zinc-300 text-[11px]">{region.label}</td>
                                    {COUPON_PLANS.map(plan => {
                                      const key = `${region.key}_${plan}`
                                      const hasProdId = !!dodoProducts[region.key]?.[plan]
                                      return (
                                        <td key={plan} className="px-3 py-2 text-center">
                                          <div className="flex flex-col items-center gap-1">
                                            <input
                                              type="checkbox"
                                              checked={!!couponTargets[key]}
                                              onChange={e => setCouponTargets(p => ({ ...p, [key]: e.target.checked }))}
                                              className="w-4 h-4 rounded border-zinc-600 bg-zinc-900 text-cyan-500 cursor-pointer accent-cyan-500"
                                            />
                                            <span
                                              title={hasProdId ? `Dodo ID: ${dodoProducts[region.key][plan]}` : 'No product ID configured'}
                                              className={`w-1.5 h-1.5 rounded-full ${hasProdId ? 'bg-emerald-500' : 'bg-zinc-700'}`}
                                            />
                                          </div>
                                        </td>
                                      )
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                        {/* Sync to Dodo */}
                        <div className="border-t border-zinc-800/60 pt-4">
                          <div className="flex items-center gap-3 mb-3">
                            <button type="button" onClick={() => handleSyncCoupon(coup.id)} disabled={syncingCoupon}
                              className="flex items-center gap-2 px-4 h-8 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white transition-all">
                              {syncingCoupon ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                              {syncingCoupon ? 'Syncing…' : 'Sync to Dodo'}
                            </button>
                            <span className="text-[10px] text-zinc-500">POSTs couponId to Cloud Function /sync-coupon</span>
                          </div>
                          {syncLog.length > 0 && (
                            <div className="border border-zinc-800/60 rounded-xl overflow-hidden">
                              <table className="w-full text-[10px]">
                                <thead className="bg-zinc-950/60">
                                  <tr>
                                    <th className="px-3 py-2 text-left text-zinc-500 uppercase tracking-wider font-bold">Product ID</th>
                                    <th className="px-3 py-2 text-left text-zinc-500 uppercase tracking-wider font-bold">Dodo Coupon ID</th>
                                    <th className="px-3 py-2 text-left text-zinc-500 uppercase tracking-wider font-bold">Status</th>
                                    <th className="px-3 py-2 text-left text-zinc-500 uppercase tracking-wider font-bold">Note</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-800/40">
                                  {syncLog.map(log => (
                                    <tr key={log.id}>
                                      <td className="px-3 py-1.5 font-mono text-zinc-400">{log.productId || '—'}</td>
                                      <td className="px-3 py-1.5 font-mono text-zinc-400">{log.dodoCouponId || '—'}</td>
                                      <td className="px-3 py-1.5">
                                        <span className={`px-1.5 py-0.5 rounded font-bold ${
                                          log.syncStatus === 'SUCCESS' ? 'bg-emerald-500/10 text-emerald-400' :
                                          log.syncStatus === 'FAILED' ? 'bg-red-500/10 text-red-400' : 'bg-zinc-700/40 text-zinc-400'
                                        }`}>{log.syncStatus}</span>
                                      </td>
                                      <td className="px-3 py-1.5 text-zinc-500 truncate max-w-[160px]">{log.errorMessage || ''}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                        <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800/60">
                          <Button type="button" onClick={resetCouponForm} className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 h-8 text-xs font-semibold rounded-lg">Cancel</Button>
                          <Button type="button" onClick={handleSaveCoupon} disabled={savingCoupon} className="bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-white px-4 h-8 text-xs font-semibold rounded-lg">
                            {savingCoupon ? 'Saving…' : 'Save Coupon'}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* New Coupon Form */}
            {showCouponForm && !editingCoupon && (
              <div className="border border-cyan-500/20 rounded-xl p-4 space-y-4 bg-cyan-500/5">
                <div className="text-xs font-bold text-cyan-400 mb-2">New Coupon</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">Coupon Code *</label>
                    <Input type="text" value={couponForm.couponCode} onChange={e => setCouponForm(p => ({ ...p, couponCode: e.target.value.toUpperCase() }))} placeholder="e.g. SUMMER20" className="bg-zinc-950 border-zinc-800 text-cyan-300 font-mono text-xs h-9" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">Title</label>
                    <Input type="text" value={couponForm.title} onChange={e => setCouponForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Summer Sale 20% off" className="bg-zinc-950 border-zinc-800 text-zinc-100 text-xs h-9" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">Description</label>
                  <textarea value={couponForm.description} onChange={e => setCouponForm(p => ({ ...p, description: e.target.value }))} rows={2} placeholder="Optional…" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-cyan-500 resize-none" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">Link to Campaign</label>
                    <select value={couponForm.campaignId} onChange={e => setCouponForm(p => ({ ...p, campaignId: e.target.value }))} className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 w-full h-9">
                      <option value="">None</option>
                      {campaigns.map(c => <option key={c.id} value={c.id}>{c.campaignName}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">Discount Type</label>
                    <select value={couponForm.discountType} onChange={e => setCouponForm(p => ({ ...p, discountType: e.target.value }))} className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 w-full h-9">
                      <option value="PERCENTAGE">PERCENTAGE</option>
                      <option value="FIXED">FIXED</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">Discount Value</label>
                    <Input type="number" min="0" value={couponForm.discountValue} onChange={e => setCouponForm(p => ({ ...p, discountValue: Number(e.target.value) }))} className="bg-zinc-950 border-zinc-800 text-zinc-100 text-xs h-9" />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="flex items-center justify-between p-3 bg-zinc-950/40 border border-zinc-800/80 rounded-xl">
                    <div className="text-xs font-bold text-zinc-300">Stackable</div>
                    <button type="button" onClick={() => setCouponForm(p => ({ ...p, stackable: !p.stackable }))} className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${couponForm.stackable ? 'bg-indigo-500' : 'bg-zinc-800'}`}>
                      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${couponForm.stackable ? 'translate-x-4' : 'translate-x-0'}`} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-zinc-950/40 border border-zinc-800/80 rounded-xl">
                    <div className="text-xs font-bold text-zinc-300">Active</div>
                    <button type="button" onClick={() => setCouponForm(p => ({ ...p, active: !p.active }))} className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${couponForm.active ? 'bg-emerald-500' : 'bg-zinc-800'}`}>
                      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${couponForm.active ? 'translate-x-4' : 'translate-x-0'}`} />
                    </button>
                  </div>
                  {couponForm.campaignId ? (
                    <div className="md:col-span-2 flex items-center p-3 bg-zinc-950/40 border border-zinc-800/80 rounded-xl text-zinc-400 text-xs font-semibold">
                      <span>ℹ️ Validity timing is dynamically inherited from the linked campaign.</span>
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">Valid From</label>
                        <Input type="datetime-local" value={couponForm.validFrom} onChange={e => setCouponForm(p => ({ ...p, validFrom: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-zinc-100 text-xs h-9" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">Valid Until</label>
                        <Input type="datetime-local" value={couponForm.validUntil} onChange={e => setCouponForm(p => ({ ...p, validUntil: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-zinc-100 text-xs h-9" />
                      </div>
                    </>
                  )}
                </div>
                {couponForm.campaignId ? (
                  <div className="p-3 bg-zinc-950/40 border border-zinc-800/80 rounded-xl text-zinc-400 text-xs max-w-md font-semibold">
                    <span>ℹ️ Usage limit is dynamically inherited from the linked campaign.</span>
                  </div>
                ) : (
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">Usage Limit (blank = unlimited)</label>
                    <Input type="number" min="0" value={couponForm.usageLimit} onChange={e => setCouponForm(p => ({ ...p, usageLimit: e.target.value }))} placeholder="Leave blank for unlimited" className="bg-zinc-950 border-zinc-800 text-zinc-100 text-xs h-9 w-48" />
                  </div>
                )}
                {/* Target Selector */}
                <div>
                  <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Target Selector — Region × Plan</div>
                    <div className="flex items-center gap-2">
                      {/* Auto-select button */}
                      <button
                        type="button"
                        onClick={() => setCouponTargets(prev => ({ ...prev, ...buildAutoTargets() }))}
                        className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 transition-all"
                      >
                        <Check className="w-3 h-3" />
                        Auto-select by product ID ({Object.values(buildAutoTargets()).filter(Boolean).length} configured)
                      </button>
                      <div className="flex items-center gap-2 text-[9px] text-zinc-500">
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>has ID</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-zinc-700 inline-block"></span>no ID</span>
                      </div>
                    </div>
                  </div>
                  <div className="border border-zinc-800/60 rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-zinc-950/60">
                        <tr>
                          <th className="px-3 py-2 text-left text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Region</th>
                          {COUPON_PLANS.map(plan => <th key={plan} className="px-3 py-2 text-center text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{PLAN_LABELS_CM[plan]}</th>)}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/40">
                        {COUPON_REGIONS.map(region => (
                          <tr key={region.key}>
                            <td className="px-3 py-2 font-semibold text-zinc-300 text-[11px]">{region.label}</td>
                            {COUPON_PLANS.map(plan => {
                              const key = `${region.key}_${plan}`
                              const hasProdId = !!dodoProducts[region.key]?.[plan]
                              return (
                                <td key={plan} className="px-3 py-2 text-center">
                                  <div className="flex flex-col items-center gap-1">
                                    <input
                                      type="checkbox"
                                      checked={!!couponTargets[key]}
                                      onChange={e => setCouponTargets(p => ({ ...p, [key]: e.target.checked }))}
                                      className="w-4 h-4 rounded border-zinc-600 bg-zinc-900 text-cyan-500 cursor-pointer accent-cyan-500"
                                    />
                                    <span
                                      title={hasProdId ? `Dodo ID: ${dodoProducts[region.key][plan]}` : 'No product ID configured'}
                                      className={`w-1.5 h-1.5 rounded-full ${hasProdId ? 'bg-emerald-500' : 'bg-zinc-700'}`}
                                    />
                                  </div>
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800/60">
                  <Button type="button" onClick={resetCouponForm} className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 h-8 text-xs font-semibold rounded-lg">Cancel</Button>
                  <Button type="button" onClick={handleSaveCoupon} disabled={savingCoupon} className="bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-white px-4 h-8 text-xs font-semibold rounded-lg">
                    {savingCoupon ? 'Saving…' : 'Save Coupon'}
                  </Button>
                </div>
              </div>
            )}

            {/* New Coupon button */}
            {!showCouponForm && (
              <div className="flex justify-end">
                <Button type="button" onClick={() => {
                  resetCouponForm()
                  // Auto-check all cells that already have a Dodo product ID configured
                  setCouponTargets(buildAutoTargets())
                  setShowCouponForm(true)
                }} className="bg-cyan-700 hover:bg-cyan-600 text-white px-4 h-8 text-xs font-semibold rounded-lg flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> New Coupon
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Dodo Payments Configuration Card replaced by Unified Pricing & Payments Card */}

      {/* Tier Features List Customizer */}
        <Card className="bg-zinc-900 border-zinc-800 shadow-none md:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-zinc-200">
              <Settings className="w-4 h-4 text-teal-400" /> Tier Features List Customizer
            </CardTitle>
            <CardDescription className="text-zinc-500 text-xs">
              Customize the feature bullet points shown on each pricing card. Bold items appear highlighted. Changes are saved with "Save System Settings".
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
              {([
                { planKey: 'free'          as const, label: 'Free',          color: 'text-green-400',  items: freeFeatures,     setItems: setFreeFeatures },
                { planKey: 'recovery_pass' as const, label: 'Recovery Pass', color: 'text-zinc-300',   items: recoveryFeatures, setItems: setRecoveryFeatures },
                { planKey: 'pro'           as const, label: 'Pro Lifetime',  color: 'text-blue-400',   items: proFeatures,      setItems: setProFeatures },
                { planKey: 'super'         as const, label: 'Super Lifetime',color: 'text-amber-400',  items: superFeatures,    setItems: setSuperFeatures },
              ]).map(({ planKey, label, color, items, setItems }) => (
                <div key={planKey} className="bg-zinc-950/30 border border-zinc-800/60 rounded-xl p-4 space-y-3">
                  {/* Column accent header */}
                  <div className={`text-xs font-bold ${color} border-b border-zinc-800/80 pb-2`}>{label}</div>

                  {/* Heading input */}
                  <div className="space-y-1">
                    <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">Heading</label>
                    <input
                      type="text"
                      value={headings[planKey]}
                      onChange={(e) => setHeadings(prev => ({ ...prev, [planKey]: e.target.value }))}
                      placeholder="Card heading…"
                      className={`w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-[12px] font-bold focus:outline-none focus:border-indigo-500 ${color} transition-colors`}
                    />
                  </div>

                  {/* Subheading input */}
                  <div className="space-y-1">
                    <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">Sub-heading</label>
                    <input
                      type="text"
                      value={subheadings[planKey]}
                      onChange={(e) => setSubheadings(prev => ({ ...prev, [planKey]: e.target.value }))}
                      placeholder="Card sub-heading…"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-[11px] text-zinc-400 focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>

                  {/* Feature bullet list divider */}
                  <div className="text-[10px] text-zinc-600 uppercase tracking-widest font-semibold pt-1 border-t border-zinc-800/60">Feature Bullets</div>
                  <div className="space-y-2">
                    {(items as FeatureItem[]).map((feat, idx) => (
                      <div key={idx} className="flex items-center gap-1.5">
                        <button
                          type="button"
                          title={feat.isBold ? "Bold: ON" : "Bold: OFF"}
                          onClick={() => {
                            const updated = (items as FeatureItem[]).map((f, i) => i === idx ? { ...f, isBold: !f.isBold } : f);
                            (setItems as React.Dispatch<React.SetStateAction<FeatureItem[]>>)(updated);
                          }}
                          className={`shrink-0 w-6 h-6 rounded text-[10px] font-black border transition-all ${
                            feat.isBold
                              ? 'bg-indigo-600 border-indigo-500 text-white'
                              : 'bg-zinc-800 border-zinc-700 text-zinc-500 hover:border-zinc-500'
                          }`}
                        >B</button>
                        <input
                          type="text"
                          value={feat.text}
                          onChange={(e) => {
                            const updated = (items as FeatureItem[]).map((f, i) => i === idx ? { ...f, text: e.target.value } : f);
                            (setItems as React.Dispatch<React.SetStateAction<FeatureItem[]>>)(updated);
                          }}
                          className={`flex-1 min-w-0 bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-[11px] focus:outline-none focus:border-indigo-500 ${feat.isBold ? 'font-bold text-white' : 'text-zinc-300'}`}
                        />
                        <button
                          type="button"
                          title="Delete"
                          onClick={() => {
                            (setItems as React.Dispatch<React.SetStateAction<FeatureItem[]>>)((items as FeatureItem[]).filter((_, i) => i !== idx));
                          }}
                          className="shrink-0 w-6 h-6 rounded text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 flex items-center justify-center transition-all"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      (setItems as React.Dispatch<React.SetStateAction<FeatureItem[]>>)([...(items as FeatureItem[]), { text: '', isBold: false }]);
                    }}
                    className="flex items-center gap-1.5 text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors mt-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Feature
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

      </div>

      {/* ─── FAQ Manager ────────────────────────────────────────────────── */}
      <Card className="bg-zinc-900 border-zinc-800 shadow-none">
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-zinc-200">
            <MessageSquare className="w-4 h-4 text-cyan-400" /> FAQ Manager
          </CardTitle>
          <CardDescription className="text-zinc-500 text-xs">
            Add, edit, reorder, or remove FAQ cards shown on the landing page. Saved independently — click <strong className="text-zinc-400">Save FAQs</strong> below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-3 max-h-[560px] overflow-y-auto pr-1 custom-faq-scroll">
          {faqItems.map((faq, idx) => (
            <div key={faq.id} className="bg-zinc-950/40 border border-zinc-800/70 rounded-xl p-4 space-y-3">

              {/* Row header: reorder + index + tag + delete */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button type="button" onClick={() => moveFaq(idx, -1)} disabled={idx === 0}
                    className="w-5 h-5 rounded flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-20 transition-all">
                    <ChevronUp className="w-3 h-3" />
                  </button>
                  <button type="button" onClick={() => moveFaq(idx, 1)} disabled={idx === faqItems.length - 1}
                    className="w-5 h-5 rounded flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-20 transition-all">
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </div>

                <span className="text-[10px] text-zinc-600 font-mono w-5 shrink-0 text-center">#{idx + 1}</span>

                <select value={faq.tag} onChange={(e) => updateFaq(idx, 'tag', e.target.value)}
                  className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-[11px] rounded-lg px-2 py-1 focus:outline-none focus:border-cyan-500 cursor-pointer">
                  {FAQ_TAGS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>

                <button type="button" onClick={() => deleteFaq(idx)}
                  className="ml-auto w-7 h-7 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Question */}
              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold block mb-1">Question</label>
                <input type="text" value={faq.question}
                  onChange={(e) => updateFaq(idx, 'question', e.target.value)}
                  placeholder="e.g. Why are my JSON metadata files missing?"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-zinc-100 focus:outline-none focus:border-cyan-500 transition-colors" />
              </div>

              {/* Answer */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">Answer</label>
                  <span className="text-[9px] text-zinc-600 bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5 font-mono select-none">
                    Ctrl+B = <strong className="text-zinc-400">bold</strong>
                  </span>
                </div>
                <textarea value={faq.answer}
                  onChange={(e) => updateFaq(idx, 'answer', e.target.value)}
                  onKeyDown={(e) => handleAnswerKeyDown(e, idx)}
                  placeholder="Write the full answer here… select text then Ctrl+B to bold"
                  rows={3}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-[11px] text-zinc-300 leading-relaxed focus:outline-none focus:border-cyan-500 transition-colors resize-y" />
              </div>
            </div>
          ))}
          </div>

          <button type="button" onClick={addFaq}
            className="flex items-center gap-2 text-[11px] text-cyan-400 hover:text-cyan-300 font-semibold transition-colors mt-1">
            <Plus className="w-3.5 h-3.5" /> Add FAQ
          </button>
        </CardContent>
      </Card>

      {/* FAQ save footer */}
      <div className="flex justify-end gap-3 border-t border-cyan-900/30 pt-4">
        <Button type="button" onClick={handleSaveFaqs} disabled={savingFaqs}
          className="bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-white px-6 h-10 text-xs font-semibold rounded-xl">
          {savingFaqs ? "Saving FAQs…" : "Save FAQs"}
        </Button>
      </div>

      {/* Global save footer */}
      <div className="flex justify-end gap-3 border-t border-zinc-800 pt-6 mt-4">
        <Button 
          type="button"
          onClick={handleSaveGlobalSettings} 
          disabled={savingGlobal}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-6 h-10 text-xs font-semibold rounded-xl"
        >
          {savingGlobal ? "Saving System Settings..." : "Save System Settings"}
        </Button>
      </div>
    </div>
  )
}
