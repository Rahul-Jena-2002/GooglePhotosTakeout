import { useEffect, useState } from "react"
import { collection, query, onSnapshot, doc, updateDoc, deleteDoc, addDoc } from "firebase/firestore"
import { db } from "../firebase"
import { Search, Trash2, ShieldAlert } from "lucide-react"
import { useAuth } from "../contexts/AuthContext"
import { Link } from "react-router-dom"
import { useToastStore } from "../store/useToastStore"
import { AdminPagination } from "../components/admin/AdminPagination"

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
  return Math.max(u.usedBytes || 0, u.totalBytesProcessed || 0, u.lifetimeBytes || 0)
}

const getUserFiles = (u: any) => {
  const recorded = Math.max(u.totalFilesProcessed || 0, u.usedFiles || 0, u.lifetimeFiles || 0);
  const trackedBytes = Math.max(u.totalBytesProcessed || 0, u.usedBytes || 0);
  const legacyBytes = Math.max(0, (u.lifetimeBytes || 0) - trackedBytes);
  const legacyFiles = legacyBytes > 0 ? Math.round(legacyBytes / (1.2 * 1024 * 1024)) : 0;
  return recorded + legacyFiles;
}

const getUserFilesRestored = (u: any, recoveries: any[]) => {
  const userRecoveries = recoveries.filter(r => r.uid === u.id)
  const recoveriesScanned = userRecoveries.reduce((sum, r) => sum + (r.scanned || 0), 0)
  const recoveriesMatched = userRecoveries.reduce((sum, r) => sum + (r.matched || 0), 0)
  
  const totalFiles = getUserFiles(u)
  const ratio = recoveriesScanned > 0 ? (recoveriesMatched / recoveriesScanned) : 0.999
  return Math.round(totalFiles * ratio)
}

const formatUserJoinedDate = (val: any, withTime = false) => {
  if (!val) return "—"
  let d: Date
  if (typeof val === "number") {
    d = new Date(val)
  } else if (val.toDate && typeof val.toDate === "function") {
    d = val.toDate()
  } else if (val.seconds) {
    d = new Date(val.seconds * 1000)
  } else if (typeof val === "string") {
    d = new Date(val)
  } else {
    return "—"
  }
  if (isNaN(d.getTime())) return "—"
  if (withTime) {
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

const formatRelativeJoined = (val: any) => {
  if (!val) return ""
  let ms: number
  if (typeof val === "number") ms = val
  else if (val.toDate && typeof val.toDate === "function") ms = val.toDate().getTime()
  else if (val.seconds) ms = val.seconds * 1000
  else ms = new Date(val).getTime()
  if (isNaN(ms)) return ""

  const diff = Date.now() - ms
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "Just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(months / 12)}y ago`
}

export default function AdminUsers() {
  const [users, setUsers] = useState<any[]>([])
  const [recoveries, setRecoveries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState("all")
  const [search, setSearch] = useState("")
  const [selectedUser, setSelectedUser] = useState<any | null>(null)
  const [pendingPlans, setPendingPlans] = useState<Record<string, string>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(5)

  const { adminData } = useAuth()
  const role = adminData?.role || "ADMIN"

  const handleStagePlan = (userId: string, newPlan: string) => {
    const userDoc = users.find(u => u.id === userId)
    const currentPlan = userDoc?.plan || 'free'
    setPendingPlans(prev => {
      const updated = { ...prev }
      if (newPlan === currentPlan) {
        delete updated[userId]
      } else {
        updated[userId] = newPlan
      }
      return updated
    })
  }

  const handleCommitAllPlans = async () => {
    const pendingIds = Object.keys(pendingPlans)
    if (pendingIds.length === 0) return
    setIsSaving(true)
    try {
      for (const userId of pendingIds) {
        await handleUpdatePlan(userId, pendingPlans[userId])
      }
      setPendingPlans({})
      useToastStore.getState().addToast(`Successfully updated ${pendingIds.length} user plan(s).`, "success")
    } catch (err: any) {
      console.error(err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleUpdatePlan = async (userId: string, newPlan: string) => {
    try {
      const updateData = { 
        plan: newPlan,
        usedBytes: 0,
        usedFiles: 0,
        expiresAt: newPlan === 'recovery_pass' ? Date.now() + 24 * 60 * 60 * 1000 : null
      }
      await updateDoc(doc(db, "users", userId), updateData)
      
      const userDoc = users.find(u => u.id === userId)
      const updatedUserDoc = { ...userDoc, ...updateData }
      if (selectedUser && selectedUser.id === userId) {
        setSelectedUser(updatedUserDoc)
      }
      
      await addDoc(collection(db, "admin_activity"), {
        actorUid: adminData?.uid || "system",
        actorName: adminData?.displayName || "Admin",
        actorRole: role,
        action: "UPDATE_PLAN",
        target: userId,
        description: `Updated plan for ${userDoc?.email || userId} to ${PLAN_LABELS[newPlan] || newPlan}`,
        timestamp: Date.now()
      })

      // Generate a transaction receipt if upgraded to a paid plan by admin
      if (["pro", "super", "recovery_pass"].includes(newPlan)) {
        await addDoc(collection(db, "transactions"), {
          uid: userId,
          email: userDoc?.email || "",
          displayName: userDoc?.displayName || "User",
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

  const handleToggleSupportWithAds = async (userId: string, enable: boolean) => {
    try {
      await updateDoc(doc(db, "users", userId), { supportWithAds: enable })
      
      const userDoc = users.find(u => u.id === userId)
      const updatedUserDoc = { ...userDoc, supportWithAds: enable }
      if (selectedUser && selectedUser.id === userId) {
        setSelectedUser(updatedUserDoc)
      }
      
      await addDoc(collection(db, "admin_activity"), {
        actorUid: adminData?.uid || "system",
        actorName: adminData?.displayName || "Admin",
        actorRole: role,
        action: "TOGGLE_SUPPORT_ADS",
        target: userId,
        description: `${enable ? "Enabled" : "Disabled"} support-with-ads setting for ${userDoc?.email || userId}`,
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
      
      const userDoc = users.find(u => u.id === userId)
      const updatedUserDoc = { ...userDoc, suspended: suspend }
      if (selectedUser && selectedUser.id === userId) {
        setSelectedUser(updatedUserDoc)
      }
      
      await addDoc(collection(db, "admin_activity"), {
        actorUid: adminData?.uid || "system",
        actorName: adminData?.displayName || "Admin",
        actorRole: role,
        action: suspend ? "SUSPEND" : "REACTIVATE",
        target: userId,
        description: `${suspend ? "Suspended" : "Reactivated"} user account ${userDoc?.email || userId}`,
        timestamp: Date.now()
      })
    } catch (err: any) {
      console.error(err)
      useToastStore.getState().addToast("Failed to update user status: " + err.message, "error")
    }
  }

  const handleResetQuota = async (userId: string) => {
    if (!window.confirm(`Reset usage quota for this user? This will set usedBytes and usedFiles to 0. Their plan and lifetime stats will not change.`)) return
    try {
      await updateDoc(doc(db, "users", userId), {
        usedBytes: 0,
        usedFiles: 0,
      })
      const userDoc = users.find(u => u.id === userId)
      if (selectedUser && selectedUser.id === userId) {
        setSelectedUser({ ...selectedUser, usedBytes: 0, usedFiles: 0 })
      }
      await addDoc(collection(db, "admin_activity"), {
        actorUid: adminData?.uid || "system",
        actorName: adminData?.displayName || "Admin",
        actorRole: role,
        action: "RESET_QUOTA",
        target: userId,
        description: `Reset usage quota (usedBytes + usedFiles) for ${userDoc?.email || userId}`,
        timestamp: Date.now()
      })
      useToastStore.getState().addToast("User quota reset successfully.", "success")
    } catch (err: any) {
      console.error(err)
      useToastStore.getState().addToast("Failed to reset quota: " + err.message, "error")
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
    } catch (err: any) {
      console.error(err)
      useToastStore.getState().addToast("Failed to delete user: " + err.message, "error")
    }
  }

  useEffect(() => {
    const q = query(collection(db, "users"))
    const unsubscribe = onSnapshot(q, (snap) => {
      const userList = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      // Sort by join date ascending (oldest members first — #1 = founding user)
      userList.sort((a: any, b: any) => {
        const getTs = (u: any) => {
          if (typeof u.createdAt === "number") return u.createdAt;
          if (u.createdAt?.seconds) return u.createdAt.seconds * 1000;
          if (u.createdAt?.toDate) return u.createdAt.toDate().getTime();
          return 0;
        };
        return getTs(a) - getTs(b);
      })
      setUsers(userList)
      setLoading(false)
    }, (err) => {
      console.error(err)
      setLoading(false)
    })

    const unsubRecoveries = onSnapshot(collection(db, "recoveries"), (snap) => {
      setRecoveries(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }, console.error)

    return () => {
      unsubscribe()
      unsubRecoveries()
    }
  }, [])

  // Update selectedUser if real-time snapshot has edits
  useEffect(() => {
    if (selectedUser) {
      const freshDoc = users.find(u => u.id === selectedUser.id)
      if (freshDoc) {
        setSelectedUser(freshDoc)
      }
    }
  }, [users])

  const filteredUsers = users.filter(u => {
    if (filter !== "all" && u.plan !== filter) return false
    if (search && !(u.email?.toLowerCase().includes(search.toLowerCase()) || u.id.toLowerCase().includes(search.toLowerCase()))) return false
    return true
  })

  // Reset to page 1 whenever filter or search changes
  useEffect(() => { setPage(1) }, [search, filter])

  const paginatedUsers = filteredUsers.slice((page - 1) * pageSize, page * pageSize)

  return (
    <div>
      <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">User Management</h1>
          <p className="text-zinc-400 text-sm">View and manage all registered accounts.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Search email or ID..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 rounded-md py-1.5 pl-9 pr-3 text-sm text-white focus:outline-none focus:border-indigo-500 w-64"
            />
          </div>
          <select 
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-md py-1.5 px-3 text-sm text-white focus:outline-none focus:border-indigo-500"
          >
            <option value="all">All Plans</option>
            <option value="free">Free</option>
            <option value="recovery_pass">Single Time</option>
            <option value="pro">Pro</option>
            <option value="super">Super</option>
          </select>
          {Object.keys(pendingPlans).length > 0 && (
            <button
              onClick={handleCommitAllPlans}
              disabled={isSaving}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-md shadow-lg transition-all flex items-center gap-1.5 animate-pulse"
            >
              {isSaving ? "Saving..." : `Save Changes (${Object.keys(pendingPlans).length})`}
            </button>
          )}
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
        <div className="w-full overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-zinc-950/50 border-b border-zinc-800 text-zinc-400">
              <tr>
                <th className="px-4 py-3 font-medium w-10 text-center">#</th>
                <th className="px-6 py-3 font-medium">User</th>
                <th className="px-6 py-3 font-medium">Plan</th>
                <th className="px-6 py-3 font-medium">Joined</th>
                <th className="px-6 py-3 font-medium">Processed</th>
                <th className="px-6 py-3 font-medium">Files Restored</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-zinc-500">Loading users...</td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-zinc-500">No users found matching criteria.</td>
                </tr>
              ) : (
                paginatedUsers.map((u, idx) => (
                  <tr
                    key={u.id}
                    className="hover:bg-zinc-800/50 cursor-pointer transition-colors"
                    onClick={() => setSelectedUser(u)}
                  >
                    <td className="px-4 py-4 text-center">
                      <span className="text-xs font-mono text-zinc-500">{(page - 1) * pageSize + idx + 1}</span>
                    </td>                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <img src={u.photoURL || `https://ui-avatars.com/api/?name=${u.displayName || 'U'}&background=random`} alt="" className="w-8 h-8 rounded-full" />
                        <div>
                          <div className="font-semibold text-zinc-100 flex items-center gap-2">
                            {u.displayName || 'Unknown User'}
                            {u.suspended && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                                <ShieldAlert className="w-3 h-3" /> Suspended
                              </span>
                            )}
                          </div>
                          {u.username && (
                            <div className="text-xs text-zinc-400 font-mono font-medium mt-0.5">
                              @{u.username}
                            </div>
                          )}
                          <div className="text-[10px] text-zinc-500 mt-0.5 truncate max-w-[200px]">
                            {u.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <select
                          value={pendingPlans[u.id] !== undefined ? pendingPlans[u.id] : (u.plan || 'free')}
                          onChange={(e) => handleStagePlan(u.id, e.target.value)}
                          className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold uppercase tracking-wider border focus:outline-none cursor-pointer transition-all ${
                            pendingPlans[u.id] !== undefined ? 'border-amber-500 ring-2 ring-amber-500/30 font-bold bg-amber-50 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300' :
                            u.plan === 'pro' ? 'text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/30 bg-indigo-50 dark:bg-indigo-500/10 font-semibold' :
                            u.plan === 'super' ? 'text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-500/30 bg-purple-50 dark:bg-purple-500/10 font-bold' :
                            u.plan === 'recovery_pass' ? 'text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10' :
                            'text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900'
                          }`}
                        >
                          <option value="free" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Free</option>
                          <option value="recovery_pass" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Single Time</option>
                          <option value="pro" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Pro</option>
                          <option value="super" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-bold">Super</option>
                        </select>
                        {pendingPlans[u.id] !== undefined && (
                          <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 uppercase tracking-wider">Unsaved</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-xs font-semibold text-zinc-200">
                        {formatUserJoinedDate(u.createdAt || u.joinedAt)}
                      </div>
                      {formatRelativeJoined(u.createdAt || u.joinedAt) && (
                        <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
                          {formatRelativeJoined(u.createdAt || u.joinedAt)}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-zinc-300">
                      {formatBytes(getUserBytes(u))}
                    </td>
                    <td className="px-6 py-4 text-zinc-300">
                      {getUserFilesRestored(u, recoveries).toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${u.suspended ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${u.suspended ? 'bg-rose-500' : 'bg-emerald-500'}`}></span>
                        {u.suspended ? 'Suspended' : 'Active'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                      {u.plan === 'super' && (
                        <button
                          onClick={() => handleToggleSupportWithAds(u.id, !u.supportWithAds)}
                          className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-all cursor-pointer ${
                            u.supportWithAds 
                              ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30 dark:hover:bg-amber-500/25' 
                              : 'bg-zinc-100 text-zinc-700 border-zinc-300 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700 dark:hover:bg-zinc-700'
                          }`}
                        >
                          {u.supportWithAds ? 'Disable Ads' : 'Enable Ads'}
                        </button>
                      )}
                      <button
                        onClick={() => handleToggleSuspension(u.id, !u.suspended)}
                        className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-all cursor-pointer shadow-xs ${
                          u.suspended 
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30 dark:hover:bg-emerald-500/25' 
                            : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 hover:border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30 dark:hover:bg-rose-500/25'
                        }`}
                      >
                        {u.suspended ? 'Reactivate' : 'Suspend'}
                      </button>
                      <button
                        onClick={() => handleDeleteUser(u.id, u.email)}
                        className="text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 p-1.5 rounded-md hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors cursor-pointer"
                        title="Delete User Document"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <AdminPagination
          page={page}
          totalItems={filteredUsers.length}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      </div>

      {/* ─── USER DETAILS PANEL (SLIDE-OVER DRAWER) ─── */}
      {selectedUser && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-end"
          onClick={() => setSelectedUser(null)}
        >
          <div 
            className="w-full max-w-md bg-zinc-900 border-l border-zinc-800 h-full p-6 flex flex-col shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4 mb-6">
              <h2 className="text-lg font-bold text-white">User Details</h2>
              <button 
                onClick={() => setSelectedUser(null)} 
                className="text-zinc-400 hover:text-zinc-200 text-sm font-medium"
              >
                Close
              </button>
            </div>
            
            <div className="flex flex-col items-center text-center gap-4 mb-8">
              <img src={selectedUser.photoURL || `https://ui-avatars.com/api/?name=${selectedUser.displayName || 'U'}&background=random`} alt="" className="w-20 h-20 rounded-full border-2 border-zinc-800 shadow-xl" />
              <div>
                <h3 className="text-xl font-bold text-white">{selectedUser.displayName || 'Unknown User'}</h3>
                <p className="text-sm text-zinc-500">{selectedUser.email}</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-6 pr-2">
              <div>
                <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Account Metadata</div>
                <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">User ID</span>
                    <span className="text-zinc-200 font-mono text-xs select-all">{selectedUser.id}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">Current Plan</span>
                    <span className="font-semibold text-indigo-400 uppercase text-xs">{selectedUser.plan || 'free'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">Date Joined</span>
                    <span className="text-zinc-200 text-xs font-medium">
                      {formatUserJoinedDate(selectedUser.createdAt || selectedUser.joinedAt, true)}
                    </span>
                  </div>
                  {selectedUser.plan === 'recovery_pass' && (
                    <div className="flex justify-between text-sm border-t border-zinc-800 pt-2.5 mt-1">
                      <span className="text-zinc-400">Pass Expiration</span>
                      <span className="font-mono text-zinc-200 text-xs">
                        {selectedUser.expiresAt 
                          ? `${new Date(selectedUser.expiresAt).toLocaleString()} ${selectedUser.expiresAt < Date.now() ? '(Expired)' : ''}`
                          : 'No Expiration Set'}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">Status</span>
                    <span className={selectedUser.suspended ? 'text-red-400 font-semibold text-xs' : 'text-emerald-400 font-semibold text-xs'}>
                      {selectedUser.suspended ? 'SUSPENDED' : 'ACTIVE'}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Usage Statistics</div>
                <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">Storage Used (Current Plan)</span>
                    <span className="text-zinc-200 font-medium">{formatBytes(selectedUser.usedBytes || 0)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">Files Processed (Current Plan)</span>
                    <span className="text-zinc-200 font-medium">{selectedUser.usedFiles || 0}</span>
                  </div>
                  <div className="flex justify-between text-sm border-t border-zinc-800 pt-3">
                    <span className="text-zinc-400">Total Lifetime Bytes</span>
                    <span className="text-zinc-200 font-medium">{formatBytes(getUserBytes(selectedUser))}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">Total Lifetime Files</span>
                    <span className="text-zinc-200 font-medium">{getUserFiles(selectedUser).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Administrative Controls</div>
                <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 space-y-4">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5 font-medium uppercase tracking-wider">Change Subscription Plan</label>
                    <select
                      value={pendingPlans[selectedUser.id] !== undefined ? pendingPlans[selectedUser.id] : (selectedUser.plan || 'free')}
                      onChange={(e) => handleStagePlan(selectedUser.id, e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-md py-1.5 px-3 text-sm text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="free">Free</option>
                      <option value="recovery_pass">Single Time</option>
                      <option value="pro">Pro</option>
                      <option value="super">Super</option>
                    </select>
                  </div>
                  {selectedUser.plan === "super" && (
                    <div className="flex items-center justify-between border-t border-zinc-800 pt-3">
                      <div className="text-left">
                        <label className="block text-xs text-zinc-850 dark:text-zinc-200 font-bold uppercase tracking-wider">Support with Ads</label>
                        <span className="text-[10px] text-zinc-600 dark:text-zinc-400 block leading-tight font-medium">Show website ads to support developer</span>
                      </div>
                      <input 
                        type="checkbox"
                        checked={selectedUser.supportWithAds || false}
                        onChange={(e) => handleToggleSupportWithAds(selectedUser.id, e.target.checked)}
                        className="w-4 h-4 rounded border-zinc-800 bg-zinc-900 text-indigo-500 focus:ring-indigo-500 cursor-pointer"
                      />
                    </div>
                  )}
                  <div className="flex flex-col gap-3 pt-2">
                    <button
                      onClick={() => handleResetQuota(selectedUser.id)}
                      className="w-full py-2 rounded-md text-xs font-semibold border transition-all bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20"
                    >
                      ↺ Reset Usage Quota (usedBytes + usedFiles)
                    </button>
                    {selectedUser.plan === 'recovery_pass' && (
                      <div className="flex gap-2.5">
                        <button
                          onClick={async () => {
                            const base = Math.max(Date.now(), selectedUser.expiresAt || 0)
                            const newExp = base + 24 * 60 * 60 * 1000
                            try {
                              await updateDoc(doc(db, "users", selectedUser.id), { expiresAt: newExp })
                              const updatedUser = { ...selectedUser, expiresAt: newExp }
                              setSelectedUser(updatedUser)
                              setUsers(users.map(u => u.id === selectedUser.id ? updatedUser : u))
                              
                              await addDoc(collection(db, "admin_activity"), {
                                actorUid: adminData?.uid || "system",
                                actorName: adminData?.displayName || "Admin",
                                actorRole: role,
                                action: "EXTEND_RECOVERY_PASS",
                                target: selectedUser.id,
                                description: `Extended Recovery Pass for ${selectedUser.email || selectedUser.id} by 24 hours.`,
                                timestamp: Date.now()
                              })
                              alert("Recovery pass extended by 24 hours successfully.")
                            } catch (err) {
                              alert("Failed to extend recovery pass: " + err.message)
                            }
                          }}
                          className="flex-1 py-1.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/20 text-xs font-bold transition-all"
                        >
                          +24h Pass
                        </button>
                        <button
                          onClick={async () => {
                            if (!window.confirm("Expire user's Recovery Pass immediately?")) return
                            const newExp = Date.now() - 1000
                            try {
                              await updateDoc(doc(db, "users", selectedUser.id), { expiresAt: newExp })
                              const updatedUser = { ...selectedUser, expiresAt: newExp }
                              setSelectedUser(updatedUser)
                              setUsers(users.map(u => u.id === selectedUser.id ? updatedUser : u))
                              
                              await addDoc(collection(db, "admin_activity"), {
                                actorUid: adminData?.uid || "system",
                                actorName: adminData?.displayName || "Admin",
                                actorRole: role,
                                action: "EXPIRE_RECOVERY_PASS",
                                target: selectedUser.id,
                                description: `Expired Recovery Pass for ${selectedUser.email || selectedUser.id} immediately.`,
                                timestamp: Date.now()
                              })
                              alert("Recovery pass expired immediately.")
                            } catch (err) {
                              alert("Failed to expire recovery pass: " + err.message)
                            }
                          }}
                          className="flex-1 py-1.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 text-xs font-bold transition-all"
                        >
                          Expire Pass
                        </button>
                      </div>
                    )}
                    <Link to={`/admin/users/dashboard?uid=${selectedUser.id}`}>
                      <button className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-md transition-colors flex items-center justify-center gap-1.5 shadow-md shadow-indigo-500/10">
                        View Complete User Dashboard &rarr;
                      </button>
                    </Link>
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleToggleSuspension(selectedUser.id, !selectedUser.suspended)}
                        className={`flex-1 py-2 rounded-md text-xs font-semibold border transition-all ${
                          selectedUser.suspended 
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20' 
                            : 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20'
                        }`}
                      >
                        {selectedUser.suspended ? 'Reactivate Account' : 'Suspend Account'}
                      </button>
                      <button
                        onClick={() => { handleDeleteUser(selectedUser.id, selectedUser.email); setSelectedUser(null); }}
                        className="px-3 py-2 rounded-md bg-red-600 hover:bg-red-700 text-white transition-colors"
                        title="Delete Account Document"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
