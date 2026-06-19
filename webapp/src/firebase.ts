import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut, onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.PUBLIC_FIREBASE_API_KEY,
  authDomain: import.meta.env.PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.PUBLIC_FIREBASE_APP_ID,
  measurementId: import.meta.env.PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export { signInWithPopup, signInWithRedirect, signOut, onAuthStateChanged };
export type { User };

let dbInstance: any = null;

export async function getDb() {
  if (!dbInstance) {
    const { getFirestore } = await import('firebase/firestore');
    dbInstance = getFirestore(app);
  }
  return dbInstance;
}

// Lazy db export - loads on first access. For backward compatibility with existing imports.
export let db: any = null;
getDb().then(instance => { db = instance; });

// -- Cloud Quota & License Logic --
export interface UserRecord {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  usedBytes: number;
  licenseType: 'free' | '15gb' | '24hour' | 'lifetime';
  expiresAt?: number;
}

export const initUser = async (firebaseUser: any) => {
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
}

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

export async function logExtractionEvent(user: User, bytesProcessed: number, filesMatched: number, filesTotal: number) {
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
