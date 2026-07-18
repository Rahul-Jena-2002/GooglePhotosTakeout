import React, { createContext, useContext, useEffect, useState } from 'react';
import { type User, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, getDocs, collection, query, where, deleteDoc, onSnapshot, increment, addDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { indexedDbService } from '../lib/indexedDbService';
import { useToastStore } from '../store/useToastStore';
import { REGION_PRICING_CONFIGS, formatPrice, PLAN_PRICES, getRegionFromCountry } from '../lib/planPrices';

export type PlanType = 'free' | 'recovery_pass' | 'pro' | 'super';
export type AdminRole = 'SUPER_ADMIN' | 'ADMIN' | 'SUPPORT' | 'MODERATOR' | 'DEVELOPER';

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
}

export const DEFAULT_COMPARISON_ROWS: ComparisonRow[] = [
  { featureName: "Device Limit", free: "1 device", recovery_pass: "1 device", pro: "2 devices", super: "3 devices" },
  { featureName: "Processing Limit", free: "", recovery_pass: "", pro: "", super: "", isDynamicLimit: true },
  { featureName: "Photo Matching", free: "Up to 90%", recovery_pass: "Up to 100%", pro: "Up to 90%", super: "Up to 90%" },
  { featureName: "Advanced Media Tools", free: "—", recovery_pass: "—", pro: "—", super: "Included" },
  { featureName: "No Ads Window", free: "—", recovery_pass: "—", pro: "—", super: "✓ Enabled" },
];

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
export type { PlanPrices, RegionPricingConfig, CountryOption } from '../lib/planPrices';
export { REGION_PRICING_CONFIGS, formatPrice, getActivePrice, PLAN_PRICES, COUNTRIES, getRegionFromCountry } from '../lib/planPrices';

const SUPER_ADMIN_EMAILS = ['rahuljena.dev@gmail.com'];

export interface UserData {
  plan: PlanType;
  usedBytes: number;
  usedFiles: number;
  totalBytesProcessed: number;
  totalFilesProcessed: number;
  expiresAt: number | null;
  isAdmin: boolean;
  email?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
  suspended?: boolean;
  createdAt?: number;
  licenseType?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  sessionIds?: string[];
  supportWithAds?: boolean;
}

export interface AdminData {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  role: AdminRole;
  status: 'online' | 'idle' | 'offline';
  lastSeen: number;
  createdAt: number;
}

export interface InviteFacet {
  pendingInvite: any;
  accept: (inviteId: string) => Promise<void>;
  decline: (inviteId: string) => Promise<void>;
}

interface AuthContextType {
  user: User | null;
  userData: UserData | null;
  adminData: AdminData | null;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refreshUserData: () => Promise<void>;
  region: string;
  setRegion: (r: string) => void;
  selectedCountry: string;
  setSelectedCountry: (code: string) => void;
  prices: PlanPrices;
  finalPrices: PlanPrices;
  wasPrices: PlanPrices;
  foundingCount: number;
  isFounding: boolean;
  slotsRemaining: number;
  getPlanPriceValue: (planKey: string, regionKey: string) => number;
  dodoProductIds: Record<string, Record<string, string>>;
  dodoTestMode: boolean;
  pricingTiers: Record<string, any>;
  campaigns: any;          // active campaign doc (or null)
  activeCampaignDiscounts: Record<string, { discountType: string; discountValue: number }>; // planCode -> discount
  isPromoCardVisible: boolean;
  promoCardDetails: any;
  bannerText: string;
  featuresConfig: FeaturesConfig;
  tierThresholds: Record<string, { maxFiles: number; maxSizeMB: number }>;
  recoveryPassHours: number;
  refundPolicy: string;
  comparisonRows: ComparisonRow[];
  refreshConfig: () => Promise<void>;
  inviteFacet: InviteFacet;
}

const getPlanDeviceLimit = (plan: string): number => {
  if (plan === 'pro') return 2;
  if (plan === 'super') return 3;
  return 1;
};

const generateUniqueUsername = async (email: string, displayName: string, uid: string): Promise<string> => {
  const base = (email ? email.split('@')[0] : (displayName ? displayName.replace(/\s+/g, '') : 'user'))
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  let attempt = 0;
  while (attempt < 10) {
    const candidate = attempt === 0 && base.length >= 3 && base.length <= 20 
      ? base 
      : `${base.slice(0, 14)}_${Math.floor(1000 + Math.random() * 9000)}`;
    
    const q = query(collection(db, "users"), where("username", "==", candidate));
    const snap = await getDocs(q);
    let isTaken = false;
    snap.forEach((doc) => {
      if (doc.id !== uid) {
        isTaken = true;
      }
    });
    if (!isTaken) {
      return candidate;
    }
    attempt++;
  }
  return `${base.slice(0, 14)}_${Date.now().toString().slice(-6)}`;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserDataState] = useState<UserData | null>(() => {
    try {
      const saved = localStorage.getItem("takeoutfix_user_data");
      return saved ? JSON.parse(saved) : null;
    } catch (_) {
      return null;
    }
  });
  const [adminData, setAdminDataState] = useState<AdminData | null>(() => {
    try {
      const saved = localStorage.getItem("takeoutfix_admin_data");
      return saved ? JSON.parse(saved) : null;
    } catch (_) {
      return null;
    }
  });
  const [loading, setLoading] = useState(() => {
    try {
      const saved = localStorage.getItem("takeoutfix_user_data");
      return saved ? false : true;
    } catch (_) {
      return true;
    }
  });

  const [sessionRegistered, setSessionRegistered] = useState(false);
  const [hasSeenSelfInSessions, setHasSeenSelfInSessions] = useState(false);
  const [showDeviceLimitModal, setShowDeviceLimitModal] = useState(false);
  const [pendingSessionData, setPendingSessionData] = useState<any>(null);

  const setUserData = (data: UserData | null) => {
    setUserDataState(data);
    try {
      if (data) {
        localStorage.setItem("takeoutfix_user_data", JSON.stringify(data));
      } else {
        localStorage.removeItem("takeoutfix_user_data");
      }
    } catch (_) {}
  };

  const setAdminData = (data: AdminData | null) => {
    setAdminDataState(data);
    try {
      if (data) {
        localStorage.setItem("takeoutfix_admin_data", JSON.stringify(data));
      } else {
        localStorage.removeItem("takeoutfix_admin_data");
      }
    } catch (_) {}
  };
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
  const REGION_DOC_IDS: Record<string, string> = {
    in: "India",
    cn: "China",
    jp: "Japan",
    eu: "Europe",
    t1: "Tier 1",
    t2: "Tier 2",
    t3: "US (Tier 3)",
    t4: "Tier 4"
  };

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

  // One-shot config loader — replaces 4 unconditional onSnapshot listeners
  // to eliminate persistent Firestore WebSocket connections on every page load.
  // Admin pages can call refreshConfig() to re-fetch after edits.
  const loadGlobalConfig = async () => {
    try {
      // 1. settings/global
      const globalSnap = await getDoc(doc(db, "settings", "global"));
      if (globalSnap.exists()) {
        const data = globalSnap.data();
        if (data.recoveryPassHours !== undefined) {
          setRecoveryPassHours(Number(data.recoveryPassHours));
        }
        const isTestMode = data.dodo_test_mode === true;
        const stored = (isTestMode ? data.dodo_products_test : data.dodo_products_live) as Record<string, Record<string, string>> | undefined
          || data.dodo_products as Record<string, Record<string, string>> | undefined;
        if (stored) {
          setDodoProductIds(() => {
            const merged = buildEmptyProductIds();
            REGIONS.forEach(r => {
              if (stored[r]) {
                PLANS.forEach(p => {
                  merged[r][p] = stored[r][p] || "";
                });
              }
            });
            return merged;
          });
        }
        setDodoTestMode(data.dodo_test_mode ?? false);

        const storedFeatures = data.features_config as FeaturesConfig | undefined;
        if (storedFeatures) {
          setFeaturesConfig({
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
          });
        } else {
          setFeaturesConfig(DEFAULT_FEATURES_CONFIG);
        }

        const storedThresholds = data.tierThresholds;
        if (storedThresholds) {
          setTierThresholds({
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
          });
        }
        const storedRefundPolicy = data.refundPolicy as string | undefined;
        if (storedRefundPolicy) {
          setRefundPolicy(storedRefundPolicy);
        }
        const storedComparisonRows = data.comparisonRows as ComparisonRow[] | undefined;
        if (storedComparisonRows && Array.isArray(storedComparisonRows)) {
          setComparisonRows(storedComparisonRows);
        } else {
          setComparisonRows(DEFAULT_COMPARISON_ROWS);
        }
      }

      // 2. config/foundingMembers
      const foundingSnap = await getDoc(doc(db, "config", "foundingMembers"));
      if (foundingSnap.exists()) {
        setFoundingCount(foundingSnap.data().count ?? 0);
      }

      // 3. pricing_tiers (collection)
      const tiersSnap = await getDocs(collection(db, "pricing_tiers"));
      const tiersData: Record<string, any> = {};
      tiersSnap.forEach((d) => {
        tiersData[d.id] = d.data();
      });
      setPricingTiers(tiersData);

      // 4. campaigns (collection) — pick active+enabled campaign
      const campaignsSnap = await getDocs(collection(db, "campaigns"));
      const activeCampaign = campaignsSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .find((c: any) => c.isEnabled === true && c.status === 'ACTIVE') || null;
      setCampaigns(activeCampaign);

      if (activeCampaign?.id) {
        const discSnap = await getDocs(collection(db, "campaigns", activeCampaign.id, "discounts"));
        const discounts: Record<string, { discountType: string; discountValue: number }> = {};
        discSnap.forEach(d => {
          const data = d.data();
          discounts[data.planCode] = { discountType: data.discountType, discountValue: data.discountValue };
        });
        setActiveCampaignDiscounts(discounts);
      } else {
        setActiveCampaignDiscounts({});
      }
    } catch (err) {
      console.error("Failed to load global config:", err);
    }
  };

  // Expose refreshConfig for admin pages to re-fetch after config edits
  const refreshConfig = loadGlobalConfig;

  useEffect(() => {
    loadGlobalConfig();
  }, []);


  // Auto-register developer as superadmin on Firestore when on localhost
  useEffect(() => {
    if (import.meta.env.DEV && user && user.email && SUPER_ADMIN_EMAILS.includes(user.email)) {
      const registerLocalAdmin = async () => {
        try {
          await setDoc(doc(db, "admins", user.uid), {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName || "Local Admin",
            role: "SUPER_ADMIN",
            status: "online",
            lastSeen: Date.now(),
            createdAt: Date.now()
          }, { merge: true });
          
          await setDoc(doc(db, "users", user.uid), {
            isAdmin: true
          }, { merge: true });
          
          console.log("🚀 Registered current developer user as Super Admin in Firestore.");
        } catch (e) {
          console.warn("Auto-register admin failed:", e);
        }
      };
      registerLocalAdmin();
    }
  }, [user]);
  const [selectedCountry, setSelectedCountryState] = useState<string>(() => {
    try {
      const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
      if (!isLocalhost) {
        const saved = localStorage.getItem("takeoutfix_detected_country");
        if (saved) return saved.toUpperCase();
      }
      
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) {
        const lowerTz = tz.toLowerCase();
        if (lowerTz.includes("kolkata") || lowerTz.includes("calcutta") || lowerTz.includes("india")) return "IN";
        if (lowerTz.includes("tokyo") || lowerTz.includes("japan")) return "JP";
        if (lowerTz.includes("shanghai") || lowerTz.includes("beijing") || lowerTz.includes("china")) return "CN";
        if (lowerTz.includes("europe") || lowerTz.includes("london") || lowerTz.includes("paris") || lowerTz.includes("berlin") || lowerTz.includes("madrid")) return "GB";
      }
      const lang = (navigator.language || "").toLowerCase();
      if (lang.startsWith("en-in") || lang.startsWith("hi")) return "IN";
      if (lang.startsWith("ja")) return "JP";
      if (lang.startsWith("zh")) return "CN";
      if (lang.startsWith("de") || lang.startsWith("fr") || lang.startsWith("it") || lang.startsWith("es")) return "DE";
    } catch (_) {}
    return "IN";
  });

  const region = getRegionFromCountry(selectedCountry);

  const setSelectedCountry = (code: string) => {
    const upper = code.toUpperCase();
    setSelectedCountryState(upper);
    try {
      localStorage.setItem("takeoutfix_detected_country", upper);
    } catch (_) {}
  };

  const setRegion = (newRegion: string) => {
    const r = newRegion.toLowerCase();
    if (r === 'in') setSelectedCountry('IN');
    else if (r === 'cn') setSelectedCountry('CN');
    else if (r === 'jp') setSelectedCountry('JP');
    else if (r === 'eu') setSelectedCountry('DE'); 
    else if (r === 't1') setSelectedCountry('PK');
    else if (r === 't2') setSelectedCountry('MY');
    else if (r === 't4') setSelectedCountry('AD');
    else setSelectedCountry('US');
  };

  // DYNAMIC CALCULATIONS: Replaced all old hardcoded switch lookups
  const getDynamicPrices = (regionKey: string, useLaunchIfFounding: boolean): PlanPrices => {
    const docId = REGION_DOC_IDS[regionKey] || REGION_DOC_IDS.t3;
    const firestoreConfig = pricingTiers[docId];
    const staticConfig = REGION_PRICING_CONFIGS[regionKey] || REGION_PRICING_CONFIGS.t3;

    const currency = firestoreConfig?.currency_code || staticConfig.currency;
    const symbol = firestoreConfig?.currency_symbol || staticConfig.symbol;

    const recoveryPassPrice = firestoreConfig?.recovery_pass?.current ?? staticConfig.recoveryPass;
    const finalPro = firestoreConfig?.pro_lifetime?.current ?? staticConfig.finalPro;
    const finalSuper = firestoreConfig?.super_lifetime?.current ?? staticConfig.finalSuper;

    const proDisc = getCampaignDiscount('pro');
    const superDisc = getCampaignDiscount('super');
    const recovDisc = getCampaignDiscount('recovery_pass');

    const proPrice = proDisc > 0 ? Number((finalPro * (1 - proDisc / 100)).toFixed(2)) : finalPro;
    const superPrice = superDisc > 0 ? Number((finalSuper * (1 - superDisc / 100)).toFixed(2)) : finalSuper;
    const recovPrice = recovDisc > 0 ? Number((recoveryPassPrice * (1 - recovDisc / 100)).toFixed(2)) : recoveryPassPrice;

    return {
      recovery_pass: formatPrice(symbol, recovPrice, currency),
      pro: formatPrice(symbol, proPrice, currency),
      super: formatPrice(symbol, superPrice, currency)
    };
  };

  // Helper: get discount value for a plan from active campaign discounts
  const getCampaignDiscount = (planKey: string): number => {
    if (!campaigns || !campaigns.isEnabled) return 0;
    const disc = activeCampaignDiscounts[planKey];
    if (!disc || disc.discountValue <= 0) return 0;
    // Only PERCENTAGE supported for price display
    if (disc.discountType === 'PERCENTAGE') return disc.discountValue;
    return 0;
  };

  const getPlanPriceValue = (planKey: string, regionKey: string): number => {
    const docId = REGION_DOC_IDS[regionKey] || REGION_DOC_IDS.t3;
    const firestoreConfig = pricingTiers[docId];
    const staticConfig = REGION_PRICING_CONFIGS[regionKey] || REGION_PRICING_CONFIGS.t3;

    const recoveryPassPrice = firestoreConfig?.recovery_pass?.current ?? staticConfig.recoveryPass;
    const finalPro = firestoreConfig?.pro_lifetime?.current ?? staticConfig.finalPro;
    const finalSuper = firestoreConfig?.super_lifetime?.current ?? staticConfig.finalSuper;

    if (planKey === 'recovery_pass') {
      const disc = getCampaignDiscount('recovery_pass');
      return disc > 0 ? Number((recoveryPassPrice * (1 - disc / 100)).toFixed(2)) : recoveryPassPrice;
    }
    if (planKey === 'pro') {
      const disc = getCampaignDiscount('pro');
      return disc > 0 ? Number((finalPro * (1 - disc / 100)).toFixed(2)) : finalPro;
    }
    if (planKey === 'super') {
      const disc = getCampaignDiscount('super');
      return disc > 0 ? Number((finalSuper * (1 - disc / 100)).toFixed(2)) : finalSuper;
    }
    return 0;
  };

  const getWasPrices = (regionKey: string): PlanPrices => {
    const docId = REGION_DOC_IDS[regionKey] || REGION_DOC_IDS.t3;
    const firestoreConfig = pricingTiers[docId];
    const staticConfig = REGION_PRICING_CONFIGS[regionKey] || REGION_PRICING_CONFIGS.t3;

    const currency = firestoreConfig?.currency_code || staticConfig.currency;
    const symbol = firestoreConfig?.currency_symbol || staticConfig.symbol;

    const recoveryPassWas = firestoreConfig?.recovery_pass?.was ?? (staticConfig.recoveryPass * 2);
    const proWas = firestoreConfig?.pro_lifetime?.was ?? (staticConfig.finalPro * 1.5);
    const superWas = firestoreConfig?.super_lifetime?.was ?? (staticConfig.finalSuper * 1.5);

    return {
      recovery_pass: formatPrice(symbol, recoveryPassWas, currency),
      pro: formatPrice(symbol, proWas, currency),
      super: formatPrice(symbol, superWas, currency)
    };
  };

  const prices = getDynamicPrices(region, true);
  const finalPrices = getDynamicPrices(region, false);
  const wasPrices = getWasPrices(region);
  const isFounding = foundingCount < 200;
  const slotsRemaining = Math.max(0, 200 - foundingCount);

  // Expose Promo Card state — driven by new campaigns collection
  const isPromoCardVisible = (() => {
    if (!campaigns) return false;
    if (!campaigns.isEnabled) return false;
    if (campaigns.status !== 'ACTIVE') return false;

    const expType = campaigns.expirationType || 'NONE';
    const now = Date.now();

    let timeOk = true;
    if ((expType === 'TIME_ONLY' || expType === 'BOTH') && campaigns.expirationDateTime) {
      const expiryMs = campaigns.expirationDateTime.seconds
        ? campaigns.expirationDateTime.seconds * 1000
        : new Date(campaigns.expirationDateTime).getTime();
      timeOk = now < expiryMs;
    }

    let capOk = true;
    if ((expType === 'PURCHASE_LIMIT_ONLY' || expType === 'BOTH') && campaigns.maxPurchaseLimit != null) {
      capOk = (campaigns.currentPurchaseCount ?? 0) < campaigns.maxPurchaseLimit;
    }

    if (expType === 'NONE') return true;
    if (expType === 'TIME_ONLY') return timeOk;
    if (expType === 'PURCHASE_LIMIT_ONLY') return capOk;
    if (expType === 'BOTH') return timeOk && capOk;
    return false;
  })();

  const promoCardDetails = campaigns ? {
    title: campaigns.campaignName,
    description: campaigns.description,
    expirationAt: campaigns.expirationDateTime,
    maxPurchaseLimit: campaigns.maxPurchaseLimit,
    currentPurchaseCount: campaigns.currentPurchaseCount ?? 0,
    conditionType: campaigns.expirationType,
    visibilityToggle: campaigns.isEnabled,
    status: campaigns.status,
    discounts: activeCampaignDiscounts,
  } : null;

  const bannerText = `🎉 ${promoCardDetails?.title || 'Launch Promo'} — ${promoCardDetails?.currentPurchaseCount ?? 0} / ${promoCardDetails?.maxPurchaseLimit ?? '∞'} slots taken. Lock in your lifetime price before slots are gone!`;

  useEffect(() => {
    const regions = ['in', 't1', 't2', 't3', 'eu', 'jp', 'cn', 't4'];
    regions.forEach(r => {
      const computed = getDynamicPrices(r, true);
      if (PLAN_PRICES[r]) {
        PLAN_PRICES[r].recovery_pass = computed.recovery_pass;
        PLAN_PRICES[r].pro = computed.pro;
        PLAN_PRICES[r].super = computed.super;
      } else {
        PLAN_PRICES[r] = computed;
      }
    });
  }, [pricingTiers, foundingCount, region]);

  useEffect(() => {
    const handleCountryDetected = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      if (customEvent.detail) {
        setSelectedCountryState(customEvent.detail.toUpperCase());
      }
    };
    window.addEventListener("takeoutfix-country-detected", handleCountryDetected);
    
    const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
    if (!isLocalhost) {
      const saved = localStorage.getItem("takeoutfix_detected_country");
      if (saved) {
        setSelectedCountryState(saved.toUpperCase());
      }
    }

    return () => {
      window.removeEventListener("takeoutfix-country-detected", handleCountryDetected);
    };
  }, []);

  const refreshUserData = async (currentUser: User) => {
    let deviceSessionId = localStorage.getItem("takeoutfix_device_session_id");
    if (!deviceSessionId) {
      deviceSessionId = `${currentUser.uid}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      localStorage.setItem("takeoutfix_device_session_id", deviceSessionId);
    }

    try {
      const pending = await indexedDbService.get("telemetry", "takeoutfix_pending_usage");
      if (pending && pending.uid === currentUser.uid && (pending.bytes > 0 || pending.files > 0)) {
        const userRef = doc(db, 'users', currentUser.uid);
        await setDoc(userRef, {
          usedBytes: increment(pending.bytes),
          usedFiles: increment(pending.files),
          totalBytesProcessed: increment(pending.bytes),
          totalFilesProcessed: increment(pending.files),
        }, { merge: true });

        if (pending.sessionId) {
          await setDoc(doc(db, 'active_sessions', pending.sessionId), {
            status: 'failed',
            currentFile: 'Restoration interrupted (page closed or reloaded)',
            lastUpdated: Date.now()
          }, { merge: true }).catch(() => {});
        }

        await addDoc(collection(db, 'recoveryHistory', currentUser.uid, 'sessions'), {
          archiveName: pending.takeoutName || 'Google Takeout Archive',
          timestamp: Date.now(),
          filesProcessed: pending.files,
          matched: 0,
          recovered: 0,
          failed: pending.files,
          bytesProcessed: pending.bytes,
          duration: 0,
          status: 'failed'
        }).catch((err) => console.error("Failed to write healed history:", err));

        await indexedDbService.remove("telemetry", "takeoutfix_pending_usage");
      }
    } catch (e) {
      console.warn("Failed to heal pending session usage:", e);
    }

    const isDev = import.meta.env.DEV;
    const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(currentUser.email || '');

    const docRef = doc(db, 'users', currentUser.uid);
    const adminRef = doc(db, 'admins', currentUser.uid);

    // Fetch user and admin records in parallel to reduce database RTT latency
    const [snap, adminSnap] = await Promise.all([
      getDoc(docRef),
      getDoc(adminRef)
    ]);

    const isAdminUser = adminSnap.exists() || isSuperAdmin || isDev;

    const profileData = {
      email: currentUser.email,
      displayName: currentUser.displayName,
      photoURL: currentUser.photoURL,
    };

    const pendingUpdates: any = {};

    if (snap.exists()) {
      const data = snap.data() as UserData & { sessionIds?: string[] };
      
      // 1. Sync isAdmin flag if needed
      if (isAdminUser) {
        data.isAdmin = true;
        if (!snap.data().isAdmin) {
          pendingUpdates.isAdmin = true;
        }
      } else {
        data.isAdmin = false;
        if (snap.data().isAdmin) {
          pendingUpdates.isAdmin = false;
        }
      }

      // 2. Set default plan if needed
      if (!data.plan) {
        if (data.licenseType === 'lifetime') data.plan = 'pro';
        else if (data.licenseType === '24hour' || data.licenseType === '15gb') data.plan = 'recovery_pass';
        else data.plan = 'free';
        pendingUpdates.plan = data.plan;
      }

      // 3. Sync profile photo if changed
      if (currentUser.photoURL && data.photoURL !== currentUser.photoURL) {
        data.photoURL = currentUser.photoURL;
        pendingUpdates.photoURL = currentUser.photoURL;
      }

      // 4. Sync other basic profile details if missing in Firestore
      if (!data.email || !data.displayName || !data.photoURL) {
        if (!data.email && profileData.email) {
          pendingUpdates.email = profileData.email;
          data.email = profileData.email;
        }
        if (!data.displayName && profileData.displayName) {
          pendingUpdates.displayName = profileData.displayName;
          data.displayName = profileData.displayName;
        }
        if (!data.photoURL && profileData.photoURL) {
          pendingUpdates.photoURL = profileData.photoURL;
          data.photoURL = profileData.photoURL;
        }
      }

      // 5. Generate and sync names if missing
      let needsNameUpdate = false;
      if (!data.firstName && data.firstName !== '') {
        const nameParts = (data.displayName || currentUser.displayName || '').trim().split(/\s+/);
        pendingUpdates.firstName = nameParts[0] || '';
        data.firstName = pendingUpdates.firstName;
        needsNameUpdate = true;
      }
      if (!data.lastName && data.lastName !== '') {
        const nameParts = (data.displayName || currentUser.displayName || '').trim().split(/\s+/);
        pendingUpdates.lastName = nameParts.slice(1).join(' ') || '';
        data.lastName = pendingUpdates.lastName;
        needsNameUpdate = true;
      }
      if (!data.username) {
        data.username = await generateUniqueUsername(data.email || currentUser.email || '', data.displayName || currentUser.displayName || '', currentUser.uid);
        pendingUpdates.username = data.username;
        needsNameUpdate = true;
      }

      // 6. Device session tracking
      const currentPlan = data.plan || 'free';
      const maxDevices = getPlanDeviceLimit(currentPlan);
      let updatedSessions = data.sessionIds ? [...data.sessionIds] : [];

      if (updatedSessions.includes(deviceSessionId)) {
        // If there are pending updates, write them. Otherwise, do NOT call setDoc!
        if (Object.keys(pendingUpdates).length > 0) {
          await setDoc(docRef, pendingUpdates, { merge: true }).catch(console.error);
        }
        setUserData(data);
        setSessionRegistered(true);
      } else {
        const bypassDeviceLimit = isAdminUser || import.meta.env.DEV;
        if (!bypassDeviceLimit && updatedSessions.length >= maxDevices) {
          setPendingSessionData({
            docRef,
            profileData: { ...profileData, ...pendingUpdates },
            nameUpdates: {},
            data,
            deviceSessionId,
            maxDevices,
            currentPlan
          });
          setShowDeviceLimitModal(true);
        } else {
          updatedSessions.push(deviceSessionId);
          pendingUpdates.sessionIds = updatedSessions;
          await setDoc(docRef, pendingUpdates, { merge: true }).catch(console.error);
          data.sessionIds = updatedSessions;
          setUserData(data);
          setSessionRegistered(true);
        }
      }
    } else {
      // New user registration
      const displayName = currentUser.displayName || '';
      const email = currentUser.email || '';
      const nameParts = displayName.trim().split(/\s+/);
      const extractedFirstName = nameParts[0] || '';
      const extractedLastName = nameParts.slice(1).join(' ') || '';
      const defaultUsername = await generateUniqueUsername(email, displayName, currentUser.uid);

      const newData = {
        plan: 'free' as PlanType,
        usedBytes: 0,
        usedFiles: 0,
        totalBytesProcessed: 0,
        totalFilesProcessed: 0,
        expiresAt: null,
        isAdmin: isAdminUser,
        ...profileData,
        firstName: extractedFirstName,
        lastName: extractedLastName,
        username: defaultUsername,
        suspended: false,
        createdAt: Date.now(),
        sessionIds: [deviceSessionId]
      };
      await setDoc(docRef, newData);
      setUserData(newData as any);
      setSessionRegistered(true);

      const globalRef = doc(db, 'platform_stats', 'global');
      await setDoc(globalRef, { usersCount: increment(1) }, { merge: true }).catch(console.error);
    }

    if (isSuperAdmin || isDev) {
      const adminRecord: AdminData = {
        uid: currentUser.uid,
        email: currentUser.email || 'dev-admin@takeoutfix.local',
        displayName: currentUser.displayName || 'Dev Admin',
        photoURL: currentUser.photoURL,
        role: isSuperAdmin ? 'SUPER_ADMIN' : 'ADMIN',
        status: 'online',
        lastSeen: Date.now(),
        createdAt: adminSnap.exists() ? adminSnap.data().createdAt : Date.now(),
      };
      
      // Only write to admins collection if the record is missing or outdated
      let adminNeedsWrite = !adminSnap.exists();
      if (adminSnap.exists()) {
        const existingAdmin = adminSnap.data();
        if (existingAdmin.email !== adminRecord.email ||
            existingAdmin.displayName !== adminRecord.displayName ||
            existingAdmin.photoURL !== adminRecord.photoURL ||
            existingAdmin.role !== adminRecord.role) {
          adminNeedsWrite = true;
        }
      }

      if (isSuperAdmin && !isDev && adminNeedsWrite) {
        await setDoc(adminRef, adminRecord, { merge: true }).catch(console.error);
      }
      setAdminData(adminRecord);
    } else if (adminSnap.exists()) {
      const adminRecord = adminSnap.data() as AdminData;
      if (currentUser.photoURL && adminRecord.photoURL !== currentUser.photoURL) {
        adminRecord.photoURL = currentUser.photoURL;
        await updateDoc(adminRef, { photoURL: currentUser.photoURL }).catch(console.error);
      }
      setAdminData(adminRecord);
    } else {
      // For returning normal users, check invitations asynchronously in the background so it doesn't block auth load state!
      if (currentUser.email) {
        const checkInvitesAsync = async () => {
          try {
            const qInvite = query(collection(db, "admins"), where("email", "==", currentUser.email));
            const inviteSnap = await getDocs(qInvite);
            const pendingInvite = inviteSnap.docs.find(d => d.data().pending === true);
            
            if (pendingInvite) {
              const inviteDoc = pendingInvite;
              const inviteData = inviteDoc.data();
              if (inviteData) {
                const adminRecord: AdminData = {
                  uid: currentUser.uid,
                  email: currentUser.email!,
                  displayName: currentUser.displayName || inviteData.displayName || 'Admin',
                  photoURL: currentUser.photoURL,
                  role: inviteData.role || 'SUPPORT',
                  status: 'online',
                  lastSeen: Date.now(),
                  createdAt: Date.now()
                };
                
                await setDoc(adminRef, adminRecord);
                await deleteDoc(inviteDoc.ref);
                await setDoc(docRef, { isAdmin: true }, { merge: true }).catch(console.error);
                setAdminData(adminRecord);
              }
            } else {
              setAdminData(null);
            }
          } catch (err) {
            console.error("Invite claim search failed:", err);
            setAdminData(null);
          }
        };
        checkInvitesAsync();
      } else {
        setAdminData(null);
      }
    }
  };

  useEffect(() => {
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(console.warn);
    }

    const mockAuthUser = typeof window !== 'undefined' ? localStorage.getItem("takeoutfix_mock_auth_user") : null;
    if (mockAuthUser) {
      try {
        const u = JSON.parse(mockAuthUser);
        setUser(u);
        setLoading(false);
        const plan = localStorage.getItem("takeoutfix_mock_auth_plan") || "free";
        setUserData({
          uid: u.uid,
          email: u.email,
          displayName: u.displayName,
          usedBytes: 0,
          plan: plan,
          totalFilesProcessed: 120,
          totalBytesProcessed: 1024 * 1024 * 250
        } as any);
        return () => {};
      } catch (e) {
        console.error("Failed to parse mock user data:", e);
      }
    }

    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const lastUid = localStorage.getItem("takeoutfix_last_uid");
          if (lastUid && lastUid !== u.uid) {
            console.warn("🔄 User account changed! Clearing local recovery state...");
            await indexedDbService.clearAllData().catch(console.error);
          }
          localStorage.setItem("takeoutfix_last_uid", u.uid);
        } catch (e) {
          console.warn("Failed account check:", e);
        }
        // Enforce 1-week automatic logout
        try {
          const loginTimeKey = "takeoutfix_login_time";
          const savedLoginTime = localStorage.getItem(loginTimeKey);
          if (!savedLoginTime) {
            localStorage.setItem(loginTimeKey, String(Date.now()));
          } else {
            const diff = Date.now() - Number(savedLoginTime);
            if (diff > 7 * 24 * 60 * 60 * 1000) {
              console.log("⏰ 7-day session expired. Logging out automatically...");
              localStorage.removeItem(loginTimeKey);
              logout().then(() => {
                if (typeof window !== "undefined") {
                  window.location.href = "/";
                }
              }).catch(console.error);
              return;
            }
          }
        } catch (e) {
          console.warn("Failed to check session expiration:", e);
        }

        refreshUserData(u).catch(err => {
          console.error("Failed to load user auth data:", err);
        }).finally(() => {
          setLoading(false);
        });
      } else {
        try {
          localStorage.removeItem("takeoutfix_login_time");
        } catch (_) {}
        setUserData(null);
        setAdminData(null);
        setSessionRegistered(false);
        setHasSeenSelfInSessions(false);
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) return;

    const userDocRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(userDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as UserData;
        


        const sessionIds = data.sessionIds || [];
        const localSessionId = localStorage.getItem("takeoutfix_device_session_id");
        
        if (localSessionId && sessionIds.includes(localSessionId)) {
          setHasSeenSelfInSessions(true);
        }
        
        const isBypass = data.isAdmin || import.meta.env.DEV;
        if (!isBypass && sessionRegistered && hasSeenSelfInSessions && localSessionId && sessionIds.length > 0 && !sessionIds.includes(localSessionId)) {
          setPendingSessionData({
            docRef: userDocRef,
            profileData: {
              email: user.email,
              displayName: user.displayName,
              photoURL: user.photoURL,
            },
            nameUpdates: {
              firstName: data.firstName || '',
              lastName: data.lastName || '',
              username: data.username || '',
            },
            data,
            deviceSessionId: localSessionId,
            maxDevices: getPlanDeviceLimit(data.plan || 'free'),
            currentPlan: data.plan || 'free'
          });
          setShowDeviceLimitModal(true);
          setSessionRegistered(false);
          setHasSeenSelfInSessions(false);
          return;
        }

        setUserData(data);
      }
    }, (err) => {
      console.warn("Session listener error:", err);
    });

    return unsubscribe;
  }, [user, sessionRegistered, hasSeenSelfInSessions]);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    // Do NOT catch here — let the error bubble up to callers (MainLayout, Layout.astro)
    // so they can display the real Firebase error code in the toast notification.
    await signInWithPopup(auth, provider);
  };

  const logout = async () => {
    if (user) {
      try {
        await setDoc(doc(db, 'admins', user.uid), { status: 'offline', lastSeen: Date.now() }, { merge: true });
      } catch (_) {}

      try {
        const localSessionId = localStorage.getItem("takeoutfix_device_session_id");
        if (localSessionId) {
          const userDocRef = doc(db, 'users', user.uid);
          const userSnap = await getDoc(userDocRef);
          if (userSnap.exists()) {
            const data = userSnap.data();
            const currentSessions = data.sessionIds || [];
            const updatedSessions = currentSessions.filter((id: string) => id !== localSessionId);
            await setDoc(userDocRef, { sessionIds: updatedSessions }, { merge: true });
          }
        }
      } catch (e) {
        console.warn("Failed to clean session ID on logout:", e);
      }
    }
    await signOut(auth);
    try {
      localStorage.removeItem("takeoutfix_user_data");
      localStorage.removeItem("takeoutfix_admin_data");
      localStorage.removeItem("takeoutfix_device_session_id");
      localStorage.removeItem("takeoutfix_login_time");
      localStorage.removeItem("takeoutfix_last_uid");
      await indexedDbService.clearAllData().catch(console.error);
    } catch (_) {}
    setSessionRegistered(false);
    setHasSeenSelfInSessions(false);
  };

  const handleConfirmEvict = async () => {
    if (!pendingSessionData) return;
    try {
      const { docRef, profileData, nameUpdates, data, deviceSessionId } = pendingSessionData;
      const updatedSessions = [deviceSessionId];
      await setDoc(docRef, { ...profileData, ...nameUpdates, sessionIds: updatedSessions }, { merge: true });
      
      setUserData({ ...data, ...nameUpdates, sessionIds: updatedSessions } as any);
      setSessionRegistered(true);
      setShowDeviceLimitModal(false);
      setPendingSessionData(null);
    } catch (err) {
      console.error("Failed to disconnect other sessions:", err);
      useToastStore.getState().addToast("Failed to confirm connection. Please try again.", "error");
    }
  };

  const handleCancelEvict = async () => {
    setShowDeviceLimitModal(false);
    setPendingSessionData(null);
    await logout();
  };

  const [pendingInvite, setPendingInvite] = useState<any>(null);

  // Listen for pending invites for the logged-in user
  useEffect(() => {
    if (!user || !user.email) {
      setPendingInvite(null);
      return;
    }

    const q = query(
      collection(db, "adminInvites"),
      where("email", "==", user.email.toLowerCase()),
      where("status", "==", "pending")
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const now = Date.now();
        const activeInvite = snap.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as any))
          .find(inv => {
            const expMs = inv.expiresAt?.seconds ? inv.expiresAt.seconds * 1000 : new Date(inv.expiresAt).getTime();
            return now < expMs;
          });
        setPendingInvite(activeInvite || null);
      } else {
        setPendingInvite(null);
      }
    });

    return unsubscribe;
  }, [user]);

  const acceptPendingInvite = async (inviteId: string) => {
    if (!user) return;
    try {
      const idToken = await user.getIdToken();
      const response = await fetch("/api/accept-invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`
        },
        body: JSON.stringify({ inviteId })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to accept invitation.");
      }

      useToastStore.getState().addToast("Team invitation accepted! You are now a team member.", "success", 5000, "Invitation Accepted");
      // Force reload to update navbar and admin access
      window.location.reload();
    } catch (err: any) {
      console.error("accept-invite error:", err);
      useToastStore.getState().addToast(err.message || "Failed to accept invite.", "error", 5000, "Error");
    }
  };

  const declinePendingInvite = async (inviteId: string) => {
    if (!user) return;
    try {
      const idToken = await user.getIdToken();
      const response = await fetch("/api/decline-invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`
        },
        body: JSON.stringify({ inviteId })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to decline invitation.");
      }

      useToastStore.getState().addToast("Invitation declined.", "info", 4000, "Declined");
      setPendingInvite(null);
    } catch (err: any) {
      console.error("decline-invite error:", err);
    }
  };

  const inviteFacet: InviteFacet = {
    pendingInvite,
    accept: acceptPendingInvite,
    decline: declinePendingInvite
  };

  return (
    <AuthContext.Provider value={{
      user,
      userData,
      adminData,
      loading,
      login,
      logout,
      refreshUserData: () => user ? refreshUserData(user) : Promise.resolve(),
      region,
      setRegion,
      selectedCountry,
      setSelectedCountry,
      prices,
      finalPrices,
      wasPrices,
      foundingCount,
      isFounding,
      slotsRemaining,
      getPlanPriceValue,
      dodoProductIds,
      dodoTestMode,
      pricingTiers,
      campaigns,
      activeCampaignDiscounts,
      isPromoCardVisible,
      promoCardDetails,
      bannerText,
      featuresConfig,
      tierThresholds,
      recoveryPassHours,
      refundPolicy,
      comparisonRows,
      refreshConfig,
      inviteFacet
    }}>
      {children}
      
      {showDeviceLimitModal && pendingSessionData && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[9999] flex items-center justify-center p-4 select-none">
          <div className="bg-zinc-950 border border-white/10 p-6 rounded-3xl max-w-md w-full relative overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-500 via-amber-500 to-indigo-500"></div>
            
            <div className="text-center space-y-4 pt-4">
              <div className="w-12 h-12 bg-amber-500/10 text-amber-400 rounded-full flex items-center justify-center mx-auto border border-amber-500/20">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              
              <h2 className="text-xl font-bold text-white tracking-tight">Active Device Limit Reached</h2>
              
              <div className="text-zinc-400 text-sm leading-relaxed space-y-3">
                <p>
                  Your <span className="text-indigo-400 font-bold uppercase tracking-wider text-xs">{(pendingSessionData.currentPlan || 'free')} Plan</span> limits active usage to <span className="text-white font-bold">{pendingSessionData.maxDevices} active session(s)</span> at the same time.
                </p>
                <p>
                  You are currently logged in on other browsers or devices. To access the recovery center on this device, you must log out of the other sessions.
                </p>
              </div>
              
              <div className="pt-4 flex flex-col gap-2.5">
                <button
                  onClick={handleConfirmEvict}
                  className="w-full h-11 bg-white text-black hover:bg-zinc-200 font-bold rounded-xl transition-colors shadow-lg active:scale-95 duration-100"
                >
                  Log Out Other Devices & Continue
                </button>
                <button
                  onClick={handleCancelEvict}
                  className="w-full h-11 bg-white/5 text-white hover:bg-white/10 font-semibold rounded-xl transition-all border border-white/10 active:scale-95 duration-100"
                >
                  Cancel & Sign Out
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    return {
      user: null,
      userData: null,
      adminData: null,
      loading: false,
      login: async () => {},
      logout: async () => {},
      refreshUserData: async () => {},
      region: 'in',
      setRegion: () => {},
      selectedCountry: 'IN',
      setSelectedCountry: () => {},
      prices: { recovery_pass: "$4.99", pro: "$24.65", super: "$44.10" },
      finalPrices: { recovery_pass: "$4.99", pro: "$29.00", super: "$49.00" },
      wasPrices: { recovery_pass: "$9.99", pro: "$44.10", super: "$79.00" },
      foundingCount: 0,
      isFounding: true,
      slotsRemaining: 200,
      getPlanPriceValue: () => 0,
      dodoProductIds: {
        recovery_pass: "pdt_recovery_pass_placeholder",
        pro: "pdt_pro_placeholder",
        super: "pdt_super_placeholder"
      },
      dodoTestMode: false,
      pricingTiers: {},
      campaigns: null,
      activeCampaignDiscounts: {},
      isPromoCardVisible: false,
      promoCardDetails: null,
      bannerText: "Launch Promo — 0 / 200 slots taken. Lock in your lifetime price before slots are gone!",
      featuresConfig: DEFAULT_FEATURES_CONFIG,
      tierThresholds: { free: { maxFiles: 250, maxSizeMB: 500 }, recovery_pass: { maxFiles: 3000, maxSizeMB: 3072 }, pro: { maxFiles: 50000, maxSizeMB: 51200 }, super: { maxFiles: 100000, maxSizeMB: 102400 } },
      recoveryPassHours: 24,
      refundPolicy: "",
      comparisonRows: DEFAULT_COMPARISON_ROWS,
      refreshConfig: async () => {},
      inviteFacet: {
        pendingInvite: null,
        accept: async () => {},
        decline: async () => {}
      }
    };
  }
  return context;
};
