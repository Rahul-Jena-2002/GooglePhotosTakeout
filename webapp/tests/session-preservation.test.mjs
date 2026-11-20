import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SessionManager, canManageSession, hasCompleteSessionScan } from '../src/lib/SessionManager.ts';
import { indexedDbService } from '../src/lib/indexedDbService.ts';

test('saved restores are offered only to their account, while guest restores can be resumed after sign-in', () => {
  assert.equal(canManageSession({ uid: 'alice' }, 'alice'), true);
  assert.equal(canManageSession({ uid: 'alice' }, 'bob'), false);
  assert.equal(canManageSession({ uid: 'alice' }, null), false);
  assert.equal(canManageSession({ uid: 'guest' }, 'alice'), true);
  assert.equal(canManageSession({ uid: 'guest' }, null), true);
  assert.equal(canManageSession({}, null), false);
});

test('only a fully scanned restore can be resumed', () => {
  for (const status of ['initializing', 'scanning', 'completed', 'failed', 'cancelled']) {
    assert.equal(hasCompleteSessionScan({ status }), false);
  }
  for (const status of ['processing', 'paused']) {
    assert.equal(hasCompleteSessionScan({ status }), true);
  }
});

test('a completed scan saves the total source size for later resume', async () => {
  const originalSet = indexedDbService.set;
  const manager = new SessionManager();
  manager.setCurrentSession({ id: 'run', status: 'initializing', takeoutHandle: {}, zipFile: null });
  let saved;
  try {
    indexedDbService.set = async (_store, _key, value) => { saved = value; };
    manager.scanDirectorySource = async () => ({ count: 2, totalBytes: 1234 });
    await manager.scanAndRegister(() => {}, () => false);
    assert.equal(saved.status, 'processing');
    assert.equal(saved.totalFiles, 2);
    assert.equal(saved.totalSourceBytes, 1234);
  } finally {
    indexedDbService.set = originalSet;
  }
});

test('terminal sessions are persisted and no longer considered interrupted', async () => {
  const originalGetAll = indexedDbService.getAll;
  const originalSet = indexedDbService.set;
  let saved;
  try {
    indexedDbService.set = async (_store, _key, value) => { saved = value; };
    indexedDbService.getAll = async () => [saved];
    for (const status of ['completed', 'cancelled', 'failed']) {
      const manager = new SessionManager();
      manager.setCurrentSession({ id: 'run', status: 'processing' });
      await manager.terminateSession(status);
      assert.equal(saved.status, status);
      assert.equal(await manager.getActiveSession(), null);
    }
  } finally {
    indexedDbService.getAll = originalGetAll;
    indexedDbService.set = originalSet;
  }
});

test('a failed session write does not advance in-memory state', async () => {
  const originalSet = indexedDbService.set;
  const manager = new SessionManager();
  manager.setCurrentSession({ id: 'run', status: 'processing' });
  try {
    indexedDbService.set = async () => { throw new Error('transaction aborted'); };
    await assert.rejects(manager.updateSession({ status: 'completed' }), /transaction aborted/);
    let saved;
    indexedDbService.set = async (_store, _key, value) => { saved = value; };
    await manager.updateSession({ scannedCount: 1 });
    assert.equal(saved.status, 'processing');
  } finally {
    indexedDbService.set = originalSet;
  }
});

test('concurrent file confirmations retain both progress updates', async () => {
  const originalGet = indexedDbService.get;
  const originalSetFileAndSession = indexedDbService.setFileAndSession;
  const manager = new SessionManager();
  manager.setCurrentSession({ id: 'run', status: 'processing', scannedCount: 0, matchedCount: 0, unmatchedCount: 0, errorCount: 0, bytesProcessed: 0 });
  let savedSession;
  try {
    indexedDbService.get = async (_store, id) => ({ id, sessionId: 'run', epochSec: null });
    indexedDbService.setFileAndSession = async (_fileId, _file, _sessionId, session) => {
      savedSession = session;
      await Promise.resolve();
    };
    await Promise.all([
      manager.confirmFile('one', 'completed', 10, 100),
      manager.confirmFile('two', 'completed', 20, 200),
    ]);
    assert.equal(savedSession.scannedCount, 2);
    assert.equal(savedSession.matchedCount, 2);
    assert.equal(savedSession.bytesProcessed, 30);
  } finally {
    indexedDbService.get = originalGet;
    indexedDbService.setFileAndSession = originalSetFileAndSession;
  }
});

test('failed files do not inflate saved processed-byte totals', async () => {
  const originalGet = indexedDbService.get;
  const originalSetFileAndSession = indexedDbService.setFileAndSession;
  const manager = new SessionManager();
  manager.setCurrentSession({ id: 'run', status: 'processing', scannedCount: 0, matchedCount: 0, unmatchedCount: 0, errorCount: 0, bytesProcessed: 0 });
  let savedSession;
  try {
    indexedDbService.get = async (_store, id) => ({ id, sessionId: 'run', epochSec: null });
    indexedDbService.setFileAndSession = async (_fileId, _file, _sessionId, session) => { savedSession = session; };
    await manager.confirmFile('failed', 'failed', 100, null, 'write failed');
    assert.equal(savedSession.errorCount, 1);
    assert.equal(savedSession.bytesProcessed, 0);
  } finally {
    indexedDbService.get = originalGet;
    indexedDbService.setFileAndSession = originalSetFileAndSession;
  }
});

test('an aborted file confirmation leaves saved progress unchanged', async () => {
  const originalGet = indexedDbService.get;
  const originalSetFileAndSession = indexedDbService.setFileAndSession;
  const manager = new SessionManager();
  manager.setCurrentSession({ id: 'run', status: 'processing', scannedCount: 0, matchedCount: 0, unmatchedCount: 0, errorCount: 0, bytesProcessed: 0 });
  try {
    indexedDbService.get = async () => ({ id: 'one', sessionId: 'run', epochSec: null });
    indexedDbService.setFileAndSession = async () => { throw new Error('transaction aborted'); };
    await assert.rejects(manager.confirmFile('one', 'completed', 10, 100), /transaction aborted/);
    assert.equal((await manager.getStats()).scanned, 0);
  } finally {
    indexedDbService.get = originalGet;
    indexedDbService.setFileAndSession = originalSetFileAndSession;
  }
});

test('cancelling a directory scan stops before marking it ready to resume', async () => {
  const originalSet = indexedDbService.set;
  const originalSetAll = indexedDbService.setAll;
  let cancelled = false;
  let registered = false;
  let savedStatus;
  const file = { name: 'photo.jpg', kind: 'file', getFile: async () => { cancelled = true; return { size: 1 }; } };
  const directory = {
    async *[Symbol.asyncIterator]() { yield ['photo.jpg', file]; yield ['other.jpg', { ...file, name: 'other.jpg' }]; },
  };
  const manager = new SessionManager();
  manager.setCurrentSession({ id: 'run', status: 'initializing', takeoutHandle: directory, zipFile: null });
  try {
    indexedDbService.set = async (_store, _key, value) => { savedStatus = value.status; };
    indexedDbService.setAll = async () => { registered = true; };
    await assert.rejects(manager.scanAndRegister(() => {}, () => cancelled), error => error.name === 'AbortError');
    assert.equal(savedStatus, 'scanning');
    assert.equal(registered, false);
  } finally {
    indexedDbService.set = originalSet;
    indexedDbService.setAll = originalSetAll;
  }
});

test('a directory scan reports unreadable media instead of recording a zero size', async () => {
  const originalSet = indexedDbService.set;
  const originalSetAll = indexedDbService.setAll;
  let registered = false;
  const file = { name: 'photo.jpg', kind: 'file', getFile: async () => { throw new Error('access lost'); } };
  const directory = { async *[Symbol.asyncIterator]() { yield [file.name, file]; } };
  const manager = new SessionManager();
  manager.setCurrentSession({ id: 'run', status: 'initializing', takeoutHandle: directory, zipFile: null });
  try {
    indexedDbService.set = async () => {};
    indexedDbService.setAll = async () => { registered = true; };
    await assert.rejects(manager.scanAndRegister(() => {}, () => false), /Could not read photo\.jpg/);
    assert.equal(registered, false);
  } finally {
    indexedDbService.set = originalSet;
    indexedDbService.setAll = originalSetAll;
  }
});

test('a media filename that would be changed is reported before registration', async () => {
  const originalSet = indexedDbService.set;
  const originalSetAll = indexedDbService.setAll;
  let registered = false;
  const file = { name: 'photo:one.jpg', kind: 'file' };
  const directory = { async *[Symbol.asyncIterator]() { yield [file.name, file]; } };
  const manager = new SessionManager();
  manager.setCurrentSession({ id: 'run', status: 'initializing', takeoutHandle: directory, zipFile: null });
  try {
    indexedDbService.set = async () => {};
    indexedDbService.setAll = async () => { registered = true; };
    await assert.rejects(manager.scanAndRegister(() => {}, () => false), /file name cannot be preserved safely/i);
    assert.equal(registered, false);
  } finally {
    indexedDbService.set = originalSet;
    indexedDbService.setAll = originalSetAll;
  }
});
