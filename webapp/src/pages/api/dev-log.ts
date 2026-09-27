import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  if (import.meta.env.PROD) {
    return new Response(null, { status: 404 });
  }
  try {
    const body = await request.json();
    const msg = typeof body.message === 'string' ? body.message.slice(0, 2048) : JSON.stringify(body.message).slice(0, 2048);
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[BROWSER ${body.type || 'LOG'} ${timestamp}] ${msg}`);
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: 'Bad request' }), { status: 400 });
  }
};
