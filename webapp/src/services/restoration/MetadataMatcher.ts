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
  lowerMap: Map<string, string | null>;
  jBases: Map<string, string | null>;
  jPrefix16: Map<string, string | null>;
  jsonBases: Map<string, string>;
  allJsons: Array<{ lower: string; base: string; actual: string }>;
}

const dirIndexCache = new WeakMap<Set<string>, DirectoryIndex>();

function getDirectoryIndex(allNames: Set<string>): DirectoryIndex {
  const cached = dirIndexCache.get(allNames);
  if (cached) return cached;

  const lowerMap = new Map<string, string | null>();
  const jBases = new Map<string, string | null>();
  const jPrefix16 = new Map<string, string | null>();
  const jsonBases = new Map<string, string>();
  const allJsons: Array<{ lower: string; base: string; actual: string }> = [];
  const addUnique = (map: Map<string, string | null>, key: string, name: string) => {
    const existing = map.get(key);
    map.set(key, existing === undefined || existing === name ? name : null);
  };

  for (const n of allNames) {
    const lower = n.toLowerCase();
    addUnique(lowerMap, lower, n);

    if (lower.endsWith('.json') && lower !== 'metadata.json') {
      let jBase = lower.slice(0, -5);
      for (const marker of TAKEOUT_MARKERS) {
        const idx = jBase.lastIndexOf(marker);
        if (idx !== -1 && /^(?:\(\d+\))?$/.test(jBase.slice(idx + marker.length))) {
          jBase = jBase.substring(0, idx);
          break;
        }
      }
      addUnique(jBases, jBase, n);
      jsonBases.set(n, jBase);
      const noNum = jBase.replace(NUMBERED_PATTERN, '');
      addUnique(jBases, noNum, n);
      if (jBase.length >= 16) {
        addUnique(jPrefix16, jBase.substring(0, 16), n);
      }
      allJsons.push({ lower, base: jBase, actual: n });
    }
  }

  const idxObj = { lowerMap, jBases, jPrefix16, jsonBases, allJsons };
  dirIndexCache.set(allNames, idxObj);
  return idxObj;
}

/**
 * Given a media FileSystemFileHandle's name and the flat map of all filenames
 * in its parent directory, try to find the matching .json sidecar.
 * Tries common Google Takeout matching patterns:
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
  const { lowerMap, jBases, jPrefix16, jsonBases, allJsons } = idx;

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
    if (match === null) return null;
    if (match) return match;
  }

  // Fast base lookups avoid generating every fallback for ordinary filenames.
  let ambiguousBase = false;
  for (const key of [mStem, mLower, mStemNoNum]) {
    const match = jBases.get(key);
    if (match === null) { ambiguousBase = true; break; }
    if (match) return match;
  }

  // Prefer generated filename candidates before less-specific prefix matching.
  const candidateMatches = new Set<string>();
  for (const candidate of getMatchingCandidates(mediaName)) {
    const match = lowerMap.get(candidate.toLowerCase());
    if (match === null) return null;
    if (match) candidateMatches.add(match);
  }
  if (candidateMatches.size > 1) return null;
  if (candidateMatches.size === 1) return candidateMatches.values().next().value ?? null;
  if (ambiguousBase) return null;

  // 3. 16-character common prefix lookup (O(1)) for truncated names
  if (mStem.length >= 16) {
    const prefMatch = jPrefix16.get(mStem.substring(0, 16));
    if (prefMatch === null) return null;
    if (prefMatch) {
      const base = jsonBases.get(prefMatch);
      if (base && (mStem.startsWith(base) || base.startsWith(`${mStem}.`))) return prefMatch;
    }
  }

  // Near matches are usable only when exactly one sidecar is plausible.
  if (mStem.length >= 20) {
    let nearMatch: string | null = null;
    for (const item of allJsons) {
      if (item.base.length >= 20 && levenshteinDist(mStem, item.base, 3) <= 3) {
        if (nearMatch !== null && nearMatch !== item.actual) return null;
        nearMatch = item.actual;
      }
    }
    return nearMatch;
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

/** Return usable Takeout coordinates; zero/zero is commonly a missing-location placeholder. */
export function extractCoordinates(json: Record<string, unknown>): { lat: number; lng: number } | null {
  const number = (value: unknown) => typeof value === 'number' ? value :
    typeof value === 'string' && value.trim() ? Number(value) : NaN;
  for (const geo of [json.geoData, json.geoDataExif]) {
    if (!geo || typeof geo !== 'object') continue;
    const { latitude, longitude } = geo as Record<string, unknown>;
    const lat = number(latitude);
    const lng = number(longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 &&
        (Math.abs(lat) > 0.0001 || Math.abs(lng) > 0.0001)) return { lat, lng };
  }
  return null;
}

/** Extract the best available timestamp (epoch seconds) from a parsed Takeout JSON */
export function extractTimestamp(json: Record<string, unknown> | null | undefined): number | null {
  if (!json || typeof json !== 'object') return null;

  const validSeconds = (seconds: number): number | null =>
    seconds > 0 && seconds <= 253402300799 ? seconds : null;
  const normalizeTimestamp = (value: number): number | null => {
    if (!Number.isFinite(value) || value <= 0) return null;
    const seconds = Math.floor(value > 100000000000 ? value / 1000 : value);
    return validSeconds(seconds);
  };
  const parseTsValue = (val: unknown): number | null => {
    if (typeof val === 'number') return normalizeTimestamp(val);
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (!trimmed || trimmed === '0') return null;
      const n = Number(trimmed);
      if (Number.isFinite(n) && n > 0) {
        return normalizeTimestamp(n);
      }
      const parsed = Date.parse(trimmed);
      if (!isNaN(parsed) && parsed > 0) {
        return validSeconds(Math.floor(parsed / 1000));
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
// Takeout sidecars hold metadata only. Bound reads before allocating strings.
export const MAX_RESTORE_SIDECAR_BYTES = 1024 * 1024;
