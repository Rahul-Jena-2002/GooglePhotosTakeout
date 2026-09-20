# Engineering Directive: The Unified Agent Architecture

## Safe Engineering Policy

For every task, follow:

**Understand → Reuse → Change minimally → Verify → Stop.**

- Existing working code is presumed intentional.
- Do not modify working code without evidence that the modification is necessary or directly requested.
- Do not refactor unrelated code.
- Do not make speculative fixes.
- Do not introduce dependencies, abstractions, architectural changes, or configuration changes without a concrete reason.
- When uncertain, investigate instead of editing.
- Never claim a task is fixed or error-free without verification.
- A small verified change is preferable to a large "improved" implementation.

---

## Architectural Hierarchy

```text
                         AGENTS.md
                            │
                 ┌──────────┴──────────┐
                 │                     │
          SAFE ENGINEERING        DECISION GATE
        Always-on discipline           │
                 │              ┌──────┴──────┐
                 │              │             │
                 │            Local       Structural
                 │              │             │
                 │          Ponytail      Graphify
                 │              │             │
                 └──────────────┴─────────────┘
                                │
                          Implementation
                                │
                          Addy Skills
                                │
                     Test → Review → Verify
                                │
                              STOP
```

- **Ponytail:** "Don't over-engineer" (Anti-bloat, reuse first, YAGNI).
- **Safe Engineering:** "Don't change what you don't understand" (Zero-regression, minimum safe diff, evidence first).
- **Graphify:** "Understand structural impact" (Dependency mapping, God nodes, caller/callee analysis).
- **Addy Skills:** "Execute and verify" (Structured SDLC, test-driven gates, production standards).

---

## 1. Decision Gate: When to Consult Graphify
Graphify provides deep structural awareness of dependencies, caller/callee relationships, and "God Nodes" (central hub files).
**Do NOT invoke Graphify for non-structural edits.**

```text
Task arrives
   │
   ▼
Is the change structural?
   │
   ├── NO (Typo, simple CSS/styling adjustment, isolated constant, straightforward doc, trivial test tweak)
   │     └─► Ponytail (laziest senior dev) ──► implement ──► verify ──► STOP
   │
   └── YES (Refactoring, shared components/hooks, auth, state management, API contracts, DB models, routing, deleting/renaming code, cross-module behavior, investigating unfamiliar code)
         └─► Graphify (consult graph.json / trace ripple effects)
               └─► Ponytail (minimum viable code, reuse)
                     └─► Implement
                           └─► Agent Skills Quality Gates (verification & review) ──► STOP
```

---

## 2. Graphify: Structural Awareness Before Mutation
- **Scope:** Triggered only on architectural, shared, or cross-module mutations.
- **Trace Impact:** Identify caller/callee relationships, imports, and high-centrality hub files in `graphify-out/graph.json` before altering signatures or contracts.
- **Keep Graph Fresh:** After completing structural modifications, run `python -m graphify update .` (AST-only, 0 API cost).

---

## 3. Ponytail: The Decision Ladder
Before writing any new code, stop and evaluate the ladder in order:
1. **Does this need to exist? (YAGNI)** &rarr; If not, do not write it.
2. **Is it already in this codebase? (Reuse)** &rarr; Check for existing utilities, components, and hooks.
3. **Can the standard library do it?** &rarr; Use built-in platform/language APIs.
4. **Is it a native platform/browser feature?** &rarr; Use native HTML5/CSS primitives.
5. **Is there an installed dependency?** &rarr; Check `package.json` before adding or writing new logic.
6. **Can it be one line?** &rarr; Keep it simple and readable.
7. **Minimum Viable Code:** Write only what is strictly required to fulfill the requirement.

*Non-Negotiable Guardrails:* Ponytail laziness never applies to **security**, **input validation**, **error handling**, or **accessibility**.

---

## 4. Addy Osmani Engineering Standards: Quality Gates
- **Systematic SDLC:** Spec &rarr; Plan &rarr; Build &rarr; Verify &rarr; Review.
- **Strict Quality Budgets:**
  - Lighthouse SEO: **100**
  - Accessibility: **90+**
  - Performance: Zero CLS, optimized LCP, and reserved layouts.
- **Defensive Design:** Assume unformatted or partial Google Takeout JSON sidecars, corrupted exports, and missing EXIF headers. Always handle fallbacks gracefully.
- **No Degradation:** Never silence errors with `@ts-ignore`, never leave empty catch blocks, and never commit stubbed functions.

---

## 5. The Dual-Evidence Rule: Structural + Behavioral
Static graphs and runtime reality must corroborate each other:
- **Graphify = Structural Evidence:** Answers *"What connects to this and what might break?"*
- **Tests & Linters = Behavioral Evidence:** Answers *"Does it actually execute and perform correctly at runtime?"*
- Never assume a clean graph check replaces running tests, verifying HTTP codes, or validating browser behavior. High-confidence engineering requires both.
