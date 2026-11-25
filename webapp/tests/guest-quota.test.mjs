import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureGuestUsageLoaded, guestFileFits, guestQuotaDecision, GUEST_MAX_BYTES } from '../src/tool-workspace/guestQuota.ts';
import { indexedDbService } from '../src/lib/indexedDbService.ts';
import { PendingZipUsage } from '../src/tool-workspace/pendingUsage.ts';

test('guest quota includes files already being processed', () => {
  assert.equal(guestFileFits(GUEST_MAX_BYTES - 100, 40, 60), true);
  assert.equal(guestFileFits(GUEST_MAX_BYTES - 100, 40, 61), false);
  assert.equal(guestFileFits(0, 0, GUEST_MAX_BYTES + 1), false);
  assert.equal(guestFileFits(0, 0, -1), false);
  assert.equal(guestFileFits(0, 0, NaN), false);
});

test('temporary reservations wait, while committed usage stops an oversized file', () => {
  assert.equal(guestQuotaDecision(GUEST_MAX_BYTES - 100, 40, 61), 'wait');
  assert.equal(guestQuotaDecision(GUEST_MAX_BYTES - 100, 0, 61), 'fit');
  assert.equal(guestQuotaDecision(GUEST_MAX_BYTES - 100, 0, 101), 'limit');
});

test('an unfinished guest ZIP part counts toward the limit until finalized or discarded', () => {
  const pending = new PendingZipUsage();
  pending.add(80);
  assert.equal(guestQuotaDecision(GUEST_MAX_BYTES - 100 + pending.snapshot().bytes, 0, 21), 'limit');
  assert.equal(guestQuotaDecision(GUEST_MAX_BYTES - 100 + pending.snapshot().bytes, 0, 20), 'fit');
  pending.take();
  assert.equal(guestQuotaDecision(GUEST_MAX_BYTES - 100 + pending.snapshot().bytes, 0, 21), 'fit');
});

test('guest usage waits for the saved IndexedDB count before starting', async () => {
  const oldWindow = globalThis.window;
  const oldStorage = globalThis.localStorage;
  const oldGet = indexedDbService.get;
  const oldSet = indexedDbService.set;
  let completeRead;
  const values = new Map();
  globalThis.window = {};
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  indexedDbService.get = () => new Promise(resolve => { completeRead = resolve; });
  indexedDbService.set = async () => {};
  try {
    let settled = false;
    const usage = ensureGuestUsageLoaded().then(value => { settled = true; return value; });
    await Promise.resolve();
    assert.equal(settled, false);
    completeRead({ files: 7, bytes: 900 });
    assert.equal((await usage).bytes, 900);
  } finally {
    globalThis.window = oldWindow;
    globalThis.localStorage = oldStorage;
    indexedDbService.get = oldGet;
    indexedDbService.set = oldSet;
  }
});
