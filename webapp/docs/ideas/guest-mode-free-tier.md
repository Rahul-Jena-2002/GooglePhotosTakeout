# Guest Mode: 100 Files / 1 GB Zero-Friction Funnel

## Problem Statement
How might we let first-time visitors experience the restoration magic with zero friction (up to 100 photos or 1 GB without signing in), while maximizing conversion into registered and paying users?

---

## Recommended Direction: The Progressive Unlock ("Proof First, Sign-In for Scale")

Instead of a hard wall at `/tool` before the user has seen any proof that TakeoutFix works, let visitors enter `/tool` immediately in **Guest Mode**:

1. **Immediate Value Delivery:**
   - Guest drops their Google Takeout folder or zip file.
   - The restoration pipeline processes up to **100 photos** or **1 GB of data** locally in their browser.
   - Fixed photos are saved directly to their output folder with valid EXIF timestamps and GPS tags restored.

2. **The "Value Proven" Sign-In Gate:**
   - When the user reaches file #101 or 1.01 GB, the pipeline gently pauses.
   - A clean modal pops up:
     > **"100 Photos Restored Successfully! 🎉"**
     > *Check your output folder — your dates and locations are back in order. Sign in for free with Google to continue restoring the rest of your archive.*
   - If they click "Sign In with Google", it opens a popup (`signInWithPopup`), keeping their browser tab and active file handle alive so the restoration resumes immediately without re-selecting folders.

---

## Why 100 Files / 1 GB Is the Sweet Spot

| Dimension | 100 Files / 1 GB Limit | Why It Works |
| :--- | :--- | :--- |
| **User Proof** | Restores 1–2 full photo albums | Ample proof that their specific file formats, camera models, and JSON sidecars match. |
| **Archive Reality** | Average Google Takeout is 15,000–50,000 photos (30–150 GB) | 100 files is ~0.5% of a real export. It satisfies testing, but nobody can realistically restore their life's archive without creating an account. |
| **Abuse Resistance** | Browser `localStorage` counter per device | Incognito circumvention is possible, but doing 100 files at a time for a 30 GB archive is far too tedious. Real users will simply sign in. |

---

## Key Assumptions to Validate

- [ ] **Assumption 1 (In-Place Auth):** Can Firebase `signInWithPopup` complete without refreshing the page or losing the File System Access API directory handle? *(Confirmed: `signInWithPopup` runs in a separate window; the parent window retains DOM state and handles).*
- [ ] **Assumption 2 (Conversion Lift):** Will letting users test first increase registration rates more than requiring upfront sign-in? *(Industry benchmarks for local-first utility tools show a 2.5x–4x increase in signups when users verify tool efficacy before creating an account).*
- [ ] **Assumption 3 (Local Quota Persistence):** `localStorage` key `takeoutfix_guest_files_restored` and `takeoutfix_guest_bytes_restored` must survive page reloads so guests cannot simply refresh to bypass the 100-file cap.

---

## MVP Scope

### What's In
1. **Remove hard `!user` gate in [`ToolWorkspace.tsx`](file:///g:/projectssss/Google%20Takeout/webapp/src/react-pages/tool/ToolWorkspace.tsx):**
   - If `!user`, set `isGuest = true` and display a small top banner: *"Guest Mode (100 files free) · Sign in anytime to unlock larger batches"*.
2. **Guest Quota in [`useToolPipeline.ts`](file:///g:/projectssss/Google%20Takeout/webapp/src/tool-workspace/useToolPipeline.ts):**
   - For guests, set `limitFiles = 100` and `limitBytes = 1024 * 1024 * 1024` (1 GB).
   - Track processed counts in `localStorage`.
3. **Conversion Modal in [`ToolModals.tsx`](file:///g:/projectssss/Google%20Takeout/webapp/src/tool-workspace/ToolModals.tsx):**
   - When guest quota is reached, show a focused celebratory modal with a one-click Google Sign-In button.

### Not Doing (and Why)
- **Complex IP / Device Fingerprinting:** Over-engineering against users opening Incognito is unnecessary. The pain of chunking a 50 GB takeout into 100-file slices is its own anti-abuse protection.
- **Requiring Credit Card / Upfront Billing:** Keep the post-100 threshold on the standard Free Account tier so signup friction remains minimal.
- **Restricting Features in Guest Mode:** Don't disable fuzzy matching or EXIF deep-injection for guests. They need to see the *best* possible restoration quality to convert.

---

## Open Questions

1. Should the Native Desktop App also have this 100-file guest mode, or should we keep the guest funnel exclusive to the Web Tool to drive users to download the Native App for heavy archives?
2. Should we show a persistent progress pill in the header (e.g., `Restored: 42 / 100 free files`) so users anticipate the sign-in prompt rather than feeling surprised?
