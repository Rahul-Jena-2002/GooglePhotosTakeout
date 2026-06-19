# `src/services/DeepExifRestorer.ts`

Second-pass EXIF restorer that uses *content* (perceptual hash,
file-stem hints, neighbouring JSON filenames) rather than filename
matching to find the right sidecar for orphaned JPEGs. Slower than
[`ExifRestorer`](./exif-restorer.md) — only run on the unmatched tail.

## Why it exists

After the first pass through `ExifRestorer` + `MetadataMatcher`, a
typical takeout leaves ~5–15% of JPEGs unmatched (Google's naming is
not deterministic across years / devices). `DeepExifRestorer` exists to
recover a chunk of those by looking at content signatures.

## Public API

```ts
export interface DeepMatch {
  jpegHandle: FileSystemFileHandle;
  jsonObject: SidecarJson;
  confidence: number;          // 0..1
  strategy: 'phash' | 'stem-hint' | 'time-window' | 'neighbour';
}

export async function deepMatchSidecars(
  jpegs: FileSystemFileHandle[],
  jsons: SidecarJson[],
  opts?: { phashThreshold?: number; timeWindowMs?: number }
): Promise<DeepMatch[]>
```

Returns only the matches that exceed the configured confidence
threshold; everything else is left unmatched and counted in
`unmatchedCount`.

## Strategies (in priority order)

1. **pHash** — compute a perceptual hash of the JPEG (downsampled DCT),
   compare to hashes of decoded JPEG thumbnails extracted from the JSON
   `thumbnail` field. Match if Hamming distance ≤ `phashThreshold`
   (default 8 of 64).
2. **Stem hint** — strip the trailing `.json(-supplemental-*.json)`
   variants and any trailing counters, compare stems.
3. **Time window** — if no JSON references the same JPEG explicitly,
   take the nearest-in-time JSON within `timeWindowMs` (default 60 s)
   as a candidate. Confidence is low; only used as a last resort.
4. **Neighbour** — if the JPEG lives in the same album folder as a JSON
   that references another JPEG with the same device serial, infer the
   sidecar by device. Pure heuristic; very low confidence.

## Failure handling

Same set of error paths as `ExifRestorer` — the underlying
`piexifjs` work is identical, and the same writable-getter error can
fire on Snapchat JPEGs. The same try/catch + fallback-to-original
pattern is used.

## Performance contract

- **Slow**: pHash on a 4000×3000 JPEG takes ~80 ms in JS. The function
  is parallelised via `Promise.all` over batches of 50 JPEGs.
- **Only run on unmatched tail** — never on the full takeout. The
  caller in `ToolWorkspace.tsx` should branch on
  `unmatchedCount > 0` before invoking this.
- **Memory**: JPEG pixel buffers are decoded, downsampled, discarded
  per call. Total peak is bounded by `batchSize × 4 × 100×100` floats.

## How to test

1. **Orphaned JPEG**: drop a JPEG whose sidecar JSON has been renamed
   (e.g. `IMG_0001.jpg` + `IMG_0001-edited.jpg.supplemental.json`).
   Expect a stem-hint match with confidence ~0.7.
2. **Snapchat batch**: feed 50 Snapchat JPEGs with no JSON. Expect 0
   matches, no exceptions.
3. **Time window**: simulate an off-by-30s clock skew between JPEG
   EXIF and JSON timestamp. Should match at low confidence.
4. **Empty inputs**: pass `[]` for both — should return `[]`, no error.

## Common mistakes to avoid

- ❌ Calling `deepMatchSidecars` on the entire takeout upfront. It's
  reserved for the unmatched tail, by design.
- ❌ Trusting low-confidence matches. The caller should treat anything
  below 0.5 as "still unmatched" and not write the sidecar metadata.
- ❌ Using the same try/catch strategy as `ExifRestorer` would be fine
  here too — but make sure it's actually present. The earlier version
  of this module lacked the catch and a single bad JPEG would abort
  the deep-match pass.
