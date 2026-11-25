import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const script = fileURLToPath(new URL('../scripts/package-pages-preview.js', import.meta.url));

test('packages client and Worker modules without server environment files', async () => {
  const root = mkdtempSync(join(tmpdir(), 'takeoutfix-pages-'));
  try {
    mkdirSync(join(root, 'dist', 'client'), { recursive: true });
    mkdirSync(join(root, 'dist', 'server', 'chunks'), { recursive: true });
    writeFileSync(join(root, 'dist', 'client', 'index.html'), '<h1>test</h1>');
    writeFileSync(join(root, 'package.json'), '{"type":"module"}');
    writeFileSync(join(root, 'dist', 'client', '_redirects'), '/old /new 301\n/admin/* /admin.html 200\n/bad https://other.example 302\n');
    writeFileSync(join(root, 'dist', 'server', 'wrangler.json'), JSON.stringify({ main: 'entry.mjs' }));
    writeFileSync(join(root, 'dist', 'server', 'entry.mjs'), 'export default { fetch: () => new Response("app") };');
    writeFileSync(join(root, 'dist', 'server', 'chunks', 'route.mjs'), 'export {};');
    writeFileSync(join(root, 'dist', 'server', '.dev.vars'), 'PRIVATE_TEST_VALUE=do-not-copy');
    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const output = join(root, 'dist', 'pages-preview');
    assert.equal(readFileSync(join(output, 'index.html'), 'utf8'), '<h1>test</h1>');
    assert.ok(existsSync(join(output, '_worker.js', 'chunks', 'route.mjs')));
    assert.ok(!existsSync(join(output, '_worker.js', '.dev.vars')));
    assert.ok(!existsSync(join(output, '_worker.js', 'wrangler.json')));
    const worker = (await import(pathToFileURL(join(output, '_worker.js', 'index.js')).href)).default;
    const redirect = await worker.fetch(new Request('https://example.test/old?from=search'), {}, {});
    assert.equal(redirect.status, 301);
    assert.equal(redirect.headers.get('location'), 'https://example.test/new?from=search');
    assert.equal(await (await worker.fetch(new Request('https://example.test/bad'), {}, {})).text(), 'app');
    assert.equal(await (await worker.fetch(new Request('https://example.test/admin/users'), {}, {})).text(), 'app');
    assert.equal(spawnSync(process.execPath, [script], { cwd: root }).status, 1);
  } finally {
    if (!resolve(root).startsWith(resolve(tmpdir()) + sep + 'takeoutfix-pages-')) throw new Error('Unexpected test directory');
    rmSync(root, { recursive: true, force: true });
  }
});
