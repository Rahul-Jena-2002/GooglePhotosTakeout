import piexif from 'piexifjs';
import { memoryGuard } from './MemoryGuard';

/**
 * Deep injects timestamp and GPS data directly into the image binary payload
 * (supports JPEG, PNG, WebP, HEIC, DNG, TIFF) while preserving existing metadata.
 */
function toUtf16Array(str: string): number[] {
  const arr: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    arr.push(code & 0xff, (code >> 8) & 0xff);
  }
  arr.push(0, 0); // null terminator
  return arr;
}

// Global singleton cache for ExifTool Wasm instance
let exiftoolWasmInstance: any = null;

async function getExifToolWasmInstance() {
  if (exiftoolWasmInstance) return exiftoolWasmInstance;
  try {
    const mod = await import(/* @vite-ignore */ '@uswriting/exiftool');
    if (mod && mod.ExifTool) {
      exiftoolWasmInstance = new mod.ExifTool();
      if (typeof exiftoolWasmInstance.init === 'function') {
        await exiftoolWasmInstance.init();
      }
    }
  } catch (err) {
    console.warn("ExifTool Wasm initialization fallback:", err);
    exiftoolWasmInstance = null;
  }
  return exiftoolWasmInstance;
}

export async function injectImageExif(
  imageBuffer: ArrayBuffer,
  epochSeconds: number,
  lat?: number,
  lng?: number,
  description?: string,
  people?: string[],
  albumName?: string
): Promise<ArrayBuffer> {
  // Yield control briefly to garbage collector to maintain dynamic memory bounds
  await memoryGuard.yieldForGC();

  // Try ExifTool Wasm deep injection first for universal multi-format support
  const exiftool = await getExifToolWasmInstance();
  if (exiftool) {
    try {
      const d = new Date(epochSeconds * 1000);
      const formattedDate = d.toISOString();
      const tags: Record<string, any> = {
        DateTimeOriginal: formattedDate,
        CreateDate: formattedDate,
        ModifyDate: formattedDate
      };

      if (lat !== undefined && lng !== undefined) {
        tags.GPSLatitude = lat;
        tags.GPSLongitude = lng;
      }
      if (description) {
        tags.ImageDescription = description;
      }
      if (people && people.length > 0) {
        tags.Keywords = people.join(', ');
      }

      const uint8Input = new Uint8Array(imageBuffer);
      const modifiedBytes = await exiftool.write(uint8Input, tags);
      if (modifiedBytes && modifiedBytes.length > 0) {
        return modifiedBytes.buffer as ArrayBuffer;
      }
    } catch (wasmErr) {
      console.warn("ExifTool Wasm write failed, attempting piexif fallback:", wasmErr);
    }
  }

  // Fallback: piexifjs binary injection for JPEGs
  const binary = arrayBufferToBinaryString(imageBuffer);

  // Load existing EXIF or create empty object
  let exifObj: any;
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
    exifObj = { '0th': {}, 'Exif': {}, 'GPS': {}, '1st': {}, thumbnail: null };
  }

  // Ensure inner sub-objects are initialized
  if (!exifObj['0th']) exifObj['0th'] = {};
  if (!exifObj['Exif']) exifObj['Exif'] = {};
  if (!exifObj['GPS']) exifObj['GPS'] = {};

  // Convert Unix epoch to EXIF string format: "YYYY:MM:DD HH:MM:SS" (local timezone)
  const d = new Date(epochSeconds * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const dateStr = `${d.getFullYear()}:${pad(d.getMonth() + 1)}:${pad(d.getDate())} ` +
                  `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

  // Inject Time Tags
  try {
    exifObj['Exif'][piexif.ExifIFD.DateTimeOriginal] = dateStr;
    exifObj['Exif'][piexif.ExifIFD.DateTimeDigitized] = dateStr;
    exifObj['0th'][piexif.ImageIFD.DateTime] = dateStr;

    // Inject GPS Tags if available
    if (lat !== undefined && lng !== undefined) {
      const absLat = Math.abs(lat);
      const absLng = Math.abs(lng);

      exifObj['GPS'][piexif.GPSIFD.GPSLatitudeRef] = lat >= 0 ? 'N' : 'S';
      exifObj['GPS'][piexif.GPSIFD.GPSLatitude] = DegToDMS(absLat);
      exifObj['GPS'][piexif.GPSIFD.GPSLongitudeRef] = lng >= 0 ? 'E' : 'W';
      exifObj['GPS'][piexif.GPSIFD.GPSLongitude] = DegToDMS(absLng);
      exifObj['GPS'][piexif.GPSIFD.GPSVersionID] = [2, 3, 0, 0];
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

    // Sanitize tags against piexif catalog
    const tags = (piexif as any).TAGS;
    for (const ifd of ['0th', 'Exif', 'GPS', '1st', 'Interop']) {
      if (exifObj[ifd] && typeof exifObj[ifd] === 'object') {
        const allowed = tags?.[ifd];
        for (const [k] of Object.entries(exifObj[ifd])) {
          const num = Number(k);
          if (ifd === '0th' && (num === 34665 || num === 34853)) { delete exifObj[ifd][num]; continue; }
          if (ifd === 'Exif' && num === 40965) { delete exifObj[ifd][num]; continue; }
          if (ifd === '1st' && (num === 513 || num === 514)) { delete exifObj[ifd][num]; continue; }
          if (!allowed || !allowed[num]) {
            delete exifObj[ifd][num];
          }
        }
      }
    }

    let exifBytes: string;
    try {
      exifBytes = piexif.dump(exifObj);
    } catch {
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

    let newBinary: string;
    try {
      newBinary = piexif.insert(exifBytes, binary);
    } catch {
      if (binary.charCodeAt(0) === 0xff && binary.charCodeAt(1) === 0xd8) {
        const len = exifBytes.length + 2;
        const app1 = '\xff\xe1' + String.fromCharCode((len >> 8) & 0xff, len & 0xff) + exifBytes;
        if (binary.charCodeAt(2) === 0xff && binary.charCodeAt(3) === 0xe0) {
          const jfifLen = (binary.charCodeAt(4) << 8) | binary.charCodeAt(5);
          const insertPos = 4 + jfifLen;
          newBinary = binary.slice(0, insertPos) + app1 + binary.slice(insertPos);
        } else {
          newBinary = binary.slice(0, 2) + app1 + binary.slice(2);
        }
      } else {
        newBinary = binary;
      }
    }

    const resultBytes = binaryStringToUint8Array(newBinary);
    return resultBytes.buffer as ArrayBuffer;
  } catch {
    return imageBuffer;
  }
}

/**
 * Deep injects time and location properties into video containers.
 * In a desktop/Node environment, this executes exiftool.
 * In a browser environment, it streams the unchanged buffer as a fallback.
 */
export async function injectVideoMetadata(
  videoBufferOrPath: ArrayBuffer | string,
  epochSeconds: number,
  lat?: number,
  lng?: number
): Promise<ArrayBuffer | string> {
  if (typeof window === 'undefined') {
    // Node.js environment - execute exiftool
    try {
      const cpName = 'child_process';
      const pathName = 'path';
      const utilName = 'util';
      const cp = await import(/* @vite-ignore */ cpName);
      const path = await import(/* @vite-ignore */ pathName);
      const util = await import(/* @vite-ignore */ utilName);
      const execFilePromise = util.promisify(cp.execFile);

      if (typeof videoBufferOrPath === 'string') {
        const videoPath = videoBufferOrPath;
        const formattedDate = new Date(epochSeconds * 1000).toISOString();
        const ext = path.extname(videoPath).toLowerCase();
        const dir = path.dirname(videoPath);
        const base = path.basename(videoPath, ext);
        const outputPath = path.join(dir, `${base}_injected${ext}`);

        const args = ['-overwrite_original'];
        args.push(`-AllDates=${formattedDate}`);
        args.push(`-TrackCreateDate=${formattedDate}`);
        args.push(`-TrackModifyDate=${formattedDate}`);
        args.push(`-MediaCreateDate=${formattedDate}`);
        args.push(`-MediaModifyDate=${formattedDate}`);

        if (lat !== undefined && lng !== undefined) {
          const latSign = lat >= 0 ? "+" : "-";
          const lngSign = lng >= 0 ? "+" : "-";
          const padLat = Math.abs(lat).toFixed(4).padStart(7, '0');
          const padLng = Math.abs(lng).toFixed(4).padStart(8, '0');
          
          args.push(`-Keys:GPSCoordinates=${latSign}${padLat}${lngSign}${padLng}/`);
          args.push(`-UserData:GPSCoordinates=${latSign}${padLat}${lngSign}${padLng}/`);
        }

        args.push(videoPath, '-o', outputPath);
        await execFilePromise('exiftool', args);
        return outputPath;
      }
    } catch (err) {
      console.error("Desktop video EXIF injection failed:", err);
    }
  }

  // Browser fallback (returns raw bytes unchanged)
  return videoBufferOrPath;
}

/** Helper: Converts decimal coordinates to EXIF rational numbers (Degrees, Minutes, Seconds) */
function DegToDMS(deg: number): Array<[number, number]> {
  const d = Math.floor(deg);
  const minFloat = (deg - d) * 60;
  const m = Math.floor(minFloat);
  const s = Math.round((minFloat - m) * 60 * 100);
  return [[d, 1], [m, 1], [s, 100]];
}

function arrayBufferToBinaryString(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const CHUNK_SIZE = 8192;
  let str = "";
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    str += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK_SIZE) as unknown as number[]);
  }
  return str;
}

function binaryStringToUint8Array(str: string): Uint8Array {
  const buf = new ArrayBuffer(str.length);
  const arr = new Uint8Array(buf);
  for (let i = 0; i < str.length; i++) arr[i] = str.charCodeAt(i) & 0xff;
  return arr;
}
