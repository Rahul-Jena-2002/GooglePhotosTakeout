import { useEffect, useState } from "react"
import { collection, query, orderBy, onSnapshot, doc, updateDoc, setDoc, addDoc } from "firebase/firestore"
import { db } from "../firebase"
import { useAuth } from "../contexts/AuthContext"
import { Search, RotateCcw, MoreVertical, FileSpreadsheet, ChevronLeft, ChevronRight, Copy } from "lucide-react"
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
  envMode?: string;
}

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  recovery_pass: "Single Time",
  pro: "Pro",
  super: "Super",
}

function getPlanBadgeClass(plan: string): string {
  if (plan === "pro") return "bg-blue-500/10 text-blue-400 border-blue-500/20"
  if (plan === "super") return "bg-amber-500/10 text-amber-400 border-amber-500/20"
  return "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
}

function getStatusBadgeStyle(status: Transaction["status"]) {
  switch (status) {
    case "succeeded":
      return { badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", dot: "bg-emerald-400" }
    case "refunded":
      return { badge: "bg-purple-500/10 text-purple-400 border-purple-500/20", dot: "bg-purple-400" }
    case "processing":
      return { badge: "bg-amber-500/10 text-amber-400 border-amber-500/20", dot: "bg-amber-400" }
    case "cancelled":
      return { badge: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20", dot: "bg-zinc-400" }
    default:
      return { badge: "bg-red-500/10 text-red-400 border-red-500/20", dot: "bg-red-400" }
  }
}

export default function AdminTransactions() {
  const { adminData } = useAuth()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filterType, setFilterType] = useState<"all" | "commercial" | "pro" | "super" | "single" | "admin" | "refunded" | "processing">("commercial")
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
    const pct = Number.parseInt(pctStr, 10) || 100
    
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

  // Identify non-commercial / free grant items
  const isGrant = (t: Transaction) => t.approvedByAdmin != null || t.paymentMethod === "Admin Grant" || t.amount === 0 || t.envMode === "test" || Boolean(t.txId?.includes("TEST"));

  const commercialTx = transactions.filter(t => !isGrant(t))
  const grantTx = transactions.filter(t => isGrant(t))
  const succeededCommercialCount = commercialTx.filter(t => t.status === "succeeded").length
  const totalCommercialRevenue = commercialTx.filter(t => t.status === "succeeded").reduce((acc, curr) => acc + (curr.amount || 0), 0)

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

    const nonComm = isGrant(t);
    
    if (filterType === "admin") {
      return nonComm;
    } else if (filterType === "commercial") {
      return !nonComm;
    } else if (filterType === "pro") {
      return !nonComm && t.plan === "pro";
    } else if (filterType === "super") {
      return !nonComm && t.plan === "super";
    } else if (filterType === "single") {
      return !nonComm && t.plan === "recovery_pass";
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
    link.remove();
  }

  const GATEWAY_NAMES: Record<string, string> = {
    dodo: "Dodo Payments",
    lemonsqueezy: "Lemon Squeezy",
    paddle: "Paddle",
    stripe: "Stripe"
  }
  const gatewayLabel = GATEWAY_NAMES[activeGateway] || "Dodo Payments"

  let tableRows: React.ReactNode = null
  if (loading) {
    tableRows = (
      <tr>
        <td colSpan={7} className="px-6 py-12 text-center text-zinc-500">Syncing transaction registry...</td>
      </tr>
    )
  } else if (paginatedTransactions.length === 0) {
    tableRows = (
      <tr>
        <td colSpan={7} className="px-6 py-16 text-center">
          <div className="max-w-md mx-auto space-y-3">
            <div className="w-12 h-12 mx-auto rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 dark:text-indigo-400 flex items-center justify-center font-bold text-lg">
              ₹
            </div>
            <h4 className="text-base font-bold text-zinc-900 dark:text-white">
              {filterType === "commercial" 
                ? "No Commercial Paid Transactions Yet" 
                : filterType === "admin" 
                ? "No Admin Free Grants Found" 
                : "No Transactions Found"}
            </h4>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              {filterType === "commercial" 
                ? `Your ${gatewayLabel} gateway is live. When users complete paid upgrades on checkout, real payments will automatically stream in here. (${grantTx.length} Free Grants / manual upgrades are available in the Free Grants tab).`
                : "No records match your active search and filter criteria."}
            </p>
            {filterType === "commercial" && grantTx.length > 0 && (
              <button
                onClick={() => setFilterType("admin")}
                className="btn-admin-primary mt-2 cursor-pointer text-xs"
              >
                View {grantTx.length} Free Grants / Admin Upgrades
              </button>
            )}
          </div>
        </td>
      </tr>
    )
  } else {
    tableRows = paginatedTransactions.map((tx) => {
      const statusStyle = getStatusBadgeStyle(tx.status)
      const planClass = getPlanBadgeClass(tx.plan)
      const isFreeGrant = isGrant(tx)
      return (
        <tr key={tx.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/20 transition-colors">
          <td className="px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center font-bold text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700">
                {tx.displayName?.charAt(0).toUpperCase() || tx.email?.charAt(0).toUpperCase() || "U"}
              </div>
              <div>
                <div className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <span>{tx.displayName || 'Unknown user'}</span>
                  {isFreeGrant && (
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                      Grant
                    </span>
                  )}
                </div>
                <div className="text-zinc-500 text-[10px]">{tx.email}</div>
              </div>
            </div>
          </td>
          <td className="px-6 py-4 font-mono text-xs text-zinc-600 dark:text-zinc-400">{tx.txId}</td>
          <td className="px-6 py-4">
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${planClass}`}>
              {PLAN_LABELS[tx.plan] || tx.plan}
            </span>
          </td>
          <td className="px-6 py-4 font-bold text-zinc-900 dark:text-white">
            {tx.amount === 0 ? (
              <span className="text-[10px] text-zinc-500 font-semibold font-sans italic">Free Grant (₹0)</span>
            ) : (
              `₹${tx.amount.toLocaleString("en-IN")}.00`
            )}
          </td>
          <td className="px-6 py-4 text-zinc-600 dark:text-zinc-400">
            {new Date(tx.timestamp).toLocaleString("en-IN", {
              day: "numeric",
              month: "short",
              hour: "numeric",
              minute: "2-digit",
              hour12: true
            })}
          </td>
          <td className="px-6 py-4">
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-semibold text-[11px] border ${statusStyle.badge}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`}></span>
              {tx.status}
            </span>
          </td>
          <td className="px-6 py-4 text-right">
            <DropdownMenu>
              <DropdownMenuTrigger className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors focus:outline-none select-none cursor-pointer">
                <MoreVertical className="w-4 h-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-200 min-w-[150px] p-1 shadow-2xl mr-4">
                <DropdownMenuLabel className="text-[10px] text-zinc-500 uppercase tracking-wider px-2 py-1">Actions</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-zinc-200 dark:bg-zinc-800" />
                <DropdownMenuItem 
                  onClick={() => {
                    navigator.clipboard.writeText(tx.txId);
                    useToastStore.getState().addToast("Transaction ID copied to clipboard!", "success");
                  }}
                  className="flex items-center gap-2 px-2 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy ID
                </DropdownMenuItem>
                {tx.status === "succeeded" && tx.amount > 0 && (
                  <DropdownMenuItem 
                    onClick={() => handleRefund(tx)}
                    className="flex items-center gap-2 px-2 py-1.5 text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/10 rounded cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Refund
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </td>
        </tr>
      )
    })
  }

  return (
    <div className="space-y-6 font-sans pb-12">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">{gatewayLabel} Transactions Log</h2>
          <p className="text-zinc-600 dark:text-zinc-400 text-xs mt-1">
            Real-time payment registry matching your active checkout gateway configuration.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={exportToCSV}
            className="btn-admin-outline cursor-pointer flex items-center gap-1.5"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" /> Export CSV
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="admin-panel-card rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div className="text-zinc-500 text-xs font-bold uppercase tracking-wider">Commercial Revenue</div>
          <div className="text-3xl font-extrabold text-zinc-900 dark:text-white mt-3">
            ₹{totalCommercialRevenue.toLocaleString("en-IN")}.00
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">Real paid customer orders</div>
        </div>

        <div className="admin-panel-card rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div className="text-zinc-500 text-xs font-bold uppercase tracking-wider">Successful Commercial</div>
          <div className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-3">{succeededCommercialCount}</div>
          <div className="text-[11px] text-zinc-500 mt-1">Paid transactions from live checkout</div>
        </div>

        <div className="admin-panel-card rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div className="text-zinc-500 text-xs font-bold uppercase tracking-wider">Free Grants & Manual Upgrades</div>
          <div className="text-3xl font-extrabold text-zinc-600 dark:text-zinc-400 mt-3">{grantTx.length}</div>
          <div className="text-[11px] text-zinc-500 mt-1">Promotional grants & admin seed users</div>
        </div>
      </div>

      {/* Segmented Filter Pills */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => { setFilterType("commercial"); setCurrentPage(1); }}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            filterType === "commercial"
              ? "bg-indigo-600 text-white shadow-sm"
              : "btn-admin-outline"
          }`}
        >
          Commercial Payments ({commercialTx.length})
        </button>
        <button
          onClick={() => { setFilterType("admin"); setCurrentPage(1); }}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            filterType === "admin"
              ? "bg-indigo-600 text-white shadow-sm"
              : "btn-admin-outline"
          }`}
        >
          Free Grants ({grantTx.length})
        </button>
        <button
          onClick={() => { setFilterType("all"); setCurrentPage(1); }}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            filterType === "all"
              ? "bg-indigo-600 text-white shadow-sm"
              : "btn-admin-outline"
          }`}
        >
          All Records ({transactions.length})
        </button>
      </div>

      {/* Table section */}
      <div className="admin-panel-card rounded-2xl overflow-hidden shadow-lg">
        <div className="px-6 py-5 border-b border-zinc-200 dark:border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
              {filterType === "commercial" ? "Commercial Payments Registry" : filterType === "admin" ? "Free Grants & Manual Upgrades" : "Complete Registry"}
            </h3>
            <p className="text-zinc-500 text-[11px] mt-0.5">Showing records {totalCount > 0 ? startIndex + 1 : 0} - {endIndex} of {totalCount}</p>
          </div>
          
          <div className="flex items-center gap-3">
            <select
              value={filterType}
              onChange={(e) => {
                setFilterType(e.target.value as any)
                setCurrentPage(1)
              }}
              className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-md py-1.5 px-3 text-xs text-zinc-800 dark:text-zinc-300 focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="commercial">Commercial Only</option>
              <option value="all">All Transactions</option>
              <option value="pro">Pro Purchases Only</option>
              <option value="super">Super Purchases Only</option>
              <option value="single">Single Time Passes</option>
              <option value="admin">Free Grants Only</option>
              <option value="refunded">Refunded Only</option>
              <option value="processing">In Process Only</option>
            </select>

            <div className="relative">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search email, name, ID..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setCurrentPage(1)
                }}
                className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-md py-1.5 pl-9 pr-3 text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500 w-64"
              />
            </div>
          </div>
        </div>

        <div className="w-full overflow-x-auto">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="bg-zinc-50 dark:bg-zinc-950/50 border-b border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400">
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
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/60">
              {tableRows}
            </tbody>
          </table>
        </div>

        {/* Pagination controls */}
        {totalCount > 0 && (
          <div className="px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-xs text-zinc-500 select-none">
            <div className="flex items-center gap-2">
              <span>Rows per page</span>
              <select
                value={rowsPerPage}
                onChange={(e) => {
                  setRowsPerPage(Number.parseInt(e.target.value, 10))
                  setCurrentPage(1)
                }}
                className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded px-2 py-1 text-zinc-700 dark:text-zinc-300 focus:outline-none cursor-pointer"
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
                  className="p-1 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="p-1 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
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

