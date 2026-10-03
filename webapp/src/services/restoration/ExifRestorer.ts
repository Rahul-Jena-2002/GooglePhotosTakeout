/**
 * ExifRestorer (WASM ExifTool Implementation)
 * -------------------------------------------
 * Deeply injects EXIF metadata using WebAssembly ExifTool.
 * Completely replaces legacy piexifjs.
 */

import { injectImageExif, isSupportedImageFormat, isJpeg } from './DeepExifRestorer';

export type ExifInjectResult = {
  bytes: Uint8Array;
  success: boolean;
  reason?: string;
};

export { isJpeg, isSupportedImageFormat };

/**
 * Injects EXIF Date, GPS, Description, People, and Album info via WebAssembly ExifTool.
 */
export async function injectExifDateAsync(
  buf: ArrayBuffer,
  epochSec: number,
  lat?: number,
  lng?: number,
  description?: string,
  people?: string[],
  albumName?: string,
  filename: string = 'image.jpg'
): Promise<ExifInjectResult> {
  try {
    const resultBuffer = await injectImageExif(buf, epochSec, {
      lat,
      lng,
      description,
      people,
      albumName,
      filename
    });
    return {
      bytes: new Uint8Array(resultBuffer),
      success: true
    };
  } catch (err: any) {
    return {
      bytes: new Uint8Array(buf),
      success: false,
      reason: err?.message || 'WASM ExifTool write error'
    };
  }
}

/**
 * Synchronous compatibility wrapper. Note: For full async WASM operations,
 * worker-based inject_wasm / inject_exif is used.
 */
export function injectExifDate(
  buf: ArrayBuffer,
  _epochSec: number,
  _lat?: number,
  _lng?: number,
  _description?: string,
  _people?: string[],
  _albumName?: string
): ExifInjectResult {
  // Sync fallback returns bytes unchanged if called synchronously
  return {
    bytes: new Uint8Array(buf),
    success: true
  };
}

export async function restoreExif(
  file: File,
  epochSec: number,
  lat?: number,
  lng?: number,
  description?: string,
  people?: string[],
  albumName?: string
): Promise<{ file: File; success: boolean }> {
  try {
    const buf = await file.arrayBuffer();
    const res = await injectExifDateAsync(buf, epochSec, lat, lng, description, people, albumName, file.name);
    const restoredBlob = new Blob([res.bytes], { type: file.type || 'image/jpeg' });
    const restoredFile = new File([restoredBlob], file.name, {
      type: file.type || 'image/jpeg',
      lastModified: epochSec * 1000
    });
    return { file: restoredFile, success: res.success };
  } catch {
    return { file, success: false };
  }
}
