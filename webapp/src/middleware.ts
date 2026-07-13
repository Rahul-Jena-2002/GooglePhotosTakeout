import { defineMiddleware } from 'astro:middleware';

const actionKeys = ["restore", "fix", "recover"];
const targetKeys = ["metadata", "exif", "gps", "date-taken", "timestamp"];
const sourceKeys = ["takeout", "photos"];

const validSlugs = new Set<string>();
for (const action of actionKeys) {
  for (const target of targetKeys) {
    for (const source of sourceKeys) {
      validSlugs.add(`how-to-${action}-${target}-from-${source}`);
    }
  }
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { seoSlug } = context.params;
  if (seoSlug !== undefined) {
    const slug = seoSlug.toLowerCase();
    if (!validSlugs.has(slug)) {
      return new Response("Not Found", { status: 404 });
    }
  }
  return next();
});
