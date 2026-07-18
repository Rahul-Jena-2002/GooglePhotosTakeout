import React, { useState, useEffect } from "react"
import { doc, setDoc, onSnapshot, addDoc, collection } from "firebase/firestore"
import { db } from "../firebase"
import { useAuth, type FeatureItem, type FeaturesConfig, DEFAULT_FEATURES_CONFIG, type ComparisonRow, DEFAULT_COMPARISON_ROWS } from "../contexts/AuthContext"
import { useToastStore } from "../store/useToastStore"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { Button } from "../components/ui/button"
import { Shield, Settings, Save, Plus, Trash2 } from "lucide-react"

export default function AdminTierFeatures() {
  const { adminData, loading: authLoading } = useAuth()
  const role = adminData?.role ?? "ADMIN"
  const isSuperAdmin = role === "SUPER_ADMIN"
  const isDev = import.meta.env.DEV
  const hasAccess = isDev || isSuperAdmin || role === "ADMIN"

  const [isLight, setIsLight] = useState(false)
  const [saving, setSaving] = useState(false)

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

  // Listen to features configurations in Firestore
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "global"), (snap) => {
      if (snap.exists()) {
        const data = snap.data()
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
        setComparisonRows(storedComparisonRows ?? DEFAULT_COMPARISON_ROWS)
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
    { planKey: "recovery_pass" as const, label: "Recovery Pass", color: "text-purple-400", items: recoveryFeatures, setItems: setRecoveryFeatures },
    { planKey: "pro" as const, label: "Pro Lifetime", color: "text-violet-400", items: proFeatures, setItems: setProFeatures },
    { planKey: "super" as const, label: "Super Lifetime", color: "text-amber-400", items: superFeatures, setItems: setSuperFeatures },
  ]

  return (
    <div className="space-y-8 max-w-7xl mx-auto px-4 py-8 font-sans transition-all duration-300" style={{ color: isLight ? '#1f2937' : '#f3f4f6' }}>
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6" style={{ borderColor: isLight ? '#e5e7eb' : '#27272a' }}>
        <div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-2" style={{ color: isLight ? '#111827' : '#ffffff' }}>
            <Settings className="w-8 h-8 text-indigo-500" /> Tier Features Customizer
          </h1>
          <p className="text-sm mt-1" style={{ color: isLight ? '#6b7280' : '#a1a1aa' }}>
            Customize the card headings, subheadings, and bullet feature lists visible to customers on the landing pricing matrix.
          </p>
        </div>
      </div>

      <Card className="bg-zinc-900 border-zinc-800 shadow-none" style={{ borderColor: isLight ? '#e5e7eb' : '#27272a', backgroundColor: isLight ? '#ffffff' : '#09090b' }}>
        <CardHeader className="border-b pb-4" style={{ borderColor: isLight ? '#e5e7eb' : '#1f1f23' }}>
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-zinc-200" style={{ color: isLight ? '#111827' : '#ffffff' }}>
            Pricing Matrix Layout Customizer
          </CardTitle>
          <CardDescription className="text-zinc-500 text-xs">
            Bold items appear highlighted in the client interface. Adding features immediately updates checkout details.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            {COLS.map(({ planKey, label, color, items, setItems }) => (
              <div key={planKey} className="bg-zinc-950/30 border rounded-xl p-4 space-y-4" style={{ borderColor: isLight ? '#e5e7eb' : '#27272a', backgroundColor: isLight ? '#f9fafb' : '#050508' }}>
                <div className={`text-xs font-bold border-b pb-2 ${color}`} style={{ borderColor: isLight ? '#e5e7eb' : '#1f1f23' }}>
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
                    className="w-full border rounded-lg px-3 py-1.5 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    style={{
                      backgroundColor: isLight ? '#ffffff' : '#0e0e11',
                      borderColor: isLight ? '#d1d5db' : '#27272a',
                      color: isLight ? '#1f2937' : '#ffffff'
                    }}
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
                    className="w-full border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    style={{
                      backgroundColor: isLight ? '#ffffff' : '#0e0e11',
                      borderColor: isLight ? '#d1d5db' : '#27272a',
                      color: isLight ? '#4b5563' : '#a1a1aa'
                    }}
                  />
                </div>

                {/* Features Bullets */}
                <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold pt-2 border-t" style={{ borderColor: isLight ? '#e5e7eb' : '#1f1f23' }}>
                  Bullets
                </div>
                <div className="space-y-2">
                  {items.map((feat, idx) => (
                    <div key={idx} className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          const updated = items.map((f, i) => i === idx ? { ...f, isBold: !f.isBold } : f)
                          setItems(updated)
                        }}
                        className={`shrink-0 w-6 h-6 rounded text-[10px] font-black border transition-all ${
                          feat.isBold
                            ? "bg-indigo-600 border-indigo-500 text-white"
                            : "bg-zinc-800 border-zinc-700 text-zinc-500 hover:border-zinc-500"
                        }`}
                        style={feat.isBold ? {} : {
                          backgroundColor: isLight ? '#ffffff' : '#1f1f23',
                          borderColor: isLight ? '#d1d5db' : '#27272a',
                          color: isLight ? '#6b7280' : '#88888b'
                        }}
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
                        className="flex-1 min-w-0 border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        style={{
                          backgroundColor: isLight ? '#ffffff' : '#0f0f12',
                          borderColor: isLight ? '#d1d5db' : '#27272a',
                          color: isLight ? '#1f2937' : '#f3f4f6',
                          fontWeight: feat.isBold ? "bold" : "normal"
                        }}
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
      <Card className="bg-zinc-900 border-zinc-800 shadow-none mt-6" style={{ borderColor: isLight ? '#e5e7eb' : '#27272a', backgroundColor: isLight ? '#ffffff' : '#09090b' }}>
        <CardHeader className="border-b pb-4" style={{ borderColor: isLight ? '#e5e7eb' : '#1f1f23' }}>
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-zinc-200" style={{ color: isLight ? '#111827' : '#ffffff' }}>
            Compare Plans Table Customizer
          </CardTitle>
          <CardDescription className="text-zinc-500 text-xs">
            Edit the detailed feature comparison grid displayed at the bottom of the pricing page.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b" style={{ borderColor: isLight ? '#e5e7eb' : '#27272a' }}>
                  <th className="py-2 pr-4 font-bold text-zinc-500 w-1/4">Feature Name</th>
                  <th className="py-2 px-2 font-bold text-green-400">Free</th>
                  <th className="py-2 px-2 font-bold text-cyan-400">Single Pass</th>
                  <th className="py-2 px-2 font-bold text-violet-400">Pro Lifetime</th>
                  <th className="py-2 px-2 font-bold text-amber-400">Super Lifetime</th>
                  <th className="py-2 pl-4 font-bold text-zinc-500 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row, idx) => (
                  <tr key={idx} className="border-b" style={{ borderColor: isLight ? '#e5e7eb' : '#1f1f23' }}>
                    <td className="py-3 pr-4">
                      <input
                        type="text"
                        value={row.featureName}
                        onChange={(e) => {
                          const updated = comparisonRows.map((r, i) => i === idx ? { ...r, featureName: e.target.value } : r)
                          setComparisonRows(updated)
                        }}
                        placeholder="Feature name..."
                        className="w-full border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 font-bold"
                        style={{
                          backgroundColor: isLight ? '#ffffff' : '#0e0e11',
                          borderColor: isLight ? '#d1d5db' : '#27272a',
                          color: isLight ? '#1f2937' : '#ffffff'
                        }}
                      />
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <input
                          type="checkbox"
                          id={`dyn-${idx}`}
                          checked={row.isDynamicLimit ?? false}
                          onChange={(e) => {
                            const updated = comparisonRows.map((r, i) => i === idx ? { ...r, isDynamicLimit: e.target.checked } : r)
                            setComparisonRows(updated)
                          }}
                          className="rounded text-indigo-600 focus:ring-indigo-500 w-3 h-3 bg-zinc-950 border-zinc-800"
                        />
                        <label htmlFor={`dyn-${idx}`} className="text-[9px] text-zinc-500 cursor-pointer font-bold select-none uppercase tracking-wider">
                          Use dynamic limit thresholds
                        </label>
                      </div>
                    </td>
                    <td className="py-3 px-2">
                      <textarea
                        value={row.free}
                        disabled={row.isDynamicLimit}
                        onChange={(e) => {
                          const updated = comparisonRows.map((r, i) => i === idx ? { ...r, free: e.target.value } : r)
                          setComparisonRows(updated)
                        }}
                        onKeyDown={(e) => handleTextareaKeyDown(e, row.free, (newVal) => {
                          const updated = comparisonRows.map((r, i) => i === idx ? { ...r, free: newVal } : r)
                          setComparisonRows(updated)
                        })}
                        placeholder="Value..."
                        rows={1}
                        className="w-full border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none disabled:opacity-35"
                        style={{
                          backgroundColor: isLight ? '#ffffff' : '#0e0e11',
                          borderColor: isLight ? '#d1d5db' : '#27272a',
                          color: isLight ? '#1f2937' : '#f3f4f6'
                        }}
                      />
                    </td>
                    <td className="py-3 px-2">
                      <textarea
                        value={row.recovery_pass}
                        disabled={row.isDynamicLimit}
                        onChange={(e) => {
                          const updated = comparisonRows.map((r, i) => i === idx ? { ...r, recovery_pass: e.target.value } : r)
                          setComparisonRows(updated)
                        }}
                        onKeyDown={(e) => handleTextareaKeyDown(e, row.recovery_pass, (newVal) => {
                          const updated = comparisonRows.map((r, i) => i === idx ? { ...r, recovery_pass: newVal } : r)
                          setComparisonRows(updated)
                        })}
                        placeholder="Value..."
                        rows={1}
                        className="w-full border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none disabled:opacity-35"
                        style={{
                          backgroundColor: isLight ? '#ffffff' : '#0e0e11',
                          borderColor: isLight ? '#d1d5db' : '#27272a',
                          color: isLight ? '#1f2937' : '#f3f4f6'
                        }}
                      />
                    </td>
                    <td className="py-3 px-2">
                      <textarea
                        value={row.pro}
                        disabled={row.isDynamicLimit}
                        onChange={(e) => {
                          const updated = comparisonRows.map((r, i) => i === idx ? { ...r, pro: e.target.value } : r)
                          setComparisonRows(updated)
                        }}
                        onKeyDown={(e) => handleTextareaKeyDown(e, row.pro, (newVal) => {
                          const updated = comparisonRows.map((r, i) => i === idx ? { ...r, pro: newVal } : r)
                          setComparisonRows(updated)
                        })}
                        placeholder="Value..."
                        rows={1}
                        className="w-full border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none disabled:opacity-35 font-bold"
                        style={{
                          backgroundColor: isLight ? '#ffffff' : '#0e0e11',
                          borderColor: isLight ? '#d1d5db' : '#27272a',
                          color: isLight ? '#1f2937' : '#f3f4f6'
                        }}
                      />
                    </td>
                    <td className="py-3 px-2">
                      <textarea
                        value={row.super}
                        disabled={row.isDynamicLimit}
                        onChange={(e) => {
                          const updated = comparisonRows.map((r, i) => i === idx ? { ...r, super: e.target.value } : r)
                          setComparisonRows(updated)
                        }}
                        onKeyDown={(e) => handleTextareaKeyDown(e, row.super, (newVal) => {
                          const updated = comparisonRows.map((r, i) => i === idx ? { ...r, super: newVal } : r)
                          setComparisonRows(updated)
                        })}
                        placeholder="Value..."
                        rows={1}
                        className="w-full border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none disabled:opacity-35 font-bold"
                        style={{
                          backgroundColor: isLight ? '#ffffff' : '#0e0e11',
                          borderColor: isLight ? '#d1d5db' : '#27272a',
                          color: isLight ? '#1f2937' : '#f3f4f6'
                        }}
                      />
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
                ))}
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
        </CardContent>
      </Card>

      <Card className="bg-zinc-900 border-zinc-800 shadow-none mt-6" style={{ borderColor: isLight ? '#e5e7eb' : '#27272a', backgroundColor: isLight ? '#ffffff' : '#09090b' }}>
        <CardHeader className="border-b pb-4" style={{ borderColor: isLight ? '#e5e7eb' : '#1f1f23' }}>
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-zinc-200" style={{ color: isLight ? '#111827' : '#ffffff' }}>
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
              <span className="text-[9px] text-zinc-500 font-mono select-none" style={{ color: isLight ? '#6b7280' : '#88888b' }}>
                Ctrl+B = <strong>bold</strong> | Ctrl+I = <em>italic</em> | Ctrl+U = <u>underline</u>
              </span>
            </div>
            <textarea
              value={refundPolicy}
              onChange={(e) => setRefundPolicy(e.target.value)}
              onKeyDown={(e) => handleTextareaKeyDown(e, refundPolicy, setRefundPolicy)}
              rows={4}
              placeholder="Refund policy text... Use Ctrl+B/I/U to format selection."
              className="w-full border rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
              style={{
                backgroundColor: isLight ? '#ffffff' : '#0e0e11',
                borderColor: isLight ? '#d1d5db' : '#27272a',
                color: isLight ? '#1f2937' : '#f3f4f6'
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end pt-4 border-t" style={{ borderColor: isLight ? '#e5e7eb' : '#27272a' }}>
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
