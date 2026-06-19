# Architecture

High-level map of the TakeoutFix webapp. After reading this you should know
which file to open for any feature, and which layer (UI → page → service →
storage) a change belongs to.

---

## 1. One-paragraph summary

TakeoutFix is a single-page React-on-Astro webapp that runs entirely in the
browser. The user selects a Google Takeout **ZIP** or a **folder** via the
File System Access API; we stream-scan every JPEG and matching JSON sidecar,
extract EXIF / GPS / creation-date metadata, rename files to chronological
filenames, and write them back to a user-picked output folder. Per-user
quotas, payments, and admin actions live in Firestore; everything else
(file records, sessions, logs) lives in IndexedDB so we never round-trip a
200 MB takeout through the network.

## 2. Layered view

```
┌──────────────────────────────────────────────────────────────────────┐
│  Astro pages   (src/pages/*.astro)                                   │
│  • SSR shell, SEO meta, route layout                                 │
│  • Pass-through to React islands                                     │
└──────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│  React pages   (src/react-pages/*.tsx)                              │
│  • LandingPage, PricingPage, ToolWorkspace, Admin*, CheckoutPage    │
│  • Hold all user-facing state and side-effects                      │
└──────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Services / lib   (src/services/*, src/lib/*)                       │
│  • SessionManager — session + FileRecord lifecycle                   │
│  • indexedDbService — thin IDB wrapper                               │
│  • ExifRestorer / DeepExifRestorer — piexifjs wrappers              │
│  • MetadataMatcher / ZipMetadataMatcher — JSON sidecar pairing      │
│  • LicenseService — Firestore user-quota checks                      │
│  • PricingService — tier definitions, currency conversion           │
└──────────────────────────────────────────────────────────────────────┘
                                │
                ┌───────────────┼────────────────┐
                ▼               ▼                ▼
        ┌─────────────┐  ┌─────────────┐  ┌──────────────┐
        │ IndexedDB   │  │ Firestore   │  │ File System  │
        │ TakeoutFixDB│  │ (via        │  │ Access API   │
        │ v3          │  │  firebase)  │  │ (no upload)  │
        └─────────────┘  └─────────────┘  └──────────────┘
```

## 3. The processing pipeline (the heart of the app)

This is the hot path — what `ToolWorkspace.tsx` runs when the user clicks
"Start". Every other screen exists to support or configure it.

```
user picks ZIP or folder
        │
        ▼
SessionManager.createSession(source)         ┐
        │                                      │  scan phase
        ▼                                      │
scanAndRegister(onProgress)                    │
   • walks dir tree OR opens ZipReader         │
   • writes FileRecord rows to IDB in batches  │
   • returns { count, totalBytes }             ┘
        │
        ▼
revertInFlightFiles()              (handles "previous run was killed")
        │
        ▼
getPendingCount()                   ← O(1) via IDBIndex.count
        │
        ▼
┌─── page loop (PAGE_SIZE = 200) ───────────────────────────┐
│  while pending > 0:                                       │
│    page = getPendingFilesPage(offset, PAGE_SIZE)          │  cursor
│      ← ONLY this page is in memory, not all 8000 records  │  pagination
│    for each FileRecord in page:                           │
│      claimFile(id)                                        │
│      resolve handle(s)                                    │
│      restorer.restore(file)                               │  ExifRestorer
│      outputHandle.write(restoredBytes)                    │
│      confirmFile(id, 'completed', bytes, epoch)           │
│    yield to GC                                            │
└───────────────────────────────────────────────────────────┘
        │
        ▼
session.status = 'completed'
```

Full design rationale and the OOM bug that drove the rewrite are in
[`runbooks/aw-snap-oom-fix.md`](./runbooks/aw-snap-oom-fix.md).

## 4. Where data lives

| Data | Lives in | Why |
|---|---|---|
| `FileRecord` rows (id, path, handle, status, bytes) | IndexedDB `files` | Per-takeout; can be 10k+ rows; never needs server |
| `ActiveSession` (id, status, totals, outputHandle) | IndexedDB `sessions` | Survives reload mid-restore |
| `Telemetry` (durations, sizes) | IndexedDB `telemetry` | Buffered then batched to Sentry |
| `Checkpoints` (last completed batch id) | IndexedDB `checkpoints` | Resume support |
| User profile, plan, usedBytes/usedFiles | Firestore `users/{uid}` | Cross-device; admin visibility |
| Pricing tiers, active coupons | Firestore `config/*` | Cloudflare Function syncs from Dodo Payments |
| Admin actions, audit log | Firestore `admin_activity` | Compliance trail |
| Anonymous rate-limit counters | Firestore `rateLimits/{ip}` | Anti-abuse |

## 5. Failure model

| Failure | Recovery |
|---|---|
| User closes tab mid-run | On reload, `revertInFlightFiles()` flips any `processing` rows back to `pending`; counts recompute via `getPendingCount()`. |
| User revokes the output folder permission | Worker catches the `NotAllowedError`, asks user to re-grant, retries from the same checkpoint. |
| `piexifjs` throws on Snapchat JPEGs | `ExifRestorer` catches and falls back to writing the original buffer (no EXIF rewrite, file still saved). |
| Chrome renderer OOM on large takeouts | Cursor-paginated reads keep heap flat — see [`runbooks/aw-snap-oom-fix.md`](./runbooks/aw-snap-oom-fix.md). |
| Firestore quota / offline | License check fails closed (deny restore), but in-flight local writes continue. |
| ZIP entries with mismatched sidecars | `ZipMetadataMatcher` skips silently, counted as `unmatched`. |

## 6. File map (what to open for what)

| Want to change… | Open |
|---|---|
| UI / button / page layout | `src/react-pages/<Page>.tsx` or `src/components/*.tsx` |
| Add a new EXIF field to extract | `src/services/ExifRestorer.ts` (and `DeepExifRestorer.ts` if it needs HEIC) |
| Change how files are paired with JSON | `src/services/MetadataMatcher.ts` or `ZipMetadataMatcher.ts` |
| Change session or FileRecord shape | `src/lib/SessionManager.ts` **and** `src/lib/indexedDbService.ts` (bump dbVersion) — see [`runbooks/indexeddb-schema-migrations.md`](./runbooks/indexeddb-schema-migrations.md) |
| Change per-user limits | Firestore rules in `firestore.rules` + `src/services/LicenseService.ts` |
| Pricing / coupons | `src/services/PricingService.ts`, `functions/` |
| Add a new admin action | `src/react-pages/AdminUsers.tsx` (mirror to `AdminUserDashboard.tsx` if needed) |

## 7. Non-goals

- **No cloud upload of photos.** Takeouts can be tens of GB; all processing
  is local. Only metadata (counts, durations, plan) is sent to Firestore.
- **No background workers.** Everything runs on the main React thread; we
  keep it flat via small page sizes and GC yields rather than Web Workers.
- **No shared backend state for the restore.** Only the user's own browser
  knows which files have been written; even if we wanted cross-device resume,
  the output filesystem handle can't be serialised.
