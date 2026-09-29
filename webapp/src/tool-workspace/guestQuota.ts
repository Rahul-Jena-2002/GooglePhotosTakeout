/**
 * Guest Quota Tracker
 * Securely tracks unauthenticated guest usage up to 100 files or 1 GB.
 * Uses multi-vault resilience (localStorage + persistent cookie + IndexedDB)
 * to automatically self-heal if an individual browser storage key is cleared.
 */

import { indexedDbService } from "../lib/indexedDbService";

export const GUEST_MAX_FILES = Infinity;
export const GUEST_MAX_BYTES = Infinity;

const STORAGE_KEY = "takeoutfix_guest_usage_v1";
const COOKIE_NAME = "takeoutfix_gq_v1";

export interface GuestUsage {
  files: number;
  bytes: number;
  updatedAt: number;
}

let memoryUsage: GuestUsage = { files: 0, bytes: 0, updatedAt: 0 };
let idbSynced = false;

function readCookie(): { files: number; bytes: number } | null {
  if (typeof document === "undefined") return null;
  try {
    const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
    if (match && match[1]) {
      const parts = decodeURIComponent(match[1]).split(":");
      const files = parseInt(parts[0], 10);
      const bytes = parseInt(parts[1], 10);
      if (!isNaN(files) && !isNaN(bytes)) {
        return { files: Math.max(0, files), bytes: Math.max(0, bytes) };
      }
    }
  } catch (_) {}
  return null;
}

function writeCookie(files: number, bytes: number) {
  if (typeof document === "undefined") return;
  try {
    const val = encodeURIComponent(`${files}:${bytes}`);
    document.cookie = `${COOKIE_NAME}=${val}; path=/; max-age=31536000; SameSite=Lax`;
  } catch (_) {}
}

export function getGuestUsage(): GuestUsage {
  if (typeof window === "undefined") {
    return { files: 0, bytes: 0, updatedAt: 0 };
  }

  let localFiles = 0;
  let localBytes = 0;
  let updatedAt = Date.now();

  // 1. Read from localStorage
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      localFiles = typeof parsed.files === "number" && !isNaN(parsed.files) ? Math.max(0, parsed.files) : 0;
      localBytes = typeof parsed.bytes === "number" && !isNaN(parsed.bytes) ? Math.max(0, parsed.bytes) : 0;
      updatedAt = parsed.updatedAt || Date.now();
    }
  } catch (_) {}

  // 2. Read from Cookie (resurrects if localStorage was wiped)
  const cookieVal = readCookie();
  if (cookieVal) {
    localFiles = Math.max(localFiles, cookieVal.files);
    localBytes = Math.max(localBytes, cookieVal.bytes);
  }

  // 3. Compare with in-memory usage
  localFiles = Math.max(localFiles, memoryUsage.files);
  localBytes = Math.max(localBytes, memoryUsage.bytes);

  memoryUsage = { files: localFiles, bytes: localBytes, updatedAt };

  // Re-persist so cleared vault is immediately self-healed
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memoryUsage));
    writeCookie(localFiles, localBytes);
  } catch (_) {}

  // 4. Background sync with IndexedDB
  if (!idbSynced) {
    idbSynced = true;
    indexedDbService.get('telemetry', 'guest_quota').then((idbVal: any) => {
      if (idbVal && typeof idbVal.files === 'number') {
        const idbFiles = Math.max(0, idbVal.files);
        const idbBytes = Math.max(0, idbVal.bytes || 0);
        if (idbFiles > memoryUsage.files || idbBytes > memoryUsage.bytes) {
          recordGuestUsage(idbFiles - memoryUsage.files, idbBytes - memoryUsage.bytes);
        }
      } else {
        indexedDbService.set('telemetry', 'guest_quota', memoryUsage).catch(() => {});
      }
    }).catch(() => {});
  }

  return memoryUsage;
}

export function recordGuestUsage(files: number, bytes: number): GuestUsage {
  const current = getGuestUsage();
  const next: GuestUsage = {
    files: current.files + Math.max(0, files),
    bytes: current.bytes + Math.max(0, bytes),
    updatedAt: Date.now(),
  };

  memoryUsage = next;

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (_) {}
    writeCookie(next.files, next.bytes);
    try {
      indexedDbService.set('telemetry', 'guest_quota', next).catch(() => {});
    } catch (_) {}
  }
  return next;
}

export function isGuestQuotaExhausted(): boolean {
  // Sign-in is optional; client-side browser restoration is unlimited for guests
  return false;
}

export function getRemainingGuestFiles(): number {
  return Infinity;
}

export function getRemainingGuestBytes(): number {
  return Infinity;
}
