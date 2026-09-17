import { injectExifDate } from '../services/ExifRestorer';
import { injectImageExif } from '../services/DeepExifRestorer';
import { injectMp4CreationTime, isVideoFilename } from '../services/VideoMetadataRestorer';

self.onmessage = async (e: MessageEvent) => {
  const { action, payload } = e.data || {};
  if (!action) return;

  if (action === 'inject_exif' || action === 'inject_video') {
    const { buffer, epochSec, lat, lng, filename, description, people, albumName, type } = payload;
    try {
      const isVideo = type === 'video' || (filename && isVideoFilename(filename));

      if (isVideo) {
        // Direct in-memory MP4/MOV QuickTime atom injection
        const resultBuffer = injectMp4CreationTime(buffer, epochSec);
        (self as any).postMessage(
          { success: true, buffer: resultBuffer, filename },
          [resultBuffer]
        );
      } else if (lat !== undefined && lng !== undefined) {
        // Perform CPU-heavy deep EXIF and GPS injection inside the worker thread
        const resultBuffer: ArrayBuffer = await injectImageExif(buffer, epochSec, lat, lng, description, people, albumName);
        (self as any).postMessage(
          { success: true, buffer: resultBuffer, filename },
          [resultBuffer]
        );
      } else {
        // Standard EXIF date-only injection — returns {bytes, success, reason}
        const result = injectExifDate(buffer, epochSec, undefined, undefined, description, people, albumName);
        const resultBuffer = result.bytes.buffer as ArrayBuffer;
        (self as any).postMessage(
          { success: result.success, error: result.reason, buffer: resultBuffer, filename },
          [resultBuffer]
        );
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Metadata Injection Error';
      console.error("Worker metadata injection failed for file:", filename, err);
      // Transfer the original buffer back on error to avoid memory duplication
      (self as any).postMessage(
        { success: false, error: errMsg, buffer, filename },
        [buffer]
      );
    }
  }
};


