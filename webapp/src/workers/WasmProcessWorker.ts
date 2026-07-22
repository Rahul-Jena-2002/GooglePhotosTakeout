import { injectWasmExif } from '../services/WasmExifRestorer';
import { injectWasmVideo } from '../services/WasmVideoRestorer';

self.onmessage = async (e: MessageEvent) => {
  const { action, payload } = e.data || {};
  if (!action) return;

  if (action === 'inject_wasm') {
    const { buffer, epochSec, lat, lng, filename, description, people, albumName, type, fileHandle } = payload;
    try {
      let resultBuffer: ArrayBuffer;
      const u8 = new Uint8Array(buffer);

      if (type === 'video') {
        const res = await injectWasmVideo(u8, epochSec, lat, lng, filename, fileHandle);
        if (res.needsNativeEngine) {
          (self as any).postMessage({
            success: false,
            needsNativeEngine: true,
            message: res.message || 'Video processing requires Chrome or Edge, or use our Native App',
            filename
          });
          return;
        }
        resultBuffer = res.data ? res.data.buffer : buffer;
      } else {
        const outU8 = await injectWasmExif(u8, epochSec, lat, lng, description, people, albumName, filename);
        resultBuffer = outU8.buffer;
      }

      (self as any).postMessage(
        { success: true, buffer: resultBuffer, filename },
        [resultBuffer]
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'WASM Injection Error';
      console.error("WASM worker failed for file:", filename, err);
      // Transfer the original buffer back on error to avoid memory duplication
      (self as any).postMessage(
        { success: false, error: errMsg, buffer, filename },
        [buffer]
      );
    }
  }
};
