export function isSafeRedirectTarget(target) {
  return typeof target === 'string' && /^\/(?!\/)[^\\\s]*$/.test(target);
}
