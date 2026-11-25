import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

test('account sign-out does not wait for Firestore and releases the restore lock', async () => {
  const source = readFileSync(new URL('../src/contexts/AuthContext.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('  const logout = async () => {');
  const end = source.indexOf('  const deleteAccount = ', start);
  assert.ok(start >= 0 && end > start);
  const code = ts.transpileModule(`${source.slice(start, end)}\nlogout;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const removed = [];
  let releases = 0;
  let signOutCalls = 0;
  const logout = runInNewContext(code, {
    navigator: { locks: {} },
    acquireRestoreLock: async () => () => { releases++; },
    auth: {},
    signOut: async () => { signOutCalls++; },
    localStorage: { removeItem: key => removed.push(key) },
    sessionStorage: { removeItem: key => removed.push(key) },
    setSessionRegistered() {}, setHasSeenSelfInSessions() {}
  });
  await logout();
  assert.equal(signOutCalls, 1);
  assert.equal(releases, 1);
  assert.ok(removed.includes('takeoutfix_user_data'));
});

test('a failed account sign-out retains local data and releases the lock', async () => {
  const source = readFileSync(new URL('../src/contexts/AuthContext.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('  const logout = async () => {');
  const end = source.indexOf('  const deleteAccount = ', start);
  assert.ok(start >= 0 && end > start);
  const code = ts.transpileModule(`${source.slice(start, end)}\nlogout;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const removed = [];
  let releases = 0;
  const logout = runInNewContext(code, {
    navigator: { locks: {} },
    acquireRestoreLock: async () => () => { releases++; },
    auth: {},
    signOut: async () => { throw new Error('Sign-out failed'); },
    localStorage: { removeItem: key => removed.push(key) },
    sessionStorage: { removeItem: key => removed.push(key) },
    setSessionRegistered() {}, setHasSeenSelfInSessions() {}
  });
  await assert.rejects(logout(), /Sign-out failed/);
  assert.deepEqual(removed, []);
  assert.equal(releases, 1);
});
