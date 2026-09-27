# Implementation Plan: Desktop App Redesign, Profile Overlay & Cloud-Synced Entitlements

## Overview
Transform the TakeoutFix native desktop Java application into a clean, tool-first utility. The app boots directly into the Photo Metadata Restorer (no landing dashboard). Clicking the top Profile Pill opens a non-destructive glassmorphic Profile Dashboard Modal featuring privacy email masking (`ra***l@domain.com` with an eye toggle), usage quotas, session history, and cloud actions. The app synchronizes restoration metrics to Firestore on pause, completion, and app close, queueing unsynced stats to disk when offline, and flushing them upon startup after re-authenticating with Google. Pro/Super features are dynamically soft-locked with upgrade prompts whenever cloud payments are toggled on.

## Architecture Decisions
1. **Tool-First Launch:** Switch the default launch card in `RecoveryCenterPanel` from `CARD_DASHBOARD` to `CARD_RESTORE`. Simplify `HeaderBar` by removing top tab buttons.
2. **Modal Over Full View Swap:** Implement `ProfileDashboardDialog` as a `JDialog` modal over the main frame, preserving all drag-and-drop file paths, options, and terminal logs underneath.
3. **Privacy by Default:** Mask user email (`ra***l@domain.com`) with a toggle button that automatically re-masks on blur or after 15 seconds.
4. **Offline-First Disk Queue:** Write unsynced files and bytes to `~/.takeoutfix/pending_sync.json` when network is unreachable on pause or close; drain this queue on startup after re-authenticating with Google.
5. **Dynamic Entitlement Gate:** Query Firestore `paymentsEnabled` switch. When false, unlock all tools. When true, enforce tier requirements (`free` vs `pro` vs `super`) using soft-lock upgrade cards.

## Task Breakdown

### Phase 1: Tool-First Default View & Header Cleanup
- **Task 1:** Make Photo Metadata Restorer the default launch view in `ApplicationStartupController` and `RecoveryCenterPanel`.
- **Task 2:** Clean up `HeaderBar` by removing top navigation tabs and converting `userPill` into an interactive clickable profile button.

### Checkpoint 1
- Verify application launches directly to `Photo Metadata Restorer` in 1200x800 resolution with clean header bar.

### Phase 2: Rich Profile Dashboard Modal & Email Masking
- **Task 3:** Create `ProfileDashboardDialog.java` with privacy-masked email (`ra***l@domain.com`), reveal eye toggle, plan badge, quota gauges, telemetry, and web links.
- **Task 4:** Wire `HeaderBar` profile pill click to open `ProfileDashboardDialog` without disturbing active tool state.

### Checkpoint 2
- Verify opening profile modal shows correct user info, masked email, and eye toggle works smoothly without closing or resetting the restorer underneath.

### Phase 3: Offline Queue & Google Re-Authentication / Pending Sync
- **Task 5:** Implement `pending_sync.json` persistence in `UserSyncBridgeService` / `FirebaseSyncService` on pause, stop, and close when offline.
- **Task 6:** Enhance startup sequence to re-check Google OAuth token, flush pending offline sync queue to Firestore, and update user quota.

### Checkpoint 3
- Verify that offline restoration counts accumulate to disk and automatically sync to Firestore upon opening with internet connection.

### Phase 4: Cloud-Synced Payment & Dynamic Tier Locking
- **Task 7:** Fetch cloud `paymentsEnabled` setting in `UserSyncBridgeService` and implement `isFeatureAllowed(feature)` checks.
- **Task 8:** Wire soft-lock upgrade cards in `RecoveryCenterPanel` for Pro/Super tools (EXIF, Compare, Duplicate, Volume Split) when payments are enabled.

### Checkpoint 4 (Final Verification)
- Run `mvn compile` and `mvn test` in `native/`.
- Verify full end-to-end flow with payments toggle ON and OFF.

## Risks & Mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| Transient network failure during close sync | High (lost progress) | Write to `~/.takeoutfix/pending_sync.json` synchronously before JVM terminates. |
| UI freeze while fetching payment toggle | Medium | Always fetch on background thread via `CompletableFuture` and update via `SwingUtilities.invokeLater`. |
| Screen recording email leak | Medium | Email is masked by default with 15s auto-remasking timeout. |
