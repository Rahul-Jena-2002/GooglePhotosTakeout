# webapp/ Documentation

Reference documentation for the TakeoutFix webapp (Astro + React + Firebase frontend).

This index is the starting point. Read top-to-bottom on first contact, or jump straight to the file you need.

---

## Architecture

| File | Purpose |
|---|---|
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | High-level component map, request lifecycles, data flow, where IndexedDB / Firestore / Sentry fit in. **Read this first if you're new.** |

## Modules — deep dives

Each module doc explains the public API, internal data shapes, performance characteristics, and known gotchas. Every doc ends with a "How to test" section so a new dev can validate changes without guesswork.

| Module | Doc |
|---|---|
| `src/lib/indexedDbService.ts` | [`modules/indexed-db-service.md`](./modules/indexed-db-service.md) |
| `src/lib/SessionManager.ts` | [`modules/session-manager.md`](./modules/session-manager.md) |
| `src/react-pages/ToolWorkspace.tsx` | [`modules/tool-workspace.md`](./modules/tool-workspace.md) |
| `src/services/ExifRestorer.ts` | [`modules/exif-restorer.md`](./modules/exif-restorer.md) |
| `src/services/DeepExifRestorer.ts` | [`modules/deep-exif-restorer.md`](./modules/deep-exif-restorer.md) |

## Runbooks / patterns

| Topic | Doc |
|---|---|
| Why the app was hitting Chrome "Aw Snap" and how we fixed it | [`runbooks/aw-snap-oom-fix.md`](./runbooks/aw-snap-oom-fix.md) |
| IndexedDB version-upgrade pattern (how to add fields safely) | [`runbooks/indexeddb-schema-migrations.md`](./runbooks/indexeddb-schema-migrations.md) |
| Cursor-paginated reads from IndexedDB (copy-paste template) | [`runbooks/idb-cursor-pagination.md`](./runbooks/idb-cursor-pagination.md) |
| Memory hygiene checklist for large-file browser workloads | [`runbooks/memory-hygiene.md`](./runbooks/memory-hygiene.md) |
| **UI optimisation playbook** (React hygiene, bundle, images, animations) | [`runbooks/ui-optimization.md`](./runbooks/ui-optimization.md) |

## Decisions

| Topic | Doc |
|---|---|
| **Why we stay on Cloudflare Pages + Firebase (not Spring Boot / SSR)** | [`stack-decision.md`](./stack-decision.md) |

## Operations

| Topic | Doc |
|---|---|
| Local dev, build, deploy | [`operations/local-dev.md`](./operations/local-dev.md) |
| Firebase / Firestore rules and wiring | [`operations/firebase.md`](./operations/firebase.md) |
| Sentry / observability | [`operations/sentry.md`](./operations/sentry.md) |

## Changelog & Recaps

| Topic | Doc |
|---|---|
| Recent material changes to the webapp | [`CHANGELOG.md`](./CHANGELOG.md) |
| Quick project development recap | [`RECAP.md`](./RECAP.md) |

---

## How this docs set is organised

1. **ARCHITECTURE.md** — *what* the system is, drawn at a coarse grain. One diagram, one paragraph per component. Start here.
2. **modules/*.md** — *how* each module works. Public API, internal types, performance, gotchas, "how to test."
3. **runbooks/*.md** — *why* and *when* to apply a specific technique. Reusable patterns, not tied to a single module.
4. **operations/*.md** — *how to run* the app locally and ship to prod.

Docs are kept in lockstep with the code. When you change a module, update its doc in the same PR. When you discover a non-obvious behaviour, add a "Gotcha" section rather than burying it in chat.
