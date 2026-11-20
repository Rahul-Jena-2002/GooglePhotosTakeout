import { useEffect } from 'react';
import { doc, setDoc, getCountFromServer, collection } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { isVerifiedSuperAdmin } from '../lib/adminAuth';

/** Refresh the public account-record snapshot from Firestore once per admin session. */
export function useTelemetrySync(enabled: boolean = true) {
  const { user, adminData } = useAuth();
  const isAdmin = !!adminData || isVerifiedSuperAdmin(user);

  useEffect(() => {
    if (!user || !isAdmin || !enabled) return;

    // Run at most once per admin session to avoid burning Firestore reads on every navigation
    if (typeof window !== 'undefined' && sessionStorage.getItem('takeoutfix_telemetry_synced')) {
      return;
    }

    const verifyTelemetry = async () => {
      try {
        const globalRef = doc(db, 'platform_stats', 'global');
        const usersSnap = await getCountFromServer(collection(db, 'users'));

        await setDoc(globalRef, {
          usersCount: usersSnap.data().count,
          usersCountUpdatedAt: Date.now()
        }, { merge: true });
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('takeoutfix_telemetry_synced', 'true');
        }
      } catch (err) {
        console.warn("Telemetry verification completed with notice:", err);
      }
    };

    verifyTelemetry();
  }, [user, isAdmin, enabled]);
}
