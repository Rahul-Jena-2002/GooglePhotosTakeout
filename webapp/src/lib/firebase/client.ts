import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut, onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.PUBLIC_FIREBASE_API_KEY || "AIzaSyDBTj1lcAbftiAYwnv5upjHK7ET_sNgZNk",
  authDomain: import.meta.env.PUBLIC_FIREBASE_AUTH_DOMAIN || "takeout-fix.firebaseapp.com",
  projectId: import.meta.env.PUBLIC_FIREBASE_PROJECT_ID || "takeout-fix",
  storageBucket: import.meta.env.PUBLIC_FIREBASE_STORAGE_BUCKET || "takeout-fix.firebasestorage.app",
  messagingSenderId: import.meta.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "1089411779683",
  appId: import.meta.env.PUBLIC_FIREBASE_APP_ID || "1:1089411779683:web:a0afa9043f9f7cecdabc56",
  measurementId: import.meta.env.PUBLIC_FIREBASE_MEASUREMENT_ID || "G-YNTVCXYR6N",
};

export const app = initializeApp(firebaseConfig);

// Safe auth initialization for SSR/browser environments
let authInstance: any = null;
if (typeof window !== 'undefined') {
  try {
    authInstance = getAuth(app);
  } catch (e) {
    console.warn("Failed to initialize Firebase Auth in browser environment:", e);
  }
} else {
  authInstance = {
    onAuthStateChanged: () => () => {},
    currentUser: null,
  };
}

export const auth = authInstance;
export const googleProvider = typeof window !== 'undefined' ? new GoogleAuthProvider() : (null as any);

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

export let db: any = null;
getDb().then(instance => { db = instance; });
