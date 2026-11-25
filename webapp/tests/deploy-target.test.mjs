import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/assert_deploy_target.js', import.meta.url));

test('Cloudflare Pages builds fail before publishing Worker output', () => {
  const result = spawnSync(process.execPath, [script], { env: { ...process.env, CF_PAGES: '1' }, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /targets Cloudflare Workers/);
});

test('other build environments remain allowed', () => {
  const env = { ...process.env };
  delete env.CF_PAGES;
  const result = spawnSync(process.execPath, [script], { env, encoding: 'utf8' });
  assert.equal(result.status, 0);
});
