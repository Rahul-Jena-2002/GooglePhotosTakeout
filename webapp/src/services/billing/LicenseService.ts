/**
 * LicenseService
 * --------------
 * Manages the free 5 GB quota and license key validation.
 *
 * Key format: GTM-XXXXXX-YY
 *   - GTM: product prefix
 *   - XXXXXX: 6 uppercase alphanumeric characters
 *   - YY: 2-digit checksum = (sum of char codes of XXXXXX) % 97, zero-padded
 *
 * Key types encoded in first char of XXXXXX:
 *   - Starts with 'D' → Day Pass (expires 24h from first activation)
 *   - Anything else   → Lifetime key (never expires)
 */

const STORAGE_KEY_USAGE  = 'gtm_usage_bytes';

const FREE_LIMIT_BYTES    = 5 * 1024 * 1024 * 1024; // 5 GB

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
  // Legacy keys are deprecated. All unauthenticated users are on the free tier.
  return { type: 'free', usedBytes, freeLimit: FREE_LIMIT_BYTES, isExpired: false };
}

// ── Add bytes to usage counter ─────────────────────────────────────────────
export function recordUsage(bytes: number): void {
  const state = getLicenseState();
  // Paid users don't consume quota
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
