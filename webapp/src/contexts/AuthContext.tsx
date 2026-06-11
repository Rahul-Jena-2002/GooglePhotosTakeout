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

// Hardcoded super admin emails — always granted SUPER_ADMIN regardless of DB
const SUPER_ADMIN_EMAILS = ['rahuljenasonu@gmail.com', 'rahuljena.dev@gmail.com'];

const COUNTRY_TO_REGION: Record<string, string> = {
  // Tier 1
  IN: "in", PK: "t1", BD: "t1", NP: "t1", LK: "t1", ID: "t1", VN: "t1", PH: "t1", NG: "t1", KE: "t1", EG: "t1",
  // Tier 2
  MY: "t2", TH: "t2", MX: "t2", BR: "t2", TR: "t2", ZA: "t2", AR: "t2", CL: "t2", PL: "t2", RO: "t2",
  // Tier 3 (US/EU/Other Dev)
  US: "us", GB: "eu", DE: "eu", FR: "eu", NL: "eu", BE: "eu", AT: "eu", SE: "t3", NO: "t3", DK: "t3", FI: "t3", IE: "eu", NZ: "t3", AU: "t3", CA: "t3",
  // Tier 4 (JP/Other Prem)
  JP: "jp", CH: "t4", LU: "eu", IS: "t4", SG: "t4", KR: "t4", HK: "t4",
  // China
  CN: "cn",
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
      const saved = sessionStorage.getItem("takeoutfix_user_data");
      return saved ? JSON.parse(saved) : null;
    } catch (_) {
      return null;
    }
  });
  const [adminData, setAdminDataState] = useState<AdminData | null>(() => {
    try {
      const saved = sessionStorage.getItem("takeoutfix_admin_data");
      return saved ? JSON.parse(saved) : null;
    } catch (_) {
      return null;
    }
  });
  const [loading, setLoading] = useState(() => {
    try {
      const saved = sessionStorage.getItem("takeoutfix_user_data");
      return saved ? false : true;
    } catch (_) {
      return true;
    }
  });

  const setUserData = (data: UserData | null) => {
    setUserDataState(data);
    try {
      if (data) {
        sessionStorage.setItem("takeoutfix_user_data", JSON.stringify(data));
      } else {
        sessionStorage.removeItem("takeoutfix_user_data");
      }
    } catch (_) {}
  };

  const setAdminData = (data: AdminData | null) => {
    setAdminDataState(data);
    try {
      if (data) {
        sessionStorage.setItem("takeoutfix_admin_data", JSON.stringify(data));
      } else {
        sessionStorage.removeItem("takeoutfix_admin_data");
      }
    } catch (_) {}
  };

  const [region, setRegionState] = useState<string>(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) {
        const lowerTz = tz.toLowerCase();
        if (lowerTz.includes("kolkata") || lowerTz.includes("calcutta") || lowerTz.includes("india")) return "in";
        if (lowerTz.includes("tokyo") || lowerTz.includes("japan")) return "jp";
        if (lowerTz.includes("shanghai") || lowerTz.includes("beijing") || lowerTz.includes("china")) return "cn";
        if (lowerTz.includes("europe") || lowerTz.includes("london") || lowerTz.includes("paris") || lowerTz.includes("berlin") || lowerTz.includes("rose") || lowerTz.includes("madrid")) return "eu";
      }
      const lang = (navigator.language || "").toLowerCase();
      if (lang.startsWith("en-in") || lang.startsWith("hi")) return "in";
      if (lang.startsWith("ja")) return "jp";
      if (lang.startsWith("zh")) return "cn";
      if (lang.startsWith("de") || lang.startsWith("fr") || lang.startsWith("it") || lang.startsWith("es")) return "eu";
    } catch (_) {}
    return "us";
  });

  const setRegion = (newRegion: string) => {
    setRegionState(newRegion);
  };

  useEffect(() => {
    const detectRegion = async () => {
      try {
        const res = await fetch("https://freeipapi.com/api/json")
        if (res.ok) {
          const data = await res.json()
          const countryCode = data.countryCode || ""
          const mapped = COUNTRY_TO_REGION[countryCode.toUpperCase()]
          if (mapped) {
            setRegionState(mapped)
          }
        }
      } catch (err) {
        console.warn("GeoIP detection failed, using browser language/timezone fallback:", err)
      }
    }
    detectRegion()
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

    const profileData = {
      email: currentUser.email,
      displayName: currentUser.displayName,
      photoURL: currentUser.photoURL,
    };

    if (snap.exists()) {
      const data = snap.data() as UserData & { sessionIds?: string[] };
      // Force isAdmin for hardcoded super admin emails
      if (isSuperAdmin) data.isAdmin = true;

      // Migrate legacy licenseType to new plan model
      if (!data.plan) {
        if (data.licenseType === 'lifetime') {
          data.plan = 'pro';
        } else if (data.licenseType === '24hour' || data.licenseType === '15gb') {
          data.plan = 'recovery_pass';
        } else {
          data.plan = 'free';
        }
        await setDoc(docRef, { plan: data.plan }, { merge: true });
      }

      // If missing profile details in the db document, merge them dynamically!
      if (!data.email || !data.displayName || !data.photoURL) {
        await setDoc(docRef, profileData, { merge: true });
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
        await setDoc(docRef, nameUpdates, { merge: true });
      }

      // Manage slot limits for concurrent session IDs
      const currentPlan = data.plan || 'free';
      const maxDevices = getPlanDeviceLimit(currentPlan);
      
      let updatedSessions = data.sessionIds ? [...data.sessionIds] : [];
      if (!updatedSessions.includes(deviceSessionId)) {
        updatedSessions.push(deviceSessionId);
      }
      
      while (updatedSessions.length > maxDevices) {
        updatedSessions.shift();
      }

      await setDoc(docRef, { ...profileData, ...nameUpdates, sessionIds: updatedSessions }, { merge: true });
      setUserData({ ...data, ...nameUpdates, sessionIds: updatedSessions } as any);
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
        isAdmin: isSuperAdmin,
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

      // Increment usersCount in platform_stats/global
      const globalRef = doc(db, 'platform_stats', 'global');
      await setDoc(globalRef, {
        usersCount: increment(1)
      }, { merge: true }).catch(console.error);
    }

    // Check / bootstrap admin record
    const adminRef = doc(db, 'admins', currentUser.uid);
    const adminSnap = await getDoc(adminRef);

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
      await setDoc(adminRef, adminRecord, { merge: true });
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
            const inviteData = inviteDoc.data();
            
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
            await setDoc(doc(db, 'users', currentUser.uid), { isAdmin: true }, { merge: true });
            setAdminData(adminRecord);
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
        
        // Evict session if our local device session ID is not in active list
        if (localSessionId && sessionIds.length > 0 && !sessionIds.includes(localSessionId)) {
          alert("Account session expired. You have been logged out because this account is being used on another device.");
          logout();
          return;
        }

        // Keep userData in sync in real-time
        setUserData(data);
      }
    }, (err) => {
      console.warn("Session listener error:", err);
    });

    return unsubscribe;
  }, [user]);

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
      sessionStorage.removeItem("takeoutfix_user_data");
      sessionStorage.removeItem("takeoutfix_admin_data");
      localStorage.removeItem("takeoutfix_device_session_id");
    } catch (_) {}
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
      setRegion
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
      refreshUserData: async () => {},
      region: 'us',
      setRegion: () => {},
    };
  }
  return context;
};
