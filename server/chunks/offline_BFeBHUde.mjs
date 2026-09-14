globalThis.process ??= {};
globalThis.process.env ??= {};
/* empty css               */
import { c as createComponent } from "./astro-component_BoQpbKXG.mjs";
import { bo as renderHead, K as renderTemplate } from "./sequence_k0xuL9q8.mjs";
const $$Offline = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`<html lang="en" data-astro-cid-orgni7iu> <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>TakeoutFix — Offline</title><link rel="icon" href="/favicon.svg" type="image/svg+xml">${renderHead()}</head> <body data-astro-cid-orgni7iu> <div class="card" data-astro-cid-orgni7iu> <div class="icon" data-astro-cid-orgni7iu>📡</div> <div class="pill" data-astro-cid-orgni7iu> <span class="dot" data-astro-cid-orgni7iu></span>
No Internet Connection
</div> <h1 data-astro-cid-orgni7iu>You're offline</h1> <p data-astro-cid-orgni7iu>
TakeoutFix needs a connection to load authentication and sync your account.
      Once the app is loaded online, <strong style="color:#d4d4d8" data-astro-cid-orgni7iu>photo processing works fully offline</strong> — 
      all restoration happens in your browser.
</p> <button onclick="location.reload()" data-astro-cid-orgni7iu>Try Again</button> <p class="note" data-astro-cid-orgni7iu>
If you were already processing photos, your session is saved and will resume when you reconnect.
</p> </div> </body></html>`;
}, "/home/runner/work/GooglePhotosTakeout/GooglePhotosTakeout/webapp/src/pages/offline.astro", void 0);
const $$file = "/home/runner/work/GooglePhotosTakeout/GooglePhotosTakeout/webapp/src/pages/offline.astro";
const $$url = "/offline.html";
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$Offline,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
export {
  page
};
