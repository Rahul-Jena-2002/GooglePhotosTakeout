import { useEffect, useState } from "react"
import { collection, query, onSnapshot, doc, updateDoc, deleteDoc, addDoc } from "firebase/firestore"
import { db } from "../firebase"
import { Search, Trash2, ShieldAlert } from "lucide-react"
import { useAuth } from "../contexts/AuthContext"
import { Link } from "react-router-dom"

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

const getUserFilesRestored = (u: any, recoveries: any[]) => {
  const userRecoveries = recoveries.filter(r => r.uid === u.id)
  if (userRecoveries.length > 0) {
    return userRecoveries.reduce((sum, r) => sum + (r.matched || 0), 0)
  }
  const recorded = Math.max(u.usedFiles || 0, u.totalFilesProcessed || 0, u.lifetimeFiles || 0);
  if (recorded > 0) return recorded;

  // Heuristic fallback for legacy accounts missing files count (1.2 MB average file size)
  const bytes = Math.max(u.usedBytes || 0, u.totalBytesProcessed || 0, u.lifetimeBytes || 0);
  if (bytes > 0) {
    return Math.round(bytes / (1.2 * 1024 * 1024));
  }
  return 0;
}

export default function AdminUsers() {
  const [users, setUsers] = useState<any[]>([])
  const [recoveries, setRecoveries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState("all")
  const [search, setSearch] = useState("")
  const [selectedUser, setSelectedUser] = useState<any | null>(null)

  const { adminData } = useAuth()
  const role = adminData?.role || "ADMIN"

  const handleUpdatePlan = async (userId: string, newPlan: string) => {
    try {
      await updateDoc(doc(db, "users", userId), { 
        plan: newPlan,
        usedBytes: 0,
        usedFiles: 0
      })
      
      const userDoc = users.find(u => u.id === userId)
      const updatedUserDoc = { ...userDoc, plan: newPlan, usedBytes: 0, usedFiles: 0 }
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
      alert("Failed to update user plan. Make sure you have SUPER_ADMIN or ADMIN permissions.")
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
    } catch (err: any) {
      console.error(err)
      alert("Failed to delete user: " + err.message)
    }
  }

  useEffect(() => {
    const q = query(collection(db, "users"))
    const unsubscribe = onSnapshot(q, (snap) => {
      const userList = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      // Sort in-memory safely (handles missing usedBytes and different schemas)
      userList.sort((a: any, b: any) => getUserBytes(b) - getUserBytes(a))
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
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-zinc-950/50 border-b border-zinc-800 text-zinc-400">
            <tr>
              <th className="px-6 py-3 font-medium">User</th>
              <th className="px-6 py-3 font-medium">Plan</th>
              <th className="px-6 py-3 font-medium">Processed</th>
              <th className="px-6 py-3 font-medium">Files Restored</th>
              <th className="px-6 py-3 font-medium">Status</th>
              <th className="px-6 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-zinc-500">Loading users...</td>
              </tr>
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-zinc-500">No users found matching criteria.</td>
              </tr>
            ) : (
              filteredUsers.map((u) => (
                <tr 
                  key={u.id} 
                  className="hover:bg-zinc-800/50 cursor-pointer transition-colors"
                  onClick={() => setSelectedUser(u)}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <img src={u.photoURL || `https://ui-avatars.com/api/?name=${u.displayName || 'U'}&background=random`} alt="" className="w-8 h-8 rounded-full" />
                      <div>
                        <div className="font-medium text-zinc-100 flex items-center gap-2">
                          {u.displayName || 'Unknown User'}
                          {u.suspended && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                              <ShieldAlert className="w-3 h-3" /> Suspended
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-zinc-500">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                    <select
                      value={u.plan || 'free'}
                      onChange={(e) => handleUpdatePlan(u.id, e.target.value)}
                      className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold uppercase tracking-wider bg-zinc-950 border border-zinc-800 text-zinc-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer ${
                        u.plan === 'pro' ? 'text-indigo-400 border-indigo-500/20 bg-indigo-500/5' :
                        u.plan === 'super' ? 'text-amber-400 border-amber-500/20 bg-amber-500/5' :
                        u.plan === 'recovery_pass' ? 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5' :
                        'text-zinc-400 border-zinc-700 bg-zinc-850'
                      }`}
                    >
                      <option value="free" className="bg-zinc-900 text-zinc-400">Free</option>
                      <option value="recovery_pass" className="bg-zinc-900 text-emerald-400">Single Time</option>
                      <option value="pro" className="bg-zinc-900 text-indigo-400">Pro</option>
                      <option value="super" className="bg-zinc-900 text-amber-400">Super</option>
                    </select>
                  </td>
                  <td className="px-6 py-4 text-zinc-300">
                    {formatBytes(getUserBytes(u))}
                  </td>
                  <td className="px-6 py-4 text-zinc-300">
                    {getUserFilesRestored(u, recoveries).toLocaleString()}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${u.suspended ? 'text-red-400' : 'text-emerald-400'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${u.suspended ? 'bg-red-400' : 'bg-emerald-400'}`}></span>
                      {u.suspended ? 'Suspended' : 'Active'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleToggleSuspension(u.id, !u.suspended)}
                      className={`px-2.5 py-1 rounded text-xs font-semibold border transition-colors ${
                        u.suspended 
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20' 
                          : 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20'
                      }`}
                    >
                      {u.suspended ? 'Reactivate' : 'Suspend'}
                    </button>
                    <button
                      onClick={() => handleDeleteUser(u.id, u.email)}
                      className="text-zinc-500 hover:text-red-400 p-1.5 rounded hover:bg-zinc-800 transition-colors"
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
                    <span className="text-zinc-200 font-medium">{Math.max(selectedUser.totalFilesProcessed || 0, selectedUser.usedFiles || 0)}</span>
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Administrative Controls</div>
                <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 space-y-4">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5 font-medium uppercase tracking-wider">Change Subscription Plan</label>
                    <select
                      value={selectedUser.plan || 'free'}
                      onChange={(e) => handleUpdatePlan(selectedUser.id, e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-md py-1.5 px-3 text-sm text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="free">Free</option>
                      <option value="recovery_pass">Single Time</option>
                      <option value="pro">Pro</option>
                      <option value="super">Super</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-3 pt-2">
                    <Link to={`/admin/users/dashboard/${selectedUser.id}`}>
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
