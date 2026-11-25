import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WorkerPool } from '../src/lib/WorkerPool.ts';
import { restoreFileReservation, restoreMemoryBudget } from '../src/tool-workspace/restoreMemoryBudget.ts';

test('restore reserves bytes across files and caps buffering on devices without memory telemetry', () => {
  const MiB = 1024 * 1024;
  const small = restoreMemoryBudget();
  const large = restoreMemoryBudget(8);
  assert.equal(small.fileBytes, 32 * MiB);
  assert.equal(small.zipPartBytes, 64 * MiB);
  assert.equal(large.activeBytes, 256 * MiB);
  const reservation = restoreFileReservation(110 * MiB, large.activeBytes);
  assert.ok(reservation * 2 <= large.activeBytes);
  assert.ok(reservation * 3 > large.activeBytes);
  assert.equal(restoreFileReservation(900 * MiB, large.activeBytes), large.activeBytes);
  assert.equal(restoreFileReservation(NaN, large.activeBytes), large.activeBytes);
});

test('recycles a stalled worker and continues with the queued file', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const previousWorker = globalThis.Worker;
  const instances = [];
  globalThis.Worker = class {
    constructor() { instances.push(this); }
    postMessage() {}
    terminate() { this.terminated = true; }
  };
  const pool = new WorkerPool(1);
  try {
    const stalled = assert.rejects(pool.runTask('stalled', {}), /stopped responding/);
    const next = pool.runTask('next', {});
    const staleReply = instances[0].onmessage;
    t.mock.timers.tick(120_000);
    await stalled;
    assert.equal(instances[0].terminated, true);
    staleReply({ data: 'stale reply' });
    instances[1].onmessage({ data: 'restored' });
    assert.equal(await next, 'restored');
  } finally {
    pool.terminate();
    globalThis.Worker = previousWorker;
  }
});

test('does not assign work to a worker that failed before its first task', { timeout: 2000 }, async () => {
  const previousWorker = globalThis.Worker;
  let worker;
  globalThis.Worker = class {
    constructor() { worker = this; }
    postMessage() { throw new Error('should not dispatch'); }
    terminate() {}
  };
  try {
    const pool = new WorkerPool(1);
    worker.onerror(new Error('Worker failed to load'));
    await assert.rejects(pool.runTask('first', {}), /No processing workers/);
    pool.terminate();
  } finally {
    globalThis.Worker = previousWorker;
  }
});

test('rejects pending tasks if a crashed worker cannot be replaced', { timeout: 2000 }, async () => {
  const previousWorker = globalThis.Worker;
  let worker;
  let created = false;
  globalThis.Worker = class {
    constructor() {
      if (created) throw new Error('Worker creation failed');
      created = true;
      worker = this;
    }
    postMessage() {}
    terminate() {}
  };

  try {
    const pool = new WorkerPool(1);
    const results = Promise.allSettled([pool.runTask('first', {}), pool.runTask('second', {})]);
    worker.onerror(new Error('Worker crashed'));
    const settled = await results;
    assert.deepEqual(settled.map(result => result.status), ['rejected', 'rejected']);
    await assert.rejects(pool.runTask('third', {}), /No processing workers/);
    pool.terminate();
  } finally {
    globalThis.Worker = previousWorker;
  }
});

test('continues processing after a task cannot be sent', { timeout: 2000 }, async () => {
  const previousWorker = globalThis.Worker;
  globalThis.Worker = class {
    postMessage(message) {
      if (message.action === 'invalid') throw new Error('Cannot send task');
      queueMicrotask(() => this.onmessage({ data: 'processed' }));
    }
    terminate() {}
  };

  try {
    const pool = new WorkerPool(1);
    await assert.rejects(pool.runTask('invalid', {}), /Cannot send task/);
    assert.equal(await pool.runTask('valid', {}), 'processed');
    pool.terminate();
  } finally {
    globalThis.Worker = previousWorker;
  }
});

test('rejects both running and queued tasks on termination', { timeout: 2000 }, async () => {
  const previousWorker = globalThis.Worker;
  globalThis.Worker = class {
    postMessage() {}
    terminate() {}
  };
  try {
    const pool = new WorkerPool(1);
    const results = Promise.allSettled([pool.runTask('running', {}), pool.runTask('queued', {})]);
    pool.terminate();
    const settled = await results;
    assert.deepEqual(settled.map(result => result.status), ['rejected', 'rejected']);
  } finally {
    globalThis.Worker = previousWorker;
  }
});

test('replaces a worker after an unreadable response and continues queued tasks', { timeout: 2000 }, async () => {
  const previousWorker = globalThis.Worker;
  const workers = [];
  globalThis.Worker = class {
    constructor() { workers.push(this); }
    postMessage() {
      if (workers.length > 1) queueMicrotask(() => this.onmessage({ data: 'processed' }));
    }
    terminate() {}
  };
  try {
    const pool = new WorkerPool(1);
    const first = pool.runTask('first', {});
    const second = pool.runTask('second', {});
    workers[0].onmessageerror({});
    await assert.rejects(first, /worker response/i);
    assert.equal(await second, 'processed');
    pool.terminate();
  } finally {
    globalThis.Worker = previousWorker;
  }
});
