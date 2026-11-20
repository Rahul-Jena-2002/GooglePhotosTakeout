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

export async function flushUnstoredUsage(entries: UnstoredUsage[], save: (entry: UnstoredUsage) => Promise<void>): Promise<void> {
  while (entries.length) {
    await save(entries[0]);
    entries.shift();
  }
}
