export async function acquireRestoreLock(locks: LockManager | undefined): Promise<() => void> {
  if (!locks) throw new Error('This browser cannot safely coordinate restores across tabs. Use an up-to-date browser.');
  return new Promise((resolve, reject) => {
    void locks.request('takeoutfix-restore', { ifAvailable: true }, lock => {
      if (!lock) {
        reject(new Error('A restore is already open in another tab. Return to that tab to continue.'));
        return;
      }
      return new Promise<void>(release => resolve(release));
    }).catch(reject);
  });
}

export async function withRestoreLock<T>(alreadyOwned: boolean, acquire: () => Promise<() => void>, work: () => Promise<T>): Promise<T> {
  const release = alreadyOwned ? undefined : await acquire();
  try {
    return await work();
  } finally {
    release?.();
  }
}
