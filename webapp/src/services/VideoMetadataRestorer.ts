/**
 * VideoMetadataRestorer
 * ---------------------
 * In-memory ISO Base Media File Format (ISOBMFF) atom parser and timestamp injector
 * for MP4, MOV, and M4V video containers.
 *
 * Injects the QuickTime/MP4 creation time into:
 *  - mvhd (Movie Header atom)
 *  - tkhd (Track Header atom, for all tracks)
 *  - mdhd (Media Header atom, for all media)
 *
 * This allows Windows Explorer (Details -> "Media created"), Apple Photos, Google Photos,
 * and media players to accurately read and display the restored creation date.
 */

// Seconds between 1904-01-01 00:00:00 UTC (Mac/QuickTime epoch) and 1970-01-01 00:00:00 UTC (Unix epoch)
const QUICKTIME_EPOCH_OFFSET = 2082844800;

/**
 * Injects creation and modification timestamp into an MP4/MOV ArrayBuffer.
 * Returns a new ArrayBuffer (or modifies in place via Uint8Array/DataView) with updated atoms.
 */
export function injectMp4CreationTime(buffer: ArrayBuffer, epochSec: number): ArrayBuffer {
  if (!buffer || buffer.byteLength < 16) {
    return buffer;
  }

  // Calculate QuickTime timestamp (clamped to positive 32-bit/64-bit uint)
  const qtTimestamp = Math.max(0, epochSec + QUICKTIME_EPOCH_OFFSET);

  // Work on a copy of the buffer so we don't mutate external memory unexpectedly
  const copy = buffer.slice(0);
  const view = new DataView(copy);
  const length = copy.byteLength;

  try {
    // Top-level box scanning
    let offset = 0;
    while (offset + 8 <= length) {
      let boxSize = view.getUint32(offset, false); // big-endian
      const boxType = getBoxType(view, offset + 4);

      if (boxSize === 1) {
        // 64-bit extended size
        if (offset + 16 > length) break;
        const high = view.getUint32(offset + 8, false);
        const low = view.getUint32(offset + 12, false);
        boxSize = high * 0x100000000 + low;
        if (boxSize <= 0) break;
      } else if (boxSize === 0) {
        // Box extends to end of file
        boxSize = length - offset;
      }

      if (boxSize < 8) break;

      if (boxType === 'moov') {
        // moov atom contains mvhd and trak boxes
        processMoovBox(view, offset + 8, offset + boxSize, qtTimestamp);
        break; // Once moov is processed, we are done
      }

      offset += boxSize;
    }
  } catch (err) {
    console.warn("[VideoMetadataRestorer] MP4 atom scan warning:", err);
  }

  return copy;
}

function getBoxType(view: DataView, offset: number): string {
  if (offset + 4 > view.byteLength) return '';
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3)
  );
}

function processMoovBox(view: DataView, start: number, end: number, qtTimestamp: number) {
  let offset = start;
  const maxEnd = Math.min(end, view.byteLength);

  while (offset + 8 <= maxEnd) {
    let boxSize = view.getUint32(offset, false);
    const boxType = getBoxType(view, offset + 4);

    if (boxSize === 1) {
      if (offset + 16 > maxEnd) break;
      const high = view.getUint32(offset + 8, false);
      const low = view.getUint32(offset + 12, false);
      boxSize = high * 0x100000000 + low;
    } else if (boxSize === 0) {
      boxSize = maxEnd - offset;
    }

    if (boxSize < 8 || offset + boxSize > maxEnd) break;

    const boxContentStart = offset + 8;

    if (boxType === 'mvhd') {
      updateHeaderBoxTimestamp(view, boxContentStart, qtTimestamp);
    } else if (boxType === 'trak') {
      processTrakBox(view, boxContentStart, offset + boxSize, qtTimestamp);
    }

    offset += boxSize;
  }
}

function processTrakBox(view: DataView, start: number, end: number, qtTimestamp: number) {
  let offset = start;
  const maxEnd = Math.min(end, view.byteLength);

  while (offset + 8 <= maxEnd) {
    let boxSize = view.getUint32(offset, false);
    const boxType = getBoxType(view, offset + 4);

    if (boxSize === 1) {
      if (offset + 16 > maxEnd) break;
      const high = view.getUint32(offset + 8, false);
      const low = view.getUint32(offset + 12, false);
      boxSize = high * 0x100000000 + low;
    } else if (boxSize === 0) {
      boxSize = maxEnd - offset;
    }

    if (boxSize < 8 || offset + boxSize > maxEnd) break;

    const boxContentStart = offset + 8;

    if (boxType === 'tkhd') {
      updateHeaderBoxTimestamp(view, boxContentStart, qtTimestamp);
    } else if (boxType === 'mdia') {
      processMdiaBox(view, boxContentStart, offset + boxSize, qtTimestamp);
    }

    offset += boxSize;
  }
}

function processMdiaBox(view: DataView, start: number, end: number, qtTimestamp: number) {
  let offset = start;
  const maxEnd = Math.min(end, view.byteLength);

  while (offset + 8 <= maxEnd) {
    let boxSize = view.getUint32(offset, false);
    const boxType = getBoxType(view, offset + 4);

    if (boxSize === 1) {
      if (offset + 16 > maxEnd) break;
      const high = view.getUint32(offset + 8, false);
      const low = view.getUint32(offset + 12, false);
      boxSize = high * 0x100000000 + low;
    } else if (boxSize === 0) {
      boxSize = maxEnd - offset;
    }

    if (boxSize < 8 || offset + boxSize > maxEnd) break;

    const boxContentStart = offset + 8;

    if (boxType === 'mdhd') {
      updateHeaderBoxTimestamp(view, boxContentStart, qtTimestamp);
    }

    offset += boxSize;
  }
}

function updateHeaderBoxTimestamp(view: DataView, contentStart: number, qtTimestamp: number) {
  if (contentStart + 12 > view.byteLength) return;

  const version = view.getUint8(contentStart);

  if (version === 0) {
    view.setUint32(contentStart + 4, qtTimestamp >>> 0, false);
    view.setUint32(contentStart + 8, qtTimestamp >>> 0, false);
  } else if (version === 1) {
    if (contentStart + 20 > view.byteLength) return;
    const high = Math.floor(qtTimestamp / 0x100000000);
    const low = qtTimestamp >>> 0;

    view.setUint32(contentStart + 4, high, false);
    view.setUint32(contentStart + 8, low, false);

    view.setUint32(contentStart + 12, high, false);
    view.setUint32(contentStart + 16, low, false);
  }
}

export function isVideoFilename(filename: string): boolean {
  return /\.(mp4|mov|m4v)$/i.test(filename);
}
