import { useState, useEffect } from "react"
import { useLocation, Link } from "react-router-dom"
import { useAuth, type AdminRole } from "../contexts/AuthContext"
import { db } from "../firebase"
import { collection, query, where, onSnapshot, doc, updateDoc } from "firebase/firestore"
import {
  Search,
  Bell,
  ChevronDown,
  LogOut,
  Settings,
  ActivitySquare,
  Sun,
  Moon,
  Menu
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu"

const BREADCRUMBS: Record<string, string[]> = {
  "/admin": ["Operations", "Dashboard"],
  "/admin/users": ["Operations", "Users"],
  "/admin/support": ["Operations", "Tickets"],
  "/admin/revenue": ["Operations", "Revenue"],
  "/admin/reviews": ["Content", "Reviews"],
  "/admin/statistics": ["Content", "Statistics"],
  "/admin/team": ["System", "Admin Team"],
  "/admin/audit": ["System", "Audit Logs"],
  "/admin/settings": ["System", "Settings"],
}

const ROLE_COLORS: Record<AdminRole, string> = {
  SUPER_ADMIN: "admin-role-super-admin px-1.5 py-0.5",
  ADMIN: "admin-role-admin px-1.5 py-0.5",
  SUPPORT: "admin-role-support px-1.5 py-0.5",
  MODERATOR: "admin-role-moderator px-1.5 py-0.5",
}

const ROLE_LABELS: Record<AdminRole, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  SUPPORT: "Support",
  MODERATOR: "Moderator",
}

export default function AdminTopbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const { user, adminData, logout } = useAuth()
  const location = useLocation()
  const [searchVal, setSearchVal] = useState("")
  const [openTickets, setOpenTickets] = useState(0)
  const [pendingReviews, setPendingReviews] = useState(0)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem("takeoutfix_theme")
      return (saved === 'dark' || saved === 'light') ? saved : 'light'
    }
    return 'light'
  })

  // Synchronize theme with class on HTML element
  useEffect(() => {
    const root = window.document.documentElement
    if (theme === 'light') {
      root.classList.add('light')
      root.classList.remove('dark')
    } else {
      root.classList.add('dark')
      root.classList.remove('light')
    }
    localStorage.setItem("takeoutfix_theme", theme)
    window.dispatchEvent(new CustomEvent("takeoutfix-theme-changed", { detail: theme }))
  }, [theme])

  // Listen for outer theme changes
  useEffect(() => {
    const handleThemeChange = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail === 'light' || customEvent.detail === 'dark') {
        setTheme(customEvent.detail);
      }
    };
    window.addEventListener("takeoutfix-theme-changed", handleThemeChange);
    return () => window.removeEventListener("takeoutfix-theme-changed", handleThemeChange);
  }, [])

  // Get active breadcrumbs
  const path = location.pathname
  const breadcrumb = BREADCRUMBS[path] || ["Admin", "Ops Center"]

  // Listen for open tickets and pending reviews to calculate alerts in real-time
  useEffect(() => {
    const qTickets = query(collection(db, "tickets"), where("status", "==", "OPEN"))
    const unsubTickets = onSnapshot(qTickets, (snap) => {
      setOpenTickets(snap.size)
    }, (err) => console.error("Error loading tickets count in Topbar:", err))

    const qReviews = query(collection(db, "reviews"), where("status", "==", "PENDING"))
    const unsubReviews = onSnapshot(qReviews, (snap) => {
      setPendingReviews(snap.size)
    }, (err) => console.error("Error loading reviews count in Topbar:", err))

    return () => {
      unsubTickets()
      unsubReviews()
    }
  }, [])

  const handleStatusChange = async (status: 'online' | 'idle' | 'offline') => {
    if (!user) return
    try {
      const adminRef = doc(db, 'admins', user.uid)
      await updateDoc(adminRef, { status, lastSeen: Date.now() })
    } catch (err) {
      console.error("Failed to update status manually:", err)
    }
  }

  const role = adminData?.role ?? "ADMIN"
  const currentStatus = adminData?.status ?? "online"
  const totalAlerts = openTickets + pendingReviews

  return (
    <header className="h-16 border-b border-zinc-800 bg-zinc-950/40 backdrop-blur-md sticky top-0 z-40 flex items-center justify-between px-6 admin-topbar">
      
      {/* ─── BREADCRUMBS ─── */}
      <div className="flex items-center gap-2 text-sm font-semibold font-sans">
        {onMenuClick && (
          <button
            onClick={onMenuClick}
            className="md:hidden p-1.5 mr-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition-colors focus:outline-none"
          >
            <Menu className="w-4 h-4" />
          </button>
        )}
        <span className="hidden sm:inline text-zinc-500 hover:text-zinc-400 transition-colors cursor-pointer">TakeoutFix</span>
        <span className="hidden sm:inline text-zinc-700">/</span>
        <span className="text-zinc-400">{breadcrumb[0]}</span>
        <span className="text-zinc-700">/</span>
        <span className="text-white font-black">{breadcrumb[1]}</span>
      </div>

      {/* ─── SEARCH PILL ─── */}
      <div className="hidden md:flex items-center w-80 max-w-xs relative group">
        <Search className="w-4 h-4 text-zinc-500 absolute left-3 group-focus-within:text-zinc-300 transition-colors" />
        <input
          type="text"
          value={searchVal}
          onChange={(e) => setSearchVal(e.target.value)}
          placeholder="Search logs, tickets, users..."
          className="w-full h-9 bg-zinc-900/40 hover:bg-zinc-900/60 focus:bg-zinc-950 focus:border-zinc-500 border border-zinc-800/80 rounded-full pl-9 pr-10 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none transition-all"
        />
        <div className="absolute right-3 top-2.5 h-4 px-1.5 rounded bg-zinc-800/50 border border-zinc-700/30 text-[9px] text-zinc-500 font-mono flex items-center justify-center pointer-events-none">
          ⌘K
        </div>
      </div>

      {/* ─── RIGHT SECTION ─── */}
      <div className="flex items-center gap-4">
        
        {/* Admin Presence Quick Status Selector */}
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800 text-[11px] font-medium text-zinc-300 transition-all focus:outline-none select-none">
            <span className={`w-2 h-2 rounded-full ${
              currentStatus === 'online' ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.4)]' : 
              currentStatus === 'idle' ? 'bg-amber-400' : 'bg-zinc-500'
            }`} />
            <span className="capitalize">{currentStatus}</span>
            <ChevronDown className="w-3 h-3 text-zinc-500" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="bg-zinc-900 border-zinc-800 text-zinc-200 min-w-[120px] p-1 shadow-2xl">
            <DropdownMenuLabel className="text-[10px] text-zinc-500 uppercase tracking-wider px-2 py-1">Set Status</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-zinc-800" />
            <DropdownMenuItem onClick={() => handleStatusChange('online')} className="flex items-center gap-2 px-2 py-1.5 text-xs focus:bg-zinc-800 rounded cursor-pointer">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              Online
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleStatusChange('idle')} className="flex items-center gap-2 px-2 py-1.5 text-xs focus:bg-zinc-800 rounded cursor-pointer">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              Idle
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleStatusChange('offline')} className="flex items-center gap-2 px-2 py-1.5 text-xs focus:bg-zinc-800 rounded cursor-pointer">
              <span className="w-2 h-2 rounded-full bg-zinc-500" />
              Offline
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Theme Toggle Button */}
        <button 
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          className="btn-theme-toggle-navbar flex p-1.5 rounded-full bg-zinc-900/60 border border-zinc-800 hover:bg-zinc-900 hover:scale-[1.02] focus:outline-none transition-all items-center justify-center text-zinc-400 hover:text-zinc-200"
          title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
        >
          {theme === 'light' ? (
            <Moon className="w-4 h-4" />
          ) : (
            <Sun className="w-4 h-4" />
          )}
        </button>

        {/* Notifications Alert Bell */}
        <Link to="/admin/support" className="btn-notification-navbar relative p-1.5 rounded-full hover:bg-zinc-900/60 border border-transparent hover:border-zinc-800 text-zinc-400 hover:text-zinc-200 transition-all">
          <Bell className="w-4.5 h-4.5" />
          {totalAlerts > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 text-[9px] font-bold rounded-full flex items-center justify-center admin-notification-badge animate-bounce">
              {totalAlerts}
            </span>
          )}
        </Link>

        {/* Profile Settings Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger className="btn-profile-trigger flex items-center gap-2 hover:bg-zinc-900/60 p-1 pr-2 rounded-full border border-transparent hover:border-zinc-800 transition-all focus:outline-none">
            {adminData?.photoURL ? (
              <img src={adminData.photoURL} alt="" className="w-7 h-7 rounded-full flex-shrink-0 border border-white/5" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-zinc-800 dark:bg-zinc-200 flex-shrink-0 flex items-center justify-center font-bold text-xs text-zinc-200 dark:text-zinc-900 border border-zinc-700 dark:border-zinc-300">
                {adminData?.displayName?.charAt(0) || "A"}
              </div>
            )}
            <ChevronDown className="w-3 h-3 text-zinc-500" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="bg-zinc-900 border-zinc-800 text-zinc-200 min-w-[200px] p-1 shadow-2xl mr-2">
            <div className="px-3 py-2 border-b border-zinc-800">
              <div className="text-xs font-semibold text-zinc-200 truncate">{adminData?.displayName || "Admin"}</div>
              <div className="text-[10px] text-zinc-500 truncate mt-0.5">{adminData?.email}</div>
              <div className={`text-[9px] font-bold px-1.5 py-0.5 rounded border inline-block mt-2 ${ROLE_COLORS[role as AdminRole]}`}>
                {ROLE_LABELS[role as AdminRole]}
              </div>
            </div>
            
            <div className="p-1">
              <Link to="/admin/settings">
                <DropdownMenuItem className="flex items-center gap-2.5 px-2.5 py-2 text-xs text-zinc-400 hover:text-zinc-200 focus:bg-zinc-800 rounded cursor-pointer">
                  <Settings className="w-3.5 h-3.5 text-zinc-500" />
                  System Settings
                </DropdownMenuItem>
              </Link>
              <Link to="/tool">
                <DropdownMenuItem className="flex items-center gap-2.5 px-2.5 py-2 text-xs text-zinc-400 hover:text-zinc-200 focus:bg-zinc-800 rounded cursor-pointer">
                  <ActivitySquare className="w-3.5 h-3.5 text-zinc-500" />
                  Recovery Center
                </DropdownMenuItem>
              </Link>
            </div>
            
            <DropdownMenuSeparator className="bg-zinc-800" />
            <DropdownMenuItem onClick={logout} className="flex items-center gap-2.5 px-2.5 py-2 text-xs text-red-400 hover:text-red-300 focus:bg-red-500/10 rounded cursor-pointer">
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

      </div>
    </header>
  )
}
