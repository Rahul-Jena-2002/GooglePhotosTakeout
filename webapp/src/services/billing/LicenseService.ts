/**
 * LicenseService
 * --------------
 * Manages the free 1 GB guest quota and local usage tracking.
 * Sign-in provides 100% unlimited access.
 */

const STORAGE_KEY_USAGE  = 'gtm_usage_bytes';

const FREE_LIMIT_BYTES    = 1 * 1024 * 1024 * 1024; // 1 GB free storage limit for guest users

export type LicenseType = 'free' | '15gb' | '24hour' | 'lifetime';

export interface LicenseState {
  type: LicenseType;
  usedBytes: number;
  freeLimit: number;
  isExpired: boolean;
  expiresAt?: number; // epoch ms
}

// ── License Logic has migrated to Firebase Auth ───────────────
// Only local fallback quota checking remains here for unauthenticated users.

export function getLicenseState(): LicenseState {
  const usedBytes = Number(localStorage.getItem(STORAGE_KEY_USAGE) ?? '0');
  // All unauthenticated users are on the 1 GB free guest tier.
  return { type: 'free', usedBytes, freeLimit: FREE_LIMIT_BYTES, isExpired: false };
}

// ── Add bytes to usage counter ─────────────────────────────────────────────
export function recordUsage(bytes: number): void {
  const state = getLicenseState();
  if (state.type !== 'free') return;
  const newTotal = state.usedBytes + bytes;
  localStorage.setItem(STORAGE_KEY_USAGE, String(newTotal));
}

// ── Check if quota is exceeded ─────────────────────────────────────────────
export function isQuotaExceeded(): boolean {
  const state = getLicenseState();
  if (state.type !== 'free') return false;
  return state.usedBytes >= FREE_LIMIT_BYTES;
}

export function resetUsage(): void {
  localStorage.removeItem(STORAGE_KEY_USAGE);
}
