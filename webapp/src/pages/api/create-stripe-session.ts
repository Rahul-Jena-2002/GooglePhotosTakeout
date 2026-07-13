export const prerender = false;
import type { APIRoute } from 'astro';

import { env } from 'cloudflare:workers';

type JsonRecord = Record<string, unknown>;

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

export const POST: APIRoute = async ({ request }) => {
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

    const CF_BASE =
      (env as any).CLOUD_FUNCTION_URL ||
      import.meta.env.CLOUD_FUNCTION_URL ||
      'https://us-central1-takeout-fix.cloudfunctions.net/geminiToolGateway';

    const targetUrl = `${String(CF_BASE).replace(/\/$/, '')}/create-stripe-session`;

    const upstream = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const text = await upstream.text();
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
