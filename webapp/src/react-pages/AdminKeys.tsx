import { useState, useEffect, useCallback } from "react"
import { doc, getDoc, setDoc } from "firebase/firestore"
import { db } from "../firebase"
import { useAuth } from "../contexts/AuthContext"
import { useToastStore } from "../store/useToastStore"
import {
  Key, Eye, EyeOff, Copy, Check, RefreshCw, Save, Shield,
  AlertTriangle, ChevronDown, ChevronUp, ExternalLink, Lock, Zap
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

const CATEGORIES = ["Cloud Functions", "Payments", "AI / APIs", "Frontend (Build-time)"]

const KEY_DEFINITIONS: Omit<KeyEntry, "value">[] = [
  // ── Cloud Functions ──────────────────────────────────────────────────
  {
    id: "gateway_api_key",
    label: "Gateway API Key",
    description: "Secret used to authenticate requests from the admin frontend to your Cloud Functions (sync-coupon, sync-dodo-prices). Also used as GATEWAY_API_KEY env var for local-server.js.",
    firestorePath: "settings/system",
    firestoreField: "gateway_api_key",
    placeholder: "takeoutfix-xxxx-xxxx-xxxx",
    category: "Cloud Functions",
    sensitive: true,
  },
  {
    id: "cloud_function_url",
    label: "Cloud Function Base URL",
    description: "Base URL of your deployed Firebase Cloud Function (geminiToolGateway). Used as the endpoint for price sync and coupon sync calls.",
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
    description: "Live secret API key for Dodo Payments. Used by Cloud Functions to create/update products and discounts. Never expose this in the browser.",
    firestorePath: "settings/system",
    firestoreField: "dodo_api_key",
    placeholder: "sk_live_xxxxxxxxxxxxxxxxxxxx",
    category: "Payments",
    sensitive: true,
    link: "https://dashboard.dodopayments.com/",
    linkLabel: "Dodo Dashboard",
  },
  {
    id: "dodo_webhook_key",
    label: "Dodo Webhook Signing Secret",
    description: "Webhook secret used to verify Dodo payment webhooks (HMAC SHA-256). Get this from your Dodo Dashboard → Webhooks.",
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
    description: "Google Gemini API key used by the Admin Support page to AI-draft and polish ticket replies. Fetched at runtime — never bundled into the frontend build.",
    firestorePath: "settings/system",
    firestoreField: "gemini_api_key",
    placeholder: "AIzaSy_xxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    category: "AI / APIs",
    sensitive: true,
    link: "https://aistudio.google.com/app/apikey",
    linkLabel: "Google AI Studio",
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

// ─── Key Card ─────────────────────────────────────────────────────────────────
function KeyCard({
  entry,
  onSave,
  saving,
}: {
  entry: KeyEntry
  onSave: (id: string, value: string) => Promise<void>
  saving: string | null
}) {
  const [revealed, setRevealed] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(entry.value)
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => { setDraft(entry.value) }, [entry.value])

  const handleCopy = async () => {
    if (!entry.value) return
    await navigator.clipboard.writeText(entry.value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
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
                <input
                  type={revealed || !entry.sensitive ? "text" : "password"}
                  value={editing ? draft : (entry.value || "")}
                  onChange={e => { setDraft(e.target.value); setEditing(true) }}
                  placeholder={entry.placeholder}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 pr-10 text-xs font-mono text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-zinc-600 transition-colors"
                />
                {entry.sensitive && (
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
              <button
                type="button"
                onClick={handleCopy}
                disabled={!entry.value}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 text-zinc-300 text-[11px] font-bold rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {copied ? "Copied!" : "Copy"}
              </button>

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

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function AdminKeys() {
  const { adminData } = useAuth()
  const [entries, setEntries] = useState<KeyEntry[]>(
    KEY_DEFINITIONS.map(d => ({ ...d, value: "" }))
  )
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState<string>("All")

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
      const [col, docId] = def.firestorePath.split("/")
      await setDoc(doc(db, col, docId), { [def.firestoreField]: value.trim() }, { merge: true })
      setEntries(prev => prev.map(e => e.id === id ? { ...e, value: value.trim() } : e))
      useToastStore.getState().addToast(`${def.label} saved successfully.`, "success")
    } catch (err: any) {
      useToastStore.getState().addToast("Failed to save key: " + err.message, "error")
    } finally {
      setSaving(null)
    }
  }, [])

  const filtered = activeCategory === "All"
    ? entries
    : entries.filter(e => e.category === activeCategory)

  const totalKeys = entries.length
  const configuredKeys = entries.filter(e => !!e.value).length
  const missingKeys = totalKeys - configuredKeys

  return (
    <div className="relative font-sans text-zinc-100 space-y-8">

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
          <div><span className="text-zinc-200 font-semibold">Runtime keys</span> (Cloud Functions, AI, Payments) are fetched from Firestore at runtime — they are never bundled into the browser JS.</div>
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
                    <KeyCard key={entry.id} entry={entry} onSave={handleSave} saving={saving} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── ENV file reference ── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400">
          .env File Reference (Build-time Only)
        </h3>
        <p className="text-xs text-zinc-500">
          Copy the following into your <code className="text-zinc-300 bg-zinc-800 px-1 rounded">.env</code> file
          at the root of the <code className="text-zinc-300 bg-zinc-800 px-1 rounded">webapp/</code> directory.
          These variables are baked into the static build and are <strong className="text-zinc-300">not secret</strong> — Firebase's API key is safe to expose.
        </p>
        <pre className="bg-zinc-950 rounded-lg p-4 text-[11px] font-mono text-zinc-400 overflow-x-auto leading-relaxed">{`# Firebase (public — safe to expose)
PUBLIC_FIREBASE_API_KEY=AIzaSyBAQFr7OeHkaLDk8yfNyGl6YD2qhdlnoXk
PUBLIC_FIREBASE_AUTH_DOMAIN=gt-metadata-merger.firebaseapp.com
PUBLIC_FIREBASE_PROJECT_ID=gt-metadata-merger
PUBLIC_FIREBASE_STORAGE_BUCKET=gt-metadata-merger.firebasestorage.app
PUBLIC_FIREBASE_MESSAGING_SENDER_ID=198090983108
PUBLIC_FIREBASE_APP_ID=1:198090983108:web:a90faac4214ecd91d76b91
PUBLIC_FIREBASE_MEASUREMENT_ID=G-P0DY1QKD63

# Sentry (public — rate-limited DSN)
PUBLIC_SENTRY_DSN=https://789a81283ea0ec0d1f762a19102c7a91@o4507198765277184.ingest.us.sentry.io/4508912384729182`}</pre>
        <p className="text-[10px] text-zinc-600">
          Runtime secrets (Dodo, Gemini, Gateway) are stored in Firestore and fetched server-side — they do NOT belong in .env.
        </p>
      </div>

      {/* ── Firebase Functions config reference ── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400">
          Firebase Functions Config (Deployed Functions)
        </h3>
        <p className="text-xs text-zinc-500">
          Run these commands once to configure your deployed Cloud Functions. The functions read these at startup.
        </p>
        <pre className="bg-zinc-950 rounded-lg p-4 text-[11px] font-mono text-zinc-400 overflow-x-auto leading-relaxed">{`# Set the gateway API key (same value as saved above in Keys & Secrets)
firebase functions:config:set gateway.key="YOUR_GATEWAY_API_KEY"

# Then deploy
firebase deploy --only functions`}</pre>
      </div>

    </div>
  )
}
