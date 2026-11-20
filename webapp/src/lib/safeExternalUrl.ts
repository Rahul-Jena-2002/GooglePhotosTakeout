export function isSafeExternalUrl(value: unknown): boolean {
  if (typeof value !== 'string' || !value || value !== value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password && !url.hostname.toLowerCase().includes('takeoutfix');
  } catch {
    return false;
  }
}
