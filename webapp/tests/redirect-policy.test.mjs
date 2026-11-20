import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSafeRedirectTarget } from '../scripts/redirect_policy.js';

test('redirect targets must be internal paths', () => {
  for (const target of ['/', '/tool', '/admin.html', '/guides?from=home']) {
    assert.equal(isSafeRedirectTarget(target), true, target);
  }
  for (const target of ['https://example.com', 'http://example.com', '//example.com', '/\\example.com', 'javascript:alert(1)', '']) {
    assert.equal(isSafeRedirectTarget(target), false, target);
  }
});
