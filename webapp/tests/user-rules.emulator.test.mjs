import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, getIdToken } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, disableNetwork, enableNetwork, doc, getDoc, getDocsFromServer, collection, query, where, limit, setDoc, updateDoc, deleteDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { ensureUserProfile, ensureUserSession } from '../src/lib/firebase/ensureUserProfile.ts';
import { applyUsageBatch } from '../src/tool-workspace/usageBatch.ts';

// Run only against the local Auth and Firestore emulators with firebase/firestore.rules loaded.
test('new users cannot create a paid or privileged account', async () => {
  const app = initializeApp({ apiKey: 'dummy', projectId: 'demo-takeoutfix' }, `rules-${Date.now()}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  try {
    const denied = error => error?.code === 'permission-denied';
    const feedback = doc(db, 'feedback', `feedback-${Date.now()}`);
    const anonymousFeedback = { uid: 'anonymous', email: 'anonymous', displayName: 'Anonymous User', rating: 5, category: 'general', message: 'Helpful', createdAt: Date.now() };
    await setDoc(feedback, anonymousFeedback);
    await assert.rejects(setDoc(doc(db, 'feedback', `bad-${Date.now()}`), { ...anonymousFeedback, uid: 'another-user' }), denied);
    await assert.rejects(setDoc(doc(db, 'feedback', `large-${Date.now()}`), { ...anonymousFeedback, message: 'x'.repeat(4001) }), denied);
    const { user } = await createUserWithEmailAndPassword(auth, `rules-${Date.now()}@example.test`, 'dummy-password');
    const userRef = doc(db, 'users', user.uid);
    await setDoc(doc(db, 'feedback', `signed-${user.uid}`), { ...anonymousFeedback, uid: user.uid, email: user.email });
    await assert.rejects(setDoc(doc(db, 'feedback', `wrong-${user.uid}`), { ...anonymousFeedback, uid: 'anonymous' }), denied);
    await assert.rejects(setDoc(userRef, { uid: user.uid, plan: 'super' }), denied);
    await assert.rejects(setDoc(userRef, { uid: user.uid, plan: 'free', isAdmin: true }), denied);
    await assert.rejects(setDoc(userRef, { uid: user.uid, plan: 'free', usedBytes: -1 }), denied);
    await assert.rejects(setDoc(userRef, { uid: user.uid, email: 'other@example.test', plan: 'free' }), denied);
    const initial = { uid: user.uid, email: user.email, plan: 'free', usedBytes: 0, sessionIds: ['session-a'] };
    await Promise.all([ensureUserProfile(db, user), ensureUserSession(db, user.uid, initial, 'session-a')]);
    assert.equal((await getDoc(userRef)).data().plan, 'free');
    await disableNetwork(db);
    try {
      await assert.rejects(getDocsFromServer(query(collection(db, 'recoveries'), where('uid', '==', user.uid), limit(1))));
    } finally {
      await enableNetwork(db);
    }
    await updateDoc(userRef, { usedBytes: 42 });
    await Promise.all([ensureUserProfile(db, user), ensureUserSession(db, user.uid, initial, 'session-b')]);
    const existing = (await getDoc(userRef)).data();
    assert.equal(existing.usedBytes, 42);
    const batchId = 'a2222222-2222-4222-8222-222222222222';
    await Promise.all([applyUsageBatch(db, user.uid, batchId, 100, 2), applyUsageBatch(db, user.uid, batchId, 100, 2)]);
    await applyUsageBatch(db, user.uid, batchId, 100, 2);
    assert.equal((await getDoc(userRef)).data().usedBytes, 142);
    assert.equal((await getDoc(userRef)).data().usedFiles, 2);
    await assert.rejects(applyUsageBatch(db, user.uid, batchId, 101, 2), /does not match/);
    const batchRef = doc(db, 'users', user.uid, 'usageBatches', batchId);
    await assert.rejects(updateDoc(batchRef, { bytes: 200 }), denied);
    await assert.rejects(getDoc(doc(db, 'users', 'another-user', 'usageBatches', batchId)), denied);
    await assert.rejects(setDoc(doc(db, 'users', user.uid, 'usageBatches', 'invalid'), { bytes: -1, files: 1 }), denied);
    await deleteDoc(batchRef);
    assert.ok(existing.sessionIds.includes('session-a'));
    assert.ok(existing.sessionIds.includes('session-b'));
    await updateDoc(userRef, { displayName: 'Example User', photoURL: 'https://example.test/photo.jpg' });
    await assert.rejects(updateDoc(userRef, { email: 'other@example.test' }), denied);
    await assert.rejects(updateDoc(userRef, { plan: 'super' }), denied);
    await assert.rejects(setDoc(doc(db, 'transactions', `fake-${user.uid}`), { uid: user.uid, plan: 'pro', status: 'succeeded', amount: 999999 }), denied);
    const ticket = doc(db, 'tickets', `ticket-${user.uid}`);
    await assert.rejects(setDoc(ticket, { uid: user.uid, status: 'RESOLVED', replies: [], adminReply: 'Forged' }), denied);
    await assert.rejects(setDoc(ticket, { uid: user.uid, status: 'OPEN', replies: [{ sender: 'admin', message: 'Forged' }] }), denied);
    await assert.rejects(setDoc(ticket, { uid: user.uid, status: 'OPEN', subject: 'Test', message: 'x'.repeat(4001), createdAt: 1, replies: [] }), denied);
    await setDoc(ticket, { uid: user.uid, status: 'OPEN', subject: 'Test', message: 'Help needed', createdAt: 1, replies: [] });
    const reply = { sender: 'user', message: 'Follow-up', timestamp: 1, senderName: 'User' };
    await updateDoc(ticket, { status: 'IN_PROGRESS', replies: arrayUnion(reply) });
    await assert.rejects(updateDoc(ticket, { status: 'IN_PROGRESS', replies: [{ ...reply, sender: 'admin' }] }), denied);
    await assert.rejects(updateDoc(ticket, { status: 'IN_PROGRESS', replies: [] }), denied);
    await assert.rejects(updateDoc(ticket, { status: 'CLOSED', subject: 'Changed' }), denied);
    await updateDoc(ticket, { status: 'CLOSED' });
    assert.equal((await getDoc(ticket)).data().status, 'CLOSED');
    await assert.rejects(updateDoc(ticket, { status: 'IN_PROGRESS', replies: arrayUnion({ ...reply, timestamp: 2 }) }), denied);
    const history = doc(db, 'recoveryHistory', user.uid, 'sessions', 'test-session');
    await setDoc(history, { archiveName: 'example.zip', timestamp: 1, status: 'completed' });
    assert.equal((await getDoc(history)).data().archiveName, 'example.zip');
    await assert.rejects(getDoc(doc(db, 'recoveryHistory', 'another-user', 'sessions', 'test-session')), denied);
    await deleteDoc(history);
    const active = doc(db, 'active_sessions', `restore-${user.uid}`);
    await setDoc(active, { uid: user.uid, email: user.email, status: 'initializing', startedAt: 1, lastUpdated: 1, totalFiles: 0, scanned: 0, matched: 0, bytesProcessed: 0, currentFile: 'Scanning' });
    await updateDoc(active, { status: 'completed', scanned: 2, bytesProcessed: 42 });
    await assert.rejects(updateDoc(active, { uid: 'another-user' }), denied);
    await assert.rejects(updateDoc(active, { unexpected: true }), denied);
    await deleteDoc(active);
    const review = doc(db, 'reviews', `pending-${user.uid}`);
    const reviewData = { uid: user.uid, displayName: 'Example', photoURL: null, status: 'PENDING', rating: 5, message: 'Example review', createdAt: serverTimestamp() };
    await assert.rejects(setDoc(review, { ...reviewData, adminReply: 'Forged staff reply' }), denied);
    await assert.rejects(setDoc(review, { ...reviewData, featured: true }), denied);
    await setDoc(review, reviewData);
    await assert.rejects(getDoc(review), denied);
  } finally {
    await deleteApp(app);
  }
});

test('one account cannot overwrite another account’s active restore', async () => {
  const ownerApp = initializeApp({ apiKey: 'dummy', projectId: 'demo-takeoutfix' }, `owner-${Date.now()}`);
  const otherApp = initializeApp({ apiKey: 'dummy', projectId: 'demo-takeoutfix' }, `other-${Date.now()}`);
  const ownerAuth = getAuth(ownerApp);
  const otherAuth = getAuth(otherApp);
  connectAuthEmulator(ownerAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectAuthEmulator(otherAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const ownerDb = getFirestore(ownerApp);
  const otherDb = getFirestore(otherApp);
  connectFirestoreEmulator(ownerDb, '127.0.0.1', 8080);
  connectFirestoreEmulator(otherDb, '127.0.0.1', 8080);
  try {
    const { user: owner } = await createUserWithEmailAndPassword(ownerAuth, `owner-${Date.now()}@example.test`, 'dummy-password');
    const { user: other } = await createUserWithEmailAndPassword(otherAuth, `other-${Date.now()}@example.test`, 'dummy-password');
    await ensureUserProfile(ownerDb, owner);
    await ensureUserProfile(otherDb, other);
    const batchId = 'b2222222-2222-4222-8222-222222222222';
    await assert.rejects(applyUsageBatch(otherDb, owner.uid, batchId, 100, 1), error => error?.code === 'permission-denied');
    assert.equal((await getDoc(doc(ownerDb, 'users', owner.uid))).data().usedBytes, 0);
    assert.equal((await getDoc(doc(otherDb, 'users', other.uid))).data().usedBytes, 0);
    await applyUsageBatch(ownerDb, owner.uid, batchId, 100, 1);
    assert.equal((await getDoc(doc(ownerDb, 'users', owner.uid))).data().usedBytes, 100);
    const sessionId = `restore-${owner.uid}`;
    await setDoc(doc(ownerDb, 'active_sessions', sessionId), { uid: owner.uid, status: 'processing' });
    await assert.rejects(setDoc(doc(otherDb, 'active_sessions', sessionId), { uid: other.uid, status: 'completed' }), error => error?.code === 'permission-denied');
    assert.equal((await getDoc(doc(ownerDb, 'active_sessions', sessionId))).data().uid, owner.uid);
  } finally {
    await deleteApp(ownerApp);
    await deleteApp(otherApp);
  }
});

test('super-admin email requires a verified email claim', async () => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
  const adminApp = initializeAdminApp({ projectId: 'demo-takeoutfix' }, `verify-admin-${Date.now()}`);
  const app = initializeApp({ apiKey: 'dummy', projectId: 'demo-takeoutfix' }, `verify-client-${Date.now()}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  let uid;
  try {
    const { user } = await createUserWithEmailAndPassword(auth, 'rahuljena.dev@gmail.com', 'dummy-password');
    uid = user.uid;
    await assert.rejects(getDoc(doc(db, 'settings', 'secure')), error => error?.code === 'permission-denied');
    await getAdminAuth(adminApp).updateUser(uid, { emailVerified: true });
    await getIdToken(user, true);
    await getDoc(doc(db, 'settings', 'secure'));
  } finally {
    if (uid) await getAdminAuth(adminApp).deleteUser(uid);
    await deleteApp(app);
    await deleteAdminApp(adminApp);
  }
});

test('support roles cannot read or write secret settings', async () => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
  const adminApp = initializeAdminApp({ projectId: 'demo-takeoutfix' }, `admin-${Date.now()}`);
  const app = initializeApp({ apiKey: 'dummy', projectId: 'demo-takeoutfix' }, `support-${Date.now()}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  try {
    const { user } = await createUserWithEmailAndPassword(auth, `support-${Date.now()}@example.test`, 'dummy-password');
    const adminDb = getAdminFirestore(adminApp);
    await adminDb.doc(`admins/${user.uid}`).set({ role: 'SUPPORT' });
    await adminDb.doc('settings/system').set({ gateway_api_key: 'dummy-test-key' });
    const denied = error => error?.code === 'permission-denied';
    await assert.rejects(getDoc(doc(db, 'settings', 'system')), denied);
    await assert.rejects(setDoc(doc(db, 'settings', 'system'), { gateway_api_key: 'changed' }), denied);
    await assert.rejects(setDoc(doc(db, 'purchase_logs', 'support-test'), { userId: user.uid, amount: 999999 }), denied);
    await assert.rejects(setDoc(doc(db, 'ad_units', 'support-test'), { embedCode: '<script></script>' }), denied);
    for (const name of ['monetization_placements', 'monetization_configs', 'ad_providers', 'affiliate_providers', 'affiliate_links']) {
      await assert.rejects(setDoc(doc(db, name, 'support-test'), { name: 'test' }), denied);
    }
    await assert.rejects(setDoc(doc(db, 'settings', 'monetization'), { adsEnabled: true }), denied);
    await assert.rejects(setDoc(doc(db, 'settings', 'global'), { dodo_products_live: {} }), denied);
    for (const name of ['pricing_tiers', 'campaigns', 'coupons']) {
      await assert.rejects(setDoc(doc(db, name, 'support-test'), { name: 'test' }), denied);
    }
    await assert.rejects(setDoc(doc(db, 'campaigns', 'test', 'discounts', 'plan'), { value: 100 }), denied);
    await assert.rejects(setDoc(doc(db, 'coupons', 'test', 'targets', 'plan'), { value: 100 }), denied);
    await assert.rejects(setDoc(doc(db, 'coupons', 'test', 'sync_log', 'entry'), { status: 'test' }), denied);
    await adminDb.doc(`admins/${user.uid}`).set({ role: 'MODERATOR' });
    await assert.rejects(setDoc(doc(db, 'ad_units', 'moderator-test'), { embedCode: '<script></script>' }), denied);
    await adminDb.doc(`admins/${user.uid}`).set({ role: 'ADMIN' });
    await assert.rejects(setDoc(doc(db, 'purchase_logs', 'admin-test'), { userId: user.uid, amount: 999999 }), denied);
    await setDoc(doc(db, 'ad_units', 'admin-test'), { embedCode: '<div>test</div>' });
    await setDoc(doc(db, 'pricing_tiers', 'admin-test'), { name: 'test' });
    await setDoc(doc(db, 'transactions', 'admin-test'), { uid: user.uid, status: 'succeeded', amount: 0 });
  } finally {
    await deleteApp(app);
    await deleteAdminApp(adminApp);
  }
});

test('notification recipients can only mark their own notices as read', async () => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
  const adminApp = initializeAdminApp({ projectId: 'demo-takeoutfix' }, `notif-admin-${Date.now()}`);
  const app = initializeApp({ apiKey: 'dummy', projectId: 'demo-takeoutfix' }, `notif-client-${Date.now()}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  try {
    const { user } = await createUserWithEmailAndPassword(auth, `notif-${Date.now()}@example.test`, 'dummy-password');
    const adminDb = getAdminFirestore(adminApp);
    await adminDb.doc('notifications/own-test').set({ recipientEmail: user.email, title: 'Notice', read: false });
    await adminDb.doc('notifications/global-test').set({ recipientEmail: 'all', title: 'Global', read: false });
    const own = doc(db, 'notifications', 'own-test');
    await assert.rejects(getDoc(own), error => error?.code === 'permission-denied');
    await getDoc(doc(db, 'notifications', 'global-test'));
    await getAdminAuth(adminApp).updateUser(user.uid, { emailVerified: true });
    await getIdToken(user, true);
    await getDoc(own);
    await updateDoc(own, { read: true });
    await assert.rejects(updateDoc(own, { title: 'Altered' }), error => error?.code === 'permission-denied');
    await assert.rejects(updateDoc(doc(db, 'notifications', 'global-test'), { read: true }), error => error?.code === 'permission-denied');
  } finally {
    await deleteApp(app);
    await deleteAdminApp(adminApp);
  }
});
