import { useEffect, useState, useRef } from "react"
import {
  collection, onSnapshot, doc, deleteDoc, updateDoc,
  addDoc, serverTimestamp, query, where, getDocs, Timestamp
} from "firebase/firestore"
import { db } from "../firebase"
import { useAuth, type AdminData, type AdminRole } from "../contexts/AuthContext"
import {
  Users2, ShieldCheck, Trash2, Wifi, WifiOff,
  UserPlus, X, Mail, ChevronDown, Clock, RotateCcw,
  Send, Check, AlertCircle
} from "lucide-react"
import { useToastStore } from "../store/useToastStore"

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdminInvite {
  id: string
  email: string
  role: AdminRole
  invitedBy: string
  invitedByName: string
  createdAt: Timestamp | null
  status: 'pending' | 'accepted' | 'revoked'
  expiresAt: Timestamp | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ALL_ROLES: AdminRole[] = ['ADMIN', 'SUPPORT', 'MODERATOR', 'SUPER_ADMIN']

const ROLE_COLORS: Record<AdminRole, string> = {
  SUPER_ADMIN: "admin-role-super-admin px-1.5 py-0.5",
  ADMIN:       "admin-role-admin px-1.5 py-0.5",
  SUPPORT:     "admin-role-support px-1.5 py-0.5",
  MODERATOR:   "admin-role-moderator px-1.5 py-0.5",
}

const ROLE_DESCRIPTIONS: Record<AdminRole, string> = {
  SUPER_ADMIN: "Full access — manage team, settings, secrets",
  ADMIN:       "Access to users, tickets, revenue, statistics",
  SUPPORT:     "Access to tickets and user support tools only",
  MODERATOR:   "Access to reviews and content moderation only",
}

const STATUS_DOT: Record<string, string> = {
  online:  "bg-zinc-100 dark:bg-white border border-zinc-400 dark:border-transparent shadow-sm",
  idle:    "bg-zinc-450 dark:bg-zinc-500",
  offline: "bg-zinc-700 dark:bg-zinc-800",
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelative(ts: Timestamp | null): string {
  if (!ts) return "—"
  const ms = ts.toMillis()
  const diff = Date.now() - ms
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "Just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return new Date(ms).toLocaleDateString()
}

function isExpired(ts: Timestamp | null): boolean {
  if (!ts) return false
  return Date.now() > ts.toMillis()
}

// ─── Invite Modal ─────────────────────────────────────────────────────────────

interface InviteModalProps {
  onClose: () => void
  onSend: (email: string, role: AdminRole) => Promise<void>
  existingEmails: string[]
}

function InviteModal({ onClose, onSend, existingEmails }: InviteModalProps) {
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<AdminRole>("SUPPORT")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    const trimmed = email.trim().toLowerCase()
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Please enter a valid email address.")
      return
    }
    if (existingEmails.includes(trimmed)) {
      setError("This person is already an admin or has a pending invite.")
      return
    }
    setSending(true)
    try {
      await onSend(trimmed, role)
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send invite.")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-md shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-zinc-800/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
              <UserPlus className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Invite Team Member</h2>
              <p className="text-[11px] text-zinc-500 mt-0.5">Send a role-specific invitation</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {/* Email */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                ref={inputRef}
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError("") }}
                placeholder="colleague@example.com"
                className="w-full bg-zinc-900 border border-zinc-700 focus:border-indigo-500/60 focus:outline-none rounded-lg pl-9 pr-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 transition-colors"
              />
            </div>
          </div>

          {/* Role Selector */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Assign Role
            </label>
            <div className="grid grid-cols-2 gap-2">
              {ALL_ROLES.filter(r => r !== 'SUPER_ADMIN').map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`text-left p-3 rounded-xl border transition-all ${
                    role === r
                      ? 'border-indigo-500/50 bg-indigo-500/10'
                      : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-600'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    {role === r && <Check className="w-3 h-3 text-indigo-400 flex-shrink-0" />}
                    <span className={`text-xs font-bold uppercase tracking-wide ${role === r ? 'text-indigo-300' : 'text-zinc-300'}`}>
                      {r.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-500 leading-tight">{ROLE_DESCRIPTIONS[r]}</p>
                </button>
              ))}
            </div>
            {/* SUPER_ADMIN — separate high-risk row */}
            <button
              type="button"
              onClick={() => setRole('SUPER_ADMIN')}
              className={`w-full text-left p-3 rounded-xl border transition-all ${
                role === 'SUPER_ADMIN'
                  ? 'border-amber-500/40 bg-amber-500/5'
                  : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-600'
              }`}
            >
              <div className="flex items-center gap-1.5">
                {role === 'SUPER_ADMIN' && <Check className="w-3 h-3 text-amber-400 flex-shrink-0" />}
                <span className={`text-xs font-bold uppercase tracking-wide ${role === 'SUPER_ADMIN' ? 'text-amber-300' : 'text-zinc-300'}`}>
                  Super Admin
                </span>
                <span className="ml-auto text-[10px] text-amber-600 font-bold uppercase tracking-wide">High Risk</span>
              </div>
              <p className="text-[10px] text-zinc-500 leading-tight mt-1">{ROLE_DESCRIPTIONS['SUPER_ADMIN']}</p>
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-zinc-700 text-sm text-zinc-400 font-semibold hover:bg-zinc-800 hover:text-zinc-200 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={sending}
              className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm text-white font-bold transition-all flex items-center justify-center gap-2"
            >
              {sending ? (
                <><RotateCcw className="w-3.5 h-3.5 animate-spin" /> Sending...</>
              ) : (
                <><Send className="w-3.5 h-3.5" /> Send Invite</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Role Change Dropdown ─────────────────────────────────────────────────────

interface RoleDropdownProps {
  admin: AdminData
  currentUserUid: string
  onRoleChange: (admin: AdminData, newRole: AdminRole) => Promise<void>
}

function RoleDropdown({ admin, currentUserUid, onRoleChange }: RoleDropdownProps) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const isSelf = admin.uid === currentUserUid
  const isSuper = admin.role === "SUPER_ADMIN"

  if (isSelf || isSuper) {
    return (
      <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-bold uppercase border ${ROLE_COLORS[admin.role]}`}>
        {admin.role.replace("_", " ")}
      </span>
    )
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        disabled={saving}
        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-bold uppercase border transition-all ${ROLE_COLORS[admin.role]} hover:opacity-80`}
      >
        {saving && <RotateCcw className="w-2.5 h-2.5 animate-spin" />}
        {admin.role.replace("_", " ")}
        <ChevronDown className={`w-2.5 h-2.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full mt-1.5 left-0 z-20 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden w-44 py-1">
          {ALL_ROLES.filter(r => r !== 'SUPER_ADMIN').map(r => (
            <button
              key={r}
              onClick={async () => {
                setOpen(false)
                setSaving(true)
                await onRoleChange(admin, r)
                setSaving(false)
              }}
              className={`w-full text-left px-3 py-2 text-xs font-bold uppercase tracking-wide transition-colors hover:bg-zinc-800 ${r === admin.role ? 'text-indigo-400 bg-indigo-500/5' : 'text-zinc-300'}`}
            >
              {r.replace("_", " ")}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminTeam() {
  const { adminData, user } = useAuth()
  const [admins, setAdmins] = useState<AdminData[]>([])
  const [invites, setInvites] = useState<AdminInvite[]>([])
  const [loadingAdmins, setLoadingAdmins] = useState(true)
  const [loadingInvites, setLoadingInvites] = useState(true)
  const [showInviteModal, setShowInviteModal] = useState(false)

  const isSuperAdmin = adminData?.role === "SUPER_ADMIN"
  const addToast = useToastStore.getState().addToast

  // ── Realtime listeners ────────────────────────────────────────────────────

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "admins"), (snap) => {
      setAdmins(snap.docs.map(d => d.data() as AdminData))
      setLoadingAdmins(false)
    }, (err) => {
      console.error("Admins listener error:", err)
      setLoadingAdmins(false)
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    if (!isSuperAdmin) return
    const q = query(collection(db, "adminInvites"), where("status", "==", "pending"))
    const unsub = onSnapshot(q, (snap) => {
      setInvites(snap.docs.map(d => ({ id: d.id, ...d.data() } as AdminInvite)))
      setLoadingInvites(false)
    }, (err) => {
      console.error("Invites listener error:", err)
      setLoadingInvites(false)
    })
    return () => unsub()
  }, [isSuperAdmin])

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleRemove = async (admin: AdminData) => {
    if (admin.uid === user?.uid) {
      addToast("You cannot remove yourself.", "error"); return
    }
    if (admin.role === "SUPER_ADMIN") {
      addToast("You cannot remove a Super Admin.", "error"); return
    }
    if (!confirm(`Remove ${admin.displayName} from the admin team?`)) return
    try {
      await deleteDoc(doc(db, "admins", admin.uid))
      await updateDoc(doc(db, "users", admin.uid), { isAdmin: false })
      addToast(`${admin.displayName} removed from the team.`, "success")
    } catch (e) {
      console.error(e)
      addToast("Failed to remove admin.", "error")
    }
  }

  const handleRoleChange = async (admin: AdminData, newRole: AdminRole) => {
    try {
      await updateDoc(doc(db, "admins", admin.uid), { role: newRole })
      addToast(`${admin.displayName}'s role updated to ${newRole.replace("_", " ")}.`, "success")
    } catch (e) {
      console.error(e)
      addToast("Failed to update role.", "error")
    }
  }

  const handleSendInvite = async (email: string, role: AdminRole) => {
    const existing = await getDocs(
      query(collection(db, "adminInvites"), where("email", "==", email), where("status", "==", "pending"))
    )
    if (!existing.empty) throw new Error("A pending invite already exists for this email.")

    const expiresAt = Timestamp.fromMillis(Date.now() + 72 * 60 * 60 * 1000)
    await addDoc(collection(db, "adminInvites"), {
      email,
      role,
      invitedBy: user?.uid ?? "unknown",
      invitedByName: user?.displayName ?? adminData?.displayName ?? "Admin",
      createdAt: serverTimestamp(),
      expiresAt,
      status: "pending",
    })
    addToast(`Invite sent to ${email} as ${role.replace("_", " ")}.`, "success")
  }

  const handleRevokeInvite = async (invite: AdminInvite) => {
    if (!confirm(`Revoke invite for ${invite.email}?`)) return
    try {
      await updateDoc(doc(db, "adminInvites", invite.id), { status: "revoked" })
      addToast(`Invite for ${invite.email} revoked.`, "success")
    } catch (e) {
      console.error(e)
      addToast("Failed to revoke invite.", "error")
    }
  }

  const blockedEmails = [
    ...admins.map(a => a.email.toLowerCase()),
    ...invites.map(i => i.email.toLowerCase()),
  ]

  const pendingInvites = invites.filter(i => !isExpired(i.expiresAt))
  const expiredInvites = invites.filter(i => isExpired(i.expiresAt))

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <Users2 className="w-6 h-6 text-zinc-400" /> Admin Team
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Manage admin accounts, roles, and send role-specific invitations.
          </p>
        </div>
        {isSuperAdmin && (
          <button
            onClick={() => setShowInviteModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition-all shadow-lg shadow-indigo-500/10 whitespace-nowrap"
          >
            <UserPlus className="w-4 h-4" />
            Invite Member
          </button>
        )}
      </div>

      {/* ── Active Admins Table ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Active Team</h2>
          <span className="text-xs text-zinc-600">({admins.length})</span>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="w-full overflow-x-auto">
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
                {loadingAdmins ? (
                  <tr>
                    <td colSpan={isSuperAdmin ? 5 : 4} className="px-6 py-8 text-center text-zinc-500">
                      <RotateCcw className="w-4 h-4 animate-spin inline mr-2" /> Loading team...
                    </td>
                  </tr>
                ) : admins.length === 0 ? (
                  <tr>
                    <td colSpan={isSuperAdmin ? 5 : 4} className="px-6 py-8 text-center text-zinc-500">
                      No admin accounts found.
                    </td>
                  </tr>
                ) : (
                  admins.map((a) => (
                    <tr key={a.uid} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="relative flex-shrink-0">
                            {a.photoURL ? (
                              <img src={a.photoURL} alt="" className="w-9 h-9 rounded-full" />
                            ) : (
                              <div className="w-9 h-9 rounded-full bg-zinc-900 dark:bg-zinc-200 flex items-center justify-center font-bold text-zinc-100 dark:text-zinc-800 border border-zinc-800 dark:border-zinc-300">
                                {a.displayName?.charAt(0) || "A"}
                              </div>
                            )}
                            <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-zinc-900 ${STATUS_DOT[a.status] || "bg-zinc-600"}`} />
                          </div>
                          <div>
                            <div className="font-medium text-zinc-100 flex items-center gap-2">
                              {a.displayName}
                              {a.uid === user?.uid && (
                                <span className="text-[10px] you-badge px-1.5 py-0.5 rounded">You</span>
                              )}
                            </div>
                            <div className="text-xs text-zinc-500">{a.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {isSuperAdmin ? (
                          <RoleDropdown
                            admin={a}
                            currentUserUid={user?.uid ?? ""}
                            onRoleChange={handleRoleChange}
                          />
                        ) : (
                          <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-bold uppercase border ${ROLE_COLORS[a.role]}`}>
                            {a.role.replace("_", " ")}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {a.status === "offline" ? (
                            <WifiOff className="w-3.5 h-3.5 text-zinc-650" />
                          ) : (
                            <Wifi className={`w-3.5 h-3.5 ${a.status === "online" ? "text-zinc-200 dark:text-zinc-100" : "text-zinc-450"}`} />
                          )}
                          <span className={`text-xs capitalize ${a.status === "online" ? "text-zinc-200 dark:text-zinc-100 font-bold" : a.status === "idle" ? "text-zinc-450" : "text-zinc-650"}`}>
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
                              className="text-zinc-500 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-red-500/10"
                              title="Remove from team"
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
        </div>
      </div>

      {/* ── Pending Invitations (SUPER_ADMIN only) ── */}
      {isSuperAdmin && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-3.5 h-3.5 text-zinc-500" />
            <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Pending Invitations</h2>
            {pendingInvites.length > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-400 border border-indigo-500/20">
                {pendingInvites.length}
              </span>
            )}
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            {loadingInvites ? (
              <div className="px-6 py-8 text-center text-zinc-500 text-sm">
                <RotateCcw className="w-4 h-4 animate-spin inline mr-2" /> Loading invitations...
              </div>
            ) : pendingInvites.length === 0 ? (
              <div className="px-6 py-8 text-center">
                <div className="w-10 h-10 rounded-full bg-zinc-800/60 border border-zinc-700/40 flex items-center justify-center mx-auto mb-3">
                  <Mail className="w-4 h-4 text-zinc-500" />
                </div>
                <p className="text-zinc-500 text-sm font-medium">No pending invitations</p>
                <p className="text-zinc-600 text-xs mt-1">Click "Invite Member" to send a role-specific invite.</p>
              </div>
            ) : (
              <div className="w-full overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-zinc-950/50 border-b border-zinc-800 text-zinc-400">
                    <tr>
                      <th className="px-6 py-3 font-medium">Email</th>
                      <th className="px-6 py-3 font-medium">Role</th>
                      <th className="px-6 py-3 font-medium">Invited By</th>
                      <th className="px-6 py-3 font-medium">Sent</th>
                      <th className="px-6 py-3 font-medium">Expires</th>
                      <th className="px-6 py-3 font-medium text-right">Revoke</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {pendingInvites.map((inv) => (
                      <tr key={inv.id} className="hover:bg-zinc-800/30 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
                              <Mail className="w-3.5 h-3.5 text-indigo-400" />
                            </div>
                            <span className="text-zinc-200 font-medium">{inv.email}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-bold uppercase border ${ROLE_COLORS[inv.role]}`}>
                            {inv.role.replace("_", " ")}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-zinc-400 text-xs">{inv.invitedByName}</td>
                        <td className="px-6 py-4 text-zinc-500 text-xs">{formatRelative(inv.createdAt)}</td>
                        <td className="px-6 py-4 text-xs">
                          {inv.expiresAt ? (
                            <span className="text-amber-500/80">
                              {new Date(inv.expiresAt.toMillis()).toLocaleDateString()}&nbsp;
                              ({Math.max(0, Math.ceil((inv.expiresAt.toMillis() - Date.now()) / 3600000))}h left)
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => handleRevokeInvite(inv)}
                            className="text-zinc-500 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-red-500/10"
                            title="Revoke invite"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {expiredInvites.length > 0 && (
            <p className="text-xs text-zinc-600 mt-2 flex items-center gap-1.5">
              <AlertCircle className="w-3 h-3" />
              {expiredInvites.length} expired invite{expiredInvites.length > 1 ? 's' : ''} hidden — these can be safely ignored or cleaned up in Firestore.
            </p>
          )}
        </div>
      )}

      {/* ── Info Footer ── */}
      <div className="bg-zinc-900/20 border border-zinc-800/80 rounded-xl p-4 flex items-start gap-3">
        <ShieldCheck className="w-4 h-4 text-zinc-400 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-zinc-400">
          Role changes and invitations take effect immediately. SUPER_ADMIN is the only role that can manage invitations or remove admins.
          Invites are valid for <strong className="text-zinc-300">72 hours</strong>. When an invited user signs in with the matching Google account email, they are automatically provisioned into the admin team.
          All actions are recorded in Audit Logs.
        </p>
      </div>

      {/* ── Invite Modal ── */}
      {showInviteModal && (
        <InviteModal
          onClose={() => setShowInviteModal(false)}
          onSend={handleSendInvite}
          existingEmails={blockedEmails}
        />
      )}
    </div>
  )
}
