import { useEffect } from 'react';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

const getUserBytes = (u: any) => {
  return Math.max(u.usedBytes || 0, u.totalBytesProcessed || 0, u.lifetimeBytes || 0);
};

const getUserFiles = (u: any) => {
  const recorded = Math.max(u.totalFilesProcessed || 0, u.usedFiles || 0, u.lifetimeFiles || 0);
  if (recorded > 0) return recorded;
  
  // Heuristic for legacy data missing files count (assumes average size of 1.2 MB per file)
  const bytes = Math.max(u.usedBytes || 0, u.totalBytesProcessed || 0, u.lifetimeBytes || 0);
  if (bytes > 0) {
    return Math.round(bytes / (1.2 * 1024 * 1024));
  }
  return 0;
};

/**
 * Background hook to keep platform_stats/global in sync with actual collection aggregates.
 * Executes only if the logged-in user is an administrator.
 */
export function useTelemetrySync() {
  const { user, userData, adminData } = useAuth();
  const isAdmin = userData?.isAdmin || !!adminData;

  useEffect(() => {
    if (!user || !isAdmin) return;

    let usersList: any[] = [];
    let recoveriesList: any[] = [];
    let ticketsList: any[] = [];
    let globalStats: any = null;
    let isInitialized = false;

    const checkAndSync = () => {
      // Avoid running sync before we have read users list
      if (!isInitialized && usersList.length === 0) return;

      const calculatedBytes = usersList.reduce((acc, u) => acc + getUserBytes(u), 0);
      const calculatedScanned = usersList.reduce((acc, u) => acc + getUserFiles(u), 0);
      
      const recoveriesScanned = recoveriesList.reduce((acc, r) => acc + (r.scanned || 0), 0);
      const recoveriesMatched = recoveriesList.reduce((acc, r) => acc + (r.matched || 0), 0);
      
      const ratio = recoveriesScanned > 0 ? (recoveriesMatched / recoveriesScanned) : 0.999;
      const calculatedMatched = Math.round(calculatedScanned * ratio);
      
      const calculatedResolvedTickets = ticketsList.filter(t => t.status === "RESOLVED" || t.status === "CLOSED").length;

      const needsWrite = !globalStats ||
        globalStats.bytesProcessed !== calculatedBytes ||
        globalStats.filesRestored !== calculatedMatched ||
        globalStats.filesScanned !== calculatedScanned ||
        globalStats.usersCount !== usersList.length ||
        globalStats.ticketsResolved !== calculatedResolvedTickets;

      if (needsWrite) {
        const globalRef = doc(db, 'platform_stats', 'global');
        setDoc(globalRef, {
          bytesProcessed: calculatedBytes,
          filesRestored: calculatedMatched,
          filesScanned: calculatedScanned,
          usersCount: usersList.length,
          ticketsResolved: calculatedResolvedTickets
        }, { merge: true }).catch((err) => {
          console.error("Failed to sync platform telemetry stats:", err);
        });
      }
    };

    // 1. Listen to users
    const unsubUsers = onSnapshot(collection(db, "users"), (snap) => {
      usersList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      isInitialized = true;
      checkAndSync();
    }, (err) => console.error("Telemetry sync users listener error:", err));

    // 2. Listen to recoveries
    const unsubRecoveries = onSnapshot(collection(db, "recoveries"), (snap) => {
      recoveriesList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      checkAndSync();
    }, (err) => console.error("Telemetry sync recoveries listener error:", err));

    // 3. Listen to tickets
    const unsubTickets = onSnapshot(collection(db, "tickets"), (snap) => {
      ticketsList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      checkAndSync();
    }, (err) => console.error("Telemetry sync tickets listener error:", err));

    // 4. Listen to global stats document
    const unsubGlobal = onSnapshot(doc(db, "platform_stats", "global"), (snap) => {
      if (snap.exists()) {
        globalStats = snap.data();
      } else {
        globalStats = null;
      }
      checkAndSync();
    }, (err) => console.error("Telemetry sync globalStats listener error:", err));

    return () => {
      unsubUsers();
      unsubRecoveries();
      unsubTickets();
      unsubGlobal();
    };
  }, [user, isAdmin]);
}
