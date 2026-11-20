import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pendingUsageKey, pendingUsageKeys, flushUnstoredUsage } from '../src/tool-workspace/pendingUsage.ts';

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
