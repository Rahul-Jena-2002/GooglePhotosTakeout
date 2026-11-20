import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getUniqueFileHandle } from '../src/services/restoration/outputFile.ts';

test('chooses an unused name without replacing existing files', async () => {
  const existing = new Set(['photo.jpg', 'photo (1).jpg']);
  const dir = { async getFileHandle(name, options) {
    if (options?.create) { existing.add(name); return { name }; }
    if (existing.has(name)) return { name };
    throw new DOMException('missing', 'NotFoundError');
  } };
  assert.equal((await getUniqueFileHandle(dir, 'photo.jpg')).name, 'photo (2).jpg');
  assert.equal(existing.has('photo.jpg'), true);
});

test('does not retry the original name when creating a candidate fails', async () => {
  const created = [];
  const dir = { async getFileHandle(name, options) {
    if (options?.create) { created.push(name); throw new DOMException('folder gone', 'NotFoundError'); }
    if (name === 'photo.jpg') return { name };
    throw new DOMException('missing', 'NotFoundError');
  } };
  await assert.rejects(getUniqueFileHandle(dir, 'photo.jpg'), { name: 'NotFoundError' });
  assert.deepEqual(created, ['photo (1).jpg']);
});
