import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acquireRestoreLock } from '../src/lib/restoreLock.ts';

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
