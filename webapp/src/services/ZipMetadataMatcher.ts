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
export function findMatchingJsonNameForZip(
  mediaName: string,
  allNames: Set<string>
): string | null {
  // 1. Normalize all inputs to NFC and sanitize entry names for comparison
  const normalizedMediaName = normalizeNfc(mediaName);

  // Build a map from sanitized+normalized entry name → original entry name
  const sanitizedToOrig = new Map<string, string>();
  for (const orig of allNames) {
    const key = normalizeNfc(sanitizeFilename(orig));
    if (!sanitizedToOrig.has(key)) {
      sanitizedToOrig.set(key, orig);
    }
  }

  // 2. Try exact and generated candidates lookup (candidates are already sanitized)
  const candidates = getZipMatchingCandidates(normalizedMediaName);
  for (const candidate of candidates) {
    const normCandidate = normalizeNfc(candidate);
    if (sanitizedToOrig.has(normCandidate)) {
      return sanitizedToOrig.get(normCandidate)!;
    }
  }

  // 3. Dynamic Regex Scanning Fallback (adapted for ZIP)
  const sanitizedMedia = normalizeNfc(sanitizeFilename(normalizedMediaName));
  const lastDot = sanitizedMedia.lastIndexOf(".");
  const nameNoExt = lastDot > 0 ? sanitizedMedia.substring(0, lastDot) : sanitizedMedia;
  const cleanNameNoExt = stripHexHash(nameNoExt);
  const nameTruncated = nameNoExt.length > 46 ? nameNoExt.substring(0, 46) : nameNoExt;
  const cleanNameTruncated = cleanNameNoExt.length > 46 ? cleanNameNoExt.substring(0, 46) : cleanNameNoExt;

  let numberedBase: string | null = null;
  const numMatch = sanitizedMedia.match(/^(.+?)(\(\d+\))(\.[^.]+)$/);
  if (numMatch) {
    numberedBase = numMatch[1];
  }

  const dynamicRegexPattern = /([._])(supplemental-metadata|supplemental-metadat|supplemental-metada|supplemental-metad|supplemental-meta|supplemental-met|supplemental-me|supplemental-m|supplemental-|supplemental|supplementa|supplement|supplemen|suppleme|supplem|supple|suppl|supp|sup|su|s|metadata|met|m)(\(\d+\))?\.json$/i;

  let bestMatch: string | null = null;
  let maxScore = -1;

  for (const [sanitizedName, origName] of sanitizedToOrig) {
    if (!sanitizedName.toLowerCase().endsWith(".json")) continue;

    if (
      sanitizedName.startsWith(sanitizedMedia) ||
      sanitizedName.startsWith(nameNoExt) ||
      sanitizedName.startsWith(cleanNameNoExt) ||
      sanitizedName.startsWith(nameTruncated) ||
      sanitizedName.startsWith(cleanNameTruncated) ||
      (numberedBase !== null && sanitizedName.startsWith(normalizeNfc(numberedBase)))
    ) {
      if (dynamicRegexPattern.test(sanitizedName)) {
        const score = sanitizedName.length;
        if (score > maxScore) {
          maxScore = score;
          bestMatch = origName;
        }
      }
    }
  }

  if (bestMatch) return bestMatch;

  // 4. Case-Insensitive Fallback:
  // Compare lowercase version of candidates against sanitized lowercase entry names
  const candidatesLower = new Set(Array.from(candidates).map(c => normalizeNfc(c).toLowerCase()));
  for (const [sanitizedName, origName] of sanitizedToOrig) {
    if (candidatesLower.has(sanitizedName.toLowerCase())) {
      return origName;
    }
  }

  return null;
}
