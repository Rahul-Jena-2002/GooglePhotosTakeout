# Implementation Checklist: Desktop App Redesign & Sync

## Phase 1: Tool-First Default View & Header Simplification
- [x] **Task 1: Set Photo Metadata Restorer as Default View**
  - **Description:** Update `ApplicationStartupController` and `RecoveryCenterPanel` so the desktop app boots directly to `CARD_RESTORE` instead of `CARD_DASHBOARD`.
  - **Acceptance Criteria:**
    - App starts directly in the Metadata Restorer (Source, Destination, options, console).
    - Window dimensions default to 1200x800 with correct icon and theme.
  - **Verification:** `mvn test -Dtest=ApplicationStartupControllerTest`

- [x] **Task 2: Streamline HeaderBar Navigation**
  - **Description:** Remove redundant top `Dashboard` and `Restore` navigation tabs in `HeaderBar.java`. Make `userPill` an interactive hoverable button with hand cursor that triggers profile action.
  - **Acceptance Criteria:**
    - Top bar contains only Brand Logo + Version (left) and Update Banner + Theme Toggle + Online Status + Profile Pill (right).
    - User pill shows `Hi, <Name>`, Avatar initial, and pointer cursor on hover.
  - **Verification:** `mvn compile`

- [x] **Checkpoint 1: Tool-First Launch Verification**
  - `mvn compile` passes with 0 errors.

---

## Phase 2: Rich Profile Dashboard Modal & Email Masking
- [x] **Task 3: Build ProfileDashboardDialog Component**
  - **Description:** Create `ProfileDashboardDialog.java` implementing the full webapp profile/dashboard as a glassmorphic modal.
  - **Acceptance Criteria:**
    - Displays user Avatar, Display Name, and Masked Email (`ra***l@domain.com`).
    - Interactive Eye toggle button reveals/hides full email; auto-remasks on focus lost or 15s timeout.
    - Shows Plan badge (`FREE`, `PRO`, `SUPER`), files restored, bytes processed, and quota progress bar.
    - Includes Recent Recovery Sessions list, Host Hardware telemetry, "Open Web Dashboard" button, and "Sign Out" button.
  - **Verification:** Unit test dialog initialization and masking logic.

- [x] **Task 4: Wire Profile Pill to Open ProfileDashboardDialog**
  - **Description:** Add `MouseListener` to `userPill` in `HeaderBar.java` opening `ProfileDashboardDialog` as a modal centered on `mainFrame`.
  - **Acceptance Criteria:**
    - Clicking user pill opens the modal smoothly.
    - Tool state underneath (source path, destination, terminal) is 100% preserved.
  - **Verification:** `mvn compile`

- [x] **Checkpoint 2: Profile Modal Verification**
  - Dialog opens and closes cleanly without resetting the underlying tool.

---

## Phase 3: Offline Queue & Google Re-Authentication / Pending Sync
- [x] **Task 5: Implement Offline Pending Disk Queue**
  - **Description:** In `UserSyncBridgeService.java` and `FirebaseSyncService.java`, serialize unsynced files and bytes to `~/.takeoutfix/pending_sync.json` if network fails on pause, stop, or close.
  - **Acceptance Criteria:**
    - On pause or window close, if network is unreachable, delta files and bytes are appended to `pending_sync.json`.
    - If online, flushes directly to Firestore.
  - **Verification:** Unit test pending sync serialization and disk storage.

- [x] **Task 6: Startup Google Re-Authentication & Pending Queue Drain**
  - **Description:** In `ApplicationStartupController.java` and `FirebaseSyncService.java`, on startup re-check stored Google token with `securetoken.googleapis.com`. Once authenticated and online, read `pending_sync.json`, push pending deltas to Firestore `/users/{uid}`, and delete the local queue file.
  - **Acceptance Criteria:**
    - Startup validates Google token silently.
    - Drains `pending_sync.json` and updates cloud telemetry.
  - **Verification:** `mvn test`

- [x] **Checkpoint 3: Sync & Offline Recovery Verification**
  - `mvn test -Dtest=UserSyncBridgeServiceTest,SessionStatsServiceTest`

---

## Phase 4: Cloud-Synced Payment & Dynamic Tier Locking
- [x] **Task 7: Cloud Payment Toggle & Entitlement Engine**
  - **Description:** In `UserSyncBridgeService.java`, fetch `settings/payment-gateway` or `settings/monetization` to determine `paymentsEnabled`. Implement `isFeatureAllowed(String feature)` checking plan tier vs requirements.
  - **Acceptance Criteria:**
    - If `paymentsEnabled == false`, `isFeatureAllowed` returns `true` for all features.
    - If `paymentsEnabled == true`, validates plan (`free` vs `pro` vs `super`).
  - **Verification:** Unit test entitlement logic with payments enabled and disabled.

- [x] **Task 8: Wire Tier Soft-Locks in RecoveryCenterPanel**
  - **Description:** In `RecoveryCenterPanel.java`, check `isFeatureAllowed` when user selects EXIF Viewer, Archive Compare, Duplicate Finder, or 2GB Volume Splitting. If locked, render an aesthetic Pro/Super feature preview card with an "Upgrade Plan" button opening `takeoutfix.pages.dev/pricing`.
  - **Acceptance Criteria:**
    - Unlocked seamlessly when payments are disabled.
    - Clean upgrade cards when payments are enabled and user is free.
    - No crashes, layout shifts, or glitches.
  - **Verification:** `mvn compile` and manual verification.

- [x] **Checkpoint 4: Final Quality & Build Gate**
  - `mvn clean compile test` in `native/` passes with 0 errors.
