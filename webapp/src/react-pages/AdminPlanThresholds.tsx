import { useState, useEffect } from "react"
import { doc, setDoc, onSnapshot, addDoc, collection, getDocs } from "firebase/firestore"
import { db } from "../firebase"
import { useAuth } from "../contexts/AuthContext"
import { useToastStore } from "../store/useToastStore"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Sliders, Database, Save, Shield, Info, ArrowLeftRight, Zap, Bell, Clock, Sparkles } from "lucide-react"

interface ThresholdCfg {
  maxFiles: string
  maxSizeMB: string
}

export default function AdminPlanThresholds() {
  const { user, adminData, loading: authLoading } = useAuth()
  const isSuperAdminEmail = (user?.email || adminData?.email) === 'rahuljena.dev@gmail.com'
  const role = isSuperAdminEmail ? "SUPER_ADMIN" : (adminData?.role ?? "ADMIN")
  const isSuperAdmin = role === "SUPER_ADMIN" || isSuperAdminEmail
  const isDev = import.meta.env.DEV
  const hasAccess = isDev || isSuperAdmin || role === "ADMIN"

  const [saving, setSaving] = useState(false)
  const [recoveryPassDurationVal, setRecoveryPassDurationVal] = useState("24")
  const [recoveryPassDurationUnit, setRecoveryPassDurationUnit] = useState<"hours" | "days">("hours")

  // Limited-Time Unlimited Free Tier Promo State
  const [freePromoActive, setFreePromoActive] = useState(false)
  const [freePromoDurationVal, setFreePromoDurationVal] = useState("24")
  const [freePromoDurationUnit, setFreePromoDurationUnit] = useState<"hours" | "days">("hours")
  const [freePromoEndsAt, setFreePromoEndsAt] = useState<number | null>(null)
  const [freePromoProcessing, setFreePromoProcessing] = useState(false)
  const [freePromoTimeRemaining, setFreePromoTimeRemaining] = useState("")

  // Free Tier Feature Unlock State (Ad-Supported)
  const [unlockFreeFeatures, setUnlockFreeFeatures] = useState<boolean>(true)
  const [unlockFreeFeaturesProcessing, setUnlockFreeFeaturesProcessing] = useState(false)

  const [tierThresholds, setTierThresholds] = useState<Record<string, ThresholdCfg>>({
    free:          { maxFiles: "250",    maxSizeMB: "500"    },
    recovery_pass: { maxFiles: "0",     maxSizeMB: "0"      },
    pro:           { maxFiles: "50000",  maxSizeMB: "51200"  },
    super:         { maxFiles: "100000", maxSizeMB: "102400" },
  })

  // Listen to thresholds & promo configurations in Firestore
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
        // Load recovery pass duration
        if (data.recoveryPassDurationUnit) {
          setRecoveryPassDurationUnit(data.recoveryPassDurationUnit)
          setRecoveryPassDurationVal(String(data.recoveryPassDurationValue || data.recoveryPassHours || "24"))
        } else if (data.recoveryPassHours !== undefined) {
          setRecoveryPassDurationVal(String(data.recoveryPassHours))
          setRecoveryPassDurationUnit("hours")
        }

        // Load free tier promo state
        const promo = data.freeUnlimitedPromo as Record<string, any> | undefined
        if (promo) {
          const isActive = Boolean(promo.enabled && promo.endsAt && Date.now() < promo.endsAt)
          setFreePromoActive(isActive)
          const unit = promo.durationUnit || "hours"
          setFreePromoDurationUnit(unit)
          const val = promo.durationValue ?? (unit === "days" && promo.hours ? promo.hours / 24 : (promo.hours ?? "24"))
          setFreePromoDurationVal(String(val))
          setFreePromoEndsAt(promo.endsAt ?? null)
        } else {
          setFreePromoActive(false)
          setFreePromoEndsAt(null)
        }

        // Load free tier Super feature unlock state (default to true)
        setUnlockFreeFeatures(data.unlockFreeFeatures !== false)
      }
    })

    return () => unsub()
  }, [])

  // Live countdown for promo duration in days:hours:minutes
  useEffect(() => {
    if (!freePromoActive || !freePromoEndsAt) {
      setFreePromoTimeRemaining("")
      return
    }
    const updateCountdown = () => {
      const diff = freePromoEndsAt - Date.now()
      if (diff <= 0) {
        setFreePromoActive(false)
        setFreePromoTimeRemaining("Expired")
        return
      }
      const totalSecs = Math.floor(diff / 1000)
      const days = Math.floor(totalSecs / 86400)
      const hrs = Math.floor((totalSecs % 86400) / 3600)
      const mins = Math.floor((totalSecs % 3600) / 60)
      const pad = (n: number) => String(n).padStart(2, '0')
      setFreePromoTimeRemaining(`${pad(days)}d : ${pad(hrs)}h : ${pad(mins)}m`)
    }
    updateCountdown()
    const timer = setInterval(updateCountdown, 1000)
    return () => clearInterval(timer)
  }, [freePromoActive, freePromoEndsAt])

  const handleToggleFreePromo = async (enable: boolean) => {
    setFreePromoProcessing(true)
    try {
      const val = Math.max(1, Number(freePromoDurationVal) || 1)
      const hours = freePromoDurationUnit === "days" ? val * 24 : val
      const now = Date.now()
      const endsAt = now + hours * 3600 * 1000
      const displayDuration = `${val} ${freePromoDurationUnit}`

      if (enable) {
        // 1. Update settings/global
        await setDoc(
          doc(db, "settings", "global"),
          {
            freeUnlimitedPromo: {
              enabled: true,
              hours,
              durationValue: val,
              durationUnit: freePromoDurationUnit,
              startedAt: now,
              endsAt,
              message: `Special Event: Free Unlimited Restoration is active for the next ${displayDuration}!`,
              activatedBy: adminData?.displayName || "Admin",
            },
          },
          { merge: true }
        )

        // 2. Broadcast notifications to all users
        const notifPayload = {
          title: "🎉 Unlimited Restoration is FREE!",
          message: `Special limited-time event: All file count and storage limits have been lifted for Free Tier users for the next ${displayDuration}! Enjoy unlimited photo restoration.`,
          type: "FREE_UNLIMITED_PROMO",
          href: "/tool",
          read: false,
          createdAt: Date.now(),
        }

        // Global broadcast notification
        await addDoc(collection(db, "notifications"), {
          ...notifPayload,
          recipientEmail: "all",
        })

        // Also write directly for all existing registered users
        const usersSnap = await getDocs(collection(db, "users"))
        const notifPromises = usersSnap.docs.map((userDoc) => {
          const uEmail = userDoc.data().email
          if (!uEmail) return Promise.resolve()
          return addDoc(collection(db, "notifications"), {
            ...notifPayload,
            recipientEmail: uEmail.toLowerCase(),
          })
        })
        await Promise.all(notifPromises)

        // 3. Admin audit log
        await addDoc(collection(db, "admin_activity"), {
          actorUid: adminData?.uid || "system",
          actorName: adminData?.displayName || "Admin",
          actorRole: role,
          action: "PROMO_ENABLE_FREE_UNLIMITED",
          description: `Activated limited-time unlimited restoration for all Free tier users for ${hours} hours (ends at ${new Date(endsAt).toLocaleString()}). Notified ${usersSnap.size} user(s).`,
          timestamp: Date.now(),
        })

        setFreePromoActive(true)
        setFreePromoEndsAt(endsAt)
        useToastStore.getState().addToast(`Unlimited Free Tier enabled for ${displayDuration}! Notifications sent to all users.`, "success")
      } else {
        // Disable promo
        await setDoc(
          doc(db, "settings", "global"),
          {
            freeUnlimitedPromo: {
              enabled: false,
              hours,
              durationValue: val,
              durationUnit: freePromoDurationUnit,
              startedAt: null,
              endsAt: null,
            },
          },
          { merge: true }
        )

        await addDoc(collection(db, "admin_activity"), {
          actorUid: adminData?.uid || "system",
          actorName: adminData?.displayName || "Admin",
          actorRole: role,
          action: "PROMO_DISABLE_FREE_UNLIMITED",
          description: `Deactivated limited-time unlimited restoration for Free tier users.`,
          timestamp: Date.now(),
        })

        setFreePromoActive(false)
        setFreePromoEndsAt(null)
        useToastStore.getState().addToast("Unlimited Free Tier promo disabled.", "info")
      }
    } catch (err: any) {
      console.error(err)
      useToastStore.getState().addToast("Failed to update promo: " + err.message, "error")
    } finally {
      setFreePromoProcessing(false)
    }
  }

  const handleToggleUnlockFreeFeatures = async (enable: boolean) => {
    setUnlockFreeFeaturesProcessing(true)
    try {
      await setDoc(
        doc(db, "settings", "global"),
        {
          unlockFreeFeatures: enable,
        },
        { merge: true }
      )

      await addDoc(collection(db, "admin_activity"), {
        actorUid: adminData?.uid || "system",
        actorName: adminData?.displayName || "Admin",
        actorRole: role,
        action: enable ? "UNLOCK_FREE_FEATURES_ENABLED" : "UNLOCK_FREE_FEATURES_DISABLED",
        description: `${enable ? "Unlocked" : "Locked"} all Super features for Free tier users (ad-supported).`,
        timestamp: Date.now(),
      })

      setUnlockFreeFeatures(enable)
      useToastStore.getState().addToast(
        enable
          ? "All Super features unlocked for Free tier (ad-supported)!"
          : "Super features restricted to Super plan.",
        "success"
      )
    } catch (err: any) {
      console.error(err)
      useToastStore.getState().addToast("Failed to update feature settings: " + err.message, "error")
    } finally {
      setUnlockFreeFeaturesProcessing(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const recVal = Math.max(1, Number(recoveryPassDurationVal) || 1)
      const recHours = recoveryPassDurationUnit === "days" ? recVal * 24 : recVal

      await setDoc(
        doc(db, "settings", "global"),
        {
          unlockFreeFeatures: unlockFreeFeatures,
          freeQuotaMB: Number(tierThresholds.free.maxSizeMB), // sync mirror
          recoveryPassHours: recHours,
          recoveryPassDurationValue: recVal,
          recoveryPassDurationUnit: recoveryPassDurationUnit,
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
    { key: "recovery_pass", label: "Recovery Pass", color: "text-cyan-400", border: "border-cyan-500/25", bg: "bg-cyan-500/5", desc: "24-hour unlimited restoration pass." },
    { key: "pro", label: "Pro Lifetime", color: "text-blue-400", border: "border-blue-500/25", bg: "bg-blue-500/5", desc: "Unlimited plan for general users." },
    { key: "super", label: "Super Lifetime", color: "text-amber-400", border: "border-amber-500/25", bg: "bg-amber-500/5", desc: "Highest capacity tier for power users." },
  ]

  return (
    <div className="space-y-8 w-full max-w-full px-2 sm:px-4 py-8 font-sans transition-all duration-300 t-text-primary">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6 t-border">
        <div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-2 t-heading">
            <Sliders className="w-8 h-8 text-zinc-100" /> Plan Tool Thresholds
          </h1>
          <p className="text-sm mt-1 t-text-muted">
            Set custom file count and folder size (MB) limit parameters enforced at runtime on the client work area.
          </p>
        </div>
      </div>

      {/* Info Alert */}
      <div className="p-4 rounded-xl border flex gap-3 text-xs t-green-banner">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          <strong>Operational Guideline:</strong> The client-side extractor validates total uncompressed sizes against these values when starting a fixes queue. Setting a threshold higher gives users larger allowance per session.
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 items-stretch">
        {TIERS.map(({ key, label, color, border, bg, desc }) => (
          <Card key={key} className="shadow-none border t-card flex flex-col justify-between h-full">
            <CardHeader className="border-b t-border-subtle p-4">
              <div className="flex justify-between items-start gap-2">
                <div>
                  <CardTitle className={`text-sm font-bold ${color}`}>{label}</CardTitle>
                  <CardDescription className="text-xs mt-1 t-text-hint line-clamp-2">{desc}</CardDescription>
                </div>
                <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full border shrink-0 ${border} ${bg} ${color}`}>
                  {key.toUpperCase()}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 p-4 flex-1 flex flex-col justify-between">
              
              {/* Max Files */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider block t-text-secondary">
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
                    className="pl-10 text-xs h-9 t-input"
                  />
                </div>
                <div className="text-[10px] text-zinc-550 dark:text-zinc-500 font-medium">
                  {Number(tierThresholds[key].maxFiles) === 0 ? <span className="text-emerald-500 dark:text-emerald-400 font-bold">✓ Unlimited file count (0)</span> : "Enforces a limit on total files."}
                </div>
              </div>

              {/* Max Size */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider block t-text-secondary">
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
                    className="pl-10 text-xs h-9 t-input"
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

              {/* Free Tier Super Feature Unlock (Ad-Supported) */}
              {key === 'free' && (
                <div className="space-y-2 pt-3 border-t t-border-subtle">
                  <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20">
                    <div className="pr-2">
                      <label className="text-[10px] font-bold uppercase tracking-wider block text-purple-400 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                        Unlock Super Features
                      </label>
                      <p className="text-[10px] text-zinc-400 mt-0.5 leading-relaxed">
                        Free users can access EXIF Viewer, Metadata Comparison, and Duplicate Analyzer with ads.
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={unlockFreeFeaturesProcessing}
                      onClick={() => handleToggleUnlockFreeFeatures(!unlockFreeFeatures)}
                      className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        unlockFreeFeatures ? 'bg-purple-600' : 'bg-zinc-700'
                      }`}
                      title={unlockFreeFeatures ? "Disable Super features for Free" : "Unlock Super features for Free"}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          unlockFreeFeatures ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              )}

              {/* Limited-Time Unlimited for Free Tier Promo Config */}
              {key === 'free' && (
                <div className="space-y-3 pt-3 border-t t-border-subtle">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider block text-emerald-400 flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 text-emerald-400" />
                        Limited-Time Unlimited for Free Tier
                      </label>
                      <p className="text-[10px] text-zinc-400 mt-0.5">
                        Temporarily lift all file &amp; size limits for Free users and notify all registered accounts.
                      </p>
                    </div>

                    {/* Toggle Switch */}
                    <button
                      type="button"
                      disabled={freePromoProcessing}
                      onClick={() => handleToggleFreePromo(!freePromoActive)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        freePromoActive ? 'bg-emerald-500' : 'bg-zinc-700'
                      }`}
                      title={freePromoActive ? "Deactivate unlimited promo" : "Activate unlimited promo"}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          freePromoActive ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Active Banner & Countdown */}
                  {freePromoActive && (
                    <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs">
                      <div className="flex items-center gap-2 text-emerald-400 font-bold">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                        <span>PROMO ACTIVE</span>
                        {freePromoTimeRemaining && (
                          <span className="font-mono text-zinc-300 text-[11px] font-normal">
                            ({freePromoTimeRemaining} left)
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-emerald-300 font-medium">Free users have Unlimited quota</span>
                    </div>
                  )}

                  {/* Duration input & unit dropdown */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-semibold text-zinc-400 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-zinc-500" /> Promo Duration
                      </label>
                      <div className="flex items-center gap-1">
                        {freePromoDurationUnit === "hours" ? (
                          ["12", "24", "48", "72"].map((h) => (
                            <button
                              key={h}
                              type="button"
                              onClick={() => setFreePromoDurationVal(h)}
                              className={`px-1.5 py-0.5 text-[9px] font-bold rounded border transition-colors cursor-pointer ${
                                freePromoDurationVal === h
                                  ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                                  : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white"
                              }`}
                            >
                              {h}h
                            </button>
                          ))
                        ) : (
                          ["1", "2", "3", "7"].map((d) => (
                            <button
                              key={d}
                              type="button"
                              onClick={() => setFreePromoDurationVal(d)}
                              className={`px-1.5 py-0.5 text-[9px] font-bold rounded border transition-colors cursor-pointer ${
                                freePromoDurationVal === d
                                  ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                                  : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white"
                              }`}
                            >
                              {d}d
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1 flex items-center">
                        <Clock className="w-4 h-4 text-zinc-500 absolute left-3" />
                        <Input
                          type="number"
                          min="1"
                          max={freePromoDurationUnit === "days" ? "365" : "8760"}
                          value={freePromoDurationVal}
                          onChange={(e) => setFreePromoDurationVal(e.target.value)}
                          disabled={freePromoProcessing}
                          className="pl-10 text-xs h-9 t-input"
                          placeholder={freePromoDurationUnit === "days" ? "e.g. 2" : "e.g. 24"}
                        />
                      </div>
                      <select
                        value={freePromoDurationUnit}
                        onChange={(e) => setFreePromoDurationUnit(e.target.value as "hours" | "days")}
                        disabled={freePromoProcessing}
                        className="h-9 px-2.5 text-xs font-semibold rounded-lg border t-border bg-zinc-900 text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                      >
                        <option value="hours">Hours</option>
                        <option value="days">Days</option>
                      </select>
                    </div>
                  </div>

                  {/* Action button */}
                  <div className="pt-1">
                    <Button
                      type="button"
                      disabled={freePromoProcessing}
                      onClick={() => handleToggleFreePromo(!freePromoActive)}
                      className={`w-full h-8 text-xs font-bold rounded-lg flex items-center justify-center gap-2 cursor-pointer transition-all ${
                        freePromoActive
                          ? "bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/40"
                          : "bg-emerald-600 hover:bg-emerald-500 text-white"
                      }`}
                    >
                      {freePromoProcessing ? (
                        <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      ) : freePromoActive ? (
                        "Turn Off Limited-Time Promo"
                      ) : (
                        <>
                          <Bell className="w-3.5 h-3.5" />
                          Enable &amp; Notify All Users ({freePromoDurationVal} {freePromoDurationUnit})
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* Inline duration config — only for recovery_pass */}
              {key === 'recovery_pass' && (
                <div className="space-y-1.5 pt-3 border-t t-border-subtle">
                  <label className="text-[10px] font-bold uppercase tracking-wider block text-cyan-400">
                    Pass Duration
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1 flex items-center">
                      <ArrowLeftRight className="w-4 h-4 text-zinc-500 absolute left-3" />
                      <Input
                        type="number"
                        min="1"
                        max={recoveryPassDurationUnit === "days" ? "365" : "8760"}
                        value={recoveryPassDurationVal}
                        onChange={(e) => setRecoveryPassDurationVal(e.target.value)}
                        className="pl-10 text-xs h-9 t-input"
                        placeholder={recoveryPassDurationUnit === "days" ? "e.g. 1" : "e.g. 24"}
                      />
                    </div>
                    <select
                      value={recoveryPassDurationUnit}
                      onChange={(e) => setRecoveryPassDurationUnit(e.target.value as "hours" | "days")}
                      className="h-9 px-2.5 text-xs font-semibold rounded-lg border t-border bg-zinc-900 text-zinc-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 cursor-pointer"
                    >
                      <option value="hours">Hours</option>
                      <option value="days">Days</option>
                    </select>
                  </div>
                  <div className="text-[10px] text-cyan-400 font-bold">
                    ✓ Each purchase gives <strong>{recoveryPassDurationVal} {recoveryPassDurationUnit}</strong> ({recoveryPassDurationUnit === "days" ? (Number(recoveryPassDurationVal) || 1) * 24 : (Number(recoveryPassDurationVal) || 1)}h) of unlimited restoration (stackable)
                  </div>
                </div>
              )}

            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recovery Pass Duration */}
      {/* Save Button */}
      <div className="flex justify-end pt-4 border-t t-border">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="btn-admin-primary px-6 h-10 text-xs font-bold rounded-xl flex items-center gap-2"
        >
          {saving ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
          Save Plan Thresholds
        </Button>
      </div>

    </div>
  )
}
