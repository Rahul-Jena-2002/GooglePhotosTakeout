import React, { useState, useEffect } from "react"
import { useAuth } from "../contexts/AuthContext"
import { db } from "../firebase"
import { doc, setDoc, onSnapshot, collection, getDocs, deleteDoc } from "firebase/firestore"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { Button } from "../components/ui/button"
import { Sliders, RefreshCw, Trash2, Database, ShieldAlert, Cpu } from "lucide-react"
import { useToastStore } from "../store/useToastStore"

export default function AdminDev() {
  const { user } = useAuth()
  const [mockPayments, setMockPayments] = useState(false)
  const [dbStats, setDbStats] = useState({ recoveries: 0, activeSessions: 0 })
  const [loading, setLoading] = useState(false)
  const [sysMemory, setSysMemory] = useState("0 MB")

  // Real-time listener for dev configurations
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "developer"), (snap) => {
      if (snap.exists()) {
        const data = snap.data()
        setMockPayments(data.mockPayments ?? false)
      }
    }, (err) => {
      console.error("Developer settings listener error:", err)
    })

    // Fetch basic stats
    const fetchStats = async () => {
      try {
        const recSnap = await getDocs(collection(db, "recoveries"))
        const sessSnap = await getDocs(collection(db, "active_sessions"))
        setDbStats({
          recoveries: recSnap.size,
          activeSessions: sessSnap.size
        })
      } catch (err) {
        console.error("Failed to fetch dev stats:", err)
      }
    }
    fetchStats()

    // Read local browser memory usage if supported
    if ((performance as any).memory) {
      const heap = Math.round((performance as any).memory.usedJSHeapSize / (1024 * 1024))
      setSysMemory(`${heap} MB`)
    } else {
      setSysMemory("Not supported by browser")
    }

    return () => unsub()
  }, [])

  const handleSaveDevSettings = async (mockVal: boolean) => {
    setMockPayments(mockVal)
    try {
      await setDoc(doc(db, "settings", "developer"), {
        mockPayments: mockVal,
        lastUpdatedBy: user?.email,
        updatedAt: Date.now()
      }, { merge: true })
      useToastStore.getState().addToast("Developer options updated successfully!", "success")
    } catch (e: any) {
      useToastStore.getState().addToast("Failed to save dev settings: " + e.message, "error")
    }
  }

  const handleClearTestSessions = async () => {
    if (!window.confirm("Are you sure you want to purge all active sessions from Firestore? This will log out active users in recovery.")) return
    setLoading(true)
    try {
      const sessSnap = await getDocs(collection(db, "active_sessions"))
      const promises = sessSnap.docs.map(d => deleteDoc(d.ref))
      await Promise.all(promises)
      setDbStats(prev => ({ ...prev, activeSessions: 0 }))
      useToastStore.getState().addToast("All active sessions cleared successfully!", "success")
    } catch (e: any) {
      useToastStore.getState().addToast("Failed to clear sessions: " + e.message, "error")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-zinc-900">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <Sliders className="w-5 h-5 text-emerald-400" /> Developer Options
          </h1>
          <p className="text-xs text-zinc-500 font-medium mt-1">
            Exclusive tools and toggles for developer profile <span className="text-zinc-300 font-mono">rahuljena.dev@gmail.com</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Configurations Card */}
        <Card className="bg-[#0A0A0A] border-zinc-900 shadow-xl">
          <CardHeader className="border-b border-zinc-900/50 p-4">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <Sliders className="w-4 h-4 text-emerald-400" /> Local & Sandbox Configs
            </CardTitle>
            <CardDescription className="text-[10px] text-zinc-600">Simulate backend and gate behaviors</CardDescription>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center justify-between p-2 bg-zinc-950/40 border border-zinc-900/50 rounded-lg">
              <div>
                <div className="text-[11px] font-bold text-zinc-300">Mock Payment Simulation</div>
                <div className="text-[9.5px] text-zinc-500 font-medium">Bypass stripe validation to test premium upgrades</div>
              </div>
              <button
                onClick={() => handleSaveDevSettings(!mockPayments)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none border ${
                  mockPayments
                    ? "bg-emerald-500/20 border-emerald-500/30"
                    : "bg-rose-500/20 border-rose-500/30"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    mockPayments ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Database & Diagnostics Card */}
        <Card className="bg-[#0A0A0A] border-zinc-900 shadow-xl">
          <CardHeader className="border-b border-zinc-900/50 p-4">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <Database className="w-4 h-4 text-emerald-400" /> Database & Diagnostics
            </CardTitle>
            <CardDescription className="text-[10px] text-zinc-600">Firestore record sizes and tab heap</CardDescription>
          </CardHeader>
          <CardContent className="p-4 space-y-3.5">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-zinc-950/40 border border-zinc-900/50 rounded-lg text-center">
                <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Total Recoveries</div>
                <div className="text-lg font-black text-white mt-1">{dbStats.recoveries}</div>
              </div>
              <div className="p-3 bg-zinc-950/40 border border-zinc-900/50 rounded-lg text-center">
                <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Active Sessions</div>
                <div className="text-lg font-black text-white mt-1">{dbStats.activeSessions}</div>
              </div>
            </div>

            <div className="flex justify-between items-center text-[10px] border-t border-zinc-900 pt-3">
              <span className="text-zinc-500 font-bold uppercase flex items-center gap-1"><Cpu className="w-3.5 h-3.5 text-zinc-500" /> Browser Heap</span>
              <span className="font-mono text-zinc-300 font-bold">{sysMemory}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dangerous Operations Card */}
      <Card className="bg-[#0A0A0A] border-zinc-900 shadow-xl">
        <CardHeader className="border-b border-zinc-900/50 p-4">
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-rose-500 animate-pulse" /> Danger Zone
          </CardTitle>
          <CardDescription className="text-[10px] text-zinc-600">Destructive actions for sandbox resets</CardDescription>
        </CardHeader>
        <CardContent className="p-4 flex gap-4">
          <Button
            disabled={loading}
            onClick={handleClearTestSessions}
            className="px-4 py-2 bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white rounded-lg text-xs font-bold transition-all duration-150 flex items-center gap-1.5 disabled:opacity-40"
          >
            <Trash2 className="w-3.5 h-3.5" /> Purge Active Sessions
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
