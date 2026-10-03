import { memoryGuard } from './MemoryGuard';

/**
 * WebAssembly ExifTool Deep Metadata Restorer
 * -------------------------------------------
 * 100% WebAssembly ExifTool (@uswriting/exiftool & @6over3/zeroperl-ts).
 * Replaces legacy JS piexifjs completely.
 * Deeply injects EXIF/XMP/IPTC tags into JPEG, PNG, WebP, HEIC/HEIF, TIFF, DNG,
 * and RAW images natively in the browser without server uploads.
 */

// Global cache for zeroperl.wasm bytes to prevent redundant network fetches across worker tasks
let cachedWasmBytes: ArrayBuffer | null = null;

async function getWasmResponse(): Promise<Response> {
  if (!cachedWasmBytes) {
    if (typeof fetch !== 'undefined') {
      const res = await fetch('/zeroperl.wasm');
      if (!res.ok) {
        throw new Error(`Failed to load WebAssembly binary /zeroperl.wasm: ${res.statusText}`);
      }
      cachedWasmBytes = await res.arrayBuffer();
    } else {
      throw new Error("Fetch API unavailable for WebAssembly binary loading.");
    }
  }
  // Return fresh Response with slice of bytes so body can be consumed repeatedly by zeroperl
  return new Response(cachedWasmBytes.slice(0));
}

const wasmFetch = async (_url: any): Promise<Response> => {
  return getWasmResponse();
};

// Polyfill minimal window and document for zeroperl-ts environment check in Web Workers
export function ensureWorkerPolyfill() {
  if (typeof self !== 'undefined') {
    if (typeof (self as any).window === 'undefined') {
      (self as any).window = self;
    }
    if (typeof (self as any).document === 'undefined') {
      (self as any).document = {
        createElement: () => ({}),
        head: { appendChild: () => {} },
        body: { appendChild: () => {} }
      };
    }
  }
}

/**
 * Format Unix epoch timestamp to ExifTool standard format: "YYYY:MM:DD HH:MM:SS"
 */
export function toExifToolDate(epochSeconds: number): string {
  const d = new Date(epochSeconds * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}:${pad(d.getMonth() + 1)}:${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export interface ExifInjectOptions {
  lat?: number;
  lng?: number;
  altitude?: number;
  description?: string;
  people?: string[];
  albumName?: string;
  artist?: string;
  copyright?: string;
  filename?: string;
}

/**
 * Deeply injects timestamps, GPS geolocation, descriptions, tags, and copyright
 * directly into image binary payloads via WebAssembly ExifTool.
 */
export async function injectImageExif(
  imageBuffer: ArrayBuffer,
  epochSeconds: number,
  options: ExifInjectOptions = {}
): Promise<ArrayBuffer> {
  await memoryGuard.yieldForGC();
  ensureWorkerPolyfill();

  const { lat, lng, altitude, description, people, albumName, artist, copyright, filename = 'image.jpg' } = options;
  const dateStr = toExifToolDate(epochSeconds);

  // Construct comprehensive metadata dictionary for ExifTool
  const tags: Record<string, any> = {
    DateTimeOriginal: dateStr,
    CreateDate: dateStr,
    ModifyDate: dateStr
  };

  // GPS Geolocation tags
  if (lat !== undefined && lng !== undefined && !isNaN(lat) && !isNaN(lng)) {
    tags.GPSLatitude = lat;
    tags.GPSLongitude = lng;
    tags.GPSLatitudeRef = lat >= 0 ? 'N' : 'S';
    tags.GPSLongitudeRef = lng >= 0 ? 'E' : 'W';
    if (altitude !== undefined && !isNaN(altitude)) {
      tags.GPSAltitude = Math.abs(altitude);
      tags.GPSAltitudeRef = altitude >= 0 ? 0 : 1;
    }
  }

  // Captions & Descriptions
  if (description && description.trim()) {
    tags.ImageDescription = description.trim();
    tags.Description = description.trim();
    tags.Caption = description.trim();
  }

  // People & Album tags (Keywords & Subject)
  const keywords: string[] = [];
  if (people && people.length > 0) {
    keywords.push(...people.filter(Boolean));
  }
  if (albumName && albumName.trim()) {
    keywords.push(albumName.trim());
  }
  if (keywords.length > 0) {
    tags.Keywords = keywords.join(', ');
    tags.Subject = keywords;
  }

  // Creator & Copyright
  if (artist && artist.trim()) {
    tags.Artist = artist.trim();
    tags.Creator = artist.trim();
  }
  if (copyright && copyright.trim()) {
    tags.Copyright = copyright.trim();
    tags.Rights = copyright.trim();
  }

  try {
    const { writeMetadata } = await import(/* @vite-ignore */ '@uswriting/exiftool');
    const inputBytes = new Uint8Array(imageBuffer);
    // '-m' instructs ExifTool to ignore minor warnings (e.g. non-standard IPTC tags in PNG)
    const result = await writeMetadata(
      { name: filename, data: inputBytes },
      tags,
      { fetch: wasmFetch, args: ['-m'] }
    );

    if (result && result.success && result.data) {
      return result.data;
    }

    const errDetail = result?.error || `ExifTool exit code ${result?.exitCode ?? -1}`;
    throw new Error(`WASM ExifTool write failed: ${errDetail}`);
  } catch (err: any) {
    console.error("WASM ExifTool execution error:", err);
    throw err;
  }
}

export interface ParsedImageMetadata {
  cameraInfo: Record<string, string>;
  gpsInfo: Record<string, string>;
  allTags?: Record<string, any>;
}

/**
 * Parses full metadata tags from image buffer using WebAssembly ExifTool.
 */
export async function parseImageMetadata(
  imageBuffer: ArrayBuffer,
  filename: string = 'image.jpg'
): Promise<ParsedImageMetadata> {
  ensureWorkerPolyfill();

  const cameraInfo: Record<string, string> = {};
  const gpsInfo: Record<string, string> = {};

  try {
    const { parseMetadata } = await import(/* @vite-ignore */ '@uswriting/exiftool');
    const inputBytes = new Uint8Array(imageBuffer);
    const result = await parseMetadata(
      { name: filename, data: inputBytes },
      { fetch: wasmFetch, args: ['-j', '-m'] }
    );

    if (result && result.success && result.data) {
      const records = JSON.parse(result.data);
      const tags = Array.isArray(records) ? records[0] : records;
      if (tags) {
        if (tags.Make) cameraInfo["Manufacturer"] = String(tags.Make).trim();
        if (tags.Model) cameraInfo["Camera Model"] = String(tags.Model).trim();
        if (tags.Software) cameraInfo["Software"] = String(tags.Software).trim();
        if (tags.DateTimeOriginal) cameraInfo["Date Taken (EXIF)"] = String(tags.DateTimeOriginal).trim();
        else if (tags.CreateDate) cameraInfo["Date Taken (EXIF)"] = String(tags.CreateDate).trim();

        if (tags.GPSLatitude !== undefined && tags.GPSLongitude !== undefined) {
          gpsInfo["Latitude"] = Number(tags.GPSLatitude).toFixed(6);
          gpsInfo["Longitude"] = Number(tags.GPSLongitude).toFixed(6);
        }
        if (tags.GPSAltitude !== undefined) {
          gpsInfo["Altitude"] = `${Number(tags.GPSAltitude).toFixed(1)} meters`;
        }

        return { cameraInfo, gpsInfo, allTags: tags };
      }
    }
  } catch (err) {
    console.warn("ExifTool parseMetadata failed:", err);
  }

  return { cameraInfo, gpsInfo };
}

/**
 * Fast zero-dependency binary reader for EXIF Date in JPEGs / TIFFs without initializing WASM.
 */
export function extractExifDateFast(buffer: ArrayBuffer | Uint8Array): Date | null {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.length < 32) return null;

  // Search first 64KB for ASCII pattern: YYYY:MM:DD HH:MM:SS
  const scanLimit = Math.min(bytes.length - 19, 65536);
  for (let i = 0; i < scanLimit; i++) {
    // Check for "YYYY:MM:DD " pattern: 4 digits, ':', 2 digits, ':', 2 digits, ' '
    if (
      bytes[i] >= 49 && bytes[i] <= 50 && // 1 or 2 (year 1xxx or 2xxx)
      bytes[i + 1] >= 48 && bytes[i + 1] <= 57 &&
      bytes[i + 2] >= 48 && bytes[i + 2] <= 57 &&
      bytes[i + 3] >= 48 && bytes[i + 3] <= 57 &&
      bytes[i + 4] === 58 && // ':'
      bytes[i + 5] >= 48 && bytes[i + 5] <= 57 &&
      bytes[i + 6] >= 48 && bytes[i + 6] <= 57 &&
      bytes[i + 7] === 58 && // ':'
      bytes[i + 8] >= 48 && bytes[i + 8] <= 57 &&
      bytes[i + 9] >= 48 && bytes[i + 9] <= 57 &&
      bytes[i + 10] === 32 // ' '
    ) {
      let str = "";
      for (let j = 0; j < 19; j++) {
        str += String.fromCharCode(bytes[i + j]);
      }
      const parts = str.split(" ");
      if (parts.length === 2) {
        const dParts = parts[0].split(":").map(Number);
        const tParts = parts[1].split(":").map(Number);
        if (dParts.length === 3 && tParts.length === 3) {
          const y = dParts[0];
          const m = dParts[1] - 1;
          const d = dParts[2];
          const hh = tParts[0];
          const mm = tParts[1];
          const ss = tParts[2];
          if (y >= 1970 && y <= 2100 && m >= 0 && m < 12 && d >= 1 && d <= 31) {
            return new Date(y, m, d, hh, mm, ss);
          }
        }
      }
    }
  }
  return null;
}

/** Check if file is a supported image extension for ExifTool */
export function isSupportedImageFormat(filenameOrFile: string | File): boolean {
  const filename = typeof filenameOrFile === 'string' ? filenameOrFile : filenameOrFile.name;
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'tiff', 'tif', 'dng', 'cr2', 'nef', 'arw', 'raw'].includes(ext);
}

/** Backward-compatible helper for checking JPEGs */
export function isJpeg(file: File | string): boolean {
  const name = typeof file === 'string' ? file : file.name;
  return /\.(jpe?g)$/i.test(name);
}
