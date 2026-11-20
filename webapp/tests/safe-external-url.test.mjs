import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSafeExternalUrl } from '../src/lib/safeExternalUrl.ts';

test('advertising destinations require an external HTTPS URL without credentials', () => {
  assert.equal(isSafeExternalUrl('https://example.com/product'), true);
  for (const url of ['javascript:alert(1)', 'data:text/html,hello', '//example.com', '/local', 'http://example.com', 'https://user:pass@example.com', 'https://takeoutfix.pages.dev', ' https://example.com']) {
    assert.equal(isSafeExternalUrl(url), false, url);
  }
});
