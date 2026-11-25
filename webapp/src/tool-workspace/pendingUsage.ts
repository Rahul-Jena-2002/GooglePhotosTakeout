export function pendingUsageKey(uid: string, sessionId: string): string {
  return `takeoutfix_pending_usage:${uid}:${sessionId}`;
}

export function pendingUsageKeys(uid: string, keys: string[]): string[] {
  const accountKey = `takeoutfix_pending_usage:${uid}`;
  return [...keys.filter(key => typeof key === 'string' && key.startsWith(`${accountKey}:`)), accountKey, 'takeoutfix_pending_usage'];
}

export interface UnstoredUsage {
  key: string;
  value: { uid: string; batchId: string; bytes: number; files: number; sessionId: string | null; takeoutName: string; historySessionId: string | null };
}

export class PendingZipUsage {
  private pending = { bytes: 0, files: 0 };

  add(bytes: number): void {
    this.pending.bytes += bytes;
    this.pending.files += 1;
  }

  snapshot(): { bytes: number; files: number } {
    return { ...this.pending };
  }

  take(): { bytes: number; files: number } {
    const pending = this.snapshot();
    this.pending = { bytes: 0, files: 0 };
    return pending;
  }
}

export class UsageCheckpoints {
  private saved = { bytes: 0, files: 0 };
  private readonly writes = new Set<Promise<void>>();

  capture(totals: { bytes: number; files: number }, write: (delta: { bytes: number; files: number }) => Promise<void>): void {
    const delta = { bytes: totals.bytes - this.saved.bytes, files: totals.files - this.saved.files };
    if (delta.bytes <= 0 && delta.files <= 0) return;
    this.saved = { ...totals };
    const pending = Promise.resolve().then(() => write(delta));
    this.writes.add(pending);
    void pending.then(() => this.writes.delete(pending), () => this.writes.delete(pending));
  }

  async settle(): Promise<void> {
    while (this.writes.size) await Promise.allSettled(this.writes);
  }

  consume(totals: { bytes: number; files: number }): { bytes: number; files: number } {
    const delta = { bytes: totals.bytes - this.saved.bytes, files: totals.files - this.saved.files };
    this.reset();
    return delta;
  }

  reset(): void {
    this.saved = { bytes: 0, files: 0 };
  }
}

export function isValidUsageBatch(batchId: unknown, bytes: unknown, files: unknown): boolean {
  return typeof batchId === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(batchId)
    && typeof bytes === 'number' && Number.isSafeInteger(bytes) && bytes >= 0
    && typeof files === 'number' && Number.isSafeInteger(files) && files >= 0;
}

export async function flushUnstoredUsage(entries: UnstoredUsage[], save: (entry: UnstoredUsage) => Promise<void>): Promise<void> {
  while (entries.length) {
    await save(entries[0]);
    entries.shift();
  }
}

// Recover idempotent batches only. Older records are retained until reconciled.
export async function recoverAccountBatches(
  uid: string,
  keys: string[],
  isCurrent: () => boolean,
  load: (key: string) => Promise<{ uid: string; batchId?: string; bytes: number; files: number } | null | undefined>,
  apply: (batch: { uid: string; batchId: string; bytes: number; files: number }) => Promise<void>,
  remove: (key: string) => Promise<void>,
): Promise<void> {
  for (const key of pendingUsageKeys(uid, keys)) {
    if (!isCurrent()) return;
    const batch = await load(key);
    if (!isCurrent()) return;
    if (!batch || batch.uid !== uid || !batch.batchId || !isValidUsageBatch(batch.batchId, batch.bytes, batch.files)) continue;
    await apply({ ...batch, batchId: batch.batchId });
    if (!isCurrent()) return;
    await remove(key);
  }
}
