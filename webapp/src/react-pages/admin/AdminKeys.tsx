import { useState, useEffect, useCallback } from "react"
import { doc, setDoc, onSnapshot } from "firebase/firestore"
import { db } from "../../firebase"
import { useAuth } from "../../contexts/AuthContext"
import { isSuperAdminEmail } from "../../lib/adminAuth"
import { useToastStore } from "../../store/useToastStore"
import { encrypt, deriveKeyFromPassword } from "../../lib/crypto"
import { Shield } from "lucide-react"
import { type KeyEntry, KEY_DEFINITIONS } from "../../components/admin/keys/types"
import { MekBanner } from "../../components/admin/keys/MekBanner"
import { KeysHeader } from "../../components/admin/keys/KeysHeader"
import { InfoBanner } from "../../components/admin/keys/InfoBanner"
import { CategoryTabs } from "../../components/admin/keys/CategoryTabs"
import { KeysByCategory } from "../../components/admin/keys/KeysByCategory"
import { ConfigFilesSection } from "../../components/admin/keys/ConfigFilesSection"

export default function AdminKeys() {
  const { user, adminData, loading: authLoading } = useAuth()
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
    const savedMek = sessionStorage.getItem("tf_mek")
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
    return entry?.value ? entry.value : fallback
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

  const isDev = import.meta.env.DEV
  const isSuperAdminEmailMatch = isSuperAdminEmail(user?.email || adminData?.email)
  const hasAccess = isDev || isSuperAdminEmailMatch || adminData?.role === "SUPER_ADMIN"

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

  const totalKeys = entries.length
  const configuredKeys = entries.filter(e => Boolean(e.value)).length
  const missingKeys = totalKeys - configuredKeys

  return (
    <div className="relative font-sans space-y-8 t-text-primary">
      <KeysHeader totalKeys={totalKeys} missingKeys={missingKeys} />

      <MekBanner
        mek={mek}
        mekInput={mekInput}
        onMekInputChange={setMekInput}
        onMekInputKeyDown={(e) => e.key === "Enter" && handleMekSubmit()}
        onSubmit={handleMekSubmit}
        onClear={handleMekClear}
      />

      <InfoBanner />

      <CategoryTabs
        activeCategory={activeCategory}
        entries={entries}
        onSelectCategory={setActiveCategory}
      />

      <KeysByCategory
        loading={loading}
        activeCategory={activeCategory}
        entries={entries}
        saving={saving}
        mekKey={mekKey}
        onSave={handleSave}
      />

      <ConfigFilesSection
        frontendEnvText={frontendEnvText}
        localServerEnvText={localServerEnvText}
        functionsConfigText={functionsConfigText}
        indexNowScriptText={indexNowScriptText}
      />
    </div>
  )
}
