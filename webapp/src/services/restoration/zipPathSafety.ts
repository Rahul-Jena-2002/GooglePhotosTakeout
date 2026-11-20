/** Reject paths that cannot safely be included in an output archive. */
export function isSafeZipPath(path: string): boolean {
  return path.split('/').every(segment =>
    segment !== '' && segment !== '.' && segment !== '..' &&
    !/[\\<>:"|?*\x00-\x1f]/.test(segment) &&
    !/^[ ]|[ .]$/.test(segment) &&
    !/^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(segment)
  );
}

/** Reserve distinct names even when the archive is extracted on a case-insensitive filesystem. */
export function reserveZipPath(path: string, used: Set<string>): string {
  if (!isSafeZipPath(path)) throw new Error('The output archive path contains unsafe characters.');
  const slash = path.lastIndexOf('/');
  const dot = path.lastIndexOf('.');
  const split = dot > slash + 1 ? dot : path.length;
  const base = path.slice(0, split);
  const ext = path.slice(split);
  let candidate = path;
  let suffix = 1;
  while (used.has(candidate.normalize('NFC').toLowerCase())) candidate = `${base} (${suffix++})${ext}`;
  used.add(candidate.normalize('NFC').toLowerCase());
  return candidate;
}
