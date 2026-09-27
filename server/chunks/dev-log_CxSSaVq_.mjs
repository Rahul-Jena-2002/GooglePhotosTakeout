globalThis.process ??= {};
globalThis.process.env ??= {};
const prerender = false;
const POST = async ({ request }) => {
  {
    return new Response(null, { status: 404 });
  }
};
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  POST,
  prerender
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
export {
  page
};
