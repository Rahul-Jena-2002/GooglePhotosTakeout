export const prerender = false;
import type { APIRoute } from 'astro';

type JsonRecord = Record<string, unknown>;
type RuntimeEnv = Record<string, string | undefined>;
type RuntimeLocals = { runtime?: { env?: RuntimeEnv } };

function json(status: number, data: JsonRecord): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key'
    }
  });
};

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const raw = await request.text();
    let payload: JsonRecord = {};
    try {
      const parsed = JSON.parse(raw || '{}');
      if (parsed && typeof parsed === 'object') {
        payload = parsed as JsonRecord;
      }
    } catch {
      return json(400, { error: 'Invalid JSON body' });
    }

    const runtimeEnv: RuntimeEnv =
      (locals as unknown as RuntimeLocals)?.runtime?.env ||
      ({} as RuntimeEnv);
    const CF_BASE =
      runtimeEnv.CLOUD_FUNCTION_URL ||
      import.meta.env.CLOUD_FUNCTION_URL ||
      'https://us-central1-takeout-fix.cloudfunctions.net/geminiToolGateway';

    const GATEWAY_API_KEY =
      runtimeEnv.GATEWAY_API_KEY ||
      import.meta.env.GATEWAY_API_KEY ||
      '';

    const targetUrl = `${CF_BASE.replace(/\/$/, '')}/sync-dodo-prices`;

    const upstream = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(GATEWAY_API_KEY ? { 'x-api-key': GATEWAY_API_KEY } : {}),
        ...(GATEWAY_API_KEY ? { Authorization: `Bearer ${GATEWAY_API_KEY}` } : {})
      },
      body: JSON.stringify(payload)
    });

    const text = await upstream.text();
    // Try to preserve content-type if provided
    const contentType = upstream.headers.get('content-type') || 'application/json';

    return new Response(text, {
      status: upstream.status,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return json(500, {
      error: 'ProxyError',
      message
    });
  }
};