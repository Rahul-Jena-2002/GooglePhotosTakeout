import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut, onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, updateDoc, increment } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBAQFr7OeHkaLDk8yfNyGl6YD2qhdlnoXk",
  authDomain: "gt-metadata-merger.firebaseapp.com",
  projectId: "gt-metadata-merger",
  storageBucket: "gt-metadata-merger.firebasestorage.app",
  messagingSenderId: "198090983108",
  appId: "1:198090983108:web:a90faac4214ecd91d76b91",
  measurementId: "G-P0DY1QKD63"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

export { signInWithPopup, signInWithRedirect, signOut, onAuthStateChanged };
export type { User };

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
  const userRef = doc(db, 'users', firebaseUser.uid);
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
  const userRef = doc(db, 'users', user.uid);
  await updateDoc(userRef, {
    usedBytes: increment(bytes),
    lifetimeBytes: increment(bytes)
  });
}

import { collection, addDoc } from 'firebase/firestore';

export async function logExtractionEvent(user: User, bytesProcessed: number, filesMatched: number, filesTotal: number) {
  const logsRef = collection(db, 'usage_logs');
  await addDoc(logsRef, {
    uid: user.uid,
    email: user.email || 'Anonymous',
    bytesProcessed,
    filesMatched,
    filesTotal,
    timestamp: Date.now()
  });
}
