import { injectImageExif, isSupportedImageFormat } from './DeepExifRestorer';

/**
 * High-performance WebAssembly EXIF date, GPS, description, people, and album metadata restorer.
 * Uses native zeroperl WebAssembly ExifTool for multi-format browser processing.
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
    {
      lat,
      lng,
      description,
      people,
      albumName,
      filename
    }
  );
  return new Uint8Array(resBuffer);
}

export { isSupportedImageFormat };
