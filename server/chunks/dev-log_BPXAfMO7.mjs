globalThis.process ??= {};
globalThis.process.env ??= {};
const prerender = false;
const POST = async ({ request }) => {
  try {
    const body = await request.json();
    const timestamp = (/* @__PURE__ */ new Date()).toLocaleTimeString();
    const prefix = `[BROWSER ${body.type || "LOG"} ${timestamp}]`;
    console.log(`${prefix} ${typeof body.message === "string" ? body.message : JSON.stringify(body.message)}`);
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err) {
    console.error("[BROWSER LOG ERROR]", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 200 });
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
