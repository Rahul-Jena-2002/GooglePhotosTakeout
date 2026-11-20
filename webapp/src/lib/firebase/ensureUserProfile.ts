import { doc, runTransaction, type DocumentData, type Firestore } from "firebase/firestore";
import type { User } from "firebase/auth";

export async function ensureUserProfile(db: Firestore, user: User, nameOverride?: string): Promise<void> {
  const userRef = doc(db, "users", user.uid);
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(userRef);
    if (!snapshot.exists()) transaction.set(userRef, {
      uid: user.uid,
      email: user.email,
      displayName: nameOverride || user.displayName || (user.email ? user.email.split("@")[0] : "User"),
      photoURL: user.photoURL || null,
      plan: "free",
      usedBytes: 0,
      usedFiles: 0,
      totalBytesProcessed: 0,
      totalFilesProcessed: 0,
      createdAt: Date.now(),
      suspended: false,
    });
  });
}

export async function ensureUserSession(db: Firestore, uid: string, initial: DocumentData, sessionId: string): Promise<DocumentData> {
  const userRef = doc(db, "users", uid);
  return runTransaction(db, async transaction => {
    const snapshot = await transaction.get(userRef);
    if (!snapshot.exists()) {
      transaction.set(userRef, initial);
      return initial;
    }
    const existing = snapshot.data();
    const sessions = Array.isArray(existing.sessionIds) ? existing.sessionIds : [];
    const sessionIds = [...new Set([...sessions, sessionId])].slice(-20);
    transaction.update(userRef, { sessionIds });
    return { ...existing, sessionIds };
  });
}
