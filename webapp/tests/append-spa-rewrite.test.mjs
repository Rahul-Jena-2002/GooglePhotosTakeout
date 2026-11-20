import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('preserves client assets and adds the admin rewrite without duplication', () => {
  const dir = mkdtempSync(join(tmpdir(), 'takeoutfix-rewrite-'));
  try {
    mkdirSync(join(dir, 'dist', 'client'), { recursive: true });
    writeFileSync(join(dir, 'dist', 'client', '_redirects'), '/old /new 301\n');
    const script = fileURLToPath(new URL('../scripts/append_spa_rewrite.js', import.meta.url));
    execFileSync(process.execPath, [script], { cwd: dir });
    execFileSync(process.execPath, [script], { cwd: dir });
    const clientRedirects = readFileSync(join(dir, 'dist', 'client', '_redirects'), 'utf8');
    assert.match(clientRedirects, /\/old \/new 301/);
    assert.equal(clientRedirects.split('/admin/* /admin.html 200').length - 1, 1);
    assert.equal(existsSync(join(dir, 'dist', '_redirects')), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
