import { useState, useEffect } from "react"
import { useAuth } from "../contexts/AuthContext"
import { db } from "../firebase"
import { doc, setDoc, getDoc, onSnapshot, collection, addDoc } from "firebase/firestore"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Shield, Settings, Sliders, DollarSign, Database, Lock } from "lucide-react"

export default function AdminSettings() {
  const { adminData } = useAuth()
  const [maintenance, setMaintenance] = useState(false)
  const [reviewAutoApprove, setReviewAutoApprove] = useState(true)
  const [ticketSlaHours, setTicketSlaHours] = useState("24")
  const [freeQuotaMB, setFreeQuotaMB] = useState("1024")
  
  // T3 prices
  const [t3RecoveryPass, setT3RecoveryPass] = useState("4.99")
  const [t3Pro, setT3Pro] = useState("29.00")
  const [t3Super, setT3Super] = useState("49.00")
  const [t3Family, setT3Family] = useState("79.00")

  // T2 prices
  const [t2RecoveryPass, setT2RecoveryPass] = useState("3.99")
  const [t2Pro, setT2Pro] = useState("19.00")
  const [t2Super, setT2Super] = useState("39.00")
  const [t2Family, setT2Family] = useState("49.00")

  // T1 prices
  const [t1RecoveryPass, setT1RecoveryPass] = useState("1.49")
  const [t1Pro, setT1Pro] = useState("9.99")
  const [t1Super, setT1Super] = useState("19.99")
  const [t1Family, setT1Family] = useState("49.99")

  // India local prices
  const [inRecoveryPass, setInRecoveryPass] = useState("99")
  const [inPro, setInPro] = useState("799")
  const [inSuper, setInSuper] = useState("1499")
  const [inFamily, setInFamily] = useState("3999")

  // Dodo Product IDs
  const [dodoRecoveryPassId, setDodoRecoveryPassId] = useState("pdt_recovery_pass_placeholder")
  const [dodoProId, setDodoProId] = useState("pdt_pro_placeholder")
  const [dodoSuperId, setDodoSuperId] = useState("pdt_super_placeholder")
  const [dodoFamilyId, setDodoFamilyId] = useState("pdt_family_placeholder")
  const [dodoWebhookKey, setDodoWebhookKey] = useState("")

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
        
        setT3RecoveryPass(String(data.t3_recovery_pass ?? "4.99"))
        setT3Pro(String(data.t3_pro ?? "29.00"))
        setT3Super(String(data.t3_super ?? "49.00"))
        setT3Family(String(data.t3_family ?? "79.00"))

        setT2RecoveryPass(String(data.t2_recovery_pass ?? "3.99"))
        setT2Pro(String(data.t2_pro ?? "19.00"))
        setT2Super(String(data.t2_super ?? "39.00"))
        setT2Family(String(data.t2_family ?? "49.00"))

        setT1RecoveryPass(String(data.t1_recovery_pass ?? "1.49"))
        setT1Pro(String(data.t1_pro ?? "9.99"))
        setT1Super(String(data.t1_super ?? "19.99"))
        setT1Family(String(data.t1_family ?? "49.99"))

        setInRecoveryPass(String(data.in_recovery_pass ?? "99"))
        setInPro(String(data.in_pro ?? "799"))
        setInSuper(String(data.in_super ?? "1499"))
        setInFamily(String(data.in_family ?? "3999"))

        setDodoRecoveryPassId(data.dodo_recovery_pass_id ?? "pdt_recovery_pass_placeholder")
        setDodoProId(data.dodo_pro_id ?? "pdt_pro_placeholder")
        setDodoSuperId(data.dodo_super_id ?? "pdt_super_placeholder")
        setDodoFamilyId(data.dodo_family_id ?? "pdt_family_placeholder")
      }
    }, (err) => {
      console.error("Settings listener error:", err)
    })
    return unsub
  }, [])

  // Load secure settings on mount
  useEffect(() => {
    const loadSecureSettings = async () => {
      try {
        const secureDoc = await getDoc(doc(db, "settings", "secure"))
        if (secureDoc.exists()) {
          setDodoWebhookKey(secureDoc.data().dodo_webhook_key || "")
        }
      } catch (err) {
        console.error("Failed to load secure settings:", err)
      }
    }
    loadSecureSettings()
  }, [])

  const handleSaveSettings = async () => {
    setSaving(true)
    try {
      await setDoc(doc(db, "settings", "global"), {
        maintenance,
        reviewAutoApprove,
        ticketSlaHours: Number(ticketSlaHours),
        freeQuotaMB: Number(freeQuotaMB),
        
        t3_recovery_pass: Number(t3RecoveryPass),
        t3_pro: Number(t3Pro),
        t3_super: Number(t3Super),
        t3_family: Number(t3Family),

        t2_recovery_pass: Number(t2RecoveryPass),
        t2_pro: Number(t2Pro),
        t2_super: Number(t2Super),
        t2_family: Number(t2Family),

        t1_recovery_pass: Number(t1RecoveryPass),
        t1_pro: Number(t1Pro),
        t1_super: Number(t1Super),
        t1_family: Number(t1Family),

        in_recovery_pass: Number(inRecoveryPass),
        in_pro: Number(inPro),
        in_super: Number(inSuper),
        in_family: Number(inFamily),

        dodo_recovery_pass_id: dodoRecoveryPassId,
        dodo_pro_id: dodoProId,
        dodo_super_id: dodoSuperId,
        dodo_family_id: dodoFamilyId
      }, { merge: true })

      await setDoc(doc(db, "settings", "secure"), {
        dodo_webhook_key: dodoWebhookKey
      }, { merge: true })

      // Log action to audit activity logs
      await addDoc(collection(db, "admin_activity"), {
        actorUid: adminData?.uid || "system",
        actorName: adminData?.displayName || "Admin",
        actorRole: role,
        action: "SETTINGS_CHANGE",
        description: `Updated platform settings: Maintenance=${maintenance}, AutoApprove=${reviewAutoApprove}, SLA=${ticketSlaHours}h, FreeQuota=${freeQuotaMB}MB. Saved custom tier prices and updated Dodo Payments Product IDs/Webhook Key.`,
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
              <DollarSign className="w-4 h-4 text-emerald-400" /> Global Tier Pricing Configuration
            </CardTitle>
            <CardDescription className="text-zinc-500 text-xs">Adjust pricing values directly for each region tier. Local visitors see these exact currencies/amounts.</CardDescription>
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

            {/* Dynamic Inputs based on active tier */}
            <div className="space-y-4 mb-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">Recovery Pass Price</label>
                  <div className="relative flex items-center">
                    <span className="text-zinc-500 absolute left-3 text-xs">{selectedConfigTier === "in" ? "₹" : "$"}</span>
                    <Input 
                      type="number" 
                      step={selectedConfigTier === "in" ? "1" : "0.01"}
                      value={
                        selectedConfigTier === "t3" ? t3RecoveryPass :
                        selectedConfigTier === "t2" ? t2RecoveryPass :
                        selectedConfigTier === "t1" ? t1RecoveryPass :
                        inRecoveryPass
                      } 
                      onChange={(e) => {
                        const val = e.target.value;
                        if (selectedConfigTier === "t3") setT3RecoveryPass(val);
                        else if (selectedConfigTier === "t2") setT2RecoveryPass(val);
                        else if (selectedConfigTier === "t1") setT1RecoveryPass(val);
                        else setInRecoveryPass(val);
                      }}
                      className="bg-zinc-950 border-zinc-800 text-zinc-100 text-xs pl-6 h-9" 
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">Pro Lifetime Price</label>
                  <div className="relative flex items-center">
                    <span className="text-zinc-500 absolute left-3 text-xs">{selectedConfigTier === "in" ? "₹" : "$"}</span>
                    <Input 
                      type="number"
                      step={selectedConfigTier === "in" ? "1" : "0.01"}
                      value={
                        selectedConfigTier === "t3" ? t3Pro :
                        selectedConfigTier === "t2" ? t2Pro :
                        selectedConfigTier === "t1" ? t1Pro :
                        inPro
                      } 
                      onChange={(e) => {
                        const val = e.target.value;
                        if (selectedConfigTier === "t3") setT3Pro(val);
                        else if (selectedConfigTier === "t2") setT2Pro(val);
                        else if (selectedConfigTier === "t1") setT1Pro(val);
                        else setInPro(val);
                      }}
                      className="bg-zinc-950 border-zinc-800 text-zinc-100 text-xs pl-6 h-9" 
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">Super Lifetime Price</label>
                  <div className="relative flex items-center">
                    <span className="text-zinc-500 absolute left-3 text-xs">{selectedConfigTier === "in" ? "₹" : "$"}</span>
                    <Input 
                      type="number"
                      step={selectedConfigTier === "in" ? "1" : "0.01"}
                      value={
                        selectedConfigTier === "t3" ? t3Super :
                        selectedConfigTier === "t2" ? t2Super :
                        selectedConfigTier === "t1" ? t1Super :
                        inSuper
                      } 
                      onChange={(e) => {
                        const val = e.target.value;
                        if (selectedConfigTier === "t3") setT3Super(val);
                        else if (selectedConfigTier === "t2") setT2Super(val);
                        else if (selectedConfigTier === "t1") setT1Super(val);
                        else setInSuper(val);
                      }}
                      className="bg-zinc-950 border-zinc-800 text-zinc-100 text-xs pl-6 h-9" 
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">Family Lifetime Price</label>
                  <div className="relative flex items-center">
                    <span className="text-zinc-500 absolute left-3 text-xs">{selectedConfigTier === "in" ? "₹" : "$"}</span>
                    <Input 
                      type="number"
                      step={selectedConfigTier === "in" ? "1" : "0.01"}
                      value={
                        selectedConfigTier === "t3" ? t3Family :
                        selectedConfigTier === "t2" ? t2Family :
                        selectedConfigTier === "t1" ? t1Family :
                        inFamily
                      } 
                      onChange={(e) => {
                        const val = e.target.value;
                        if (selectedConfigTier === "t3") setT3Family(val);
                        else if (selectedConfigTier === "t2") setT2Family(val);
                        else if (selectedConfigTier === "t1") setT1Family(val);
                        else setInFamily(val);
                      }}
                      className="bg-zinc-950 border-zinc-800 text-zinc-100 text-xs pl-6 h-9" 
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Removed internal Save button to use page footer */}
          </CardContent>
        </Card>

        {/* Dodo Payments Configuration Card */}
        <Card className="bg-zinc-900 border-zinc-800 shadow-none md:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-zinc-200">
              <Lock className="w-4 h-4 text-indigo-400" /> Dodo Payments Integration Settings
            </CardTitle>
            <CardDescription className="text-zinc-500 text-xs">
              Configure Webhook secrets and checkout Product IDs for client hosted checkouts.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1.5">
                Dodo Webhook Secret Key
              </label>
              <div className="relative flex items-center">
                <span className="text-zinc-500 absolute left-3 text-xs">whsec_</span>
                <Input 
                  type="password"
                  value={dodoWebhookKey.startsWith("whsec_") ? dodoWebhookKey.substring(6) : dodoWebhookKey}
                  onChange={(e) => {
                    const rawVal = e.target.value;
                    setDodoWebhookKey(rawVal.startsWith("whsec_") ? rawVal : `whsec_${rawVal}`);
                  }}
                  placeholder="Enter webhook secret key (e.g. whsec_...)"
                  className="bg-zinc-950 border-zinc-800 text-zinc-100 text-xs pl-16 h-9"
                />
              </div>
              <span className="text-[10px] text-zinc-500 mt-1 block">
                Found in Dodo Payments Dashboard &gt; Developer/Settings &gt; Webhooks. Note: Webhook endpoint signature verification is active only when this secret key is set.
              </span>
            </div>

            <div className="border-t border-zinc-800/80 pt-6">
              <label className="text-xs font-semibold text-zinc-300 block mb-4">Dodo Plan Product IDs</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
                    Recovery Pass Product ID
                  </label>
                  <Input 
                    type="text"
                    value={dodoRecoveryPassId}
                    onChange={(e) => setDodoRecoveryPassId(e.target.value)}
                    placeholder="pdt_..."
                    className="bg-zinc-955 border-zinc-800 text-zinc-200 text-xs h-9"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
                    Pro Lifetime Product ID
                  </label>
                  <Input 
                    type="text"
                    value={dodoProId}
                    onChange={(e) => setDodoProId(e.target.value)}
                    placeholder="pdt_..."
                    className="bg-zinc-955 border-zinc-800 text-zinc-200 text-xs h-9"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
                    Super Lifetime Product ID
                  </label>
                  <Input 
                    type="text"
                    value={dodoSuperId}
                    onChange={(e) => setDodoSuperId(e.target.value)}
                    placeholder="pdt_..."
                    className="bg-zinc-955 border-zinc-800 text-zinc-200 text-xs h-9"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
                    Family License Product ID
                  </label>
                  <Input 
                    type="text"
                    value={dodoFamilyId}
                    onChange={(e) => setDodoFamilyId(e.target.value)}
                    placeholder="pdt_..."
                    className="bg-zinc-955 border-zinc-800 text-zinc-200 text-xs h-9"
                  />
                </div>
              </div>
              <span className="text-[10px] text-zinc-500 mt-2.5 block">
                Retrieve product identifiers (starts with pdt_) from your Dodo Payments Dashboard. Empty or placeholder IDs will disable redirect on checkout.
              </span>
            </div>
          </CardContent>
        </Card>

      </div>

      {/* Global save footer */}
      <div className="flex justify-end gap-3 border-t border-zinc-800 pt-6 mt-4">
        <Button 
          onClick={handleSaveSettings} 
          disabled={saving}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-6 h-10 text-xs font-semibold rounded-xl"
        >
          {saving ? "Saving Changes..." : "Save Settings"}
        </Button>
      </div>
    </div>
  )
}
