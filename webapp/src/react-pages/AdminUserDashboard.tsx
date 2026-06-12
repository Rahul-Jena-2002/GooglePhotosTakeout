import { useState, useEffect } from "react"
import { useParams, Link, useNavigate } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card"
import { Progress } from "../components/ui/progress"
import { Button } from "../components/ui/button"
import { doc, collection, query, where, orderBy, onSnapshot, updateDoc, deleteDoc, addDoc } from "firebase/firestore"
import { db } from "../firebase"
import { ShieldAlert, HardDrive, History, FileText, ArrowLeft, ShieldCheck, Download, CreditCard, Trash2 } from "lucide-react"
import { motion } from "framer-motion"
import { useAuth } from "../contexts/AuthContext"

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

export default function AdminUserDashboard() {
  const uid = new URLSearchParams(window.location.search).get("uid") || ""
  const navigate = useNavigate()

  const { adminData } = useAuth()
  const role = adminData?.role || "ADMIN"

  const [targetUser, setTargetUser] = useState<any>(null)
  const [userLoading, setUserLoading] = useState(true)
  const [history, setHistory] = useState<any[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [transactions, setTransactions] = useState<any[]>([])
  const [txLoading, setTxLoading] = useState(true)

  const handleUpdatePlan = async (userId: string, newPlan: string) => {
    try {
      await updateDoc(doc(db, "users", userId), { 
        plan: newPlan,
        usedBytes: 0,
        usedFiles: 0
      })
      
      await addDoc(collection(db, "admin_activity"), {
        actorUid: adminData?.uid || "system",
        actorName: adminData?.displayName || "Admin",
        actorRole: role,
        action: "UPDATE_PLAN",
        target: userId,
        description: `Updated plan for ${targetUser?.email || userId} to ${PLAN_LABELS[newPlan] || newPlan}`,
        timestamp: Date.now()
      })

      // Generate a transaction receipt if upgraded to a paid plan by admin
      if (["pro", "super", "recovery_pass"].includes(newPlan)) {
        await addDoc(collection(db, "transactions"), {
          uid: userId,
          email: targetUser?.email || "",
          displayName: targetUser?.displayName || "User",
          plan: newPlan,
          amount: 0, // Free admin grant
          currency: "INR",
          paymentMethod: "Admin Grant",
          status: "succeeded",
          txId: `ADM-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
          timestamp: Date.now(),
          approvedByAdmin: adminData?.displayName || "Admin"
        }).catch(console.error)
      }
    } catch (err: any) {
      console.error(err)
      alert("Failed to update user plan. Make sure you have SUPER_ADMIN or ADMIN permissions.")
    }
  }

  const handleToggleSupportWithAds = async (userId: string, enable: boolean) => {
    try {
      await updateDoc(doc(db, "users", userId), { supportWithAds: enable })
      
      await addDoc(collection(db, "admin_activity"), {
        actorUid: adminData?.uid || "system",
        actorName: adminData?.displayName || "Admin",
        actorRole: role,
        action: "TOGGLE_SUPPORT_ADS",
        target: userId,
        description: `${enable ? "Enabled" : "Disabled"} support-with-ads setting for ${targetUser?.email || userId}`,
        timestamp: Date.now()
      })
    } catch (err: any) {
      console.error(err)
      alert("Failed to update support-with-ads setting: " + err.message)
    }
  }

  const handleToggleSuspension = async (userId: string, suspend: boolean) => {
    try {
      await updateDoc(doc(db, "users", userId), { suspended: suspend })
      
      await addDoc(collection(db, "admin_activity"), {
        actorUid: adminData?.uid || "system",
        actorName: adminData?.displayName || "Admin",
        actorRole: role,
        action: suspend ? "SUSPEND" : "REACTIVATE",
        target: userId,
        description: `${suspend ? "Suspended" : "Reactivated"} user account ${targetUser?.email || userId}`,
        timestamp: Date.now()
      })
    } catch (err: any) {
      console.error(err)
      alert("Failed to update user status: " + err.message)
    }
  }

  const handleDeleteUser = async (userId: string, email: string) => {
    if (!window.confirm(`Are you sure you want to permanently delete the user document for ${email || userId}? This cannot be undone.`)) {
      return
    }
    try {
      await deleteDoc(doc(db, "users", userId))
      
      await addDoc(collection(db, "admin_activity"), {
        actorUid: adminData?.uid || "system",
        actorName: adminData?.displayName || "Admin",
        actorRole: role,
        action: "DELETE_USER",
        target: userId,
        description: `Permanently deleted user document for ${email || userId}`,
        timestamp: Date.now()
      })
      navigate("/admin/users")
    } catch (err: any) {
      console.error(err)
      alert("Failed to delete user: " + err.message)
    }
  }

  useEffect(() => {
    if (!uid) return

    // 1. Fetch target user's profile
    const userRef = doc(db, "users", uid)
    const unsubUser = onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        setTargetUser({ id: snap.id, ...snap.data() })
      } else {
        setTargetUser(null)
      }
      setUserLoading(false)
    }, (err) => {
      console.error("Failed to load user profile:", err)
      setUserLoading(false)
    })

    // 2. Fetch target user's billing history
    const qTx = query(
      collection(db, "transactions"),
      where("uid", "==", uid),
      orderBy("timestamp", "desc")
    )
    const unsubTx = onSnapshot(qTx, (snap) => {
      setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setTxLoading(false)
    }, (err) => {
      console.error("Failed to load user transactions:", err)
      setTxLoading(false)
    })

    // 3. Fetch target user's detailed recovery runs
    const qHist = query(
      collection(db, "recoveryHistory", uid, "sessions"),
      orderBy("timestamp", "desc")
    )
    const unsubHist = onSnapshot(qHist, (snap) => {
      setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setHistoryLoading(false)
    }, (err) => {
      console.error("Failed to load user recovery sessions:", err)
      setHistoryLoading(false)
    })

    return () => {
      unsubUser()
      unsubTx()
      unsubHist()
    }
  }, [uid])

  if (userLoading) {
    return <div className="p-8 text-center text-white/50 mt-16">Loading user details...</div>
  }

  if (!targetUser) {
    return (
      <div className="max-w-md mx-auto mt-32 p-6 bg-zinc-900 border border-zinc-850 rounded-xl text-center">
        <ShieldAlert className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold mb-2">User Not Found</h2>
        <p className="text-zinc-400 mb-6">The requested user document does not exist in the database.</p>
        <Link to="/admin/users">
          <Button className="w-full bg-white text-zinc-950 hover:bg-white/90">Return to User Management</Button>
        </Link>
      </div>
    )
  }

  const plan = targetUser.plan || 'free'
  
  // Storage Quota
  const maxQuotaGB = plan === 'free' ? 1 : plan === 'recovery_pass' ? 20 : Infinity
  const usedGB = (targetUser.usedBytes || 0) / (1024 ** 3)
  const quotaPct = maxQuotaGB === Infinity ? 0 : Math.min(100, (usedGB / maxQuotaGB) * 100)

  // Files Quota
  const maxQuotaFiles = plan === 'free' ? 1000 : plan === 'recovery_pass' ? 10000 : Infinity
  const usedFiles = targetUser.usedFiles || 0
  const fileQuotaPct = maxQuotaFiles === Infinity ? 0 : Math.min(100, (usedFiles / maxQuotaFiles) * 100)

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
    <div className="max-w-5xl mx-auto px-4 py-6 relative font-sans text-zinc-100">
      
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="space-y-8"
      >
        <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-zinc-800 pb-4 gap-4">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate("/admin/users")}
              className="p-2 bg-zinc-900 border border-zinc-800 rounded-full hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-white"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">
                Dashboard View: {targetUser.displayName || 'Unknown'}
              </h1>
              <p className="text-xs text-zinc-500 font-mono mt-0.5">@{targetUser.username || targetUser.id}</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${targetUser.suspended ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${targetUser.suspended ? 'bg-red-400' : 'bg-emerald-400'}`}></span>
              {targetUser.suspended ? 'Suspended' : 'Active Account'}
            </span>
            <span className="text-xs text-zinc-500">Joined {new Date(targetUser.createdAt || 1780946257009).toLocaleDateString()}</span>
          </div>
        </motion.div>

        {/* PLAN, QUOTA & CONTROLS GRID */}
        <div className="grid md:grid-cols-2 gap-8">
          {/* ACTIVE PLAN & QUOTA */}
          <motion.div variants={itemVariants} className="h-full">
            <Card className="bg-zinc-900 border-zinc-800 shadow-none overflow-hidden h-full flex flex-col justify-between">
              <div>
                <CardHeader className="border-b border-zinc-800 py-4">
                  <CardTitle className="text-base font-semibold flex justify-between items-center">
                    <span className="flex items-center gap-2 text-zinc-200">
                      <ShieldCheck className="w-5 h-5 text-indigo-400" />
                      Subscription details & telemetry quotas
                    </span>
                    <span className="text-xs bg-indigo-500/10 text-indigo-400 px-3 py-1 rounded-md border border-indigo-500/20 font-bold uppercase tracking-widest">
                      {PLAN_LABELS[plan] || plan} Plan
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6 space-y-6">
                  
                  <div className="grid sm:grid-cols-2 gap-4">
                    {/* Storage Quota Card */}
                    <div className="bg-zinc-950 border border-zinc-850 rounded-xl p-4 space-y-3">
                      <div className="flex justify-between text-xs text-zinc-400">
                        <span className="flex items-center gap-1.5 font-semibold"><HardDrive className="w-3.5 h-3.5 text-zinc-500" /> Storage Capacity</span>
                        <span className="font-mono">{usedGB.toFixed(2)} GB / {maxQuotaGB === Infinity ? 'Unlimited' : `${maxQuotaGB}.00 GB`}</span>
                      </div>
                      {maxQuotaGB !== Infinity && (
                        <Progress value={quotaPct} className="h-1.5 bg-zinc-850" />
                      )}
                    </div>

                    {/* Files Quota Card */}
                    <div className="bg-zinc-950 border border-zinc-850 rounded-xl p-4 space-y-3">
                      <div className="flex justify-between text-xs text-zinc-400">
                        <span className="flex items-center gap-1.5 font-semibold"><FileText className="w-3.5 h-3.5 text-zinc-500" /> Files Processed</span>
                        <span className="font-mono">{usedFiles.toLocaleString()} / {maxQuotaFiles === Infinity ? 'Unlimited' : maxQuotaFiles.toLocaleString()}</span>
                      </div>
                      {maxQuotaFiles !== Infinity && (
                        <Progress value={fileQuotaPct} className="h-1.5 bg-zinc-850" />
                      )}
                    </div>
                  </div>

                  {/* Global counters for the user */}
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    {[
                      { label: "Lifetime Bytes", val: formatBytes(Math.max(targetUser.totalBytesProcessed || 0, targetUser.lifetimeBytes || 0)) },
                      { label: "Lifetime Files", val: (targetUser.totalFilesProcessed || 0).toLocaleString() },
                      { label: "Current Session Bytes", val: formatBytes(targetUser.usedBytes || 0) },
                      { label: "Current Session Files", val: (targetUser.usedFiles || 0).toLocaleString() }
                    ].map((stat, i) => (
                      <div key={i} className="bg-zinc-950/40 border border-zinc-850 p-2.5 rounded-lg text-center">
                        <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider mb-1">{stat.label}</div>
                        <div className="text-sm font-semibold text-white">{stat.val}</div>
                      </div>
                    ))}
                  </div>

                </CardContent>
              </div>
            </Card>
          </motion.div>

          {/* ADMINISTRATIVE CONTROLS */}
          <motion.div variants={itemVariants} className="h-full">
            <Card className="bg-zinc-900 border-zinc-800 shadow-none overflow-hidden h-full flex flex-col justify-between">
              <div>
                <CardHeader className="border-b border-zinc-800 py-4">
                  <CardTitle className="text-base font-semibold flex items-center gap-2 text-zinc-200">
                    <ShieldAlert className="w-5 h-5 text-red-400" />
                    Administrative Controls
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6 space-y-4">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5 font-medium uppercase tracking-wider">Change Subscription Plan</label>
                    <select
                      value={plan}
                      onChange={(e) => handleUpdatePlan(targetUser.id, e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-850 rounded-md py-2 px-3 text-sm text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                    >
                      <option value="free">Free</option>
                      <option value="recovery_pass">Single Time (Recovery Pass)</option>
                      <option value="pro">Pro</option>
                      <option value="super">Super</option>
                    </select>
                  </div>

                  {plan === "super" && (
                    <div className="flex items-center justify-between border-t border-zinc-800/60 pt-3.5">
                      <div className="text-left pr-4">
                        <label className="block text-xs text-zinc-400 font-medium uppercase tracking-wider">Support with Ads</label>
                        <span className="text-[10px] text-zinc-500 block leading-tight mt-0.5">Show website ads to support developer even though user is Super</span>
                      </div>
                      <input 
                        type="checkbox"
                        checked={targetUser.supportWithAds || false}
                        onChange={(e) => handleToggleSupportWithAds(targetUser.id, e.target.checked)}
                        className="w-4 h-4 rounded border-zinc-800 bg-zinc-900 text-indigo-500 focus:ring-indigo-500 cursor-pointer"
                      />
                    </div>
                  )}

                  <div className="flex gap-3 pt-3 border-t border-zinc-800/60">
                    <button
                      onClick={() => handleToggleSuspension(targetUser.id, !targetUser.suspended)}
                      className={`flex-1 py-2 rounded-md text-xs font-semibold border transition-all ${
                        targetUser.suspended 
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20' 
                          : 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20'
                      }`}
                    >
                      {targetUser.suspended ? 'Reactivate Account' : 'Suspend Account'}
                    </button>
                    <button
                      onClick={() => handleDeleteUser(targetUser.id, targetUser.email)}
                      className="px-3 py-2 rounded-md bg-red-900/20 hover:bg-red-950 text-red-400 border border-red-900/30 hover:border-red-900/50 transition-colors"
                      title="Delete Account Document"
                    >
                      <Trash2 className="w-4.5 h-4.5" />
                    </button>
                  </div>

                </CardContent>
              </div>
            </Card>
          </motion.div>
        </div>

        {/* DETAILS GRID */}
        <div className="grid md:grid-cols-2 gap-8">
          
          {/* USER RECOVERY HISTORY */}
          <motion.div variants={itemVariants}>
            <Card className="bg-zinc-900 border-zinc-800 shadow-none flex flex-col justify-between">
              <div>
                <CardHeader className="border-b border-zinc-800 py-4 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2 text-zinc-200">
                    <History className="w-4 h-4 text-indigo-400" />
                    User Recovery History
                  </CardTitle>
                  {!historyLoading && (
                    <span className="text-[10px] font-bold bg-zinc-950 px-2 py-0.5 rounded-full border border-zinc-800 text-indigo-400">
                      {history.length} Session{history.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </CardHeader>
                <CardContent className="pt-6">
                  {historyLoading ? (
                    <div className="text-center py-8 text-xs text-zinc-500">Syncing user history...</div>
                  ) : history.length === 0 ? (
                    <div className="text-center py-8 text-xs text-zinc-500">No recovery history records found.</div>
                  ) : (
                    <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
                      {history.map((h) => (
                        <div key={h.id} className="flex justify-between items-center p-3.5 bg-zinc-950/40 rounded-xl border border-zinc-850">
                          <div>
                            <div className="font-mono text-xs font-semibold mb-0.5 text-zinc-200">{h.archiveName}</div>
                            <div className="text-[11px] text-zinc-400">
                              Restored {h.matched || h.recovered || 0} / {h.filesProcessed || 0} files • {formatBytes(h.bytesProcessed || 0)}
                            </div>
                            <div className="text-[9px] text-zinc-600 mt-1">{new Date(h.timestamp).toLocaleString()}</div>
                          </div>
                          <div className="text-[10px] font-bold text-green-400 bg-green-400/10 px-2.5 py-0.5 rounded-full border border-green-500/20 capitalize">
                            {h.status || 'completed'}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </div>
            </Card>
          </motion.div>

          {/* USER BILLING LOGS */}
          <motion.div variants={itemVariants}>
            <Card className="bg-zinc-900 border-zinc-800 shadow-none flex flex-col justify-between">
              <div>
                <CardHeader className="border-b border-zinc-800 py-4 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2 text-zinc-200">
                    <CreditCard className="w-4 h-4 text-indigo-400" />
                    Billing & Invoices
                  </CardTitle>
                  {!txLoading && (
                    <span className="text-[10px] font-bold bg-zinc-950 px-2 py-0.5 rounded-full border border-zinc-800 text-indigo-400">
                      {transactions.length} Payment{transactions.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </CardHeader>
                <CardContent className="pt-6">
                  {txLoading ? (
                    <div className="text-center py-8 text-xs text-zinc-500">Syncing transaction log...</div>
                  ) : transactions.length === 0 ? (
                    <div className="text-center py-8 text-xs text-zinc-500">No transaction records found for this account.</div>
                  ) : (
                    <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
                      {transactions.map((tx) => (
                        <div key={tx.id} className="flex items-center justify-between p-3.5 bg-zinc-950/40 border border-zinc-850 rounded-xl text-xs">
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
                              title="Download Invoice"
                              className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
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
