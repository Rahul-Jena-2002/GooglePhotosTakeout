import { useState, useEffect, useRef } from "react"
import { useLocation, Link, useNavigate } from "react-router-dom"
import { useAuth, type AdminRole } from "../contexts/AuthContext"
import { db } from "../firebase"
import { collection, query, where, onSnapshot, doc, updateDoc, Timestamp } from "firebase/firestore"
import {
  Search,
  Bell,
  ChevronDown,
  LogOut,
  Settings,
  ActivitySquare,
  Sun,
  Moon,
  Menu,
  LifeBuoy,
  MessageSquareQuote,
  Users2,
  Sparkles,
  CheckCheck,
  Inbox
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
  "/admin/payments": ["Operations", "Payments"],
  "/admin/reviews": ["Content", "Reviews"],
  "/admin/statistics": ["Content", "Statistics"],
  "/admin/team": ["System", "Admin Team"],
  "/admin/audit": ["System", "Audit Logs"],
  "/admin/settings": ["System", "Settings"],
  "/admin/payment-gateway": ["System", "Payment Gateway"],
  "/admin/keys": ["System", "Keys & Secrets"],
  "/admin/plan-thresholds": ["System", "Plan Thresholds"],
  "/admin/tier-features": ["System", "Tier Features"],
  "/admin/dev": ["System", "Dev Options"],
  "/admin/tool": ["Operations", "Tool Center"],
}

const ROLE_COLORS: Record<AdminRole, string> = {
  SUPER_ADMIN: "admin-role-super-admin px-1.5 py-0.5",
  ADMIN: "admin-role-admin px-1.5 py-0.5",
  SUPPORT: "admin-role-support px-1.5 py-0.5",
  MODERATOR: "admin-role-moderator px-1.5 py-0.5",
  DEVELOPER: "admin-role-developer px-1.5 py-0.5",
}

const ROLE_LABELS: Record<AdminRole, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  SUPPORT: "Support",
  MODERATOR: "Moderator",
  DEVELOPER: "Developer",
}

export default function AdminTopbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const { user, adminData, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchVal, setSearchVal] = useState("")
  const [notifications, setNotifications] = useState<any[]>([])
  const [notificationOpen, setNotificationOpen] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)

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

  // Close notifications on location change or outside click
  useEffect(() => {
    setNotificationOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!notificationOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotificationOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [notificationOpen])

  // Get active breadcrumbs
  const path = location.pathname
  const breadcrumb = BREADCRUMBS[path] || ["Admin", "Ops Center"]

  // Real-time notifications listener for Admin (Account-specific + Global offers + Tickets)
  useEffect(() => {
    if (!user) {
      setNotifications([])
      return
    }

    const email = (user.email || adminData?.email || "").toLowerCase()
    let notifItems: any[] = []
    let openTicketItems: any[] = []
    let inviteItems: any[] = []

    const parseTs = (raw: any): number => {
      if (!raw) return Date.now()
      if (typeof raw === "number") return raw
      if (raw instanceof Timestamp) return raw.toMillis()
      if (typeof raw.toMillis === "function") return raw.toMillis()
      if (raw.seconds) return raw.seconds * 1000
      return Date.now()
    }

    const merge = () => {
      const combined = [...inviteItems, ...notifItems, ...openTicketItems].sort(
        (a, b) => (b._ts || 0) - (a._ts || 0)
      )
      setNotifications(combined)
    }

    // 1. Direct and Global notifications (tickets, offers, system alerts, account invites)
    const unsubNotifs = email ? onSnapshot(
      query(collection(db, "notifications"), where("recipientEmail", "in", [email, "all"])),
      snap => {
        notifItems = snap.docs.map(d => {
          const data = d.data()
          return {
            id: d.id,
            _collection: "notifications",
            _type: data.type || "system",
            _ts: parseTs(data.createdAt),
            _read: !!data.read,
            title: data.title || "Notification",
            message: data.message || "",
            href: data.adminLink || data.href || "/admin/support",
            ...data
          }
        }).filter(n => !n._read)
        merge()
      },
      err => console.warn("[AdminTopbar] Notifications listener error:", err)
    ) : () => {}

    // 2. Open tickets count/alerts
    const unsubTickets = onSnapshot(
      query(collection(db, "tickets"), where("status", "==", "OPEN")),
      snap => {
        openTicketItems = snap.docs.slice(0, 5).map(d => {
          const data = d.data()
          return {
            id: `ticket_${d.id}`,
            ticketDocId: d.id,
            _collection: "tickets",
            _type: "OPEN_TICKET",
            _ts: parseTs(data.createdAt),
            _read: false,
            title: `Open Ticket: ${data.ticketId || d.id.slice(0, 8)}`,
            message: `${data.email || 'User'}: ${data.subject || 'Support request'}`,
            href: "/admin/support",
            ...data
          }
        })
        merge()
      },
      err => console.warn("[AdminTopbar] Tickets listener error:", err)
    )

    // 3. Pending admin invites for this email
    const unsubInvites = email ? onSnapshot(
      query(collection(db, "adminInvites"), where("email", "==", email), where("status", "==", "pending")),
      snap => {
        inviteItems = snap.docs.map(d => {
          const data = d.data()
          return {
            id: `invite_${d.id}`,
            inviteDocId: d.id,
            _collection: "adminInvites",
            _type: "ADMIN_INVITE",
            _ts: parseTs(data.createdAt),
            _read: false,
            title: "Admin Team Invitation",
            message: `${data.invitedByName || 'Admin'} invited you as ${(data.role || 'ADMIN').replace('_', ' ')}.`,
            href: "/admin/team",
            ...data
          }
        })
        merge()
      },
      err => console.warn("[AdminTopbar] Invites listener error:", err)
    ) : () => {}

    return () => {
      unsubNotifs()
      unsubTickets()
      unsubInvites()
    }
  }, [user, adminData])

  const handleStatusChange = async (status: 'online' | 'idle' | 'offline') => {
    if (!user) return
    try {
      const adminRef = doc(db, 'admins', user.uid)
      await updateDoc(adminRef, { status, lastSeen: Date.now() })
    } catch (err) {
      console.error("Failed to update status manually:", err)
    }
  }

  const markAllAsRead = async () => {
    const unread = notifications.filter(n => n._collection === "notifications" && !n._read)
    await Promise.allSettled(
      unread.map(n => updateDoc(doc(db, "notifications", n.id), { read: true }))
    )
    setNotifications([])
  }

  const handleNotificationClick = async (notif: any) => {
    setNotificationOpen(false)
    if (notif._collection === "notifications" && notif.id) {
      try {
        await updateDoc(doc(db, "notifications", notif.id), { read: true })
      } catch { /* ignore */ }
    }
    const dest = notif.href || notif.adminLink || "/admin/support"
    navigate(dest)
  }

  const role = adminData?.role ?? "ADMIN"
  const currentStatus = adminData?.status ?? "online"
  const unreadCount = notifications.length

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
        <span className="hidden md:inline text-zinc-400">{breadcrumb[0]}</span>
        <span className="hidden md:inline text-zinc-700">/</span>
        <span className="text-white font-black">{breadcrumb[1]}</span>
      </div>

      {/* ─── SEARCH PILL ─── */}
      <div className="hidden lg:flex items-center w-80 max-w-xs relative group">
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
      <div className="flex items-center gap-2 sm:gap-4">
        
        {/* Admin Presence Quick Status Selector */}
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-1 sm:gap-1.5 px-2 py-1 rounded-full bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800 text-[11px] font-medium text-zinc-300 transition-all focus:outline-none select-none">
            <span className={`w-2 h-2 rounded-full ${
              currentStatus === 'online' ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.4)]' : 
              currentStatus === 'idle' ? 'bg-amber-400' : 'bg-zinc-500'
            }`} />
            <span className="capitalize hidden sm:inline">{currentStatus}</span>
            <ChevronDown className="w-3 h-3 text-zinc-500 hidden sm:inline" />
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
          className={`btn-theme-toggle-navbar hidden sm:flex p-1.5 rounded-full border hover:scale-[1.02] focus:outline-none transition-all items-center justify-center ${
            theme === 'light'
              ? 'bg-zinc-100 border-zinc-200 text-zinc-800 hover:bg-zinc-200 hover:text-zinc-900'
              : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-zinc-255 hover:text-zinc-200'
          }`}
          title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
        >
          {theme === 'light' ? (
            <Moon className="w-4 h-4" />
          ) : (
            <Sun className="w-4 h-4" />
          )}
        </button>

        {/* Notifications Alert Bell & Real-time Dropdown */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotificationOpen(!notificationOpen)}
            className="btn-notification-navbar relative p-1.5 rounded-full hover:bg-zinc-900/60 border border-transparent hover:border-zinc-800 text-zinc-400 hover:text-zinc-200 transition-all focus:outline-none cursor-pointer"
            title="Notifications"
          >
            <Bell className="w-4.5 h-4.5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 text-[9px] font-bold rounded-full flex items-center justify-center bg-red-500 text-white shadow-sm animate-pulse">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          {/* Real-time Notification Dropdown Popover */}
          {notificationOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 max-w-[90vw] bg-zinc-950 border border-zinc-800 rounded-xl py-2 shadow-2xl backdrop-blur-2xl z-[100] animate-in fade-in slide-in-from-top-2 duration-200 text-left">
              <div className="px-4 py-2 border-b border-zinc-800/80 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white uppercase tracking-wider">Alerts & Queue</span>
                  {unreadCount > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-extrabold bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                      {unreadCount}
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="text-[10px] text-zinc-400 hover:text-indigo-400 transition-colors flex items-center gap-1 font-semibold"
                  >
                    <CheckCheck className="w-3 h-3" /> Mark all read
                  </button>
                )}
              </div>

              <div className="max-h-72 overflow-y-auto divide-y divide-zinc-900">
                {notifications.length === 0 ? (
                  <div className="px-4 py-8 text-center text-xs text-zinc-500">
                    <Inbox className="w-6 h-6 mx-auto mb-2 text-zinc-600" />
                    No active notifications
                  </div>
                ) : (
                  notifications.map((n) => {
                    const isTicket = n._type === "NEW_TICKET" || n._type === "TICKET_REPLY" || n._type === "OPEN_TICKET"
                    const isFeedback = n._type === "NEW_FEEDBACK"
                    const isInvite = n._type === "ADMIN_INVITE"
                    const isPromo = n._type === "FREE_UNLIMITED_PROMO" || n.type === "FREE_UNLIMITED_PROMO"

                    let badgeColor = "bg-zinc-800 text-zinc-400 border-zinc-700"
                    let badgeLabel = "Notification"
                    let IconComponent = Bell

                    if (isTicket) {
                      badgeColor = "bg-red-500/10 text-red-400 border-red-500/20"
                      badgeLabel = n._type === "TICKET_REPLY" ? "Ticket Reply" : "Ticket"
                      IconComponent = LifeBuoy
                    } else if (isFeedback) {
                      badgeColor = "bg-amber-500/10 text-amber-400 border-amber-500/20"
                      badgeLabel = "Feedback"
                      IconComponent = MessageSquareQuote
                    } else if (isInvite) {
                      badgeColor = "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
                      badgeLabel = "Team Invite"
                      IconComponent = Users2
                    } else if (isPromo) {
                      badgeColor = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      badgeLabel = "Global Offer"
                      IconComponent = Sparkles
                    }

                    return (
                      <div
                        key={n.id}
                        onClick={() => handleNotificationClick(n)}
                        className="px-4 py-3 hover:bg-zinc-900/60 transition-colors cursor-pointer group"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded border ${badgeColor} flex items-center gap-1`}>
                            <IconComponent className="w-2.5 h-2.5" />
                            {badgeLabel}
                          </span>
                          <span className="text-[10px] text-zinc-500">
                            {n._ts ? new Date(n._ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                          </span>
                        </div>
                        <div className="text-xs font-bold text-zinc-200 group-hover:text-white truncate">
                          {n.title}
                        </div>
                        <p className="text-[11px] text-zinc-400 line-clamp-2 mt-0.5 leading-snug">
                          {n.message}
                        </p>
                      </div>
                    )
                  })
                )}
              </div>

              <div className="p-2 border-t border-zinc-800/80 bg-zinc-950/80">
                <Link
                  to="/admin/support"
                  onClick={() => setNotificationOpen(false)}
                  className="block text-center py-1.5 text-[11px] font-bold text-zinc-300 hover:text-white bg-zinc-900 hover:bg-zinc-800 rounded-lg transition-colors"
                >
                  View Support Desk
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Profile Settings Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger className="btn-profile-trigger flex items-center gap-2 hover:bg-zinc-900/60 p-1 sm:pr-2 rounded-full border border-transparent hover:border-zinc-800 transition-all focus:outline-none">
            {adminData?.photoURL ? (
              <img src={adminData.photoURL} alt="" className="w-7 h-7 rounded-full flex-shrink-0 border border-white/5" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-zinc-900 dark:bg-zinc-200 flex-shrink-0 flex items-center justify-center font-bold text-xs text-zinc-100 dark:text-zinc-900 border border-zinc-800 dark:border-zinc-300">
                {adminData?.displayName?.charAt(0) || "A"}
              </div>
            )}
            <ChevronDown className="w-3 h-3 text-zinc-500 hidden sm:inline" />
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
