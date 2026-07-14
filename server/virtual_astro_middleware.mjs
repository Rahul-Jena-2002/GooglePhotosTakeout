globalThis.process ??= {};
globalThis.process.env ??= {};
import { d as defineMiddleware, s as sequence } from "./chunks/sequence_CYI-qUsb.mjs";
const actionKeys = ["restore", "fix", "recover"];
const targetKeys = ["metadata", "exif", "gps", "date-taken", "timestamp"];
const sourceKeys = ["takeout", "photos"];
const validSlugs = /* @__PURE__ */ new Set();
for (const action of actionKeys) {
  for (const target of targetKeys) {
    for (const source of sourceKeys) {
      validSlugs.add(`how-to-${action}-${target}-from-${source}`);
    }
  }
}
const onRequest$1 = defineMiddleware(async (context, next) => {
  const { seoSlug } = context.params;
  if (seoSlug !== void 0) {
    const slug = seoSlug.toLowerCase();
    if (!validSlugs.has(slug)) {
      return new Response("Not Found", { status: 404 });
    }
  }
  return next();
});
const onRequest = sequence(
  onRequest$1
);
export {
  onRequest
};
