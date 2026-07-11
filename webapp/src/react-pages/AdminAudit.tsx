import { useEffect, useState } from "react"
import { collection, query, orderBy, onSnapshot, limit } from "firebase/firestore"
import { db } from "../firebase"
import { ShieldAlert, Search, Download, Filter, FileText } from "lucide-react"

interface AuditLog {
  id: string;
  actorUid: string;
  actorName: string;
  actorRole: string;
  action: string;
  target?: string;
  description: string;
  timestamp: any;
}

const ACTION_BADGES: Record<string, string> = {
  ROLE_CHANGE: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  UPDATE_PLAN: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  SUSPEND: "bg-red-500/10 text-red-400 border-red-500/20",
  REACTIVATE: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  DELETE_USER: "bg-red-500/10 text-red-400 border-red-500/20",
  REFUND: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  TICKET_REPLY: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  SETTINGS_CHANGE: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  TOGGLE_SUPPORT_ADS: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
}

export default function AdminAudit() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filterAction, setFilterAction] = useState("all")

  useEffect(() => {
    const q = query(collection(db, "admin_activity"), orderBy("timestamp", "desc"), limit(150))
    const unsubscribe = onSnapshot(q, (snap) => {
      setLogs(snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      } as AuditLog)))
      setLoading(false)
    }, (err) => {
      console.error("Failed to sync audit logs:", err)
      setLoading(false)
    })
    return unsubscribe
  }, [])

  const filteredLogs = logs.filter(l => {
    if (filterAction !== "all" && l.action !== filterAction) return false
    if (search) {
      const s = search.toLowerCase()
      return (
        l.actorName?.toLowerCase().includes(s) ||
        l.description?.toLowerCase().includes(s) ||
        l.action?.toLowerCase().includes(s)
      )
    }
    return true
  })

  const exportCSV = () => {
    if (filteredLogs.length === 0) return
    const headers = ["Activity ID", "Date", "Actor", "Actor Role", "Action", "Target ID", "Description"]
    const rows = filteredLogs.map(l => {
      const date = l.timestamp?.seconds ? new Date(l.timestamp.seconds * 1000) : new Date(l.timestamp)
      return [
        l.id,
        date.toLocaleString(),
        l.actorName,
        l.actorRole,
        l.action,
        l.target || "",
        `"${l.description.replace(/"/g, '""')}"`
      ]
    })
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(e => e.join(","))].join("\n")
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", `takeoutfix-audit-log.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const formatLogTime = (ts: any) => {
    if (!ts) return "Unknown"
    const ms = ts.seconds ? ts.seconds * 1000 : ts
    return new Date(ms).toLocaleString()
  }

  return (
    <div className="space-y-8 font-sans text-zinc-100">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-indigo-400" /> Platform Audit Logs
          </h1>
          <p className="text-zinc-400 text-sm mt-1">Review activity logs, role change histories, refunds, and administrative overrides.</p>
        </div>

        <button
          onClick={exportCSV}
          disabled={filteredLogs.length === 0}
          className="bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 disabled:opacity-50 text-xs text-zinc-300 hover:text-white px-4 py-2 rounded-lg flex items-center gap-2 font-semibold transition-all cursor-pointer"
        >
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {/* FILTER PANEL */}
      <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl flex flex-col md:flex-row items-center gap-4 shadow-md">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search actor, action, or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 text-xs pl-9 pr-4 h-9 rounded-lg text-white focus:outline-none focus:border-indigo-500 transition-all focus:bg-zinc-950"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <Filter className="w-4 h-4 text-zinc-500" />
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 text-xs h-9 rounded-lg px-3 text-zinc-300 focus:outline-none cursor-pointer w-full md:w-44"
          >
            <option value="all">All Actions</option>
            <option value="ROLE_CHANGE">Role Change</option>
            <option value="UPDATE_PLAN">Update Plan</option>
            <option value="SUSPEND">Suspend User</option>
            <option value="REACTIVATE">Reactivate User</option>
            <option value="DELETE_USER">Delete User</option>
            <option value="REFUND">Refund Payment</option>
            <option value="TICKET_REPLY">Ticket Reply</option>
            <option value="SETTINGS_CHANGE">Settings Change</option>
          </select>
        </div>
      </div>

      {/* LOG TABLE */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-lg">
        <div className="w-full overflow-x-auto">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="bg-zinc-950/50 border-b border-zinc-800 text-zinc-400">
              <tr>
                <th className="px-6 py-3.5 font-semibold">Actor / Admin</th>
                <th className="px-6 py-3.5 font-semibold">Action Type</th>
                <th className="px-6 py-3.5 font-semibold">Description</th>
                <th className="px-6 py-3.5 font-semibold">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-zinc-500">Syncing audit database...</td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-zinc-500">
                    <FileText className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
                    No audit logs match your search criteria.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-zinc-800/10 transition-colors">
                    <td className="px-6 py-4">
                      <div>
                        <div className="font-semibold text-zinc-200">{log.actorName}</div>
                        <div className="text-[10px] text-zinc-500 uppercase tracking-wider mt-0.5">{log.actorRole.replace("_", " ")}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${
                        ACTION_BADGES[log.action] || "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
                      }`}>
                        {log.action.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-zinc-300 font-medium whitespace-normal max-w-xs leading-relaxed">
                      {log.description}
                    </td>
                    <td className="px-6 py-4 text-zinc-400 text-xs">
                      {formatLogTime(log.timestamp)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}
