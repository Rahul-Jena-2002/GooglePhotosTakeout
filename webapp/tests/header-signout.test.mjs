import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

test('header sign-out respects the restore lock and handles duplicate clicks', async () => {
  const source = readFileSync(new URL('../src/lib/browserAuth.ts', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const handlers = [];
  const removed = [];
  let completeSignOut;
  let failSignOut;
  let signOutCalls = 0;
  let releases = 0;
  let locked = true;
  const messages = [];
  const auth = {};
  const modules = {
    '../firebase': { auth, db: {}, signOut: () => { signOutCalls++; return new Promise((resolve, reject) => { completeSignOut = resolve; failSignOut = reject; }); } },
    './restoreLock': { acquireRestoreLock: async () => {
      if (locked) throw new Error('A restore is already open in another tab.');
      return () => { releases++; };
    } },
  };
  const exports = {};
  const button = { addEventListener: (_event, handler) => handlers.push(handler) };
  const location = { href: '' };
  runInNewContext(code, {
    exports, require: name => modules[name] || {},
    document: { querySelectorAll: () => [button] },
    navigator: { locks: {} },
    localStorage: { removeItem: key => removed.push(key) },
    sessionStorage: { removeItem: key => removed.push(key) },
    window: { location, showVanillaToast: message => messages.push(message) },
    console: { error() {} }, Error,
  });

  exports.setupAuthEvents();
  exports.setupAuthEvents();
  assert.equal(handlers.length, 1);
  await handlers[0]();
  assert.equal(signOutCalls, 0);
  assert.deepEqual(removed, []);
  assert.match(messages[0], /Finish or cancel/);
  locked = false;
  const failed = handlers[0]();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(signOutCalls, 1);
  failSignOut(new Error('Firebase unavailable'));
  await failed;
  assert.equal(signOutCalls, 1);
  assert.deepEqual(removed, []);
  assert.equal(location.href, '');
  assert.equal(releases, 1);
  const first = handlers[0]();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(signOutCalls, 2);
  await handlers[0]();
  assert.equal(signOutCalls, 2);
  assert.deepEqual(removed, []);
  completeSignOut();
  await first;
  assert.ok(removed.includes('takeoutfix_user_data'));
  assert.equal(location.href, '/');
  assert.equal(releases, 2);
});
