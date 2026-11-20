import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut, onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';

function getFirebaseConfig() {
  const win = typeof window !== 'undefined' ? (window as any).__FIREBASE_CONFIG__ : null;
  return {
    apiKey: win?.apiKey || import.meta.env.PUBLIC_FIREBASE_API_KEY || "",
    authDomain: win?.authDomain || import.meta.env.PUBLIC_FIREBASE_AUTH_DOMAIN || "",
    projectId: win?.projectId || import.meta.env.PUBLIC_FIREBASE_PROJECT_ID || "",
    storageBucket: win?.storageBucket || import.meta.env.PUBLIC_FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: win?.messagingSenderId || import.meta.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
    appId: win?.appId || import.meta.env.PUBLIC_FIREBASE_APP_ID || "",
    measurementId: win?.measurementId || import.meta.env.PUBLIC_FIREBASE_MEASUREMENT_ID || "",
  };
}

export const app = initializeApp(getFirebaseConfig());
const useLocalEmulators = import.meta.env.DEV && import.meta.env.PUBLIC_FIREBASE_USE_LIVE !== 'true';

// Safe auth initialization for SSR/browser environments
let authInstance: any = null;
if (typeof window !== 'undefined') {
  try {
    authInstance = getAuth(app);
    if (useLocalEmulators) connectAuthEmulator(authInstance, 'http://127.0.0.1:9099', { disableWarnings: true });
  } catch (e) {
    authInstance = null;
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

import { initializeFirestore, getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

function createFirestore() {
  let firestore;
  try {
    firestore = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
  } catch {
    firestore = getFirestore(app);
  }
  if (useLocalEmulators) connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
  return firestore;
}

let dbInstance: any = null;
if (typeof window !== 'undefined') {
  try {
    dbInstance = createFirestore();
  } catch (e) {
    console.warn("Failed to initialize Firestore in browser/webview environment:", e);
  }
}

export const db = dbInstance;

export async function getDb() {
  if (!dbInstance) {
    dbInstance = createFirestore();
  }
  return dbInstance;
}

