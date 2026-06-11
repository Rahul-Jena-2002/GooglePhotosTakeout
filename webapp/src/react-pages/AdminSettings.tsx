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
        freeQuotaMB: Number(freeQuotaMB)
      }, { merge: true })

      // Log action to audit activity logs
      await addDoc(collection(db, "admin_activity"), {
        actorUid: adminData?.uid || "system",
        actorName: adminData?.displayName || "Admin",
        actorRole: role,
        action: "SETTINGS_CHANGE",
        description: `Updated platform settings: Maintenance=${maintenance}, AutoApprove=${reviewAutoApprove}, SLA=${ticketSlaHours}h, FreeQuota=${freeQuotaMB}MB`,
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
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">Recovery Pass Price</label>
                <div className="relative flex items-center">
                  <span className="text-zinc-600 absolute left-3 text-xs">$</span>
                  <Input type="text" defaultValue="4.99" disabled className="bg-zinc-950 border-zinc-850 text-zinc-500 text-xs pl-6 h-9 cursor-not-allowed" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">Pro Lifetime Price</label>
                <div className="relative flex items-center">
                  <span className="text-zinc-600 absolute left-3 text-xs">$</span>
                  <Input type="text" defaultValue="29.00" disabled className="bg-zinc-950 border-zinc-850 text-zinc-500 text-xs pl-6 h-9 cursor-not-allowed" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">Super Lifetime Price</label>
                <div className="relative flex items-center">
                  <span className="text-zinc-600 absolute left-3 text-xs">$</span>
                  <Input type="text" defaultValue="49.00" disabled className="bg-zinc-950 border-zinc-850 text-zinc-500 text-xs pl-6 h-9 cursor-not-allowed" />
                </div>
              </div>
            </div>

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
