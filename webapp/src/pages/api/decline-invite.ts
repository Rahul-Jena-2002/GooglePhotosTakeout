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

// Generate Google OAuth2 Token using Service Account Private Key
async function getGoogleAuthToken(serviceAccount: any): Promise<string> {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600;
  
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/datastore",
    iat,
    exp
  };

  const base64UrlEncode = (str: string) =>
    btoa(str).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const unsignedToken = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;

  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  const pemContents = serviceAccount.private_key
    .replace(/\\n/g, "\n")
    .replace(pemHeader, "")
    .replace(pemFooter, "")
    .replace(/\s/g, "");
  
  const binaryKey = atob(pemContents);
  const keyBuffer = new Uint8Array(binaryKey.length);
  for (let i = 0; i < binaryKey.length; i++) {
    keyBuffer[i] = binaryKey.charCodeAt(i);
  }

  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    encoder.encode(unsignedToken)
  );

  const signedToken = `${unsignedToken}.${btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${signedToken}`
  });
  
  if (!res.ok) {
    throw new Error(`Google Auth exchange failed: ${await res.text()}`);
  }

  const data: any = await res.json();
  return data.access_token;
}

export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const authHeader = request.headers.get('authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return json(401, { error: 'Missing or invalid authorization header.' });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const { inviteId } = await request.json();

    if (!inviteId) {
      return json(400, { error: 'inviteId is required.' });
    }

    const serviceAccountStr = (env as any).FIREBASE_SERVICE_ACCOUNT || import.meta.env.FIREBASE_SERVICE_ACCOUNT;
    if (!serviceAccountStr) {
      return json(500, { error: 'Server configuration error: missing service account credentials.' });
    }

    const serviceAccount = JSON.parse(serviceAccountStr);
    const projectId = serviceAccount.project_id || 'takeout-fix';

    // Step A: Fetch the invitation document from Firestore REST API using the user's ID token.
    const inviteUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/adminInvites/${inviteId}`;
    const userHeaders = {
      'Authorization': `Bearer ${idToken}`,
      'Content-Type': 'application/json'
    };

    const inviteRes = await fetch(inviteUrl, { headers: userHeaders });
    if (!inviteRes.ok) {
      return json(inviteRes.status, { error: 'Access denied or invitation not found.' });
    }

    const inviteDoc = await inviteRes.json();
    const inviteFields = inviteDoc.fields;
    const status = inviteFields.status?.stringValue;

    if (status !== 'pending') {
      return json(400, { error: `This invitation is already ${status}.` });
    }

    const now = Date.now();

    // Step B: Generate Service Account Auth Token to write with admin credentials
    const adminToken = await getGoogleAuthToken(serviceAccount);
    const adminHeaders = {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    };

    // Update invitation document status to declined
    const updateInviteUrl = `${inviteUrl}?updateMask.fieldPaths=status&updateMask.fieldPaths=declinedAt`;
    const updateInviteBody = {
      fields: {
        status: { stringValue: 'declined' },
        declinedAt: { integerValue: String(now) }
      }
    };
    const updateInviteRes = await fetch(updateInviteUrl, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify(updateInviteBody)
    });
    if (!updateInviteRes.ok) {
      return json(500, { error: 'Failed to decline invitation.', details: await updateInviteRes.text() });
    }

    return json(200, { success: true, message: 'Invitation declined successfully.' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return json(500, { error: 'ServerError', message });
  }
};
