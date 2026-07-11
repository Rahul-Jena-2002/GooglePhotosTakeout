import { useEffect, useState } from "react"
import { collection, query, orderBy, onSnapshot, doc, updateDoc, setDoc, addDoc, getDoc } from "firebase/firestore"
import { db } from "../firebase"
import { useAuth } from "../contexts/AuthContext"
import { DollarSign, Users, Award, TrendingUp, RotateCcw, Search } from "lucide-react"
import { useToastStore } from "../store/useToastStore"

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
    </div>
  )
}
