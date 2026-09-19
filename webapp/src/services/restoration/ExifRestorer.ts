/**
 * ExifRestorer
 * ------------
 * Injects the correct Date Taken into JPEG files using piexifjs.
 * For non-JPEG files (MP4, PNG, etc.), we fall back to returning
 * the raw bytes unchanged (OS modification time is set separately).
 *
 * Security: all data is processed in-memory; no eval(), no innerHTML.
 */

// piexifjs is a UMD module — import as namespace
import piexif from 'piexifjs';

// ---------------------------------------------------------------------------
// Result type — callers can distinguish success from each failure mode
// ---------------------------------------------------------------------------
export type ExifInjectResult = {
  bytes: Uint8Array<ArrayBuffer>;
  success: boolean;
  /** Populated only when success === false */
  reason?: 'piexif_load_failed' | 'piexif_dump_failed';
}

/** Format an epoch-seconds timestamp to EXIF date string: "YYYY:MM:DD HH:MM:SS" */
function toExifDate(epochSec: number): string {
  const d = new Date(epochSec * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}:${pad(d.getMonth() + 1)}:${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

/** Convert ArrayBuffer → binary string (strictly preserves 0x00-0xFF byte values for piexifjs) */
function arrayBufferToBinaryString(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const CHUNK_SIZE = 8192;
  let str = "";
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    str += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK_SIZE) as unknown as number[]);
  }
  return str;
}

/** Convert binary string → Uint8Array<ArrayBuffer> */
function binaryStringToUint8Array(str: string): Uint8Array<ArrayBuffer> {
  const buf = new ArrayBuffer(str.length);
  const arr = new Uint8Array(buf);
  for (let i = 0; i < str.length; i++) arr[i] = str.charCodeAt(i) & 0xff;
  return arr;
}

/** Sanitize an EXIF dictionary so it only contains valid tags known to piexifjs */
function sanitizeExifDict(rawObj: any): any {
  const clean: any = {
    '0th': {},
    'Exif': {},
    'GPS': {},
    '1st': {},
    'Interop': {},
    thumbnail: rawObj.thumbnail || null
  };

  const tags = (piexif as any).TAGS;
  for (const ifd of ['0th', 'Exif', 'GPS', '1st', 'Interop']) {
    if (rawObj[ifd] && typeof rawObj[ifd] === 'object') {
      const allowed = tags?.[ifd];
      for (const [k, v] of Object.entries(rawObj[ifd])) {
        const num = Number(k);
        // Exclude pointer tags that piexif generates internally
        if (ifd === '0th' && (num === 34665 || num === 34853)) continue;
        if (ifd === 'Exif' && num === 40965) continue;
        if (ifd === '1st' && (num === 513 || num === 514)) continue;

        if (allowed && allowed[num]) {
          clean[ifd][num] = v;
        }
      }
    }
  }
  return clean;
}

/** Safely insert an APP1 EXIF segment into a JPEG string, with fallback to direct marker insertion */
function safeInsertExif(exifBytes: string, binary: string): string {
  try {
    return piexif.insert(exifBytes, binary);
  } catch {
    // If piexif.insert fails due to non-standard JFIF markers, insert APP1 directly
    if (binary.charCodeAt(0) !== 0xff || binary.charCodeAt(1) !== 0xd8) {
      throw new Error("Invalid JPEG SOI");
    }
    const len = exifBytes.length + 2;
    const app1 = '\xff\xe1' + String.fromCharCode((len >> 8) & 0xff, len & 0xff) + exifBytes;

    // If APP0 (JFIF) follows SOI, insert immediately after APP0
    if (binary.charCodeAt(2) === 0xff && binary.charCodeAt(3) === 0xe0) {
      const jfifLen = (binary.charCodeAt(4) << 8) | binary.charCodeAt(5);
      const insertPos = 4 + jfifLen;
      if (insertPos < binary.length) {
        return binary.slice(0, insertPos) + app1 + binary.slice(insertPos);
      }
    }
    // Otherwise insert immediately after SOI (offset 2)
    return binary.slice(0, 2) + app1 + binary.slice(2);
  }
}

function toUtf16Array(str: string): number[] {
  const arr: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    arr.push(code & 0xff, (code >> 8) & 0xff);
  }
  arr.push(0, 0); // null terminator
  return arr;
}

export function injectExifDate(
  jpegBuffer: ArrayBuffer,
  epochSec: number,
  lat?: number,
  lng?: number,
  description?: string,
  people?: string[],
  albumName?: string
): ExifInjectResult {
  const binary = arrayBufferToBinaryString(jpegBuffer);
  const dateStr = toExifDate(epochSec);

  // ── Step 1: Load existing EXIF (or start fresh) ────────────────────────────
  let exifObj: any;
  let loadFailed = false;
  try {
    const raw = piexif.load(binary);
    exifObj = sanitizeExifDict({
      '0th': { ...(raw['0th'] || {}) },
      'Exif': { ...(raw['Exif'] || {}) },
      'GPS': { ...(raw['GPS'] || {}) },
      '1st': { ...(raw['1st'] || {}) },
      thumbnail: raw.thumbnail || null
    });
  } catch {
    loadFailed = true;
    exifObj = { '0th': {}, 'Exif': {}, 'GPS': {}, '1st': {}, thumbnail: null };
  }

  // ── Step 2: Inject date + optional GPS + description + people ──────────────
  try {
    exifObj['0th'][piexif.ImageIFD.DateTime]          = dateStr;
    exifObj['Exif'][piexif.ExifIFD.DateTimeOriginal]  = dateStr;
    exifObj['Exif'][piexif.ExifIFD.DateTimeDigitized] = dateStr;

    if (lat != null && lng != null) {
      const toRational = (val: number): [number, number][] => {
        const abs = Math.abs(val);
        const deg = Math.floor(abs);
        const minFloat = (abs - deg) * 60;
        const min = Math.floor(minFloat);
        const sec = Math.round((minFloat - min) * 60 * 100);
        return [[deg, 1], [min, 1], [sec, 100]];
      };
      exifObj['GPS'][piexif.GPSIFD.GPSLatitudeRef]  = lat >= 0 ? 'N' : 'S';
      exifObj['GPS'][piexif.GPSIFD.GPSLatitude]     = toRational(lat);
      exifObj['GPS'][piexif.GPSIFD.GPSLongitudeRef] = lng >= 0 ? 'E' : 'W';
      exifObj['GPS'][piexif.GPSIFD.GPSLongitude]    = toRational(lng);
    }

    if (description) {
      exifObj['0th'][piexif.ImageIFD.ImageDescription] = description;
    }

    if ((people && people.length > 0) || albumName) {
      const parts: string[] = [];
      const keywords: string[] = [];
      if (people && people.length > 0) {
        const peopleStr = people.join(', ');
        parts.push("People: " + peopleStr);
        keywords.push(peopleStr);
      }
      if (albumName) {
        parts.push("Album: " + albumName);
        keywords.push("Album: " + albumName);
      }
      exifObj['Exif'][piexif.ExifIFD.UserComment] = "ASCII\0\0\0" + parts.join(' | ');
      exifObj['0th'][piexif.ImageIFD.XPKeywords] = toUtf16Array(keywords.join(', '));
    }

    let exifBytes: string;
    try {
      exifBytes = piexif.dump(exifObj);
    } catch {
      // If full dump fails on non-standard tags, dump minimal guaranteed-valid dictionary
      const minimalObj: any = {
        '0th': { [piexif.ImageIFD.DateTime]: dateStr },
        'Exif': {
          [piexif.ExifIFD.DateTimeOriginal]: dateStr,
          [piexif.ExifIFD.DateTimeDigitized]: dateStr
        },
        'GPS': exifObj['GPS'] || {},
        '1st': {},
        thumbnail: null
      };
      if (description) minimalObj['0th'][piexif.ImageIFD.ImageDescription] = description;
      exifBytes = piexif.dump(minimalObj);
    }

    const newBinary = safeInsertExif(exifBytes, binary);
    const bytes = binaryStringToUint8Array(newBinary);

    return { bytes, success: true };
  } catch {
    return {
      bytes: new Uint8Array(jpegBuffer),
      success: false,
      reason: loadFailed ? 'piexif_load_failed' : 'piexif_dump_failed',
    };
  }
}

/** Is this file a JPEG that we can inject into? */
export function isJpeg(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return ext === 'jpg' || ext === 'jpeg';
}
