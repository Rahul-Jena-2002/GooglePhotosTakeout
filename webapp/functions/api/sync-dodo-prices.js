/**
 * Cloudflare Pages Function: /api/sync-dodo-prices
 * Proxies the sync-dodo-prices request to the Firebase Cloud Function backend.
 * This runs as an edge function on Cloudflare Pages.
 */
export async function onRequestPost(context) {
  const { request, env } = context;

  // Get the Firebase Cloud Function gateway URL from environment or use default
  const cfGateway = env.CF_GATEWAY_URL || 'https://us-central1-gt-metadata-merger.cloudfunctions.net/geminiToolGateway';
  const apiKey = env.GATEWAY_API_KEY || '';

  try {
    const body = await request.text();

    const resp = await fetch(`${cfGateway}/sync-dodo-prices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body,
    });

    const text = await resp.text();
    return new Response(text, {
      status: resp.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Handle CORS preflight
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
    },
  });
}
