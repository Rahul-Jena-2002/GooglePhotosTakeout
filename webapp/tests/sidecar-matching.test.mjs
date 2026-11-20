import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractCoordinates, extractTimestamp, findMatchingJsonName } from '../src/services/restoration/MetadataMatcher.ts';

test('accepts valid coordinates and ignores missing or invalid locations', () => {
  assert.deepEqual(extractCoordinates({ geoData: { latitude: '51.5', longitude: -0.1 } }), { lat: 51.5, lng: -0.1 });
  for (const geoData of [{ latitude: 0, longitude: 0 }, { latitude: 91, longitude: 10 }, { latitude: 10, longitude: 181 }, { latitude: 'Infinity', longitude: 1 }, { latitude: '', longitude: 5 }]) {
    assert.equal(extractCoordinates({ geoData }), null);
  }
});

test('uses EXIF coordinates when primary location is missing or invalid', () => {
  const geoDataExif = { latitude: 45, longitude: -73 };
  assert.deepEqual(extractCoordinates({ geoData: { latitude: 0, longitude: 0 }, geoDataExif }), { lat: 45, lng: -73 });
  assert.deepEqual(extractCoordinates({ geoData: { latitude: 20, longitude: 30 }, geoDataExif }), { lat: 20, lng: 30 });
  assert.deepEqual(extractCoordinates({ geoDataExif }), { lat: 45, lng: -73 });
});

test('ignores non-finite timestamps and falls back to a usable date', () => {
  assert.equal(extractTimestamp({ photoTakenTime: { timestamp: Infinity }, creationTime: { timestamp: '1700000000' } }), 1700000000);
  assert.equal(extractTimestamp({ photoTakenTime: { timestamp: '1e999' } }), null);
});

test('rejects oversized timestamps and uses the next available date', () => {
  assert.equal(extractTimestamp({ photoTakenTime: { timestamp: '9223372036854775807' }, creationTime: { timestamp: '1700000000' } }), 1700000000);
  assert.equal(extractTimestamp({ photoTakenTime: { timestamp: 1e30 } }), null);
  assert.equal(extractTimestamp({ photoTakenTime: { formatted: '1971-01-01T00:00:00Z' } }), 31536000);
});

test('prefers the exact sidecar when similar names exist', () => {
  const names = new Set([
    'abcdefghijklmnop_one.jpg.json',
    'abcdefghijklmnop_two.jpg.json',
  ]);
  assert.equal(findMatchingJsonName('abcdefghijklmnop_one.jpg', names), 'abcdefghijklmnop_one.jpg.json');
});

test('does not choose arbitrarily when a prefix matches several sidecars', () => {
  const names = new Set([
    'abcdefghijklmnop_one.jpg.json',
    'abcdefghijklmnop_two.jpg.json',
  ]);
  assert.equal(findMatchingJsonName('abcdefghijklmnop_three.jpg', names), null);
});

test('matches a unique truncated prefix', () => {
  const names = new Set(['abcdefghijklmnop.json']);
  assert.equal(findMatchingJsonName('abcdefghijklmnop_three.jpg', names), 'abcdefghijklmnop.json');
});

test('does not match unrelated names that merely share a prefix', () => {
  const names = new Set(['abcdefghijklmnop_one.jpg.json']);
  assert.equal(findMatchingJsonName('abcdefghijklmnop_three.jpg', names), null);
});

test('does not choose between case-colliding names', () => {
  const names = new Set(['PHOTO.JPG.json', 'photo.jpg.json']);
  assert.equal(findMatchingJsonName('photo.jpg', names), null);
});

test('prefers the numbered sidecar over the unnumbered copy', () => {
  const names = new Set(['photo.jpg.json', 'photo(1).jpg.json']);
  assert.equal(findMatchingJsonName('photo(1).jpg', names), 'photo(1).jpg.json');
});

test('matches a supplemental metadata file', () => {
  const names = new Set(['photo.jpg.supplemental-metadata.json']);
  assert.equal(findMatchingJsonName('photo.jpg', names), 'photo.jpg.supplemental-metadata.json');
});

test('leaves unknown names unmatched', () => {
  assert.equal(findMatchingJsonName('missing.jpg', new Set(['different.jpg.json'])), null);
});

test('does not mistake an MP4 extension for a metadata suffix', () => {
  const names = new Set(['holiday.mov.json', 'holiday.mp4.json']);
  assert.equal(findMatchingJsonName('holiday.m4v', names), null);
});
