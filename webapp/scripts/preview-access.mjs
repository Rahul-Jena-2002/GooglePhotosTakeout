// Wrap a preview Worker so every request, including assets, requires its preview secret.
export function protectPreview(app, redirects = new Map()) {
  return {
    fetch(request, env, context) {
      if (!env.PREVIEW_ACCESS_KEY || request.headers.get('x-preview-key') !== env.PREVIEW_ACCESS_KEY) {
        return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
      }
      const url = new URL(request.url);
      const redirect = redirects.get(url.pathname);
      if (redirect) {
        url.pathname = redirect[0];
        return Response.redirect(url.toString(), redirect[1]);
      }
      return app.fetch(request, env, context);
    },
  };
}
