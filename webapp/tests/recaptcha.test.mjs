import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executeAndVerifyRecaptcha, executeRecaptcha, ensureRecaptchaLoaded } from '../src/lib/recaptcha.ts';

test('an unavailable reCAPTCHA token is not reported as verified', async () => {
  assert.deepEqual(await executeAndVerifyRecaptcha('LOGIN'), { success: false, token: null });
});

test('a failed script load returns promptly and allows a later retry', async () => {
  let script;
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  globalThis.window = {};
  globalThis.document = {
    getElementById: () => script ?? null,
    createElement: () => ({ remove() { script = null; } }),
    head: { appendChild(element) { script = element; } },
  };
  try {
    const first = executeRecaptcha('LOGIN');
    const concurrent = ensureRecaptchaLoaded();
    script.onerror('offline');
    assert.equal(await first, null);
    assert.equal(await concurrent, false);
    assert.equal(script, null);
    const retry = ensureRecaptchaLoaded();
    assert.ok(script);
    script.onload();
    assert.equal(await retry, true);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});
