import { useState, useEffect } from "react"
import { useAuth } from "../contexts/AuthContext"
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card"
import { Progress } from "../components/ui/progress"
import { Button } from "../components/ui/button"
// No react-router-dom imports
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore"
import { db } from "../firebase"
import { ShieldAlert, Key, HardDrive, History, LifeBuoy, FileText, ArrowRight, ShieldCheck, Download, CreditCard, CheckCircle2 } from "lucide-react"
import { motion } from "framer-motion"

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  recovery_pass: "Recovery Pass",
  pro: "Pro",
  super: "Super",
}

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

import { AuthProvider } from "../contexts/AuthContext"
import { ToastContainer } from "../components/ui/toast"

function DashboardPageContent() {
  const { user, userData, loading, logout } = useAuth()
  // No react-router-dom hooks
  const [activeTab, setActiveTab] = useState<"history" | "billing">("history")
  const [transactions, setTransactions] = useState<any[]>([])
  const [txLoading, setTxLoading] = useState(true)
  const [history, setHistory] = useState<any[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [now, setNow] = useState(Date.now())

  // Tick every second to keep countdown live
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!user) return
    const q = query(
      collection(db, "transactions"),
      where("uid", "==", user.uid),
      orderBy("timestamp", "desc")
    )
    const unsubscribe = onSnapshot(q, (snap) => {
      setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setTxLoading(false)
    }, (err) => {
      console.error("Failed to sync user transactions:", err)
      setTxLoading(false)
    })

    const qHist = query(
      collection(db, "recoveryHistory", user.uid, "sessions"),
      orderBy("timestamp", "desc")
    )
    const unsubscribeHist = onSnapshot(qHist, (snap) => {
      setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setHistoryLoading(false)
    }, (err) => {
      console.error("Failed to sync recovery history:", err)
      setHistoryLoading(false)
    })

    return () => {
      unsubscribe()
      unsubscribeHist()
    }
  }, [user])

  if (loading) return <div className="p-8 text-center text-white/50 mt-16">Loading dashboard...</div>
  
  if (!user) {
    return (
      <div className="max-w-md mx-auto mt-32 p-6 bg-black/40 border border-white/10 rounded-xl text-center">
        <ShieldAlert className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold mb-2">Authentication Required</h2>
        <p className="text-white/60 mb-6">You must be signed in to view your dashboard.</p>
        <a href="/">
          <Button className="w-full bg-white text-black hover:bg-white/90">Return Home</Button>
        </a>
      </div>
    )
  }

  const handleSignOut = async () => {
    await logout()
    if (typeof window !== 'undefined') {
      window.location.href = "/"
    }
  }

  if (userData?.suspended) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 text-red-500 rounded-full flex items-center justify-center mb-6">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white mb-2">Account Suspended</h1>
        <p className="text-zinc-400 max-w-md mb-8">
          Your account has been suspended for violating our terms of service or due to an administrative hold. If you believe this is a mistake, please contact our support team.
        </p>
        <div className="flex gap-4">
          <a href="/support" className="px-5 py-2 rounded-full bg-zinc-900 border border-zinc-800 text-sm text-zinc-300 hover:text-white transition-all">
            Contact Support
          </a>
          <button onClick={handleSignOut} className="px-5 py-2 rounded-full bg-red-600 hover:bg-red-700 text-sm font-semibold text-white transition-all">
            Sign Out
          </button>
        </div>
      </div>
    )
  }

  const plan = userData?.plan || 'free'
  const isPaid = plan !== 'free'
  
  // Lifetime Stats (for Pro/Super users who don't have quotas but want to track their total usage)
  const totalBytesVal = Math.max(
    userData?.usedBytes || 0,
    userData?.totalBytesProcessed || 0,
    (userData as any)?.lifetimeBytes || 0
  )
  const trackedBytes = Math.max(userData?.totalBytesProcessed || 0, userData?.usedBytes || 0)
  const legacyBytes = Math.max(0, ((userData as any)?.lifetimeBytes || 0) - trackedBytes)
  const legacyFiles = legacyBytes > 0 ? Math.round(legacyBytes / (1.2 * 1024 * 1024)) : 0
  const totalFilesVal = Math.max(
    userData?.usedFiles || 0,
    userData?.totalFilesProcessed || 0,
    (userData as any)?.lifetimeFiles || 0
  ) + legacyFiles

  // Storage Quota (recovery_pass is unlimited for 24h)
  const maxQuotaGB = plan === 'free' ? 0.5 : Infinity
  const usedBytesVal = plan === 'free' ? totalBytesVal : (userData?.usedBytes || 0)
  const usedGB = usedBytesVal / (1024 ** 3)
  const quotaPct = maxQuotaGB === Infinity ? 0 : Math.min(100, (usedGB / maxQuotaGB) * 100)

  // Files Quota (recovery_pass is unlimited for 24h)
  const maxQuotaFiles = plan === 'free' ? 250 : Infinity
  const usedFiles = plan === 'free' ? totalFilesVal : (userData?.usedFiles || 0)
  const fileQuotaPct = maxQuotaFiles === Infinity ? 0 : Math.min(100, (usedFiles / maxQuotaFiles) * 100)

  // Recovery pass countdown
  const expiresAt: number = (userData as any)?.expiresAt || 0
  const passActive = plan === 'recovery_pass' && expiresAt > now
  const passExpired = plan === 'recovery_pass' && expiresAt > 0 && expiresAt <= now
  const remainingMs = Math.max(0, expiresAt - now)
  const remainingHrs = Math.floor(remainingMs / (1000 * 60 * 60))
  const remainingMins = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60))
  const remainingSecs = Math.floor((remainingMs % (1000 * 60)) / 1000)

  // Receipt builder
  const downloadInvoice = (tx: any) => {
    const invoiceText = `
========================================
             TAKEOUTFIX INVOICE
========================================
Receipt ID: ${tx.txId}
Date: ${new Date(tx.timestamp).toLocaleString("en-IN")}
User Name: ${tx.displayName}
User Email: ${tx.email}
----------------------------------------
Billing Item: TakeoutFix ${PLAN_LABELS[tx.plan] || tx.plan}
Payment Method: ${tx.paymentMethod}
Status: Paid / Succeeded
Total Charged: INR ₹${tx.amount}.00
========================================
Thank you for using TakeoutFix!
Your EXIF metadata recovery tools are active.
========================================
`;
    const blob = new Blob([invoiceText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Invoice-${tx.txId}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Framer Motion Animation Variants
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.05
      }
    }
  }
  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 100, damping: 15 } }
  }

  return (
    <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 mt-16 relative">
      
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="space-y-8"
      >
        <motion.div variants={itemVariants} className="flex justify-between items-center border-b border-white/5 pb-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tighter">Account Dashboard</h1>
            <p className="text-sm text-white/50 mt-1">Monitor your usage limits, logs, and account options.</p>
          </div>
          <a href="/profile">
            <Button variant="outline" className="border-white/10 hover:bg-white/5 text-xs rounded-full">
              Profile Settings &rarr;
            </Button>
          </a>
        </motion.div>

        {/* ACTIVE PLAN & QUOTA */}
        <motion.div variants={itemVariants}>
          <Card className="bg-black/40 border-white/10 backdrop-blur-md shadow-xl overflow-hidden">
            <CardHeader className="border-b border-white/5 py-4">
              <CardTitle className="text-base font-semibold flex justify-between items-center">
                <span className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-zinc-900 dark:text-zinc-100" />
                  Active Plan Details
                </span>
                {plan === 'pro' && <span className="text-xs bg-zinc-950 dark:bg-zinc-50 text-white dark:text-black px-2.5 py-1 rounded-md font-bold border border-zinc-200 dark:border-zinc-800">Most Popular</span>}
                {plan === 'super' && <span className="text-xs bg-amber-500 text-white px-2.5 py-1 rounded-md flex items-center gap-1 font-bold"><ShieldCheck className="w-3.5 h-3.5"/> Premium Enabled</span>}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              {plan === 'free' && (
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="bg-white/[0.01] border border-white/5 rounded-xl p-4 space-y-3">
                    <div className="flex justify-between text-xs text-white/60">
                      <span className="flex items-center gap-1.5 font-semibold"><HardDrive className="w-3.5 h-3.5 text-zinc-500" /> Storage Capacity</span>
                      <span>{usedGB.toFixed(2)} GB / 0.50 GB</span>
                    </div>
                    <Progress value={quotaPct} className="h-1.5 bg-white/10" />
                  </div>
                  <div className="bg-white/[0.01] border border-white/5 rounded-xl p-4 space-y-3">
                    <div className="flex justify-between text-xs text-white/60">
                      <span className="flex items-center gap-1.5 font-semibold"><FileText className="w-3.5 h-3.5 text-zinc-500" /> Processed Files</span>
                      <span>{usedFiles} / 250 files</span>
                    </div>
                    <Progress value={fileQuotaPct} className="h-1.5 bg-white/10" />
                  </div>
                </div>
              )}

              {plan === 'recovery_pass' && (
                <div className="space-y-4">
                  {passActive ? (
                    <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-xl p-5">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold text-cyan-300 uppercase tracking-widest flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse inline-block" />
                          Active — Unlimited Restoration
                        </span>
                        <a href={`/checkout?plan=recovery_pass`} className="text-[10px] font-bold text-cyan-400 hover:text-cyan-300 underline underline-offset-2">+ Extend</a>
                      </div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-4xl font-black text-white tabular-nums">{String(remainingHrs).padStart(2, '0')}:{String(remainingMins).padStart(2, '0')}:{String(remainingSecs).padStart(2, '0')}</span>
                        <span className="text-xs text-zinc-500 font-semibold">remaining</span>
                      </div>
                      <p className="text-[11px] text-zinc-500 mt-2">Unlimited files & storage until {new Date(expiresAt).toLocaleString()}</p>
                    </div>
                  ) : passExpired ? (
                    <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-5 text-center">
                      <p className="text-sm font-bold text-red-400 mb-1">Recovery Pass Expired</p>
                      <p className="text-[11px] text-zinc-500 mb-4">Your 24-hour pass expired on {new Date(expiresAt).toLocaleString()}.</p>
                      <a href="/checkout?plan=recovery_pass">
                        <button className="btn-recovery-cyan px-4 py-2 rounded-lg text-xs font-bold transition-all">Get New Pass</button>
                      </a>
                    </div>
                  ) : (
                    <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 text-center">
                      <p className="text-xs text-zinc-400">No active recovery pass found. Purchase one to unlock unlimited restoration.</p>
                      <a href="/checkout?plan=recovery_pass">
                        <button className="btn-recovery-cyan mt-3 px-4 py-2 rounded-lg text-xs font-bold transition-all">Get Recovery Pass</button>
                      </a>
                    </div>
                  )}
                </div>
              )}

              {plan === 'free' && (
                <p className="text-[11px] text-zinc-500 italic">
                  * Limits are enforced on a "whichever comes first" basis (either storage capacity or file count).
                </p>
              )}

              {(plan === 'pro' || plan === 'super') && (
                <div className="space-y-6">
                  <div className="p-4 border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 rounded-lg space-y-2">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-zinc-900 dark:text-zinc-100" />
                      <span className="font-bold text-base text-foreground">Unlimited Lifetime Recovery Active</span>
                    </div>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      {plan === 'pro'
                        ? 'Your account has no processing or bandwidth limits. Recover as many files and photo libraries as you need.'
                        : 'Your account includes unlimited processing, zero advertisements, full visual metadata viewing, and duplicate analyzer tools.'}
                    </p>
                  </div>
                  
                  {/* Lifetime Stats */}
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="bg-white/[0.01] border border-white/5 rounded-xl p-4 space-y-2">
                      <div className="text-xs text-white/40 uppercase tracking-widest font-semibold flex items-center gap-1.5">
                        <HardDrive className="w-3.5 h-3.5 text-zinc-500" /> Total Data Restored
                      </div>
                      <div className="text-2xl font-black text-white">{formatBytes(totalBytesVal)}</div>
                    </div>
                    <div className="bg-white/[0.01] border border-white/5 rounded-xl p-4 space-y-2">
                      <div className="text-xs text-white/40 uppercase tracking-widest font-semibold flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-zinc-500" /> Total Files Restored
                      </div>
                      <div className="text-2xl font-black text-white">{totalFilesVal.toLocaleString()}</div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-4 pt-2">
                {plan !== 'super' ? (
                  <a href="/pricing" className="flex-1">
                    <Button className="w-full bg-zinc-950 dark:bg-zinc-50 text-white dark:text-black hover:bg-zinc-800 dark:hover:bg-zinc-200 font-bold rounded-lg border border-transparent">
                      <Key className="w-4 h-4 mr-2" /> Upgrade Account Plan
                    </Button>
                  </a>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-xs font-semibold text-white/40 border border-white/5 bg-zinc-900/20 rounded-lg py-2.5">
                    Highest Performance Tier Active
                  </div>
                )}
                <a href="/tool" data-astro-reload className="flex-1">
                  <Button variant="outline" className="w-full border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 font-bold rounded-lg">Restore My Data</Button>
                </a>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* BOTTOM SECTION GRID */}
        <div className="grid md:grid-cols-2 gap-8">
          {/* SUPPORT QUICK ACCESS */}
          <motion.div variants={itemVariants}>
            <Card className="bg-black/40 border-white/10 backdrop-blur-md shadow-xl h-full flex flex-col justify-between">
              <div>
                <CardHeader className="border-b border-white/5 py-4">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <LifeBuoy className="w-4 h-4 text-zinc-500" />
                    Support & Help Center
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="space-y-3">
                  <a href="/support" className="flex items-center justify-between p-3.5 rounded-lg bg-white/[0.02] hover:bg-white/5 border border-white/5 hover:border-white/10 transition-colors">
                    <div className="flex items-center gap-3">
                      <FileText className="w-4 h-4 text-white/50" />
                      <span className="text-sm font-medium">FAQ & Documentation</span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-white/30" />
                  </a>
                  
                  {!isPaid ? (
                    <a href="/pricing" className="flex items-center justify-between p-3.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-all group">
                      <div className="flex items-center gap-3">
                        <LifeBuoy className="w-4 h-4 text-zinc-500" />
                        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Upgrade for Direct Support</span>
                      </div>
                      <ArrowRight className="w-4 h-4 text-zinc-500" />
                    </a>
                  ) : (
                    <>
                      <a href="/support?tab=new" className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.02] hover:bg-white/5 border border-white/5 hover:border-white/10 transition-colors">
                        <div className="flex items-center gap-3">
                          <LifeBuoy className="w-4 h-4 text-white/50" />
                          <span className="text-sm font-medium">Raise a Support Ticket</span>
                        </div>
                        <ArrowRight className="w-4 h-4 text-white/30" />
                      </a>
                      <a href="/support?tab=tickets" className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.02] hover:bg-white/5 border border-white/5 hover:border-white/10 transition-colors">
                        <div className="flex items-center gap-3">
                          <History className="w-4 h-4 text-white/50" />
                          <span className="text-sm font-medium">My Support Tickets</span>
                        </div>
                        <ArrowRight className="w-4 h-4 text-white/30" />
                      </a>
                    </>
                  )}
                  </div>
                </CardContent>
              </div>
            </Card>
          </motion.div>

          {/* RECOVERY HISTORY & BILLING LOGS */}
          <motion.div variants={itemVariants}>
            <Card className="bg-black/40 border-white/10 backdrop-blur-md shadow-xl h-full flex flex-col justify-between">
              <div>
                <CardHeader className="border-b border-white/5 py-4">
                  <div className="flex bg-zinc-950 border border-zinc-800 p-1 rounded-full text-xs font-semibold max-w-[280px]">
                    <button 
                      onClick={() => setActiveTab("history")}
                      className={`flex-1 py-1.5 px-3 rounded-full transition-colors flex items-center justify-center gap-1.5 ${activeTab === "history" ? "bg-zinc-850 text-white" : "text-zinc-500 hover:text-zinc-350"}`}
                    >
                      <History className="w-3.5 h-3.5" /> Recovery History
                    </button>
                    <button 
                      onClick={() => setActiveTab("billing")}
                      className={`flex-1 py-1.5 px-3 rounded-full transition-colors flex items-center justify-center gap-1.5 ${activeTab === "billing" ? "bg-zinc-850 text-white" : "text-zinc-500 hover:text-zinc-350"}`}
                    >
                      <CreditCard className="w-3.5 h-3.5" /> Billing Logs
                    </button>
                  </div>
                </CardHeader>
                <CardContent className="pt-6">
                  
                  {activeTab === "history" ? (
                    <div>
                      {plan === 'free' ? (
                        <div className="text-center py-8">
                          <p className="text-xs text-white/50 mb-4">Detailed history logs are available for all paid plan subscribers.</p>
                          <a href="/pricing">
                            <Button variant="outline" className="border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-xs rounded-lg">
                              Upgrade to View History
                            </Button>
                          </a>
                        </div>
                      ) : historyLoading ? (
                        <div className="text-center py-8 text-xs text-zinc-500">Syncing history log...</div>
                      ) : history.length === 0 ? (
                        <div className="text-center py-8 text-xs text-zinc-500">No recovery history records found.</div>
                      ) : (
                        <div className="space-y-3">
                          {/* Summary Bar */}
                          <div className="flex justify-between items-center p-3.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-xs mb-1">
                            <span className="font-semibold text-zinc-900 dark:text-zinc-100">Lifetime Recovery Stats</span>
                            <span className="font-mono font-bold text-zinc-100">
                              {totalFilesVal.toLocaleString()} files • {formatBytes(totalBytesVal)}
                            </span>
                          </div>

                          <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                            {history.map((h: any, idx: number) => {
                              const title = h.archiveName || h.title || 'Takeout Batch';
                              const restored = h.matched ?? h.recovered ?? h.files ?? 0;
                              const totalFiles = h.filesProcessed ?? h.files ?? restored;
                              const bytes = h.bytesProcessed ?? h.bytes ?? 0;
                              const dateStr = h.date ? `${h.date}, ${h.time}` : (h.timestamp || h.ts ? new Date(h.timestamp || h.ts).toLocaleString() : 'Recent Session');
                              const isDesktop = (h.source || 'Desktop').toLowerCase().includes('desktop');

                              return (
                                <div key={h.id || idx} className="flex justify-between items-center p-3.5 bg-white/[0.02] rounded-xl border border-white/5">
                                  <div>
                                    <div className="font-mono text-xs font-semibold mb-0.5 text-zinc-200">{title}</div>
                                    <div className="text-[11px] text-zinc-400 font-mono">
                                      Restored {restored.toLocaleString()} / {totalFiles.toLocaleString()} files • {formatBytes(bytes)}
                                    </div>
                                    <div className="text-[9px] text-zinc-500 mt-1">{dateStr}</div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${isDesktop ? 'text-purple-400 bg-purple-400/10 border-purple-500/20' : 'text-cyan-400 bg-cyan-400/10 border-cyan-500/20'}`}>
                                      {isDesktop ? '🖥️ Desktop' : '🌐 Web Engine'}
                                    </span>
                                    <div className="text-[10px] font-bold text-green-400 bg-green-400/10 px-2.5 py-0.5 rounded-full border border-green-500/20 capitalize">
                                      {h.status || 'completed'}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4 max-h-[180px] overflow-y-auto pr-1">
                      {txLoading ? (
                        <div className="text-center py-8 text-xs text-zinc-500">Syncing transaction log...</div>
                      ) : transactions.length === 0 ? (
                        <div className="text-center py-8 text-xs text-zinc-500">No transaction records found.</div>
                      ) : (
                        <div className="space-y-2">
                          {transactions.map((tx) => (
                            <div key={tx.id} className="flex items-center justify-between p-3 bg-zinc-900/40 border border-zinc-800 rounded-xl text-xs">
                              <div>
                                {tx.approvedByAdmin ? (
                                  <>
                                    <div className="font-bold text-zinc-200">TakeoutFix {PLAN_LABELS[tx.plan] || tx.plan} (Admin Approved)</div>
                                    <div className="text-[10px] text-zinc-400">Approved by Admin: {tx.approvedByAdmin}</div>
                                  </>
                                ) : (
                                  <>
                                    <div className="font-bold text-zinc-250">TakeoutFix {PLAN_LABELS[tx.plan] || tx.plan}</div>
                                  </>
                                )}
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-[9px] text-zinc-500">{new Date(tx.timestamp).toLocaleDateString()} • {tx.txId}</span>
                                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold border capitalize ${
                                    tx.status === "succeeded" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                                    tx.status === "processing" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                                    tx.status === "cancelled" ? "bg-zinc-500/10 text-zinc-400 border-zinc-500/20" :
                                    "bg-red-500/10 text-red-400 border-red-500/20"
                                  }`}>
                                    <span className={`w-1 h-1 rounded-full ${
                                      tx.status === "succeeded" ? "bg-emerald-400" :
                                      tx.status === "processing" ? "bg-amber-400" :
                                      tx.status === "cancelled" ? "bg-zinc-400" :
                                      "bg-red-400"
                                    }`} />
                                    {tx.status || "succeeded"}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="font-bold text-white">
                                  {tx.amount === 0 ? "Free Grant" : `₹${tx.amount}`}
                                </span>
                                {(tx.status === "succeeded" || !tx.status) && (
                                  <button 
                                    onClick={() => downloadInvoice(tx)}
                                    title="Download Invoice Receipt"
                                    className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  
                </CardContent>
              </div>
            </Card>
          </motion.div>
        </div>
      </motion.div>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <AuthProvider>
      <DashboardPageContent />
      <ToastContainer />
    </AuthProvider>
  )
}
