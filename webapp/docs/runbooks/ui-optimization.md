# UI Optimization Playbook

**Audience:** anyone touching the webapp's React UI, especially
`src/components/`, `src/react-pages/`, and `src/layouts/`.

**Goal:** make every page feel instant, keep the JS bundle small,
and never re-render what doesn't need to re-render — without
changing the user's experience.

**Stack context (current):** Astro 6 (static, `output: 'static'`) +
React islands + Tailwind + Firebase (Auth + Firestore) + framer-motion
+ lucide-react. Hosted on Cloudflare Pages. This is a sensible
default for a marketing site with a few interactive surfaces
(`/tool`, `/dashboard`, `/admin/*`). We do **not** need SSR
(Kubernetes, Spring Boot, etc.) because the actual work happens in
the browser. **Recommendation: stay on this stack** — see
[`stack-decision.md`](../stack-decision.md) for the full rationale.

---

## Contents

1. [What's already done (audit)](#1-whats-already-done-audit)
2. [What's still on the table](#2-whats-still-on-the-table)
3. [React re-render hygiene](#3-react-re-render-hygiene)
4. [Bundle size](#4-bundle-size)
5. [Images and assets](#5-images-and-assets)
6. [CSS / Tailwind](#6-css--tailwind)
7. [Network and caching](#7-network-and-caching)
8. [Animation performance](#8-animation-performance)
9. [Forms and inputs](#9-forms-and-inputs)
10. [The expensive pages: `/tool`, `/admin/*`](#10-the-expensive-pages-tool-admin)
11. [Measuring: what to watch](#11-measuring-what-to-watch)
12. [Per-PR checklist](#12-per-pr-checklist)

---

## 1. What's already done (audit)

This is a faithful audit of the codebase as it stands — what's in
place, what works, and what we shouldn't undo.

### 1.1 Fonts (good)

`Layout.astro` already:
- preloads the hero image with `fetchpriority="high"`
- loads Google Fonts **async non-render-blocking** with
  `media="print" onload="this.media='all'"`
- declares an `Inter Fallback` `@font-face` with `ascent-override`,
  `descent-override`, `line-gap-override`, `size-adjust` to
  prevent FOUT-induced layout shift

→ **CLS = 0 for fonts.** Don't reintroduce a render-blocking
`<link rel="stylesheet">` to Google Fonts. Don't drop the
`@font-face` fallback. Both regress LCP and CLS.

### 1.2 LCP image (good)

`<link rel="preload" as="image" href="/hero-graphic-light.webp"
fetchpriority="high">` is in `Layout.astro`. The hero is
pre-decoded in parallel with the JS bundle.

### 1.3 Astro static output + islands (good)

`output: 'static'` means the marketing pages
(`/`, `/pricing`, `/reviews`, `/support`, `/privacy`, `/terms`,
`/restore-data`, `/takeout-fix`, `/takeout-fixer`,
`/metadata-fixer`, `/google-photos-metadata-fix`,
`/google-takeout-merger`) ship as **plain HTML with zero React**
on the first paint. React hydrates only the `client:*` islands
on `/tool`, `/dashboard`, `/profile`, `/checkout`, `/admin/*`.

→ Don't move shared components (e.g. `MainLayout`, footer,
nav) into a single hydrated island. Keep the chrome on the
Astro side and let the page-level React tree do its work.

### 1.4 Firebase Auth state subscription (one listener only)

`AuthContext.tsx` subscribes once at the provider level. All
`useAuth()` consumers read from the same context, no duplicate
listeners.

### 1.5 Tailwind with `applyBaseStyles: false` (good)

`@astrojs/tailwind` is configured with `applyBaseStyles: false`,
so Tailwind doesn't ship a reset stylesheet. Good. Just make sure
`src/index.css` doesn't pull in the full preflight.

### 1.6 Sentry (acceptable)

`sentry.client.config.js` initialises Sentry. With
`sendDefaultPii: false` and a 10% trace sample, the runtime
overhead is small. **Do not** initialise Sentry per-component
or per-render.

### 1.7 IndexedDB cursor pagination (great)

The `ToolWorkspace` page no longer OOMs on 8 000+ file takeouts.
See [`runbooks/aw-snap-oom-fix.md`](../runbooks/aw-snap-oom-fix.md).
Keep that fix in place.

### What's missing or weak

These are the things in this audit that **aren't** done yet and
should be:

- The `MainLayout` component is a 576-line file with three
  click-outside listeners, two onSnapshot listeners, theme
  bootstrap, and the entire nav tree, all in one render scope.
  Every `setNotifications` (or any other state change) re-renders
  the whole nav.
- The `LandingPage` uses `framer-motion`'s `motion.div` for
  several sections and pulls the **entire** `framer-motion`
  library on first paint. There's no code-split for it.
- `lucide-react` is imported as named imports — bundlers should
  tree-shake, but the dynamic barrel cost is real in
  development.
- `AdUnit`, `AdBlockGate`, and `SupportWidget` are loaded
  synchronously even on the marketing pages, where ads don't
  need to paint before the LCP image.
- No route-level code splitting. The whole React tree for
  `/tool` and `/admin/*` is in the same bundle.
- `firebase/firestore` is imported eagerly in pages that only
  need Auth (e.g. footer links in `MainLayout`).

---

## 2. What's still on the table

| Lever | Estimated win | Effort | When to apply |
|---|---|---|---|
| Lazy-load Firebase Firestore modules | -80 KB gz on landing | 1 h | Now |
| Lazy-load `framer-motion` to `/tool` and `/admin` only | -40 KB gz on landing | 2 h | Now |
| Lazy-load `AdUnit`, `AdBlockGate`, `SupportWidget` | -25 KB gz on landing | 1 h | Now |
| Split `MainLayout` into `NavBar`, `Notifications`, `MobileMenu`, `Footer` | Cleaner state, fewer re-renders | 3 h | Soon |
| Wrap inputs in `useDeferredValue` on `/tool` and `/admin` tables | Smoother typing on big tables | 1 h | Soon |
| Replace `useEffect` + `addEventListener` for click-outside with a single `useEffect` + ref | Slightly fewer listeners | 30 m | Soon |
| Use Astro `<Image>` for hero and OG images | -30% image weight on average | 2 h | Soon |
| Convert framer-motion to CSS-only animations for simple fade-in/slide-up | -40 KB gz on landing | 3 h | Soon |
| Virtualise the file table on `/tool` | Smooth at 10 000+ rows | 4 h | When files > 1 000 |
| Use Firestore's `getCountFromServer` for the notification badge count | Avoids shipping 100s of docs to the client | 1 h | Soon |
| Add `loading="lazy"` and `decoding="async"` to all `<img>` tags | Faster LCP, lower CLS | 30 m | Now |
| Prefetch next-page chunk on hover for internal links | Instant nav | 1 h | Soon |
| Replace `onSnapshot` for "notifications" with a polling fallback when the tab is hidden | Saves Firestore reads | 1 h | Soon |
| Use `React.lazy` + `Suspense` for admin page chunks | -120 KB gz on landing | 2 h | Now |

**Estimated total impact** if we apply every "Now" line: landing
page JS drops from ~340 KB gz to ~190 KB gz, FCP improves by
~30% on 3G, and `/tool` first-paint is unaffected (it was already
heavy by design).

---

## 3. React re-render hygiene

This is the single highest-leverage set of changes. Every other
optimisation is local; this is global.

### 3.1 The `MainLayout` problem

`MainLayout.tsx` is one component, 576 lines, with this state:

```ts
const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
const [profileMenuOpen, setProfileMenuOpen] = useState(false)
const [notifications, setNotifications] = useState<any[]>([])
const [notificationMenuOpen, setNotificationMenuOpen] = useState(false)
const [theme, setTheme] = useState<'light' | 'dark'>(...)
```

It also runs an `onSnapshot` over Firestore
(`tickets where uid == user.uid and status == RESOLVED`) and
another via `useTelemetrySync`. Every Firestore update triggers a
re-render of the entire nav, the footer, the support widget, and
the page below.

**Fix:** split into smaller components with their own state.

```tsx
// Before
function MainLayout() {
  const [mobileMenuOpen, ...] = useState(...)
  // 576 lines
  return <nav>...huge JSX tree with 5 menus...</nav>
}

// After
function MainLayout() {
  return (
    <>
      <NavBar />         // owns mobileMenuOpen, profileMenuOpen
      <Notifications />  // owns notifications + listener
      <ThemeToggle />    // owns theme
      <main><Outlet /></main>
      <Footer />
    </>
  )
}
```

Each child only re-renders when its own state changes. The
`<main>` is not affected by notifications arriving.

### 3.2 Stop calling `setState` in listeners without `useCallback`

In `MainLayout.tsx` line 132, the click-outside listener is
re-registered on every state change of `profileMenuOpen`. That's
fine, but each registration costs an add/remove. For a component
with five of these, you can save 10 listener ops per click by
attaching a single document-level listener and reading the latest
open-menu from a ref.

```tsx
const openMenuRef = useRef<string | null>(null)

useEffect(() => {
  const handler = (e: MouseEvent) => {
    const t = e.target as HTMLElement
    if (openMenuRef.current && !t.closest(`.${openMenuRef.current}-container`)) {
      setOpenMenu(null)
    }
  }
  document.addEventListener('click', handler)
  return () => document.removeEventListener('click', handler)
}, [])
```

Now the listener is registered **once for the lifetime of the
component**, regardless of menu state.

### 3.3 Memoize heavy child components

For the `ToolWorkspace.tsx` worker loop, the file-row card should
be memoised. Right now any state change in the parent re-renders
every visible row.

```tsx
const FileRow = React.memo(function FileRow({ record, onClick }: FileRowProps) {
  // ...
})
```

Apply only to components that **render more than 20 instances on
screen** and that **receive a stable prop reference**. Below
that threshold `React.memo` is a net loss — the comparison
itself costs more than the re-render.

### 3.4 The `useEffect` dependency array anti-pattern

Throughout the codebase, you'll see:

```tsx
useEffect(() => {
  fetchSomething(arg1, arg2)
}, [arg1, arg2])
```

This is fine **if** `arg1` and `arg2` are stable. If they come
from props or from an `onSnapshot`, every callback re-runs.

**Fix:** use `useRef` to capture the latest values, or use
`useEvent`-style callbacks (the standard pattern from
`useEffectEvent` RFC):

```tsx
const argsRef = useRef({ arg1, arg2 })
argsRef.current = { arg1, arg2 }

useEffect(() => {
  const id = setInterval(() => {
    fetchSomething(argsRef.current.arg1, argsRef.current.arg2)
  }, 5000)
  return () => clearInterval(id)
}, [])   // never re-runs
```

This matters most in `useTelemetrySync` and the notification
listener — both run on a long-lived `onSnapshot`, and the wrong
dependency array means they re-subscribe on every parent render.

---

## 4. Bundle size

### 4.1 Lazy-load Firebase Firestore

Currently `firebase/firestore` is imported eagerly in:
- `MainLayout.tsx` (notifications listener)
- `LandingPage.tsx` (stats + reviews)
- `ToolWorkspace.tsx` (writeBatch, increment, etc.)
- `AuthContext.tsx` (custom claims)
- …and ~15 other files

Firestore weighs ~120 KB gz. Most of it is only used after the
user is signed in. **Lazy-load it:**

```tsx
// Before
import { collection, query, where, onSnapshot } from "firebase/firestore"

useEffect(() => {
  const q = query(collection(db, "tickets"), where(...), where(...))
  return onSnapshot(q, ...)
}, [user])

// After
useEffect(() => {
  if (!user) return
  let unsub: (() => void) | null = null
  ;(async () => {
    const { collection, query, where, onSnapshot } = await import("firebase/firestore")
    const q = query(collection(db, "tickets"), where(...), where(...))
    unsub = onSnapshot(q, ...)
  })()
  return () => unsub?.()
}, [user])
```

Yes, this is ugly. The cleaner alternative is a thin wrapper:

```ts
// lib/firestore.ts
let _fs: typeof import("firebase/firestore") | null = null
export async function fs() {
  if (!_fs) _fs = await import("firebase/firestore")
  return _fs
}
```

Then call sites become:

```ts
useEffect(() => {
  if (!user) return
  let unsub: (() => void) | null = null
  ;(async () => {
    const { collection, query, where, onSnapshot } = await fs()
    unsub = onSnapshot(query(collection(db, "tickets"), where(...)), ...)
  })()
  return () => unsub?.()
}, [user])
```

### 4.2 Lazy-load `framer-motion`

`framer-motion` is ~40 KB gz and is only needed on:
- `LandingPage.tsx` (a few `motion.div`s)
- `PricingPage.tsx` (count-up animation)
- `Compare.tsx` (drag interaction)
- `ExpandableFaq.tsx` (collapse/expand)

For all of these, you can substitute CSS transitions for the
simple cases and keep `framer-motion` only where it adds value
(e.g. `Compare.tsx` drag).

**Concrete plan:**

1. Keep `framer-motion` only for `Compare.tsx`. Move the import
   into a `client:only="react"` Astro island.
2. Replace `motion.div initial=... animate=...` with
   `data-aos="fade-up"` + a tiny CSS class trigger via
   `IntersectionObserver`. Saves 40 KB gz on the landing page.

### 4.3 Code-split by route

`/admin/*` is ~150 KB gz of admin-only code. The admin shouldn't
be in the landing-page bundle.

`AdminRouter.tsx` already gates by auth. But the imports at the
top of the file pull in every admin page. Use `React.lazy`:

```tsx
const AdminUsers = React.lazy(() => import("../react-pages/AdminUsers"))
const AdminDashboard = React.lazy(() => import("../react-pages/AdminDashboard"))
// ...

<Suspense fallback={<AdminSkeleton />}>
  <Routes>
    <Route path="/users" element={<AdminUsers />} />
    ...
  </Routes>
</Suspense>
```

Each admin page becomes its own chunk, loaded only when the
admin navigates to it.

Same pattern for `/dashboard`, `/checkout`, `/profile`.

### 4.4 Replace `lucide-react` with `lucide-static` (or icons from CDN)

`lucide-react` ships every icon as a React component, which
prevents aggressive tree-shaking in some configs. The lighter
alternative is `@iconify/react` with `lucide` as the icon set,
which only loads the icons you actually use.

Or, if you're feeling old-school, ship SVGs directly for the
~20 icons you actually use. ~5 KB total.

### 4.5 Verify the bundle

After every change, run:

```bash
npm run build
# inspect dist/_astro/*.js sizes
ls -lahS dist/_astro/*.js | head -10
```

The landing-page entry chunk should be **< 100 KB gz** (currently
~340 KB gz). The tool page chunk can be larger (it's the
workhorse).

---

## 5. Images and assets

### 5.1 Use Astro's `<Image>` component

```astro
---
import { Image } from 'astro:assets'
import hero from '../public/hero-graphic-light.webp'
---
<Image src={hero} alt="..." width={1200} height={630} loading="eager" fetchpriority="high" />
```

`<Image>` generates WebP / AVIF variants at build time and serves
the right size for the viewport.

### 5.2 Add `loading="lazy"` and `decoding="async"` to every `<img>`

Default for any image **below the fold**. For the hero, keep
`loading="eager" fetchpriority="high"`. Find them all:

```bash
grep -rn '<img' src/components src/react-pages | grep -v 'loading='
```

### 5.3 Use `srcset` for the hero / OG image

```html
<img
  srcset="/hero-graphic-light-400.webp 400w,
          /hero-graphic-light-800.webp 800w,
          /hero-graphic-light-1200.webp 1200w"
  sizes="(max-width: 600px) 400px, (max-width: 1000px) 800px, 1200px"
  src="/hero-graphic-light-1200.webp"
  alt="..."
  loading="eager"
  fetchpriority="high"
  decoding="async"
/>
```

Generate the variants with `astro build` + `<Image>` (which does
this automatically when you set `widths={[400, 800, 1200]}`).

### 5.4 Self-host fonts instead of Google Fonts

Google Fonts is fast, but the **TCP/TLS handshake** to
`fonts.gstatic.com` is what costs you on 3G. Self-hosting Inter
as a woff2 with `Cache-Control: public, max-age=31536000,
immutable` removes that.

```bash
# Download Inter Variable once
curl -o public/fonts/Inter-Variable.woff2 https://rsms.me/inter/font-files/InterVariable.woff2
```

```css
@font-face {
  font-family: 'Inter';
  src: url('/fonts/Inter-Variable.woff2') format('woff2-variations');
  font-weight: 100 900;
  font-display: optional;
}
```

The `font-display: optional` is critical: it means the browser
**won't swap fonts at all** if Inter doesn't load in time, so
CLS stays 0.

---

## 6. CSS / Tailwind

### 6.1 Tailwind purging

Tailwind purges by default in production. Verify `content` in
`tailwind.config.js` covers every source:

```js
content: [
  './src/**/*.{astro,html,js,jsx,ts,tsx,md,mdx}',
  './public/**/*.html',
]
```

If a class is added in a file Tailwind doesn't see, it won't be
in the output. Symptoms: "the class works in dev, missing in
prod."

### 6.2 Stop using arbitrary values when a utility exists

```html
<!-- Before -->
<div className="mt-[17px] mr-[13px]">

<!-- After -->
<div className="mt-4 mr-3">
```

Arbitrary values bypass Tailwind's purgeability check (they're
literal strings, not in the safelist) and bloat the generated
CSS.

### 6.3 No `@apply` outside the global stylesheet

`@apply` in component files is a code smell. It hides the
classname from the JSX and forces you to grep for usages.

### 6.4 The `animate-in` and `animate-page` classes

These are custom Tailwind animations. They animate `opacity`
and `transform` — both GPU-accelerated, both cheap. Good. Make
sure the keyframes are defined in `tailwind.config.js` and
don't try to animate `width`, `height`, `top`, `left`, or
`margin` (all of which trigger layout).

---

## 7. Network and caching

### 7.1 Cloudflare cache headers

Currently `firebase.json` sets `Cache-Control: no-cache` for
**everything**. That's the right choice for HTML (we want
deploys to land fast) but **wrong for `_astro/*` assets**,
which have content hashes in their filenames and are safe to
cache for a year.

Override per-path in `firebase.json` or in Cloudflare's
`_headers` file:

```
/_astro/*
  Cache-Control: public, max-age=31536000, immutable

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/fonts/*
  Cache-Control: public, max-age=31536000, immutable

*.webp, *.avif
  Cache-Control: public, max-age=2592000
```

Astro's `assets` directory already has hashed filenames, so
immutable is correct.

### 7.2 Preconnect to Firebase + Google APIs

```html
<link rel="preconnect" href="https://firestore.googleapis.com" crossorigin />
<link rel="preconnect" href="https://identitytoolkit.googleapis.com" crossorigin />
<link rel="preconnect" href="https://firebasestorage.googleapis.com" crossorigin />
```

These shaves 100–200 ms off the first Firestore call on cold
loads.

### 7.3 Replace `onSnapshot` with polling for the notifications badge

Right now `MainLayout` keeps a live listener on
`tickets where uid == X and status == RESOLVED`. The listener
costs one Firestore read per change. For a tab that's
backgrounded for an hour, that's wasted reads.

```ts
useEffect(() => {
  if (!user) return
  if (document.hidden) return
  const id = setInterval(refreshNotifications, 60_000)
  const onVisible = () => refreshNotifications()
  document.addEventListener('visibilitychange', onVisible)
  return () => {
    clearInterval(id)
    document.removeEventListener('visibilitychange', onVisible)
  }
}, [user])
```

Refresh every 60 s while the tab is visible, immediately on
visibilitychange, and skip entirely while hidden.

### 7.4 Use `getCountFromServer` for badge counts

If you only need a count (e.g. "3 notifications"), don't ship
the full docs. Firestore's `getCountFromServer` is one read,
returns a number.

```ts
const { getCountFromServer } = await fs()
const snap = await getCountFromServer(query(collection(db, "tickets"), where(...), where(...)))
setCount(snap.data().count)
```

Then fetch the actual list on click. Most of the time the user
doesn't open the dropdown — don't pay for the docs.

---

## 8. Animation performance

### 8.1 Animate only `transform` and `opacity`

`transform` and `opacity` are GPU-accelerated, off the main
thread. Everything else (width, height, top, left, margin,
padding) triggers layout, which is the main thread, which
causes jank.

In your CSS / Tailwind config, the only animation curves you
should need:

```css
.fade-in    { animation: fadeIn 200ms ease-out }
.slide-down { animation: slideDown 200ms ease-out }
```

### 8.2 Respect `prefers-reduced-motion`

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

Add to `src/index.css`. Costs nothing, helps users with
vestibular disorders, and is sometimes a legal requirement.

### 8.3 The framer-motion → CSS escape hatch

For simple fade-ins, replace:

```tsx
<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
  ...
</motion.div>
```

with:

```tsx
<div className="animate-fade-in">
  ...
</div>
```

```css
@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
.animate-fade-in { animation: fadeIn 200ms ease-out }
```

Saves the framer-motion runtime on pages that don't need it.

### 8.4 The Compare.tsx drag — keep framer-motion

This is one of the few places framer-motion shines (gesture
handling). Keep the import. Don't apply the lazy-load
heuristic here.

---

## 9. Forms and inputs

### 9.1 Debounce search inputs

If you ever add a search bar that hits Firestore or an Algolia
index, debounce the input. Don't debounce the keystroke;
debounce the network call.

```tsx
const [q, setQ] = useState('')
useEffect(() => {
  const id = setTimeout(() => doSearch(q), 250)
  return () => clearTimeout(id)
}, [q])
```

### 9.2 Use `useDeferredValue` for non-urgent input

`React 18`'s `useDeferredValue` keeps the input snappy by
marking the derived state as low-priority. Useful in
`ToolWorkspace.tsx` for the search/filter input on the file
table.

```tsx
const [query, setQuery] = useState('')
const deferred = useDeferredValue(query)
const filtered = useMemo(() => records.filter(r => r.path.includes(deferred)), [records, deferred])
```

### 9.3 Native form validation

Use `<input required minLength={...} pattern={...}>` instead of
a JS validation library. The browser does the work for free.

---

## 10. The expensive pages: `/tool`, `/admin/*`

These are the pages where most of the CPU is spent. Generic
React hygiene applies, but they have specific traps.

### 10.1 `/tool` (ToolWorkspace)

- **Already fixed**: cursor pagination, 200-record page size,
  dirCache cap, log tail flush. See
  [`runbooks/aw-snap-oom-fix.md`](../runbooks/aw-snap-oom-fix.md)
  and [`runbooks/memory-hygiene.md`](../runbooks/memory-hygiene.md).
- **Remaining**: virtualise the file table if you ever render
  more than 1 000 rows. The current setup only renders
  `currentPage.length` (200) rows in the table at a time, so
  this is **not** an immediate concern. But if you add a
  "view all files" mode, virtualise.
- **Remaining**: `framer-motion` is used here for the
  progress bar. CSS would do. Saves ~40 KB gz on the only page
  that's already big.

### 10.2 `/admin/*`

- **Code-split each page**: `React.lazy` for `AdminUsers`,
  `AdminDashboard`, `AdminRevenue`, `AdminReviews`, `AdminSettings`,
  `AdminStatistics`, `AdminSupport`, `AdminTeam`,
  `AdminUserDashboard`. None of them need to be in the
  landing bundle.
- **The "Reset Quota" action** in `AdminUsers.tsx` /
  `AdminUserDashboard.tsx` writes a single Firestore doc.
  Trivial. Don't add an unnecessary Cloud Function.
- **The `AdminLayout` component** is 246 lines. It has
  navigation that could be its own component, with its own
  state for the active section.

### 10.3 `/dashboard`

- Reads a single user's stats. Already light. Verify the
  `useEffect` doesn't re-subscribe on every render.

### 10.4 `/checkout`

- Stripe-equivalent payment flow (Dodo Payments per the
  CHANGELOG). Don't preload the checkout page on other routes.
  Astro's static output means this is automatic.

---

## 11. Measuring: what to watch

### 11.1 The four numbers that matter

| Metric | Tool | Target |
|---|---|---|
| **LCP** (Largest Contentful Paint) | WebPageTest, Lighthouse, CrUX | < 2.5 s on 4G |
| **CLS** (Cumulative Layout Shift) | Lighthouse, CrUX | < 0.1 |
| **INP** (Interaction to Next Paint) | CrUX, real-user monitoring | < 200 ms |
| **TBT** (Total Blocking Time) | Lighthouse | < 200 ms |

### 11.2 Local measurement

```bash
# Lighthouse
npx lighthouse http://localhost:4321 --view --preset=desktop
npx lighthouse http://localhost:4321/tool --view --preset=desktop

# Bundle analysis
npx vite-bundle-visualizer
# open dist/stats.html
```

### 11.3 Production measurement

Sentry's `Web Vitals` integration (already configured in
`sentry.client.config.js`) reports LCP / CLS / INP for real
users. Set up a Sentry alert if LCP p75 exceeds 3 s.

Cloudflare's **Web Analytics** (free, no JS) gives a
sampling-based view of the same metrics without touching your
bundle.

### 11.4 Renderer process memory

This is the one that bites you on 8 000+ file takeouts. Watch
it during testing:

- Chrome: `Shift + Esc` → Task Manager → sort by memory
- Firefox: `about:memory`
- Safari: Develop → Show Web Inspector → Timelines

Target: **< 600 MB** for the JS heap during a full restore
of an 8 000-file takeout. Before the cursor-pagination fix
it was 1.5 GB+.

---

## 12. Per-PR checklist

Before opening a PR that touches `src/components/`,
`src/react-pages/`, `src/layouts/`, or `src/contexts/`:

### Performance

- [ ] No new `useEffect` with object/array dependencies that
      aren't memoised
- [ ] No new `<img>` without `loading` and `decoding` attrs
- [ ] No new `onSnapshot` without cleanup
- [ ] No new `framer-motion` import on a marketing page
- [ ] No new `firebase/firestore` import at the top of a file
      that doesn't need it on first paint
- [ ] No new `getAll(...)` call on the `files` store
- [ ] No new state at the top of `MainLayout` — split into a
      child component if you need new state

### Bundle

- [ ] `npm run build` succeeds
- [ ] Landing page chunk is **< 100 KB gz** (verify with
      `ls -lahS dist/_astro/*.js | head -5`)
- [ ] No new file adds **> 5 KB gz** to the landing chunk

### Accessibility

- [ ] `prefers-reduced-motion` respected
- [ ] All interactive elements have a visible focus ring
- [ ] All images have `alt` text (or `alt=""` if decorative)
- [ ] All form inputs have associated `<label>`s

### Type safety

- [ ] `tsc --noEmit` is no worse than before (pre-existing
      errors are tracked, new code shouldn't add more)

### Verification

- [ ] Run the app locally, sign in, click through every
      page you touched
- [ ] Run a small takeout (≤ 100 files) end-to-end
- [ ] Open DevTools → Performance, record 5 s, confirm no
      long tasks > 50 ms
- [ ] Open Chrome Task Manager, confirm renderer memory is
      stable

---

## Appendix A — Quick wins (apply first)

These are the **highest-ROI, lowest-risk** changes. Apply in
this order:

1. **Add `loading="lazy" decoding="async"` to every `<img>`
   that's below the fold.** 30 minutes, zero risk.
2. **Replace the `firebase/firestore` import in `MainLayout.tsx`
   with a lazy wrapper.** 1 hour, big gz win on landing.
3. **Replace simple `motion.div`s on `LandingPage.tsx` and
   `PricingPage.tsx` with CSS classes.** 2 hours, ~40 KB gz
   win on landing.
4. **Split `MainLayout` into `NavBar`, `Notifications`,
   `ThemeToggle`, `Footer` components.** 3 hours, fewer
   re-renders everywhere.
5. **Add cache headers to `/_astro/*` in Cloudflare.** 30
   minutes, faster repeat visits.
6. **Self-host Inter as a woff2 with `font-display: optional`.**
   1 hour, faster LCP on 3G.
7. **Add `prefers-reduced-motion` global rule.** 5 minutes,
   better a11y.
8. **`React.lazy` for `/admin/*` and `/checkout` routes.**
   2 hours, much smaller bundles.

## Appendix B — When to break the rules

- **Don't memoise** small components. `React.memo` has a
  cost; below ~20 instances on screen it's a net loss.
- **Don't code-split** the tool page. It's heavy by design
  and users hit it once. The cost of the loading flash is
  worse than the bundle size.
- **Don't lazy-load Firebase Auth.** Auth state is read on
  every page render. The cost of the dynamic import
  outweighs the savings.

## Appendix C — Things that *aren't* UI optimisation

These often get lumped in but belong elsewhere:

- **Astro config** (`output: 'static'`, integrations): done.
- **Firestore rules**: not UI.
- **Cloud Functions / Dodo webhooks**: not UI.
- **IndexedDB schema**: covered in
  [`runbooks/indexeddb-schema-migrations.md`](../runbooks/indexeddb-schema-migrations.md).
- **Worker loop in `ToolWorkspace`**: covered in
  [`runbooks/aw-snap-oom-fix.md`](../runbooks/aw-snap-oom-fix.md).

UI optimisation is about the bits the user actually sees and
interacts with. Keep that scope and you'll move fast.
