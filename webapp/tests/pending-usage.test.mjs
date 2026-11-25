import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { pendingUsageKey, pendingUsageKeys, flushUnstoredUsage, recoverAccountBatches, isValidUsageBatch, UsageCheckpoints, PendingZipUsage } from '../src/tool-workspace/pendingUsage.ts';

test('a retried usage transaction does not increment totals twice', async () => {
  const source = readFileSync(new URL('../src/tool-workspace/usageBatch.ts', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const docs = new Map();
  const firestore = {
    doc: (_db, ...parts) => parts.join('/'),
    increment: amount => ({ increment: amount }),
    runTransaction: async (_db, callback) => {
      const writes = [];
      await callback({
        get: async ref => ({ exists: () => docs.has(ref), data: () => docs.get(ref) }),
        set: (ref, value) => writes.push([ref, value]),
      });
      for (const [ref, value] of writes) {
        const result = { ...(docs.get(ref) || {}) };
        for (const [key, item] of Object.entries(value)) {
          result[key] = item && typeof item === 'object' && 'increment' in item ? (result[key] || 0) + item.increment : item;
        }
        docs.set(ref, result);
      }
    },
  };
  const exports = {};
  runInNewContext(code, { exports, require: name => name === 'firebase/firestore' ? firestore : { isValidUsageBatch }, Error });
  const id = '12345678-1234-4234-8234-123456789abc';
  await exports.applyUsageBatch({}, 'account-a', id, 240, 3);
  await exports.applyUsageBatch({}, 'account-a', id, 240, 3);
  assert.equal(docs.get('users/account-a').totalBytesProcessed, 240);
  assert.equal(docs.get('users/account-a').totalFilesProcessed, 3);
  await assert.rejects(exports.applyUsageBatch({}, 'account-a', id, 241, 3), /does not match/);
  assert.equal(docs.get('users/account-a').totalBytesProcessed, 240);
});

test('unfinished ZIP usage stays pending until a part is finalized or discarded', () => {
  const pending = new PendingZipUsage();
  pending.add(100);
  pending.add(40);
  const atPause = pending.snapshot();
  assert.deepEqual(atPause, { bytes: 140, files: 2 });
  atPause.bytes = 0;
  assert.deepEqual(pending.snapshot(), { bytes: 140, files: 2 });
  assert.deepEqual(pending.take(), { bytes: 140, files: 2 });
  pending.add(20);
  assert.deepEqual(pending.take(), { bytes: 20, files: 1 });
  assert.deepEqual(pending.take(), { bytes: 0, files: 0 });
});

test('ZIP checkpoints exclude the unfinished part and retain finalized parts on cancellation', async () => {
  const pending = new PendingZipUsage();
  const checkpoints = new UsageCheckpoints();
  const saved = [];
  let totals = { bytes: 100, files: 1 };
  pending.add(100);
  const checkpoint = () => {
    const held = pending.snapshot();
    checkpoints.capture({ bytes: totals.bytes - held.bytes, files: totals.files - held.files }, async delta => { saved.push(delta); });
  };
  checkpoint();
  pending.take(); // The first archive part was prepared for download.
  checkpoint();
  pending.add(40);
  totals = { bytes: 140, files: 2 };
  checkpoint();
  await checkpoints.settle();
  assert.deepEqual(saved, [{ bytes: 100, files: 1 }]);
  const discarded = pending.take();
  assert.deepEqual(checkpoints.consume({ bytes: totals.bytes - discarded.bytes, files: totals.files - discarded.files }), { bytes: 0, files: 0 });
});

test('checkpoint deltas do not overlap and finalization waits for writes', async () => {
  const tracker = new UsageCheckpoints();
  const deltas = [];
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  tracker.capture({ bytes: 100, files: 2 }, async delta => { deltas.push(delta); await blocked; });
  tracker.capture({ bytes: 150, files: 3 }, async delta => { deltas.push(delta); });
  tracker.capture({ bytes: 150, files: 3 }, async () => { throw new Error('duplicate checkpoint'); });
  let settled = false;
  const finalizing = tracker.settle().then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false);
  assert.deepEqual(deltas, [{ bytes: 100, files: 2 }, { bytes: 50, files: 1 }]);
  release();
  await finalizing;
  assert.deepEqual(tracker.consume({ bytes: 190, files: 4 }), { bytes: 40, files: 1 });
  assert.deepEqual(tracker.consume({ bytes: 10, files: 1 }), { bytes: 10, files: 1 });
});

test('failed checkpoint can be retained and retried for its original account', async () => {
  const tracker = new UsageCheckpoints();
  const queued = [];
  const stored = new Map();
  const uid = 'account-a';
  tracker.capture({ bytes: 240, files: 3 }, async delta => {
    const entry = {
      key: pendingUsageKey(uid, 'session:batch'),
      value: { uid, batchId: '12345678-1234-4234-8234-123456789abc', ...delta, sessionId: 'session', takeoutName: 'export', historySessionId: null },
    };
    try {
      throw new Error('storage unavailable');
    } catch {
      queued.push(entry);
    }
  });
  await tracker.settle();
  assert.deepEqual(tracker.consume({ bytes: 240, files: 3 }), { bytes: 0, files: 0 });
  await flushUnstoredUsage(queued, async entry => stored.set(entry.key, entry.value));
  const applied = [];
  await recoverAccountBatches('account-b', [...stored.keys()], () => true,
    async key => stored.get(key), async batch => applied.push(batch), async key => stored.delete(key));
  assert.equal(applied.length, 0);
  await recoverAccountBatches(uid, [...stored.keys()], () => true,
    async key => stored.get(key), async batch => applied.push(batch), async key => stored.delete(key));
  assert.equal(applied.length, 1);
  assert.equal(applied[0].uid, uid);
  assert.equal(applied[0].bytes, 240);
  assert.equal(applied[0].files, 3);
  assert.equal(stored.size, 0);
});

test('pending records are separated by account and session with older keys retained for recovery', () => {
  const first = pendingUsageKey('user-a', 'session-1');
  const second = pendingUsageKey('user-a', 'session-2');
  const other = pendingUsageKey('user-b', 'session-1');
  assert.notEqual(first, second);
  assert.notEqual(pendingUsageKey('user-a', 'session-1:batch-a'), pendingUsageKey('user-a', 'session-1:batch-b'));
  assert.deepEqual(pendingUsageKeys('user-a', [first, other, second, 'guest_quota']), [
    first, second, 'takeoutfix_pending_usage:user-a', 'takeoutfix_pending_usage'
  ]);
});

test('cross-page recovery sends only matching idempotent batches and keeps legacy records', async () => {
  const first = pendingUsageKey('user-a', 'one');
  const other = pendingUsageKey('user-b', 'two');
  const legacy = 'takeoutfix_pending_usage:user-a';
  const records = new Map([
    [first, { uid: 'user-a', batchId: '12345678-1234-4234-8234-123456789abc', files: 2, bytes: 10 }],
    [other, { uid: 'user-b', batchId: 'batch-b', files: 1, bytes: 5 }],
    [legacy, { uid: 'user-a', files: 1, bytes: 5 }],
  ]);
  const sent = [];
  await recoverAccountBatches('user-a', [...records.keys()], () => true,
    async key => records.get(key), async batch => sent.push(batch), async key => records.delete(key));
  assert.deepEqual(sent.map(batch => batch.batchId), ['12345678-1234-4234-8234-123456789abc']);
  assert.equal(records.has(first), false);
  assert.equal(records.has(other), true);
  assert.equal(records.has(legacy), true);
});

test('cross-page recovery retains batches on delivery failure or account change', async () => {
  const key = pendingUsageKey('user-a', 'one');
  const batch = { uid: 'user-a', batchId: '12345678-1234-4234-8234-123456789abc', files: 2, bytes: 10 };
  let current = true;
  let removed = false;
  await assert.rejects(recoverAccountBatches('user-a', [key], () => current,
    async () => batch, async () => { throw new Error('offline'); }, async () => { removed = true; }));
  assert.equal(removed, false);
  await recoverAccountBatches('user-a', [key], () => current,
    async () => batch, async () => { current = false; }, async () => { removed = true; });
  assert.equal(removed, false);
});

test('a malformed batch is kept without blocking a later valid batch', async () => {
  const invalid = pendingUsageKey('user-a', 'invalid');
  const valid = pendingUsageKey('user-a', 'valid');
  const records = new Map([
    [invalid, { uid: 'user-a', batchId: 'broken', files: 1, bytes: 10 }],
    [valid, { uid: 'user-a', batchId: '12345678-1234-4234-8234-123456789abc', files: 1, bytes: 10 }],
  ]);
  const sent = [];
  await recoverAccountBatches('user-a', [...records.keys()], () => true,
    async key => records.get(key), async batch => sent.push(batch), async key => records.delete(key));
  assert.equal(records.has(invalid), true);
  assert.equal(records.has(valid), false);
  assert.equal(sent.length, 1);
});

test('usage batch validation rejects unsafe counters and malformed IDs', () => {
  const id = '12345678-1234-4234-8234-123456789abc';
  assert.equal(isValidUsageBatch(id, 10, 1), true);
  assert.equal(isValidUsageBatch(id, -1, 1), false);
  assert.equal(isValidUsageBatch(id, 1, Number.MAX_SAFE_INTEGER + 1), false);
  assert.equal(isValidUsageBatch('bad', 1, 1), false);
});

test('failed journal writes retain each batch and its original account for retry', async () => {
  const entries = [
    { key: 'a', value: { uid: 'user-a', bytes: 10 } },
    { key: 'b', value: { uid: 'user-b', bytes: 20 } },
  ];
  const saved = [];
  await assert.rejects(flushUnstoredUsage(entries, async entry => {
    if (entry.key === 'b') throw new Error('storage unavailable');
    saved.push(entry);
  }), /storage unavailable/);
  assert.deepEqual(saved.map(entry => entry.value.uid), ['user-a']);
  assert.deepEqual(entries.map(entry => entry.value.uid), ['user-b']);
  await flushUnstoredUsage(entries, async entry => { saved.push(entry); });
  assert.deepEqual(saved.map(entry => entry.value.uid), ['user-a', 'user-b']);
  assert.deepEqual(entries, []);
});
