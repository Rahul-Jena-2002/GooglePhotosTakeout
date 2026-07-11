import { useEffect, useState } from "react"
import { collection, query, orderBy, onSnapshot, doc, updateDoc, setDoc, addDoc } from "firebase/firestore"
import { db } from "../firebase"
import { useAuth } from "../contexts/AuthContext"
import { Search, RotateCcw, Download, Eye, MoreVertical, Sliders, FileSpreadsheet, ChevronLeft, ChevronRight, Copy, CheckCircle2 } from "lucide-react"
import { useToastStore } from "../store/useToastStore"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "../components/ui/dropdown-menu"

interface Transaction {
  id: string;
  txId: string;
  uid: string;
  email: string;
  displayName: string;
  plan: string;
  amount: number;
  status: "succeeded" | "refunded" | "failed" | "cancelled" | "processing";
  timestamp: number;
  paymentMethod: string;
  approvedByAdmin?: string;
}

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  recovery_pass: "Single Time",
  pro: "Pro",
  super: "Super",
}

export default function AdminTransactions() {
  const { adminData } = useAuth()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filterType, setFilterType] = useState<"all" | "commercial" | "pro" | "super" | "single" | "admin" | "refunded" | "processing">("all")
  const [activeGateway, setActiveGateway] = useState("dodo")

  // Pagination states
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [currentPage, setCurrentPage] = useState(1)

  const role = adminData?.role || "ADMIN"
  const isSuperAdminOrAdmin = ["SUPER_ADMIN", "ADMIN"].includes(role)

  useEffect(() => {
    // 1. Listen to real-time transactions
    const txQuery = query(collection(db, "transactions"), orderBy("timestamp", "desc"))
    const unsubTx = onSnapshot(txQuery, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction))
      setTransactions(docs)
      setLoading(false)
    }, (err) => {
      console.error(err)
      setLoading(false)
    })

    // 2. Fetch active gateway
    const unsubGlobal = onSnapshot(doc(db, "settings", "global"), (snap) => {
      if (snap.exists()) {
        setActiveGateway(snap.data().active_gateway || "dodo")
      }
    })

    return () => {
      unsubTx()
      unsubGlobal()
    }
  }, [])

  const handleRefund = async (tx: Transaction) => {
    if (!isSuperAdminOrAdmin) {
      useToastStore.getState().addToast("Unauthorized: Only Admins or Super Admins can refund transactions.", "error")
      return
    }

    const reason = window.prompt(`Enter refund reason for transaction ${tx.txId}:`, "User request")
    if (reason === null) return // Cancelled prompt
    
    const pctStr = window.prompt(`Enter refund percentage (10-100%):`, "100")
    if (pctStr === null) return
    const pct = parseInt(pctStr) || 100
    
    if (pct < 10 || pct > 100) {
      alert("Invalid percentage. Must be between 10 and 100.")
      return
    }

    try {
      // 1. Update transaction status
      await updateDoc(doc(db, "transactions", tx.id), {
        status: "refunded",
        refundReason: reason,
        refundAmount: tx.amount * pct / 100,
        refundedAt: Date.now()
      })

      // 2. Downgrade user plan to free and reset bytes
      await setDoc(doc(db, "users", tx.uid), {
        plan: "free",
        usedBytes: 0,
        usedFiles: 0,
        expiresAt: null
      }, { merge: true })

      // 3. Log Admin Activity
      await addDoc(collection(db, "admin_activity"), {
        actorUid: adminData?.uid || "system",
        actorName: adminData?.displayName || "Admin",
        actorRole: role,
        action: "REFUND",
        target: tx.uid,
        description: `Refunded ${pct}% (₹${(tx.amount * pct / 100).toFixed(2)}) for transaction ${tx.txId}. Reason: ${reason}`,
        timestamp: Date.now()
      })

      useToastStore.getState().addToast(`Transaction refunded successfully.`, "success")
    } catch (err: any) {
      console.error(err)
      useToastStore.getState().addToast("Failed to refund transaction: " + err.message, "error")
    }
  }

  // Filter transactions by search text and filter type
  const filteredTransactions = transactions.filter(t => {
    // 1. Search filter
    if (search) {
      const s = search.toLowerCase()
      const matchesSearch = (
        t.email?.toLowerCase().includes(s) ||
        t.displayName?.toLowerCase().includes(s) ||
        t.txId?.toLowerCase().includes(s) ||
        t.plan?.toLowerCase().includes(s)
      )
      if (!matchesSearch) return false
    }

    // 2. Type filter
    const isAdminGrant = t.approvedByAdmin != null || t.paymentMethod === "Admin Grant" || t.amount === 0;
    
    if (filterType === "admin") {
      return isAdminGrant;
    } else if (filterType === "commercial") {
      return !isAdminGrant;
    } else if (filterType === "pro") {
      return !isAdminGrant && t.plan === "pro";
    } else if (filterType === "super") {
      return !isAdminGrant && t.plan === "super";
    } else if (filterType === "single") {
      return !isAdminGrant && t.plan === "recovery_pass";
    } else if (filterType === "refunded") {
      return t.status === "refunded";
    } else if (filterType === "processing") {
      return t.status === "processing";
    }

    return true; // "all"
  })

  // Pagination calculations
  const totalCount = filteredTransactions.length
  const totalPages = Math.ceil(totalCount / rowsPerPage)
  const startIndex = (currentPage - 1) * rowsPerPage
  const endIndex = Math.min(startIndex + rowsPerPage, totalCount)
  const paginatedTransactions = filteredTransactions.slice(startIndex, endIndex)

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page)
    }
  }

  // Export current list to CSV
  const exportToCSV = () => {
    const headers = ["Transaction ID", "User Name", "Email", "Plan", "Amount", "Currency", "Date", "Status", "Method"]
    const rows = filteredTransactions.map(tx => [
      tx.txId,
      tx.displayName,
      tx.email,
      PLAN_LABELS[tx.plan] || tx.plan,
      tx.amount,
      tx.amount === 0 ? "" : "INR",
      new Date(tx.timestamp).toISOString(),
      tx.status,
      tx.paymentMethod || (tx.approvedByAdmin ? "Admin Grant" : "Gateway")
    ])

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(e => e.map(val => `"${val}"`).join(","))].join("\n");
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `TakeoutFix_Transactions_Export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const gatewayLabel = 
    activeGateway === "dodo" ? "Dodo Payments" : 
    activeGateway === "lemonsqueezy" ? "Lemon Squeezy" : 
    activeGateway === "paddle" ? "Paddle" : 
    "Stripe"

  // KPI stats from filters
  const commercialTx = transactions.filter(t => !(t.approvedByAdmin != null || t.paymentMethod === "Admin Grant" || t.amount === 0))
  const succeededCount = commercialTx.filter(t => t.status === "succeeded").length
  const failedOrCancelledCount = commercialTx.filter(t => t.status === "failed" || t.status === "cancelled").length

  return (
    <div className="space-y-8 font-sans text-zinc-100 pb-12">
      {/* Header section matching premium dashboard visuals */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">{gatewayLabel} Transactions Log</h2>
          <p className="text-zinc-500 text-xs mt-1">Real-time payment registry matching your active checkout gateway configuration.</p>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={exportToCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white transition-all text-xs font-semibold focus:outline-none"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" /> Export CSV
          </button>
        </div>
      </div>

      {/* KPI Cards matching Dodo Payments Products catalog UI */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div className="text-zinc-500 text-xs font-bold uppercase tracking-wider">All Payments</div>
          <div className="text-4xl font-extrabold text-white mt-4">{transactions.length}</div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div className="text-zinc-500 text-xs font-bold uppercase tracking-wider">Successful Commercial</div>
          <div className="text-4xl font-extrabold text-emerald-400 mt-4">{succeededCount}</div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div className="text-zinc-500 text-xs font-bold uppercase tracking-wider">Failed / Cancelled</div>
          <div className="text-4xl font-extrabold text-zinc-400 mt-4">{failedOrCancelledCount}</div>
        </div>
      </div>

      {/* Table section */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-lg">
        <div className="px-6 py-5 border-b border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-white">Registry listing</h3>
            <p className="text-zinc-500 text-[11px] mt-0.5">Showing records {totalCount > 0 ? startIndex + 1 : 0} - {endIndex} of {totalCount}</p>
          </div>
          
          <div className="flex items-center gap-3">
            <select
              value={filterType}
              onChange={(e) => {
                setFilterType(e.target.value as any)
                setCurrentPage(1)
              }}
              className="bg-zinc-950 border border-zinc-850 rounded-md py-1.5 px-3 text-xs text-zinc-300 focus:outline-none focus:border-zinc-500 cursor-pointer"
            >
              <option value="all">All Transactions</option>
              <option value="commercial">Commercial Only</option>
              <option value="pro">Pro Purchases Only</option>
              <option value="super">Super Purchases Only</option>
              <option value="single">Single Time Passes</option>
              <option value="admin">Admin Grants Only</option>
              <option value="refunded">Refunded Only</option>
              <option value="processing">In Process Only</option>
            </select>

            <div className="relative">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search email, name, ID..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setCurrentPage(1)
                }}
                className="bg-zinc-950 border border-zinc-800 rounded-md py-1.5 pl-9 pr-3 text-xs text-white focus:outline-none focus:border-zinc-500 w-64"
              />
            </div>
          </div>
        </div>

        <div className="w-full overflow-x-auto">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="bg-zinc-950/50 border-b border-zinc-800 text-zinc-400">
              <tr>
                <th className="px-6 py-4 font-semibold">User</th>
                <th className="px-6 py-4 font-semibold">Transaction Id</th>
                <th className="px-6 py-4 font-semibold">Purchased Tier</th>
                <th className="px-6 py-4 font-semibold">Amount</th>
                <th className="px-6 py-4 font-semibold">Created On</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-zinc-500">Syncing transaction registry...</td>
                </tr>
              ) : paginatedTransactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-zinc-500">No transaction records found.</td>
                </tr>
              ) : (
                paginatedTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-zinc-800/10 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-zinc-850 flex items-center justify-center font-bold text-zinc-200 border border-zinc-800">
                          {tx.displayName?.charAt(0).toUpperCase() || tx.email?.charAt(0).toUpperCase() || "U"}
                        </div>
                        <div>
                          <div className="font-semibold text-zinc-250">{tx.displayName || 'Unknown user'}</div>
                          <div className="text-zinc-500 text-[10px]">{tx.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-mono text-zinc-400">{tx.txId}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border bg-zinc-800/5 dark:bg-zinc-500/10 text-zinc-650 dark:text-zinc-400 border-zinc-300 dark:border-zinc-500/20">
                        {PLAN_LABELS[tx.plan] || tx.plan}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-bold text-white">
                      {tx.amount === 0 ? (
                        <span className="text-[10px] text-zinc-500 font-semibold font-sans italic">Free Grant</span>
                      ) : (
                        `₹${tx.amount.toLocaleString("en-IN")}.00`
                      )}
                    </td>
                    <td className="px-6 py-4 text-zinc-400">
                      {new Date(tx.timestamp).toLocaleString("en-IN", {
                        day: "numeric",
                        month: "short",
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true
                      })}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-semibold border ${
                        tx.status === "succeeded" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                        tx.status === "refunded" ? "bg-purple-500/10 text-purple-400 border-purple-500/20" :
                        tx.status === "processing" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                        tx.status === "cancelled" ? "bg-zinc-500/10 text-zinc-550 dark:text-zinc-450 border-zinc-500/20" :
                        "bg-red-500/10 text-red-400 border-red-500/20"
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          tx.status === "succeeded" ? "bg-emerald-400" :
                          tx.status === "refunded" ? "bg-purple-400" :
                          tx.status === "processing" ? "bg-amber-400" :
                          tx.status === "cancelled" ? "bg-zinc-400" :
                          "bg-red-400"
                        }`}></span>
                        {tx.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors focus:outline-none select-none">
                          <MoreVertical className="w-4 h-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="bg-zinc-900 border-zinc-800 text-zinc-200 min-w-[150px] p-1 shadow-2xl mr-4">
                          <DropdownMenuLabel className="text-[10px] text-zinc-500 uppercase tracking-wider px-2 py-1">Actions</DropdownMenuLabel>
                          <DropdownMenuSeparator className="bg-zinc-800" />
                          <DropdownMenuItem 
                            onClick={() => {
                              navigator.clipboard.writeText(tx.txId);
                              useToastStore.getState().addToast("Transaction ID copied to clipboard!", "success");
                            }}
                            className="flex items-center gap-2 px-2 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 focus:bg-zinc-800 rounded cursor-pointer"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            Copy ID
                          </DropdownMenuItem>
                          {tx.status === "succeeded" && (
                            <DropdownMenuItem 
                              onClick={() => handleRefund(tx)}
                              className="flex items-center gap-2 px-2 py-1.5 text-xs text-red-400 hover:text-red-300 focus:bg-red-500/10 rounded cursor-pointer"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              Refund
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination controls matching screenshot layout */}
        {totalCount > 0 && (
          <div className="px-6 py-4 border-t border-zinc-800 flex items-center justify-between text-xs text-zinc-400 select-none">
            <div className="flex items-center gap-2">
              <span>Rows per page</span>
              <select
                value={rowsPerPage}
                onChange={(e) => {
                  setRowsPerPage(parseInt(e.target.value))
                  setCurrentPage(1)
                }}
                className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-zinc-300 focus:outline-none cursor-pointer"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>

            <div className="flex items-center gap-4">
              <span>Viewing ({startIndex + 1} - {endIndex}) of {totalCount}</span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="p-1 bg-zinc-950 border border-zinc-800 rounded text-zinc-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none hover:bg-zinc-850 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="p-1 bg-zinc-950 border border-zinc-800 rounded text-zinc-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none hover:bg-zinc-850 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
