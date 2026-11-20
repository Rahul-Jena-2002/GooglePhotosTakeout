export function isValidInviteId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

// Call only after Firebase has authenticated the same token.
export function readInviteIdentity(token: string): { uid: string; email: string; name: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')), char => char.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    const uid = payload.user_id || payload.sub;
    if (typeof uid !== 'string' || !uid || uid.includes('/') || typeof payload.email !== 'string' || payload.email_verified !== true) return null;
    return { uid, email: payload.email, name: typeof payload.name === 'string' ? payload.name : 'Admin User' };
  } catch {
    return null;
  }
}
