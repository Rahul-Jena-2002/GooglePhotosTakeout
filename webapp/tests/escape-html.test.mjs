import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml } from '../src/lib/escapeHtml.ts';

test('escapes text and attribute delimiters in notification values', () => {
  assert.equal(escapeHtml(`<img src="x" onerror='alert(1)'>&`),
    '&lt;img src=&quot;x&quot; onerror=&#39;alert(1)&#39;&gt;&amp;');
  assert.equal(escapeHtml(null), '');
});
