export const prerender = false;
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { isValidInviteId, readInviteIdentity } from '../../lib/api/inviteIdentity';

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
    btoa(str).replaceAll("=", "").replaceAll("+", "-").replaceAll("/", "_");

  const unsignedToken = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;

  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  const pemContents = serviceAccount.private_key
    .replaceAll(String.raw`\n`, "\n")
    .replaceAll(pemHeader, "")
    .replaceAll(pemFooter, "")
    .replaceAll(/\s/g, "");
  
  const binaryKey = atob(pemContents);
  const keyBuffer = new Uint8Array(binaryKey.length);
  for (let i = 0; i < binaryKey.length; i++) {
    keyBuffer[i] = binaryKey.codePointAt(i) ?? 0;
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

  const signedToken = `${unsignedToken}.${btoa(String.fromCodePoint(...new Uint8Array(signature)))
    .replaceAll("=", "")
    .replaceAll("+", "-")
    .replaceAll("/", "_")}`;

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

    if (!isValidInviteId(inviteId)) {
      return json(400, { error: 'Invalid invitation ID.' });
    }

    const runtimeEnv = env as any;
    const serviceAccountStr =
      (env as any)?.FIREBASE_SERVICE_ACCOUNT ||
      runtimeEnv?.FIREBASE_SERVICE_ACCOUNT ||
      (import.meta as any).env?.FIREBASE_SERVICE_ACCOUNT ||
      (typeof process !== 'undefined' ? process.env.FIREBASE_SERVICE_ACCOUNT : undefined);
    if (!serviceAccountStr) {
      return json(500, { error: 'Server configuration error: missing service account credentials.' });
    }

    const serviceAccount = JSON.parse(serviceAccountStr);
    const projectId = serviceAccount.project_id || 'takeout-fix';

    // Step A: Fetch the invitation document from Firestore REST API using the user's ID token.
    // This leverages Firestore security rules to verify that the user owns the email on the invite.
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
    const expiresAtStr = inviteFields.expiresAt?.timestampValue || inviteFields.expiresAt?.stringValue;
    const role = inviteFields.role?.stringValue;
    if (!['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'MODERATOR', 'DEVELOPER'].includes(role)) {
      return json(400, { error: 'Invalid invitation role.' });
    }

    if (status !== 'pending') {
      return json(400, { error: `This invitation is already ${status}.` });
    }

    const now = Date.now();
    const expiresAtMs = new Date(expiresAtStr).getTime();
    if (!Number.isFinite(expiresAtMs) || now >= expiresAtMs) {
      return json(400, { error: 'This invitation has expired.' });
    }

    // Step B: Decode user token to extract metadata (since we successfully authenticated it with Firestore)
    const identity = readInviteIdentity(idToken);
    const inviteEmail = inviteFields.email?.stringValue;
    if (!identity || typeof inviteEmail !== 'string' || identity.email.toLowerCase() !== inviteEmail.toLowerCase()) {
      return json(403, { error: 'Use the verified email address on this invitation.' });
    }
    const { uid: userId, email: userEmail, name: userName } = identity;

    // Step C: Generate Service Account Auth Token to write with admin credentials
    const adminToken = await getGoogleAuthToken(serviceAccount);
    const adminHeaders = {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    };

    if (typeof inviteDoc.updateTime !== 'string') return json(500, { error: 'Invitation version unavailable.' });
    const documentRoot = `projects/${projectId}/databases/(default)/documents`;
    const commitUrl = `https://firestore.googleapis.com/v1/${documentRoot}:commit`;
    const commitRes = await fetch(commitUrl, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ writes: [
        {
          update: { name: `${documentRoot}/adminInvites/${inviteId}`, fields: {
            status: { stringValue: 'accepted' }, acceptedAt: { integerValue: String(now) }, acceptedUid: { stringValue: userId }
          } },
          updateMask: { fieldPaths: ['status', 'acceptedAt', 'acceptedUid'] },
          currentDocument: { updateTime: inviteDoc.updateTime }
        },
        {
          update: { name: `${documentRoot}/admins/${userId}`, fields: {
            uid: { stringValue: userId }, email: { stringValue: userEmail }, displayName: { stringValue: userName },
            role: { stringValue: role }, status: { stringValue: 'online' }, lastSeen: { integerValue: String(now) }, createdAt: { integerValue: String(now) }
          } },
          currentDocument: { exists: false }
        },
        {
          update: { name: `${documentRoot}/users/${userId}`, fields: { isAdmin: { booleanValue: true } } },
          updateMask: { fieldPaths: ['isAdmin'] }
        }
      ] })
    });
    if (!commitRes.ok) {
      console.error('Failed to atomically accept invitation:', await commitRes.text());
      return json(500, { error: 'Invitation could not be accepted. Check its status or contact support.' });
    }

    return json(200, { success: true, message: 'Invitation accepted successfully.' });
  } catch (err: unknown) {
    console.error('[accept-invite] Request failed:', err instanceof Error ? err.name : typeof err);
    return json(500, { error: 'ServerError', message: 'Invitation could not be accepted. Please try again.' });
  }
};
