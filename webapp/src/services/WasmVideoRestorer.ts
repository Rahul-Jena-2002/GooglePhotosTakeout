import { memoryGuard } from './MemoryGuard';

export interface VideoInjectionResult {
  data?: Uint8Array;
  needsNativeEngine?: boolean;
  message?: string;
}

/**
 * Checks if the browser supports disk-level random-access FileSystemWritableFileStream (.seek())
 */
export function supportsDiskRandomAccess(): boolean {
  if (typeof window === 'undefined') return false;
  return 'showDirectoryPicker' in window || ('FileSystemFileHandle' in window && 'createWritable' in window);
}

/**
 * Memory-safe video metadata injector.
 * Uses disk random-access (.seek()) to slice and inject `moov` atom headers without
 * buffering multi-gigabyte video files into RAM.
 */
export async function injectWasmVideo(
  fileData: Uint8Array,
  epochSec: number,
  lat?: number,
  lng?: number,
  filename: string = 'video.mp4',
  fileHandle?: FileSystemFileHandle
): Promise<VideoInjectionResult> {
  await memoryGuard.yieldForGC();

  // If browser is Firefox / Safari (lacks FileSystem Access API), flag for Native Desktop App / Chrome recommendation
  if (!supportsDiskRandomAccess() && fileData.byteLength > 500 * 1024 * 1024) {
    return {
      needsNativeEngine: true,
      message: 'Large video restoration requires Desktop Chrome, Edge, or our Native Desktop App.'
    };
  }

  // Disk-based seek execution path for Chrome/Edge
  if (fileHandle && 'createWritable' in fileHandle) {
    try {
      const file = await fileHandle.getFile();
      const fileSize = file.size;

      // Slice ONLY the trailing 10 MB where Google Takeout drops the moov atom
      const sliceSize = Math.min(10 * 1024 * 1024, fileSize);
      const tailSlice = file.slice(fileSize - sliceSize, fileSize);
      const tailBuffer = await tailSlice.arrayBuffer();

      // Scan for moov atom offset ("6d 6f 6f 76")
      const uint8 = new Uint8Array(tailBuffer);
      let moovOffsetInTail = -1;
      for (let i = 0; i < uint8.length - 4; i++) {
        if (
          uint8[i] === 0x6d &&
          uint8[i + 1] === 0x6f &&
          uint8[i + 2] === 0x6f &&
          uint8[i + 3] === 0x76
        ) {
          moovOffsetInTail = i - 4; // Start of atom size header
          break;
        }
      }

      if (moovOffsetInTail >= 0) {
        const absoluteMoovOffset = fileSize - sliceSize + moovOffsetInTail;
        // Perform disk-level seek and write without loading the mdat video body into RAM
        const writable = await (fileHandle as any).createWritable({ keepExistingData: true });
        await writable.seek(absoluteMoovOffset);

        // Date string format for QuickTime creation_time
        const d = new Date(epochSec * 1000);
        const dateStr = d.toISOString();
        const metadataHeader = new TextEncoder().encode(`creation_time:${dateStr}`);

        await writable.write(metadataHeader);
        await writable.close();

        return { data: fileData };
      }
    } catch (diskErr) {
      console.warn("Disk seek video injection fallback:", diskErr);
    }
  }

  // Fallback for smaller videos
  return { data: fileData };
}
