import { Link, Outlet, useLocation, Navigate } from "react-router-dom"
import { useAuth } from "../contexts/AuthContext"
import { useAdminPresence } from "../hooks/useAdminPresence"
import { useTelemetrySync } from "../hooks/useTelemetrySync"
import AdminTopbar from "./AdminTopbar"
import {
  LayoutDashboard,
  Users,
  LifeBuoy,
  CreditCard,
  MessageSquareQuote,
  BarChart3,
  ActivitySquare,
  ShieldCheck,
  Settings,
  ExternalLink,
  Users2,
  Bell,
} from "lucide-react"

export default function AdminLayout() {
  const { userData, adminData, loading } = useAuth()
  const location = useLocation()

  // Activate real-time presence tracking
  useAdminPresence()

  // Keep platform stats in sync in the background when admin is logged in
  useTelemetrySync()

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-zinc-500">
          <div className="w-5 h-5 border-2 border-zinc-700 border-t-indigo-500 rounded-full animate-spin"></div>
          Authenticating...
        </div>
      </div>
    )
  }

  if (!userData?.isAdmin && !adminData) {
    return <Navigate to="/" replace />
  }

  const role = adminData?.role ?? "ADMIN"
  const isSuperAdmin = role === "SUPER_ADMIN"
  const isAdminOrAbove = ["SUPER_ADMIN", "ADMIN"].includes(role)
  const isSupportOrAbove = ["SUPER_ADMIN", "ADMIN", "SUPPORT"].includes(role)
  const isModeratorOrAbove = ["SUPER_ADMIN", "ADMIN", "MODERATOR"].includes(role)

  const navGroups = [
    {
      label: "Operations",
      items: [
        { label: "Dashboard", path: "/admin", icon: LayoutDashboard, show: true },
        { label: "Users", path: "/admin/users", icon: Users, show: isAdminOrAbove },
        { label: "Tickets", path: "/admin/support", icon: LifeBuoy, show: isSupportOrAbove },
        { label: "Revenue", path: "/admin/revenue", icon: CreditCard, show: isAdminOrAbove },
      ],
    },
    {
      label: "Content",
      items: [
        { label: "Reviews", path: "/admin/reviews", icon: MessageSquareQuote, show: isModeratorOrAbove },
        { label: "Statistics", path: "/admin/statistics", icon: BarChart3, show: isAdminOrAbove },
        { label: "Tool Monitor", path: "/admin/tool-monitor", icon: ActivitySquare, show: isAdminOrAbove },
      ],
    },
    {
      label: "System",
      items: [
        { label: "Admin Team", path: "/admin/team", icon: Users2, show: true },
        { label: "Audit Logs", path: "/admin/audit", icon: ShieldCheck, show: isAdminOrAbove },
        { label: "Settings", path: "/admin/settings", icon: Settings, show: isSuperAdmin },
      ],
    },
  ]

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex font-sans">

      {/* ─── SIDEBAR ─── */}
      <aside className="w-60 flex-shrink-0 bg-zinc-900/80 border-r border-zinc-800 flex flex-col h-screen sticky top-0">

        {/* Brand */}
        <div className="px-4 py-5 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/20 flex items-center justify-center text-xs font-bold">M</div>
            <div>
              <div className="font-bold text-sm tracking-tight text-white">TakeoutFix</div>
              <div className="text-[9px] text-zinc-500 font-mono uppercase tracking-[0.15em]">Ops Center</div>
            </div>
          </div>
          <Bell className="w-4 h-4 text-zinc-500 hover:text-zinc-300 cursor-pointer transition-colors" />
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
          {navGroups.map((group) => {
            const visibleItems = group.items.filter(i => i.show)
            if (visibleItems.length === 0) return null
            return (
              <div key={group.label}>
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-600 px-3 mb-1.5">{group.label}</div>
                <div className="space-y-0.5">
                  {visibleItems.map((item) => {
                    const isActive = location.pathname === item.path
                    const Icon = item.icon
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all ${
                          isActive
                            ? "bg-indigo-500/10 text-indigo-400 font-medium"
                            : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                        }`}
                      >
                        <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-indigo-400" : "text-zinc-500"}`} />
                        {item.label}
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        <div className="border-t border-zinc-800 p-3 space-y-1">
          <a
            href="/"
            rel="external"
            onClick={(e) => {
              e.preventDefault()
              window.location.href = "/"
            }}
            className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-all group"
          >
            <ExternalLink className="w-4 h-4 text-zinc-500 group-hover:text-indigo-400 transition-colors" />
            Open Website
          </a>
        </div>
      </aside>

      {/* ─── MAIN CONTENT ─── */}
      <main className="flex-1 flex flex-col min-h-screen overflow-x-hidden">
        <AdminTopbar />
        <div className="flex-grow max-w-7xl w-full mx-auto p-8 overflow-hidden">
          <div key={location.pathname} className="animate-page h-full">
            <Outlet />
          </div>
        </div>
      </main>

    </div>
  )
}
