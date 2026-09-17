export interface KeyEntry {
  id: string
  label: string
  description: string
  firestorePath: string   // "collection/docId"
  firestoreField: string
  value: string
  placeholder: string
  link?: string
  linkLabel?: string
  category: string
  sensitive: boolean
}

export const CATEGORIES = ["Cloud Functions", "Payments", "AI / APIs", "Email / Alerts", "SEO", "Frontend (Build-time)"]

export const KEY_DEFINITIONS: Omit<KeyEntry, "value">[] = [
  // ── Cloud Functions ──────────────────────────────────────────────────
  {
    id: "gateway_api_key",
    label: "Gateway API Key",
    description: "Secret used to authenticate requests from the admin frontend to your Cloud Functions (sync-coupon, sync-dodo-prices). Also required as GATEWAY_API_KEY env var when running local-server.js.",
    firestorePath: "settings/system",
    firestoreField: "gateway_api_key",
    placeholder: "takeoutfix-xxxx-xxxx-xxxx",
    category: "Cloud Functions",
    sensitive: true,
  },
  {
    id: "cloud_function_url",
    label: "Cloud Function Base URL",
    description: "Base URL of your deployed Firebase Cloud Function (geminiToolGateway). Used as the endpoint for price sync and coupon sync calls from the admin UI.",
    firestorePath: "settings/system",
    firestoreField: "cloud_function_url",
    placeholder: "https://us-central1-your-project.cloudfunctions.net/geminiToolGateway",
    category: "Cloud Functions",
    sensitive: false,
    link: "https://console.firebase.google.com/project/_/functions",
    linkLabel: "Firebase Functions Console",
  },

  // ── Payments ─────────────────────────────────────────────────────────
  {
    id: "dodo_api_key",
    label: "Dodo Payments Live API Key",
    description: "Live secret API key for Dodo Payments. Used by Cloud Functions and local-server.js to create/update products and discounts. Never expose this in the browser.",
    firestorePath: "settings/system",
    firestoreField: "dodo_api_key",
    placeholder: "Live API Key from Dodo Dashboard",
    category: "Payments",
    sensitive: true,
    link: "https://dashboard.dodopayments.com/",
    linkLabel: "Dodo Dashboard",
  },
  {
    id: "dodo_test_api_key",
    label: "Dodo Payments Test API Key",
    description: "Test/sandbox secret API key for Dodo Payments. Used for testing payment flows without real money. Get this from Dodo Dashboard → API Keys → Test Mode.",
    firestorePath: "settings/system",
    firestoreField: "dodo_test_api_key",
    placeholder: "Test API Key from Dodo Dashboard",
    category: "Payments",
    sensitive: true,
    link: "https://dashboard.dodopayments.com/",
    linkLabel: "Dodo Dashboard",
  },
  {
    id: "dodo_webhook_key",
    label: "Dodo Webhook Signing Secret",
    description: "Webhook secret used to verify Dodo payment webhooks (HMAC SHA-256). Get this from your Dodo Dashboard → Webhooks. Required by the Cloud Function to validate incoming payment events.",
    firestorePath: "settings/secure",
    firestoreField: "dodo_webhook_key",
    placeholder: "whsec_xxxxxxxxxxxxxxxxxxxx",
    category: "Payments",
    sensitive: true,
    link: "https://dashboard.dodopayments.com/",
    linkLabel: "Dodo Dashboard",
  },

  // ── AI / APIs ─────────────────────────────────────────────────────────
  {
    id: "gemini_api_key",
    label: "Gemini API Key (Admin AI)",
    description: "Google Gemini API key used by the Admin Support page to AI-draft and polish ticket replies. Fetched at runtime from Firestore — never bundled into the frontend build.",
    firestorePath: "settings/system",
    firestoreField: "gemini_api_key",
    placeholder: "AIzaSy_xxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    category: "AI / APIs",
    sensitive: true,
    link: "https://aistudio.google.com/app/apikey",
    linkLabel: "Google AI Studio",
  },

  // ── Email / Alerts ────────────────────────────────────────────────────
  {
    id: "emailjs_service_id",
    label: "EmailJS Service ID",
    description: "Service ID for your EmailJS Gmail/SMTP service connected to takeoutfix.support@gmail.com. Used for sending ticket raised alerts and admin invites.",
    firestorePath: "settings/system",
    firestoreField: "emailjs_service_id",
    placeholder: "service_xxxxxxx",
    category: "Email / Alerts",
    sensitive: false,
    link: "https://dashboard.emailjs.com/admin",
    linkLabel: "EmailJS Dashboard",
  },
  {
    id: "emailjs_ticket_template_id",
    label: "EmailJS Ticket Alert Template ID",
    description: "Template ID for support ticket alerts. Populates {{ticket_id}}, {{user_email}}, {{subject}}, {{message}}, {{from_email}}, {{ticket_url}}.",
    firestorePath: "settings/system",
    firestoreField: "emailjs_ticket_template_id",
    placeholder: "template_xxxxxxx",
    category: "Email / Alerts",
    sensitive: false,
    link: "https://dashboard.emailjs.com/admin/templates",
    linkLabel: "EmailJS Templates",
  },
  {
    id: "emailjs_invite_template_id",
    label: "EmailJS Admin Invite Template ID",
    description: "Template ID for admin team invitations. Populates {{to_email}}, {{invited_by}}, {{role}}, {{invite_link}}, {{expires_at}}.",
    firestorePath: "settings/system",
    firestoreField: "emailjs_invite_template_id",
    placeholder: "template_xxxxxxx",
    category: "Email / Alerts",
    sensitive: false,
    link: "https://dashboard.emailjs.com/admin/templates",
    linkLabel: "EmailJS Templates",
  },
  {
    id: "emailjs_public_key",
    label: "EmailJS Public Key",
    description: "Client-side public key from EmailJS Account Settings. Used to authenticate email dispatch calls in the browser.",
    firestorePath: "settings/system",
    firestoreField: "emailjs_public_key",
    placeholder: "xxxxxxxxxxxxxxx",
    category: "Email / Alerts",
    sensitive: false,
    link: "https://dashboard.emailjs.com/admin/account",
    linkLabel: "EmailJS Account",
  },
  {
    id: "recaptcha_site_key",
    label: "Google Cloud reCAPTCHA Enterprise Site Key",
    description: "Enterprise site key protecting sign in, sign up, feedback, and ticket forms (Project: takeout-fix).",
    firestorePath: "settings/system",
    firestoreField: "recaptcha_site_key",
    placeholder: "6LdDpb4tAAAAADJHZzjrMIC-gvDXkAw0rhdgB5Sb",
    category: "Email / Alerts",
    sensitive: false,
    link: "https://console.cloud.google.com/security/recaptcha",
    linkLabel: "Google Cloud reCAPTCHA Console",
  },

  // ── SEO ───────────────────────────────────────────────────────────────
  {
    id: "indexnow_key",
    label: "IndexNow Key",
    description: "IndexNow protocol key for submitting URLs to Bing and other search engines. Also needs a matching verification file at /{key}.txt in the public/ folder. Used by scripts/submit_indexnow.js.",
    firestorePath: "settings/system",
    firestoreField: "indexnow_key",
    placeholder: "e107aca980264801af5ddd4a7fe361a3",
    category: "SEO",
    sensitive: false,
    link: "https://www.indexnow.org/",
    linkLabel: "IndexNow Docs",
  },

  // ── Frontend Build-time ────────────────────────────────────────────────
  {
    id: "firebase_api_key",
    label: "Firebase API Key (Public)",
    description: "Public Firebase web API key. Safe to expose in the browser — Firebase security is enforced by Firestore Rules and Auth, not by this key. Stored in .env as PUBLIC_FIREBASE_API_KEY.",
    firestorePath: "settings/system",
    firestoreField: "firebase_api_key_display",
    placeholder: "AIzaSy_xxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    category: "Frontend (Build-time)",
    sensitive: false,
    link: "https://console.firebase.google.com/project/_/settings/general",
    linkLabel: "Firebase Console",
  },
  {
    id: "firebase_auth_domain",
    label: "Firebase Auth Domain",
    description: "Auth domain for Firebase Authentication. E.g., project-id.firebaseapp.com. Stored in .env as PUBLIC_FIREBASE_AUTH_DOMAIN.",
    firestorePath: "settings/system",
    firestoreField: "firebase_auth_domain_display",
    placeholder: "your-project.firebaseapp.com",
    category: "Frontend (Build-time)",
    sensitive: false,
  },
  {
    id: "firebase_project_id",
    label: "Firebase Project ID",
    description: "The unique identifier of your Firebase project. E.g., project-id. Stored in .env as PUBLIC_FIREBASE_PROJECT_ID.",
    firestorePath: "settings/system",
    firestoreField: "firebase_project_id_display",
    placeholder: "your-project-id",
    category: "Frontend (Build-time)",
    sensitive: false,
  },
  {
    id: "firebase_storage_bucket",
    label: "Firebase Storage Bucket",
    description: "Firebase Storage bucket name. E.g., project-id.firebasestorage.app. Stored in .env as PUBLIC_FIREBASE_STORAGE_BUCKET.",
    firestorePath: "settings/system",
    firestoreField: "firebase_storage_bucket_display",
    placeholder: "your-project.firebasestorage.app",
    category: "Frontend (Build-time)",
    sensitive: false,
  },
  {
    id: "firebase_messaging_sender_id",
    label: "Firebase Messaging Sender ID",
    description: "The unique numerical identifier for your Firebase Cloud Messaging sender. Stored in .env as PUBLIC_FIREBASE_MESSAGING_SENDER_ID.",
    firestorePath: "settings/system",
    firestoreField: "firebase_messaging_sender_id_display",
    placeholder: "1234567890",
    category: "Frontend (Build-time)",
    sensitive: false,
  },
  {
    id: "firebase_app_id",
    label: "Firebase App ID",
    description: "The unique identifier of your Firebase Web App. Stored in .env as PUBLIC_FIREBASE_APP_ID.",
    firestorePath: "settings/system",
    firestoreField: "firebase_app_id_display",
    placeholder: "1:1234567890:web:xxxxxxxxxxxxxxxxx",
    category: "Frontend (Build-time)",
    sensitive: false,
  },
  {
    id: "firebase_measurement_id",
    label: "Firebase Measurement ID",
    description: "The Google Analytics measurement ID for your Firebase project. Stored in .env as PUBLIC_FIREBASE_MEASUREMENT_ID.",
    firestorePath: "settings/system",
    firestoreField: "firebase_measurement_id_display",
    placeholder: "G-XXXXXXXXXX",
    category: "Frontend (Build-time)",
    sensitive: false,
  },
  {
    id: "sentry_dsn",
    label: "Sentry DSN (Public)",
    description: "Sentry error-reporting DSN. Safe to expose — rate-limited per project. Stored in .env as PUBLIC_SENTRY_DSN. Paste here for reference / documentation.",
    firestorePath: "settings/system",
    firestoreField: "sentry_dsn_display",
    placeholder: "https://xxxx@xxxx.ingest.sentry.io/xxxx",
    category: "Frontend (Build-time)",
    sensitive: false,
    link: "https://sentry.io/settings/",
    linkLabel: "Sentry Settings",
  },
]

export function maskValue(value: string): string {
  if (!value) return ""
  if (value.length <= 8) return "•".repeat(value.length)
  return value.slice(0, 4) + "•".repeat(Math.min(value.length - 8, 24)) + value.slice(-4)
}

export function generateKey(prefix = "tf"): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  const randomBytes = new Uint8Array(40)
  window.crypto.getRandomValues(randomBytes)
  const arr = Array.from(randomBytes, (byte) => chars[byte % chars.length])
  return `${prefix}-${arr.join("")}`
}
