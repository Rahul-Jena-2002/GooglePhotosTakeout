import { test } from 'node:test';
import assert from 'node:assert/strict';
import { injectMp4CreationTime } from '../src/services/restoration/VideoMetadataRestorer.ts';

function box(type, payload, extended = false) {
  const header = extended ? 16 : 8;
  const bytes = new Uint8Array(header + payload.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, extended ? 1 : bytes.length);
  bytes.set([...type].map(char => char.charCodeAt(0)), 4);
  if (extended) view.setUint32(12, bytes.length);
  bytes.set(payload, header);
  return bytes;
}

test('writes a video timestamp without changing the input', () => {
  const input = box('moov', box('mvhd', new Uint8Array(12))).buffer;
  const output = injectMp4CreationTime(input, 1000);
  assert.equal(new DataView(input).getUint32(20), 0);
  assert.equal(new DataView(output).getUint32(20), 2082845800);
  assert.equal(new DataView(output).getUint32(24), 2082845800);
});

test('handles extended box headers', () => {
  const input = box('moov', box('mvhd', new Uint8Array(12), true), true).buffer;
  const output = injectMp4CreationTime(input, 1000);
  assert.equal(new DataView(output).getUint32(36), 2082845800);
});

test('rejects missing or truncated timestamp boxes', () => {
  assert.throws(() => injectMp4CreationTime(new ArrayBuffer(8), 1000));
  const input = box('moov', box('mvhd', new Uint8Array(4))).buffer;
  assert.throws(() => injectMp4CreationTime(input, 1000));
});

test('rejects dates too large for version zero timestamps', () => {
  const input = box('moov', box('mvhd', new Uint8Array(12))).buffer;
  assert.throws(() => injectMp4CreationTime(input, 2300000000));
});
