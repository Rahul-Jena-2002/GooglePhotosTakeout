import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSafeInternalRedirect } from '../src/lib/safeRedirect.ts';

test('post-login redirects accept only local paths', () => {
  for (const path of ['/', '/tool', '/admin/team?invite=1', '/guides#steps']) {
    assert.equal(isSafeInternalRedirect(path), true, path);
  }
  for (const path of ['https://example.com', '//example.com', '/\\example.com', 'javascript:alert(1)', '']) {
    assert.equal(isSafeInternalRedirect(path), false, path);
  }
});
