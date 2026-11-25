import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { pendingUsageKey, recoverAccountBatches } from '../src/tool-workspace/pendingUsage.ts';

test('site-wide online listener recovers the active account batch under the restore lock', { timeout: 5000 }, async () => {
  const source = readFileSync(new URL('../src/lib/browserAuth.ts', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const key = pendingUsageKey('user-a', 'session');
  const records = new Map([[key, { uid: 'user-a', batchId: '12345678-1234-4234-8234-123456789abc', bytes: 10, files: 2 }]]);
  const events = new Map();
  const auth = { currentUser: { uid: 'user-a' }, onAuthStateChanged() {} };
  let releases = 0;
  let sent;
  let resolveDelivered;
  const delivered = new Promise(resolve => { resolveDelivered = resolve; });
  const modules = {
    '../firebase': { auth, db: {} },
    './restoreLock': { acquireRestoreLock: async () => () => { releases++; } },
    './indexedDbService': { indexedDbService: {
      getAllKeys: async () => [...records.keys()],
      get: async (_store, item) => records.get(item),
      remove: async (_store, item) => { records.delete(item); resolveDelivered(); },
    } },
    '../tool-workspace/pendingUsage': { recoverAccountBatches },
    '../tool-workspace/usageBatch': { applyUsageBatch: async (_db, uid, batch, bytes, files) => { sent = { uid, batch, bytes, files }; } },
  };
  const exports = {};
  runInNewContext(code, {
    exports, require: name => modules[name] || {},
    window: { addEventListener: (name, handler) => events.set(name, handler) },
    navigator: { onLine: true, locks: {} },
    console, setTimeout, clearTimeout,
  });
  exports.setupAuthListeners();
  assert.equal(typeof events.get('online'), 'function');
  events.get('online')();
  await delivered;
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(sent, { uid: 'user-a', batch: '12345678-1234-4234-8234-123456789abc', bytes: 10, files: 2 });
  assert.equal(records.has(key), false);
  assert.equal(releases, 1);
});

test('site-wide recovery retries after another tab releases the restore lock', { timeout: 5000 }, async () => {
  const source = readFileSync(new URL('../src/lib/browserAuth.ts', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const key = pendingUsageKey('user-a', 'session');
  const records = new Map([[key, { uid: 'user-a', batchId: '12345678-1234-4234-8234-123456789abc', bytes: 10, files: 2 }]]);
  const events = new Map();
  const auth = { currentUser: { uid: 'user-a' }, onAuthStateChanged() {} };
  let attempts = 0;
  let timer;
  let resolveDelivered;
  const delivered = new Promise(resolve => { resolveDelivered = resolve; });
  const modules = {
    '../firebase': { auth, db: {} },
    './restoreLock': { acquireRestoreLock: async () => {
      if (++attempts === 1) throw new Error('Another restore holds the lock');
      return () => {};
    } },
    './indexedDbService': { indexedDbService: {
      getAllKeys: async () => [...records.keys()],
      get: async (_store, item) => records.get(item),
      remove: async (_store, item) => { records.delete(item); resolveDelivered(); },
    } },
    '../tool-workspace/pendingUsage': { recoverAccountBatches },
    '../tool-workspace/usageBatch': { applyUsageBatch: async () => {} },
  };
  const exports = {};
  runInNewContext(code, {
    exports, require: name => modules[name] || {},
    window: { addEventListener: (name, handler) => events.set(name, handler) },
    navigator: { onLine: true, locks: {} },
    console, setTimeout: callback => { timer = callback; return 1; }, clearTimeout,
  });
  exports.setupAuthListeners();
  events.get('online')();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(attempts, 1);
  assert.equal(records.has(key), true);
  assert.equal(typeof timer, 'function');
  timer();
  await delivered;
  assert.equal(attempts, 2);
  assert.equal(records.has(key), false);
});
