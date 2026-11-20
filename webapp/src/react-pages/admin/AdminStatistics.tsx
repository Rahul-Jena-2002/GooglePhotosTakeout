import { useEffect, useState } from "react"
import { collection, onSnapshot, doc } from "firebase/firestore"
import { db } from "../../firebase"
import { Chart } from "../../components/ui/chart"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card"
import { BarChart3, Users, RefreshCw } from "lucide-react"
import { accountGrowth, dailyRecoveries } from "./statisticsDates"

// Helper to format bytes to human-readable size
const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.max(0, Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k))))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export default function AdminStatistics() {
  const [users, setUsers] = useState<any[]>([])
  const [recoveries, setRecoveries] = useState<any[]>([])
  const [globalStats, setGlobalStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 1. Listen to users
    const unsubUsers = onSnapshot(collection(db, "users"), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setUsers(list)
    }, console.error)

    // 2. Listen to recoveries
    const unsubRecoveries = onSnapshot(collection(db, "recoveries"), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setRecoveries(list)
    }, console.error)

    // 3. Listen to global platform stats
    const unsubGlobal = onSnapshot(doc(db, "platform_stats", "global"), (snap) => {
      if (snap.exists()) {
        setGlobalStats(snap.data())
      }
      setLoading(false)
    }, console.error)

    return () => {
      unsubUsers()
      unsubRecoveries()
      unsubGlobal()
    }
  }, [])

  // --- Calculations ---

  // 1. Account records
  const totalUsers = users.length

  // 2. Average Scan Size
  const sizes = recoveries.map(rec => rec.bytesProcessed).filter(bytes => typeof bytes === 'number' && Number.isSafeInteger(bytes) && bytes >= 0)
  const avgBytes = sizes.length ? sizes.reduce((sum, bytes) => sum + bytes, 0) / sizes.length : 0
  const avgScanSizeStr = sizes.length ? formatBytes(avgBytes) : "—"

  // 3. JSON Exif Match Rate
  const matchRate = Number.isSafeInteger(globalStats?.filesScanned) && globalStats.filesScanned > 0
    && Number.isSafeInteger(globalStats?.filesRestored) && globalStats.filesRestored >= 0
    ? (globalStats.filesRestored / globalStats.filesScanned) * 100
    : null

  // 4. Total Files Injected
  const totalFiles = globalStats?.filesRestored

  // 5. Aggregate Cards Data
  const statsSummary = [
    { label: "Account Records", val: totalUsers.toLocaleString(), desc: "Accounts in the loaded records" },
    { label: "Avg. Reported Size", val: avgScanSizeStr, desc: "Average of records with a valid byte count" },
    { label: "Reported Match Rate", val: matchRate != null ? `${matchRate.toFixed(1)}%` : "—", desc: "Client-reported totals; not independently verified" },
    { label: "Reported Files Restored", val: totalFiles != null ? totalFiles.toLocaleString() : "—", desc: "Client-reported total; not independently verified" },
  ]

  const recoveriesChartData = dailyRecoveries(recoveries)
  const userGrowthChartData = accountGrowth(users)

  return (
    <div className="space-y-8 font-sans text-zinc-100">
      
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-indigo-400" /> Platform Statistics
        </h1>
        <p className="text-zinc-400 text-sm mt-1">Review operational trends, customer acquisition metrics, and restoration history graphs.</p>
      </div>

      {/* Aggregate Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statsSummary.map((stat, i) => (
          <Card key={i} className="bg-zinc-900 border-zinc-800 shadow-none">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{stat.label}</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="text-2xl font-bold text-white">
                {loading && i === 3 ? "..." : stat.val}
              </div>
              <div className="text-[10px] text-zinc-500 mt-1">{stat.desc}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Chart Section */}
      <div className="grid lg:grid-cols-2 gap-6">
        
        {/* Recoveries Chart */}
        <Card className="bg-zinc-900 border-zinc-800 shadow-none flex flex-col">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-emerald-400" /> Recoveries (Daily)
            </CardTitle>
            <CardDescription className="text-zinc-500 text-xs">Client-reported recovery records from the last seven days.</CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-0 flex-grow">
            <Chart data={recoveriesChartData} color="emerald" suffix=" scans" height={180} />
          </CardContent>
        </Card>

        {/* User Signups Chart */}
        <Card className="bg-zinc-900 border-zinc-800 shadow-none flex flex-col">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-400" /> Registered Accounts
            </CardTitle>
            <CardDescription className="text-zinc-500 text-xs">Account records by creation date. Records without a valid date are omitted.</CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-0 flex-grow">
            <Chart data={userGrowthChartData} color="indigo" suffix=" users" height={180} />
          </CardContent>
        </Card>

      </div>
    </div>
  )
}
