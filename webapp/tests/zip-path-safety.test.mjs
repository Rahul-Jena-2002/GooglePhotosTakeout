import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BlobReader, BlobWriter, ZipReader, ZipWriter } from '@zip.js/zip.js';
import { isSafeZipPath, reserveZipPath } from '../src/services/restoration/zipPathSafety.ts';

test('can stream an original from a ZIP without closing the destination early', async () => {
  const original = new Uint8Array(1024 * 1024).fill(99);
  const zip = new ZipWriter(new BlobWriter());
  await zip.add('photo.jpg', new BlobReader(new Blob([original])), { level: 0, useWebWorkers: false });
  const reader = new ZipReader(new BlobReader(await zip.close()));
  let bytes = 0;
  let closed = false;
  const destination = new WritableStream({
    write(chunk) { bytes += chunk.byteLength; assert.ok(chunk.every(value => value === 99)); },
    close() { closed = true; },
  });
  try {
    const [entry] = await reader.getEntries();
    await entry.getData(destination, { preventClose: true, useWebWorkers: false });
    assert.equal(bytes, original.byteLength);
    assert.equal(closed, false);
    await destination.close();
    assert.equal(closed, true);
  } finally {
    await reader.close();
  }
});

test('preserves files that would otherwise share an extracted ZIP path', () => {
  const used = new Set();
  assert.equal(reserveZipPath('restored/2020/photo.jpg', used), 'restored/2020/photo.jpg');
  assert.equal(reserveZipPath('restored/2020/PHOTO.JPG', used), 'restored/2020/PHOTO (1).JPG');
  assert.equal(reserveZipPath('restored/2020/photo.jpg', used), 'restored/2020/photo (2).jpg');
  assert.throws(() => reserveZipPath('../photo.jpg', used), /unsafe/);
});

test('accepts ordinary Takeout paths and Unicode names', () => {
  assert.equal(isSafeZipPath('Takeout/Google Photos/Photos from 2020/IMG_1234.jpg'), true);
  assert.equal(isSafeZipPath('Photos/海辺 (1).jpg'), true);
});

test('rejects absolute paths, traversal and empty segments', () => {
  for (const path of ['/photo.jpg', '../photo.jpg', 'photos/../../photo.jpg', 'photos/./photo.jpg', 'photos//photo.jpg', '']) {
    assert.equal(isSafeZipPath(path), false, path);
  }
});

test('rejects drive prefixes and unsafe file-name characters', () => {
  for (const path of ['C:/photo.jpg', 'photos/a:b.jpg', 'photos/a\0b.jpg', 'photos/a?.jpg', 'photos/a\\b.jpg', 'photos/..\\photo.jpg']) {
    assert.equal(isSafeZipPath(path), false, path);
  }
});

test('rejects names that Windows cannot extract safely', () => {
  for (const path of ['photos/CON.jpg', 'aux/file.jpg', 'photos/com¹.jpg', 'LPT9.json', 'photos/name. ', 'photos/ name.jpg']) {
    assert.equal(isSafeZipPath(path), false, path);
  }
  assert.equal(isSafeZipPath('photos/console.jpg'), true);
  assert.equal(isSafeZipPath('photos/com10.jpg'), true);
});
