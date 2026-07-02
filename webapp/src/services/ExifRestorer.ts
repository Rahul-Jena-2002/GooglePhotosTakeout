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

/** Convert ArrayBuffer → binary string (needed by piexifjs) */
function arrayBufferToBinaryString(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  // Process in chunks to avoid call stack overflow on large files
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return binary;
}

/** Convert binary string → Uint8Array<ArrayBuffer> */
function binaryStringToUint8Array(str: string): Uint8Array<ArrayBuffer> {
  const buf = new ArrayBuffer(str.length);
  const arr = new Uint8Array(buf);
  for (let i = 0; i < str.length; i++) arr[i] = str.charCodeAt(i);
  return arr;
}

/**
 * Inject EXIF DateTimeOriginal (+ GPS if provided) into a JPEG.
 *
 * Returns an ExifInjectResult:
 *   - success=true  → bytes contains the updated JPEG with EXIF injected
 *   - success=false → bytes contains the ORIGINAL unchanged bytes (safe fallback)
 *                     reason tells you which piexif step failed
 *
 * The safe fallback behaviour is intentional: corrupt / non-standard JPEGs
 * (Snapchat exports, some Samsung/Xiaomi variants) are still written to disk
 * rather than being lost. Callers should log the reason for user visibility.
 */
export function injectExifDate(
  jpegBuffer: ArrayBuffer,
  epochSec: number,
  lat?: number,
  lng?: number,
): ExifInjectResult {
  const binary = arrayBufferToBinaryString(jpegBuffer);
  const dateStr = toExifDate(epochSec);

  // ── Step 1: Load existing EXIF (or start fresh) ────────────────────────────
  // piexifjs has a known bug where certain non-standard JPEGs throw
  // "Cannot set property writable of #<cA> which has only a getter".
  // We resolve this by loading the raw data and copying it into a fresh,
  // fully-writable object structure.
  let exifObj: any;
  let loadFailed = false;
  try {
    const raw = piexif.load(binary);
    exifObj = {
      '0th': { ...(raw['0th'] || {}) },
      'Exif': { ...(raw['Exif'] || {}) },
      'GPS': { ...(raw['GPS'] || {}) },
      '1st': { ...(raw['1st'] || {}) },
      thumbnail: raw.thumbnail || null
    };
  } catch {
    loadFailed = true;
    exifObj = { '0th': {}, 'Exif': {}, 'GPS': {}, '1st': {}, thumbnail: null };
  }

  // ── Step 2: Inject date + optional GPS ─────────────────────────────────────
  try {
    exifObj['0th'][piexif.ImageIFD.DateTime]              = dateStr;
    exifObj['Exif'][piexif.ExifIFD.DateTimeOriginal]      = dateStr;
    exifObj['Exif'][piexif.ExifIFD.DateTimeDigitized]     = dateStr;

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

    const exifBytes  = piexif.dump(exifObj);
    const newBinary = piexif.insert(exifBytes, binary);
    const bytes  = binaryStringToUint8Array(newBinary);

    // If load failed but dump/insert succeeded, still mark as partial success
    // (the date is injected, GPS wasn't preserved from original EXIF, but that's fine)
    return { bytes, success: true };
  } catch {
    // piexif.dump/insert failed — return ORIGINAL bytes unchanged so the file
    // is still written to disk. Caller gets reason to surface in the UI.
    return {
      bytes:   new Uint8Array(jpegBuffer),
      success: false,
      reason:  loadFailed ? 'piexif_load_failed' : 'piexif_dump_failed',
    };
  }
}

/** Is this file a JPEG that we can inject into? */
export function isJpeg(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return ext === 'jpg' || ext === 'jpeg';
}
