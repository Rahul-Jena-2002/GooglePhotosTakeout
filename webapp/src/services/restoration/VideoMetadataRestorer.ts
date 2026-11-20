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
    throw new Error('Video is too short to contain supported metadata.');
  }

  // Calculate QuickTime timestamp (clamped to positive 32-bit/64-bit uint)
  const qtTimestamp = Math.max(0, epochSec + QUICKTIME_EPOCH_OFFSET);

  // Work on a copy of the buffer so we don't mutate external memory unexpectedly
  const copy = buffer.slice(0);
  const view = new DataView(copy);
  const length = copy.byteLength;

  let updated = false;
  try {
    // Top-level box scanning
    let offset = 0;
    while (offset + 8 <= length) {
      let boxSize = view.getUint32(offset, false); // big-endian
      const boxType = getBoxType(view, offset + 4);
      let headerSize = 8;

      if (boxSize === 1) {
        // 64-bit extended size
        if (offset + 16 > length) break;
        const high = view.getUint32(offset + 8, false);
        const low = view.getUint32(offset + 12, false);
        boxSize = high * 0x100000000 + low;
        headerSize = 16;
      } else if (boxSize === 0) {
        // Box extends to end of file
        boxSize = length - offset;
      }

      if (boxSize < headerSize || offset + boxSize > length) break;

      if (boxType === 'moov') {
        // moov atom contains mvhd and trak boxes
        updated = processMoovBox(view, offset + headerSize, offset + boxSize, qtTimestamp);
        break; // Once moov is processed, we are done
      }

      offset += boxSize;
    }
  } catch (err) {
    throw new Error('Could not update video timestamps.', { cause: err });
  }

  if (!updated) throw new Error('No supported video timestamp was found.');
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

function processMoovBox(view: DataView, start: number, end: number, qtTimestamp: number): boolean {
  let offset = start;
  let updated = false;
  const maxEnd = Math.min(end, view.byteLength);

  while (offset + 8 <= maxEnd) {
    let boxSize = view.getUint32(offset, false);
    const boxType = getBoxType(view, offset + 4);
    let headerSize = 8;

    if (boxSize === 1) {
      if (offset + 16 > maxEnd) break;
      const high = view.getUint32(offset + 8, false);
      const low = view.getUint32(offset + 12, false);
      boxSize = high * 0x100000000 + low;
      headerSize = 16;
    } else if (boxSize === 0) {
      boxSize = maxEnd - offset;
    }

    if (boxSize < headerSize || offset + boxSize > maxEnd) break;

    const boxContentStart = offset + headerSize;

    if (boxType === 'mvhd') {
      updated = updateHeaderBoxTimestamp(view, boxContentStart, offset + boxSize, qtTimestamp) || updated;
    } else if (boxType === 'trak') {
      updated = processTrakBox(view, boxContentStart, offset + boxSize, qtTimestamp) || updated;
    }

    offset += boxSize;
  }
  return updated;
}

function processTrakBox(view: DataView, start: number, end: number, qtTimestamp: number): boolean {
  let offset = start;
  let updated = false;
  const maxEnd = Math.min(end, view.byteLength);

  while (offset + 8 <= maxEnd) {
    let boxSize = view.getUint32(offset, false);
    const boxType = getBoxType(view, offset + 4);
    let headerSize = 8;

    if (boxSize === 1) {
      if (offset + 16 > maxEnd) break;
      const high = view.getUint32(offset + 8, false);
      const low = view.getUint32(offset + 12, false);
      boxSize = high * 0x100000000 + low;
      headerSize = 16;
    } else if (boxSize === 0) {
      boxSize = maxEnd - offset;
    }

    if (boxSize < headerSize || offset + boxSize > maxEnd) break;

    const boxContentStart = offset + headerSize;

    if (boxType === 'tkhd') {
      updated = updateHeaderBoxTimestamp(view, boxContentStart, offset + boxSize, qtTimestamp) || updated;
    } else if (boxType === 'mdia') {
      updated = processMdiaBox(view, boxContentStart, offset + boxSize, qtTimestamp) || updated;
    }

    offset += boxSize;
  }
  return updated;
}

function processMdiaBox(view: DataView, start: number, end: number, qtTimestamp: number): boolean {
  let offset = start;
  let updated = false;
  const maxEnd = Math.min(end, view.byteLength);

  while (offset + 8 <= maxEnd) {
    let boxSize = view.getUint32(offset, false);
    const boxType = getBoxType(view, offset + 4);
    let headerSize = 8;

    if (boxSize === 1) {
      if (offset + 16 > maxEnd) break;
      const high = view.getUint32(offset + 8, false);
      const low = view.getUint32(offset + 12, false);
      boxSize = high * 0x100000000 + low;
      headerSize = 16;
    } else if (boxSize === 0) {
      boxSize = maxEnd - offset;
    }

    if (boxSize < headerSize || offset + boxSize > maxEnd) break;

    const boxContentStart = offset + headerSize;

    if (boxType === 'mdhd') {
      updated = updateHeaderBoxTimestamp(view, boxContentStart, offset + boxSize, qtTimestamp) || updated;
    }

    offset += boxSize;
  }
  return updated;
}

function updateHeaderBoxTimestamp(view: DataView, contentStart: number, boxEnd: number, qtTimestamp: number): boolean {
  if (contentStart + 12 > boxEnd) return false;

  const version = view.getUint8(contentStart);

  if (version === 0) {
    if (!Number.isFinite(qtTimestamp) || qtTimestamp > 0xffffffff) {
      throw new Error('Video timestamp is outside the range supported by this file.');
    }
    view.setUint32(contentStart + 4, qtTimestamp >>> 0, false);
    view.setUint32(contentStart + 8, qtTimestamp >>> 0, false);
    return true;
  } else if (version === 1) {
    if (contentStart + 20 > boxEnd || !Number.isSafeInteger(qtTimestamp)) return false;
    const high = Math.floor(qtTimestamp / 0x100000000);
    const low = qtTimestamp >>> 0;

    view.setUint32(contentStart + 4, high, false);
    view.setUint32(contentStart + 8, low, false);

    view.setUint32(contentStart + 12, high, false);
    view.setUint32(contentStart + 16, low, false);
    return true;
  }
  return false;
}

export function isVideoFilename(filename: string): boolean {
  return /\.(mp4|mov|m4v)$/i.test(filename);
}
