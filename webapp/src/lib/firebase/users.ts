import type { User } from 'firebase/auth';
import { getDb } from './client';

export interface UserRecord {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  usedBytes: number;
  licenseType: 'free' | '15gb' | '24hour' | 'lifetime';
  expiresAt?: number;
}

export const initUser = async (firebaseUser: any): Promise<UserRecord> => {
  const { doc, getDoc, setDoc } = await import('firebase/firestore');
  const firebaseDb = await getDb();
  const userRef = doc(firebaseDb, 'users', firebaseUser.uid);
  const snap = await getDoc(userRef);

  if (!snap.exists()) {
    const newUser: UserRecord = {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: firebaseUser.displayName,
      photoURL: firebaseUser.photoURL,
      usedBytes: 0,
      licenseType: 'free',
    };
    await setDoc(userRef, newUser);
    return newUser;
  }

  return snap.data() as UserRecord;
};

/** Increment the user's usedBytes in Firestore securely. */
export async function addCloudUsage(user: User, bytes: number) {
  const { doc, updateDoc, increment } = await import('firebase/firestore');
  const firebaseDb = await getDb();
  const userRef = doc(firebaseDb, 'users', user.uid);
  await updateDoc(userRef, {
    usedBytes: increment(bytes),
    lifetimeBytes: increment(bytes)
  });
}

export async function logExtractionEvent(
  user: User,
  bytesProcessed: number,
  filesMatched: number,
  filesTotal: number
) {
  const { collection, addDoc } = await import('firebase/firestore');
  const firebaseDb = await getDb();
  const logsRef = collection(firebaseDb, 'usage_logs');
  await addDoc(logsRef, {
    uid: user.uid,
    email: user.email || 'Anonymous',
    bytesProcessed,
    filesMatched,
    filesTotal,
    timestamp: Date.now()
  });
}
