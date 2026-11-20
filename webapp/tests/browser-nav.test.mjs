import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initMobileMenu } from '../src/lib/browserNav.ts';

function classList(...initial) {
  const values = new Set(initial);
  return {
    contains: value => values.has(value),
    toggle(value, enabled) {
      if (enabled) values.add(value);
      else values.delete(value);
    }
  };
}

test('mobile menu updates the visible icons and accessibility state', () => {
  const oldDocument = globalThis.document;
  const menu = { classList: classList('hidden') };
  const openIcon = { classList: classList() };
  const closeIcon = { classList: classList('hidden') };
  const attributes = {};
  let click;
  let focused = false;
  const button = {
    querySelector: selector => selector === '#hamburger-icon' ? openIcon : closeIcon,
    setAttribute: (name, value) => { attributes[name] = value; },
    addEventListener: (type, listener) => { if (type === 'click') click = listener; },
    focus: () => { focused = true; }
  };
  const original = { cloneNode: () => button, parentNode: { replaceChild() {} } };
  globalThis.document = { getElementById: id => id === 'hamburger-btn' ? original : menu };
  try {
    initMobileMenu();
    click();
    assert.equal(attributes['aria-expanded'], 'true');
    assert.equal(menu.classList.contains('hidden'), false);
    assert.equal(openIcon.classList.contains('hidden'), true);
    assert.equal(closeIcon.classList.contains('hidden'), false);
    menu.onkeydown({ key: 'Escape' });
    assert.equal(attributes['aria-expanded'], 'false');
    assert.equal(menu.classList.contains('hidden'), true);
    assert.equal(focused, true);
  } finally {
    globalThis.document = oldDocument;
  }
});
