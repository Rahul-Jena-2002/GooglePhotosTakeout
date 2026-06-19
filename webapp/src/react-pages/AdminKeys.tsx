import { useState, useEffect, useCallback } from "react"
import { doc, getDoc, setDoc } from "firebase/firestore"
import { db } from "../firebase"
import { useAuth } from "../contexts/AuthContext"
import { useToastStore } from "../store/useToastStore"
import { decrypt, encrypt, deriveKeyFromPassword } from "../lib/crypto"
import {
  Key, Eye, EyeOff, Copy, Check, RefreshCw, Save, Shield,
  AlertTriangle, ChevronDown, ChevronUp, ExternalLink, Lock, Zap,
  Terminal, FileText
} from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────
interface KeyEntry {
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

const CATEGORIES = ["Cloud Functions", "Payments", "AI / APIs", "SEO", "Frontend (Build-time)"]

const KEY_DEFINITIONS: Omit<KeyEntry, "value">[] = [
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
    placeholder: "sk_live_xxxxxxxxxxxxxxxxxxxx",
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
    placeholder: "sk_test_xxxxxxxxxxxxxxxxxxxx",
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
function maskValue(value: string): string {
  if (!value) return ""
  if (value.length <= 8) return "•".repeat(value.length)
  return value.slice(0, 4) + "•".repeat(Math.min(value.length - 8, 24)) + value.slice(-4)
}

function generateKey(prefix = "tf"): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  const arr = Array.from({ length: 40 }, () => chars[Math.floor(Math.random() * chars.length)])
  return `${prefix}-${arr.join("")}`
}

// ─── Copy Button ──────────────────────────────────────────────────────────────
function CopyButton({ text, small = false }: { text: string; small?: boolean }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={!text}
      className={`flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 font-bold rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed ${small ? "px-2 py-1 text-[10px]" : "px-3 py-1.5 text-[11px]"}`}
    >
      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied!" : "Copy"}
    </button>
  )
}

// ─── Key Card ─────────────────────────────────────────────────────────────────
function KeyCard({
  entry,
  onSave,
  saving,
  mekKey,
}: {
  entry: KeyEntry
  onSave: (id: string, value: string) => Promise<void>
  saving: string | null
  mekKey: CryptoKey | null
}) {
  const [revealed, setRevealed] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(entry.value)
  const [expanded, setExpanded] = useState(false)
  const [decrypted, setDecrypted] = useState<string>("")

  useEffect(() => {
    const loadValue = async () => {
      if (entry.sensitive && entry.value?.startsWith("enc:v1:") && mekKey) {
        try {
          const decVal = await decrypt(entry.value, mekKey)
          setDecrypted(decVal)
          setDraft(decVal)
        } catch (err) {
          setDecrypted("")
          setDraft("")
        }
      } else {
        setDecrypted("")
        setDraft(entry.value)
      }
    }
    loadValue()
  }, [entry.value, mekKey, entry.sensitive])

  const handleSave = async () => {
    await onSave(entry.id, draft)
    setEditing(false)
  }

  const handleRotate = () => {
    const newKey = generateKey("tf")
    setDraft(newKey)
    setEditing(true)
    useToastStore.getState().addToast("New key generated — click Save to apply it.", "info", 3000)
  }

  const isEmpty = !entry.value
  const isSaving = saving === entry.id

  return (
    <div className={`bg-zinc-900 border rounded-xl overflow-hidden transition-all ${
      isEmpty ? "border-amber-800/40" : "border-zinc-800"
    }`}>
      {/* Header row */}
      <div
        className="px-5 py-4 flex items-start gap-4 cursor-pointer select-none"
        onClick={() => setExpanded(p => !p)}
      >
        {/* Status dot */}
        <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${
          isEmpty ? "bg-amber-500 animate-pulse" : "bg-emerald-500"
        }`} />

        <div className="flex-grow min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-white">{entry.label}</span>
            {entry.sensitive && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-zinc-800 text-zinc-400 border border-zinc-700">
                <Lock className="w-2.5 h-2.5" /> Secret
              </span>
            )}
            {isEmpty && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-900/40 text-amber-400 border border-amber-700/40">
                <AlertTriangle className="w-2.5 h-2.5" /> Not Set
              </span>
            )}
          </div>
          {/* Masked value preview */}
          {!expanded && entry.value && (
            <div className="mt-1 font-mono text-[11px] text-zinc-500 truncate">
              {entry.sensitive ? maskValue(entry.value) : entry.value.slice(0, 60) + (entry.value.length > 60 ? "…" : "")}
            </div>
          )}
        </div>

        <div className="flex-shrink-0 text-zinc-500">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-zinc-800 px-5 py-4 space-y-4">
          {/* Description */}
          <p className="text-xs text-zinc-400 leading-relaxed">{entry.description}</p>

          {/* Links */}
          {entry.link && (
            <a
              href={entry.link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <ExternalLink className="w-3 h-3" /> {entry.linkLabel}
            </a>
          )}

          {/* Firestore path badge */}
          <div className="text-[10px] font-mono text-zinc-600">
            Firestore: <span className="text-zinc-500">{entry.firestorePath}</span> → <span className="text-zinc-400">{entry.firestoreField}</span>
          </div>

          {/* Value input */}
          <div className="space-y-2">
            <div className="relative flex gap-2">
              <div className="relative flex-grow">
                {entry.sensitive && entry.value?.startsWith("enc:v1:") && !mekKey ? (
                  <div className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-xs font-mono text-zinc-500 flex items-center gap-2 h-10">
                    <Lock className="w-3.5 h-3.5 text-zinc-600" />
                    🔒 Encrypted — Enter MEK to unlock
                  </div>
                ) : (
                  <input
                    type={revealed || !entry.sensitive ? "text" : "password"}
                    value={editing ? draft : (decrypted || entry.value || "")}
                    onChange={e => { setDraft(e.target.value); setEditing(true) }}
                    placeholder={entry.placeholder}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 pr-10 text-xs font-mono text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-zinc-600 transition-colors"
                  />
                )}
                {entry.sensitive && !(entry.value?.startsWith("enc:v1:") && !mekKey) && (
                  <button
                    type="button"
                    onClick={() => setRevealed(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    {revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 flex-wrap">
              {/* Copy */}
              <CopyButton text={entry.value} />

              {/* Rotate (only for gateway/internal keys) */}
              {entry.id === "gateway_api_key" && (
                <button
                  type="button"
                  onClick={handleRotate}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 text-zinc-300 text-[11px] font-bold rounded-lg transition-all"
                >
                  <RefreshCw className="w-3 h-3" /> Generate New
                </button>
              )}

              {/* Save */}
              {editing && (
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-white hover:bg-zinc-100 text-zinc-950 text-[11px] font-bold rounded-lg transition-all disabled:opacity-50 ml-auto"
                >
                  {isSaving ? (
                    <span className="w-3 h-3 border border-zinc-600 border-t-zinc-950 rounded-full animate-spin" />
                  ) : (
                    <Save className="w-3 h-3" />
                  )}
                  Save
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Code Block with Copy ──────────────────────────────────────────────────────
function CodeBlock({ code, label }: { code: string; label?: string }) {
  return (
    <div className="relative group">
      {label && <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-600 mb-1">{label}</div>}
      <pre className="bg-zinc-950 rounded-lg p-4 text-[11px] font-mono text-zinc-400 overflow-x-auto leading-relaxed whitespace-pre-wrap break-all">
        {code}
      </pre>
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <CopyButton text={code} small />
      </div>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function AdminKeys() {
  const { adminData, loading: authLoading } = useAuth()
  const [entries, setEntries] = useState<KeyEntry[]>(
    KEY_DEFINITIONS.map(d => ({ ...d, value: "" }))
  )
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState<string>("All")
  const [mek, setMek] = useState<string>("")
  const [mekInput, setMekInput] = useState<string>("")
  const [mekKey, setMekKey] = useState<CryptoKey | null>(null)

  const getKeyValue = (id: string, fallback: string) => {
    const entry = entries.find(e => e.id === id)
    return entry && entry.value ? entry.value : fallback
  }

  const handleMekSubmit = async () => {
    if (!mekInput.trim()) {
      useToastStore.getState().addToast("Please enter a Master Encryption Key", "error")
      return
    }
    try {
      const salt = new Uint8Array(16)
      const { key } = await deriveKeyFromPassword(mekInput.trim(), salt)
      setMekKey(key)
      setMek(mekInput)
      setMekInput("")
      useToastStore.getState().addToast("Master Encryption Key loaded. You can now edit encrypted fields.", "success")
    } catch (err: any) {
      useToastStore.getState().addToast("Failed to process MEK: " + err.message, "error")
    }
  }

  const handleMekClear = () => {
    setMek("")
    setMekKey(null)
    setMekInput("")
  }

  // ── Generated .env files ──
  const frontendEnvText = `# ── Firebase (Public — safe to expose in browser bundles) ──
PUBLIC_FIREBASE_API_KEY=${getKeyValue("firebase_api_key", "your-firebase-api-key")}
PUBLIC_FIREBASE_AUTH_DOMAIN=${getKeyValue("firebase_auth_domain", "your-project.firebaseapp.com")}
PUBLIC_FIREBASE_PROJECT_ID=${getKeyValue("firebase_project_id", "your-project-id")}
PUBLIC_FIREBASE_STORAGE_BUCKET=${getKeyValue("firebase_storage_bucket", "your-project.firebasestorage.app")}
PUBLIC_FIREBASE_MESSAGING_SENDER_ID=${getKeyValue("firebase_messaging_sender_id", "your-messaging-sender-id")}
PUBLIC_FIREBASE_APP_ID=${getKeyValue("firebase_app_id", "your-app-id")}
PUBLIC_FIREBASE_MEASUREMENT_ID=${getKeyValue("firebase_measurement_id", "G-XXXXXXXXXX")}

# ── Sentry (Public — rate-limited DSN) ──
PUBLIC_SENTRY_DSN=${getKeyValue("sentry_dsn", "https://xxxx@xxxx.ingest.sentry.io/xxxx")}`

  const localServerEnvText = `# ── functions/local-server.js requires these env vars ──
# Copy into webapp/.env or export in your shell before running:
#   node functions/local-server.js

GATEWAY_API_KEY=${getKeyValue("gateway_api_key", "your-gateway-api-key")}
DODO_API_KEY=${getKeyValue("dodo_api_key", "your-dodo-live-api-key")}

# Optional — falls back to Firestore settings/system.dodo_api_key if not set:
# DODO_TEST_API_KEY=${getKeyValue("dodo_test_api_key", "your-dodo-test-api-key")}

# Optional — only needed if serviceAccountKey.json is not present:
# GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json
# FIREBASE_PROJECT_ID=${getKeyValue("firebase_project_id", "your-project-id")}`

  const functionsConfigText = `# Run once to configure deployed Cloud Functions:
firebase functions:config:set gateway.key="${getKeyValue("gateway_api_key", "YOUR_GATEWAY_API_KEY")}"

# Then deploy:
firebase deploy --only functions`

  const indexNowKeyValue = getKeyValue("indexnow_key", "e107aca980264801af5ddd4a7fe361a3")
  const indexNowScriptText = `# In scripts/submit_indexnow.js — update INDEXNOW_KEY:
const INDEXNOW_KEY = "${indexNowKeyValue}";
# Also make sure public/${indexNowKeyValue}.txt exists and contains only the key.`

  // ── Load all keys from Firestore ──
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const paths = [...new Set(KEY_DEFINITIONS.map(k => k.firestorePath))]
        const snaps: Record<string, any> = {}
        for (const path of paths) {
          const [col, docId] = path.split("/")
          const snap = await getDoc(doc(db, col, docId))
          snaps[path] = snap.exists() ? snap.data() : {}
        }
        setEntries(KEY_DEFINITIONS.map(def => ({
          ...def,
          value: snaps[def.firestorePath]?.[def.firestoreField] ?? "",
        })))
      } catch (err: any) {
        useToastStore.getState().addToast("Failed to load keys: " + err.message, "error")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // ── Save a single key to Firestore ──
  const handleSave = useCallback(async (id: string, value: string) => {
    setSaving(id)
    try {
      const def = KEY_DEFINITIONS.find(d => d.id === id)
      if (!def) return

      let valueToSave = value.trim()
      if (def.sensitive && valueToSave && !valueToSave.startsWith("enc:v1:") && mekKey) {
        valueToSave = await encrypt(valueToSave, mekKey)
      }

      const [col, docId] = def.firestorePath.split("/")
      await setDoc(doc(db, col, docId), { [def.firestoreField]: valueToSave }, { merge: true })
      setEntries(prev => prev.map(e => e.id === id ? { ...e, value: valueToSave } : e))
      useToastStore.getState().addToast(`${def.label} saved successfully.`, "success")
    } catch (err: any) {
      useToastStore.getState().addToast("Failed to save key: " + err.message, "error")
    } finally {
      setSaving(null)
    }
  }, [mekKey])

  const isDev = import.meta.env.DEV
  const hasAccess = isDev || (adminData && adminData.role === "SUPER_ADMIN")

  if (authLoading && !isDev) {
    return (
      <div className="flex items-center gap-3 text-zinc-500 py-12 justify-center">
        <div className="w-4 h-4 border-2 border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
        Verifying permissions...
      </div>
    )
  }

  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center space-y-4">
        <Shield className="w-12 h-12 text-red-500" />
        <h2 className="text-xl font-bold text-white">Access Denied</h2>
        <p className="text-zinc-400 text-sm max-w-sm">
          You do not have the required permissions to view this page. Super Admin access only.
        </p>
      </div>
    )
  }

  const filtered = activeCategory === "All"
    ? entries
    : entries.filter(e => e.category === activeCategory)

  const totalKeys = entries.length
  const configuredKeys = entries.filter(e => !!e.value).length
  const missingKeys = totalKeys - configuredKeys

  return (
    <div className="relative font-sans text-zinc-100 space-y-8">

      {/* ── Master Encryption Key Input ── */}
      {!mek ? (
        <div className="bg-amber-900/30 border border-amber-700/60 rounded-xl p-4 flex gap-3 items-start">
          <Lock className="w-4 h-4 text-amber-400 mt-1 flex-shrink-0" />
          <div className="flex-1 space-y-3">
            <div>
              <div className="text-sm font-semibold text-amber-100">Master Encryption Key Required</div>
              <div className="text-xs text-amber-200 mt-0.5">Enter your 32-byte hex MEK to encrypt/decrypt sensitive keys. It is stored only in this session.</div>
            </div>
            <div className="flex gap-2">
              <input
                type="password"
                placeholder="Enter 32-byte hex Master Encryption Key"
                value={mekInput}
                onChange={(e) => setMekInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleMekSubmit()}
                className="flex-1 bg-zinc-900 border border-amber-700/40 rounded-lg px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-600"
              />
              <button
                onClick={handleMekSubmit}
                className="px-3 py-1.5 bg-amber-700 hover:bg-amber-600 text-white text-sm font-bold rounded-lg transition-colors"
              >
                Unlock
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-emerald-900/30 border border-emerald-700/60 rounded-xl p-4 flex gap-3 justify-between items-center">
          <div className="flex items-center gap-2 text-emerald-300 text-sm font-semibold">
            <Shield className="w-4 h-4 text-emerald-400" />
            Master Encryption Key Active
          </div>
          <button
            onClick={handleMekClear}
            className="px-2 py-1 bg-red-900/40 hover:bg-red-900/60 text-red-300 text-xs font-bold rounded transition-colors"
          >
            Lock
          </button>
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Key className="w-6 h-6 text-zinc-400" /> Keys & Secrets
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            All sensitive keys are stored in Firestore — never hardcoded in source or build bundles.
          </p>
        </div>

        {/* Health pill */}
        <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-bold ${
          missingKeys === 0
            ? "bg-emerald-900/20 border-emerald-700/40 text-emerald-400"
            : "bg-amber-900/20 border-amber-700/40 text-amber-400"
        }`}>
          {missingKeys === 0 ? (
            <><Shield className="w-4 h-4" /> All {totalKeys} keys configured</>
          ) : (
            <><AlertTriangle className="w-4 h-4" /> {missingKeys} of {totalKeys} keys missing</>
          )}
        </div>
      </div>

      {/* ── Info banner ── */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 flex gap-3">
        <Zap className="w-4 h-4 text-zinc-400 mt-0.5 flex-shrink-0" />
        <div className="text-xs text-zinc-400 leading-relaxed space-y-1">
          <div><span className="text-zinc-200 font-semibold">Runtime keys</span> (Cloud Functions, AI, Payments, SEO) are fetched from Firestore at runtime — they are never bundled into the browser JS.</div>
          <div><span className="text-zinc-200 font-semibold">Build-time keys</span> (Firebase, Sentry) must also be in your <code className="text-zinc-300 bg-zinc-800 px-1 rounded">.env</code> file for the build process. The values shown here are for reference.</div>
          <div>Firebase Firestore Rules restrict who can read/write <code className="text-zinc-300 bg-zinc-800 px-1 rounded">settings/system</code> and <code className="text-zinc-300 bg-zinc-800 px-1 rounded">settings/secure</code> to admins only.</div>
        </div>
      </div>

      {/* ── Category tabs ── */}
      <div className="flex gap-2 flex-wrap">
        {["All", ...CATEGORIES].map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all border ${
              activeCategory === cat
                ? "bg-white text-zinc-950 border-white"
                : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-600 hover:text-zinc-200"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* ── Keys by category ── */}
      {loading ? (
        <div className="flex items-center gap-3 text-zinc-500 py-12 justify-center">
          <div className="w-4 h-4 border-2 border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
          Loading keys from Firestore...
        </div>
      ) : (
        <div className="space-y-6">
          {(activeCategory === "All" ? CATEGORIES : [activeCategory]).map(cat => {
            const catEntries = filtered.filter(e => e.category === cat)
            if (catEntries.length === 0) return null
            const catConfigured = catEntries.filter(e => !!e.value).length
            return (
              <div key={cat}>
                <div className="flex items-center gap-3 mb-3">
                  <h2 className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">{cat}</h2>
                  <div className="flex-grow h-px bg-zinc-800" />
                  <span className="text-[10px] text-zinc-600 font-mono">
                    {catConfigured}/{catEntries.length} set
                  </span>
                </div>
                <div className="space-y-3">
                  {catEntries.map(entry => (
                    <KeyCard key={entry.id} entry={entry} onSave={handleSave} saving={saving} mekKey={mekKey} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Divider ── */}
      <div className="h-px bg-zinc-800" />
      <h2 className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
        <FileText className="w-3.5 h-3.5" /> Generated Config Files
      </h2>

      {/* ── webapp/.env (build-time) ── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400">
              webapp/.env — Build-time Variables
            </h3>
            <p className="text-xs text-zinc-500 mt-1">
              Copy into <code className="text-zinc-300 bg-zinc-800 px-1 rounded">webapp/.env</code> — baked into the static build, safe to expose.
            </p>
          </div>
          <CopyButton text={frontendEnvText} />
        </div>
        <CodeBlock code={frontendEnvText} />
      </div>

      {/* ── local-server .env ── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5" /> functions/local-server.js — Runtime Environment
            </h3>
            <p className="text-xs text-zinc-500 mt-1">
              These env vars are required to run <code className="text-zinc-300 bg-zinc-800 px-1 rounded">node functions/local-server.js</code>. Add to <code className="text-zinc-300 bg-zinc-800 px-1 rounded">webapp/.env</code> or export in your shell.
            </p>
          </div>
          <CopyButton text={localServerEnvText} />
        </div>
        <CodeBlock code={localServerEnvText} />
      </div>

      {/* ── Firebase Functions config ── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400">
              Firebase Functions Config (Deployed)
            </h3>
            <p className="text-xs text-zinc-500 mt-1">
              Run once to configure deployed Cloud Functions. The functions read these at startup.
            </p>
          </div>
          <CopyButton text={functionsConfigText} />
        </div>
        <CodeBlock code={functionsConfigText} />
      </div>

      {/* ── IndexNow script config ── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400">
              IndexNow Script Update
            </h3>
            <p className="text-xs text-zinc-500 mt-1">
              After saving your IndexNow Key above, update <code className="text-zinc-300 bg-zinc-800 px-1 rounded">scripts/submit_indexnow.js</code> and the public verification file.
            </p>
          </div>
          <CopyButton text={indexNowScriptText} />
        </div>
        <CodeBlock code={indexNowScriptText} />
      </div>

    </div>
  )
}
