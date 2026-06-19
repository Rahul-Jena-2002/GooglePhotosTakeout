# Operations — Firebase / Firestore

The webapp uses Firebase for **Authentication**, **Firestore** (user
profiles, quotas, admin), and **Cloud Functions** (webhooks for
payments, sitemap generation). This doc covers how they wire together.

## High-level map

```
┌──────────────────────────────────────────────────────────────────────┐
│  webapp/src                                                         │
│    ├─ firebase.ts         ── initializeApp + Auth + Firestore        │
│    ├─ contexts/AuthContext ── useAuth() hook, signin / signout       │
│    └─ services/LicenseService ── per-user quota reads                │
└──────────────────────────────────────────────────────────────────────┘
                │
                ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Firestore (production project: takeoutfix-prod)                    │
│    ├─ users/{uid}          profile, plan, usedBytes, usedFiles      │
│    ├─ config/pricingTiers  active plans                              │
│    ├─ config/coupons       active coupon codes                       │
│    ├─ admin_activity       append-only audit trail                   │
│    └─ rateLimits/{ip}      anon rate-limit counters                  │
└──────────────────────────────────────────────────────────────────────┘
                ▲
                │
┌──────────────────────────────────────────────────────────────────────┐
│  functions/   Cloud Functions (Node 20)                             │
│    ├─ sync-coupon         Dodo webhook → coupon config              │
│    ├─ dynamic-pricing     USD ↔ JPY / CNY conversion                 │
│    └─ sitemap-generator   full SEO sitemap                          │
└──────────────────────────────────────────────────────────────────────┘
```

## Security rules

The single source of truth is `firestore.rules`. Read it before
adding any new collection or field. The short version:

- A user can read + write **only their own `users/{uid}` doc**.
- Pricing / coupons are public-read, write only via Cloud Function
  (admin SDK).
- `admin_activity` is append-only for admins; nobody reads except
  admin tooling.
- `rateLimits/{ip}` is read-only from the client.

## Local development with the emulator

```bash
firebase emulators:start --only auth,firestore
# in another shell:
cd webapp && npm run dev
# with VITE_USE_FIREBASE_EMULATOR=true in webapp/.env
```

## Deploying rules

```bash
firebase deploy --only firestore:rules
```

Always run a `firestore:rules:unit` test if you change the rules —
the test suite lives in `firestore.rules.test.ts`.

## Cloud Functions

```bash
cd functions
npm run build
firebase deploy --only functions
```

Cold-start budget is 10 s; the functions are intentionally
small to stay under that.

## Gotchas

- **`onAuthStateChanged` flakiness in dev**: the emulator auth state
  can be momentarily undefined. Use the `AuthContext`'s `loading`
  flag rather than relying on `user` being null.
- **Firestore offline persistence**: we deliberately do **not**
  enable it. The webapp's writes are bound to file-system handles
  that wouldn't survive a real offline replay.
- **Admin claims**: `user.isAdmin` is set via a custom claim in
  the Cloud Function, not editable from the client. The webapp
  reads the claim via `useAuth().user.isAdmin`.
