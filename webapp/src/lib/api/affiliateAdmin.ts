export async function authorizeAffiliateAdmin(request: Request, apiKey: string, useEmulators = false): Promise<number> {
  const match = /^Bearer ([^\s]+)$/.exec(request.headers.get('Authorization') || '');
  if (!match || match[1].length > 8192) return 401;
  if (!apiKey) return 503;
  const token = match[1];
  try {
    const authOrigin = useEmulators ? 'http://127.0.0.1:9099/identitytoolkit.googleapis.com' : 'https://identitytoolkit.googleapis.com';
    const firestoreOrigin = useEmulators ? 'http://127.0.0.1:8080' : 'https://firestore.googleapis.com';
    const identityResponse = await fetch(`${authOrigin}/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token }), signal: AbortSignal.timeout(5000)
    });
    if (identityResponse.status === 400 || identityResponse.status === 401) return 401;
    if (!identityResponse.ok) return 503;
    const account = (await identityResponse.json())?.users?.[0];
    const uid = account?.localId;
    if (typeof uid !== 'string' || !uid || uid.length > 128 || uid.includes('/') || uid === '.' || uid === '..') return 401;
    if (account.disabled === true) return 403;
    if (account.emailVerified === true && account.email === 'rahuljena.dev@gmail.com') return 200;
    const adminResponse = await fetch(`${firestoreOrigin}/v1/projects/takeout-fix/databases/(default)/documents/admins/${encodeURIComponent(uid)}`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000)
    });
    if (adminResponse.status === 403 || adminResponse.status === 404) return 403;
    if (!adminResponse.ok) return 503;
    const admin = await adminResponse.json();
    return ['ADMIN', 'SUPER_ADMIN'].includes(admin?.fields?.role?.stringValue) ? 200 : 403;
  } catch {
    return 503;
  }
}
