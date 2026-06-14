import { injectExifDate } from '../services/ExifRestorer';

self.onmessage = async (e: MessageEvent) => {
  const { action, payload } = e.data || {};
  if (!action) return;

  if (action === 'inject_exif') {
    const { buffer, epochSec, filename } = payload;
    try {
      // Perform CPU-heavy EXIF injection inside the worker thread
      const resultBytes = injectExifDate(buffer, epochSec);
      const resultBuffer = resultBytes.buffer;

      // Transfer the ownership of the resulting buffer back to the main thread
      self.postMessage(
        { success: true, buffer: resultBuffer, filename },
        [resultBuffer]
      );
    } catch (err: any) {
      console.error("Worker EXIF injection failed for file:", filename, err);
      // Transfer the original buffer back on error to avoid memory duplication
      self.postMessage(
        { success: false, error: err.message || 'EXIF Injection Error', buffer, filename },
        [buffer]
      );
    }
  }
};
