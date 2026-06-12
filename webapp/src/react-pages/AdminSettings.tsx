import { useState, useEffect } from "react"
import { useAuth } from "../contexts/AuthContext"
import { db } from "../firebase"
import { doc, setDoc, onSnapshot, collection, addDoc } from "firebase/firestore"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Shield, Settings, Sliders, DollarSign, Database } from "lucide-react"

export default function AdminSettings() {
  const { adminData } = useAuth()
  const [maintenance, setMaintenance] = useState(false)
  const [reviewAutoApprove, setReviewAutoApprove] = useState(true)
  const [ticketSlaHours, setTicketSlaHours] = useState("24")
  const [freeQuotaMB, setFreeQuotaMB] = useState("1024")
  const [baseRecoveryPass, setBaseRecoveryPass] = useState("4.99")
  const [baseProLifetime, setBaseProLifetime] = useState("29.00")
  const [baseSuperLifetime, setBaseSuperLifetime] = useState("49.00")
  const [inrConversionRate, setInrConversionRate] = useState("67")
  const [tier1Scale, setTier1Scale] = useState("0.3")
  const [tier2Scale, setTier2Scale] = useState("0.6")
  const [tier3Scale, setTier3Scale] = useState("1.0")
  const [selectedConfigTier, setSelectedConfigTier] = useState("t3")
  const [saving, setSaving] = useState(false)

  const role = adminData?.role || "ADMIN"

  // Load global settings in real-time
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "global"), (snap) => {
      if (snap.exists()) {
        const data = snap.data()
        setMaintenance(data.maintenance ?? false)
        setReviewAutoApprove(data.reviewAutoApprove ?? true)
        setTicketSlaHours(String(data.ticketSlaHours ?? "24"))
        setFreeQuotaMB(String(data.freeQuotaMB ?? "1024"))
        setBaseRecoveryPass(String(data.baseRecoveryPass ?? "4.99"))
        setBaseProLifetime(String(data.baseProLifetime ?? "29.00"))
        setBaseSuperLifetime(String(data.baseSuperLifetime ?? "49.00"))
        setInrConversionRate(String(data.inrConversionRate ?? "67"))
        setTier1Scale(String(data.tier1Scale ?? "0.3"))
        setTier2Scale(String(data.tier2Scale ?? "0.6"))
        setTier3Scale(String(data.tier3Scale ?? "1.0"))
      }
    })
    return unsub
  }, [])

  const handleSaveSettings = async () => {
    setSaving(true)
    try {
      await setDoc(doc(db, "settings", "global"), {
        maintenance,
        reviewAutoApprove,
        ticketSlaHours: Number(ticketSlaHours),
        freeQuotaMB: Number(freeQuotaMB),
        baseRecoveryPass: Number(baseRecoveryPass),
        baseProLifetime: Number(baseProLifetime),
        baseSuperLifetime: Number(baseSuperLifetime),
        inrConversionRate: Number(inrConversionRate),
        tier1Scale: Number(tier1Scale),
        tier2Scale: Number(tier2Scale),
        tier3Scale: Number(tier3Scale)
      }, { merge: true })

      // Log action to audit activity logs
      await addDoc(collection(db, "admin_activity"), {
        actorUid: adminData?.uid || "system",
        actorName: adminData?.displayName || "Admin",
        actorRole: role,
        action: "SETTINGS_CHANGE",
        description: `Updated platform settings: Maintenance=${maintenance}, AutoApprove=${reviewAutoApprove}, SLA=${ticketSlaHours}h, FreeQuota=${freeQuotaMB}MB, RecoveryPass=$${baseRecoveryPass}, ProLifetime=$${baseProLifetime}, SuperLifetime=$${baseSuperLifetime}, INRRate=₹${inrConversionRate}, T1Scale=${tier1Scale}, T2Scale=${tier2Scale}, T3Scale=${tier3Scale}`,
        timestamp: Date.now()
      })

      alert("Settings updated successfully.")
    } catch (err: any) {
      console.error(err)
      alert("Failed to save settings: " + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8 font-sans text-zinc-100">
      
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
          <Settings className="w-6 h-6 text-indigo-400" /> System Settings
        </h1>
        <p className="text-zinc-400 text-sm mt-1">Configure global pricing overrides, maintenance toggles, and feature flags.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        
        {/* Maintenance & Rules */}
        <Card className="bg-zinc-900 border-zinc-800 shadow-none">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-zinc-200">
              <Shield className="w-4 h-4 text-indigo-400" /> Platform Maintenance
            </CardTitle>
            <CardDescription className="text-zinc-500 text-xs">Temporarily gate public actions or toggle debug behaviors.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between p-4 bg-zinc-950/40 border border-zinc-800/80 rounded-xl">
              <div>
                <div className="text-xs font-bold text-zinc-200">Global Maintenance Mode</div>
                <div className="text-[10px] text-zinc-500 mt-0.5">Locks all public tool workspace routes for updates.</div>
              </div>
              <button 
                onClick={() => setMaintenance(!maintenance)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${maintenance ? 'bg-indigo-500' : 'bg-zinc-800'}`}
              >
                <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${maintenance ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>

            <div className="flex items-center justify-between p-4 bg-zinc-950/40 border border-zinc-800/80 rounded-xl">
              <div>
                <div className="text-xs font-bold text-zinc-200">Auto-Approve Star Reviews</div>
                <div className="text-[10px] text-zinc-500 mt-0.5">Automatically publish 5-star submissions on landing section.</div>
              </div>
              <button 
                onClick={() => setReviewAutoApprove(!reviewAutoApprove)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${reviewAutoApprove ? 'bg-indigo-500' : 'bg-zinc-800'}`}
              >
                <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${reviewAutoApprove ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Gated Thresholds */}
        <Card className="bg-zinc-900 border-zinc-800 shadow-none">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-zinc-200">
              <Sliders className="w-4 h-4 text-purple-400" /> Platform Thresholds
            </CardTitle>
            <CardDescription className="text-zinc-500 text-xs">Define dynamic constraints for tiers and responses.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1.5">Free Plan Max Quota (MB)</label>
              <div className="relative flex items-center">
                <Database className="w-4 h-4 text-zinc-600 absolute left-3" />
                <Input 
                  type="number"
                  value={freeQuotaMB}
                  onChange={(e) => setFreeQuotaMB(e.target.value)}
                  className="bg-zinc-950 border-zinc-800 text-zinc-100 text-xs pl-9 h-9"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1.5">Support SLA Response Goal (Hours)</label>
              <div className="relative flex items-center">
                <Sliders className="w-4 h-4 text-zinc-600 absolute left-3" />
                <Input 
                  type="number"
                  value={ticketSlaHours}
                  onChange={(e) => setTicketSlaHours(e.target.value)}
                  className="bg-zinc-950 border-zinc-800 text-zinc-100 text-xs pl-9 h-9"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Global Pricing Config */}
        <Card className="bg-zinc-900 border-zinc-800 shadow-none md:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-zinc-200">
              <DollarSign className="w-4 h-4 text-emerald-400" /> Dynamic Pricing Configuration (USD Baseline)
            </CardTitle>
            <CardDescription className="text-zinc-500 text-xs">Adjust basic pricing indices. Local tiers will scale accordingly.</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Tier Select Dropdown */}
            <div className="mb-6">
              <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1.5">Select Configuration Tier</label>
              <select
                value={selectedConfigTier}
                onChange={(e) => setSelectedConfigTier(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 cursor-pointer w-full md:w-96"
              >
                <option value="t3">Tier 3 (High-Income Countries / USD Baseline)</option>
                <option value="t2">Tier 2 (Mid-Income Countries / USD)</option>
                <option value="t1">Tier 1 (Low-Income Countries / USD)</option>
                <option value="in">India (INR Localized Tier)</option>
              </select>
            </div>

            {/* Conditionally Render Inputs based on active tier */}
            {selectedConfigTier === "t3" && (
              <div className="space-y-4 mb-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">Recovery Pass Price</label>
                    <div className="relative flex items-center">
                      <span className="text-zinc-500 absolute left-3 text-xs">$</span>
                      <Input 
                        type="number" 
                        step="0.01"
                        value={baseRecoveryPass} 
                        onChange={(e) => setBaseRecoveryPass(e.target.value)}
                        className="bg-zinc-950 border-zinc-800 text-zinc-100 text-xs pl-6 h-9" 
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">Pro Lifetime Price</label>
                    <div className="relative flex items-center">
                      <span className="text-zinc-500 absolute left-3 text-xs">$</span>
                      <Input 
                        type="number"
                        step="0.01"
                        value={baseProLifetime} 
                        onChange={(e) => setBaseProLifetime(e.target.value)}
                        className="bg-zinc-950 border-zinc-800 text-zinc-100 text-xs pl-6 h-9" 
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">Super Lifetime Price</label>
                    <div className="relative flex items-center">
                      <span className="text-zinc-500 absolute left-3 text-xs">$</span>
                      <Input 
                        type="number"
                        step="0.01"
                        value={baseSuperLifetime} 
                        onChange={(e) => setBaseSuperLifetime(e.target.value)}
                        className="bg-zinc-950 border-zinc-800 text-zinc-100 text-xs pl-6 h-9" 
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">Tier 3 Scale Factor</label>
                    <Input 
                      type="number" 
                      step="0.05"
                      value={tier3Scale} 
                      onChange={(e) => setTier3Scale(e.target.value)}
                      className="bg-zinc-950 border-zinc-800 text-zinc-100 text-xs h-9" 
                    />
                  </div>
                </div>
                <div className="bg-indigo-950/20 border border-indigo-900/40 rounded-xl p-4 mt-2">
                  <div className="text-xs font-bold text-indigo-400">USD Baseline Pricing</div>
                  <p className="text-[10px] text-zinc-500 mt-1">These values represent the standard baseline pricing. Other local tiers will scale relative to these numbers.</p>
                </div>
              </div>
            )}

            {selectedConfigTier === "t2" && (
              <div className="space-y-4 mb-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">Tier 2 Scale Factor</label>
                    <Input 
                      type="number" 
                      step="0.05"
                      value={tier2Scale} 
                      onChange={(e) => setTier2Scale(e.target.value)}
                      className="bg-zinc-950 border-zinc-800 text-zinc-100 text-xs h-9" 
                    />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">Scaled Recovery Pass</div>
                    <div className="bg-zinc-950 border border-zinc-800 rounded-lg h-9 px-3 flex items-center text-xs text-zinc-400">
                      ${(Number(baseRecoveryPass) * Number(tier2Scale)).toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">Scaled Pro Lifetime</div>
                    <div className="bg-zinc-950 border border-zinc-800 rounded-lg h-9 px-3 flex items-center text-xs text-zinc-400">
                      ${Math.round(Number(baseProLifetime) * Number(tier2Scale))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">Scaled Super Lifetime</div>
                    <div className="bg-zinc-950 border border-zinc-800 rounded-lg h-9 px-3 flex items-center text-xs text-zinc-400">
                      ${Math.round(Number(baseSuperLifetime) * Number(tier2Scale))}
                    </div>
                  </div>
                </div>
                <div className="bg-purple-950/20 border border-purple-900/40 rounded-xl p-4 mt-2">
                  <div className="text-xs font-bold text-purple-400">Mid-Income Country Tier (USD based)</div>
                  <p className="text-[10px] text-zinc-500 mt-1">Local prices in Tier 2 countries (e.g. Malaysia, Brazil, Poland) are scaled using this factor.</p>
                </div>
              </div>
            )}

            {selectedConfigTier === "t1" && (
              <div className="space-y-4 mb-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">Tier 1 Scale Factor</label>
                    <Input 
                      type="number" 
                      step="0.05"
                      value={tier1Scale} 
                      onChange={(e) => setTier1Scale(e.target.value)}
                      className="bg-zinc-950 border-zinc-800 text-zinc-100 text-xs h-9" 
                    />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">Scaled Recovery Pass</div>
                    <div className="bg-zinc-950 border border-zinc-800 rounded-lg h-9 px-3 flex items-center text-xs text-zinc-400">
                      ${(Number(baseRecoveryPass) * Number(tier1Scale)).toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">Scaled Pro Lifetime</div>
                    <div className="bg-zinc-950 border border-zinc-800 rounded-lg h-9 px-3 flex items-center text-xs text-zinc-400">
                      ${Math.round(Number(baseProLifetime) * Number(tier1Scale))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">Scaled Super Lifetime</div>
                    <div className="bg-zinc-950 border border-zinc-800 rounded-lg h-9 px-3 flex items-center text-xs text-zinc-400">
                      ${Math.round(Number(baseSuperLifetime) * Number(tier1Scale))}
                    </div>
                  </div>
                </div>
                <div className="bg-emerald-950/20 border border-emerald-900/40 rounded-xl p-4 mt-2">
                  <div className="text-xs font-bold text-emerald-400">Low-Income Country Tier (USD based)</div>
                  <p className="text-[10px] text-zinc-500 mt-1">Local prices in Tier 1 countries (e.g. Pakistan, Egypt, Indonesia) are scaled using this factor.</p>
                </div>
              </div>
            )}

            {selectedConfigTier === "in" && (
              <div className="space-y-4 mb-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">INR Conv. Rate (₹/$)</label>
                    <div className="relative flex items-center">
                      <span className="text-zinc-500 absolute left-3 text-xs">₹</span>
                      <Input 
                        type="number"
                        step="0.1"
                        value={inrConversionRate} 
                        onChange={(e) => setInrConversionRate(e.target.value)}
                        className="bg-zinc-950 border-zinc-800 text-zinc-100 text-xs pl-6 h-9" 
                      />
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">India Recovery Pass</div>
                    <div className="bg-zinc-950 border border-zinc-800 rounded-lg h-9 px-3 flex items-center text-xs text-zinc-400">
                      ₹{Math.round(Number(baseRecoveryPass) * Number(tier1Scale) * Number(inrConversionRate))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">India Pro Lifetime</div>
                    <div className="bg-zinc-950 border border-zinc-800 rounded-lg h-9 px-3 flex items-center text-xs text-zinc-400">
                      ₹{Math.round(Number(baseProLifetime) * Number(tier1Scale) * Number(inrConversionRate))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">India Super Lifetime</div>
                    <div className="bg-zinc-950 border border-zinc-800 rounded-lg h-9 px-3 flex items-center text-xs text-zinc-400">
                      ₹{Math.round(Number(baseSuperLifetime) * Number(tier1Scale) * Number(inrConversionRate))}
                    </div>
                  </div>
                </div>
                <div className="bg-amber-950/20 border border-amber-900/40 rounded-xl p-4 mt-2">
                  <div className="text-xs font-bold text-amber-400">India Tier Configuration (INR based)</div>
                  <p className="text-[10px] text-zinc-500 mt-1">Uses Tier 1 scale factor ({tier1Scale}) converted to Indian Rupees (INR) at the conversion rate.</p>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 border-t border-zinc-800/80 pt-4">
              <Button 
                onClick={handleSaveSettings} 
                disabled={saving}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white h-9 text-xs font-semibold"
              >
                {saving ? "Saving..." : "Save Settings"}
              </Button>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  )
}
