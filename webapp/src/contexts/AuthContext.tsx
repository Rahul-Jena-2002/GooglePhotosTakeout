import React, { createContext, useContext, useEffect, useState } from 'react';
import { type User, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, getDocs, collection, query, where, deleteDoc, onSnapshot, increment, addDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { indexedDbService } from '../lib/indexedDbService';
import { useToastStore } from '../store/useToastStore';

export type PlanType = 'free' | 'recovery_pass' | 'pro' | 'super';
export type AdminRole = 'SUPER_ADMIN' | 'ADMIN' | 'SUPPORT' | 'MODERATOR';

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
const formatPrice = (symbol: string, val: number, currency: string): string => {
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

const SUPER_ADMIN_EMAILS = ['rahuljena.dev@gmail.com'];

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
  foundingCount: number;
  isFounding: boolean;
  slotsRemaining: number;
  getPlanPriceValue: (planKey: string, regionKey: string) => number;
  dodoProductIds: Record<string, Record<string, string>>;
  dodoTestMode: boolean;
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
  const PLANS = ['recovery_pass', 'pro', 'super', 'family'];
  const buildEmptyProductIds = () => Object.fromEntries(
    REGIONS.map(r => [r, Object.fromEntries(PLANS.map(p => [p, ""]))])
  );

  const [dodoProductIds, setDodoProductIds] = useState<Record<string, Record<string, string>>>(
    buildEmptyProductIds()
  );

  const [dodoTestMode, setDodoTestMode] = useState<boolean>(false);

  const [foundingCount, setFoundingCount] = useState<number>(0);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "global"), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        // Read nested dodo_products map: { in: { recovery_pass: "pdt_x", pro: "pdt_y", super: "pdt_z" }, t1: {...}, ... }
        const stored = data.dodo_products as Record<string, Record<string, string>> | undefined;
        if (stored) {
          setDodoProductIds(prev => {
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
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsubFounding = onSnapshot(doc(db, "config", "foundingMembers"), (snap) => {
      if (snap.exists()) {
        setFoundingCount(snap.data().count ?? 0);
      }
    });
    return unsubFounding;
  }, []);

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
    return "US";
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
    const config = REGION_PRICING_CONFIGS[regionKey] || REGION_PRICING_CONFIGS.t3;
    const isLaunch = useLaunchIfFounding && foundingCount < 200;
    
    const proPrice = isLaunch ? (config.finalPro * 0.85) : config.finalPro;      // Dynamic 15% off
    const superPrice = isLaunch ? (config.finalSuper * 0.90) : config.finalSuper;  // Dynamic 10% off
    const recoveryPassPrice = config.recoveryPass;
    const symbol = config.symbol;
    
    return {
      recovery_pass: formatPrice(symbol, recoveryPassPrice, config.currency),
      pro: formatPrice(symbol, proPrice, config.currency),
      super: formatPrice(symbol, superPrice, config.currency)
    };
  };

  const getPlanPriceValue = (planKey: string, regionKey: string): number => {
    const r = regionKey.toLowerCase();
    const config = REGION_PRICING_CONFIGS[r] || REGION_PRICING_CONFIGS.t3;
    
    if (planKey === 'recovery_pass') return config.recoveryPass;
    const isLaunch = foundingCount < 200;
    if (planKey === 'pro') return isLaunch ? (config.finalPro * 0.85) : config.finalPro;
    if (planKey === 'super') return isLaunch ? (config.finalSuper * 0.90) : config.finalSuper;
    return 0;
  };

  const prices = getDynamicPrices(region, true);
  const finalPrices = getDynamicPrices(region, false);
  const isFounding = foundingCount < 200;
  const slotsRemaining = Math.max(0, 200 - foundingCount);

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
  }, [foundingCount, region]);

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

    const docRef = doc(db, 'users', currentUser.uid);
    const snap = await getDoc(docRef);
    const isDev = import.meta.env.DEV;
    const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(currentUser.email || '');

    const adminRef = doc(db, 'admins', currentUser.uid);
    const adminSnap = await getDoc(adminRef);
    const isAdminUser = adminSnap.exists() || isSuperAdmin || isDev;

    const profileData = {
      email: currentUser.email,
      displayName: currentUser.displayName,
      photoURL: currentUser.photoURL,
    };

    if (snap.exists()) {
      const data = snap.data() as UserData & { sessionIds?: string[] };
      if (isAdminUser) {
        data.isAdmin = true;
        if (!snap.data().isAdmin && !isDev) {
          await setDoc(docRef, { isAdmin: true }, { merge: true }).catch(console.error);
        }
      }

      if (!data.plan) {
        if (data.licenseType === 'lifetime') data.plan = 'pro';
        else if (data.licenseType === '24hour' || data.licenseType === '15gb') data.plan = 'recovery_pass';
        else data.plan = 'free';
        await setDoc(docRef, { plan: data.plan }, { merge: true }).catch(console.error);
      }



      if (currentUser.photoURL && data.photoURL !== currentUser.photoURL) {
        data.photoURL = currentUser.photoURL;
        await setDoc(docRef, { photoURL: currentUser.photoURL }, { merge: true }).catch(console.error);
      }

      if (!data.email || !data.displayName || !data.photoURL) {
        await setDoc(docRef, profileData, { merge: true }).catch(console.error);
        data.email = data.email || currentUser.email;
        data.displayName = data.displayName || currentUser.displayName;
        data.photoURL = data.photoURL || currentUser.photoURL;
      }

      let needsNameUpdate = false;
      const nameUpdates: any = {};

      if (!data.firstName && data.firstName !== '') {
        const nameParts = (data.displayName || currentUser.displayName || '').trim().split(/\s+/);
        nameUpdates.firstName = nameParts[0] || '';
        data.firstName = nameUpdates.firstName;
        needsNameUpdate = true;
      }
      if (!data.lastName && data.lastName !== '') {
        const nameParts = (data.displayName || currentUser.displayName || '').trim().split(/\s+/);
        nameUpdates.lastName = nameParts.slice(1).join(' ') || '';
        data.lastName = nameUpdates.lastName;
        needsNameUpdate = true;
      }
      if (!data.username) {
        data.username = await generateUniqueUsername(data.email || currentUser.email || '', data.displayName || currentUser.displayName || '', currentUser.uid);
        nameUpdates.username = data.username;
        needsNameUpdate = true;
      }

      if (needsNameUpdate) {
        await setDoc(docRef, nameUpdates, { merge: true }).catch(console.error);
      }

      const currentPlan = data.plan || 'free';
      const maxDevices = getPlanDeviceLimit(currentPlan);
      
      let updatedSessions = data.sessionIds ? [...data.sessionIds] : [];
      if (updatedSessions.includes(deviceSessionId)) {
        await setDoc(docRef, { ...profileData, ...nameUpdates, sessionIds: updatedSessions }, { merge: true }).catch(console.error);
        setUserData({ ...data, ...nameUpdates, sessionIds: updatedSessions } as any);
        setSessionRegistered(true);
      } else {
        const bypassDeviceLimit = isAdminUser || import.meta.env.DEV;
        if (!bypassDeviceLimit && updatedSessions.length >= maxDevices) {
          setPendingSessionData({
            docRef,
            profileData,
            nameUpdates,
            data,
            deviceSessionId,
            maxDevices,
            currentPlan
          });
          setShowDeviceLimitModal(true);
        } else {
          updatedSessions.push(deviceSessionId);
          await setDoc(docRef, { ...profileData, ...nameUpdates, sessionIds: updatedSessions }, { merge: true }).catch(console.error);
          setUserData({ ...data, ...nameUpdates, sessionIds: updatedSessions } as any);
          setSessionRegistered(true);
        }
      }
    } else {
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
      if (isSuperAdmin && !isDev) {
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
      if (!currentUser.email) {
        setAdminData(null);
      } else {
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
                email: currentUser.email,
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

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        setLoading(false);
        refreshUserData(u).catch(err => {
          console.error("Failed to load user auth data:", err);
        });
      } else {
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
      foundingCount,
      isFounding,
      slotsRemaining,
      getPlanPriceValue,
      dodoProductIds,
      dodoTestMode
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
      region: 't3',
      setRegion: () => {},
      selectedCountry: 'US',
      setSelectedCountry: () => {},
      prices: { recovery_pass: "$4.99", pro: "$24.65", super: "$44.10" },
      finalPrices: { recovery_pass: "$4.99", pro: "$29.00", super: "$49.00" },
      foundingCount: 0,
      isFounding: true,
      slotsRemaining: 200,
      getPlanPriceValue: () => 0,
      dodoProductIds: {
        recovery_pass: "pdt_recovery_pass_placeholder",
        pro: "pdt_pro_placeholder",
        super: "pdt_super_placeholder",
        family: "pdt_family_placeholder"
      }
    };
  }
  return context;
};
