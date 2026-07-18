import { useState, useEffect } from "react"
import { doc, setDoc, onSnapshot, addDoc, collection } from "firebase/firestore"
import { db } from "../firebase"
import { useAuth } from "../contexts/AuthContext"
import { useToastStore } from "../store/useToastStore"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Sliders, Database, Save, Shield, Info, ArrowLeftRight } from "lucide-react"

interface ThresholdCfg {
  maxFiles: string
  maxSizeMB: string
}

export default function AdminPlanThresholds() {
  const { adminData, loading: authLoading } = useAuth()
  const role = adminData?.role ?? "ADMIN"
  const isSuperAdmin = role === "SUPER_ADMIN"
  const isDev = import.meta.env.DEV
  const hasAccess = isDev || isSuperAdmin || role === "ADMIN"

  const [isLight, setIsLight] = useState(false)
  const [saving, setSaving] = useState(false)
  const [recoveryPassHours, setRecoveryPassHours] = useState("24")

  const [tierThresholds, setTierThresholds] = useState<Record<string, ThresholdCfg>>({
    free:          { maxFiles: "250",    maxSizeMB: "500"    },
    recovery_pass: { maxFiles: "0",     maxSizeMB: "0"      },
    pro:           { maxFiles: "50000",  maxSizeMB: "51200"  },
    super:         { maxFiles: "100000", maxSizeMB: "102400" },
  })

  // Theme observer
  useEffect(() => {
    const checkTheme = () => {
      setIsLight(document.documentElement.classList.contains("light"))
    }
    checkTheme()
    const observer = new MutationObserver(checkTheme)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    return () => observer.disconnect()
  }, [])

  // Listen to thresholds configurations in Firestore
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "global"), (snap) => {
      if (snap.exists()) {
        const data = snap.data()
        const stored = data.tierThresholds as Record<string, any> | undefined
        if (stored) {
          setTierThresholds({
            free: {
              maxFiles: String(stored.free?.maxFiles ?? "250"),
              maxSizeMB: String(stored.free?.maxSizeMB ?? "500"),
            },
            recovery_pass: {
              maxFiles: String(stored.recovery_pass?.maxFiles ?? "0"),
              maxSizeMB: String(stored.recovery_pass?.maxSizeMB ?? "0"),
            },
            pro: {
              maxFiles: String(stored.pro?.maxFiles ?? "50000"),
              maxSizeMB: String(stored.pro?.maxSizeMB ?? "51200"),
            },
            super: {
              maxFiles: String(stored.super?.maxFiles ?? "100000"),
              maxSizeMB: String(stored.super?.maxSizeMB ?? "102400"),
            },
          })
        }
        // Load recovery pass hours
        if (data.recoveryPassHours !== undefined) {
          setRecoveryPassHours(String(data.recoveryPassHours))
        }
      }
    })

    return () => unsub()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await setDoc(
        doc(db, "settings", "global"),
        {
          freeQuotaMB: Number(tierThresholds.free.maxSizeMB), // sync mirror
          recoveryPassHours: Number(recoveryPassHours),
          tierThresholds: {
            free: {
              maxFiles: Number(tierThresholds.free.maxFiles),
              maxSizeMB: Number(tierThresholds.free.maxSizeMB),
            },
            recovery_pass: {
              maxFiles: Number(tierThresholds.recovery_pass.maxFiles),
              maxSizeMB: Number(tierThresholds.recovery_pass.maxSizeMB),
            },
            pro: {
              maxFiles: Number(tierThresholds.pro.maxFiles),
              maxSizeMB: Number(tierThresholds.pro.maxSizeMB),
            },
            super: {
              maxFiles: Number(tierThresholds.super.maxFiles),
              maxSizeMB: Number(tierThresholds.super.maxSizeMB),
            },
          },
        },
        { merge: true }
      )

      await addDoc(collection(db, "admin_activity"), {
        actorUid: adminData?.uid || "system",
        actorName: adminData?.displayName || "Admin",
        actorRole: role,
        action: "PLAN_THRESHOLDS_CHANGE",
        description: `Updated plan thresholds (Free: ${tierThresholds.free.maxFiles} files/${tierThresholds.free.maxSizeMB}MB, Recovery Pass: ${tierThresholds.recovery_pass.maxFiles} files/${tierThresholds.recovery_pass.maxSizeMB}MB, Pro: ${tierThresholds.pro.maxFiles} files, Super: ${tierThresholds.super.maxFiles} files).`,
        timestamp: Date.now(),
      })

      useToastStore.getState().addToast("Plan thresholds saved successfully.", "success")
    } catch (err: any) {
      console.error(err)
      useToastStore.getState().addToast("Failed to save plan thresholds: " + err.message, "error")
    } finally {
      setSaving(false)
    }
  }

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
          You do not have the required permissions to view this page. Admin access only.
        </p>
      </div>
    )
  }

  const TIERS = [
    { key: "free", label: "Free Plan", color: "text-green-400", border: "border-green-500/25", bg: "bg-green-500/5", desc: "For new users testing out the fixer tool." },
    { key: "recovery_pass", label: "Recovery Pass", color: "text-purple-400", border: "border-purple-500/25", bg: "bg-purple-500/5", desc: "24-hour unlimited restoration pass." },
    { key: "pro", label: "Pro Lifetime", color: "text-blue-400", border: "border-blue-500/25", bg: "bg-blue-500/5", desc: "Unlimited plan for general users." },
    { key: "super", label: "Super Lifetime", color: "text-amber-400", border: "border-amber-500/25", bg: "bg-amber-500/5", desc: "Highest capacity tier for power users." },
  ]

  return (
    <div className="space-y-8 max-w-5xl mx-auto px-4 py-8 font-sans transition-all duration-300" style={{ color: isLight ? '#1f2937' : '#f3f4f6' }}>
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6" style={{ borderColor: isLight ? '#e5e7eb' : '#27272a' }}>
        <div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-2" style={{ color: isLight ? '#111827' : '#ffffff' }}>
            <Sliders className="w-8 h-8 text-indigo-500" /> Plan Tool Thresholds
          </h1>
          <p className="text-sm mt-1" style={{ color: isLight ? '#6b7280' : '#a1a1aa' }}>
            Set custom file count and folder size (MB) limit parameters enforced at runtime on the client work area.
          </p>
        </div>
      </div>

      {/* Info Alert */}
      <div className="p-4 rounded-xl border flex gap-3 text-xs"
           style={{
             backgroundColor: isLight ? '#f0fdf4' : '#022c22',
             borderColor: isLight ? '#bbf7d0' : '#115e59',
             color: isLight ? '#166534' : '#34d399'
           }}>
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          <strong>Operational Guideline:</strong> The client-side extractor validates total uncompressed sizes against these values when starting a fixes queue. Setting a threshold higher gives users larger allowance per session.
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {TIERS.map(({ key, label, color, border, bg, desc }) => (
          <Card key={key} className="shadow-none border" style={{ backgroundColor: isLight ? '#ffffff' : '#09090b', borderColor: isLight ? '#e5e7eb' : '#27272a' }}>
            <CardHeader className="border-b" style={{ borderColor: isLight ? '#e5e7eb' : '#1f1f23' }}>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className={`text-sm font-bold ${color}`}>{label}</CardTitle>
                  <CardDescription className="text-xs mt-1" style={{ color: isLight ? '#6b7280' : '#88888b' }}>{desc}</CardDescription>
                </div>
                <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full border ${border} ${bg} ${color}`}>
                  {key.toUpperCase()}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              
              {/* Max Files */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider block" style={{ color: isLight ? '#4b5563' : '#a1a1aa' }}>
                  Max File Count
                </label>
                <div className="relative flex items-center">
                  <Database className="w-4 h-4 text-zinc-500 absolute left-3" />
                  <Input
                    type="number"
                    min="0"
                    value={tierThresholds[key].maxFiles}
                    onChange={(e) => setTierThresholds(prev => ({
                      ...prev,
                      [key]: { ...prev[key], maxFiles: e.target.value }
                    }))}
                    className="pl-10 text-xs h-9"
                    style={{
                      backgroundColor: isLight ? '#f9fafb' : '#0f0f12',
                      borderColor: isLight ? '#d1d5db' : '#27272a',
                      color: isLight ? '#1f2937' : '#f3f4f6'
                    }}
                  />
                </div>
                <div className="text-[10px] text-zinc-550 dark:text-zinc-500 font-medium">
                  {Number(tierThresholds[key].maxFiles) === 0 ? <span className="text-emerald-500 dark:text-emerald-400 font-bold">✓ Unlimited file count (0)</span> : "Enforces a limit on total files."}
                </div>
              </div>

              {/* Max Size */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider block" style={{ color: isLight ? '#4b5563' : '#a1a1aa' }}>
                  Max Size Quota (MB)
                </label>
                <div className="relative flex items-center">
                  <ArrowLeftRight className="w-4 h-4 text-zinc-500 absolute left-3" />
                  <Input
                    type="number"
                    min="0"
                    value={tierThresholds[key].maxSizeMB}
                    onChange={(e) => setTierThresholds(prev => ({
                      ...prev,
                      [key]: { ...prev[key], maxSizeMB: e.target.value }
                    }))}
                    className="pl-10 text-xs h-9"
                    style={{
                      backgroundColor: isLight ? '#f9fafb' : '#0f0f12',
                      borderColor: isLight ? '#d1d5db' : '#27272a',
                      color: isLight ? '#1f2937' : '#f3f4f6'
                    }}
                  />
                </div>
                <div className="text-[10px] text-zinc-550 dark:text-zinc-500 font-medium">
                  {Number(tierThresholds[key].maxSizeMB) === 0 ? (
                    <span className="text-emerald-500 dark:text-emerald-400 font-bold">✓ Unlimited size quota (0)</span>
                  ) : (
                    <>Equivalent to ≈ <strong>{(Number(tierThresholds[key].maxSizeMB) / 1024).toFixed(2)} GB</strong></>
                  )}
                </div>
              </div>

              {/* Inline duration config — only for recovery_pass */}
              {key === 'recovery_pass' && (
                <div className="space-y-1.5 pt-3 border-t" style={{ borderColor: isLight ? '#e5e7eb' : '#1f1f23' }}>
                  <label className="text-[10px] font-bold uppercase tracking-wider block text-purple-400">
                    Pass Duration (Hours)
                  </label>
                  <div className="relative flex items-center">
                    <ArrowLeftRight className="w-4 h-4 text-zinc-500 absolute left-3" />
                    <Input
                      type="number"
                      min="1"
                      max="720"
                      value={recoveryPassHours}
                      onChange={(e) => setRecoveryPassHours(e.target.value)}
                      className="pl-10 text-xs h-9"
                      style={{
                        backgroundColor: isLight ? '#f9fafb' : '#0f0f12',
                        borderColor: isLight ? '#d1d5db' : '#27272a',
                        color: isLight ? '#1f2937' : '#f3f4f6'
                      }}
                    />
                  </div>
                  <div className="text-[10px] text-purple-400 font-bold">
                    ✓ Each purchase gives <strong>{recoveryPassHours}h</strong> of unlimited restoration (stackable)
                  </div>
                </div>
              )}

            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recovery Pass Duration */}
      {/* Save Button */}
      <div className="flex justify-end pt-4 border-t" style={{ borderColor: isLight ? '#e5e7eb' : '#27272a' }}>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 h-10 text-xs font-bold rounded-xl flex items-center gap-2"
        >
          {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
          Save Plan Thresholds
        </Button>
      </div>

    </div>
  )
}
