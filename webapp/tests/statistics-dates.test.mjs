import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accountGrowth, dailyRecoveries } from '../src/react-pages/admin/statisticsDates.ts';

test('daily recovery counts exclude earlier weeks, future records, and invalid dates', () => {
  const now = new Date(2026, 6, 8, 12);
  const records = [
    { timestamp: new Date(2026, 6, 7, 12).getTime() },
    { timestamp: new Date(2026, 5, 30, 12).getTime() },
    { timestamp: new Date(2026, 6, 9, 12).getTime() },
    { timestamp: 'invalid' }
  ];
  assert.equal(dailyRecoveries(records, now).reduce((sum, day) => sum + day.value, 0), 1);
});

test('account growth includes older accounts and excludes unknown and future dates', () => {
  const now = new Date(2026, 6, 8, 12);
  const records = [
    { createdAt: new Date(2024, 0, 1) },
    { createdAt: { toMillis: () => new Date(2026, 5, 1).getTime() } },
    {},
    { createdAt: new Date(2027, 0, 1) }
  ];
  const counts = accountGrowth(records, now).map(month => month.value);
  assert.deepEqual(counts, [1, 1, 1, 1, 2, 2]);
});
