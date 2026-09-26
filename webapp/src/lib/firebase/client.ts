import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut, onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.PUBLIC_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: import.meta.env.PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: import.meta.env.PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: import.meta.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: import.meta.env.PUBLIC_FIREBASE_APP_ID || "",
  measurementId: import.meta.env.PUBLIC_FIREBASE_MEASUREMENT_ID || "",
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
if (googleProvider) {
  googleProvider.setCustomParameters({
    prompt: "select_account"
  });
}

export { signInWithPopup, signInWithRedirect, signOut, onAuthStateChanged };
export type { User };

import { initializeFirestore, getFirestore } from 'firebase/firestore';

let dbInstance: any = null;
if (typeof window !== 'undefined') {
  try {
    dbInstance = initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
    });
  } catch (e) {
    try {
      dbInstance = getFirestore(app);
    } catch (err) {
      console.warn("Failed to initialize Firestore in browser/webview environment:", err);
    }
  }
}

export const db = dbInstance;

export async function getDb() {
  if (!dbInstance) {
    try {
      dbInstance = initializeFirestore(app, {
        experimentalAutoDetectLongPolling: true,
      });
    } catch {
      dbInstance = getFirestore(app);
    }
  }
  return dbInstance;
}

