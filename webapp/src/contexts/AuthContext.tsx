import React, { createContext, useContext, useEffect, useState } from 'react';
import { type User, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, getDocs, collection, query, where, deleteDoc, onSnapshot, increment, addDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { indexedDbService } from '../lib/indexedDbService';

export type PlanType = 'free' | 'recovery_pass' | 'pro' | 'super' | 'family';
export type AdminRole = 'SUPER_ADMIN' | 'ADMIN' | 'SUPPORT' | 'MODERATOR';

export interface PlanPrices {
  recovery_pass: string;
  pro: string;
  super: string;
  family: string;
}

export const PLAN_PRICES: Record<string, PlanPrices> = {
  in: { recovery_pass: "₹99", pro: "₹799", super: "₹1499", family: "₹3999" },
  us: { recovery_pass: "$4.99", pro: "$29", super: "$49", family: "$79" },
  eu: { recovery_pass: "€4.99", pro: "€29", super: "€49", family: "€79" },
  jp: { recovery_pass: "¥899", pro: "¥5900", super: "¥9900", family: "¥14900" },
  cn: { recovery_pass: "¥29", pro: "¥199", super: "¥399", family: "¥999" },
  t1: { recovery_pass: "$1.49", pro: "$9.99", super: "$19.99", family: "$49.99" },
  t2: { recovery_pass: "$3.99", pro: "$19", super: "$39", family: "$49" },
  t3: { recovery_pass: "$4.99", pro: "$29", super: "$49", family: "$79" },
  t4: { recovery_pass: "$5.99", pro: "$39", super: "$69", family: "$99" },
};

export interface CountryOption {
  code: string;
  name: string;
  tier: 't1' | 't2' | 't3' | 'in';
}

export const COUNTRIES: CountryOption[] = [
  // Tier 1 (India & Similar)
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
  { code: "CN", name: "China", tier: "t1" },

  // Tier 2 (Mid USD)
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

  // Tier 3 (High USD)
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
  { code: "JP", name: "Japan", tier: "t3" },
  { code: "CH", name: "Switzerland", tier: "t3" },
  { code: "LU", name: "Luxembourg", tier: "t3" },
  { code: "IS", name: "Iceland", tier: "t3" },
  { code: "SG", name: "Singapore", tier: "t3" },
  { code: "KR", name: "South Korea", tier: "t3" },
  { code: "HK", name: "Hong Kong", tier: "t3" }
];

// Hardcoded super admin emails — always granted SUPER_ADMIN regardless of DB
const SUPER_ADMIN_EMAILS = ['rahuljenasonu@gmail.com', 'rahuljena.dev@gmail.com'];

const COUNTRY_TO_REGION: Record<string, string> = {
  // Tier 1
  IN: "in", PK: "t1", BD: "t1", NP: "t1", LK: "t1", ID: "t1", VN: "t1", PH: "t1", NG: "t1", KE: "t1", EG: "t1", CN: "t1",
  // Tier 2
  MY: "t2", TH: "t2", MX: "t2", BR: "t2", TR: "t2", ZA: "t2", AR: "t2", CL: "t2", PL: "t2", RO: "t2",
  // Tier 3
  US: "t3", GB: "t3", DE: "t3", FR: "t3", NL: "t3", BE: "t3", AT: "t3", SE: "t3", NO: "t3", DK: "t3", FI: "t3", IE: "t3", NZ: "t3", AU: "t3", CA: "t3",
  JP: "t3", CH: "t3", LU: "t3", IS: "t3", SG: "t3", KR: "t3", HK: "t3",
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
  getPlanPriceValue: (planKey: string, regionKey: string) => number;
}

const getPlanDeviceLimit = (plan: string): number => {
  if (plan === 'pro') return 2;
  if (plan === 'super') return 3;
  if (plan === 'family') return 5;
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

  // Load global settings in real-time
  const [globalSettings, setGlobalSettings] = useState({
    baseRecoveryPass: 4.99,
    baseProLifetime: 29.00,
    baseSuperLifetime: 49.00,
    inrConversionRate: 67.0,
    tier1Scale: 0.3,
    tier2Scale: 0.6,
    tier3Scale: 1.0
  });

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "global"), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setGlobalSettings({
          baseRecoveryPass: Number(data.baseRecoveryPass ?? 4.99),
          baseProLifetime: Number(data.baseProLifetime ?? 29.00),
          baseSuperLifetime: Number(data.baseSuperLifetime ?? 49.00),
          inrConversionRate: Number(data.inrConversionRate ?? 67.0),
          tier1Scale: Number(data.tier1Scale ?? 0.3),
          tier2Scale: Number(data.tier2Scale ?? 0.6),
          tier3Scale: Number(data.tier3Scale ?? 1.0)
        });
      }
    });
    return unsub;
  }, []);

  const [selectedCountry, setSelectedCountryState] = useState<string>(() => {
    try {
      const saved = localStorage.getItem("takeoutfix_selected_country");
      if (saved) return saved.toUpperCase();
      
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) {
        const lowerTz = tz.toLowerCase();
        if (lowerTz.includes("kolkata") || lowerTz.includes("calcutta") || lowerTz.includes("india")) return "IN";
        if (lowerTz.includes("tokyo") || lowerTz.includes("japan")) return "JP";
        if (lowerTz.includes("shanghai") || lowerTz.includes("beijing") || lowerTz.includes("china")) return "CN";
        if (lowerTz.includes("europe") || lowerTz.includes("london") || lowerTz.includes("paris") || lowerTz.includes("berlin") || lowerTz.includes("rose") || lowerTz.includes("madrid")) return "GB";
      }
      const lang = (navigator.language || "").toLowerCase();
      if (lang.startsWith("en-in") || lang.startsWith("hi")) return "IN";
      if (lang.startsWith("ja")) return "JP";
      if (lang.startsWith("zh")) return "CN";
      if (lang.startsWith("de") || lang.startsWith("fr") || lang.startsWith("it") || lang.startsWith("es")) return "DE";
    } catch (_) {}
    return "US";
  });

  useEffect(() => {
    const detectCountry = async () => {
      const saved = localStorage.getItem("takeoutfix_selected_country");
      if (saved) return; // Already manually chosen

      let countryCode = "";
      // 1. Try Cloudflare cdn-cgi trace first
      try {
        const res = await fetch("/cdn-cgi/trace");
        if (res.ok) {
          const text = await res.text();
          const lines = text.split("\n");
          for (const line of lines) {
            const parts = line.split("=");
            if (parts[0] === "loc" && parts[1]) {
              countryCode = parts[1].trim().toUpperCase();
              break;
            }
          }
        }
      } catch (e) {}

      // 2. Try freeipapi
      if (!countryCode) {
        try {
          const res = await fetch("https://freeipapi.com/api/json");
          if (res.ok) {
            const data = await res.json();
            countryCode = data.countryCode || "";
          }
        } catch (e) {}
      }

      if (countryCode) {
        setSelectedCountryState(countryCode.toUpperCase());
      }
    };
    detectCountry();
  }, []);

  const getRegionFromCountry = (countryCode: string): string => {
    const country = countryCode.toUpperCase();
    if (country === 'IN') return 'in';
    const lowTiers = ["PK", "BD", "NP", "LK", "ID", "VN", "PH", "NG", "KE", "EG", "CN"];
    const midTiers = ["MY", "TH", "MX", "BR", "TR", "ZA", "AR", "CL", "PL", "RO"];
    if (lowTiers.includes(country)) return 't1';
    if (midTiers.includes(country)) return 't2';
    return 't3'; // Default high tier
  };

  const region = getRegionFromCountry(selectedCountry);

  const setSelectedCountry = (code: string) => {
    const upper = code.toUpperCase();
    setSelectedCountryState(upper);
    try {
      localStorage.setItem("takeoutfix_selected_country", upper);
    } catch (_) {}
  };

  const setRegion = (newRegion: string) => {
    if (newRegion === 'in') setSelectedCountry('IN');
    else if (newRegion === 't1') setSelectedCountry('PK');
    else if (newRegion === 't2') setSelectedCountry('MY');
    else setSelectedCountry('US');
  };

  const getDynamicPrices = (regionKey: string): PlanPrices => {
    const { baseRecoveryPass, baseProLifetime, baseSuperLifetime, inrConversionRate, tier1Scale, tier2Scale, tier3Scale } = globalSettings;
    const baseFamily = 79.00;

    if (regionKey === 'in') {
      const scale = tier1Scale;
      return {
        recovery_pass: `₹${Math.round(baseRecoveryPass * scale * inrConversionRate)}`,
        pro: `₹${Math.round(baseProLifetime * scale * inrConversionRate)}`,
        super: `₹${Math.round(baseSuperLifetime * scale * inrConversionRate)}`,
        family: `₹${Math.round(baseFamily * scale * inrConversionRate)}`
      };
    }

    let scale = tier3Scale;
    if (regionKey === 't1') scale = tier1Scale;
    else if (regionKey === 't2') scale = tier2Scale;

    return {
      recovery_pass: `$${(baseRecoveryPass * scale).toFixed(2)}`,
      pro: `$${Math.round(baseProLifetime * scale)}`,
      super: `$${Math.round(baseSuperLifetime * scale)}`,
      family: `$${Math.round(baseFamily * scale)}`
    };
  };

  const getPlanPriceValue = (planKey: string, regionKey: string): number => {
    const { baseRecoveryPass, baseProLifetime, baseSuperLifetime, inrConversionRate, tier1Scale, tier2Scale, tier3Scale } = globalSettings;
    const baseFamily = 79.00;

    let base = 0;
    if (planKey === 'recovery_pass') base = baseRecoveryPass;
    else if (planKey === 'pro') base = baseProLifetime;
    else if (planKey === 'super') base = baseSuperLifetime;
    else if (planKey === 'family') base = baseFamily;

    if (regionKey === 'in') {
      return Math.round(base * tier1Scale * inrConversionRate);
    }

    let scale = tier3Scale;
    if (regionKey === 't1') scale = tier1Scale;
    else if (regionKey === 't2') scale = tier2Scale;

    const calculated = base * scale;
    return planKey === 'recovery_pass' ? Number(calculated.toFixed(2)) : Math.round(calculated);
  };

  const prices = getDynamicPrices(region);

  useEffect(() => {
    // In-place update the static PLAN_PRICES dictionary properties!
    const regions = ['in', 't1', 't2', 't3'];
    regions.forEach(r => {
      const computed = getDynamicPrices(r);
      if (PLAN_PRICES[r]) {
        PLAN_PRICES[r].recovery_pass = computed.recovery_pass;
        PLAN_PRICES[r].pro = computed.pro;
        PLAN_PRICES[r].super = computed.super;
        PLAN_PRICES[r].family = computed.family;
      } else {
        PLAN_PRICES[r] = computed;
      }
    });
    PLAN_PRICES.us = PLAN_PRICES.t3;
    PLAN_PRICES.eu = PLAN_PRICES.t3;
    PLAN_PRICES.jp = PLAN_PRICES.t3;
    PLAN_PRICES.cn = PLAN_PRICES.t1;
  }, [globalSettings]);

  useEffect(() => {
    const detectRegion = async () => {
      if (localStorage.getItem("takeoutfix_selected_country")) return;
      let countryCode = "";

      // 1. Try Cloudflare cdn-cgi trace first (extremely fast, same-origin, bypasses adblockers)
      try {
        const res = await fetch("/cdn-cgi/trace");
        if (res.ok) {
          const text = await res.text();
          const lines = text.split("\n");
          for (const line of lines) {
            const parts = line.split("=");
            if (parts[0] === "loc" && parts[1]) {
              countryCode = parts[1].trim().toUpperCase();
              break;
            }
          }
        }
      } catch (e) {
        console.warn("Cloudflare cdn-cgi/trace check failed:", e);
      }

      // 2. Try freeipapi as fallback (e.g. on localhost)
      if (!countryCode) {
        try {
          const res = await fetch("https://freeipapi.com/api/json");
          if (res.ok) {
            const data = await res.json();
            countryCode = data.countryCode || "";
          }
        } catch (err) {
          console.warn("GeoIP detection failed, using browser language/timezone fallback:", err);
        }
      }

      // 3. Map country code
      if (countryCode) {
        setSelectedCountryState(countryCode.toUpperCase());
      }
    };
    detectRegion();
  }, []);

  const refreshUserData = async (currentUser: User) => {
    // Generate or fetch local device session ID
    let deviceSessionId = localStorage.getItem("takeoutfix_device_session_id");
    if (!deviceSessionId) {
      deviceSessionId = `${currentUser.uid}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      localStorage.setItem("takeoutfix_device_session_id", deviceSessionId);
    }

    // Sync any pending uncommitted telemetry/usage from previous crash/refresh
    try {
      const pending = await indexedDbService.get("telemetry", "takeoutfix_pending_usage");
      if (pending) {
        if (pending.uid === currentUser.uid && (pending.bytes > 0 || pending.files > 0)) {
          const userRef = doc(db, 'users', currentUser.uid);
          await setDoc(userRef, {
            usedBytes: increment(pending.bytes),
            usedFiles: increment(pending.files),
            totalBytesProcessed: increment(pending.bytes),
            totalFilesProcessed: increment(pending.files),
          }, { merge: true });

          // Also mark the dangling session document in active_sessions as interrupted
          if (pending.sessionId) {
            await setDoc(doc(db, 'active_sessions', pending.sessionId), {
              status: 'failed',
              currentFile: 'Restoration interrupted (page closed or reloaded)',
              lastUpdated: Date.now()
            }, { merge: true }).catch(() => {});
          }

          // Save detailed run record as a failed/interrupted session to recovery history
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
      }
    } catch (e) {
      console.warn("Failed to heal pending session usage:", e);
    }

    const docRef = doc(db, 'users', currentUser.uid);
    const snap = await getDoc(docRef);
    const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(currentUser.email || '');

    // Fetch admin record first to dynamically check client-side admin privileges
    const adminRef = doc(db, 'admins', currentUser.uid);
    const adminSnap = await getDoc(adminRef);
    const isAdminUser = adminSnap.exists() || isSuperAdmin;

    const profileData = {
      email: currentUser.email,
      displayName: currentUser.displayName,
      photoURL: currentUser.photoURL,
    };

    if (snap.exists()) {
      const data = snap.data() as UserData & { sessionIds?: string[] };
      // Force isAdmin for hardcoded super admin emails or registered admins
      if (isAdminUser) {
        data.isAdmin = true;
        // Self-heal/sync user document if isAdmin is missing/false in DB
        if (!snap.data().isAdmin) {
          await setDoc(docRef, { isAdmin: true }, { merge: true }).catch(console.error);
        }
      }

      // Migrate legacy licenseType to new plan model
      if (!data.plan) {
        if (data.licenseType === 'lifetime') {
          data.plan = 'pro';
        } else if (data.licenseType === '24hour' || data.licenseType === '15gb') {
          data.plan = 'recovery_pass';
        } else {
          data.plan = 'free';
        }
        await setDoc(docRef, { plan: data.plan }, { merge: true }).catch(console.error);
      }

      // If missing profile details in the db document, merge them dynamically!
      if (!data.email || !data.displayName || !data.photoURL) {
        await setDoc(docRef, profileData, { merge: true }).catch(console.error);
        data.email = data.email || currentUser.email;
        data.displayName = data.displayName || currentUser.displayName;
        data.photoURL = data.photoURL || currentUser.photoURL;
      }

      // Bootstrap missing name/username fields for existing users
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

      // Manage slot limits for concurrent session IDs
      const currentPlan = data.plan || 'free';
      const maxDevices = getPlanDeviceLimit(currentPlan);
      
      let updatedSessions = data.sessionIds ? [...data.sessionIds] : [];
      if (updatedSessions.includes(deviceSessionId)) {
        await setDoc(docRef, { ...profileData, ...nameUpdates, sessionIds: updatedSessions }, { merge: true }).catch(console.error);
        setUserData({ ...data, ...nameUpdates, sessionIds: updatedSessions } as any);
        setSessionRegistered(true);
      } else {
        if (updatedSessions.length >= maxDevices) {
          // Exceeds limits! Wait for user input (Hotstar-style)
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
      
      // Extract first name and last name
      const nameParts = displayName.trim().split(/\s+/);
      const extractedFirstName = nameParts[0] || '';
      const extractedLastName = nameParts.slice(1).join(' ') || '';

      // Generate a default random unique username
      const defaultUsername = await generateUniqueUsername(email, displayName, currentUser.uid);

      const newData = {
        plan: 'free' as PlanType,
        usedBytes: 0,
        usedFiles: 0,
        totalBytesProcessed: 0,
        totalFilesProcessed: 0,
        expiresAt: null as number | null,
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

      // Increment usersCount in platform_stats/global
      const globalRef = doc(db, 'platform_stats', 'global');
      await setDoc(globalRef, {
        usersCount: increment(1)
      }, { merge: true }).catch(console.error);
    }

    // Check / bootstrap admin record
    if (isSuperAdmin) {
      const adminRecord: AdminData = {
        uid: currentUser.uid,
        email: currentUser.email!,
        displayName: currentUser.displayName || 'Super Admin',
        photoURL: currentUser.photoURL,
        role: 'SUPER_ADMIN',
        status: 'online',
        lastSeen: Date.now(),
        createdAt: adminSnap.exists() ? adminSnap.data().createdAt : Date.now(),
      };
      await setDoc(adminRef, adminRecord, { merge: true }).catch(console.error);
      setAdminData(adminRecord);
    } else if (adminSnap.exists()) {
      const adminRecord = adminSnap.data() as AdminData;
      setAdminData(adminRecord);
    } else {
      // Check for a pending invite matching their email
      if (!currentUser.email) {
        setAdminData(null);
      } else {
        try {
          const qInvite = query(collection(db, "admins"), where("email", "==", currentUser.email));
          const inviteSnap = await getDocs(qInvite);
          const pendingInvite = inviteSnap.docs.find(d => d.data().pending === true);
          
          if (pendingInvite) {
            const inviteDoc = pendingInvite;
            const inviteData = inviteDoc.ref ? inviteDoc.data() : null;
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
    // Request persistent storage permission from browser to protect local storage from eviction
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().then((persistent) => {
        if (persistent) {
          console.log("Storage is configured as persistent and will not be cleared by the OS.");
        }
      }).catch(console.warn);
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

  // Strict Concurrent Session listener
  useEffect(() => {
    if (!user) return;

    const userDocRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(userDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as UserData;
        const sessionIds = data.sessionIds || [];
        const localSessionId = localStorage.getItem("takeoutfix_device_session_id");
        
        // Track if we have seen our own session ID in the active sessions list
        if (localSessionId && sessionIds.includes(localSessionId)) {
          setHasSeenSelfInSessions(true);
        }
        
        // Evict session if our local device session ID is not in active list (only after session registration completes)
        if (sessionRegistered && hasSeenSelfInSessions && localSessionId && sessionIds.length > 0 && !sessionIds.includes(localSessionId)) {
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

        // Keep userData in sync in real-time
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
    // Mark offline before sign out
    if (user) {
      try {
        await setDoc(doc(db, 'admins', user.uid), { status: 'offline', lastSeen: Date.now() }, { merge: true });
      } catch (_) {}

      // Clean up Firestore active sessions array on explicit logout
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
      
      // Clear older device sessions and replace with only this new session ID
      const updatedSessions = [deviceSessionId];
      await setDoc(docRef, { ...profileData, ...nameUpdates, sessionIds: updatedSessions }, { merge: true });
      
      setUserData({ ...data, ...nameUpdates, sessionIds: updatedSessions } as any);
      setSessionRegistered(true);
      setShowDeviceLimitModal(false);
      setPendingSessionData(null);
    } catch (err) {
      console.error("Failed to disconnect other sessions:", err);
      alert("Failed to confirm connection. Please try again.");
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
      getPlanPriceValue
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
      prices: { recovery_pass: "$4.99", pro: "$29", super: "$49", family: "$79" },
      getPlanPriceValue: () => 0,
    };
  }
  return context;
};
