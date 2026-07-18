import piexif from 'piexifjs';

/**
 * Deep injects timestamp and GPS data directly into the image binary payload (JPEGs)
 * while preserving existing metadata.
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

export async function injectImageExif(
  imageBuffer: ArrayBuffer,
  epochSeconds: number,
  lat?: number,
  lng?: number,
  description?: string,
  people?: string[]
): Promise<ArrayBuffer> {
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

    if (people && people.length > 0) {
      const peopleStr = people.join(', ');
      exifObj['Exif'][piexif.ExifIFD.UserComment] = "People: " + peopleStr;
      exifObj['0th'][piexif.ImageIFD.XPKeywords] = toUtf16Array(peopleStr);
    }

    const exifBytes = piexif.dump(exifObj);
    const newBinary = piexif.insert(exifBytes, binary);

    const resultBytes = binaryStringToUint8Array(newBinary);
    return resultBytes.buffer as ArrayBuffer;
  } catch {
    // piexifjs throws "Cannot set property writable of #<cA> which has only a
    // getter" on certain Snapchat / non-standard JPEG files whose EXIF IFD is
    // read-only at the JS engine level. Fall back to returning original bytes
    // unchanged so the file is still saved rather than counted as an error.
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
  return new TextDecoder("latin1").decode(new Uint8Array(buf));
}

function binaryStringToUint8Array(str: string): Uint8Array {
  const buf = new ArrayBuffer(str.length);
  const arr = new Uint8Array(buf);
  for (let i = 0; i < str.length; i++) arr[i] = str.charCodeAt(i);
  return arr;
}

