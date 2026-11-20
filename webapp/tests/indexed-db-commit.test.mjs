import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indexedDbService } from '../src/lib/indexedDbService.ts';

test('writes resolve on transaction commit and reject on abort', async () => {
  const originalDb = indexedDbService.db;
  let transaction;
  let transactionStores;
  indexedDbService.db = {
    transaction(stores) {
      transactionStores = stores;
      transaction = {
        error: null,
        objectStore: () => ({ put() {}, delete() {}, clear() {} }),
      };
      return transaction;
    },
  };
  try {
    for (const write of [
      () => indexedDbService.set('sessions', 'id', {}),
      () => indexedDbService.remove('sessions', 'id'),
      () => indexedDbService.clearStore('sessions'),
      () => indexedDbService.setAll('sessions', [{ key: 'id', value: {} }]),
      () => indexedDbService.setFileAndSession('file', {}, 'session', {}),
    ]) {
      let settled = false;
      const committed = write().then(() => { settled = true; });
      await Promise.resolve();
      await Promise.resolve();
      assert.equal(settled, false);
      transaction.oncomplete();
      await committed;

      const aborted = write();
      await Promise.resolve();
      transaction.onabort();
      await assert.rejects(aborted, /transaction aborted/);
    }
    assert.deepEqual(transactionStores, ['files', 'sessions']);
  } finally {
    indexedDbService.db = originalDb;
  }
});

test('account cleanup refuses to clear an active restore', async () => {
  const originalDb = indexedDbService.db;
  let request;
  let transaction;
  let cleared;
  indexedDbService.db = {
    transaction(stores, mode) {
      assert.deepEqual(stores, ['telemetry', 'checkpoints', 'files', 'sessions']);
      assert.equal(mode, 'readwrite');
      cleared = [];
      request = {};
      transaction = {
        error: null,
        objectStore: name => ({ getAll: () => request, clear: () => cleared.push(name) }),
        abort() { this.onabort(); },
      };
      return transaction;
    },
  };
  try {
    const blocked = indexedDbService.clearAllData();
    await Promise.resolve();
    request.result = [{ status: 'processing' }];
    request.onsuccess();
    await assert.rejects(blocked, /restore is still saved or running/i);
    assert.deepEqual(cleared, []);

    const cleanup = indexedDbService.clearAllData();
    await Promise.resolve();
    request.result = [{ status: 'completed' }];
    request.onsuccess();
    assert.deepEqual(cleared, ['telemetry', 'checkpoints', 'files', 'sessions']);
    transaction.oncomplete();
    await cleanup;
  } finally {
    indexedDbService.db = originalDb;
  }
});

test('starting a restore checks and replaces records in one transaction', async () => {
  const originalDb = indexedDbService.db;
  let request;
  let transaction;
  let changes;
  indexedDbService.db = {
    transaction(stores, mode) {
      assert.deepEqual(stores, ['files', 'sessions']);
      assert.equal(mode, 'readwrite');
      changes = [];
      request = {};
      transaction = {
        error: null,
        objectStore: name => ({
          getAll: () => request,
          clear: () => changes.push(`clear:${name}`),
          put: (_value, key) => changes.push(`put:${name}:${key}`),
        }),
        abort() { this.onabort(); },
      };
      return transaction;
    },
  };
  try {
    const blocked = indexedDbService.startRestoreSession('new', {});
    await Promise.resolve();
    request.result = [{ status: 'processing' }];
    request.onsuccess();
    await assert.rejects(blocked, /interrupted restore/i);
    assert.deepEqual(changes, []);

    const started = indexedDbService.startRestoreSession('new', {});
    await Promise.resolve();
    request.result = [{ status: 'completed' }];
    request.onsuccess();
    assert.deepEqual(changes, ['clear:files', 'clear:sessions', 'put:sessions:new']);
    transaction.oncomplete();
    await started;
  } finally {
    indexedDbService.db = originalDb;
  }
});
