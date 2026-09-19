import { sanitizeFilename } from "./MetadataMatcher";

/**
 * Normalizes a string to NFC Unicode representation.
 */
export function normalizeNfc(val: string): string {
  return typeof val === "string" ? val.normalize("NFC") : val;
}

/**
 * Normalizes a ZIP entry path: converts Windows backslashes to forward slashes.
 */
export function normalizeZipPath(path: string): string {
  return path.replace(/\\/g, '/');
}

/**
 * Strips 13-character hex hash conflict suffix (e.g. _6012fa4d4ddec) from a stem.
 */
export function stripHexHash(nameNoExt: string): string {
  // Regex to match a trailing 13-character hex hash, e.g. _6012fa4d4ddec
  return nameNoExt.replace(/_[0-9a-fA-F]{13}$/, "");
}

/**
 * Generates matching candidates for ZIP entries.
 * For ZIP archives, we want to make sure:
 * 1. Exact untruncated matches: name.json, name.ext.json are present.
 * 2. Hex-hash conflict suffix (e.g. _6012fa4d4ddec) is stripped from the stem and candidates generated for both.
 * 3. Normalization (e.g. MAX_STEM=46) is still applied as fallback since Google Photos Takeout can also truncate in ZIPs.
 */
export function getZipMatchingCandidates(mediaName: string): Set<string> {
  const sanitized = normalizeNfc(sanitizeFilename(mediaName));
  const candidates = new Set<string>();

  // Add exact untruncated candidate name.json
  candidates.add(sanitized + ".json");

  const lastDot = sanitized.lastIndexOf(".");
  const nameNoExt = lastDot > 0 ? sanitized.substring(0, lastDot) : sanitized;
  const ext = lastDot > 0 ? sanitized.substring(lastDot) : "";

  // Add exact untruncated candidate name.ext.json
  if (lastDot > 0) {
    candidates.add(nameNoExt + ".json");
  }

  // Handle Hex-Hash Suffix Stripping
  const cleanNameNoExt = stripHexHash(nameNoExt);
  if (cleanNameNoExt !== nameNoExt) {
    candidates.add(cleanNameNoExt + ".json");
    if (ext) {
      candidates.add(cleanNameNoExt + ext + ".json");
      candidates.add(cleanNameNoExt + ".json"); // redundant but safe
    }
  }

  // Also include standard truncation and fuzzy rules from MetadataMatcher's candidates
  // but using the clean base as well.
  const standardBases = [nameNoExt];
  if (cleanNameNoExt !== nameNoExt) {
    standardBases.push(cleanNameNoExt);
  }

  const MAX_STEM = 46;
  const stems = new Set<string>();

  for (const base of standardBases) {
    // Standard Google Takeout base rules
    if (base.length > MAX_STEM) {
      stems.add(base.substring(0, MAX_STEM));
      stems.add(base.substring(0, 47));
    } else {
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

    // Numbered suffix check
    const numberedMatch = base.match(/^(.+?)(\(\d+\))$/);
    if (numberedMatch && ext) {
      const [, basePart, numberSuffix] = numberedMatch;
      const word = "supplemental-metadata";
      const suffixes = [];
      for (let i = 1; i <= word.length; i++) {
        suffixes.push(word.substring(0, i));
      }
      suffixes.push("metadata", "m");
      const delimiters = [".", "_"];

      for (const suffix of suffixes) {
        for (const delim of delimiters) {
          stems.add(basePart + ext + delim + suffix + numberSuffix);
        }
      }
    }
  }

  // Fuzzy slices
  const fuzzyStems = new Set<string>();
  for (const stem of stems) {
    for (let L = 42; L <= 46; L++) {
      if (stem.length >= L) {
        fuzzyStems.add(stem.substring(0, L));
      }
    }
  }

  const combinedStems = new Set([...stems, ...fuzzyStems]);
  for (const stem of combinedStems) {
    candidates.add(stem + ".json");
  }

  return candidates;
}

/**
 * Searches for a matching JSON sidecar in the set of ZIP entry filenames.
 * Both mediaName and allNames entries are sanitized before comparison to fix
 * the mismatch when ZIP was created on Windows (backslashes, special chars).
 */
import { findMatchingJsonName } from "./MetadataMatcher";

export function findMatchingJsonNameForZip(
  mediaName: string,
  allNames: Set<string>
): string | null {
  // 1. First try standard universal matching
  const directMatch = findMatchingJsonName(mediaName, allNames);
  if (directMatch) return directMatch;

  // 2. Try with stripped hex-hash suffix if present
  const lastDot = mediaName.lastIndexOf(".");
  const nameNoExt = lastDot > 0 ? mediaName.substring(0, lastDot) : mediaName;
  const ext = lastDot > 0 ? mediaName.substring(lastDot) : "";
  const cleanNameNoExt = stripHexHash(nameNoExt);

  if (cleanNameNoExt !== nameNoExt) {
    const cleanMedia = cleanNameNoExt + ext;
    const cleanMatch = findMatchingJsonName(cleanMedia, allNames);
    if (cleanMatch) return cleanMatch;
  }

  // 3. Normalized NFC candidate fallback
  const normalizedMediaName = normalizeNfc(mediaName);
  if (normalizedMediaName !== mediaName) {
    const nfcMatch = findMatchingJsonName(normalizedMediaName, allNames);
    if (nfcMatch) return nfcMatch;
  }

  return null;
}
