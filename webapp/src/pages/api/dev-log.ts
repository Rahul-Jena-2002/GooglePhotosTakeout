import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const timestamp = new Date().toLocaleTimeString();
    const prefix = `[BROWSER ${body.type || 'LOG'} ${timestamp}]`;
    
    console.log(`${prefix} ${typeof body.message === 'string' ? body.message : JSON.stringify(body.message)}`);
    
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err: any) {
    console.error('[BROWSER LOG ERROR]', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 200 });
  }
};
