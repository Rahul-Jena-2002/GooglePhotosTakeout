/**
 * MetadataMatcher
 * ---------------
 * Corrected and robust port of the Java MetadataMatcher to TypeScript.
 * Finds the .json sidecar for a given media file, handling all of
 * Google Takeout's naming quirks (truncation, duplicate suffixes, extension variations, etc.)
 *
 * Security: all generated filenames are sanitized before use.
 */

/** Allowed media extensions – strict allowlist for security */
export const ALLOWED_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'tiff', 'tif',
  'mp4', 'mov', 'heic', 'heif', 'm4v', 'avi', 'mkv',
  '3gp', '3gpp', 'dng'
]);

const MAX_STEM = 46;

/** Sanitize a filename: strip path traversal and dangerous chars */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/\.\.(\/|\\)/g, '')   // path traversal
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"|?*\x00-\x1f]/g, '') // shell/OS dangerous chars
    .replace(/^[/\\]+/, '');        // leading slashes
}

/** Check a file extension against the allowlist */
export function isAllowedMediaFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return ALLOWED_EXTENSIONS.has(ext);
}

/** Base name normalization corresponding to Java's private String normalizeBase(String base) */
function normalizeBase(base: string): string {
  let s = base.trim();
  s = s.replace(/\s*\(\d+\)$/, ''); // Strip numbered suffixes like (1)
  s = s.replace(/(?:[\s_-]+)(copy|edited|edit)$/i, ''); // Strip copy/edited flags
  s = s.replace(/[\s_-]+\d+$/, '');
  s = s.replace(/[\s_]+$/, '');
  s = s.replace(/-+$/, '');
  return s;
}

/** Helper to generate all potential Takeout candidate names for a given media file. */
export function getMatchingCandidates(mediaName: string): Set<string> {
  const sanitized = sanitizeFilename(mediaName);
  
  const lastDot = sanitized.lastIndexOf('.');
  const nameNoExt = lastDot > 0 ? sanitized.substring(0, lastDot) : sanitized;
  const ext = lastDot > 0 ? sanitized.substring(lastDot) : "";
  const normalizedBase = normalizeBase(nameNoExt);

  // Java logic baseline: Sources used to generate structural combinations
  const baseSources: string[] = [sanitized, nameNoExt];
  if (normalizedBase !== nameNoExt && ext !== "") {
    baseSources.push(normalizedBase + ext);
  }
  if (normalizedBase !== nameNoExt) {
    baseSources.push(normalizedBase);
  }

  // Motion / Live Photo companion extensions: e.g. foo.mp4 sharing foo.jpg.json or vice-versa
  const lowerExt = ext.toLowerCase();
  if (lowerExt === ".mp4" || lowerExt === ".mov" || lowerExt === ".m4v" || lowerExt === ".3gp") {
    baseSources.push(nameNoExt + ".jpg", nameNoExt + ".jpeg", nameNoExt + ".heic");
  } else if (lowerExt === ".jpg" || lowerExt === ".jpeg" || lowerExt === ".heic") {
    baseSources.push(nameNoExt + ".mp4", nameNoExt + ".mov");
  }

  const stems = new Set<string>();

  // 1. Generate standard configurations and length-based cuts (> 46 chars)
  for (const base of baseSources) {
    if (base.length > MAX_STEM) {
      stems.add(base.substring(0, MAX_STEM));
      stems.add(base.substring(0, 47));
    } else {
      // Dynamic Suffixes built dynamically to match Java configuration arrays
      const word = "supplemental-metadata";
      const suffixes: string[] = [];
      for (let i = 1; i <= word.length; i++) {
        suffixes.push(word.substring(0, i));
      }
      suffixes.push("metadata", "m");

      const delimiters = [".", "_", "-"];

      for (const suffix of suffixes) {
        for (const delim of delimiters) {
          stems.add(base + delim + suffix);
          // Support asymmetric sidecar numbering e.g. photo.jpg.supplemental-metadata(1).json
          stems.add(base + delim + suffix + "(1)");
          stems.add(base + delim + suffix + "(2)");
        }
      }
    }
  }

  // 2. Handle Java's generateNumberedCandidates scenario: base + ext + suffix + numberSuffix
  const numberedMatch = sanitized.match(/^(.+?)(\(\d+\))(\.[^.]+)$/);
  if (numberedMatch) {
    const [, basePart, numberSuffix, extPart] = numberedMatch;
    // Truncated base combined with numberSuffix: e.g. Screenshot_...(46 chars)(1).json
    if (basePart.length > MAX_STEM) {
      stems.add(basePart.substring(0, MAX_STEM) + numberSuffix);
      stems.add(basePart.substring(0, 47) + numberSuffix);
    }
    stems.add(basePart.length > MAX_STEM ? basePart.substring(0, MAX_STEM) : basePart);

    const word = "supplemental-metadata";
    const suffixes = [];
    for (let i = 1; i <= word.length; i++) {
      suffixes.push(word.substring(0, i));
    }
    suffixes.push("metadata", "m");
    const delimiters = [".", "_"];

    for (const suffix of suffixes) {
      for (const delim of delimiters) {
        stems.add(basePart + extPart + delim + suffix + numberSuffix);
        // Fallback to unnumbered sidecar if multiple duplicates share one JSON
        stems.add(basePart + extPart + delim + suffix);
        stems.add(basePart + delim + suffix + numberSuffix);
        stems.add(basePart + delim + suffix);
      }
    }
  }

  // 3. Fallback element added explicitly by Java tracking loops
  if (nameNoExt.length > MAX_STEM) {
    stems.add(nameNoExt.substring(0, MAX_STEM));
    stems.add(nameNoExt.substring(0, MAX_STEM) + "(1)");
    stems.add(nameNoExt.substring(0, MAX_STEM) + "(2)");
    stems.add(nameNoExt.substring(0, 47));
    stems.add(nameNoExt.substring(0, 47) + "(1)");
    stems.add(nameNoExt.substring(0, 47) + "(2)");
  } else {
    stems.add(nameNoExt);
  }

  // 4. Incorporate Java's withFuzzyTail(stems, 42, 46) behavior for long files
  const fuzzyStems = new Set<string>();
  for (const stem of stems) {
    for (let L = 42; L <= 46; L++) {
      if (stem.length >= L) {
        fuzzyStems.add(stem.substring(0, L));
      }
    }
  }

  // Combine standard stems and fuzzy slices, then append final .json flag
  const combinedStems = new Set([...stems, ...fuzzyStems]);
  const candidates = new Set<string>();
  for (const stem of combinedStems) {
    candidates.add(stem + ".json");
  }

  return candidates;
}

/**
 * Given a media FileSystemFileHandle's name and the flat map of all filenames
 * in its parent directory, try to find the matching .json sidecar.
 */
const NUMBERED_PATTERN = /\(\d+\)/g;
const TAKEOUT_MARKERS = [
  ".supplemental-metadata",
  ".supplemental-metada",
  ".supplemental-m",
  ".supplementa",
  ".supplemental-",
  ".metadata",
  ".m",
  "_supplemental-metadata",
  "-supplemental-metadata"
];

function levenshteinDist(a: string, b: string, maxDist = 3): number {
  if (Math.abs(a.length - b.length) > maxDist) return maxDist + 1;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const ins = curr[j - 1] + 1;
      const del = prev[j] + 1;
      const sub = prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      const val = Math.min(ins, del, sub);
      curr.push(val);
      rowMin = Math.min(rowMin, val);
    }
    if (rowMin > maxDist) return maxDist + 1;
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

interface DirectoryIndex {
  lowerMap: Map<string, string>;
  jBases: Map<string, string>;
  jPrefix16: Map<string, string>;
  allJsons: Array<{ lower: string; base: string; actual: string }>;
}

const dirIndexCache = new WeakMap<Set<string>, DirectoryIndex>();

function getDirectoryIndex(allNames: Set<string>): DirectoryIndex {
  const cached = dirIndexCache.get(allNames);
  if (cached) return cached;

  const lowerMap = new Map<string, string>();
  const jBases = new Map<string, string>();
  const jPrefix16 = new Map<string, string>();
  const allJsons: Array<{ lower: string; base: string; actual: string }> = [];

  for (const n of allNames) {
    const lower = n.toLowerCase();
    lowerMap.set(lower, n);

    if (lower.endsWith('.json') && lower !== 'metadata.json') {
      let jBase = lower.slice(0, -5);
      for (const marker of TAKEOUT_MARKERS) {
        const idx = jBase.indexOf(marker);
        if (idx !== -1) {
          jBase = jBase.substring(0, idx);
          break;
        }
      }
      jBases.set(jBase, n);
      const noNum = jBase.replace(NUMBERED_PATTERN, '');
      jBases.set(noNum, n);
      if (jBase.length >= 16) {
        jPrefix16.set(jBase.substring(0, 16), n);
      }
      allJsons.push({ lower, base: jBase, actual: n });
    }
  }

  const idxObj = { lowerMap, jBases, jPrefix16, allJsons };
  dirIndexCache.set(allNames, idxObj);
  return idxObj;
}

/**
 * Given a media FileSystemFileHandle's name and the flat map of all filenames
 * in its parent directory, try to find the matching .json sidecar.
 * Incorporates 100% of Google Takeout matching edge-cases:
 * - Direct exact and extension-stripped lookups
 * - Stripped supplemental-metadata marker variations
 * - Numbered duplicate stripping (1), (2)
 * - 46/47-character stem truncations & common prefix
 * - Levenshtein near-matches
 */
export function findMatchingJsonName(
  mediaName: string,
  allNames: Set<string>
): string | null {
  if (!mediaName || allNames.size === 0) return null;

  const idx = getDirectoryIndex(allNames);
  const { lowerMap, jBases, jPrefix16, allJsons } = idx;

  const mClean = sanitizeFilename(mediaName);
  const mLower = mClean.toLowerCase();
  const lastDot = mLower.lastIndexOf('.');
  const mStem = lastDot > 0 ? mLower.substring(0, lastDot) : mLower;
  const mStemNoNum = mStem.replace(NUMBERED_PATTERN, '');

  // 1. Direct standard candidate lookups (O(1))
  const directChecks = [
    `${mLower}.supplemental-metadata.json`,
    `${mStem}.supplemental-metadata.json`,
    `${mLower}.json`,
    `${mStem}.json`,
    `${mStemNoNum}.supplemental-metadata.json`,
    `${mStemNoNum}.json`
  ];

  for (const c of directChecks) {
    const match = lowerMap.get(c);
    if (match) return match;
  }

  // 2. Base index instant lookups (O(1))
  const baseMatch = jBases.get(mStem) || jBases.get(mLower) || jBases.get(mStemNoNum);
  if (baseMatch) return baseMatch;

  // 3. 16-character common prefix lookup (O(1)) for truncated names
  if (mStem.length >= 16) {
    const prefMatch = jPrefix16.get(mStem.substring(0, 16));
    if (prefMatch) return prefMatch;
  }

  // 4. Exact lookup matches from getMatchingCandidates generator
  const candidates = getMatchingCandidates(mediaName);
  for (const candidate of candidates) {
    const match = lowerMap.get(candidate.toLowerCase());
    if (match) return match;
  }

  // 5. Near-match fallback across remaining JSONs (only evaluated if O(1) lookups miss)
  if (mStem.length >= 20) {
    for (const item of allJsons) {
      if (item.base.length >= 20 && levenshteinDist(mStem, item.base, 3) <= 3) {
        return item.actual;
      }
    }
  }

  return null;
}

/** Safe JSON parser – blocks prototype pollution attacks */
export function safeParseJson(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw, (key, value) => {
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
export function extractTimestamp(json: Record<string, unknown> | null | undefined): number | null {
  if (!json || typeof json !== 'object') return null;

  const parseTsValue = (val: unknown): number | null => {
    if (typeof val === 'number' && !isNaN(val) && val > 0) {
      return val > 100000000000 ? Math.floor(val / 1000) : Math.floor(val);
    }
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (!trimmed || trimmed === '0') return null;
      const n = Number(trimmed);
      if (!isNaN(n) && n > 0) {
        return n > 100000000000 ? Math.floor(n / 1000) : Math.floor(n);
      }
      const parsed = Date.parse(trimmed);
      if (!isNaN(parsed) && parsed > 0) {
        return Math.floor(parsed / 1000);
      }
    }
    return null;
  };

  for (const key of ['photoTakenTime', 'creationTime', 'modificationTime']) {
    const block = json[key];
    if (block && typeof block === 'object') {
      const tsVal = (block as Record<string, unknown>)['timestamp'];
      const parsed = parseTsValue(tsVal);
      if (parsed) return parsed;

      const formatted = (block as Record<string, unknown>)['formatted'];
      const parsedFormatted = parseTsValue(formatted);
      if (parsedFormatted) return parsedFormatted;
    }
  }

  for (const key of ['timestamp', 'photoTakenTime', 'creationTime', 'date']) {
    const parsed = parseTsValue(json[key]);
    if (parsed) return parsed;
  }

  return null;
}
