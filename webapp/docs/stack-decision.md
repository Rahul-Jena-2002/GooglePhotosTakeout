# Stack decision — do we switch off Cloudflare Pages + Firebase?

## TL;DR

**No. Stay on Cloudflare Pages (Astro static) + Firebase (Auth +
Firestore).** This stack is already the right shape for the
product, and the work in front of us is *execution* (apply the
checklist in [`runbooks/ui-optimization.md`](./runbooks/ui-optimization.md)),
not migration.

If you're considering Spring Boot / Kubernetes / a "real
backend," this doc explains why that's the wrong direction for
this product and what the right alternatives look like.

---

## 1. What the product actually needs

List the hard requirements, then judge the stack against them.

| Requirement | Why | Stack requirement |
|---|---|---|
| **Process 50 GB+ Google Takeout folders** in the browser | Takeouts can have tens of thousands of JPEGs and videos | The browser is the only realistic place; we cannot upload 50 GB per user |
| **Never see user photos** | Privacy is the value proposition | Server must not be in the data path |
| **Per-user quota enforcement** | Monetisation | Need a server, but only for *metadata* (counts, plans), not the files |
| **Authentication** | Save user state, admin tools | Need an auth provider |
| **Marketing pages that rank on Google** | Acquisition | Need SSR for SEO, or at minimum pre-rendered HTML with fast TTFB |
| **Static pricing / reviews / FAQ pages** | Conversion | SSR is overkill — pre-rendered HTML is fine |
| **Admin dashboard for ~3 staff** | Internal | SSR optional; SPA is fine |
| **Fast iteration on UI** | Velocity | The team is small; ops overhead must stay near zero |
| **Low cost at low traffic** | We have < 10k MAU today | Cloudflare + Firebase free tier is hard to beat |
| **PCI / payments** | Checkout | Outsource to Dodo Payments (already done) |

Now score the current stack against this list.

| Requirement | Astro + CF Pages + Firebase | Spring Boot + Kubernetes |
|---|---|---|
| Process 50 GB takeouts in browser | ✅ already there | ✅ still in browser — same code |
| Never see user photos | ✅ enforced by architecture | ✅ also enforced — same client code |
| Per-user quota | ✅ Firestore + rules | ⚠️ need to build the same enforcement layer |
| Auth | ✅ Firebase Auth | ⚠️ build your own, or integrate a provider |
| Marketing SEO | ✅ Astro static + ISR-style headers | ⚠️ SSR is overkill, costs more |
| Admin dashboard | ✅ SPA in `/admin/*` | ✅ same, but you'd ship a Node JVM to serve it |
| Fast iteration | ✅ `npm run dev` is instant | ❌ JVM startup, container builds, deploy pipelines |
| Low cost at low traffic | ✅ $0/mo on free tiers | ❌ $30–$100/mo minimum for a single VM, more if you want HA |
| Payments | ✅ already integrated with Dodo | ⚠️ same |

**The deciding factor: the data never leaves the browser.** A
Spring Boot backend cannot do anything for the restore flow
that the browser isn't already doing, because we explicitly
don't want to touch user photos on the server. So the backend
becomes a thin wrapper around Firestore for *metadata* — and
Firestore is already that wrapper.

## 2. Why Spring Boot feels appealing (and why it isn't)

### 2.1 "I want a real backend"

You do — for the metadata layer. **Firebase is that backend.**
It's an opinionated NoSQL store with auth, rules, real-time
subscriptions, and admin SDK all in one. The "real backend"
that Spring Boot would give you is mostly features you'd then
re-implement:

- Auth → Firebase Auth (5 min to integrate)
- Database → Firestore (5 min to integrate)
- Real-time → Firestore `onSnapshot` (free with Firestore)
- Admin → Firebase Admin SDK (Node, Python, Go)
- File storage → Firebase Storage (if we ever need it)

Spring Boot gives you none of those out of the box. You'd
either build them (weeks of work) or integrate Firebase
*anyway* (which makes Spring Boot just a Java wrapper around
Firebase calls — pure overhead).

### 2.2 "Spring Boot is faster"

For CPU-heavy workloads, yes. For our workload:

- The CPU-heavy work is in the browser (image processing, JSON
  parsing). The server isn't involved.
- The server workload is metadata CRUD. Firestore handles
  this at the edge in <50 ms globally.
- The cost of a JVM in memory + GC pauses for a workload
  that's mostly idle is a net loss.

If you ever need server-side image processing (e.g. for users
on phones without File System Access API), that's a different
question — but it's a Worker (e.g. Cloudflare Worker with the
Images binding, or AWS Lambda), not Spring Boot.

### 2.3 "SSR / better SEO"

Astro on Cloudflare Pages already gives you:

- Pre-rendered HTML for every marketing page (instant TTFB)
- A real `<head>` per page (canonical URL, OG tags, JSON-LD)
- `sitemap.xml`, `robots.txt`, ISR-style cache headers
- Lazy hydration — React only ships for `/tool`, `/dashboard`,
  `/admin/*`

What Astro on CF Pages does **not** give you:

- Dynamic SSR per request. But you don't need it — your
  content is mostly static, and the few dynamic pages
  (`/support?tab=tickets`) are post-hydration React.

If you ever need true per-request SSR, the right move is a
Cloudflare Worker, not a JVM. Cloudflare Workers have 0 ms cold
starts and run at the edge. Spring Boot has 30+ second cold
starts and runs in a single region.

### 2.4 "I want to control the deployment"

You do — and Cloudflare Pages gives you:

- Git-based deploys from GitHub
- Preview URLs per PR
- Rollbacks to any previous deploy
- Environment variables per environment
- Free SSL
- Global CDN with HTTP/3

This is the same DX as Vercel / Netlify. Spring Boot on
Kubernetes gives you:

- A `kubectl apply` step
- A load balancer
- A database migration story
- Pod autoscaling rules
- A monitoring stack

For a 5-person team, the Cloudflare setup is 10× less work to
keep running.

### 2.5 "What if we outgrow Firebase?"

If you ever genuinely outgrow Firestore (millions of writes/sec
on a single collection), the migration path is:

1. **First** — try Firestore sharding / composite indexes /
   denormalisation. Most "Firestore can't" stories are
   "I haven't read the docs."
2. **Second** — move specific hot collections to a dedicated
   Postgres (Cloudflare D1, Neon, Supabase). Firestore can
   still be the system of record.
3. **Third** — move everything off Firebase. At this point
   you're a much larger company and the migration is well-funded.

Jumping to "build our own backend on Spring Boot" **before**
hitting a Firestore limit is premature optimisation of the
worst kind.

## 3. The "process stays on the user's device" requirement

This is the architectural constraint that makes the whole
"client-side rendering is not possible" framing not apply to
us.

**Client-side rendering is not possible** for products where
the server must process the data. We are not that product.

- We don't want to upload 50 GB of photos to a server.
- We don't have permission to upload them (privacy promise).
- Even if we did, the network transfer alone would take 30+
  minutes on a typical home connection.

So the work *has* to be in the browser. The architecture is
already correct: thin client (Astro + React islands), thin
backend (Firebase for metadata), heavy work in the browser
(ToolWorkspace + IndexedDB + File System Access API).

The question isn't "how do we move processing to the server?"
The question is "how do we make the browser-based processing
fast and reliable?" That's what
[`runbooks/memory-hygiene.md`](./runbooks/memory-hygiene.md) and
[`runbooks/aw-snap-oom-fix.md`](./runbooks/aw-snap-oom-fix.md)
are for.

## 4. When the stack would actually need to change

If any of these become true, *then* revisit:

| Trigger | Right move |
|---|---|
| You need server-side image processing for users on iOS Safari (no File System Access API) | Cloudflare Worker + Images binding, or AWS Lambda. Not Spring Boot. |
| You exceed Firestore's 1 write/sec/document limit on a hot collection | Composite indexes + sharding first; Postgres (D1 / Neon) second. |
| You need true per-request SSR for >100 dynamic pages | Cloudflare Worker, then maybe consider Next.js if the team wants React SSR. |
| You want on-prem deploys for enterprise customers | That's a different product. Spring Boot helps here, but it's a 6-month rebuild. |
| You need a real-time collaborative editor | Different product. Use a CRDT library (Yjs) in the existing stack. |

None of these apply today.

## 5. What to invest in instead

If the goal is "make it optimised," here is the priority order:

1. **Apply the UI optimisation checklist.** See
   [`runbooks/ui-optimization.md`](./runbooks/ui-optimization.md).
   The big wins are: lazy-load Firestore, lazy-load framer-motion,
   split `MainLayout` into smaller components, code-split admin
   routes, virtualise large tables if you add them.
2. **Tighten the IndexedDB layer.** The cursor pagination fix
   is in. The next step is adding more indexes for queries we
   run today (`sessionId`, `status` + `sessionId` compound).
3. **Better offline support.** Service worker for the marketing
   pages so repeat visits are instant.
4. **Real-user monitoring.** Wire Sentry's Web Vitals into
   CI; alert on regressions.
5. **Edge-side A/B testing** via Cloudflare Workers if you
   need it (e.g. price-test different tiers).

## 6. Counter-arguments I've considered

### "But Java is more performant than JavaScript"

For long-running CPU work, yes. For our workload, the JS
engine is doing I/O-bound work (file reads, EXIF parsing)
where the bottleneck is disk, not CPU. The relevant metric is
"how long does it take to process a 10 000-file takeout," and
the answer on a modern V8 is "about 4 minutes." Moving to
Java doesn't help — the disk is still slow.

### "But I want type safety end-to-end"

You have it. Firestore's Admin SDK is typed. The React app
is TypeScript. The Cloud Functions are TypeScript. There's no
untyped boundary you'd gain by adding Java.

### "But Java has better libraries"

For what? We use:
- `piexifjs` for EXIF (JS only)
- `@zip.js/zip.js` for zip extraction (JS only)
- Firebase SDK (JS only)
- framer-motion for animation (JS only)

There is no Java library we'd want that doesn't have a JS
equivalent.

### "But I want to share code between server and client"

There's no code to share. The browser does one thing; the
server (Cloud Functions, in TypeScript) does another.

## 7. Conclusion

The stack is right. The work is in *execution*: apply the
optimisation checklist, tighten the IndexedDB layer, ship
real-user metrics. Migrating to Spring Boot would burn 3–6
months for zero product benefit and a worse deployment story.

If a future trigger (see §4) changes the calculus, revisit
this doc. Until then, the answer to "should I switch?" is
**no — stay, optimise, ship.**
