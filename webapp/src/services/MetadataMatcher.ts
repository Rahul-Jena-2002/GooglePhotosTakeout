/**
 * MetadataMatcher
 * ---------------
 * Port of the Java MetadataMatcher to TypeScript.
 * Finds the .json sidecar for a given media file, handling all of
 * Google Takeout's naming quirks (truncation, special chars, etc.)
 *
 * Security: all generated filenames are sanitized before use.
 */

/** Allowed media extensions — strict allowlist for security */
export const ALLOWED_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'tiff', 'tif',
  'mp4', 'mov', 'heic', 'heif', 'm4v', 'avi', 'mkv',
]);

/** Sanitize a filename: strip path traversal and dangerous chars */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/\.\.(\/|\\)/g, '')   // path traversal
    .replace(/[<>:"|?*\x00-\x1f]/g, '') // shell/OS dangerous chars
    .replace(/^[/\\]+/, '');        // leading slashes
}

/** Check a file extension against the allowlist */
export function isAllowedMediaFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return ALLOWED_EXTENSIONS.has(ext);
}

/**
 * Given a media FileSystemFileHandle's name and the flat map of all filenames
 * in its parent directory, try to find the matching .json sidecar.
 *
 * Search order (mirrors the Java logic):
 * 1. Exact: "photo.jpg.json"
 * 2. Google truncation: "photo.jpg.supplem…al-metadata.json" etc.
 * 3. Without extension: "photo.json"
 */
export function findMatchingJsonName(
  mediaName: string,
  allNames: Set<string>
): string | null {
  const sanitized = sanitizeFilename(mediaName);
  const baseNameNoExt = sanitized.replace(/\.[^.]+$/, '');

  // 1. Exact match: "photo.jpg.json"
  if (allNames.has(`${sanitized}.json`)) return `${sanitized}.json`;

  // 2. Extension stripped: "photo.json"
  if (allNames.has(`${baseNameNoExt}.json`)) return `${baseNameNoExt}.json`;

  // 3. Takeout duplicate conflict: "photo(1).jpg" -> "photo.jpg(1).json"
  const collisionMatch = sanitized.match(/^(.*?)(?:\((\d+)\))?(\.[^.]+)$/);
  if (collisionMatch) {
    const [, base, num, extension] = collisionMatch;
    if (num) {
      const takeoutCollisionName = `${base}${extension}(${num}).json`;
      if (allNames.has(takeoutCollisionName)) return takeoutCollisionName;
      if (allNames.has(`${base}(${num}).json`)) return `${base}(${num}).json`;
    } else {
      // Maybe media is "photo.jpg" but JSON is "photo(1).json" or "photo.jpg(1).json" if original was lost
      if (allNames.has(`${base}(1).json`)) return `${base}(1).json`;
      if (allNames.has(`${base}${extension}(1).json`)) return `${base}${extension}(1).json`;
    }
  }

  // 4. Takeout edited files: "photo-edited.jpg" -> "photo.jpg.json" or "photo.json"
  if (sanitized.toLowerCase().includes('-edited')) {
    const uneditedBase = sanitized.replace(/-edited/i, '');
    if (allNames.has(`${uneditedBase}.json`)) return `${uneditedBase}.json`;
    const uneditedNoExt = baseNameNoExt.replace(/-edited/i, '');
    if (allNames.has(`${uneditedNoExt}.json`)) return `${uneditedNoExt}.json`;
  }

  // 5. Extreme truncation (Google Takeout limits to 46 chars)
  const prefix = sanitized.slice(0, 46);
  for (const name of allNames) {
    if (name !== '.json' && name.startsWith(prefix) && name.endsWith('.json')) return name;
  }
  
  // 6. Fuzzy fallback: strip (1) and -edited and find closest match
  const cleanBase = baseNameNoExt.replace(/\(\d+\)/g, '').replace(/-edited/i, '').trim();
  if (cleanBase.length > 5) {
    for (const name of allNames) {
      if (name.startsWith(cleanBase) && name.endsWith('.json')) return name;
    }
  }

  return null;
}

/**
 * Safe JSON parser — blocks prototype pollution attacks.
 */
export function safeParseJson(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw, (key, value) => {
      // Block prototype pollution
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        return undefined;
      }
      return value;
    });
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

/** Extract the best available timestamp (epoch seconds) from a parsed Takeout JSON */
export function extractTimestamp(json: Record<string, unknown>): number | null {
  const candidates: Array<[string, number]> = [];

  for (const key of ['photoTakenTime', 'creationTime', 'modificationTime']) {
    const block = json[key];
    if (block && typeof block === 'object') {
      const ts = (block as Record<string, unknown>)['timestamp'];
      if (typeof ts === 'string') {
        const n = Number(ts);
        if (!isNaN(n) && n > 0) candidates.push([key, n]);
      }
    }
  }

  if (candidates.length === 0) return null;

  // Prefer photoTakenTime, then creationTime, then modificationTime
  const order = ['photoTakenTime', 'creationTime', 'modificationTime'];
  candidates.sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  return candidates[0][1];
}
