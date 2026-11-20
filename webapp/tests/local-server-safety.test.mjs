import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('local server refuses to start without emulator or explicit live opt-in', () => {
  const script = fileURLToPath(new URL('../functions/local-server.js', import.meta.url));
  const result = spawnSync(process.execPath, [script], { env: {}, encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /requires FIRESTORE_EMULATOR_HOST/);
});
