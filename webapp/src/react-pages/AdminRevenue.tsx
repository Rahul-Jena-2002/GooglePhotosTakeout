import { useEffect, useState } from "react"
import { collection, query, orderBy, onSnapshot, doc, updateDoc, setDoc, addDoc, getDoc } from "firebase/firestore"
import { db } from "../firebase"
import { useAuth } from "../contexts/AuthContext"
import { DollarSign, Users, Award, TrendingUp, RotateCcw, Search } from "lucide-react"

interface Transaction {
  id: string;
  txId: string;
  uid: string;
  email: string;
  displayName: string;
  plan: string;
  amount: number;
  status: "succeeded" | "refunded" | "failed";
  timestamp: number;
  paymentMethod: string;
}

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  recovery_pass: "Single Time",
  pro: "Pro",
  super: "Super",
}

export default function AdminRevenue() {
  const { adminData } = useAuth()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [totalUsersCount, setTotalUsersCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")

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

    // 2. Listen to user count for conversion calculation
    const usersQuery = collection(db, "users")
    const unsubUsers = onSnapshot(usersQuery, (snap) => {
      setTotalUsersCount(snap.size)
    }, (err) => {
      console.error("Users listener error:", err)
    })

    return () => {
      unsubTx()
      unsubUsers()
    }
  }, [])

  // Calculate metrics
  const activeTx = transactions.filter(t => t.status === "succeeded")
  const lifetimeRevenue = activeTx.reduce((sum, t) => sum + t.amount, 0)
  
  // Simulated timeline counts for today/this month
  const now = Date.now()
  const oneDayAgo = now - 24 * 60 * 60 * 1000
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000

  const revenueToday = activeTx
    .filter(t => t.timestamp >= oneDayAgo)
    .reduce((sum, t) => sum + t.amount, 0)

  const revenueThisMonth = activeTx
    .filter(t => t.timestamp >= thirtyDaysAgo)
    .reduce((sum, t) => sum + t.amount, 0)

  const paidUsersCount = new Set(activeTx.map(t => t.uid)).size
  const conversionRate = totalUsersCount > 0 ? (paidUsersCount / totalUsersCount) * 100 : 0

  const planBreakdown = {
    recovery_pass: activeTx.filter(t => t.plan === "recovery_pass").length,
    pro: activeTx.filter(t => t.plan === "pro").length,
    super: activeTx.filter(t => t.plan === "super").length,
  }

  const planRevenueBreakdown = {
    recovery_pass: activeTx.filter(t => t.plan === "recovery_pass").reduce((sum, t) => sum + t.amount, 0),
    pro: activeTx.filter(t => t.plan === "pro").reduce((sum, t) => sum + t.amount, 0),
    super: activeTx.filter(t => t.plan === "super").reduce((sum, t) => sum + t.amount, 0),
  }

  const handleRefund = async (tx: Transaction) => {
    if (!isSuperAdminOrAdmin) {
      alert("Unauthorized: Only Admins or Super Admins can refund transactions.")
      return
    }
    
    if (tx.status === "refunded") return

    try {
      // Fetch user's usage metrics from database to check refund eligibility
      const userRef = doc(db, "users", tx.uid)
      const userSnap = await getDoc(userRef)
      const userData = userSnap.exists() ? userSnap.data() : null
      
      const usedBytes = userData?.usedBytes || 0
      const usedFiles = userData?.usedFiles || 0
      const plan = userData?.plan || tx.plan || "free"

      const isWithinFreeLimit = usedBytes < 1 * 1024 * 1024 * 1024 && usedFiles < 1000
      const isAboveRecoveryPassLimit = usedBytes > 20 * 1024 * 1024 * 1024 || usedFiles > 10000

      let pct = 0
      let reason = ""

      if (isAboveRecoveryPassLimit) {
        pct = 0
        reason = `Usage is above Recovery Pass limit (${(usedBytes / (1024 ** 3)).toFixed(2)} GB / ${usedFiles} files processed).`
      } else if (isWithinFreeLimit) {
        pct = 100
        reason = `Usage is within Free tier limits (${(usedBytes / (1024 ** 3)).toFixed(3)} GB / ${usedFiles} files processed).`
      } else {
        // Usage is between 1 GB/1,000 files and 20 GB/10,000 files
        if (plan === "recovery_pass") {
          pct = 0
          reason = `Recovery Pass plan has processed ${(usedBytes / (1024 ** 3)).toFixed(2)} GB / ${usedFiles} files (limit for refund is 1 GB / 1,000 files).`
        } else {
          pct = 50
          reason = `Usage is within Recovery Pass boundaries (${(usedBytes / (1024 ** 3)).toFixed(2)} GB / ${usedFiles} files processed).`
        }
      }

      if (pct === 0) {
        if (!confirm(`This user has processed data that exceeds the refund eligibility limits.\n\nReason: ${reason}\n\nDo you want to proceed with a 0% refund anyway (this will downgrade their plan back to Free)?`)) {
          return
        }
      } else {
        if (!confirm(`User has processed ${(usedBytes / (1024 ** 3)).toFixed(2)} GB and ${usedFiles} files.\n\nEligibility: ${pct}% Refund (${reason})\n\nAre you sure you want to refund ₹${(tx.amount * pct / 100).toFixed(2)} to ${tx.email}? This will downgrade their plan back to Free.`)) {
          return
        }
      }

      // 1. Update transaction document in Firestore
      await updateDoc(doc(db, "transactions", tx.id), {
        status: "refunded",
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

      alert(`Transaction refunded successfully (Amount: ₹${(tx.amount * pct / 100).toFixed(2)}). User has been downgraded.`)
    } catch (err: any) {
      console.error(err)
      alert("Failed to refund transaction: " + err.message)
    }
  }

  // Filter transactions by search text
  const filteredTransactions = transactions.filter(t => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      t.email?.toLowerCase().includes(s) ||
      t.displayName?.toLowerCase().includes(s) ||
      t.txId?.toLowerCase().includes(s) ||
      t.plan?.toLowerCase().includes(s)
    )
  })

  // Generate historical data points for custom SVG line chart (simulating last 7 days of sales)
  const drawChartPoints = () => {
    if (activeTx.length === 0) return "50,85 150,85 250,85 350,85 450,85 550,85"
    
    const days = Array(7).fill(0)
    const dayLabels = Array(7).fill("")
    
    for (let i = 0; i < 7; i++) {
      const dayStart = now - (6 - i) * 24 * 60 * 60 * 1000
      const dayEnd = dayStart + 24 * 60 * 60 * 1000
      days[i] = activeTx
        .filter(t => t.timestamp >= dayStart && t.timestamp < dayEnd)
        .reduce((sum, t) => sum + t.amount, 0)
        
      const date = new Date(dayStart)
      dayLabels[i] = date.toLocaleDateString("en-IN", { weekday: "short" })
    }

    const maxVal = Math.max(...days, 500)
    const points = days.map((val, idx) => {
      const x = 50 + idx * 100
      // Map value to Y coordinate (chart height is 150px, leave 10px margins)
      const y = 140 - (val / maxVal) * 110
      return `${x},${y}`
    }).join(" ")

    return { points, days, dayLabels, maxVal }
  }

  const chartData = drawChartPoints()

  return (
    <div className="space-y-8">
      {/* HEADER */}
      <div>
        <h1 className="text-3xl font-black tracking-tight text-white flex items-center gap-2">
          <TrendingUp className="w-8 h-8 text-zinc-400" /> Revenue Operations Center
        </h1>
        <p className="text-zinc-400 text-sm">Monitor platform subscriptions, active conversions, and invoice status.</p>
      </div>

      {/* KPI METRIC CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-xl relative overflow-hidden shadow-lg">
          <div className="absolute top-4 right-4 p-2 bg-zinc-800 dark:bg-zinc-200 text-zinc-400 dark:text-zinc-800 rounded-lg">
            <DollarSign className="w-5 h-5" />
          </div>
          <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Today's Revenue</div>
          <div className="text-3xl font-black text-white">₹{revenueToday}</div>
          <div className="text-xs text-zinc-500 mt-2 font-medium">Last 24 Hours</div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-xl relative overflow-hidden shadow-lg">
          <div className="absolute top-4 right-4 p-2 bg-zinc-800 dark:bg-zinc-200 text-zinc-400 dark:text-zinc-800 rounded-lg">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Monthly Revenue</div>
          <div className="text-3xl font-black text-white">₹{revenueThisMonth}</div>
          <div className="text-xs text-zinc-500 mt-2 font-medium">Last 30 Days</div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-xl relative overflow-hidden shadow-lg">
          <div className="absolute top-4 right-4 p-2 bg-zinc-800 dark:bg-zinc-200 text-zinc-400 dark:text-zinc-800 rounded-lg">
            <Award className="w-5 h-5" />
          </div>
          <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Lifetime Revenue</div>
          <div className="text-3xl font-black text-white">₹{lifetimeRevenue}</div>
          <div className="text-xs text-zinc-450 mt-2 font-medium">₹{lifetimeRevenue - activeTx.length * 0} net payout</div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-xl relative overflow-hidden shadow-lg">
          <div className="absolute top-4 right-4 p-2 bg-zinc-800 dark:bg-zinc-200 text-zinc-400 dark:text-zinc-800 rounded-lg">
            <Users className="w-5 h-5" />
          </div>
          <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Conversion Funnel</div>
          <div className="text-3xl font-black text-white">{conversionRate.toFixed(1)}%</div>
          <div className="text-xs text-zinc-500 mt-2 font-medium">{paidUsersCount} of {totalUsersCount} registered users</div>
        </div>
      </div>

      {/* CHARTS & DISTRIBUTION */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Custom SVG Line Chart */}
        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-xl lg:col-span-2 shadow-lg flex flex-col justify-between min-h-[300px]">
          <div>
            <h3 className="text-base font-bold text-white mb-1">Sales Trends</h3>
            <p className="text-zinc-500 text-xs">Simulated Stripe payouts for the last 7 calendar days.</p>
          </div>
          
          <div className="py-4">
            {activeTx.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-zinc-600 italic text-sm">No transaction events to plot.</div>
            ) : (
              <div>
                <svg className="w-full h-40 overflow-visible text-zinc-700 dark:text-zinc-300" viewBox="0 0 650 150">
                  {/* Grid Lines */}
                  <line x1="50" y1="20" x2="650" y2="20" stroke="#1f2937" strokeWidth="1" strokeDasharray="4" />
                  <line x1="50" y1="75" x2="650" y2="75" stroke="#1f2937" strokeWidth="1" strokeDasharray="4" />
                  <line x1="50" y1="130" x2="650" y2="130" stroke="#1f2937" strokeWidth="1" strokeDasharray="4" />
                  
                  {/* Line Path */}
                  <polyline
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={typeof chartData === "object" ? chartData.points : ""}
                  />
                  
                  {/* Glowing nodes */}
                  {typeof chartData === "object" && chartData.days.map((val, idx) => {
                    const x = 50 + idx * 100
                    const y = 140 - (val / chartData.maxVal) * 110
                    return (
                      <g key={idx} className="group cursor-pointer">
                        <circle cx={x} cy={y} r="5" fill="currentColor" className="transition-all duration-300 group-hover:r-7" />
                        <circle cx={x} cy={y} r="10" stroke="currentColor" strokeWidth="1.5" fill="none" className="opacity-0 group-hover:opacity-100 animate-ping" />
                      </g>
                    )
                  })}
                </svg>
                {/* Labels */}
                <div className="flex justify-between pl-10 pr-4 mt-2 font-mono text-[10px] text-zinc-500">
                  {typeof chartData === "object" && chartData.dayLabels.map((lbl, idx) => (
                    <div key={idx} className="text-center w-12">
                      <div>{lbl}</div>
                      <div className="text-zinc-400 font-bold">₹{chartData.days[idx]}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Tier Distribution Gauge */}
        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-xl shadow-lg flex flex-col justify-between min-h-[300px]">
          <div>
            <h3 className="text-base font-bold text-white mb-1">Tier Distribution</h3>
            <p className="text-zinc-500 text-xs">Breakdown of purchases by plan tier.</p>
          </div>
          
          <div className="space-y-5 py-4">
            <div>
              <div className="flex justify-between text-xs text-zinc-400 mb-1.5">
                <span className="flex items-center gap-2 font-medium"><span className="w-2 h-2 rounded-full bg-zinc-600"></span> Single Time (₹99)</span>
                <span className="font-bold text-white">{planBreakdown.recovery_pass} Sales <span className="text-zinc-500">(₹{planRevenueBreakdown.recovery_pass})</span></span>
              </div>
              <div className="h-2 w-full bg-zinc-950 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-zinc-600 rounded-full" 
                  style={{ width: `${activeTx.length > 0 ? (planBreakdown.recovery_pass / activeTx.length) * 100 : 0}%` }}
                ></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs text-zinc-400 mb-1.5">
                <span className="flex items-center gap-2 font-medium"><span className="w-2 h-2 rounded-full bg-zinc-400"></span> Pro Lifetime (₹799)</span>
                <span className="font-bold text-white">{planBreakdown.pro} Sales <span className="text-zinc-500">(₹{planRevenueBreakdown.pro})</span></span>
              </div>
              <div className="h-2 w-full bg-zinc-950 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-zinc-400 rounded-full" 
                  style={{ width: `${activeTx.length > 0 ? (planBreakdown.pro / activeTx.length) * 100 : 0}%` }}
                ></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs text-zinc-400 mb-1.5">
                <span className="flex items-center gap-2 font-medium"><span className="w-2 h-2 rounded-full bg-zinc-200"></span> Super Lifetime (₹1499)</span>
                <span className="font-bold text-white">{planBreakdown.super} Sales <span className="text-zinc-500">(₹{planRevenueBreakdown.super})</span></span>
              </div>
              <div className="h-2 w-full bg-zinc-950 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-zinc-200 rounded-full" 
                  style={{ width: `${activeTx.length > 0 ? (planBreakdown.super / activeTx.length) * 100 : 0}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* TRANSACTIONS TABLE */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-lg">
        <div className="px-6 py-5 border-b border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-white">Stripe Transaction Log</h3>
            <p className="text-zinc-500 text-xs">Real-time purchase logs matching Firebase sandbox billing hooks.</p>
          </div>
          
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search transactions..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 rounded-md py-1.5 pl-9 pr-3 text-xs text-white focus:outline-none focus:border-zinc-500 w-64"
            />
          </div>
        </div>

        <div className="w-full overflow-x-auto">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="bg-zinc-950/50 border-b border-zinc-800 text-zinc-400">
              <tr>
                <th className="px-6 py-3 font-semibold">Session ID</th>
                <th className="px-6 py-3 font-semibold">User</th>
                <th className="px-6 py-3 font-semibold">Purchased Tier</th>
                <th className="px-6 py-3 font-semibold">Amount</th>
                <th className="px-6 py-3 font-semibold">Date & Time</th>
                <th className="px-6 py-3 font-semibold">Status</th>
                <th className="px-6 py-3 font-semibold text-right">Moderation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-zinc-500">Syncing transaction registry...</td>
                </tr>
              ) : filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-zinc-500">No transactions recorded.</td>
                </tr>
              ) : (
                filteredTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-zinc-800/20 transition-colors">
                    <td className="px-6 py-4 font-mono text-zinc-400">{tx.txId}</td>
                    <td className="px-6 py-4">
                      <div>
                        <div className="font-semibold text-zinc-200">{tx.displayName}</div>
                        <div className="text-zinc-500 text-[10px]">{tx.email}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        tx.plan === "pro" ? "bg-zinc-800/40 text-zinc-300 dark:text-zinc-200 border border-zinc-800" :
                        tx.plan === "super" ? "bg-zinc-800 text-zinc-150 dark:bg-zinc-200 dark:text-zinc-900 border border-zinc-700 dark:border-zinc-300" :
                        "bg-zinc-900/20 text-zinc-400 border border-zinc-850"
                      }`}>
                        {PLAN_LABELS[tx.plan] || tx.plan}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-bold text-white">₹{tx.amount}.00</td>
                    <td className="px-6 py-4 text-zinc-400">
                      {new Date(tx.timestamp).toLocaleString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-semibold ${
                        tx.status === "succeeded" ? "bg-zinc-800/80 text-zinc-200 border border-zinc-700" : "bg-zinc-950/40 text-zinc-500 border border-zinc-900"
                      }`}>
                        <span className={`w-1 h-1 rounded-full ${tx.status === "succeeded" ? "bg-emerald-400" : "bg-red-400"}`}></span>
                        {tx.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {tx.status === "succeeded" ? (
                        <button
                          onClick={() => handleRefund(tx)}
                          disabled={!isSuperAdminOrAdmin}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all font-semibold ${
                            !isSuperAdminOrAdmin ? "opacity-50 cursor-not-allowed" : ""
                          }`}
                        >
                          <RotateCcw className="w-3 h-3" /> Refund
                        </button>
                      ) : (
                        <span className="text-zinc-500 italic">Refunded</span>
                      )}
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
