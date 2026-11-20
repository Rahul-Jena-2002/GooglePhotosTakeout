import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';

// Run only against an isolated local server connected to Firebase emulators.
test('upgrade discounts reject fabricated and missing bearer tokens', async () => {
  for (const token of ['', 'test-token-fake-user']) {
    const response = await fetch('http://127.0.0.1:3000/create-dodo-upgrade-discount', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ targetPlan: 'super', region: 't3' }),
    });
    assert.equal(response.status, 401);
  }
});

test('upgrade discounts do not guess a price when purchase history is missing', async () => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
  const client = initializeApp({ apiKey: 'dummy', projectId: 'demo-takeoutfix' }, `upgrade-${Date.now()}`);
  const admin = initializeAdminApp({ projectId: 'demo-takeoutfix' }, `upgrade-admin-${Date.now()}`);
  const auth = getAuth(client);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  try {
    const { user } = await createUserWithEmailAndPassword(auth, `upgrade-${Date.now()}@example.test`, 'dummy-password');
    await getAdminFirestore(admin).doc(`users/${user.uid}`).set({ plan: 'pro' });
    const response = await fetch('http://127.0.0.1:3000/create-dodo-upgrade-discount', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
      body: JSON.stringify({ targetPlan: 'super', region: 't3' }),
    });
    assert.equal(response.status, 409);

    const db = getAdminFirestore(admin);
    assert.equal((await db.doc('pricing_tiers/Tier 2').get()).exists, false, 'Use a fresh isolated emulator');
    await db.doc(`purchase_logs/test-${user.uid}`).set({
      userId: user.uid, plan: 'pro', regionCode: 't2', amount: 2900,
      currency: 'USD', purchasedAt: Date.now(),
    });
    const noPrice = await fetch('http://127.0.0.1:3000/create-dodo-upgrade-discount', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
      body: JSON.stringify({ targetPlan: 'super', region: 't2' }),
    });
    assert.equal(noPrice.status, 500);
  } finally {
    await deleteApp(client);
    await deleteAdminApp(admin);
  }
});
