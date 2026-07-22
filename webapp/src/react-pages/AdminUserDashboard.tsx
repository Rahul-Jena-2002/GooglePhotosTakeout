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
import { useToastStore } from "../store/useToastStore"

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  recovery_pass: "Single Time",
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

const getUserBytes = (u: any) => {
  if (!u) return 0;
  return Math.max(u.usedBytes || 0, u.totalBytesProcessed || 0, u.lifetimeBytes || 0);
}

const getUserFiles = (u: any) => {
  if (!u) return 0;
  const recorded = Math.max(u.totalFilesProcessed || 0, u.usedFiles || 0, u.lifetimeFiles || 0);
  const trackedBytes = Math.max(u.totalBytesProcessed || 0, u.usedBytes || 0);
  const legacyBytes = Math.max(0, (u.lifetimeBytes || 0) - trackedBytes);
  const legacyFiles = legacyBytes > 0 ? Math.round(legacyBytes / (1.2 * 1024 * 1024)) : 0;
  return recorded + legacyFiles;
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
  const [historyPage, setHistoryPage] = useState(0)
  const HISTORY_PAGE_SIZE = 8

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
      useToastStore.getState().addToast("Failed to update user plan. Make sure you have SUPER_ADMIN or ADMIN permissions.", "error")
    }
  }

  const handleExtendRecoveryPass = async (userId: string) => {
    const base = Math.max(Date.now(), targetUser?.expiresAt || 0);
    const newExp = base + 24 * 60 * 60 * 1000;
    try {
      await updateDoc(doc(db, "users", userId), { expiresAt: newExp });
      setTargetUser({ ...targetUser, expiresAt: newExp });
      await addDoc(collection(db, "admin_activity"), {
        actorUid: adminData?.uid || "system",
        actorName: adminData?.displayName || "Admin",
        actorRole: role,
        action: "EXTEND_RECOVERY_PASS",
        target: userId,
        description: `Extended Recovery Pass for ${targetUser?.email || userId} by 24 hours.`,
        timestamp: Date.now()
      });
      alert("Recovery pass extended by 24 hours successfully.");
    } catch (err) {
      alert("Failed to extend recovery pass: " + err.message);
    }
  };

  const handleExpireRecoveryPass = async (userId: string) => {
    if (!window.confirm("Expire user's Recovery Pass immediately?")) return;
    const newExp = Date.now() - 1000;
    try {
      await updateDoc(doc(db, "users", userId), { expiresAt: newExp });
      setTargetUser({ ...targetUser, expiresAt: newExp });
      await addDoc(collection(db, "admin_activity"), {
        actorUid: adminData?.uid || "system",
        actorName: adminData?.displayName || "Admin",
        actorRole: role,
        action: "EXPIRE_RECOVERY_PASS",
        target: userId,
        description: `Expired Recovery Pass for ${targetUser?.email || userId} immediately.`,
        timestamp: Date.now()
      });
      alert("Recovery pass expired immediately.");
    } catch (err) {
      alert("Failed to expire recovery pass: " + err.message);
    }
  };

  const handleResetQuota = async (userId: string) => {
    if (!window.confirm(`Reset usage quota for this user? This will set usedBytes and usedFiles to 0. Their plan and lifetime stats will not change.`)) return
    try {
      await updateDoc(doc(db, "users", userId), {
        usedBytes: 0,
        usedFiles: 0,
      })
      await addDoc(collection(db, "admin_activity"), {
        actorUid: adminData?.uid || "system",
        actorName: adminData?.displayName || "Admin",
        actorRole: role,
        action: "RESET_QUOTA",
        target: userId,
        description: `Reset usage quota (usedBytes + usedFiles) for ${targetUser?.email || userId}`,
        timestamp: Date.now()
      })
      useToastStore.getState().addToast("User quota reset successfully.", "success")
    } catch (err: any) {
      console.error(err)
      useToastStore.getState().addToast("Failed to reset quota: " + err.message, "error")
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
      useToastStore.getState().addToast("Failed to update support-with-ads setting: " + err.message, "error")
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
      useToastStore.getState().addToast("Failed to update user status: " + err.message, "error")
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
      useToastStore.getState().addToast("Failed to delete user: " + err.message, "error")
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
    const STALE_MS = 24 * 60 * 60 * 1000
    const unsubHist = onSnapshot(qHist, (snap) => {
      const sessions = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setHistory(sessions)
      setHistoryLoading(false)

      // Auto-resolve stale 'processing' sessions (>24h) → 'failed' in Firestore
      const now = Date.now()
      snap.docs.forEach(d => {
        const data = d.data()
        if (
          (data.status || '').toLowerCase() === 'processing' &&
          now - (data.timestamp || 0) > STALE_MS
        ) {
          updateDoc(doc(db, 'recoveryHistory', uid, 'sessions', d.id), { status: 'failed' })
            .catch(err => console.warn('Failed to mark stale session as failed:', err))
        }
      })
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
  const usedBytesVal = plan === 'free' ? getUserBytes(targetUser) : (targetUser.usedBytes || 0)
  const usedGB = usedBytesVal / (1024 ** 3)
  const quotaPct = maxQuotaGB === Infinity ? 0 : Math.min(100, (usedGB / maxQuotaGB) * 100)

  // Files Quota
  const maxQuotaFiles = plan === 'free' ? 1000 : plan === 'recovery_pass' ? 10000 : Infinity
  const usedFiles = plan === 'free' ? getUserFiles(targetUser) : (targetUser.usedFiles || 0)
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
    URL.revokeObjectURL(url);
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

  const historyTotalPages = Math.ceil(history.length / HISTORY_PAGE_SIZE)
  const historySlice = history.slice(historyPage * HISTORY_PAGE_SIZE, (historyPage + 1) * HISTORY_PAGE_SIZE)

  // Sessions stuck in 'processing' for > 24 h are shown as 'failed' (display only, no DB write)
  const effectiveStatus = (h: any): string => {
    if ((h.status || '').toLowerCase() === 'processing') {
      const age = Date.now() - (h.timestamp || 0)
      if (age > 24 * 60 * 60 * 1000) return 'failed'
    }
    return (h.status || 'completed').toLowerCase()
  }

  const statusStyle = (s: string) => {
    switch (s) {
      case 'completed':  return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
      case 'processing': return 'bg-amber-500/15 text-amber-300 border-amber-500/30'
      case 'cancelled':  return 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30'
      case 'failed':     return 'bg-red-500/15 text-red-300 border-red-500/30'
      default:           return 'bg-red-500/15 text-red-300 border-red-500/30'
    }
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

        {/* ── BAND 1: SUBSCRIPTION + QUOTA (Full Width, Slim) ── */}
        <motion.div variants={itemVariants}>
          <Card className="bg-zinc-900 border-zinc-800 shadow-none overflow-hidden">
            <CardHeader className="border-b border-zinc-800 py-3 px-5">
              <CardTitle className="text-sm font-semibold flex items-center justify-between">
                <span className="flex items-center gap-2 text-zinc-200">
                  <ShieldCheck className="w-4 h-4 text-indigo-400" />
                  Subscription details & telemetry quotas
                </span>
                <div className="flex items-center gap-2">
                  {plan === 'recovery_pass' && targetUser.expiresAt && (
                    <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">
                      Expires {new Date(targetUser.expiresAt).toLocaleDateString()}
                      {targetUser.expiresAt < Date.now() ? ' · Expired' : ''}
                    </span>
                  )}
                  <span className="text-xs bg-indigo-500/10 text-indigo-400 px-3 py-1 rounded-md border border-indigo-500/20 font-bold uppercase tracking-widest">
                    {PLAN_LABELS[plan] || plan} Plan
                  </span>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 py-4">
              {/* Quota bars row */}
              <div className="grid sm:grid-cols-2 gap-3 mb-4">
                <div className="bg-zinc-950 border border-zinc-850 rounded-lg px-4 py-3 space-y-2">
                  <div className="flex justify-between text-xs text-zinc-400">
                    <span className="flex items-center gap-1.5 font-semibold"><HardDrive className="w-3 h-3 text-zinc-500" /> Storage Capacity</span>
                    <span className="font-mono">{usedGB.toFixed(2)} GB / {maxQuotaGB === Infinity ? 'Unlimited' : `${maxQuotaGB}.00 GB`}</span>
                  </div>
                  {maxQuotaGB !== Infinity && <Progress value={quotaPct} className="h-1 bg-zinc-850" />}
                </div>
                <div className="bg-zinc-950 border border-zinc-850 rounded-lg px-4 py-3 space-y-2">
                  <div className="flex justify-between text-xs text-zinc-400">
                    <span className="flex items-center gap-1.5 font-semibold"><FileText className="w-3 h-3 text-zinc-500" /> Files Processed</span>
                    <span className="font-mono">{usedFiles.toLocaleString()} / {maxQuotaFiles === Infinity ? 'Unlimited' : maxQuotaFiles.toLocaleString()}</span>
                  </div>
                  {maxQuotaFiles !== Infinity && <Progress value={fileQuotaPct} className="h-1 bg-zinc-850" />}
                </div>
              </div>
              {/* Stat boxes — single horizontal row */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: "Lifetime Bytes", val: formatBytes(getUserBytes(targetUser)) },
                  { label: "Lifetime Files", val: getUserFiles(targetUser).toLocaleString() },
                  { label: "Session Bytes", val: formatBytes(targetUser.usedBytes || 0) },
                  { label: "Session Files", val: (targetUser.usedFiles || 0).toLocaleString() }
                ].map((stat, i) => (
                  <div key={i} className="bg-zinc-950/40 border border-zinc-850 px-3 py-2.5 rounded-lg text-center">
                    <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider mb-0.5">{stat.label}</div>
                    <div className="text-sm font-semibold text-white">{stat.val}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* ── BAND 2: ADMIN CONTROLS | BILLING (50/50) ── */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* ADMINISTRATIVE CONTROLS */}
          <motion.div variants={itemVariants} className="h-full">
            <Card className="bg-zinc-900 border-zinc-800 shadow-none h-full flex flex-col">
              <CardHeader className="border-b border-zinc-800 py-3 px-5">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-zinc-200">
                  <ShieldAlert className="w-4 h-4 text-red-400" />
                  Administrative Controls
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pt-5 space-y-4 flex-1">
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
                  <div className="flex items-center justify-between border border-zinc-800/60 rounded-lg p-3">
                    <div className="text-left pr-4">
                      <label className="block text-xs text-zinc-200 font-bold uppercase tracking-wider">Support with Ads</label>
                      <span className="text-[10px] text-zinc-400 block leading-tight mt-0.5">Show ads even though user is Super</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={targetUser.supportWithAds || false}
                      onChange={(e) => handleToggleSupportWithAds(targetUser.id, e.target.checked)}
                      className="w-4 h-4 rounded border-zinc-800 bg-zinc-900 text-indigo-500 focus:ring-indigo-500 cursor-pointer"
                    />
                  </div>
                )}

                <button
                  onClick={() => handleResetQuota(targetUser.id)}
                  className="w-full py-2 rounded-md text-xs font-semibold border transition-all bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20"
                >
                  ↺ Reset Usage Quota (usedBytes + usedFiles)
                </button>

                {plan === 'recovery_pass' && (
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleExtendRecoveryPass(targetUser.id)}
                      className="flex-1 py-2 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/20 text-xs font-bold transition-all"
                    >
                      +24h Pass
                    </button>
                    <button
                      onClick={() => handleExpireRecoveryPass(targetUser.id)}
                      className="flex-1 py-2 rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 text-xs font-bold transition-all"
                    >
                      Expire Pass
                    </button>
                  </div>
                )}

                <div className="flex gap-3 pt-2 border-t border-zinc-800/60">
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
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* BILLING & INVOICES */}
          <motion.div variants={itemVariants} className="h-full">
            <Card className="bg-zinc-900 border-zinc-800 shadow-none h-full flex flex-col">
              <CardHeader className="border-b border-zinc-800 py-3 px-5 flex-row items-center justify-between flex">
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
              <CardContent className="px-5 pt-5 flex-1">
                {txLoading ? (
                  <div className="text-center py-10 text-xs text-zinc-500">Syncing transaction log...</div>
                ) : transactions.length === 0 ? (
                  <div className="text-center py-10 text-xs text-zinc-500">No transaction records found for this account.</div>
                ) : (
                  <div className="space-y-2.5">
                    {transactions.map((tx) => (
                      <div key={tx.id} className="flex items-center justify-between p-3 bg-zinc-950/40 border border-zinc-850 rounded-xl text-xs">
                        <div>
                          {tx.approvedByAdmin ? (
                            <>
                              <div className="font-bold text-indigo-400">TakeoutFix {PLAN_LABELS[tx.plan] || tx.plan} <span className="text-[9px] text-zinc-500">(Admin Approved)</span></div>
                              <div className="text-[10px] text-zinc-500 mt-0.5">By: {tx.approvedByAdmin}</div>
                            </>
                          ) : (
                            <div className="font-bold text-zinc-200">TakeoutFix {PLAN_LABELS[tx.plan] || tx.plan}</div>
                          )}
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[9px] text-zinc-500">{new Date(tx.timestamp).toLocaleDateString()} · {tx.txId}</span>
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold border capitalize ${
                              tx.status === "succeeded" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                              tx.status === "processing" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                              tx.status === "cancelled" ? "bg-zinc-500/10 text-zinc-400 border-zinc-500/20" :
                              "bg-red-500/10 text-red-400 border-red-500/20"
                            }`}>
                              {tx.status || 'succeeded'}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white">{tx.amount === 0 ? 'Free Grant' : `₹${tx.amount}`}</span>
                          {(tx.status === 'succeeded' || !tx.status) && (
                            <button
                              onClick={() => downloadInvoice(tx)}
                              title="Download Invoice"
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
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* ── BAND 3: RECOVERY HISTORY (Full Width, Paginated) ── */}
        <motion.div variants={itemVariants}>
          <Card className="bg-zinc-900 border-zinc-800 shadow-none">
            <CardHeader className="border-b border-zinc-800 py-3 px-5 flex-row items-center justify-between flex">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-zinc-200">
                <History className="w-4 h-4 text-indigo-400" />
                User Recovery History
              </CardTitle>
              <div className="flex items-center gap-3">
                {!historyLoading && (
                  <span className="text-[10px] font-bold bg-zinc-950 px-2 py-0.5 rounded-full border border-zinc-800 text-indigo-400">
                    {history.length} Session{history.length !== 1 ? 's' : ''}
                  </span>
                )}
                {historyTotalPages > 1 && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setHistoryPage(p => Math.max(0, p - 1))}
                      disabled={historyPage === 0}
                      className="px-2 py-1 rounded text-[10px] font-semibold border border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-white hover:border-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >← Prev</button>
                    <span className="text-[10px] text-zinc-500 font-mono px-1">
                      {historyPage + 1} / {historyTotalPages}
                    </span>
                    <button
                      onClick={() => setHistoryPage(p => Math.min(historyTotalPages - 1, p + 1))}
                      disabled={historyPage >= historyTotalPages - 1}
                      className="px-2 py-1 rounded text-[10px] font-semibold border border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-white hover:border-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >Next →</button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {historyLoading ? (
                <div className="text-center py-10 text-xs text-zinc-500">Syncing user history...</div>
              ) : history.length === 0 ? (
                <div className="text-center py-10 text-xs text-zinc-500">No recovery history records found.</div>
              ) : (
                <>
                  {/* Table header */}
                  <div className="grid grid-cols-[minmax(0,2.5fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_120px] gap-4 px-6 py-3 border-b border-zinc-700/60 bg-zinc-800/40">
                    <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest">Archive</span>
                    <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest">Files</span>
                    <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest">Bytes</span>
                    <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest">Date</span>
                    <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest text-right">Status</span>
                  </div>
                  {/* Table rows */}
                  <div className="divide-y divide-zinc-800/60">
                    {historySlice.map((h, idx) => {
                      const status = effectiveStatus(h)
                      return (
                        <div
                          key={h.id}
                          className={`grid grid-cols-[minmax(0,2.5fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_120px] gap-4 px-6 py-3.5 items-center transition-colors hover:bg-zinc-800/30 ${
                            idx % 2 !== 0 ? 'bg-zinc-900/60' : ''
                          }`}
                        >
                          <div className="text-sm font-medium text-zinc-100 truncate" title={h.archiveName}>
                            {h.archiveName || '—'}
                          </div>
                          <div className="text-sm text-zinc-300 tabular-nums font-mono">
                            {(h.matched || h.recovered || 0).toLocaleString()} <span className="text-zinc-500">/</span> {(h.filesProcessed || 0).toLocaleString()}
                          </div>
                          <div className="text-sm text-zinc-300 tabular-nums font-mono">{formatBytes(h.bytesProcessed || 0)}</div>
                          <div className="text-xs text-zinc-400 font-mono">
                            {new Date(h.timestamp).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                          </div>
                          <div className="flex justify-end">
                            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border capitalize whitespace-nowrap ${statusStyle(status)}`}>
                              {status}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {/* Pagination footer */}
                  {historyTotalPages > 1 && (
                    <div className="flex items-center justify-between px-5 py-3 border-t border-zinc-800/60 bg-zinc-950/20">
                      <span className="text-[10px] text-zinc-500">
                        Showing {historyPage * HISTORY_PAGE_SIZE + 1}–{Math.min((historyPage + 1) * HISTORY_PAGE_SIZE, history.length)} of {history.length} sessions
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setHistoryPage(0)}
                          disabled={historyPage === 0}
                          className="px-2 py-1 rounded text-[10px] border border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        >«</button>
                        <button
                          onClick={() => setHistoryPage(p => Math.max(0, p - 1))}
                          disabled={historyPage === 0}
                          className="px-2 py-1 rounded text-[10px] border border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        >‹ Prev</button>
                        <span className="text-[10px] text-zinc-400 font-mono px-2">{historyPage + 1} of {historyTotalPages}</span>
                        <button
                          onClick={() => setHistoryPage(p => Math.min(historyTotalPages - 1, p + 1))}
                          disabled={historyPage >= historyTotalPages - 1}
                          className="px-2 py-1 rounded text-[10px] border border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        >Next ›</button>
                        <button
                          onClick={() => setHistoryPage(historyTotalPages - 1)}
                          disabled={historyPage >= historyTotalPages - 1}
                          className="px-2 py-1 rounded text-[10px] border border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        >»</button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>

      </motion.div>
    </div>
  )
}
