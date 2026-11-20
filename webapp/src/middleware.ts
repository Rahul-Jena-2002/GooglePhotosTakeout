import { defineMiddleware } from 'astro:middleware';
import { CURATED_SEO_PAGES } from './config/seoPages';
import { secureApiResponse } from './lib/apiSecurityHeaders';

export const onRequest = defineMiddleware(async (context, next) => {
  const { seoSlug } = context.params;
  if (seoSlug !== undefined) {
    const slug = seoSlug.toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(CURATED_SEO_PAGES, slug)) {
      return new Response("Not Found", { status: 404 });
    }
  }
  const response = await next();
  if (!context.url.pathname.startsWith('/api/')) return response;

  return secureApiResponse(response);
});
