import React, { useState, useEffect } from "react"
import { doc, setDoc, onSnapshot, addDoc, collection } from "firebase/firestore"
import { db } from "../../firebase"
import { useAuth, type FeatureItem, type FeaturesConfig, DEFAULT_FEATURES_CONFIG, type ComparisonRow, DEFAULT_COMPARISON_ROWS, resolveComparisonRowValues } from "../../contexts/AuthContext"
import { useToastStore } from "../../store/useToastStore"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Shield, Settings, Save, Plus, Trash2 } from "lucide-react"

export default function AdminTierFeatures() {
  const { user, adminData, loading: authLoading, tierThresholds, telemetryAccuracy, platformStats, refreshConfig } = useAuth()
  const isSuperAdminEmail = (user?.email || adminData?.email) === 'rahuljena.dev@gmail.com'
  const role = isSuperAdminEmail ? "SUPER_ADMIN" : (adminData?.role ?? "ADMIN")
  const isSuperAdmin = role === "SUPER_ADMIN" || isSuperAdminEmail
  const isDev = import.meta.env.DEV
  const hasAccess = isDev || isSuperAdmin || role === "ADMIN"

  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [recoveryPassHours, setRecoveryPassHours] = useState<number>(24)

  // Dynamic Features customizer states
  const [freeFeatures, setFreeFeatures] = useState<FeatureItem[]>([])
  const [recoveryFeatures, setRecoveryFeatures] = useState<FeatureItem[]>([])
  const [proFeatures, setProFeatures] = useState<FeatureItem[]>([])
  const [superFeatures, setSuperFeatures] = useState<FeatureItem[]>([])
  const [refundPolicy, setRefundPolicy] = useState<string>("")
  const [comparisonRows, setComparisonRows] = useState<ComparisonRow[]>([])

  // Card heading and subheading editable texts
  const [headings, setHeadings] = useState({
    free: DEFAULT_FEATURES_CONFIG.headings.free,
    recovery_pass: DEFAULT_FEATURES_CONFIG.headings.recovery_pass,
    pro: DEFAULT_FEATURES_CONFIG.headings.pro,
    super: DEFAULT_FEATURES_CONFIG.headings.super,
  })
  const [subheadings, setSubheadings] = useState({
    free: DEFAULT_FEATURES_CONFIG.subheadings.free,
    recovery_pass: DEFAULT_FEATURES_CONFIG.subheadings.recovery_pass,
    pro: DEFAULT_FEATURES_CONFIG.subheadings.pro,
    super: DEFAULT_FEATURES_CONFIG.subheadings.super,
  })

  // Listen to features configurations in Firestore
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "global"), (snap) => {
      if (snap.exists()) {
        const data = snap.data()
        if (data.recoveryPassHours !== undefined) {
          setRecoveryPassHours(Number(data.recoveryPassHours))
        }
        const storedFeatures = data.features_config as FeaturesConfig | undefined
        if (storedFeatures) {
          setFreeFeatures(storedFeatures.free || DEFAULT_FEATURES_CONFIG.free)
          setRecoveryFeatures(storedFeatures.recovery_pass || DEFAULT_FEATURES_CONFIG.recovery_pass)
          setProFeatures(storedFeatures.pro || DEFAULT_FEATURES_CONFIG.pro)
          setSuperFeatures(storedFeatures.super || DEFAULT_FEATURES_CONFIG.super)
          setHeadings({
            free: storedFeatures.headings?.free ?? DEFAULT_FEATURES_CONFIG.headings.free,
            recovery_pass: storedFeatures.headings?.recovery_pass ?? DEFAULT_FEATURES_CONFIG.headings.recovery_pass,
            pro: storedFeatures.headings?.pro ?? DEFAULT_FEATURES_CONFIG.headings.pro,
            super: storedFeatures.headings?.super ?? DEFAULT_FEATURES_CONFIG.headings.super,
          })
          setSubheadings({
            free: storedFeatures.subheadings?.free ?? DEFAULT_FEATURES_CONFIG.subheadings.free,
            recovery_pass: storedFeatures.subheadings?.recovery_pass ?? DEFAULT_FEATURES_CONFIG.subheadings.recovery_pass,
            pro: storedFeatures.subheadings?.pro ?? DEFAULT_FEATURES_CONFIG.subheadings.pro,
            super: storedFeatures.subheadings?.super ?? DEFAULT_FEATURES_CONFIG.subheadings.super,
          })
        } else {
          setFreeFeatures(DEFAULT_FEATURES_CONFIG.free)
          setRecoveryFeatures(DEFAULT_FEATURES_CONFIG.recovery_pass)
          setProFeatures(DEFAULT_FEATURES_CONFIG.pro)
          setSuperFeatures(DEFAULT_FEATURES_CONFIG.super)
          setHeadings({ ...DEFAULT_FEATURES_CONFIG.headings })
          setSubheadings({ ...DEFAULT_FEATURES_CONFIG.subheadings })
        }
        const storedRefundPolicy = data.refundPolicy as string | undefined
        setRefundPolicy(storedRefundPolicy ?? "We offer a 100% Recovery Guarantee: if a verified technical issue prevents your restoration, and our support desk is unable to resolve it, we will issue a full refund within 7 days of purchase. Refunds are not available for change of mind or successfully completed recoveries.")
        
        const storedComparisonRows = data.comparisonRows as ComparisonRow[] | undefined
        if (storedComparisonRows) {
          setComparisonRows(storedComparisonRows.map(r => {
            if (r.featureName?.toLowerCase().includes("matching") && r.isDynamicTelemetry === undefined) {
              return { ...r, isDynamicTelemetry: true }
            }
            return r
          }))
        } else {
          setComparisonRows(DEFAULT_COMPARISON_ROWS)
        }
      }
    })

    return () => unsub()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("takeoutfix_cached_global_config")
      }
      await setDoc(
        doc(db, "settings", "global"),
        {
          features_config: {
            free: freeFeatures,
            recovery_pass: recoveryFeatures,
            pro: proFeatures,
            super: superFeatures,
            headings,
            subheadings,
          },
          refundPolicy,
          comparisonRows,
        },
        { merge: true }
      )

      await refreshConfig()

      await addDoc(collection(db, "admin_activity"), {
        actorUid: adminData?.uid || "system",
        actorName: adminData?.displayName || "Admin",
        actorRole: role,
        action: "TIER_FEATURES_CHANGE",
        description: "Updated pricing tier features, card headings, and subheading configuration.",
        timestamp: Date.now(),
      })

      useToastStore.getState().addToast("Pricing features configuration saved successfully.", "success")
    } catch (err: any) {
      console.error(err)
      useToastStore.getState().addToast("Failed to save pricing features: " + err.message, "error")
    } finally {
      setSaving(false)
    }
  }

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>, val: string, setVal: (s: string) => void) => {
    const isCtrl = e.ctrlKey || e.metaKey
    if (!isCtrl) return

    let wrapStart = ""
    let wrapEnd = ""

    if (e.key === "b" || e.key === "B") {
      wrapStart = "**"
      wrapEnd = "**"
    } else if (e.key === "i" || e.key === "I") {
      wrapStart = "*"
      wrapEnd = "*"
    } else if (e.key === "u" || e.key === "U") {
      wrapStart = "<u>"
      wrapEnd = "</u>"
    } else {
      return
    }

    e.preventDefault()
    const el = e.currentTarget
    const start = el.selectionStart ?? 0
    const end = el.selectionEnd ?? 0
    const selection = el.value.slice(start, end)
    const newValue = el.value.slice(0, start) + wrapStart + selection + wrapEnd + el.value.slice(end)

    setVal(newValue)
    setTimeout(() => {
      el.selectionStart = start + wrapStart.length
      el.selectionEnd = start + wrapStart.length + selection.length
      el.focus()
    }, 0)
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

  const COLS = [
    { planKey: "free" as const, label: "Free Plan", color: "text-green-400", items: freeFeatures, setItems: setFreeFeatures },
    { planKey: "recovery_pass" as const, label: "Recovery Pass", color: "text-cyan-400", items: recoveryFeatures, setItems: setRecoveryFeatures },
    { planKey: "pro" as const, label: "Pro Lifetime", color: "text-blue-400", items: proFeatures, setItems: setProFeatures },
    { planKey: "super" as const, label: "Super Lifetime", color: "text-amber-400", items: superFeatures, setItems: setSuperFeatures },
  ]

  return (
    <div className="space-y-8 w-full min-w-0 font-sans transition-all duration-300 t-text-primary">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6 t-border">
        <div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-2 t-heading">
            <Settings className="w-8 h-8 text-indigo-500" /> Tier Features Customizer
          </h1>
          <p className="text-sm mt-1 t-text-muted">
            Customize the card headings, subheadings, and bullet feature lists visible to customers on the landing pricing matrix.
          </p>
        </div>
        <button
          type="button"
          onClick={async () => {
            setResetting(true)
            try {
              // Reset local state to defaults
              setFreeFeatures([...DEFAULT_FEATURES_CONFIG.free])
              setRecoveryFeatures([...DEFAULT_FEATURES_CONFIG.recovery_pass])
              setProFeatures([...DEFAULT_FEATURES_CONFIG.pro])
              setSuperFeatures([...DEFAULT_FEATURES_CONFIG.super])
              setHeadings({ ...DEFAULT_FEATURES_CONFIG.headings })
              setSubheadings({ ...DEFAULT_FEATURES_CONFIG.subheadings })
              // Immediately persist to Firestore
              await setDoc(
                doc(db, 'settings', 'global'),
                {
                  features_config: {
                    free: DEFAULT_FEATURES_CONFIG.free,
                    recovery_pass: DEFAULT_FEATURES_CONFIG.recovery_pass,
                    pro: DEFAULT_FEATURES_CONFIG.pro,
                    super: DEFAULT_FEATURES_CONFIG.super,
                    headings: DEFAULT_FEATURES_CONFIG.headings,
                    subheadings: DEFAULT_FEATURES_CONFIG.subheadings,
                  }
                },
                { merge: true }
              )
              useToastStore.getState().addToast('Features reset to defaults and saved.', 'success')
            } catch (e) {
              useToastStore.getState().addToast('Reset failed.', 'error')
            } finally {
              setResetting(false)
            }
          }}
          disabled={resetting}
          className="text-[11px] font-bold px-3 py-1.5 rounded-lg border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 transition-all flex-shrink-0 flex items-center gap-1.5 cursor-pointer"
        >
          {resetting ? <div className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" /> : '↺'}
          Reset to Defaults
        </button>
      </div>

      <Card className="shadow-none border t-card">
        <CardHeader className="border-b pb-4 t-border-subtle">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 t-heading">
            Pricing Matrix Layout Customizer
          </CardTitle>
          <CardDescription className="text-zinc-500 text-xs">
            Bold items appear highlighted in the client interface. Adding features immediately updates checkout details.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            {COLS.map(({ planKey, label, color, items, setItems }) => (
              <div key={planKey} className="border rounded-xl p-4 space-y-4 t-surface-subtle">
                <div className={`text-xs font-bold border-b pb-2 ${color} t-border-subtle`}>
                  {label}
                </div>

                {/* Heading */}
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Heading</label>
                  <input
                    type="text"
                    value={headings[planKey]}
                    onChange={(e) => setHeadings(prev => ({ ...prev, [planKey]: e.target.value }))}
                    placeholder="Card heading..."
                    className="w-full border rounded-lg px-3 py-1.5 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500 t-input-subtle-white"
                  />
                </div>

                {/* Subheading */}
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Sub-heading</label>
                  <input
                    type="text"
                    value={subheadings[planKey]}
                    onChange={(e) => setSubheadings(prev => ({ ...prev, [planKey]: e.target.value }))}
                    placeholder="Card subheading..."
                    className="w-full border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 t-input-subtle-muted"
                  />
                  {planKey === 'recovery_pass' && (
                    <div className="text-[9px] text-cyan-400 font-bold mt-1">
                      Live: {(subheadings.recovery_pass || '')
                        .replace(/\{hours\}/g, String(recoveryPassHours))
                        .replace(/\b24\s*(hours|hour)\b/gi, `${recoveryPassHours} hours`)
                        .replace(/\b24-hour\b/gi, `${recoveryPassHours}-hour`)}
                    </div>
                  )}
                </div>

                {/* Features Bullets */}
                <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold pt-2 border-t t-border-subtle">
                  Bullets
                </div>
                <div className="space-y-2">
                  {items.map((feat, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            const updated = items.map((f, i) => i === idx ? { ...f, isBold: !f.isBold } : f)
                            setItems(updated)
                          }}
                          className={`shrink-0 w-6 h-6 rounded text-[10px] font-black border transition-all ${
                            feat.isBold
                              ? "bg-indigo-600 border-indigo-500 text-white"
                              : "t-bold-toggle-off hover:border-zinc-500"
                          }`}
                          title={feat.isBold ? "Bold style: On" : "Bold style: Off"}
                        >
                          B
                        </button>
                        <input
                          type="text"
                          value={feat.text}
                          onKeyDown={(e) => handleTextareaKeyDown(e, feat.text, (newText) => {
                            const updated = items.map((f, i) => i === idx ? { ...f, text: newText } : f)
                            setItems(updated)
                          })}
                          onChange={(e) => {
                            const updated = items.map((f, i) => i === idx ? { ...f, text: e.target.value } : f)
                            setItems(updated)
                          }}
                          className={`flex-1 min-w-0 border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 t-input-surface-12 ${
                            feat.isBold ? "font-bold" : "font-normal"
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setItems(items.filter((_, i) => i !== idx))
                          }}
                          className="shrink-0 w-6 h-6 rounded text-red-500 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 flex items-center justify-center transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {planKey === 'recovery_pass' && (
                        <div className="text-[9px] text-cyan-400 font-bold pl-7">
                          Live: {(feat.text || '')
                            .replace(/\{hours\}/g, String(recoveryPassHours))
                            .replace(/\b24\s*(hours|hour)\b/gi, `${recoveryPassHours} hours`)
                            .replace(/\b24-hour\b/gi, `${recoveryPassHours}-hour`)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setItems([...items, { text: "", isBold: false }])
                  }}
                  className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors pt-2"
                >
                  <Plus className="w-3 h-3" /> Add Feature
                </button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Compare Plans Table Customizer */}
      <Card className="shadow-none border mt-6 t-card">
        <CardHeader className="border-b pb-4 t-border-subtle flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-semibold flex items-center gap-2 t-heading">
              Compare Plans Table Customizer
            </CardTitle>
            <CardDescription className="text-zinc-500 text-xs">
              Edit the detailed feature comparison grid displayed at the bottom of the pricing page.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-semibold px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 self-start sm:self-auto">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Live Telemetry: <strong>{telemetryAccuracy || "90.8%"}</strong> Recovery Accuracy</span>
            {platformStats?.filesRestored && platformStats?.filesScanned && (
              <span className="text-zinc-400 font-normal">
                ({platformStats.filesRestored.toLocaleString()} / {platformStats.filesScanned.toLocaleString()} files)
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b t-border">
                  <th className="py-2 pr-4 font-bold text-zinc-500 w-1/4">Feature Name</th>
                  <th className="py-2 px-2 font-bold text-green-400">Free</th>
                  <th className="py-2 px-2 font-bold text-cyan-400">Recovery Pass</th>
                  <th className="py-2 px-2 font-bold text-blue-400">Pro Lifetime</th>
                  <th className="py-2 px-2 font-bold text-amber-400">Super Lifetime</th>
                  <th className="py-2 pl-4 font-bold text-zinc-500 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row, idx) => {
                  const isLimit = row.isDynamicLimit ?? false
                  const isTelemetry = row.isDynamicTelemetry ?? (row.featureName?.toLowerCase().includes("matching") && !isLimit)
                  const resolved = resolveComparisonRowValues(row, tierThresholds, telemetryAccuracy)
                  const isAutoRendered = isLimit || isTelemetry

                  return (
                    <tr key={idx} className="border-b t-border-subtle">
                      <td className="py-3 pr-4">
                        <input
                          type="text"
                          value={row.featureName}
                          onChange={(e) => {
                            const updated = comparisonRows.map((r, i) => i === idx ? { ...r, featureName: e.target.value } : r)
                            setComparisonRows(updated)
                          }}
                          placeholder="Feature name..."
                          className="w-full border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 font-bold t-input-subtle-white"
                        />
                        {row.featureName?.toLowerCase().includes("matching") ? (
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <input
                              type="checkbox"
                              id={`dyn-telemetry-${idx}`}
                              checked={isTelemetry}
                              onChange={(e) => {
                                const updated = comparisonRows.map((r, i) => i === idx ? { ...r, isDynamicTelemetry: e.target.checked } : r)
                                setComparisonRows(updated)
                              }}
                              className="rounded text-emerald-600 focus:ring-emerald-500 w-3 h-3 bg-zinc-950 border-zinc-800"
                            />
                            <label htmlFor={`dyn-telemetry-${idx}`} className="text-[9px] text-emerald-600 dark:text-emerald-400 cursor-pointer font-bold select-none uppercase tracking-wider flex items-center gap-1">
                              Use dynamic telemetry ({telemetryAccuracy || "90.8%"})
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            </label>
                          </div>
                        ) : (row.featureName?.toLowerCase().includes("processing") || row.isDynamicLimit) ? (
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <input
                              type="checkbox"
                              id={`dyn-limit-${idx}`}
                              checked={isLimit}
                              onChange={(e) => {
                                const updated = comparisonRows.map((r, i) => i === idx ? { ...r, isDynamicLimit: e.target.checked } : r)
                                setComparisonRows(updated)
                              }}
                              className="rounded text-indigo-600 focus:ring-indigo-500 w-3 h-3 bg-zinc-950 border-zinc-800"
                            />
                            <label htmlFor={`dyn-limit-${idx}`} className="text-[9px] text-zinc-500 cursor-pointer font-bold select-none uppercase tracking-wider">
                              Use dynamic limit thresholds
                            </label>
                          </div>
                        ) : null}
                      </td>
                      <td className="py-3 px-2">
                        <textarea
                          value={isAutoRendered ? resolved.free : row.free}
                          disabled={isAutoRendered}
                          onChange={(e) => {
                            const updated = comparisonRows.map((r, i) => i === idx ? { ...r, free: e.target.value } : r)
                            setComparisonRows(updated)
                          }}
                          onKeyDown={(e) => handleTextareaKeyDown(e, isAutoRendered ? resolved.free : row.free, (newVal) => {
                            if (!isAutoRendered) {
                              const updated = comparisonRows.map((r, i) => i === idx ? { ...r, free: newVal } : r)
                              setComparisonRows(updated)
                            }
                          })}
                          placeholder="Value..."
                          rows={1}
                          className={`w-full border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none font-medium t-input-subtle ${
                            isAutoRendered ? "bg-zinc-100/70 dark:bg-zinc-900/70 text-zinc-900 dark:text-zinc-100 border-dashed cursor-not-allowed opacity-90" : ""
                          }`}
                        />
                        {isAutoRendered && (
                          <div className="text-[9px] font-semibold mt-0.5 select-none truncate">
                            {isLimit ? (
                              <span className="text-indigo-600 dark:text-indigo-400">⚡ Dynamic Limit</span>
                            ) : (
                              <span className="text-emerald-600 dark:text-emerald-400">⚡ Live Telemetry ({telemetryAccuracy})</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-2">
                        <textarea
                          value={isAutoRendered ? resolved.recovery_pass : row.recovery_pass}
                          disabled={isAutoRendered}
                          onChange={(e) => {
                            const updated = comparisonRows.map((r, i) => i === idx ? { ...r, recovery_pass: e.target.value } : r)
                            setComparisonRows(updated)
                          }}
                          onKeyDown={(e) => handleTextareaKeyDown(e, isAutoRendered ? resolved.recovery_pass : row.recovery_pass, (newVal) => {
                            if (!isAutoRendered) {
                              const updated = comparisonRows.map((r, i) => i === idx ? { ...r, recovery_pass: newVal } : r)
                              setComparisonRows(updated)
                            }
                          })}
                          placeholder="Value..."
                          rows={1}
                          className={`w-full border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none font-medium t-input-subtle ${
                            isAutoRendered ? "bg-zinc-100/70 dark:bg-zinc-900/70 text-zinc-900 dark:text-zinc-100 border-dashed cursor-not-allowed opacity-90" : ""
                          }`}
                        />
                        {isAutoRendered && (
                          <div className="text-[9px] font-semibold mt-0.5 select-none truncate">
                            {isLimit ? (
                              <span className="text-indigo-600 dark:text-indigo-400">⚡ Dynamic Limit</span>
                            ) : (
                              <span className="text-emerald-600 dark:text-emerald-400">⚡ Live Telemetry</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-2">
                        <textarea
                          value={isAutoRendered ? resolved.pro : row.pro}
                          disabled={isAutoRendered}
                          onChange={(e) => {
                            const updated = comparisonRows.map((r, i) => i === idx ? { ...r, pro: e.target.value } : r)
                            setComparisonRows(updated)
                          }}
                          onKeyDown={(e) => handleTextareaKeyDown(e, isAutoRendered ? resolved.pro : row.pro, (newVal) => {
                            if (!isAutoRendered) {
                              const updated = comparisonRows.map((r, i) => i === idx ? { ...r, pro: newVal } : r)
                              setComparisonRows(updated)
                            }
                          })}
                          placeholder="Value..."
                          rows={1}
                          className={`w-full border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none font-bold t-input-subtle ${
                            isAutoRendered ? "bg-zinc-100/70 dark:bg-zinc-900/70 text-zinc-900 dark:text-zinc-100 border-dashed cursor-not-allowed opacity-90" : ""
                          }`}
                        />
                        {isAutoRendered && (
                          <div className="text-[9px] font-semibold mt-0.5 select-none truncate">
                            {isLimit ? (
                              <span className="text-indigo-600 dark:text-indigo-400">⚡ Dynamic Limit</span>
                            ) : (
                              <span className="text-emerald-600 dark:text-emerald-400">⚡ Live Telemetry ({telemetryAccuracy})</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-2">
                        <textarea
                          value={isAutoRendered ? resolved.super : row.super}
                          disabled={isAutoRendered}
                          onChange={(e) => {
                            const updated = comparisonRows.map((r, i) => i === idx ? { ...r, super: e.target.value } : r)
                            setComparisonRows(updated)
                          }}
                          onKeyDown={(e) => handleTextareaKeyDown(e, isAutoRendered ? resolved.super : row.super, (newVal) => {
                            if (!isAutoRendered) {
                              const updated = comparisonRows.map((r, i) => i === idx ? { ...r, super: newVal } : r)
                              setComparisonRows(updated)
                            }
                          })}
                          placeholder="Value..."
                          rows={1}
                          className={`w-full border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none font-bold t-input-subtle ${
                            isAutoRendered ? "bg-zinc-100/70 dark:bg-zinc-900/70 text-zinc-900 dark:text-zinc-100 border-dashed cursor-not-allowed opacity-90" : ""
                          }`}
                        />
                        {isAutoRendered && (
                          <div className="text-[9px] font-semibold mt-0.5 select-none truncate">
                            {isLimit ? (
                              <span className="text-indigo-600 dark:text-indigo-400">⚡ Dynamic Limit</span>
                            ) : (
                              <span className="text-emerald-600 dark:text-emerald-400">⚡ Live Telemetry ({telemetryAccuracy})</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-3 pl-4 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setComparisonRows(comparisonRows.filter((_, i) => i !== idx))
                          }}
                          className="w-7 h-7 rounded text-red-500 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 inline-flex items-center justify-center transition-all cursor-pointer"
                          title="Delete comparison row"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={() => {
              setComparisonRows([...comparisonRows, { featureName: "", free: "", recovery_pass: "", pro: "", super: "" }])
            }}
            className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors pt-4 font-semibold"
          >
            <Plus className="w-3.5 h-3.5" /> Add Comparison Row
          </button>

          <div className="mt-4 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/40 border t-border-subtle text-[11px] text-zinc-500 space-y-1">
            <div>
              💡 <strong>Dynamic Limit Thresholds:</strong> Automatically populates with live device and file size limits from the Plan Thresholds configuration.
            </div>
            <div>
              📡 <strong>Dynamic Telemetry:</strong> Automatically syncs live restoration accuracy ({telemetryAccuracy || "90.8%"}) directly from real user telemetry in Firestore (<code className="text-[10px] font-mono text-zinc-400">platform_stats/global</code>). Footnote renders automatically on the pricing page.
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-none border mt-6 t-card">
        <CardHeader className="border-b pb-4 t-border-subtle">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 t-heading">
            Refund Policy Customizer
          </CardTitle>
          <CardDescription className="text-zinc-500 text-xs">
            Customize the refund guarantee conditions text displayed under pricing plans.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Refund Policy Text</label>
              <span className="text-[9px] font-mono select-none t-text-hint">
                Ctrl+B = <strong>bold</strong> | Ctrl+I = <em>italic</em> | Ctrl+U = <u>underline</u>
              </span>
            </div>
            <textarea
              value={refundPolicy}
              onChange={(e) => setRefundPolicy(e.target.value)}
              onKeyDown={(e) => handleTextareaKeyDown(e, refundPolicy, setRefundPolicy)}
              rows={4}
              placeholder="Refund policy text... Use Ctrl+B/I/U to format selection."
              className="w-full border rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium t-input-subtle"
            />
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end pt-4 border-t t-border">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 h-10 text-xs font-bold rounded-xl flex items-center gap-2"
        >
          {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
          Save Tier Features
        </Button>
      </div>

    </div>
  )
}
