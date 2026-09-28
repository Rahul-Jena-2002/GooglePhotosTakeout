import { useEffect } from 'react';
import { doc, getDoc, setDoc, getDocs, collection } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { isSuperAdminEmail } from '../lib/adminAuth';

const getUserBytes = (u: any) => {
  return Math.max(u.usedBytes || 0, u.totalBytesProcessed || 0, u.lifetimeBytes || 0);
};

const getUserFiles = (u: any) => {
  const recorded = Math.max(u.totalFilesProcessed || 0, u.usedFiles || 0, u.lifetimeFiles || 0);
  const trackedBytes = Math.max(u.totalBytesProcessed || 0, u.usedBytes || 0);
  const legacyBytes = Math.max(0, (u.lifetimeBytes || 0) - trackedBytes);
  const legacyFiles = legacyBytes > 0 ? Math.round(legacyBytes / (1.2 * 1024 * 1024)) : 0;
  return recorded + legacyFiles;
};

/**
 * Optimized background hook to ensure platform_stats/global exists.
 * Replaces expensive persistent full-collection snapshot listeners with a single
 * session-cached one-shot check, drastically cutting Firestore reads.
 */
export function useTelemetrySync(enabled: boolean = true) {
  const { user, userData, adminData } = useAuth();
  const isAdmin = !!adminData || isSuperAdminEmail(user?.email);

  useEffect(() => {
    if (!user || !isAdmin || !enabled) return;

    // Run at most once per admin session to avoid burning Firestore reads on every navigation
    if (typeof window !== 'undefined' && sessionStorage.getItem('takeoutfix_telemetry_synced')) {
      return;
    }

    const verifyTelemetry = async () => {
      try {
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('takeoutfix_telemetry_synced', 'true');
        }
        const globalRef = doc(db, 'platform_stats', 'global');
        const snap = await getDoc(globalRef);
        const existingData = snap.exists() ? snap.data() : {};

        // Query collections to get real live counts
        const [usersSnap, recoveriesSnap, ticketsSnap] = await Promise.all([
          getDocs(collection(db, "users")),
          getDocs(collection(db, "recoveries")),
          getDocs(collection(db, "tickets"))
        ]);

        const usersList = usersSnap.docs.map(d => d.data());
        const recoveriesList = recoveriesSnap.docs.map(d => d.data());
        const ticketsList = ticketsSnap.docs.map(d => d.data());

        const calculatedBytes = Math.max(existingData.bytesProcessed || 0, usersList.reduce((acc, u) => acc + getUserBytes(u), 0));
        const calculatedScanned = Math.max(existingData.filesScanned || 0, usersList.reduce((acc, u) => acc + getUserFiles(u), 0));
        
        const recoveriesScanned = recoveriesList.reduce((acc, r) => acc + (r.scanned || 0), 0);
        const recoveriesMatched = recoveriesList.reduce((acc, r) => acc + (r.matched || 0), 0);
        
        const ratio = recoveriesScanned > 0 ? (recoveriesMatched / recoveriesScanned) : 0.999;
        const calculatedMatched = Math.max(existingData.filesRestored || 0, Math.round(calculatedScanned * ratio));
        
        const calculatedResolvedTickets = Math.max(existingData.ticketsResolved || 0, ticketsList.filter(t => t.status === "RESOLVED" || t.status === "CLOSED").length);

        const currentUsersCount = usersList.length > 0 ? usersList.length : (existingData.usersCount || 0);

        await setDoc(globalRef, {
          bytesProcessed: calculatedBytes,
          filesRestored: calculatedMatched,
          filesScanned: calculatedScanned,
          usersCount: currentUsersCount,
          ticketsResolved: calculatedResolvedTickets
        }, { merge: true });
      } catch (err) {
        console.warn("Telemetry verification completed with notice:", err);
      }
    };

    verifyTelemetry();
  }, [user, isAdmin, enabled]);
}
