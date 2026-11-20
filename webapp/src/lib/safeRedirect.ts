/** Accept only relative paths on this site after authentication. */
export function isSafeInternalRedirect(value: string): boolean {
  return /^\/(?!\/)[^\\\s]*$/.test(value);
}
