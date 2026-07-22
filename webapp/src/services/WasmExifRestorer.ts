import { injectImageExif } from './DeepExifRestorer';

/**
 * High-performance EXIF date, GPS, description, people, and album metadata restorer.
 * Uses binary payload injection for zero-overhead browser processing.
 * 
 * @param fileData Uint8Array containing the image data
 * @param epochSec The timestamp to inject
 * @param lat Optional latitude
 * @param lng Optional longitude
 * @param description Optional description
 * @param people Optional people tags
 * @param albumName Optional album name
 * @param filename The original filename
 * @returns A Uint8Array of the modified file
 */
export async function injectWasmExif(
  fileData: Uint8Array,
  epochSec: number,
  lat?: number,
  lng?: number,
  description?: string,
  people?: string[],
  albumName?: string,
  filename: string = 'image.jpg'
): Promise<Uint8Array> {
  const resBuffer = await injectImageExif(
    fileData.buffer as ArrayBuffer,
    epochSec,
    lat,
    lng,
    description,
    people,
    albumName
  );
  return new Uint8Array(resBuffer);
}
