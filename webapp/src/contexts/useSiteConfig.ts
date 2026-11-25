import { useEffect, useState } from "react";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

export interface FeatureItem {
  text: string;
  isBold: boolean;
}
export interface ComparisonRow {
  featureName: string;
  free: string;
  recovery_pass: string;
  pro: string;
  super: string;
  isDynamicLimit?: boolean;
  isDynamicTelemetry?: boolean;
}

export const DEFAULT_COMPARISON_ROWS: ComparisonRow[] = [
  { featureName: "Device Access", free: "Unlimited", recovery_pass: "Unlimited", pro: "Unlimited", super: "Unlimited" },
  { featureName: "Processing Limit", free: "", recovery_pass: "", pro: "", super: "", isDynamicLimit: true },
  { featureName: "Photo Matching", free: "Unavailable", recovery_pass: "Unavailable", pro: "Unavailable", super: "Unavailable", isDynamicTelemetry: true },
  { featureName: "Advanced Media Tools", free: "—", recovery_pass: "—", pro: "—", super: "Included" },
  { featureName: "No Ads Window", free: "—", recovery_pass: "—", pro: "—", super: "✓ Enabled" },
];

export const formatThresholdLimit = (maxSizeMB?: number, maxFiles?: number): string => {
  const sizeVal = maxSizeMB ?? 0;
  const filesVal = maxFiles ?? 0;
  if (sizeVal === 0 && filesVal === 0) return "Unlimited";
  const sizeStr = sizeVal === 0 ? "Unlimited" : (sizeVal >= 1024 ? `${(sizeVal / 1024).toFixed(0)} GB` : `${sizeVal} MB`);
  const filesStr = filesVal === 0 ? "Unlimited files" : `${filesVal.toLocaleString()} files`;
  return `${sizeStr} (${filesStr})`;
};

export const resolveComparisonRowValues = (
  row: ComparisonRow,
  tierThresholds?: Record<string, { maxFiles: number; maxSizeMB: number }>,
  telemetryAccuracy: string = ""
) => {
  if (row.isDynamicLimit) {
    const freeVal = formatThresholdLimit(tierThresholds?.free?.maxSizeMB, tierThresholds?.free?.maxFiles);
    const recoveryVal = formatThresholdLimit(tierThresholds?.recovery_pass?.maxSizeMB, tierThresholds?.recovery_pass?.maxFiles);
    const proVal = (tierThresholds?.pro?.maxSizeMB === 0 && tierThresholds?.pro?.maxFiles === 0)
      ? "Unlimited"
      : formatThresholdLimit(tierThresholds?.pro?.maxSizeMB, tierThresholds?.pro?.maxFiles);
    const superVal = (tierThresholds?.super?.maxSizeMB === 0 && tierThresholds?.super?.maxFiles === 0)
      ? "Unlimited"
      : formatThresholdLimit(tierThresholds?.super?.maxSizeMB, tierThresholds?.super?.maxFiles);
    return { free: freeVal, recovery_pass: recoveryVal, pro: proVal, super: superVal };
  }

  const isTelemetry = row.isDynamicTelemetry || (row.isDynamicTelemetry !== false && row.featureName?.toLowerCase().includes("matching"));
  if (isTelemetry) {
    const value = telemetryAccuracy ? `Up to ${telemetryAccuracy}*` : "Unavailable";
    return {
      free: value,
      recovery_pass: value,
      pro: value,
      super: value
    };
  }

  return {
    free: row.free,
    recovery_pass: row.recovery_pass,
    pro: row.pro,
    super: row.super
  };
};

export interface FeaturesConfig {
  free: FeatureItem[];
  recovery_pass: FeatureItem[];
  pro: FeatureItem[];
  super: FeatureItem[];
  headings: {
    free: string;
    recovery_pass: string;
    pro: string;
    super: string;
  };
  subheadings: {
    free: string;
    recovery_pass: string;
    pro: string;
    super: string;
  };
}

export const DEFAULT_FEATURES_CONFIG: FeaturesConfig = {
  headings: {
    free: "Free",
    recovery_pass: "Recovery Pass",
    pro: "Pro Lifetime",
    super: "Super Lifetime"
  },
  subheadings: {
    free: "Free up to 250 files or 500MB",
    recovery_pass: "Unlimited file restoration for 24 hours",
    pro: "Unlimited photos and videos. 2 devices. Lifetime.",
    super: "Unlimited + duplicate finder, before/after logs, ad-free. 3 devices. Lifetime."
  },
  free: [
    { text: "Free up to 250 files or 500MB", isBold: false },
    { text: "Restores original dates & times", isBold: false },
    { text: "Works directly in your browser", isBold: false },
    { text: "Photos stay 100% private", isBold: false }
  ],
  recovery_pass: [
    { text: "Unlimited files & storage for 24 hours", isBold: true },
    { text: "Friendly support help desk", isBold: false },
    { text: "Download clean file update logs", isBold: false }
  ],
  pro: [
    { text: "Unlimited photos & videos", isBold: true },
    { text: "Keep history of your runs", isBold: false },
    { text: "Priority support messages", isBold: false }
  ],
  super: [
    { text: "Complete ad-free experience", isBold: true },
    { text: "View hidden photo details", isBold: false },
    { text: "Find and clean duplicates", isBold: false },
    { text: "Compare before & after logs", isBold: false }
  ]
};

// Re-export static pricing data from standalone module to avoid duplicating definitions.
// Astro pages should import directly from '../lib/planPrices' to avoid pulling Firebase into the build graph.
import type { PlanPrices } from '../lib/planPrices';
export function useSiteConfig() {
  // Nested region → plan → productId map
  const REGIONS = ['in', 't1', 't2', 't3', 't4', 'eu', 'jp', 'cn'];
  const PLANS = ['recovery_pass', 'pro', 'super']; // Permanently removed family plan
  const buildEmptyProductIds = () => Object.fromEntries(
    REGIONS.map(r => [r, Object.fromEntries(PLANS.map(p => [p, ""]))])
  );

  const [dodoProductIds, setDodoProductIds] = useState<Record<string, Record<string, string>>>(
    buildEmptyProductIds()
  );

  const [dodoTestMode, setDodoTestMode] = useState<boolean>(false);
  const [foundingCount, setFoundingCount] = useState<number>(0);

  // New pricing & campaigns states
  const [pricingTiers, setPricingTiers] = useState<Record<string, any>>({});
  const [campaigns, setCampaigns] = useState<any>(null);
  const [activeCampaignDiscounts, setActiveCampaignDiscounts] = useState<Record<string, { discountType: string; discountValue: number }>>({});
  const [featuresConfig, setFeaturesConfig] = useState<FeaturesConfig>(DEFAULT_FEATURES_CONFIG);
  const [tierThresholds, setTierThresholds] = useState<Record<string, { maxFiles: number; maxSizeMB: number }>>({
    free:          { maxFiles: 250,    maxSizeMB: 500    },
    recovery_pass: { maxFiles: 3000,   maxSizeMB: 3072   },
    pro:           { maxFiles: 50000,  maxSizeMB: 51200  },
    super:         { maxFiles: 100000, maxSizeMB: 102400 },
  });
  const [recoveryPassHours, setRecoveryPassHours] = useState<number>(24);
  const [refundPolicy, setRefundPolicy] = useState<string>("We offer a 100% Recovery Guarantee: if a verified technical issue prevents your restoration, and our support desk is unable to resolve it, we will issue a full refund within 7 days of purchase. Refunds are not available for change of mind or successfully completed recoveries.");
  const [comparisonRows, setComparisonRows] = useState<ComparisonRow[]>(DEFAULT_COMPARISON_ROWS);
  const telemetryAccuracy = "";
  const [platformStats, setPlatformStats] = useState<any>(null);

  useEffect(() => {
    if (!db) return;
    const unsub = onSnapshot(doc(db, "platform_stats", "global"), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setPlatformStats(data);
      }
    }, (err) => {
      console.warn("AuthContext: platform_stats listener error:", err);
    });
    return () => unsub();
  }, []);

  const [isFreePromoActive, setIsFreePromoActive] = useState(false);
  const [maintenance, setMaintenance] = useState(false);
  const [enablePricingAndPayments, setEnablePricingAndPayments] = useState<boolean>(false);

  useEffect(() => {
    if (!db) return;
    const unsub = onSnapshot(doc(db, "settings", "global"), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.enablePricingAndPayments !== undefined) {
          setEnablePricingAndPayments(Boolean(data.enablePricingAndPayments));
        }
        setMaintenance(data.maintenance ?? false);
        const promo = data.freeUnlimitedPromo;
        if (promo && promo.enabled && promo.endsAt && Date.now() < promo.endsAt) {
          setIsFreePromoActive(true);
        } else {
          setIsFreePromoActive(false);
        }
      }
    }, error => console.error("Global settings query error:", error));
    return () => unsub();
  }, []);

  // Cached config loader — uses 3-minute sessionStorage cache to drastically reduce
  // Firestore reads across page navigations. Admin pages call refreshConfig() to force re-fetch.
  const CACHE_KEY = "takeoutfix_cached_global_config";
  const CACHE_TTL = 30 * 60 * 1000; // 30 minutes cache to minimize Firestore reads

  const loadGlobalConfig = async (forceRefresh: boolean = false) => {
    if (!forceRefresh && typeof window !== 'undefined') {
      try {
        const cachedStr = sessionStorage.getItem(CACHE_KEY);
        if (cachedStr) {
          const { data, timestamp } = JSON.parse(cachedStr);
          if (Date.now() - (timestamp || 0) < CACHE_TTL) {
            if (data.recoveryPassHours !== undefined) setRecoveryPassHours(data.recoveryPassHours);
            if (data.dodoProductIds) setDodoProductIds(data.dodoProductIds);
            if (data.dodoTestMode !== undefined) setDodoTestMode(data.dodoTestMode);
            if (data.featuresConfig) setFeaturesConfig(data.featuresConfig);
            if (data.tierThresholds) setTierThresholds(data.tierThresholds);
            if (data.refundPolicy) setRefundPolicy(data.refundPolicy);
            if (data.comparisonRows) {
              setComparisonRows(data.comparisonRows.map((r: ComparisonRow) => {
                if (r.featureName?.toLowerCase().includes("matching") && r.isDynamicTelemetry === undefined) {
                  return { ...r, isDynamicTelemetry: true };
                }
                return r;
              }));
            }
            if (data.foundingCount !== undefined) setFoundingCount(data.foundingCount);
            if (data.pricingTiers) setPricingTiers(data.pricingTiers);
            if (data.campaigns !== undefined) setCampaigns(data.campaigns);
            if (data.activeCampaignDiscounts) setActiveCampaignDiscounts(data.activeCampaignDiscounts);
            return;
          }
        }
      } catch (_) {}
    }

    try {
      let recPassHours = 24;
      let newProductIds = buildEmptyProductIds();
      let newTestMode = false;
      let newFeatures = DEFAULT_FEATURES_CONFIG;
      let newThresholds = {
        free:          { maxFiles: 250,    maxSizeMB: 500    },
        recovery_pass: { maxFiles: 3000,   maxSizeMB: 3072   },
        pro:           { maxFiles: 50000,  maxSizeMB: 51200  },
        super:         { maxFiles: 100000, maxSizeMB: 102400 },
      };
      let newRefund = refundPolicy;
      let newComparison = DEFAULT_COMPARISON_ROWS;

      // 1. settings/global
      const globalSnap = await getDoc(doc(db, "settings", "global"));
      if (globalSnap.exists()) {
        const data = globalSnap.data();
        if (data.recoveryPassHours !== undefined) {
          recPassHours = Number(data.recoveryPassHours);
          setRecoveryPassHours(recPassHours);
        }
        if (data.enablePricingAndPayments !== undefined) {
          setEnablePricingAndPayments(Boolean(data.enablePricingAndPayments));
        }
        const isTestMode = data.dodo_test_mode === true;
        newTestMode = isTestMode;
        setDodoTestMode(newTestMode);

        const stored = (isTestMode ? data.dodo_products_test : data.dodo_products_live) as Record<string, Record<string, string>> | undefined
          || data.dodo_products as Record<string, Record<string, string>> | undefined;
        if (stored) {
          const merged = buildEmptyProductIds();
          REGIONS.forEach(r => {
            if (stored[r]) {
              PLANS.forEach(p => {
                merged[r][p] = stored[r][p] || "";
              });
            }
          });
          newProductIds = merged;
          setDodoProductIds(merged);
        }

        const storedFeatures = data.features_config as FeaturesConfig | undefined;
        if (storedFeatures) {
          newFeatures = {
            free: storedFeatures.free || DEFAULT_FEATURES_CONFIG.free,
            recovery_pass: storedFeatures.recovery_pass || DEFAULT_FEATURES_CONFIG.recovery_pass,
            pro: storedFeatures.pro || DEFAULT_FEATURES_CONFIG.pro,
            super: storedFeatures.super || DEFAULT_FEATURES_CONFIG.super,
            headings: {
              free: storedFeatures.headings?.free ?? DEFAULT_FEATURES_CONFIG.headings.free,
              recovery_pass: storedFeatures.headings?.recovery_pass ?? DEFAULT_FEATURES_CONFIG.headings.recovery_pass,
              pro: storedFeatures.headings?.pro ?? DEFAULT_FEATURES_CONFIG.headings.pro,
              super: storedFeatures.headings?.super ?? DEFAULT_FEATURES_CONFIG.headings.super,
            },
            subheadings: {
              free: storedFeatures.subheadings?.free ?? DEFAULT_FEATURES_CONFIG.subheadings.free,
              recovery_pass: storedFeatures.subheadings?.recovery_pass ?? DEFAULT_FEATURES_CONFIG.subheadings.recovery_pass,
              pro: storedFeatures.subheadings?.pro ?? DEFAULT_FEATURES_CONFIG.subheadings.pro,
              super: storedFeatures.subheadings?.super ?? DEFAULT_FEATURES_CONFIG.subheadings.super,
            },
          };
        }
        setFeaturesConfig(newFeatures);

        const storedThresholds = data.tierThresholds;
        if (storedThresholds) {
          newThresholds = {
            free: {
              maxFiles: Number(storedThresholds.free?.maxFiles ?? 250),
              maxSizeMB: Number(storedThresholds.free?.maxSizeMB ?? 500)
            },
            recovery_pass: {
              maxFiles: Number(storedThresholds.recovery_pass?.maxFiles ?? 3000),
              maxSizeMB: Number(storedThresholds.recovery_pass?.maxSizeMB ?? 3072)
            },
            pro: {
              maxFiles: Number(storedThresholds.pro?.maxFiles ?? 50000),
              maxSizeMB: Number(storedThresholds.pro?.maxSizeMB ?? 51200)
            },
            super: {
              maxFiles: Number(storedThresholds.super?.maxFiles ?? 100000),
              maxSizeMB: Number(storedThresholds.super?.maxSizeMB ?? 102400)
            }
          };
          setTierThresholds(newThresholds);
        }
        const storedRefundPolicy = data.refundPolicy as string | undefined;
        if (storedRefundPolicy) {
          newRefund = storedRefundPolicy;
          setRefundPolicy(newRefund);
        }
        const storedComparisonRows = data.comparisonRows as ComparisonRow[] | undefined;
        if (storedComparisonRows && Array.isArray(storedComparisonRows)) {
          newComparison = storedComparisonRows.map(r => {
            if (r.featureName?.toLowerCase().includes("matching") && r.isDynamicTelemetry === undefined) {
              return { ...r, isDynamicTelemetry: true };
            }
            return r;
          });
        }
        setComparisonRows(newComparison);
      }

      // 2. config/foundingMembers
      let newFounding = 0;
      const foundingSnap = await getDoc(doc(db, "config", "foundingMembers"));
      if (foundingSnap.exists()) {
        newFounding = foundingSnap.data().count ?? 0;
        setFoundingCount(newFounding);
      }

      // 3. pricing_tiers, campaigns, discounts — defaults kept empty as site is 100% free
      setPricingTiers({});
      setCampaigns(null);
      setActiveCampaignDiscounts({});

      // Cache snapshot into sessionStorage
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify({
            data: {
              recoveryPassHours: recPassHours,
              dodoProductIds: newProductIds,
              dodoTestMode: newTestMode,
              featuresConfig: newFeatures,
              tierThresholds: newThresholds,
              refundPolicy: newRefund,
              comparisonRows: newComparison,
              foundingCount: newFounding,
              pricingTiers: {},
              campaigns: null,
              activeCampaignDiscounts: {}
            },
            timestamp: Date.now()
          }));
        } catch (_) {}
      }
    } catch (err) {
      console.error("Failed to load global config:", err);
    }
  };

  // Expose refreshConfig for admin pages to re-fetch after config edits
  const refreshConfig = () => {
    try { sessionStorage.removeItem("takeoutfix_cached_global_config"); } catch (_) {}
    return loadGlobalConfig(true);
  };

  useEffect(() => {
    loadGlobalConfig();
  }, []);

  return {
    dodoProductIds,
    dodoTestMode,
    foundingCount,
    pricingTiers,
    campaigns,
    activeCampaignDiscounts,
    featuresConfig,
    tierThresholds,
    recoveryPassHours,
    refundPolicy,
    comparisonRows,
    telemetryAccuracy,
    platformStats,
    enablePricingAndPayments,
    isFreePromoActive,
    refreshConfig,
    maintenance,
  };
}
