import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WorkerPool } from '../src/lib/WorkerPool.ts';

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
