globalThis.process ??= {};
globalThis.process.env ??= {};
/* empty css               */
import { c as createComponent } from "./astro-component_CcrE4faB.mjs";
import { K as renderTemplate, bn as defineScriptVars, bo as renderHead } from "./sequence_zP2_d4fi.mjs";
import { r as renderComponent } from "./worker-entry_42zI8eNj.mjs";
var define_process_env_default = {};
var __freeze$1 = Object.freeze;
var __defProp$1 = Object.defineProperty;
var __template$1 = (cooked, raw) => __freeze$1(__defProp$1(cooked, "raw", { value: __freeze$1(cooked.slice()) }));
var _a$1;
const $$FirebaseRuntimeConfig = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$props, $$slots);
  Astro2.self = $$FirebaseRuntimeConfig;
  let runtimeEnv = {};
  try {
    const cfWorkers = await import("cloudflare:workers");
    if (cfWorkers?.env) runtimeEnv = cfWorkers.env;
  } catch {
  }
  if (!runtimeEnv.PUBLIC_FIREBASE_API_KEY && typeof process !== "undefined" && define_process_env_default) {
    runtimeEnv = define_process_env_default;
  }
  const firebaseConfig = {
    apiKey: runtimeEnv.PUBLIC_FIREBASE_API_KEY || void 0 || "",
    authDomain: runtimeEnv.PUBLIC_FIREBASE_AUTH_DOMAIN || void 0 || "",
    projectId: runtimeEnv.PUBLIC_FIREBASE_PROJECT_ID || void 0 || "",
    storageBucket: runtimeEnv.PUBLIC_FIREBASE_STORAGE_BUCKET || void 0 || "",
    messagingSenderId: runtimeEnv.PUBLIC_FIREBASE_MESSAGING_SENDER_ID || void 0 || "",
    appId: runtimeEnv.PUBLIC_FIREBASE_APP_ID || void 0 || "",
    measurementId: runtimeEnv.PUBLIC_FIREBASE_MEASUREMENT_ID || void 0 || ""
  };
  const googleClientId = runtimeEnv.PUBLIC_GOOGLE_CLIENT_ID || void 0 || "";
  return renderTemplate(_a$1 || (_a$1 = __template$1(["<script>(function(){", "\n  if (firebaseConfig?.apiKey) window.__FIREBASE_CONFIG__ = firebaseConfig;\n  if (googleClientId) window.__GOOGLE_CLIENT_ID__ = googleClientId;\n})();<\/script>"])), defineScriptVars({ firebaseConfig, googleClientId }));
}, "/home/runner/work/GooglePhotosTakeout/GooglePhotosTakeout/webapp/src/components/common/FirebaseRuntimeConfig.astro", void 0);
var __freeze = Object.freeze;
var __defProp = Object.defineProperty;
var __template = (cooked, raw) => __freeze(__defProp(cooked, "raw", { value: __freeze(cooked.slice()) }));
var _a;
const prerender = false;
const $$ = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate(_a || (_a = __template(['<html lang="en" data-astro-cid-azekzua6> <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">', "<!-- Native typography stack --><!-- Admin is always dark mode --><script>document.documentElement.className = 'dark';<\/script>", `</head> <body class="bg-zinc-950 text-zinc-100 selection:bg-indigo-500/30" data-astro-cid-azekzua6> <!-- Loading skeleton shown before React island hydrates --> <div id="admin-skeleton" class="flex min-h-screen bg-zinc-950" data-astro-cid-azekzua6> <div class="w-60 bg-black border-r border-zinc-900 p-5 shrink-0 flex flex-col gap-1.5" data-astro-cid-azekzua6> <div class="h-9 rounded-lg bg-zinc-900 mb-4" data-astro-cid-azekzua6></div> <div class="h-2.5 rounded bg-zinc-900 w-3/5 mb-2" data-astro-cid-azekzua6></div> <div class="h-8 rounded-md bg-zinc-900" data-astro-cid-azekzua6></div> <div class="h-8 rounded-md bg-zinc-900" data-astro-cid-azekzua6></div> <div class="h-8 rounded-md bg-zinc-900" data-astro-cid-azekzua6></div> <div class="h-8 rounded-md bg-zinc-900" data-astro-cid-azekzua6></div> <div class="h-2.5 rounded bg-zinc-900 w-3/5 my-2" data-astro-cid-azekzua6></div> <div class="h-8 rounded-md bg-zinc-900" data-astro-cid-azekzua6></div> <div class="h-8 rounded-md bg-zinc-900" data-astro-cid-azekzua6></div> <div class="h-8 rounded-md bg-zinc-900" data-astro-cid-azekzua6></div> </div> <div class="flex-1 p-8 flex flex-col gap-5" data-astro-cid-azekzua6> <div class="h-12 rounded-lg bg-zinc-900 w-1/2" data-astro-cid-azekzua6></div> <div class="grid grid-cols-4 gap-4" data-astro-cid-azekzua6> <div class="h-22 rounded-xl bg-zinc-900" data-astro-cid-azekzua6></div> <div class="h-22 rounded-xl bg-zinc-900" data-astro-cid-azekzua6></div> <div class="h-22 rounded-xl bg-zinc-900" data-astro-cid-azekzua6></div> <div class="h-22 rounded-xl bg-zinc-900" data-astro-cid-azekzua6></div> </div> <div class="flex items-center gap-3 mt-1" data-astro-cid-azekzua6> <div class="w-6 h-6 border-2 border-zinc-700 border-t-zinc-400 rounded-full animate-spin" data-astro-cid-azekzua6></div> <span class="text-zinc-500 text-xs font-sans" data-astro-cid-azekzua6>Loading Admin Panel...</span> </div> </div> </div> <script>
      // Hide skeleton once React has mounted
      document.addEventListener('astro:hydrate', function() {
        var sk = document.getElementById('admin-skeleton');
        if (sk) sk.style.display = 'none';
      }, { once: true });
      // Fallback: hide after 5s regardless
      setTimeout(function() {
        var sk = document.getElementById('admin-skeleton');
        if (sk) sk.style.display = 'none';
      }, 5000);
    <\/script> `, " </body></html>"])), renderComponent($$result, "FirebaseRuntimeConfig", $$FirebaseRuntimeConfig, { "data-astro-cid-azekzua6": true }), renderHead(), renderComponent($$result, "AdminRouter", null, { "client:only": "react", "client:component-hydration": "only", "data-astro-cid-azekzua6": true, "client:component-path": "/home/runner/work/GooglePhotosTakeout/GooglePhotosTakeout/webapp/src/components/admin/layout/AdminRouter", "client:component-export": "default" }));
}, "/home/runner/work/GooglePhotosTakeout/GooglePhotosTakeout/webapp/src/pages/admin/[...all].astro", void 0);
const $$file = "/home/runner/work/GooglePhotosTakeout/GooglePhotosTakeout/webapp/src/pages/admin/[...all].astro";
const $$url = "/admin/[...all].html";
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$,
  file: $$file,
  prerender,
  url: $$url
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
export {
  page
};
