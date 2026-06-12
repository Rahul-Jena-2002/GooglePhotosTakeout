import { useEffect, useState } from "react"
import { collection, onSnapshot, doc, updateDoc, deleteDoc, setDoc, serverTimestamp } from "firebase/firestore"
import { db } from "../firebase"
import { useAuth, type AdminData, type AdminRole } from "../contexts/AuthContext"
import { Navigate } from "react-router-dom"
import { Users2, ShieldCheck, Trash2, Plus, Wifi, WifiOff } from "lucide-react"

const ROLES: AdminRole[] = ["SUPER_ADMIN", "ADMIN", "SUPPORT", "MODERATOR"]

const ROLE_COLORS: Record<AdminRole, string> = {
  SUPER_ADMIN: "text-amber-400 bg-amber-400/10 border-amber-400/20",
  ADMIN: "text-indigo-400 bg-indigo-400/10 border-indigo-400/20",
  SUPPORT: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  MODERATOR: "text-purple-400 bg-purple-400/10 border-purple-400/20",
}

const STATUS_DOT: Record<string, string> = {
  online: "bg-emerald-400",
  idle: "bg-amber-400",
  offline: "bg-zinc-600",
}

export default function AdminTeam() {
  const { adminData, user } = useAuth()
  const [admins, setAdmins] = useState<AdminData[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<AdminRole>("SUPPORT")
  const [inviting, setInviting] = useState(false)

  const isSuperAdmin = adminData?.role === "SUPER_ADMIN"

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "admins"), (snap) => {
      setAdmins(snap.docs.map(d => d.data() as AdminData))
      setLoading(false)
    })
    return () => unsub()
  }, [])

  const handleRoleChange = async (uid: string, newRole: AdminRole) => {
    if (uid === user?.uid) {
      alert("You cannot change your own role.")
      return
    }
    const targetAdmin = admins.find(a => a.uid === uid)
    if (targetAdmin?.role === "SUPER_ADMIN") {
      alert("You cannot modify a Super Admin's role.")
      return
    }
    if (newRole === "SUPER_ADMIN") {
      alert("There can only be one Super Admin.")
      return
    }
    try {
      await updateDoc(doc(db, "admins", uid), { role: newRole })
      // Log activity
      await setDoc(doc(collection(db, "admin_activity")), {
        actorUid: user?.uid,
        actorName: adminData?.displayName,
        actorRole: adminData?.role,
        action: "ROLE_CHANGE",
        target: uid,
        description: `${adminData?.displayName} changed admin role to ${newRole}`,
        timestamp: serverTimestamp(),
      })
    } catch (e) { console.error(e) }
  }

  const handleRemove = async (admin: AdminData) => {
    if (admin.uid === user?.uid) { alert("You cannot remove yourself."); return }
    if (admin.role === "SUPER_ADMIN") {
      alert("You cannot remove a Super Admin from the team.")
      return
    }
    if (!confirm(`Remove ${admin.displayName} from the admin team?`)) return
    try {
      await deleteDoc(doc(db, "admins", admin.uid))
      // Also update their user record
      await updateDoc(doc(db, "users", admin.uid), { isAdmin: false })
    } catch (e) { console.error(e) }
  }

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return
    setInviting(true)
    try {
      // Create a pending admin record by email — they'll get SUPER_ADMIN bootstrap on next login
      // For now, create a placeholder that will be filled on their first admin login
      const placeholderId = `pending_${Date.now()}`
      await setDoc(doc(db, "admins", placeholderId), {
        uid: placeholderId,
        email: inviteEmail.trim(),
        displayName: inviteEmail.split("@")[0],
        photoURL: null,
        role: inviteRole,
        status: "offline",
        lastSeen: Date.now(),
        createdAt: Date.now(),
        pending: true,
        createdBy: user?.uid,
      })
      setInviteEmail("")
      alert(`Invite placeholder created for ${inviteEmail}. They'll get ${inviteRole} access on next login.`)
    } catch (e) {
      console.error(e)
      alert("Failed to invite admin. Check Firestore permissions.")
    } finally {
      setInviting(false)
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <Users2 className="w-6 h-6 text-indigo-400" /> Admin Team
          </h1>
          <p className="text-zinc-400 text-sm mt-1">Manage admin accounts, roles, and online presence.</p>
        </div>

        {/* Invite form */}
        {isSuperAdmin && (
          <div className="flex items-center gap-2">
            <input
              type="email"
              placeholder="Email to invite..."
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 rounded-md py-2 px-3 text-sm text-white focus:outline-none focus:border-indigo-500 w-56"
            />
            <select
              value={inviteRole}
              onChange={e => setInviteRole(e.target.value as AdminRole)}
              className="bg-zinc-900 border border-zinc-800 rounded-md py-2 px-3 text-sm text-white focus:outline-none focus:border-indigo-500"
            >
              {ROLES.filter(r => r !== "SUPER_ADMIN").map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <button
              onClick={handleInvite}
              disabled={inviting || !inviteEmail.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 btn-admin-invite text-white px-4 py-2 rounded-md flex items-center gap-2 text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" /> Invite
            </button>
          </div>
        )}
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-950/50 border-b border-zinc-800 text-zinc-400">
            <tr>
              <th className="px-6 py-3 font-medium">Admin</th>
              <th className="px-6 py-3 font-medium">Role</th>
              <th className="px-6 py-3 font-medium">Status</th>
              <th className="px-6 py-3 font-medium">Last Seen</th>
              {isSuperAdmin && <th className="px-6 py-3 font-medium text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {loading ? (
              <tr><td colSpan={isSuperAdmin ? 5 : 4} className="px-6 py-8 text-center text-zinc-500">Loading team...</td></tr>
            ) : admins.length === 0 ? (
              <tr><td colSpan={isSuperAdmin ? 5 : 4} className="px-6 py-8 text-center text-zinc-500">No admin accounts found.</td></tr>
            ) : (
              admins.map((a) => (
                <tr key={a.uid} className="hover:bg-zinc-800/40 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="relative flex-shrink-0">
                        {a.photoURL ? (
                          <img src={a.photoURL} alt="" className="w-9 h-9 rounded-full" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-indigo-500/20 flex items-center justify-center font-bold text-indigo-400">
                            {a.displayName?.charAt(0) || "A"}
                          </div>
                        )}
                        <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-zinc-900 ${STATUS_DOT[a.status] || "bg-zinc-600"}`} />
                      </div>
                      <div>
                        <div className="font-medium text-zinc-100 flex items-center gap-2">
                          {a.displayName}
                          {a.uid === user?.uid && <span className="text-[10px] you-badge px-1.5 py-0.5 rounded">You</span>}
                        </div>
                        <div className="text-xs text-zinc-500">{a.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {!isSuperAdmin || a.role === "SUPER_ADMIN" || a.uid === user?.uid ? (
                      <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-bold uppercase border ${ROLE_COLORS[a.role]}`}>
                        {a.role.replace("_", " ")}
                      </span>
                    ) : (
                      <select
                        value={a.role}
                        onChange={e => handleRoleChange(a.uid, e.target.value as AdminRole)}
                        className={`text-xs font-bold uppercase border rounded-md px-2 py-1 bg-transparent focus:outline-none cursor-pointer ${ROLE_COLORS[a.role]}`}
                      >
                        {ROLES.filter(r => r !== "SUPER_ADMIN").map(r => <option key={r} value={r} className="bg-zinc-900 text-white">{r.replace("_", " ")}</option>)}
                      </select>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {a.status === "offline" ? (
                        <WifiOff className="w-3.5 h-3.5 text-zinc-600" />
                      ) : (
                        <Wifi className={`w-3.5 h-3.5 ${a.status === "online" ? "text-emerald-400" : "text-amber-400"}`} />
                      )}
                      <span className={`text-xs capitalize ${a.status === "online" ? "text-emerald-400" : a.status === "idle" ? "text-amber-400" : "text-zinc-600"}`}>
                        {a.status}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-zinc-500 text-xs">
                    {a.lastSeen ? new Date(a.lastSeen).toLocaleString() : "Never"}
                  </td>
                  {isSuperAdmin && (
                    <td className="px-6 py-4 text-right">
                      {a.uid !== user?.uid && a.role !== "SUPER_ADMIN" && (
                        <button
                          onClick={() => handleRemove(a)}
                          className="text-zinc-500 hover:text-red-400 transition-colors p-1.5 rounded hover:bg-red-500/10"
                          title="Remove from admin team"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-4 flex items-start gap-3">
        <ShieldCheck className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-amber-200/70">
          Role changes take effect immediately. SUPER_ADMIN is the only role that can access Settings, create or remove admins. All actions are recorded in Audit Logs.
        </p>
      </div>
    </div>
  )
}
