import { useEffect } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

/**
 * Tracks admin online/idle/offline presence in Firestore.
 * Call this hook once inside AdminLayout to keep presence alive.
 */
export function useAdminPresence() {
  const { user, adminData } = useAuth();

  useEffect(() => {
    if (!user || !adminData) return;

    const adminRef = doc(db, 'admins', user.uid);

    const setStatus = async (status: 'online' | 'idle' | 'offline') => {
      try {
        await setDoc(adminRef, { status, lastSeen: Date.now() }, { merge: true });
      } catch (e) {
        console.error('Presence update failed', e);
      }
    };

    // Go online immediately
    setStatus('online');

    // Heartbeat every 30 seconds to stay "online"
    const heartbeat = setInterval(() => setStatus('online'), 30_000);

    // Go idle when tab is hidden
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        setStatus('idle');
      } else {
        setStatus('online');
      }
    };

    // Go offline before page unload
    const handleUnload = () => setStatus('offline');

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('beforeunload', handleUnload);
      setStatus('offline');
    };
  }, [user, adminData]);
}
