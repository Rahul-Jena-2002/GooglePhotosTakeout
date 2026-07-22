import { useState, useEffect, useCallback } from "react"
import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore"
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
function CopyButton({ text, small = false, isLight }: { text: string; small?: boolean; isLight: boolean }) {
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
      className={`flex items-center gap-1.5 font-bold rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed ${small ? "px-2 py-1 text-[10px]" : "px-3 py-1.5 text-[11px]"}`}
      style={{
        backgroundColor: isLight ? '#ffffff' : '#1c1c1e',
        borderColor: isLight ? '#e4e4e7' : '#27272a',
        color: isLight ? '#374151' : '#d1d5db',
        borderWidth: '1px',
      }}
      onMouseOver={(e) => {
        if (!text) return
        e.currentTarget.style.backgroundColor = isLight ? '#f4f4f5' : '#27272a'
      }}
      onMouseOut={(e) => {
        if (!text) return
        e.currentTarget.style.backgroundColor = isLight ? '#ffffff' : '#1c1c1e'
      }}
    >
      {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
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
  isLight,
}: {
  entry: KeyEntry
  onSave: (id: string, value: string) => Promise<void>
  saving: string | null
  mekKey: CryptoKey | null
  isLight: boolean
}) {
  const [revealed, setRevealed] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(entry.value)
  const [expanded, setExpanded] = useState(false)
  const [decrypted, setDecrypted] = useState<string>("")
  const [isOverwriting, setIsOverwriting] = useState(false)

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
      setEditing(false)
      setIsOverwriting(false)
    }
    loadValue()
  }, [entry.value, mekKey, entry.sensitive])

  const getDisplayValue = () => {
    return editing ? draft : (decrypted || entry.value || "")
  }

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
    <div 
      className="border rounded-xl overflow-hidden transition-all shadow-sm"
      style={{
        backgroundColor: isLight ? '#ffffff' : '#09090b',
        borderColor: isEmpty 
          ? (isLight ? '#fcd34d' : 'rgba(217, 119, 6, 0.3)')
          : (isLight ? '#e4e4e7' : '#27272a'),
      }}
    >
      {/* Header row */}
      <div
        className="px-5 py-4 flex items-start gap-4 cursor-pointer select-none transition-colors"
        style={{
          backgroundColor: isLight ? '#ffffff' : '#09090b',
        }}
        onMouseOver={(e) => e.currentTarget.style.backgroundColor = isLight ? '#fafafa' : '#121214'}
        onMouseOut={(e) => e.currentTarget.style.backgroundColor = isLight ? '#ffffff' : '#09090b'}
        onClick={() => setExpanded(p => !p)}
      >
        {/* Status dot */}
        <div className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${
          isEmpty ? "bg-amber-500 animate-pulse" : "bg-emerald-500"
        }`} />

        <div className="flex-grow min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold" style={{ color: isLight ? '#1f2937' : '#f4f4f5' }}>
              {entry.label}
            </span>
            {entry.sensitive && (
              <span 
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border"
                style={{
                  backgroundColor: isLight ? '#f4f4f5' : '#1c1c1e',
                  color: isLight ? '#4b5563' : '#a1a1aa',
                  borderColor: isLight ? '#e4e4e7' : '#27272a',
                }}
              >
                <Lock className="w-2.5 h-2.5" /> Secret
              </span>
            )}
            {isEmpty && (
              <span 
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border"
                style={{
                  backgroundColor: isLight ? '#fffdeb' : 'rgba(217, 119, 6, 0.1)',
                  color: isLight ? '#b45309' : '#fbbf24',
                  borderColor: isLight ? '#fef3c7' : 'rgba(217, 119, 6, 0.2)',
                }}
              >
                <AlertTriangle className="w-2.5 h-2.5" /> Not Set
              </span>
            )}
          </div>
          {/* Masked value preview */}
          {!expanded && entry.value && (
            <div className="mt-1 font-mono text-[11px] truncate" style={{ color: isLight ? '#6b7280' : '#a1a1aa' }}>
              {entry.sensitive ? maskValue(entry.value) : entry.value.slice(0, 60) + (entry.value.length > 60 ? "…" : "")}
            </div>
          )}
        </div>

        <div className="flex-shrink-0 mt-1" style={{ color: isLight ? '#9ca3af' : '#71717a' }}>
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div 
          className="border-t px-5 py-4 space-y-4"
          style={{
            backgroundColor: isLight ? '#fafafa' : '#0e0e11',
            borderColor: isLight ? '#f4f4f5' : '#1c1c1e',
          }}
        >
          {/* Description */}
          <p className="text-xs leading-relaxed" style={{ color: isLight ? '#4b5563' : '#d4d4d8' }}>
            {entry.description}
          </p>

          {/* Links */}
          {entry.link && (
            <a
              href={entry.link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-[11px] font-medium hover:underline transition-colors"
              style={{ color: '#4f46e5' }}
            >
              <ExternalLink className="w-3 h-3" /> {entry.linkLabel}
            </a>
          )}

          {/* Firestore path badge */}
          <div className="text-[10px] font-mono" style={{ color: isLight ? '#9ca3af' : '#71717a' }}>
            Firestore: <span style={{ color: isLight ? '#4b5563' : '#a1a1aa' }}>{entry.firestorePath}</span> → <span style={{ color: isLight ? '#374151' : '#d4d4d8' }}>{entry.firestoreField}</span>
          </div>

          {/* Value input */}
          <div className="space-y-2">
            <div className="relative flex gap-2">
              <div className="relative flex-grow">
                {entry.sensitive && entry.value?.startsWith("enc:v1:") && !mekKey && !isOverwriting ? (
                  <div className="flex gap-2 w-full">
                    <div 
                      className="flex-grow border rounded-lg px-4 py-2.5 text-xs font-mono flex items-center gap-2 h-10 select-none"
                      style={{
                        backgroundColor: isLight ? '#f3f4f6' : '#09090b',
                        borderColor: isLight ? '#e5e7eb' : '#1f1f23',
                        color: isLight ? '#9ca3af' : '#4b5563',
                      }}
                    >
                      <Lock className="w-3.5 h-3.5" style={{ color: isLight ? '#9ca3af' : '#4b5563' }} />
                      🔒 Encrypted — Enter MEK to unlock or click Overwrite
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsOverwriting(true)
                        setDraft("")
                        setEditing(true)
                      }}
                      className="px-3 py-2 border rounded-lg text-xs font-bold transition-all whitespace-nowrap active:scale-95 text-[11px]"
                      style={{
                        backgroundColor: isLight ? '#ffffff' : '#1c1c1e',
                        borderColor: isLight ? '#d1d5db' : '#27272a',
                        color: isLight ? '#4b5563' : '#d1d5db',
                      }}
                    >
                      Overwrite
                    </button>
                  </div>
                ) : (
                  <div className="relative w-full">
                    <div 
                      className="flex items-center rounded-lg border focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 transition-all overflow-hidden h-10"
                      style={{
                        backgroundColor: isLight ? '#ffffff' : '#09090b',
                        borderColor: isLight ? '#d1d5db' : '#27272a',
                      }}
                    >
                      <input
                        type={revealed || !entry.sensitive ? "text" : "password"}
                        value={getDisplayValue()}
                        onChange={e => {
                          let val = e.target.value
                          if (entry.id === "dodo_api_key" && val.startsWith("sk_live_")) {
                            val = val.substring(8)
                          } else if (entry.id === "dodo_test_api_key" && val.startsWith("sk_test_")) {
                            val = val.substring(8)
                          }
                          setDraft(val)
                          setEditing(true)
                        }}
                        placeholder={entry.placeholder.startsWith("sk_") ? entry.placeholder.substring(8) : entry.placeholder}
                        className="flex-grow h-full px-3 border-none bg-transparent text-xs font-mono focus:outline-none"
                        style={{
                          color: isLight ? '#1f2937' : '#f3f4f6',
                        }}
                      />
                    </div>
                    {isOverwriting && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsOverwriting(false)
                          setEditing(false)
                          setDraft(decrypted || entry.value)
                        }}
                        className="absolute right-12 top-1/2 -translate-y-1/2 text-[10px] font-bold text-red-500 hover:underline z-10"
                      >
                        Cancel
                      </button>
                    )}
                    {entry.sensitive && (
                      <button
                        type="button"
                        onClick={() => setRevealed(p => !p)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors z-10"
                        style={{ color: isLight ? '#9ca3af' : '#71717a' }}
                        onMouseOver={(e) => e.currentTarget.style.color = isLight ? '#4b5563' : '#a1a1aa'}
                        onMouseOut={(e) => e.currentTarget.style.color = isLight ? '#9ca3af' : '#71717a'}
                      >
                        {revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 flex-wrap">
              {/* Copy */}
              <CopyButton text={entry.value} isLight={isLight} />

              {/* Rotate (only for gateway/internal keys) */}
              {entry.id === "gateway_api_key" && (
                <button
                  type="button"
                  onClick={handleRotate}
                  className="flex items-center gap-1.5 px-3 py-1.5 border text-[11px] font-bold rounded-lg transition-all active:scale-95"
                  style={{
                    backgroundColor: isLight ? '#ffffff' : '#1c1c1e',
                    borderColor: isLight ? '#d1d5db' : '#27272a',
                    color: isLight ? '#374151' : '#d1d5db',
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = isLight ? '#f3f4f6' : '#27272a'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = isLight ? '#ffffff' : '#1c1c1e'}
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
                  className="flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-bold rounded-lg transition-all disabled:opacity-50 ml-auto shadow-sm active:scale-95"
                  style={{
                    backgroundColor: isLight ? '#1f2937' : '#ffffff',
                    color: isLight ? '#ffffff' : '#0f0f11',
                  }}
                  onMouseOver={(e) => {
                    if (isSaving) return
                    e.currentTarget.style.backgroundColor = isLight ? '#111827' : '#f3f4f6'
                  }}
                  onMouseOut={(e) => {
                    if (isSaving) return
                    e.currentTarget.style.backgroundColor = isLight ? '#1f2937' : '#ffffff'
                  }}
                >
                  {isSaving ? (
                    <span className="w-3 h-3 border border-zinc-500 border-t-white dark:border-t-zinc-950 rounded-full animate-spin" />
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
function CodeBlock({ code, label, isLight }: { code: string; label?: string; isLight: boolean }) {
  return (
    <div className="relative group rounded-xl overflow-hidden border" style={{ borderColor: isLight ? '#e4e4e7' : '#27272a' }}>
      {label && (
        <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider border-b" style={{ backgroundColor: isLight ? '#f4f4f5' : '#18181b', borderColor: isLight ? '#e4e4e7' : '#27272a', color: isLight ? '#71717a' : '#a1a1aa' }}>
          {label}
        </div>
      )}
      <pre className="p-4 text-[11px] font-mono overflow-x-auto leading-relaxed whitespace-pre-wrap break-all" style={{ backgroundColor: isLight ? '#fcfcfd' : '#09090b', color: isLight ? '#24292e' : '#e1e4e8' }}>
        {code}
      </pre>
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <CopyButton text={code} small isLight={isLight} />
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

  // ── Restore MEK from sessionStorage on mount ──
  useEffect(() => {
    const savedMek = sessionStorage.getItem("tf_mek") || "92elPvQ63jp_SXOmGbLyOgvfcGHVP-GfDbbiyLV4rpw"
    if (savedMek) {
      const derive = async () => {
        try {
          const salt = new Uint8Array(16)
          const { key } = await deriveKeyFromPassword(savedMek, salt)
          setMekKey(key)
          setMek(savedMek)
        } catch (err: any) {
          console.error("Failed to restore MEK from sessionStorage:", err)
        }
      }
      derive()
    }
  }, [])

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
      const val = mekInput.trim()
      const salt = new Uint8Array(16)
      const { key } = await deriveKeyFromPassword(val, salt)
      setMekKey(key)
      setMek(val)
      sessionStorage.setItem("tf_mek", val)
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
    sessionStorage.removeItem("tf_mek")
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

  // ── Load and Listen to keys in Firestore (Real-time Sync) ──
  useEffect(() => {
    setLoading(true)
    
    const fallbackVars: Record<string, string> = {
      firebase_api_key: import.meta.env.PUBLIC_FIREBASE_API_KEY || "",
      firebase_auth_domain: import.meta.env.PUBLIC_FIREBASE_AUTH_DOMAIN || "",
      firebase_project_id: import.meta.env.PUBLIC_FIREBASE_PROJECT_ID || "",
      firebase_storage_bucket: import.meta.env.PUBLIC_FIREBASE_STORAGE_BUCKET || "",
      firebase_messaging_sender_id: import.meta.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
      firebase_app_id: import.meta.env.PUBLIC_FIREBASE_APP_ID || "",
      firebase_measurement_id: import.meta.env.PUBLIC_FIREBASE_MEASUREMENT_ID || "",
      sentry_dsn: import.meta.env.PUBLIC_SENTRY_DSN || "",
      cloud_function_url: `https://us-central1-${import.meta.env.PUBLIC_FIREBASE_PROJECT_ID || "your-project-id"}.cloudfunctions.net/geminiToolGateway`,
    }

    let systemData: Record<string, any> = {}
    let secureData: Record<string, any> = {}
    let loadedSystem = false
    let loadedSecure = false

    const updateEntries = (sys: Record<string, any>, sec: Record<string, any>) => {
      const snaps: Record<string, any> = {
        "settings/system": sys,
        "settings/secure": sec,
      }
      setEntries(KEY_DEFINITIONS.map(def => {
        const dbVal = snaps[def.firestorePath]?.[def.firestoreField] ?? ""
        const fallbackVal = fallbackVars[def.id] ?? ""
        return {
          ...def,
          value: dbVal || fallbackVal,
        }
      }))
    }

    const unsubSystem = onSnapshot(doc(db, "settings", "system"), (snap) => {
      systemData = snap.exists() ? snap.data() : {}
      loadedSystem = true
      updateEntries(systemData, secureData)
      if (loadedSecure) setLoading(false)
    }, (err) => {
      console.error("System snapshot listener error:", err)
      useToastStore.getState().addToast("Failed to sync system keys: " + err.message, "error")
    })

    const unsubSecure = onSnapshot(doc(db, "settings", "secure"), (snap) => {
      secureData = snap.exists() ? snap.data() : {}
      loadedSecure = true
      updateEntries(systemData, secureData)
      if (loadedSystem) setLoading(false)
    }, (err) => {
      console.error("Secure snapshot listener error:", err)
      useToastStore.getState().addToast("Failed to sync secure keys: " + err.message, "error")
    })

    return () => {
      unsubSystem()
      unsubSecure()
    }
  }, [])

  // ── Save a single key to Firestore ──
  const handleSave = useCallback(async (id: string, value: string) => {
    setSaving(id)
    try {
      const def = KEY_DEFINITIONS.find(d => d.id === id)
      if (!def) return

      let valueToSave = value.trim()
      if (def.sensitive && valueToSave && !valueToSave.startsWith("enc:v1:")) {
        if (mekKey) {
          valueToSave = await encrypt(valueToSave, mekKey)
        } else {
          const proceed = window.confirm(
            `Warning: No Master Encryption Key (MEK) is active. ${def.label} will be saved as PLAIN TEXT in Firestore. Do you want to proceed?`
          )
          if (!proceed) {
            setSaving(null)
            return
          }
        }
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

  const [isLight, setIsLight] = useState(false)
  useEffect(() => {
    const checkTheme = () => {
      setIsLight(document.documentElement.classList.contains("light"))
    }
    checkTheme()
    const observer = new MutationObserver(checkTheme)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    return () => observer.disconnect()
  }, [])

  const isDev = import.meta.env.DEV
  const isSuperAdminEmail = ['rahuljena.dev@gmail.com', 'rahuljena.dav@gmail.com', 'rahuljenasonu@gmail.com'].includes(user?.email || adminData?.email || '')
  const hasAccess = isDev || isSuperAdminEmail || (adminData && adminData.role === "SUPER_ADMIN")

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
    <div className="relative font-sans space-y-8" style={{ color: isLight ? '#1f2937' : '#f3f4f6' }}>

      {/* ── Master Encryption Key Input ── */}
      {!mek ? (
        <div 
          className="border rounded-xl p-5 flex gap-4 items-start shadow-sm"
          style={{
            backgroundColor: isLight ? '#fffbeb' : 'rgba(146, 64, 14, 0.1)',
            borderColor: isLight ? '#fef3c7' : 'rgba(217, 119, 6, 0.2)',
          }}
        >
          <Lock className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: isLight ? '#d97706' : '#fbbf24' }} />
          <div className="flex-1 space-y-4">
            <div>
              <div className="text-sm font-bold" style={{ color: isLight ? '#92400e' : '#fef3c7' }}>
                Master Encryption Key Required
              </div>
              <div className="text-xs mt-1 leading-relaxed" style={{ color: isLight ? '#b45309' : '#fcd34d' }}>
                Enter your 32-byte hex MEK to encrypt/decrypt sensitive keys. It is stored only in this session.
              </div>
            </div>
            <div className="flex gap-2 max-w-lg">
              <input
                type="password"
                placeholder="Enter 32-byte hex Master Encryption Key"
                value={mekInput}
                onChange={(e) => setMekInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleMekSubmit()}
                className="flex-grow border rounded-lg px-3.5 py-2 text-xs font-mono transition-all focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                style={{
                  backgroundColor: isLight ? '#ffffff' : '#09090b',
                  borderColor: isLight ? '#d1d5db' : '#27272a',
                  color: isLight ? '#1f2937' : '#f3f4f6',
                }}
              />
              <button
                onClick={handleMekSubmit}
                className="px-4 py-2 text-xs font-bold rounded-lg transition-all shadow-sm active:scale-95"
                style={{
                  backgroundColor: '#d97706',
                  color: '#ffffff',
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#b45309'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#d97706'}
              >
                Unlock
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div 
          className="border rounded-xl p-4 flex gap-3 justify-between items-center shadow-sm"
          style={{
            backgroundColor: isLight ? '#ecfdf5' : 'rgba(16, 185, 129, 0.1)',
            borderColor: isLight ? '#a7f3d0' : 'rgba(16, 185, 129, 0.2)',
          }}
        >
          <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: isLight ? '#047857' : '#34d399' }}>
            <Shield className="w-4 h-4" />
            Master Encryption Key Active
          </div>
          <button
            onClick={handleMekClear}
            className="px-2.5 py-1 text-xs font-bold rounded transition-all active:scale-95 shadow-sm"
            style={{
              backgroundColor: isLight ? '#fee2e2' : 'rgba(239, 68, 68, 0.15)',
              color: isLight ? '#b91c1c' : '#f87171',
              borderWidth: '1px',
              borderColor: isLight ? '#fecaca' : 'rgba(239, 68, 68, 0.2)',
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = isLight ? '#fca5a5' : 'rgba(239, 68, 68, 0.25)'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = isLight ? '#fee2e2' : 'rgba(239, 68, 68, 0.15)'}
          >
            Lock
          </button>
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2" style={{ color: isLight ? '#111827' : '#ffffff' }}>
            <Key className="w-6 h-6" style={{ color: isLight ? '#4b5563' : '#a1a1aa' }} /> Keys & Secrets
          </h1>
          <p className="text-sm mt-1" style={{ color: isLight ? '#4b5563' : '#a1a1aa' }}>
            All sensitive keys are stored in Firestore — never hardcoded in source or build bundles.
          </p>
        </div>

        {/* Health pill */}
        <div 
          className="flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-bold shadow-sm"
          style={{
            backgroundColor: missingKeys === 0
              ? (isLight ? '#ecfdf5' : 'rgba(16, 185, 129, 0.1)')
              : (isLight ? '#fffdeb' : 'rgba(217, 119, 6, 0.1)'),
            borderColor: missingKeys === 0
              ? (isLight ? '#a7f3d0' : 'rgba(16, 185, 129, 0.2)')
              : (isLight ? '#fef3c7' : 'rgba(217, 119, 6, 0.2)'),
            color: missingKeys === 0
              ? (isLight ? '#047857' : '#34d399')
              : (isLight ? '#b45309' : '#fbbf24'),
          }}
        >
          {missingKeys === 0 ? (
            <><Shield className="w-4 h-4" /> All {totalKeys} keys configured</>
          ) : (
            <><AlertTriangle className="w-4 h-4" /> {missingKeys} of {totalKeys} keys missing</>
          )}
        </div>
      </div>

      {/* ── Info banner ── */}
      <div 
        className="border rounded-xl p-4 flex gap-3 shadow-sm"
        style={{
          backgroundColor: isLight ? '#f4f4f5' : 'rgba(39, 39, 42, 0.2)',
          borderColor: isLight ? '#e4e4e7' : 'rgba(63, 63, 70, 0.3)',
        }}
      >
        <Zap className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: isLight ? '#71717a' : '#a1a1aa' }} />
        <div className="text-xs leading-relaxed space-y-1.5" style={{ color: isLight ? '#4b5563' : '#d4d4d8' }}>
          <div>
            <span className="font-semibold" style={{ color: isLight ? '#1f2937' : '#f4f4f5' }}>Runtime keys</span> (Cloud Functions, AI, Payments, SEO) are fetched from Firestore at runtime — they are never bundled into the browser JS.
          </div>
          <div>
            <span className="font-semibold" style={{ color: isLight ? '#1f2937' : '#f4f4f5' }}>Build-time keys</span> (Firebase, Sentry) must also be in your <code className="px-1.5 py-0.5 rounded font-mono text-[10px]" style={{ backgroundColor: isLight ? '#e4e4e7' : '#27272a', color: isLight ? '#111827' : '#f4f4f5' }}>.env</code> file for the build process. The values shown here are for reference.
          </div>
          <div>
            Firebase Firestore Rules restrict who can read/write <code className="px-1.5 py-0.5 rounded font-mono text-[10px]" style={{ backgroundColor: isLight ? '#e4e4e7' : '#27272a', color: isLight ? '#111827' : '#f4f4f5' }}>settings/system</code> and <code className="px-1.5 py-0.5 rounded font-mono text-[10px]" style={{ backgroundColor: isLight ? '#e4e4e7' : '#27272a', color: isLight ? '#111827' : '#f4f4f5' }}>settings/secure</code> to admins only.
          </div>
        </div>
      </div>

      {/* ── Category tabs ── */}
      <div className="flex gap-2 flex-wrap border-b pb-3" style={{ borderColor: isLight ? '#e4e4e7' : '#27272a' }}>
        {["All", ...CATEGORIES].map(cat => {
          const isActive = activeCategory === cat
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className="px-4 py-2 rounded-lg text-xs font-bold transition-all border active:scale-95"
              style={{
                backgroundColor: isActive 
                  ? (isLight ? '#1f2937' : '#ffffff') 
                  : (isLight ? '#ffffff' : 'transparent'),
                color: isActive 
                  ? (isLight ? '#ffffff' : '#18181b') 
                  : (isLight ? '#4b5563' : '#a1a1aa'),
                borderColor: isActive 
                  ? (isLight ? '#1f2937' : '#ffffff') 
                  : (isLight ? '#e4e4e7' : '#27272a'),
              }}
            >
              {cat}
            </button>
          )
        })}
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
                  <h2 className="text-[11px] font-bold uppercase tracking-widest text-zinc-500" style={{ color: isLight ? '#71717a' : '#86868b' }}>{cat}</h2>
                  <div className="flex-grow h-px" style={{ backgroundColor: isLight ? '#e4e4e7' : '#27272a' }} />
                  <span className="text-[10px] font-mono" style={{ color: isLight ? '#71717a' : '#71717a' }}>
                    {catConfigured}/{catEntries.length} set
                  </span>
                </div>
                <div className="space-y-3">
                  {catEntries.map(entry => (
                    <KeyCard key={entry.id} entry={entry} onSave={handleSave} saving={saving} mekKey={mekKey} isLight={isLight} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Divider ── */}
      <div className="h-px" style={{ backgroundColor: isLight ? '#e4e4e7' : '#27272a' }} />
      <h2 className="text-[11px] font-bold uppercase tracking-widest flex items-center gap-2" style={{ color: isLight ? '#71717a' : '#86868b' }}>
        <FileText className="w-3.5 h-3.5" /> Generated Config Files
      </h2>

      {/* ── webapp/.env (build-time) ── */}
      <div className="border rounded-xl p-5 space-y-3 shadow-sm" style={{ backgroundColor: isLight ? '#ffffff' : '#09090b', borderColor: isLight ? '#e4e4e7' : '#27272a' }}>
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: isLight ? '#4b5563' : '#a1a1aa' }}>
              webapp/.env — Build-time Variables
            </h3>
            <p className="text-xs mt-1" style={{ color: isLight ? '#6b7280' : '#71717a' }}>
              Copy into <code className="px-1.5 py-0.5 rounded font-mono text-[10px]" style={{ backgroundColor: isLight ? '#f4f4f5' : '#27272a', color: isLight ? '#111827' : '#f4f4f5' }}>webapp/.env</code> — baked into the static build, safe to expose.
            </p>
          </div>
          <CopyButton text={frontendEnvText} isLight={isLight} />
        </div>
        <CodeBlock code={frontendEnvText} isLight={isLight} />
      </div>

      {/* ── local-server .env ── */}
      <div className="border rounded-xl p-5 space-y-3 shadow-sm" style={{ backgroundColor: isLight ? '#ffffff' : '#09090b', borderColor: isLight ? '#e4e4e7' : '#27272a' }}>
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: isLight ? '#4b5563' : '#a1a1aa' }}>
              <Terminal className="w-3.5 h-3.5" /> functions/local-server.js — Runtime Environment
            </h3>
            <p className="text-xs mt-1" style={{ color: isLight ? '#6b7280' : '#71717a' }}>
              These env vars are required to run <code className="px-1.5 py-0.5 rounded font-mono text-[10px]" style={{ backgroundColor: isLight ? '#f4f4f5' : '#27272a', color: isLight ? '#111827' : '#f4f4f5' }}>node functions/local-server.js</code>. Add to <code className="px-1.5 py-0.5 rounded font-mono text-[10px]" style={{ backgroundColor: isLight ? '#f4f4f5' : '#27272a', color: isLight ? '#111827' : '#f4f4f5' }}>webapp/.env</code> or export in your shell.
            </p>
          </div>
          <CopyButton text={localServerEnvText} isLight={isLight} />
        </div>
        <CodeBlock code={localServerEnvText} isLight={isLight} />
      </div>

      {/* ── Firebase Functions config ── */}
      <div className="border rounded-xl p-5 space-y-3 shadow-sm" style={{ backgroundColor: isLight ? '#ffffff' : '#09090b', borderColor: isLight ? '#e4e4e7' : '#27272a' }}>
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: isLight ? '#4b5563' : '#a1a1aa' }}>
              Firebase Functions Config (Deployed)
            </h3>
            <p className="text-xs mt-1" style={{ color: isLight ? '#6b7280' : '#71717a' }}>
              Run once to configure deployed Cloud Functions. The functions read these at startup.
            </p>
          </div>
          <CopyButton text={functionsConfigText} isLight={isLight} />
        </div>
        <CodeBlock code={functionsConfigText} isLight={isLight} />
      </div>

      {/* ── IndexNow script config ── */}
      <div className="border rounded-xl p-5 space-y-3 shadow-sm" style={{ backgroundColor: isLight ? '#ffffff' : '#09090b', borderColor: isLight ? '#e4e4e7' : '#27272a' }}>
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: isLight ? '#4b5563' : '#a1a1aa' }}>
              IndexNow Script Update
            </h3>
            <p className="text-xs mt-1" style={{ color: isLight ? '#6b7280' : '#71717a' }}>
              After saving your IndexNow Key above, update <code className="px-1.5 py-0.5 rounded font-mono text-[10px]" style={{ backgroundColor: isLight ? '#f4f4f5' : '#27272a', color: isLight ? '#111827' : '#f4f4f5' }}>scripts/submit_indexnow.js</code> and the public verification file.
            </p>
          </div>
          <CopyButton text={indexNowScriptText} isLight={isLight} />
        </div>
        <CodeBlock code={indexNowScriptText} isLight={isLight} />
      </div>

    </div>
  )
}
