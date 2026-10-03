import { injectWasmExif } from '../services/restoration/WasmExifRestorer';
import { injectMp4CreationTime, isVideoFilename } from '../services/restoration/VideoMetadataRestorer';

// Polyfill window & document in worker context for zeroperl WebAssembly
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

self.onmessage = async (e: MessageEvent) => {
  const { action, payload } = e.data || {};
  if (!action) return;

  if (action === 'inject_wasm' || action === 'inject_video' || action === 'inject_exif') {
    const { buffer, epochSec, lat, lng, filename, description, people, albumName, type } = payload;
    try {
      const isVideo = type === 'video' || (filename && isVideoFilename(filename));
      let resultBuffer: ArrayBuffer;

      if (isVideo) {
        // High-speed, zero-copy QuickTime mvhd/tkhd/mdhd container atom injection
        resultBuffer = injectMp4CreationTime(buffer, epochSec);
      } else {
        // Full-fidelity WebAssembly ExifTool injection for photos
        const u8 = new Uint8Array(buffer);
        const outU8 = await injectWasmExif(u8, epochSec, lat, lng, description, people, albumName, filename);
        resultBuffer = outU8.buffer;
      }

      // Transfer the buffer back to main thread with zero copy
      (self as any).postMessage(
        { success: true, buffer: resultBuffer, filename },
        [resultBuffer]
      );
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
