import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateUpgradeBasisPoints } from '../functions/lib/upgradeDiscount.js';

test('calculates upgrade credit using matching two-decimal currencies', () => {
  assert.equal(calculateUpgradeBasisPoints(2900, 'USD', 49, 'USD'), 5918);
  assert.equal(calculateUpgradeBasisPoints(79900, 'INR', 1499, 'INR'), 5330);
  assert.equal(calculateUpgradeBasisPoints(5000, 'USD', 49, 'USD'), 9990);
  assert.equal(calculateUpgradeBasisPoints(2900, 'USD', 49, 'EUR'), null);
  assert.equal(calculateUpgradeBasisPoints(2900, 'JPY', 49, 'JPY'), null);
  assert.equal(calculateUpgradeBasisPoints(Infinity, 'USD', 49, 'USD'), null);
  assert.equal(calculateUpgradeBasisPoints(2900, 'USD', 0, 'USD'), null);
});
