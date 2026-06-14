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
        }
      }
    }
  }

  // 2. Handle Java's generateNumberedCandidates scenario: base + ext + suffix + numberSuffix
  const numberedMatch = sanitized.match(/^(.+?)(\(\d+\))(\.[^.]+)$/);
  if (numberedMatch) {
    const [, basePart, numberSuffix, extPart] = numberedMatch;
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
      }
    }
  }

  // 3. Fallback element added explicitly by Java tracking loops
  stems.add(nameNoExt.length > MAX_STEM ? nameNoExt.substring(0, MAX_STEM) : nameNoExt);

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
export function findMatchingJsonName(
  mediaName: string,
  allNames: Set<string>
): string | null {
  // Try exact lookup matches from our strict candidate list generation
  const candidates = getMatchingCandidates(mediaName);
  for (const candidate of candidates) {
    if (allNames.has(candidate)) {
      return candidate;
    }
  }

  // Dynamic Regex Scanning Fallback (Mirrors Java findDynamicMatch method)
  const sanitizedMedia = sanitizeFilename(mediaName);
  const lastDot = sanitizedMedia.lastIndexOf('.');
  const nameNoExt = lastDot > 0 ? sanitizedMedia.substring(0, lastDot) : sanitizedMedia;
  const nameTruncated = nameNoExt.length > MAX_STEM ? nameNoExt.substring(0, MAX_STEM) : nameNoExt;
  const nameTruncated47 = nameNoExt.length > 47 ? nameNoExt.substring(0, 47) : nameNoExt;
  
  let numberedBase: string | null = null;
  const numMatch = sanitizedMedia.match(/^(.+?)(\(\d+\))(\.[^.]+)$/);
  if (numMatch) {
    numberedBase = numMatch[1];
  }

  const dynamicRegexPattern = /([._])(supplemental-metadata|supplemental-metadat|supplemental-metada|supplemental-metad|supplemental-meta|supplemental-met|supplemental-me|supplemental-m|supplemental-|supplemental|supplementa|supplement|supplemen|suppleme|supplem|supple|suppl|supp|sup|su|s|metadata|met|m)(\(\d+\))?\.json$/i;

  let bestMatch: string | null = null;
  let maxScore = -1;

  for (const name of allNames) {
    if (!name.toLowerCase().endsWith('.json')) continue;

    if (
      name.startsWith(sanitizedMedia) ||
      name.startsWith(nameNoExt) ||
      name.startsWith(nameTruncated) ||
      name.startsWith(nameTruncated47) ||
      (numberedBase !== null && name.startsWith(numberedBase))
    ) {
      if (dynamicRegexPattern.test(name)) {
        const score = name.length;
        if (score > maxScore) {
          maxScore = score;
          bestMatch = name;
        }
      }
    }
  }

  return bestMatch;
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

  const order = ['photoTakenTime', 'creationTime', 'modificationTime'];
  candidates.sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  return candidates[0][1];
}
