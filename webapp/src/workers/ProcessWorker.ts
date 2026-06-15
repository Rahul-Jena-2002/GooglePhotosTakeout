import { injectExifDate } from '../services/ExifRestorer';
import { injectImageExif } from '../services/DeepExifRestorer';

self.onmessage = async (e: MessageEvent) => {
  const { action, payload } = e.data || {};
  if (!action) return;

  if (action === 'inject_exif') {
    const { buffer, epochSec, lat, lng, filename } = payload;
    try {
      let resultBuffer: ArrayBuffer;
      if (lat !== undefined && lng !== undefined) {
        // Perform CPU-heavy deep EXIF and GPS injection inside the worker thread
        resultBuffer = await injectImageExif(buffer, epochSec, lat, lng);
      } else {
        // Perform standard EXIF date-only injection
        const resultBytes = injectExifDate(buffer, epochSec);
        resultBuffer = resultBytes.buffer;
      }

      // Transfer the ownership of the resulting buffer back to the main thread
      (self as any).postMessage(
        { success: true, buffer: resultBuffer, filename },
        [resultBuffer]
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'EXIF Injection Error';
      console.error("Worker EXIF injection failed for file:", filename, err);
      // Transfer the original buffer back on error to avoid memory duplication
      (self as any).postMessage(
        { success: false, error: errMsg, buffer, filename },
        [buffer]
      );
    }
  }
};

