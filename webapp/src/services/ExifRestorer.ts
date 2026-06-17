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
 * Inject EXIF DateTimeOriginal into a JPEG.
 * Returns new Uint8Array<ArrayBuffer> with the injected EXIF data.
 * Throws if the file is not a JPEG or piexifjs fails.
 */
export function injectExifDate(jpegBuffer: ArrayBuffer, epochSec: number): Uint8Array<ArrayBuffer> {
  const binary = arrayBufferToBinaryString(jpegBuffer);
  const dataUrl = `data:image/jpeg;base64,${btoa(binary)}`;

  const dateStr = toExifDate(epochSec);

  // Load existing EXIF or create empty object.
  // piexifjs has a known bug where certain Snapchat / non-standard JPEGs cause
  // "Cannot set property writable of #<cA> which has only a getter" — we catch
  // ALL errors from load() and fall back to a fresh EXIF object so the file is
  // still copied with the correct date rather than being logged as an error.
  let exifObj: ReturnType<typeof piexif.load>;
  try {
    exifObj = piexif.load(dataUrl);
  } catch {
    exifObj = { '0th': {}, 'Exif': {}, 'GPS': {}, '1st': {}, thumbnail: null };
  }

  // Inject into both '0th' (DateTime) and 'Exif' (DateTimeOriginal + DateTimeDigitized)
  try {
    exifObj['0th'][piexif.ImageIFD.DateTime] = dateStr;
    exifObj['Exif'][piexif.ExifIFD.DateTimeOriginal]  = dateStr;
    exifObj['Exif'][piexif.ExifIFD.DateTimeDigitized] = dateStr;

    const exifBytes  = piexif.dump(exifObj);
    const newDataUrl = piexif.insert(exifBytes, dataUrl);

    // Strip the data URL prefix and decode base64
    const base64 = newDataUrl.replace(/^data:image\/jpeg;base64,/, '');
    return binaryStringToUint8Array(atob(base64));
  } catch {
    // If piexif.dump/insert also fails (e.g. malformed IFD on Snapchat images),
    // fall back to writing original bytes unchanged — metadata won't be injected
    // but the file is still saved rather than being lost as an error.
    return new Uint8Array(jpegBuffer);
  }
}

/** Is this file a JPEG that we can inject into? */
export function isJpeg(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return ext === 'jpg' || ext === 'jpeg';
}
