import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSafeZipPath, reserveZipPath } from '../src/services/restoration/zipPathSafety.ts';

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
