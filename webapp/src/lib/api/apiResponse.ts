import type { APIRoute } from 'astro';

export type JsonRecord = Record<string, unknown>;

export function parseJsonObject(raw: string): JsonRecord {
  const value: unknown = JSON.parse(raw || '{}');
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Expected a JSON object');
  }
  return value as JsonRecord;
}

export async function readJsonObject(request: Request, maxBytes = 1024 * 1024): Promise<JsonRecord> {
  if (!request.body) return {};
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let raw = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new RangeError('Request body too large');
      }
      raw += decoder.decode(value, { stream: true });
    }
    return parseJsonObject(raw + decoder.decode());
  } finally {
    reader.releaseLock();
  }
}

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
  _payload: Record<string, any>,
  gatewayApiKey?: string
): boolean {
  if (!gatewayApiKey) return false; // Fail closed: unconfigured gateway secret must reject external callers

  const headerKey = request.headers.get('x-api-key') || request.headers.get('authorization')?.replace('Bearer ', '');
  if (headerKey && headerKey === gatewayApiKey) return true;

  return false;
}
