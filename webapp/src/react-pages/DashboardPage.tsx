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
  recovery_pass: "Single Time",
  pro: "Pro",
  super: "Super",
  family: "Family",
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
  
  // Storage Quota
  const maxQuotaGB = plan === 'free' ? 1 : plan === 'recovery_pass' ? 20 : Infinity
  const usedGB = (userData?.usedBytes || 0) / (1024 ** 3)
  const quotaPct = maxQuotaGB === Infinity ? 0 : Math.min(100, (usedGB / maxQuotaGB) * 100)

  // Files Quota
  const maxQuotaFiles = plan === 'free' ? 1000 : plan === 'recovery_pass' ? 10000 : Infinity
  const usedFiles = userData?.usedFiles || 0
  const fileQuotaPct = maxQuotaFiles === Infinity ? 0 : Math.min(100, (usedFiles / maxQuotaFiles) * 100)

  // Lifetime Stats (for Pro/Super users who don't have quotas but want to track their total usage)
  const totalBytesVal = Math.max(
    userData?.usedBytes || 0,
    userData?.totalBytesProcessed || 0,
    (userData as any)?.lifetimeBytes || 0
  )
  const totalFilesVal = Math.max(
    userData?.usedFiles || 0,
    userData?.totalFilesProcessed || 0,
    (userData as any)?.lifetimeFiles || 0
  )

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
    <div className="max-w-5xl mx-auto px-4 py-12 mt-16 relative">
      
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
                  <ShieldCheck className="w-5 h-5 text-indigo-400" />
                  Active Plan Details
                </span>
                {plan === 'pro' && <span className="text-xs bg-indigo-500 text-white px-2.5 py-1 rounded-md font-bold">Most Popular</span>}
                {plan === 'super' && <span className="text-xs bg-purple-500 text-white px-2.5 py-1 rounded-md flex items-center gap-1 font-bold"><ShieldCheck className="w-3.5 h-3.5"/> Premium Enabled</span>}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              {plan === 'free' && (
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="bg-white/[0.01] border border-white/5 rounded-xl p-4 space-y-3">
                    <div className="flex justify-between text-xs text-white/60">
                      <span className="flex items-center gap-1.5 font-semibold"><HardDrive className="w-3.5 h-3.5 text-zinc-500" /> Storage Capacity</span>
                      <span>{usedGB.toFixed(2)} GB / 1.00 GB</span>
                    </div>
                    <Progress value={quotaPct} className="h-1.5 bg-white/10" />
                  </div>
                  <div className="bg-white/[0.01] border border-white/5 rounded-xl p-4 space-y-3">
                    <div className="flex justify-between text-xs text-white/60">
                      <span className="flex items-center gap-1.5 font-semibold"><FileText className="w-3.5 h-3.5 text-zinc-500" /> Processed Files</span>
                      <span>{usedFiles} / 1,000 files</span>
                    </div>
                    <Progress value={fileQuotaPct} className="h-1.5 bg-white/10" />
                  </div>
                </div>
              )}

              {plan === 'recovery_pass' && (
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="bg-white/[0.01] border border-white/5 rounded-xl p-4 space-y-3">
                    <div className="flex justify-between text-xs text-white/60">
                      <span className="flex items-center gap-1.5 font-semibold"><HardDrive className="w-3.5 h-3.5 text-zinc-500" /> Remaining Capacity</span>
                      <span>{(20 - usedGB).toFixed(2)} GB / 20.00 GB</span>
                    </div>
                    <Progress value={quotaPct} className="h-1.5 bg-white/10" />
                  </div>
                  <div className="bg-white/[0.01] border border-white/5 rounded-xl p-4 space-y-3">
                    <div className="flex justify-between text-xs text-white/60">
                      <span className="flex items-center gap-1.5 font-semibold"><FileText className="w-3.5 h-3.5 text-zinc-500" /> Remaining Files</span>
                      <span>{10000 - usedFiles} / 10,000 files</span>
                    </div>
                    <Progress value={fileQuotaPct} className="h-1.5 bg-white/10" />
                  </div>
                </div>
              )}

              {(plan === 'free' || plan === 'recovery_pass') && (
                <p className="text-[11px] text-zinc-500 italic">
                  * Limits are enforced on a "whichever comes first" basis (either storage capacity or file count).
                </p>
              )}

              {(plan === 'pro' || plan === 'super') && (
                <div className="space-y-6">
                  <div className="p-4 border border-indigo-500/20 bg-indigo-500/5 rounded-xl space-y-2">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-indigo-400" />
                      <span className="font-bold text-base text-zinc-100">Unlimited Lifetime Recovery Active</span>
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
                        <HardDrive className="w-3.5 h-3.5 text-indigo-400" /> Total Data Restored
                      </div>
                      <div className="text-2xl font-black text-white">{formatBytes(totalBytesVal)}</div>
                    </div>
                    <div className="bg-white/[0.01] border border-white/5 rounded-xl p-4 space-y-2">
                      <div className="text-xs text-white/40 uppercase tracking-widest font-semibold flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-indigo-400" /> Total Files Restored
                      </div>
                      <div className="text-2xl font-black text-white">{totalFilesVal.toLocaleString()}</div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-4 pt-2">
                {plan !== 'super' ? (
                  <a href="/pricing" className="flex-1">
                    <Button className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:opacity-95 border-0 font-bold rounded-full">
                      <Key className="w-4 h-4 mr-2" /> Upgrade Account Plan
                    </Button>
                  </a>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-xs font-semibold text-white/40 border border-white/5 bg-zinc-900/20 rounded-full py-2.5">
                    Highest Performance Tier Active
                  </div>
                )}
                <a href="/tool" className="flex-1">
                  <Button variant="outline" className="w-full border-white/20 hover:bg-white/10 hover:text-white font-bold rounded-full">Restore My Data</Button>
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
                    <LifeBuoy className="w-4 h-4 text-indigo-400" />
                    Support & Help Center
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="space-y-3">
                  <a href="/support" className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.02] hover:bg-white/5 border border-white/5 hover:border-white/10 transition-colors">
                    <div className="flex items-center gap-3">
                      <FileText className="w-4 h-4 text-white/50" />
                      <span className="text-sm font-medium">FAQ & Documentation</span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-white/30" />
                  </a>
                  
                  {!isPaid ? (
                    <a href="/pricing" className="flex items-center justify-between p-3.5 rounded-xl border border-indigo-500/30 bg-indigo-500/5 hover:bg-indigo-500/10 transition-colors group">
                      <div className="flex items-center gap-3">
                        <LifeBuoy className="w-4 h-4 text-indigo-400" />
                        <span className="text-sm font-medium text-indigo-400 group-hover:text-indigo-300">Upgrade for Direct Support</span>
                      </div>
                      <ArrowRight className="w-4 h-4 text-indigo-400/55 group-hover:text-indigo-400" />
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
                      {plan === 'free' || plan === 'recovery_pass' ? (
                        <div className="text-center py-8">
                          <p className="text-xs text-white/50 mb-4">Detailed history logs are only available on Pro and Super plans.</p>
                          <a href="/pricing">
                            <Button variant="outline" className="border-indigo-500/40 text-indigo-400 hover:bg-indigo-500/10 hover:text-indigo-300 text-xs rounded-full">
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
                          <div className="flex justify-between items-center p-3.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-xs mb-1">
                            <span className="font-semibold text-indigo-300">Lifetime Recovery Stats</span>
                            <span className="font-mono font-bold text-zinc-100">
                              {totalFilesVal.toLocaleString()} files • {formatBytes(totalBytesVal)}
                            </span>
                          </div>

                          <div className="space-y-3 max-h-[180px] overflow-y-auto pr-1">
                            {history.map((h) => (
                              <div key={h.id} className="flex justify-between items-center p-3.5 bg-white/[0.02] rounded-xl border border-white/5">
                                <div>
                                  <div className="font-mono text-xs font-semibold mb-0.5">{h.archiveName}</div>
                                  <div className="text-[11px] text-white/55 font-mono">
                                    Restored {h.matched || h.recovered || 0} / {h.filesProcessed || 0} files • {formatBytes(h.bytesProcessed || 0)}
                                  </div>
                                  <div className="text-[9px] text-white/40 mt-1">{new Date(h.timestamp).toLocaleString()}</div>
                                </div>
                                <div className="text-[10px] font-bold text-green-400 bg-green-400/10 px-2.5 py-0.5 rounded-full border border-green-500/20 capitalize">
                                  {h.status || 'completed'}
                                </div>
                              </div>
                            ))}
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
                                    <div className="font-bold text-indigo-400">TakeoutFix {PLAN_LABELS[tx.plan] || tx.plan} (Admin Approved)</div>
                                    <div className="text-[10px] text-zinc-400">Approved by Admin: {tx.approvedByAdmin}</div>
                                    <div className="text-[9px] text-zinc-500">{new Date(tx.timestamp).toLocaleDateString()} • {tx.txId}</div>
                                  </>
                                ) : (
                                  <>
                                    <div className="font-bold text-zinc-200">TakeoutFix {PLAN_LABELS[tx.plan] || tx.plan}</div>
                                    <div className="text-[10px] text-zinc-500">{new Date(tx.timestamp).toLocaleDateString()} • {tx.txId}</div>
                                  </>
                                )}
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="font-bold text-white">
                                  {tx.amount === 0 ? "Free Grant" : `₹${tx.amount}`}
                                </span>
                                <button 
                                  onClick={() => downloadInvoice(tx)}
                                  title="Download Invoice Receipt"
                                  className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </button>
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
