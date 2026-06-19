# `src/services/ExifRestorer.ts`

Wraps `piexifjs` to read EXIF from a JPEG, merge in metadata extracted
from a Google Takeout JSON sidecar, and write the merged EXIF back into
the image bytes. Used by `ToolWorkspace.tsx` on the hot path.

## Why it exists

`piexifjs` is a small library that mutates JPEG buffers in place but
throws cryptic errors on a handful of edge cases (Snapchat-modified
JPEGs, non-standard EXIF segments, integer overflows). This module
isolates those quirks and provides a single `restoreExif(buffer, json)`
entry point that returns safe bytes — either the merged JPEG or the
original if anything went wrong.

## Public API

```ts
export function isJpeg(bytes: Uint8Array | ArrayBuffer): boolean
export function restoreExif(
  bytes: Uint8Array,
  sidecarJson: object | null,
): Promise<Uint8Array>     // returns either merged bytes or original
```

`isJpeg` checks the SOI marker (`FF D8`); cheap, called before
deserialising the full EXIF to avoid spurious errors on PNG/HEIC files
that share the `.jpg` extension by mistake.

## EXIF mapping

The sidecar JSON's GPS / dateTakenOriginal / creationTimestamp fields are
mapped to EXIF tags as follows (consult `piexifjs` for tag IDs):

| Sidecar field | EXIF tag |
|---|---|
| `photoTakenTime.timestamp` | `Exif.DateTimeOriginal` |
| `geoData.latitude` / `.longitude` | `GPS.GPSLatitude` / `.GPSLongitude` |
| `geoData.altitude` | `GPS.GPSAltitude` |
| `geoData.latitudeSpan` etc. | (currently dropped — refine before use) |

Unmapped fields are preserved by `piexif.dump`'s `exifObj` argument;
we pass through the full sidecar so future fields are absorbed.

## Failure handling

`piexifjs` can throw:

| Error message | Cause | Our response |
|---|---|---|
| `Cannot set property writable of #<cA> which has only a getter` | Snapchat / non-standard JPEG with read-only property descriptor | Wrap in try/catch, fall back to original bytes, log warning. **Without this fix the whole restore fails on the first Snapchat JPEG.** |
| `Invalid base64` | File is not a real JPEG (bad SOI/EOI) | Propagate; the caller should have used `isJpeg` first. |
| `Cannot read property '0' of undefined` | EXIF block present but empty | Catch and fall back to original. |

The fallback writes the original buffer to the output — **the file is
still saved**, just without updated EXIF. This is intentional: a user
with a 5 000-photo takeout that has one corrupt JPEG shouldn't lose the
whole run.

## Performance contract

- `restoreExif` is synchronous on the CPU side. The async signature
  exists so we can swap in a Worker later without changing the caller.
- Throughput target: ~50 JPEGs / second on a mid-range laptop. The
  bottleneck is `piexifjs`'s string-based EXIF serialisation, not us.
- No memory retention: the returned `Uint8Array` is a fresh buffer; the
  caller can null the input buffer and it will be collected.

## How to test

1. **Standard JPEG**: feed a JPEG + matching sidecar JSON; verify the
   output has the new `DateTimeOriginal` and GPS tags. Use `exiftool`
   or `piexif.load(output)` to inspect.
2. **Snapchat JPEG**: drop a Snapchat JPEG into the test folder with
   no JSON. Confirm `restoreExif` returns the original buffer and the
   worker logs a warning — **no exception bubbles up**.
3. **Non-JPEG**: feed a PNG with a `.jpg` extension. `isJpeg` should
   return `false` and the caller should skip `restoreExif` entirely.
4. **Empty sidecar**: feed `{ "": {} }` — should merge cleanly (no-op).

## Common mistakes to avoid

- ❌ Re-introducing `piexif.insert` / `piexif.dump` outside a try/catch
  to "clean up" the code. The writable-getter error is intermittent
  and the catch is what saves the run.
- ❌ Treating a `restoreExif` failure as a hard failure. The contract is
  "return safe bytes" — caller's responsibility is to write whatever
  comes back.
- ❌ Mutating the input `Uint8Array`. `piexifjs` mutates by reference;
  if you keep a copy of the input elsewhere it'll be silently changed.
