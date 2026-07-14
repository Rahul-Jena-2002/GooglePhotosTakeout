globalThis.process ??= {};
globalThis.process.env ??= {};
import { env } from "cloudflare:workers";
const prerender = false;
function json(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
const OPTIONS = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key"
    }
  });
};
const POST = async ({ request }) => {
  try {
    const raw = await request.text();
    let payload = {};
    try {
      const parsed = JSON.parse(raw || "{}");
      if (parsed && typeof parsed === "object") {
        payload = parsed;
      }
    } catch {
      return json(400, { error: "Invalid JSON body" });
    }
    const CF_BASE = env.CLOUD_FUNCTION_URL || (false ? void 0 : null) || void 0 || "https://us-central1-takeout-fix.cloudfunctions.net/geminiToolGateway";
    const targetUrl = `${String(CF_BASE).replace(/\/$/, "")}/create-stripe-session`;
    const upstream = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const text = await upstream.text();
    const contentType = upstream.headers.get("content-type") || "application/json";
    return new Response(text, {
      status: upstream.status,
      headers: {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json(500, {
      error: "ProxyError",
      message
    });
  }
};
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  OPTIONS,
  POST,
  prerender
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
export {
  page
};
