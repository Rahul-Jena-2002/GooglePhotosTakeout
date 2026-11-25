const MiB = 1024 * 1024;

export function restoreMemoryBudget(deviceMemory?: number) {
  // File sizes track buffered input, not the browser's total memory use.
  const activeBytes = deviceMemory && deviceMemory >= 8 ? 256 * MiB
    : deviceMemory && deviceMemory >= 4 ? 128 * MiB : 64 * MiB;
  return { activeBytes, zipPartBytes: activeBytes, fileBytes: activeBytes / 2 };
}

export function restoreFileReservation(bytes: number, activeBudget: number): number {
  if (!Number.isSafeInteger(bytes) || bytes < 0) return activeBudget;
  // An oversized file streams where possible, but gets the queue to itself.
  return Math.min(bytes, activeBudget);
}
