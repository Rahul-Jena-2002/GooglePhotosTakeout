import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { type User, onAuthStateChanged, signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, EmailAuthProvider, signOut, reauthenticateWithPopup, reauthenticateWithCredential, deleteUser } from 'firebase/auth';
import { doc, getDoc, getDocFromServer, setDoc, getDocsFromServer, collection, query, where, limit, deleteDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { ensureUserSession } from '../lib/firebase/ensureUserProfile';
import { indexedDbService } from '../lib/indexedDbService';
import { acquireRestoreLock } from '../lib/restoreLock';
import { useToastStore } from '../store/useToastStore';
import { REGION_PRICING_CONFIGS, formatPrice, PLAN_PRICES, getRegionFromCountry } from '../lib/planPrices';
import { DEFAULT_COMPARISON_ROWS, DEFAULT_FEATURES_CONFIG, useSiteConfig, type ComparisonRow, type FeaturesConfig } from "./useSiteConfig";
import { apiClient } from '../lib/api/apiClient';

export type PlanType = 'free' | 'recovery_pass' | 'pro' | 'super';
export type AdminRole = 'SUPER_ADMIN' | 'ADMIN' | 'SUPPORT' | 'MODERATOR' | 'DEVELOPER';

export { DEFAULT_COMPARISON_ROWS, DEFAULT_FEATURES_CONFIG, formatThresholdLimit, resolveComparisonRowValues } from "./useSiteConfig";
export type { ComparisonRow, FeatureItem, FeaturesConfig } from "./useSiteConfig";

export type { PlanPrices, RegionPricingConfig, CountryOption } from '../lib/planPrices';
export { REGION_PRICING_CONFIGS, formatPrice, getActivePrice, PLAN_PRICES, COUNTRIES, getRegionFromCountry } from '../lib/planPrices';

import { isEmulatorDevelopment, isVerifiedSuperAdmin } from '../lib/adminAuth';

export interface UserData {
  uid?: string;
  plan: PlanType;
  usedBytes: number;
  usedFiles: number;
  totalBytesProcessed: number;
  totalFilesProcessed: number;
  lifetimeFiles?: number;
  lifetimeBytes?: number;
  expiresAt: number | null;
  passExpiredAt?: number | null;
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
  inviteId?: string;
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
  deleteAccount: (password?: string) => Promise<boolean>;
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
  maintenance: boolean;
  inviteFacet: InviteFacet;
  telemetryAccuracy: string;
  platformStats: any;
  syncStatus: 'synced' | 'syncing' | 'failed';
  syncError: string | null;
  isFreePromoActive: boolean;
  enablePricingAndPayments: boolean;
  reSyncAuthAndFeatures: () => Promise<void>;
}

const getPlanDeviceLimit = (_plan: string): number => {
  return Infinity;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserDataState] = useState<UserData | null>(null);

  const [adminData, setAdminDataState] = useState<AdminData | null>(null);
  const adminRevision = useRef(0);
  const authRevision = useRef(0);
  const [loading, setLoading] = useState(true);

  const [sessionRegistered, setSessionRegistered] = useState(false);
  const [hasSeenSelfInSessions, setHasSeenSelfInSessions] = useState(false);
  const [showDeviceLimitModal, setShowDeviceLimitModal] = useState(false);
  const [pendingSessionData, setPendingSessionData] = useState<any>(null);

  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'failed'>('synced');
  const [syncError, setSyncError] = useState<string | null>(null);

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
        sessionStorage.setItem("takeoutfix_admin_session", JSON.stringify({
          uid: data.uid,
          email: data.email,
          displayName: data.displayName,
          photoURL: data.photoURL,
          role: data.role,
          timestamp: Date.now()
        }));
      } else {
        localStorage.removeItem("takeoutfix_admin_data");
        sessionStorage.removeItem("takeoutfix_admin_session");
      }
    } catch (_) {}
  };
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

  const {
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
  } = useSiteConfig();


  // Seed the local emulator only; live Firebase must not be reset by development startup.
  useEffect(() => {
    if (import.meta.env.DEV && import.meta.env.PUBLIC_FIREBASE_USE_LIVE !== 'true' && user && isVerifiedSuperAdmin(user)) {
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
  const getDynamicPrices = (regionKey: string, _useLaunchIfFounding: boolean): PlanPrices => {
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
    void import('../lib/browserCountry').then(({ detectAndStoreCountry }) => detectAndStoreCountry()).catch((error) => {
      console.warn("Country detection unavailable:", error);
    });
    
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
    const sessionUser = auth?.currentUser;
    const sessionRevision = authRevision.current;
    const isCurrentUser = () => authRevision.current === sessionRevision && !!sessionUser && auth?.currentUser === sessionUser && sessionUser.uid === currentUser.uid;
    const revision = adminRevision.current;
    const canApplyAdmin = () => auth?.currentUser?.uid === currentUser.uid && adminRevision.current === revision;
    let deviceSessionId = localStorage.getItem("takeoutfix_device_session_id");
    if (!deviceSessionId) {
      deviceSessionId = `${currentUser.uid}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      localStorage.setItem("takeoutfix_device_session_id", deviceSessionId);
    }

    const isSuperAdmin = isVerifiedSuperAdmin(currentUser);

    const docRef = doc(db, 'users', currentUser.uid);
    const adminRef = doc(db, 'admins', currentUser.uid);

    // Fetch user and admin records in parallel with catch handlers so Firestore 429/quota errors never crash auth initialization
    const [snap, adminSnap] = await Promise.all([
      getDoc(docRef).catch((err) => {
        console.warn("Firestore getDoc(users) quota/network error:", err?.message || err);
        return null;
      }),
      getDocFromServer(adminRef).catch((err) => {
        console.warn("Firestore getDoc(admins) quota/network error:", err?.message || err);
        return null;
      })
    ]);
    if (!isCurrentUser()) return;

    const isAdminUser = (adminSnap && adminSnap.exists()) || isSuperAdmin;

    const profileData = {
      email: currentUser.email,
      displayName: currentUser.displayName,
      photoURL: currentUser.photoURL,
    };

    const pendingUpdates: any = {};

    if (snap && snap.exists()) {
      const data = { ...snap.data(), uid: currentUser.uid } as UserData & { sessionIds?: string[] };
      
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

      // 2. Set default plan if needed & enforce recovery_pass expiry
      if (!data.plan) {
        if (data.licenseType === 'lifetime') data.plan = 'pro';
        else if (data.licenseType === '24hour' || data.licenseType === '15gb') data.plan = 'recovery_pass';
        else data.plan = 'free';
        pendingUpdates.plan = data.plan;
      }

      if (data.plan === 'recovery_pass') {
        const passExpires = data.expiresAt || (data.createdAt ? data.createdAt + 24 * 60 * 60 * 1000 : null);
        if (passExpires && Date.now() >= passExpires) {
          console.log("⏰ Recovery pass duration elapsed. Reverting to free tier by default.");
          data.plan = 'free';
          data.expiresAt = null;
          pendingUpdates.plan = 'free';
          pendingUpdates.expiresAt = null;
          pendingUpdates.passExpiredAt = passExpires;
        }
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
      if (!data.firstName && data.firstName !== '') {
        const nameParts = (data.displayName || currentUser.displayName || '').trim().split(/\s+/);
        pendingUpdates.firstName = nameParts[0] || '';
        data.firstName = pendingUpdates.firstName;
      }
      if (!data.lastName && data.lastName !== '') {
        const nameParts = (data.displayName || currentUser.displayName || '').trim().split(/\s+/);
        pendingUpdates.lastName = nameParts.slice(1).join(' ') || '';
        data.lastName = pendingUpdates.lastName;
      }
      // Ordinary clients cannot modify entitlement or admin fields.
      if (!isAdminUser) {
        delete pendingUpdates.isAdmin;
        delete pendingUpdates.plan;
        delete pendingUpdates.expiresAt;
        delete pendingUpdates.passExpiredAt;
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
        if (!isCurrentUser()) return;
        setUserData(data);
        setSessionRegistered(true);
      } else {
        // Active device limit completely eliminated: auto-register this device session and continue seamlessly
        updatedSessions.push(deviceSessionId);
        if (updatedSessions.length > 20) updatedSessions = updatedSessions.slice(-20);
        pendingUpdates.sessionIds = updatedSessions;
        await setDoc(docRef, pendingUpdates, { merge: true }).catch(console.error);
        if (!isCurrentUser()) return;
        data.sessionIds = updatedSessions;
        setUserData(data);
        setSessionRegistered(true);
      }
      setSyncStatus('synced');
      setSyncError(null);
    } else if (snap === null) {
      // Network failure / Firestore 429 quota error: preserve last-known-good entitlements!
      setSyncStatus('failed');
      setSyncError('Network unreachable. Preserving cached session & entitlements.');
      const saved = typeof window !== 'undefined' ? localStorage.getItem("takeoutfix_user_data") : null;
      if (saved) {
        try {
          const cachedData = JSON.parse(saved);
          if (cachedData.uid === currentUser.uid && isCurrentUser()) {
            setUserDataState(cachedData);
            setSessionRegistered(true);
          }
        } catch (_) {}
      }
    } else {
      // New user registration (snap !== null && !snap.exists())
      const displayName = currentUser.displayName || '';
      const email = currentUser.email || '';
      const nameParts = displayName.trim().split(/\s+/);
      const extractedFirstName = nameParts[0] || '';
      const extractedLastName = nameParts.slice(1).join(' ') || '';
      const defaultUsername = email ? email.split('@')[0] : 'user';

      const newData = {
        uid: currentUser.uid,
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
      try {
        const actualData = await ensureUserSession(db, currentUser.uid, newData, deviceSessionId);
        if (!isCurrentUser()) return;
        setUserData({ ...actualData, uid: currentUser.uid } as UserData);
        setSessionRegistered(true);
        setSyncStatus('synced');
        setSyncError(null);
      } catch (error) {
        if (!isCurrentUser()) return;
        console.warn('Failed to create or load account profile:', error);
        setSyncStatus('failed');
        setSyncError('Could not load your account profile. Please check your connection and try again.');
        setSessionRegistered(false);
      }
    }

    if (isSuperAdmin) {
      const adminRecord: AdminData = {
        uid: currentUser.uid,
        email: currentUser.email!,
        displayName: currentUser.displayName || 'Super Admin',
        photoURL: currentUser.photoURL,
        role: 'SUPER_ADMIN',
        status: 'online',
        lastSeen: Date.now(),
        createdAt: (adminSnap && adminSnap.exists()) ? adminSnap.data().createdAt : Date.now(),
      };
      
      // Only write to admins collection if the record is missing or outdated
      let adminNeedsWrite = !!adminSnap && !adminSnap.exists();
      if (adminSnap && adminSnap.exists()) {
        const existingAdmin = adminSnap.data();
        if (existingAdmin.email !== adminRecord.email ||
            existingAdmin.displayName !== adminRecord.displayName ||
            existingAdmin.photoURL !== adminRecord.photoURL ||
            existingAdmin.role !== adminRecord.role) {
          adminNeedsWrite = true;
        }
      }

      if (adminNeedsWrite) {
        await setDoc(adminRef, adminRecord, { merge: true }).catch(console.error);
      }
      if (canApplyAdmin()) setAdminData(adminRecord);
    } else if (adminSnap && adminSnap.exists()) {
      const adminRecord = adminSnap.data() as AdminData;
      if (currentUser.photoURL && adminRecord.photoURL !== currentUser.photoURL) {
        adminRecord.photoURL = currentUser.photoURL;
        await updateDoc(adminRef, { photoURL: currentUser.photoURL }).catch(console.error);
      }
      if (canApplyAdmin()) setAdminData(adminRecord);
    } else {
      // For returning normal users, check invitations asynchronously in the background so it doesn't block auth load state!
      if (currentUser.email) {
        const checkInvitesAsync = async () => {
          try {
            const userEmail = currentUser.email!.toLowerCase();
            
            // Only provision automatically if user explicitly clicked the invite link with `?invite=` in the URL.
            // Otherwise, the invite remains pending until the user clicks 'Accept' in their notification bell or email!
            let targetInviteDoc = null;
            if (typeof window !== 'undefined') {
              const urlParams = new URLSearchParams(window.location.search);
              const urlInviteId = urlParams.get("invite");
              if (urlInviteId) {
                try {
                  const directDoc = await getDoc(doc(db, "adminInvites", urlInviteId));
                  if (
                    directDoc.exists() && 
                    directDoc.data().email?.toLowerCase() === userEmail &&
                    directDoc.data().status === "pending"
                  ) {
                    targetInviteDoc = directDoc;
                  }
                } catch { /* ignore */ }
              }
            }
            
            if (targetInviteDoc) {
              const inviteDoc = targetInviteDoc;
              const inviteData = inviteDoc.data();
              
              // Check expiration
              const expiresAtMs = inviteData.expiresAt?.toMillis
                ? inviteData.expiresAt.toMillis()
                : (typeof inviteData.expiresAt === 'number' ? inviteData.expiresAt : 0);
              if (expiresAtMs && Date.now() > expiresAtMs) {
                console.warn("[AuthContext] Found admin invite for user but it has expired.");
                if (canApplyAdmin()) setAdminData(null);
                return;
              }

              const idToken = await currentUser.getIdToken();
              await apiClient.post('/api/accept-invite', { inviteId: inviteDoc.id }, {
                headers: { Authorization: `Bearer ${idToken}` }
              });
              const provisioned = await getDoc(adminRef);
              if (!provisioned.exists()) throw new Error('Admin profile was not created.');
              if (canApplyAdmin()) setAdminData(provisioned.data() as AdminData);
              if (canApplyAdmin() && userData?.uid === currentUser.uid) setUserData({ ...userData, isAdmin: true });
            } else {
              if (canApplyAdmin()) setAdminData(null);
            }
          } catch (err) {
            console.error("Invite claim search failed:", err);
            useToastStore.getState().addToast("Could not accept the invitation. Check that your email is verified and try again.", "error", 7000);
            if (canApplyAdmin()) setAdminData(null);
          }
        };
        checkInvitesAsync();
      } else {
        if (canApplyAdmin()) setAdminData(null);
      }
    }
  };

  useEffect(() => {
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(console.warn);
    }

    const mockAuthUser = isEmulatorDevelopment() && typeof window !== 'undefined' ? localStorage.getItem("takeoutfix_mock_auth_user") : null;
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
          totalFilesProcessed: 0,
          totalBytesProcessed: 0
        } as any);
        return () => {};
      } catch (e) {
        console.error("Failed to parse mock user data:", e);
      }
    }

    // Browsing and guest-mode restoration do not require Firebase Auth.
    if (!auth) {
      setUser(null);
      setUserData(null);
      setAdminData(null);
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      const revision = ++authRevision.current;
      adminRevision.current++;
      setAdminData(null);
      setUserDataState(null);
      setSessionRegistered(false);
      setHasSeenSelfInSessions(false);
      setUser(u);
      if (u) {
        setLoading(true);
        try {
          const lastUid = localStorage.getItem("takeoutfix_last_uid");
          if (lastUid && lastUid !== u.uid) {
            await indexedDbService.clearStore('checkpoints');
          }
          if (revision !== authRevision.current || auth.currentUser !== u) return;
          localStorage.setItem("takeoutfix_last_uid", u.uid);
        } catch (e) {
          console.warn("Failed account check:", e);
        }
        if (revision !== authRevision.current || auth.currentUser !== u) return;
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
              }).catch(error => {
                localStorage.setItem(loginTimeKey, savedLoginTime);
                console.error("Could not complete automatic sign-out:", error);
              });
              return;
            }
          }
        } catch (e) {
          console.warn("Failed to check session expiration:", e);
        }

        refreshUserData(u).catch(err => {
          console.error("Failed to load user auth data:", err);
        }).finally(() => {
          if (revision === authRevision.current && auth.currentUser === u) setLoading(false);
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
    return () => {
      authRevision.current++;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user || !auth || auth.currentUser?.uid !== user.uid) return;
    return onSnapshot(doc(db, 'admins', user.uid), { includeMetadataChanges: true }, (snapshot) => {
      if (auth.currentUser?.uid !== user.uid || snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
      if (snapshot.exists()) {
        adminRevision.current++;
        setAdminData({ ...snapshot.data(), uid: user.uid } as AdminData);
      } else if (!isVerifiedSuperAdmin(user)) {
        adminRevision.current++;
        setAdminData(null);
      }
    }, () => {
      if (auth.currentUser?.uid === user.uid && !isVerifiedSuperAdmin(user)) {
        adminRevision.current++;
        setAdminData(null);
      }
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const userDocRef = doc(db, 'users', user.uid);
    let active = true;
    const unsubscribe = onSnapshot(userDocRef, (snap) => {
      if (!active || auth?.currentUser?.uid !== user.uid) return;
      if (snap.exists()) {
        const data = { ...snap.data(), uid: user.uid } as UserData;
        
        // Auto-revert recovery_pass to free tier if expired
        if (data.plan === 'recovery_pass') {
          const passExpires = data.expiresAt || (data.createdAt ? data.createdAt + 24 * 60 * 60 * 1000 : null);
          if (passExpires && Date.now() >= passExpires) {
            console.log("⏰ Recovery pass snapshot: duration elapsed. Reverting to free tier by default.");
            data.plan = 'free';
            data.expiresAt = null;
            updateDoc(userDocRef, { plan: 'free', expiresAt: null, passExpiredAt: passExpires }).catch(console.error);
          }
        }

        const sessionIds = data.sessionIds || [];
        const localSessionId = localStorage.getItem("takeoutfix_device_session_id");
        
        if (localSessionId && sessionIds.includes(localSessionId)) {
          setHasSeenSelfInSessions(true);
        }
        
        // Device limit eviction eliminated: continue without blocking or evicting sessions

        setUserData(data);
      }
    }, (err) => {
      console.warn("Session listener error:", err);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [user, sessionRegistered, hasSeenSelfInSessions]);

  // Active real-time recovery pass expiry tracker:
  // When pass time span ends, auto-revert user to free tier immediately and notify them.
  useEffect(() => {
    if (!user || !userData || userData.plan !== 'recovery_pass') return;
    const expiresAt = userData.expiresAt;
    if (!expiresAt) return;

    const handleExpiry = () => {
      if (auth?.currentUser?.uid !== user.uid) return;
      if (Date.now() >= expiresAt) {
        console.log("⏰ Recovery pass duration ended in real-time. Reverting to free tier by default.");
        const userDocRef = doc(db, 'users', user.uid);
        updateDoc(userDocRef, { plan: 'free', expiresAt: null, passExpiredAt: expiresAt }).catch(console.error);
        setUserData({ ...userData, plan: 'free', expiresAt: null, passExpiredAt: expiresAt });
        useToastStore.getState().addToast(
          "Your Recovery Pass duration has ended. Your account has returned to the Free tier by default.",
          "info",
          7000,
          "Pass Expired"
        );
      }
    };

    const diff = expiresAt - Date.now();
    if (diff <= 0) {
      handleExpiry();
      return;
    }

    const timeoutId = setTimeout(handleExpiry, diff);
    const intervalId = setInterval(handleExpiry, 15000);
    return () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };
  }, [user, userData?.plan, userData?.expiresAt]);

  const login = async () => {
    if (!auth) throw new Error("Google sign-in is unavailable because Firebase is not configured for this site.");
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      if (
        err?.code === 'auth/popup-closed-by-user' ||
        err?.code === 'auth/cancelled-popup-request'
      ) {
        // User closed or cancelled the popup voluntarily
        return;
      }
      throw err;
    }
  };

  const logout = async () => {
    const releaseRestoreLock = navigator.locks ? await acquireRestoreLock(navigator.locks) : null;
    try {
      await signOut(auth);

      try {
        localStorage.removeItem("takeoutfix_user_data");
        localStorage.removeItem("takeoutfix_admin_data");
        sessionStorage.removeItem("takeoutfix_admin_session");
        localStorage.removeItem("takeoutfix_device_session_id");
        localStorage.removeItem("takeoutfix_login_time");
        localStorage.removeItem("takeoutfix_last_uid");
      } catch (_) {}
      setSessionRegistered(false);
      setHasSeenSelfInSessions(false);
    } finally {
      releaseRestoreLock?.();
    }
  };

  const deleteAccount = async (password?: string) => {
    if (!user) throw new Error('You must be signed in to delete your account.');

    if (user.providerData.some((provider) => provider.providerId === 'google.com')) {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await reauthenticateWithPopup(user, provider);
    } else if (user.providerData.some((provider) => provider.providerId === 'password') && user.email && password) {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
    } else {
      throw new Error('A recent sign-in with your account provider is required to delete this account.');
    }

    const releaseRestoreLock = await acquireRestoreLock(navigator.locks);
    try {
      const localSessions = await indexedDbService.getAll('sessions');
      if (localSessions.some((session) => !['completed', 'failed', 'cancelled'].includes(session.status))) {
        throw new Error('A restore is still saved or running. Resume or discard it before deleting this account.');
      }

      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDocFromServer(userRef);
      const [recoveriesSnap, transactionsSnap, ticketsSnap, purchaseLogsSnap] = await Promise.all([
        getDocsFromServer(query(collection(db, 'recoveries'), where('uid', '==', user.uid), limit(1))),
        getDocsFromServer(query(collection(db, 'transactions'), where('uid', '==', user.uid), limit(1))),
        getDocsFromServer(query(collection(db, 'tickets'), where('uid', '==', user.uid), limit(1))),
        getDocsFromServer(query(collection(db, 'purchase_logs'), where('userId', '==', user.uid), limit(1))),
      ]);

      if (!recoveriesSnap.empty || !transactionsSnap.empty || !ticketsSnap.empty || !purchaseLogsSnap.empty) {
        throw new Error('This account has records that require support to review before deletion. Email takeoutfix.support@gmail.com.');
      }

      const usageBatchesSnap = await getDocsFromServer(collection(db, 'users', user.uid, 'usageBatches'));
      const sessionsSnap = await getDocsFromServer(collection(db, 'recoveryHistory', user.uid, 'sessions'));
      const activeSessionsSnap = await getDocsFromServer(query(collection(db, 'active_sessions'), where('uid', '==', user.uid)));
      const { writeBatch } = await import('firebase/firestore');
      const documents = [
        ...usageBatchesSnap.docs.map((item) => item.ref),
        ...sessionsSnap.docs.map((item) => item.ref),
        ...activeSessionsSnap.docs.map((item) => item.ref),
        ...(userSnap.exists() ? [userRef] : []),
      ];
      for (let i = 0; i < documents.length; i += 450) {
        const batch = writeBatch(db);
        documents.slice(i, i + 450).forEach((ref) => batch.delete(ref));
        await batch.commit();
      }
      await deleteUser(user);

      let localDataCleared = true;
      try {
        await indexedDbService.clearAllData();
      } catch (error) {
        localDataCleared = false;
        console.error('Account was deleted, but local data could not be cleared:', error);
      }

      try {
        for (const key of ['takeoutfix_user_data', 'takeoutfix_admin_data', 'takeoutfix_device_session_id', 'takeoutfix_login_time', 'takeoutfix_last_uid']) {
          localStorage.removeItem(key);
        }
        sessionStorage.removeItem('takeoutfix_admin_session');
      } catch (error) {
        localDataCleared = false;
        console.error('Account was deleted, but local session data could not be cleared:', error);
      }
      setUserData(null);
      setAdminData(null);
      return localDataCleared;
    } finally {
      releaseRestoreLock();
    }
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
      await apiClient.post("/api/accept-invite", { inviteId }, {
        headers: {
          "Authorization": `Bearer ${idToken}`
        }
      });

      useToastStore.getState().addToast("Team invitation accepted! You are now a team member.", "success", 5000, "Invitation Accepted");
      // Force reload to update navbar and admin access
      window.location.reload();
    } catch (err: any) {
      console.error("accept-invite error:", err);
      const msg = err?.response?.data?.error || err?.message || "Failed to accept invite.";
      useToastStore.getState().addToast(msg, "error", 5000, "Error");
    }
  };

  const declinePendingInvite = async (inviteId: string) => {
    if (!user) return;
    try {
      const idToken = await user.getIdToken();
      await apiClient.post("/api/decline-invite", { inviteId }, {
        headers: {
          "Authorization": `Bearer ${idToken}`
        }
      });

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
      deleteAccount,
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
      maintenance,
      inviteFacet,
      telemetryAccuracy,
      platformStats,
      syncStatus,
      syncError,
      isFreePromoActive,
      enablePricingAndPayments,
      reSyncAuthAndFeatures: async () => {
        setSyncStatus('syncing');
        setSyncError(null);
        try {
          await refreshConfig();
          if (user) {
            await refreshUserData(user);
          }
          setSyncStatus('synced');
        } catch (err: any) {
          setSyncStatus('failed');
          setSyncError(err?.message || 'Sync failed');
        }
      }
    }}>
      {children}
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
      deleteAccount: async () => { throw new Error('Account deletion is unavailable.'); },
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
      maintenance: false,
      inviteFacet: {
        pendingInvite: null,
        accept: async () => {},
        decline: async () => {}
      },
      telemetryAccuracy: "",
      platformStats: null,
      syncStatus: 'synced',
      syncError: null,
      isFreePromoActive: false,
      enablePricingAndPayments: false,
      reSyncAuthAndFeatures: async () => {}
    };
  }
  return context;
};
