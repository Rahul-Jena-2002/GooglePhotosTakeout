export const prerender = false;
import type { APIRoute } from 'astro';

const DEFAULT_CLOUD_FUNCTION_BASE = 'https://us-central1-takeout-fix.cloudfunctions.net/geminiToolGateway';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const url = new URL(request.url);
    const pathname = url.pathname;
    
    // 1. Resolve target endpoint name from path (e.g. /api/sync-dodo-prices -> sync-dodo-prices)
    const endpoint = pathname.split('/').pop() || '';
    
    // 2. Load env config
    const runtimeEnv = (locals as any)?.runtime?.env || {};
    const gatewayApiKey = runtimeEnv.GATEWAY_API_KEY || import.meta.env.GATEWAY_API_KEY || '';
    let cfBase = (runtimeEnv.CLOUD_FUNCTION_URL || import.meta.env.CLOUD_FUNCTION_URL || DEFAULT_CLOUD_FUNCTION_BASE).trim();
    
    // Normalize target URL (strip trailing /)
    if (cfBase.endsWith('/')) {
      cfBase = cfBase.slice(0, -1);
    }
    
    const targetUrl = `${cfBase}/${endpoint}`;

    // 3. Authorization check for admin endpoints
    const isAdminEndpoint = endpoint === 'sync-dodo-prices' || endpoint === 'sync-coupon';
    if (isAdminEndpoint) {
      const clientApiKey = request.headers.get('x-api-key') || '';
      if (gatewayApiKey && clientApiKey !== gatewayApiKey) {
        return new Response(JSON.stringify({ error: 'Unauthorized: Invalid x-api-key.' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // 4. Read request body
    const requestBody = await request.text();

    // 5. Clone and forward headers
    const forwardHeaders = new Headers();
    
    // Copy content type and other standard headers
    const headersToForward = ['content-type', 'webhook-id', 'webhook-timestamp', 'webhook-signature', 'authorization'];
    for (const h of headersToForward) {
      const val = request.headers.get(h);
      if (val) {
        forwardHeaders.set(h, val);
      }
    }
    
    // Always include x-api-key for authentication on backend Cloud Functions
    const apiKeyToSend = request.headers.get('x-api-key') || gatewayApiKey;
    if (apiKeyToSend) {
      forwardHeaders.set('x-api-key', apiKeyToSend);
    }

    console.log(`📡 [Proxy] Forwarding request to Cloud Function: POST ${targetUrl}`);

    // 6. Make fetch call to Firebase Cloud Function
    const cfResponse = await fetch(targetUrl, {
      method: 'POST',
      headers: forwardHeaders,
      body: requestBody || undefined
    });

    const responseText = await cfResponse.text();
    
    // 7. Return the response back to the client
    return new Response(responseText, {
      status: cfResponse.status,
      headers: {
        'Content-Type': cfResponse.headers.get('content-type') || 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (err: any) {
    console.error(`❌ [Proxy Error] Failed to proxy request:`, err.message);
    return new Response(JSON.stringify({ error: 'Proxy request failure', message: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, webhook-id, webhook-timestamp, webhook-signature'
    }
  });
};
