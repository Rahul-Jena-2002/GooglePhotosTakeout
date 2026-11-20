import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, mkdirSync, rmSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('the build audit rejects assets above the Cloudflare size limit', () => {
  const dir = mkdtempSync(join(tmpdir(), 'takeoutfix-asset-limit-'));
  try {
    const client = join(dir, 'dist', 'client');
    mkdirSync(client, { recursive: true });
    copyFileSync(fileURLToPath(new URL('../public/_headers', import.meta.url)), join(client, '_headers'));
    const asset = join(client, 'example.wasm');
    writeFileSync(asset, '');
    const script = fileURLToPath(new URL('../scripts/audit_cloudflare_security.js', import.meta.url));
    const audit = () => spawnSync(process.execPath, [script], { cwd: dir, encoding: 'utf8' });
    truncateSync(asset, 25 * 1024 * 1024);
    assert.equal(audit().status, 0);
    truncateSync(asset, 25 * 1024 * 1024 + 1);
    const result = audit();
    assert.equal(result.status, 1);
    assert.match(result.stderr + result.stdout, /exceeds the 25 MiB Cloudflare Workers limit/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the build audit rejects oversized Cloudflare header lines', () => {
  const dir = mkdtempSync(join(tmpdir(), 'takeoutfix-header-limit-'));
  try {
    const client = join(dir, 'dist', 'client');
    mkdirSync(client, { recursive: true });
    const original = fileURLToPath(new URL('../public/_headers', import.meta.url));
    const headers = join(client, '_headers');
    copyFileSync(original, headers);
    const script = fileURLToPath(new URL('../scripts/audit_cloudflare_security.js', import.meta.url));
    const audit = () => spawnSync(process.execPath, [script], { cwd: dir, encoding: 'utf8' });
    assert.equal(audit().status, 0);
    writeFileSync(headers, `/*\n  X-Long: ${'x'.repeat(2000)}\n`, { flag: 'a' });
    const result = audit();
    assert.equal(result.status, 1);
    assert.match(result.stdout + result.stderr, /exceeds 2,000 characters/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
