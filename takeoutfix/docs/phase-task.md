# MetaForge — Master Phase Checklist
> Two parallel tracks: **Track A** = User Website · **Track B** = Admin Ops Center
> Legend: `[x]` Done · `[/]` In Progress · `[ ]` Not Started

---

## Phase 0 — Foundation & Architecture
### Track A — User Website
- [x] React + TypeScript + Vite setup
- [x] Tailwind CSS + shadcn/ui
- [x] Framer Motion
- [x] Firebase (Auth + Firestore + Hosting)
- [x] React Router
- [x] Zustand (state management)
- [x] Core routing structure (`/`, `/pricing`, `/reviews`, `/support`, `/dashboard`, `/tool`, `/auth`)
- [x] Design System — Colors, Typography, Buttons, Cards
- [x] Design System — Modals, Tables, Charts, Toasts
- [x] `users/{uid}` Firestore document schema (uid, name, email, photoURL, role, plan, createdAt)

### Track B — Admin Ops Center
- [x] `/admin` route with isolated layout (no public navbar/footer)
- [x] `AdminSidebar` component
- [x] `AdminTopbar` component
- [x] `AdminProtectedRoute` guard (isAdmin check)
- [x] Role schema: `SUPER_ADMIN`, `ADMIN`, `SUPPORT`, `MODERATOR`
- [x] `admins/{uid}` Firestore collection
- [x] Firestore rules with role hierarchy

---

## Phase 1 — Landing Website
### Track A — User Website
- [x] Hero section ("Restore Metadata From Google Takeout")
- [x] Trust bar (Files Never Leave Device, No Cloud Processing, 99.99% Accuracy)
- [x] Problem section (Google Takeout separation issue)
- [x] Solution section (Before / After EXIF comparison)
- [x] How It Works preview (3-step flow diagram)
- [x] Reviews section (dynamic from Firestore)
- [x] Pricing preview (4 plans)
- [x] FAQ accordion
- [x] Footer (Privacy, Terms, Support links)
- [x] Realtime stats bar (Files Restored, TB Processed, Success Rate, Tickets Resolved)

### Track B — Admin Ops Center
- [x] Admin Dashboard skeleton
- [x] Sidebar nav: Dashboard, Users, Tickets, Revenue, Reviews, Statistics, Settings
- [x] Role-gated nav items (SUPPORT sees only Tickets, MODERATOR sees only Reviews, etc.)

---

## Phase 2 — Authentication & Roles
### Track A — User Website
- [x] Google Sign-In (Firebase Auth)
- [x] Firestore user document creation on first login
- [x] Role mapping (`isAdmin` flag)
- [x] Plan mapping (`free`, `recovery_pass`, `pro`, `super`)
- [x] "Admin Center" link in public navbar (admin-only)

### Track B — Admin Ops Center
- [x] Admin detection on login (checks `admins/{uid}` collection)
- [x] SUPER_ADMIN hardcoded bootstrap for `rahuljena.dev@gmail.com` + `rahuljenasonu@gmail.com`
- [x] "Open Website" button in admin sidebar
- [x] Admin role stored in `adminData` via `AuthContext`
- [x] Admin invite flow (SUPER_ADMIN can add new admins from `/admin/team` with email claiming on first login)

---

## Phase 3 — Dashboard System
### Track A — User Dashboard (`/dashboard`)
- [x] Free tier: Usage bar, Quota display, Upgrade CTA
- [x] Recovery Pass tier: Remaining capacity display
- [x] Pro tier: Unlimited badge + Recovery History placeholder
- [x] Super tier: Unlimited + No Ads badge
- [x] Feature gating (locked sections with upgrade prompts)
- [x] Dynamic quota pulled from `users/{uid}.usedBytes`

### Track B — Admin Dashboard (`/admin`)
- [x] Actionable KPI cards: Open Tickets, Pending Reviews, Revenue Today, Online Admins, Pro Users, Super Users
- [x] Online Admin presence cards with 🟢/🟡/⚫ status
- [x] Admin Activity Feed (from `admin_activity` collection)
- [x] Revenue chart placeholder (pending Stripe)
- [x] Greeting card with admin name + role

---

## Phase 4 — Workspace UI (Core Tool)
### Track A — User Website
- [x] Select Takeout Folder (File System Access API)
- [x] Select Output Folder
- [x] Scan phase (index files, find JSONs)
- [x] Process phase (match + inject EXIF)
- [x] Results screen (Matched, Recovered, Failed counts)
- [x] Upload screen with directory drag-and-drop UI
- [x] Scanning animation / progress screen
- [x] Processing progress screen with ETA + Files/s metric
- [x] Activity feed: "Found File", "Found JSON", "Recovered Metadata", "Injected EXIF"
- [x] Metrics panel: Matched, Recovered, Failed, ETA, Files/s

### Track B — Admin Ops Center
- [x] Tool Monitor page (`/admin/tool-monitor`)
- [x] Active Recoveries count (from `platform_stats`)
- [x] Failed Recoveries count
- [x] Completed Today count
- [x] Privacy-safe display (no file names, no GPS, no metadata shown)

---

## Phase 5 — Recovery Engine
### Track A — User Website
- [x] File matching logic (IMG.jpg ↔ IMG.jpg.json)
- [x] Metadata parser (parse Google JSON sidecars)
- [x] EXIF injection (write timestamps + GPS into binary)
- [x] Recovery logic (handle edge cases, renamed files)
- [x] Error handling UI (failed files report)
- [x] Worker optimization (Web Worker for non-blocking processing)

### Track B — Admin Ops Center
- [x] Recovery analytics page (`/admin/statistics`)
- [x] Success Rate chart
- [x] Failure Reasons breakdown
- [x] Recovery Trends over time

---

## Phase 6 — Subscription System
### Track A — User Website
- [x] Stripe Checkout integration (Simulated checkout portal inside app)
- [x] Stripe Webhook -> update `users/{uid}.plan` in Firestore
- [x] Usage tracking (increment `usedBytes` after each recovery)
- [x] Quota enforcement (block processing when limit hit on Free/Pass)
- [x] Purchase History section in Dashboard

### Track B — Admin Ops Center
- [x] Revenue Dashboard (`/admin/revenue`)
- [x] Cards: Today, This Week, This Month, Lifetime
- [x] Sales table by plan (Pass / Pro / Super)
- [x] Revenue charts (Sales Trends, Conversion Funnel)
- [x] Stripe data integration

---

## Phase 7 — Support System
### Track A — User Website
- [x] Support Widget (floating button, bottom-right)
- [x] Free tier: FAQ + Documentation only
- [x] Paid tier: Raise Ticket form → `tickets` Firestore collection
- [x] My Tickets list with status badges (OPEN / IN_PROGRESS / RESOLVED / CLOSED)
- [x] Priority badge for Pro ("Priority Queue") and Super ("Highest Priority")

### Track B — Admin Ops Center
- [x] Support Queue (`/admin/support`) — ticket data table
- [x] Filter by status (Open, In Progress, Resolved, Closed)
- [x] Update ticket status (dropdown action)
- [x] Full Ticket View (user info, message thread, admin reply, internal notes)
- [x] Assignment system (assign ticket to a SUPPORT admin)
- [x] Priority logic: Super=HIGH, Pro=MEDIUM, Pass=NORMAL

---

## Phase 8 — Reviews System
### Track A — User Website
- [x] Reviews page (`/reviews`) — shows approved reviews from Firestore
- [x] Submit Review form (signed-in users only, star picker + message)
- [x] Review submission → `status: PENDING` in Firestore
- [x] Admin Reply section displayed under each review
- [x] Featured reviews on Landing Page (pulled dynamically)

### Track B — Admin Ops Center
- [x] Reviews moderation page (`/admin/reviews`)
- [x] Approve / Reject actions
- [x] Admin reply input (stored as `adminReply` on review document)
- [x] Delete review permanently
- [x] "Feature on Homepage" toggle (sets `featured: true` on document)

---

## Phase 9 — Recovery History
### Track A — User Website
- [x] Recovery History page (Pro + Super only)
- [x] List: Date, Files, Duration, Success Rate
- [x] Search + Filter by date
- [x] Export as CSV

### Track B — Admin Ops Center
- [x] User Recovery Lookup (search by email/UID)
- [x] View: Total Recoveries, Plan, Usage, Last Active

---

## Phase 10 — Metadata Intelligence
### Track A — User Website (Super Only)
- [x] Metadata Viewer (Date, GPS, Camera, Album, People)
- [x] Before / After comparison panel
- [x] Duplicate Detection engine
- [x] Duplicate report: count + estimated space savings

### Track B — Admin Ops Center
- [x] Global Metadata Analytics (aggregate only, no individual data)
- [x] Recovery Statistics dashboard

---

## Phase 11 — Admin Operations Center (Full)
### Track B — Admin Ops Center
- [x] User Management table (`/admin/users`) — Name, Email, Plan, Processed, Status
- [x] Plan filter (Free, Pass, Pro, Super)
- [x] User detail view (click row → full user profile)
- [x] Upgrade/Downgrade Plan action
- [x] Suspend / Delete user action
- [x] Admin Team page (`/admin/team`) — role management
- [x] Online presence: 🟢 Online · 🟡 Idle · ⚫ Offline
- [x] Role change (SUPER_ADMIN only)
- [x] Remove admin (SUPER_ADMIN only)
- [x] Add new admin by email (SUPER_ADMIN only)
- [x] Admin Activity Feed stored in `admin_activity` collection
- [x] Notifications system (badge on bell icon)

---

## Phase 12 — Ads & Monetization
### Track A — User Website
- [x] AdBlock detection
- [x] Ad injection for Free tier
- [x] Ad injection for Recovery Pass tier
- [x] Ad injection for Pro tier
- [x] No ads for Super tier

### Track B — Admin Ops Center
- [x] Ads Manager page (`/admin/ads`)
- [x] Enable / Disable ads per tier toggle
- [x] Maintenance Banner toggle
- [x] Ad Provider status display

---

## Phase 13 — Settings & Feature Flags
### Track A — User Website
- [x] User Preferences page (Theme, Profile, Notifications)

### Track B — Admin Ops Center
- [x] Settings page (`/admin/settings`) — SUPER_ADMIN only
- [x] Pricing configuration (editable plan prices)
- [x] Maintenance Mode toggle
- [x] Feature Flags (enable/disable features globally)
- [x] Review Settings (auto-approve threshold, etc.)
- [x] Support SLA configuration

---

## Phase 14 — Audit & Security
### Track A — User Website
- [x] Session Management (view active sessions)
- [x] Security Logs (login history)

### Track B — Admin Ops Center
- [x] Audit Logs page (`/admin/audit`)
- [x] Log: Admin Login, Role Change, Revenue Action, Ticket Action, Settings Change
- [x] Filter by action type + date range
- [x] Export audit log as CSV

---

## Phase 15 — Production & Scaling
### Track A — User Website
- [x] Lighthouse score ≥ 95 (Performance, Accessibility, SEO)
- [x] Lazy loading (route-level code splitting)
- [x] Worker optimization (Web Worker tuning)
- [x] Error tracking (Sentry or Firebase Crashlytics)
- [x] Analytics (Firebase Analytics)
- [x] SEO meta tags on all public pages

### Track B — Admin Ops Center
- [x] Firestore query optimization (indexes, pagination)
- [x] Security rules final audit
- [x] Backup strategy for `users`, `tickets`, `admin_activity`
- [x] Admin monitoring (uptime alerts)
- [x] Permissions audit (verify all role gates work)

---

## Current Status Summary
| Phase | Track A | Track B |
|-------|---------|---------|
| Phase 0 — Foundation | ✅ Done | ✅ Done |
| Phase 1 — Landing | ✅ Done | ✅ Done |
| Phase 2 — Auth & Roles | ✅ Done | ✅ Done |
| Phase 3 — Dashboard | ✅ Done | ✅ Done |
| Phase 4 — Workspace UI | ✅ Done | ✅ Done |
| Phase 5 — Recovery Engine | ✅ Done | ✅ Done |
| Phase 6 — Subscriptions | ✅ Done | ✅ Done |
| Phase 7 — Support | ✅ Done | ✅ Done |
| Phase 8 — Reviews | ✅ Done | ✅ Done |
| Phase 9 — Recovery History | ✅ Done | ✅ Done |
| Phase 10 — Metadata Intelligence | ✅ Done | ✅ Done |
| Phase 11 — Admin Ops | ✅ Done | ✅ Done |
| Phase 12 — Ads | ✅ Done | ✅ Done |
| Phase 13 — Settings | ✅ Done | ✅ Done |
| Phase 14 — Audit & Security | ✅ Done | ✅ Done |
| Phase 15 — Production | ✅ Done | ✅ Done |
