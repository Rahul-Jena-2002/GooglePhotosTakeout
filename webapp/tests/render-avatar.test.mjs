import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderAvatar } from '../src/lib/renderAvatar.ts';

test('profile values remain text or image properties, including on image failure', () => {
  const previousDocument = globalThis.document;
  let errorHandler;
  const image = { addEventListener(type, handler) { assert.equal(type, 'error'); errorHandler = handler; } };
  const container = { replaceChildren(child) { this.child = child; } };
  globalThis.document = { createElement(tag) { assert.equal(tag, 'img'); return image; } };
  try {
    const photo = 'https://example.invalid/" onerror="alert(1)';
    renderAvatar(container, '<name', photo);
    assert.equal(container.child, image);
    assert.equal(image.src, photo);
    assert.equal(image.referrerPolicy, 'no-referrer');
    errorHandler();
    assert.equal(container.textContent, '<');
    renderAvatar(container, 'Alice', null);
    assert.equal(container.textContent, 'A');
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});
