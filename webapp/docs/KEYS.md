# TakeoutFix Key Management Reference

This document describes all API keys, secrets, and configuration values used in the TakeoutFix webapp, their security classification, encryption status, and setup procedures.

## Key Classification

### Sensitive Keys (Encrypted at Rest)
These keys must be encrypted before being stored in Firestore. They are decrypted at runtime only when needed.

- **Gateway API Key** — Used by Cloud Functions to call the geminiToolGateway endpoint. Regenerate in Google Cloud Console.
- **Dodo Live API Key** — Live payment processor credentials. Retrieve from Dodo Payments dashboard → API Keys.
- **Dodo Test API Key** — Test environment credentials for staging. Retrieve from Dodo Payments dashboard.
- **Dodo Webhook Signing Secret** — HMAC signing key for verifying Dodo webhook payloads. Generate in Dodo dashboard.
- **Gemini API Key** — Google AI model credentials. Generate in Google AI Studio or Google Cloud Console.

### Public/Build-Time Configuration (Plaintext)
These can be stored plaintext in Firestore and `.env` files, as they are not secrets.

- **Cloud Function URL** — Deployed Cloud Functions endpoint (e.g., `https://us-central1-{project}.cloudfunctions.net/geminiToolGateway`)
- **IndexNow Key** — SEO indexing key from Bing IndexNow. Available in Bing Webmaster Tools.
- **Firebase Configuration** — Public Firebase app credentials (API Key, Auth Domain, Project ID, Storage Bucket, Messaging Sender ID, App ID, Measurement ID)
- **Sentry DSN** — Error tracking service endpoint

## Encryption & Decryption

### Browser (AdminKeys.tsx)
1. Admin enters a Master Encryption Key (MEK) — a 32-byte hex string — via a password input.
2. MEK is stored only in React state (never localStorage/Firestore/cookies).
3. Sensitive keys are decrypted in memory for editing using `decrypt(ciphertext, key)`.
4. On save, sensitive keys are re-encrypted using `encrypt(plaintext, key)`.
5. If MEK is missing, encrypted fields display as locked (🔒) and are read-only.

### Server (Node.js)
1. `functions/lib/crypto.js` provides `decrypt(ciphertext, key)` using Node's crypto module.
2. At runtime, Cloud Functions read encrypted secrets from Firestore, decrypt them using the MEK (provided via environment variable), and use the decrypted value.
3. The MEK is never stored in Firestore or source code — it is provided at deployment time.

## Setup Instructions

### 1. Generate Master Encryption Key (MEK)
```bash
# Generate a random 32-byte key and output as hex
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Store this securely (e.g., in a password manager, CI/CD secrets). This is the single key needed to decrypt all secrets.

### 2. Configure Environment Variables

#### Plaintext Keys (safe to commit to `.env` and version control)
```env
# Cloud Functions
VITE_CLOUD_FUNCTION_URL=https://us-central1-gt-metadata-merger.cloudfunctions.net/geminiToolGateway

# SEO
INDEXNOW_KEY=your-indexnow-key-from-bing-webmaster-tools

# Firebase (public config)
VITE_PUBLIC_FIREBASE_API_KEY=your-firebase-api-key
VITE_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_PUBLIC_FIREBASE_PROJECT_ID=gt-metadata-merger
VITE_PUBLIC_FIREBASE_STORAGE_BUCKET=your-storage-bucket.appspot.com
VITE_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abcdef
VITE_PUBLIC_FIREBASE_MEASUREMENT_ID=G-XXXXXXX

# Sentry (public endpoint)
VITE_SENTRY_DSN=https://your-sentry-key@sentry.io/your-project-id
```

#### Sensitive Keys (DO NOT commit; store in Admin UI or CI/CD secrets)
These should be:
1. **Initially set in Admin UI** (`/admin/keys`)
2. **Encrypted and stored in Firestore** with `enc:v1:` prefix
3. **Decrypted at runtime** using the MEK

Keys to store:
- Gateway API Key
- Dodo Live API Key
- Dodo Test API Key
- Dodo Webhook Signing Secret
- Gemini API Key

### 3. First-Time Setup in AdminKeys UI

1. Navigate to `/admin/keys` (admin-only route)
2. Enter the MEK (32-byte hex from step 1) in the "Master Encryption Key" input
3. Fill in all "Sensitive Keys" sections:
   - Gateway API Key (from Google Cloud)
   - Dodo Live API Key (from Dodo Payments)
   - Dodo Test API Key (from Dodo Payments)
   - Dodo Webhook Secret (from Dodo Payments)
   - Gemini API Key (from Google AI Studio)
4. Click "Save" — keys are encrypted and written to Firestore under `settings/secure`

### 4. Deploy to Production

Provide the MEK via environment variable on deployment:
```bash
# Deploy to Cloud Functions with MEK
export ENCRYPTION_KEY=<32-byte-hex-mek-from-step-1>
firebase deploy --only functions
```

Or in CI/CD (GitHub Actions, etc.):
```yaml
env:
  ENCRYPTION_KEY: ${{ secrets.ENCRYPTION_KEY }}
firebase deploy --only functions
```

## Migration Path

### For Existing Keys Currently in Firestore (Plaintext)
1. Read the plaintext value from Firestore
2. In AdminKeys UI, enter the MEK
3. Paste the plaintext value into the sensitive key field
4. Click "Save" — it will encrypt and overwrite the plaintext version

### For Hardcoded Keys in Code/Scripts
1. Remove them from source code (commit a fix)
2. Store the value in AdminKeys UI (encrypted)
3. At runtime, read from Firestore and decrypt

## Firestore Structure

### `/settings/global` (Plaintext Configuration)
```json
{
  "cloud_function_url": "https://...",
  "indexnow_key": "...",
  "firebase_config": { ... },
  "sentry_dsn": "...",
  "dodo_products": { ... }
}
```

### `/settings/secure` (Encrypted Secrets)
```json
{
  "gateway_api_key": "enc:v1:...",
  "dodo_live_api_key": "enc:v1:...",
  "dodo_test_api_key": "enc:v1:...",
  "dodo_webhook_secret": "enc:v1:...",
  "gemini_api_key": "enc:v1:..."
}
```

## Script Environment Variables

### submit_indexnow.js
```bash
INDEXNOW_KEY=your-key SITE_URL=https://yourdomain.com node scripts/submit_indexnow.js
```

### setup_dodo_products.js
```bash
DODO_API_KEY=sk_live_... node scripts/setup_dodo_products.js
```

Optional Firebase OAuth credentials (for token refresh):
```bash
FIREBASE_OAUTH_CLIENT_ID=... FIREBASE_OAUTH_CLIENT_SECRET=... node scripts/setup_dodo_products.js
```

### trigger_dodo_webhook.js
```bash
PUBLIC_FIREBASE_API_KEY=... PUBLIC_FIREBASE_PROJECT_ID=... node scripts/trigger_dodo_webhook.js <userId> [plan] [targetUrl]
```

## Security Best Practices

1. **MEK Storage:**
   - Never commit the MEK to version control
   - Store in CI/CD secrets manager (GitHub Actions, GitLab CI, etc.)
   - Use a password manager for local development

2. **Firestore Rules:**
   - Restrict read/write to `settings/secure` to admin-only
   - Restrict read of `settings/global` to all authenticated users
   - Use custom claims for role-based access

3. **Key Rotation:**
   - Rotate Dodo API keys every 90 days
   - Regenerate Gateway API Key if compromised
   - Update MEK only when absolutely necessary (affects all encrypted values)

4. **Monitoring:**
   - Enable audit logging on all Firestore writes to `settings/*`
   - Alert on unexpected access patterns
   - Monitor Cloud Functions logs for decryption errors

## Troubleshooting

### "Invalid encrypted data format" Error
- MEK mismatch: Ensure the MEK entered in AdminKeys matches the one used at deployment
- Corrupted ciphertext: Check Firestore for valid `enc:v1:...` prefix
- Browser crypto API unavailable: Use a modern browser (Chrome, Firefox, Safari, Edge)

### Encrypted Fields Show as Locked
- MEK not entered: Click the lock icon and enter the 32-byte hex MEK
- Browser session expired: Refresh and re-enter MEK
- Service Worker caching: Clear browser cache and reload

### Cloud Functions Cannot Decrypt Secrets
- `ENCRYPTION_KEY` env var not set: Add to deployment configuration
- Wrong MEK value: Verify it matches the one used in AdminKeys
- Firestore read failed: Check Cloud Functions IAM permissions

## Related Files

- `/webapp/src/lib/crypto.ts` — Browser-side encryption utilities
- `/webapp/functions/lib/crypto.js` — Node.js decryption helper
- `/webapp/src/react-pages/AdminKeys.tsx` — Admin UI for key management
- `/webapp/functions/local-server.js` — Local development server (uses crypto.js)
- `/webapp/functions/index.js` — Cloud Functions (uses crypto.js)
