import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card"
import { useAuth } from "../contexts/AuthContext"
import {
  CreditCard, LifeBuoy,
  MessageSquareQuote, Star, Zap, TrendingUp, UserCheck, Activity,
  RefreshCw, HardDrive
} from "lucide-react"
import {
  collection, query, where, orderBy, limit,
  getCountFromServer, onSnapshot, doc
} from "firebase/firestore"
import { db } from "../firebase"
import type { AdminData, AdminRole } from "../contexts/AuthContext"

const STATUS_DOT: Record<string, string> = {
  online: "bg-emerald-400",
  idle: "bg-amber-400",
  offline: "bg-zinc-600",
}

const ROLE_LABEL: Record<AdminRole, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  SUPPORT: "Support",
  MODERATOR: "Moderator",
}

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export default function AdminDashboard() {
  const { adminData } = useAuth()
  const [kpi, setKpi] = useState({
    totalUsers: 0, openTickets: 0, pendingReviews: 0,
    proUsers: 0, superUsers: 0,
  })
  const [revenueToday, setRevenueToday] = useState(0)
  const [txs, setTxs] = useState<any[]>([])
  const [onlineAdmins, setOnlineAdmins] = useState<AdminData[]>([])
  const [activity, setActivity] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [globalStats, setGlobalStats] = useState<any>(null)

  useEffect(() => {
    // 1. Fetch KPI counts
    const fetchKpis = async () => {
      try {
        const usersRef = collection(db, "users")
        const ticketsRef = collection(db, "tickets")
        const reviewsRef = collection(db, "reviews")

        const [total, openT, pendingR, pro, sup] = await Promise.all([
          getCountFromServer(usersRef),
          getCountFromServer(query(ticketsRef, where("status", "==", "OPEN"))),
          getCountFromServer(query(reviewsRef, where("status", "==", "PENDING"))),
          getCountFromServer(query(usersRef, where("plan", "==", "pro"))),
          getCountFromServer(query(usersRef, where("plan", "==", "super"))),
        ])

        setKpi({
          totalUsers: total.data().count,
          openTickets: openT.data().count,
          pendingReviews: pendingR.data().count,
          proUsers: pro.data().count,
          superUsers: sup.data().count,
        })
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }

    fetchKpis()

    // 2. Listen to successful transactions in real-time for revenue calculations
    const qTx = query(collection(db, "transactions"), where("status", "==", "succeeded"))
    const unsubTx = onSnapshot(qTx, (snap) => {
      const txList = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setTxs(txList)

      const now = Date.now()
      const oneDayAgo = now - 24 * 60 * 60 * 1000

      const getAmountInINR = (amount: number, currency: string | undefined): number => {
        const c = (currency || "INR").toUpperCase()
        if (c === "INR") return amount
        if (c === "USD") return amount * 83.0
        if (c === "EUR") return amount * 90.0
        if (c === "JPY") return amount * 0.53
        if (c === "CNY") return amount * 11.5
        return amount * 83.0
      }

      // Sum revenue collected in the last 24 hours (INR Eq)
      const revToday = txList
        .filter((t: any) => t.timestamp >= oneDayAgo)
        .reduce((sum: number, t: any) => sum + getAmountInINR(t.amount, t.currency), 0)

      setRevenueToday(revToday)
    }, (err) => console.error(err))

    // 3. Live online admins
    const unsubAdmins = onSnapshot(
      query(collection(db, "admins"), where("status", "in", ["online", "idle"])),
      (snap) => setOnlineAdmins(snap.docs.map(d => d.data() as AdminData))
    )

    // 4. Live admin activity feed
    const qActivity = query(
      collection(db, "admin_activity"),
      orderBy("timestamp", "desc"),
      limit(8)
    )
    const unsubActivity = onSnapshot(qActivity, (snap) => {
      setActivity(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }, (err) => console.error("Activity feed error:", err))

    // 5. Listen to global platform stats
    const unsubGlobal = onSnapshot(doc(db, "platform_stats", "global"), (snap) => {
      if (snap.exists()) {
        setGlobalStats(snap.data())
      }
    }, console.error)

    return () => {
      unsubTx()
      unsubAdmins()
      unsubActivity()
      unsubGlobal()
    }
  }, [])

  // Generate historical data points for the mini SVG line chart
  const drawChartPoints = () => {
    const activeTx = txs.filter((t: any) => t.status === "succeeded")
    if (activeTx.length === 0) return { points: "30,80 100,80 170,80 240,80 310,80 380,80", maxVal: 100, days: Array(6).fill(0) }

    const days = Array(6).fill(0)
    const now = Date.now()

    const getAmountInINR = (amount: number, currency: string | undefined): number => {
      const c = (currency || "INR").toUpperCase()
      if (c === "INR") return amount
      if (c === "USD") return amount * 83.0
      if (c === "EUR") return amount * 90.0
      if (c === "JPY") return amount * 0.53
      if (c === "CNY") return amount * 11.5
      return amount * 83.0
    }

    for (let i = 0; i < 6; i++) {
      const dayStart = now - (5 - i) * 24 * 60 * 60 * 1000
      const dayEnd = dayStart + 24 * 60 * 60 * 1000
      days[i] = activeTx
        .filter((t: any) => t.timestamp >= dayStart && t.timestamp < dayEnd)
        .reduce((sum: number, t: any) => sum + getAmountInINR(t.amount, t.currency), 0)
    }

    const maxVal = Math.max(...days, 500)
    const points = days.map((val, idx) => {
      const x = 30 + idx * 70
      const y = 110 - (val / maxVal) * 80
      return `${x},${y}`
    }).join(" ")

    return { points, maxVal, days }
  }

  const chartInfo = drawChartPoints()

  const formatActivityTime = (ts: any) => {
    if (!ts) return "just now"
    const ms = ts.seconds ? ts.seconds * 1000 : ts
    const diff = Date.now() - ms
    
    if (diff < 60000) return "just now"
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return new Date(ms).toLocaleDateString([], { month: "short", day: "numeric" })
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"

  return (
    <div className="space-y-8 font-sans">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          {greeting}, {adminData?.displayName?.split(" ")[0] || "Admin"} 👋
        </h1>
        <p className="text-zinc-400 text-sm mt-1">Here's what's happening on TakeoutFix right now.</p>
      </div>

      {/* Actionable KPI Row */}
      {loading ? (
        <div className="text-zinc-500 text-sm animate-pulse">Loading dashboard...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-4">
            {[
              { label: "Open Tickets", val: kpi.openTickets, icon: LifeBuoy, color: "text-red-400", urgent: kpi.openTickets > 0 },
              { label: "Pending Reviews", val: kpi.pendingReviews, icon: MessageSquareQuote, color: "text-amber-400", urgent: kpi.pendingReviews > 0 },
              { label: "Revenue Today", val: `₹${revenueToday.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`, icon: CreditCard, color: "text-emerald-400", urgent: false },
              { label: "Files Recovered", val: (globalStats?.filesRestored || 4115).toLocaleString(), icon: RefreshCw, color: "text-indigo-400", urgent: false },
              { label: "Data Processed", val: formatBytes(globalStats?.bytesProcessed || 12944482578), icon: HardDrive, color: "text-purple-400", urgent: false },
              { label: "Online Admins", val: onlineAdmins.length, icon: UserCheck, color: "text-indigo-400", urgent: false },
              { label: "Pro Users", val: kpi.proUsers, icon: Star, color: "text-indigo-300", urgent: false },
              { label: "Super Users", val: kpi.superUsers, icon: Zap, color: "text-amber-300", urgent: false },
            ].map((kpiItem, i) => (
              <Card
                key={i}
                className={`bg-zinc-900 border-zinc-800 shadow-none transition-colors ${kpiItem.urgent ? "border-l-2 border-l-red-500" : ""}`}
              >
                <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider leading-tight">{kpiItem.label}</CardTitle>
                  <kpiItem.icon className={`w-4 h-4 flex-shrink-0 ${kpiItem.color}`} />
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="text-2xl font-semibold text-white">{String(kpiItem.val)}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            {/* Online Admins */}
            <Card className="bg-zinc-900 border-zinc-800 shadow-none">
              <CardHeader className="px-5 py-4 border-b border-zinc-800">
                <CardTitle className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  Admin Team Online
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {onlineAdmins.length === 0 ? (
                  <div className="px-5 py-6 text-zinc-600 text-sm text-center">No admins currently online</div>
                ) : (
                  <div className="divide-y divide-zinc-800">
                    {onlineAdmins.map((a) => (
                      <div key={a.uid} className="flex items-center gap-3 px-5 py-3">
                        <div className="relative flex-shrink-0">
                          {a.photoURL ? (
                            <img src={a.photoURL} alt="" className="w-8 h-8 rounded-full" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center font-bold text-xs text-indigo-400">
                              {a.displayName?.charAt(0)}
                            </div>
                          )}
                          <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-zinc-900 ${STATUS_DOT[a.status]}`}></span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-zinc-200 truncate">{a.displayName}</div>
                          <div className="text-xs text-zinc-500">{ROLE_LABEL[a.role]}</div>
                        </div>
                        <div className={`text-xs capitalize ${a.status === 'online' ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {a.status}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Revenue Overview (Dynamic SVG chart!) */}
            <Card className="bg-zinc-900 border-zinc-800 shadow-none flex flex-col justify-between">
              <CardHeader className="px-5 py-4 border-b border-zinc-800">
                <CardTitle className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" /> Revenue (Last 6 Days)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5 flex-1 flex flex-col justify-between">
                <div className="w-full relative">
                  <svg className="w-full h-32 overflow-visible" viewBox="0 0 400 120">
                    <line x1="30" y1="30" x2="380" y2="30" stroke="#1f2937" strokeWidth="1" strokeDasharray="3" />
                    <line x1="30" y1="70" x2="380" y2="70" stroke="#1f2937" strokeWidth="1" strokeDasharray="3" />
                    <line x1="30" y1="110" x2="380" y2="110" stroke="#1f2937" strokeWidth="1" strokeDasharray="3" />

                    <polyline
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={chartInfo.points}
                    />

                    {chartInfo.days.map((val: number, idx: number) => {
                      const x = 30 + idx * 70;
                      const y = 110 - (val / chartInfo.maxVal) * 80;
                      return (
                        <circle
                          key={idx}
                          cx={x}
                          cy={y}
                          r="3.5"
                          fill="#10b981"
                          className="hover:scale-150 transition-transform cursor-pointer"
                        />
                      );
                    })}
                  </svg>
                </div>
                <div className="text-[10px] text-zinc-500 font-mono text-center flex justify-between px-2 pt-2 border-t border-zinc-800/55">
                  <span>6d ago</span>
                  <span>4d ago</span>
                  <span>2d ago</span>
                  <span className="text-emerald-400 font-bold">Today</span>
                </div>
              </CardContent>
            </Card>

            {/* Activity Feed */}
            <Card className="bg-zinc-900 border-zinc-800 shadow-none">
              <CardHeader className="px-5 py-4 border-b border-zinc-800">
                <CardTitle className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-indigo-400" /> Admin Activity Feed
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {activity.length === 0 ? (
                  <div className="px-5 py-6 text-zinc-600 text-sm text-center">No recent admin activity</div>
                ) : (
                  <div className="divide-y divide-zinc-800">
                    {activity.map((a) => (
                      <div key={a.id} className="flex items-start gap-3 px-5 py-3.5 hover:bg-zinc-950/20 transition-colors">
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-2 flex-shrink-0"></div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-zinc-300 leading-normal">{a.description}</div>
                          <div className="text-[10px] text-zinc-500 mt-1 flex justify-between items-center">
                            <span>{a.actorName} ({ROLE_LABEL[a.actorRole as AdminRole] || a.actorRole})</span>
                            <span className="font-mono">{formatActivityTime(a.timestamp)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
