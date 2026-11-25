import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acquireRestoreLock, withRestoreLock } from '../src/lib/restoreLock.ts';

test('recovery uses an owned restore lock without releasing it', async () => {
  let acquired = false;
  const result = await withRestoreLock(true, async () => { acquired = true; return () => {}; }, async () => 'recovered');
  assert.equal(result, 'recovered');
  assert.equal(acquired, false);
});

test('recovery releases a lock it acquires even when work fails', async () => {
  let released = false;
  await assert.rejects(withRestoreLock(false, async () => () => { released = true; }, async () => { throw new Error('offline'); }), /offline/);
  assert.equal(released, true);
  let called = false;
  await assert.rejects(withRestoreLock(false, async () => { throw new Error('busy'); }, async () => { called = true; }), /busy/);
  assert.equal(called, false);
});

test('the restore lock remains held until released', async () => {
  let held = false;
  const locks = {
    async request(_name, _options, callback) {
      if (held) return callback(null);
      held = true;
      try { return await callback({}); } finally { held = false; }
    },
  };
  const release = await acquireRestoreLock(locks);
  assert.equal(held, true);
  await assert.rejects(acquireRestoreLock(locks), /another tab/i);
  release();
  await Promise.resolve();
  assert.equal(held, false);
  const releaseAgain = await acquireRestoreLock(locks);
  releaseAgain();
});

test('a browser without lock support cannot start an uncoordinated restore', async () => {
  await assert.rejects(acquireRestoreLock(undefined), /cannot safely coordinate/i);
});
