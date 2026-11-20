import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exifDateTags } from '../src/services/restoration/DeepExifRestorer.ts';

test('location-only restoration does not invent photo dates', () => {
  assert.deepEqual(exifDateTags(null), {});
  const tags = exifDateTags(1623751200);
  assert.equal(typeof tags.DateTimeOriginal, 'string');
  assert.equal(tags.DateTimeOriginal, tags.CreateDate);
  assert.equal(tags.DateTimeOriginal, tags.ModifyDate);
});
