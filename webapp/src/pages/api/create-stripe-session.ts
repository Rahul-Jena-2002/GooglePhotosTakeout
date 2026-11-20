export const prerender = false;
import type { APIRoute } from 'astro';

import { env } from 'cloudflare:workers';
import { resolveGatewayBase } from '../../lib/api/gatewayUrl';

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

    const CF_BASE = resolveGatewayBase((env as any).CLOUD_FUNCTION_URL || import.meta.env.CLOUD_FUNCTION_URL, import.meta.env.DEV);

    const targetUrl = `${String(CF_BASE).replace(/\/$/, '')}/create-stripe-session`;

    const upstream = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (upstream.status >= 500) {
      return json(502, { error: 'ProxyError', message: 'Checkout is unavailable. Please try again later.' });
    }

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
    console.error('[create-stripe-session] Request failed:', err instanceof Error ? err.name : typeof err);
    return json(500, {
      error: 'ProxyError',
      message: 'Checkout is unavailable. Please try again later.'
    });
  }
};
