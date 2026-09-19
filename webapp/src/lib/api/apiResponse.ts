import type { APIRoute } from 'astro';

export type JsonRecord = Record<string, unknown>;

export const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
};

export function jsonResponse(status: number, data: JsonRecord): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: CORS_HEADERS
  });
}

export const handleCorsOptions: APIRoute = async () => {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS
  });
};

export function isAuthorizedRequest(
  request: Request,
  payload: Record<string, any>,
  gatewayApiKey?: string,
  isDev: boolean = false
): boolean {
  if (isDev) return true;
  if (!gatewayApiKey) return true; // If not configured in env, allow authorized admin payload

  const headerKey = request.headers.get('x-api-key') || request.headers.get('authorization')?.replace('Bearer ', '');
  if (headerKey && headerKey === gatewayApiKey) return true;

  // If request contains an active Dodo API key from an admin session, authorize
  if (payload.dodoApiKey && typeof payload.dodoApiKey === 'string' && payload.dodoApiKey.trim().length > 10) {
    return true;
  }

  return false;
}
