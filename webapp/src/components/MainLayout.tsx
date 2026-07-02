import { useState, useEffect } from "react"
import { Outlet, Link, useLocation } from "react-router-dom"
import { useAuth } from "../contexts/AuthContext"
import SupportWidget from "./SupportWidget"
import { Menu, X, Bell, Sun, Moon } from "lucide-react"
import { db } from "../firebase"
import { collection, query, where, onSnapshot } from "firebase/firestore"
import { useTelemetrySync } from "../hooks/useTelemetrySync"
import { useToastStore } from "../store/useToastStore"

export default function MainLayout() {
  const { user, userData, adminData, login, logout, loading } = useAuth()
  const location = useLocation()

  const handleLogin = async () => {
    let loginSuccess = false;
    let toastShown = false;
    let popupRef: Window | null = null;
    let checkInterval: any = null;

    const originalOpen = window.open;
    // Override window.open to capture the popup window when Firebase opens it
    window.open = function(...args) {
      const win = originalOpen.apply(this, args);
      popupRef = win;
      // Restore window.open immediately upon capturing
      window.open = originalOpen;
      return win;
    };

    // Safe fallback to restore window.open if it's never called
    const restoreTimeout = setTimeout(() => {
      if (window.open !== originalOpen) {
        window.open = originalOpen;
      }
    }, 5000);

    try {
      checkInterval = setInterval(() => {
        if (popupRef && popupRef.closed) {
          clearInterval(checkInterval);
          clearTimeout(restoreTimeout);
          if (window.open !== originalOpen) {
            window.open = originalOpen;
          }
          if (!loginSuccess && !toastShown) {
            toastShown = true;
            useToastStore.getState().addToast("Please check your credentials and try again.", "error", 4500, "Login Failed");
          }
        }
      }, 100);

      await login();
      loginSuccess = true;
      clearInterval(checkInterval);
      clearTimeout(restoreTimeout);
      if (window.open !== originalOpen) {
        window.open = originalOpen;
      }
    } catch (err: any) {
      clearInterval(checkInterval);
      clearTimeout(restoreTimeout);
      if (window.open !== originalOpen) {
        window.open = originalOpen;
      }
      if (loginSuccess) return;

      console.error("Login failed:", err);
      if (!toastShown) {
        toastShown = true;
        const errMsg = err?.code || err?.message || String(err);
        const isCancelled = errMsg.includes("cancelled") || errMsg.includes("closed") || errMsg.includes("popup-closed-by-user");
        useToastStore.getState().addToast(
          isCancelled ? "Sign-in was cancelled." : `Sign-in failed: ${errMsg}`,
          "error",
          7000,
          "Login Failed"
        );
      }
    }
  }
  
  // Keep platform stats in sync in the background when admin is logged in
  useTelemetrySync()
  const isToolPage = location.pathname === "/tool"
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [notifications, setNotifications] = useState<any[]>([])
  const [notificationMenuOpen, setNotificationMenuOpen] = useState(false)
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
  }, [theme])

  // Listen for custom theme events (e.g. if updated elsewhere or on outer pages)
  useEffect(() => {
    const handleThemeChange = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail === 'light' || customEvent.detail === 'dark') {
        setTheme(customEvent.detail);
      }
    };
    window.addEventListener("takeoutfix-theme-changed", handleThemeChange);
    return () => window.removeEventListener("takeoutfix-theme-changed", handleThemeChange);
  }, []);

  // Close menus on page transition
  useEffect(() => {
    setMobileMenuOpen(false)
    setProfileMenuOpen(false)
    setNotificationMenuOpen(false)
  }, [location])

  // Click outside listener for profile menu
  useEffect(() => {
    if (!profileMenuOpen) return
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.profile-menu-container')) {
        setProfileMenuOpen(false)
      }
    }
    document.addEventListener('click', handleOutsideClick)
    return () => document.removeEventListener('click', handleOutsideClick)
  }, [profileMenuOpen])

  // Click outside listener for notification menu
  useEffect(() => {
    if (!notificationMenuOpen) return
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.notification-menu-container')) {
        setNotificationMenuOpen(false)
      }
    }
    document.addEventListener('click', handleOutsideClick)
    return () => document.removeEventListener('click', handleOutsideClick)
  }, [notificationMenuOpen])

  // Real-time listener for support ticket notifications
  useEffect(() => {
    if (!user) {
      setNotifications([])
      return
    }
    const q = query(
      collection(db, "tickets"),
      where("uid", "==", user.uid),
      where("status", "==", "RESOLVED")
    )
    const unsubscribe = onSnapshot(q, (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      setNotifications(list)
    }, (err) => {
      console.warn("Notifications listener error:", err)
    })
    
    return unsubscribe
  }, [user])

  const isAdmin = userData?.isAdmin || !!adminData

  const renderNavLink = (to: string, label: string) => {
    const active = location.pathname === to
    return (
      <Link 
        to={to} 
        className={`text-sm font-medium transition-colors duration-150 ${
          active 
            ? 'text-white' 
            : 'text-zinc-400 hover:text-white'
        }`}
      >
        {label}
      </Link>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-black text-white selection:bg-indigo-500/30">
      <nav 
        id="navbar"
        className="fixed top-0 left-0 right-0 w-full z-50 px-6 md:px-8 py-2.5 transition-all duration-300 nav-header"
      >
        <div className="w-full flex items-center justify-between relative z-10">
          <div className="flex items-center gap-2 md:gap-8">
            {/* Left Hamburger Menu Icon (mobile and tablet: lg:hidden) */}
            <button 
              onClick={() => {
                setMobileMenuOpen(!mobileMenuOpen)
                setProfileMenuOpen(false)
                setNotificationMenuOpen(false)
              }}
              className="lg:hidden p-1 text-white/80 hover:text-white focus:outline-none transition-colors mr-1"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            <Link to="/" className="text-[17px] font-semibold tracking-tight text-white flex items-center gap-2" onClick={() => setMobileMenuOpen(false)}>
              <svg className="w-5 h-5 md:w-6 md:h-6 flex-shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#a855f7" />
                  </linearGradient>
                </defs>
                <rect x="9" y="1" width="1.5" height="1.5" fill="url(#logo-grad)" />
                <rect x="14" y="2" width="1.5" height="1.5" fill="url(#logo-grad)" />
                <rect x="11" y="4" width="1.5" height="1.5" fill="url(#logo-grad)" />
                <rect x="8" y="5" width="1.5" height="1.5" fill="url(#logo-grad)" />
                <rect x="15" y="5" width="1.5" height="1.5" fill="url(#logo-grad)" />
                <rect x="10" y="7" width="1.5" height="1.5" fill="url(#logo-grad)" />
                <rect x="13" y="7" width="1.5" height="1.5" fill="url(#logo-grad)" />
                <path d="M8 10H4C2.89543 10 2 10.8954 2 12V20C2 21.1046 2.89543 22 4 22H20C21.1046 22 22 21.1046 22 20V12C22 10.8954 21.1046 10 20 10H16" stroke="url(#logo-grad)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M2 20L8 14L13 19L18 13L22 17" stroke="url(#logo-grad)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="16" cy="14" r="1.5" fill="url(#logo-grad)" />
              </svg>
              <span className="text-base md:text-lg font-semibold tracking-tight">TakeoutFix</span>
            </Link>

            {/* Marketing Links (Desktop only: lg:flex) */}
            <div className="hidden lg:flex gap-8 text-sm font-medium ml-4">
              {renderNavLink("/", "Home")}
              {renderNavLink("/restore-data", "Restore Guide")}
              {renderNavLink("/pricing", "Pricing")}
              {renderNavLink("/reviews", "Reviews")}
              {renderNavLink("/support", "Support & FAQ")}
            </div>
          </div>
          
          <div className="flex items-center gap-2.5 md:gap-6">
            {!loading && (
              <>
                {/* Desktop Theme Toggle */}
                <button 
                  onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                  className={`btn-theme-toggle-navbar flex p-2 rounded-full border hover:scale-[1.02] focus:outline-none transition-all items-center justify-center ${
                    theme === 'light'
                      ? 'bg-zinc-100 border-zinc-200 text-zinc-800 hover:bg-zinc-200 hover:text-zinc-900'
                      : 'bg-zinc-900 border-zinc-800 text-white/80 hover:bg-zinc-800 hover:text-white'
                  }`}
                  title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
                >
                  {theme === 'light' ? (
                    <Moon className="w-4 h-4" />
                  ) : (
                    <Sun className="w-4 h-4" />
                  )}
                </button>

                {user && (
                  <div className="relative notification-menu-container">
                    <button 
                      onClick={() => {
                        setNotificationMenuOpen(!notificationMenuOpen)
                        setMobileMenuOpen(false)
                        setProfileMenuOpen(false)
                      }}
                      className="btn-notification-navbar relative p-2 rounded-full bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 hover:scale-[1.02] focus:outline-none transition-all flex items-center justify-center"
                    >
                      <Bell className="w-4 h-4 text-white/80" />
                      {notifications.length > 0 && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-[9px] font-bold text-white animate-pulse">
                          {notifications.length}
                        </span>
                      )}
                    </button>

                    {/* Notification Dropdown Menu */}
                    {notificationMenuOpen && (
                      <div 
                        className="absolute right-0 top-full mt-2 w-72 bg-zinc-950/95 border border-white/10 rounded-xl py-2.5 shadow-2xl backdrop-blur-xl z-[100] animate-in fade-in slide-in-from-top-2 duration-200"
                        style={{ boxShadow: '0 10px 40px rgba(0,0,0,0.6)' }}
                      >
                        <div className="px-4 py-2 border-b border-white/5 mb-1.5 text-left flex justify-between items-center">
                          <p className="text-xs text-white/40 font-bold uppercase tracking-wider">Notifications</p>
                          {notifications.length > 0 && (
                            <span className="text-[10px] text-indigo-400 font-bold font-mono">{notifications.length} Alert{notifications.length > 1 ? 's' : ''}</span>
                          )}
                        </div>

                        <div className="max-h-60 overflow-y-auto">
                          {notifications.length === 0 ? (
                            <div className="px-4 py-6 text-center text-xs text-white/50">
                              No new notifications
                            </div>
                          ) : (
                            notifications.map(n => (
                              <Link 
                                key={n.id} 
                                to="/support?tab=tickets" 
                                className="block px-4 py-2.5 hover:bg-white/5 text-left border-b border-white/5 last:border-0 transition-colors"
                                onClick={() => setNotificationMenuOpen(false)}
                              >
                                <div className="text-[11px] font-bold text-white truncate flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                  Ticket Resolved: {n.ticketId}
                                </div>
                                <p className="text-xs text-white/60 truncate mt-0.5">{n.subject}</p>
                                <span className="text-[9px] text-white/30 block mt-1">Click to view resolution</span>
                              </Link>
                            ))
                          )}
                        </div>

                        <div className="border-t border-white/5 mt-1.5 pt-2 px-3">
                          <Link 
                            to="/support?tab=tickets" 
                            className="block text-center text-[10px] font-bold text-indigo-400 hover:text-indigo-300 uppercase tracking-wider py-1.5 bg-white/5 rounded-md hover:bg-white/10 transition-all"
                            onClick={() => setNotificationMenuOpen(false)}
                          >
                            View Support Center
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {user ? (
                  <>
                    {/* Tablet/Desktop App Links (md:flex) */}
                    <div className="hidden md:flex items-center gap-6 mr-1">
                      {!isAdmin && renderNavLink("/dashboard", "Dashboard")}
                      {renderNavLink("/tool", "Restore My Data")}
                      {isAdmin && renderNavLink("/admin", "Admin Center")}
                    </div>

                    {/* Unified Profile Button Trigger */}
                    <div className="relative profile-menu-container">
                      <button 
                        onClick={() => {
                          setProfileMenuOpen(!profileMenuOpen)
                          setMobileMenuOpen(false)
                          setNotificationMenuOpen(false)
                        }}
                        className="btn-profile-trigger flex items-center gap-2 p-1 lg:px-3 lg:py-1.5 rounded-full bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 hover:scale-[1.02] focus:outline-none transition-all shadow-sm"
                      >
                        <span className="text-xs font-semibold text-white/80 select-none hidden lg:inline-block">
                          Hi, {userData?.firstName || user.displayName?.split(" ")[0] || "User"}
                        </span>
                        <div className="profile-avatar-circle w-7 h-7 rounded-full bg-zinc-950 flex items-center justify-center font-bold text-xs text-white border border-white/10 flex-shrink-0 overflow-hidden">
                          {userData?.photoURL || user.photoURL ? (
                            <img 
                              src={userData?.photoURL || user.photoURL || undefined} 
                              alt="" 
                              className="w-full h-full object-cover" 
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            userData?.firstName?.charAt(0).toUpperCase() || user.displayName?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase() || 'U'
                          )}
                        </div>
                      </button>

                      {/* Profile Dropdown Menu - anchored directly below (Desktop Only) */}
                      {profileMenuOpen && (
                        <div 
                          className="hidden lg:block absolute right-0 top-full mt-2 w-56 bg-zinc-950/95 border border-white/10 rounded-xl py-2 shadow-2xl backdrop-blur-xl z-[100] animate-in fade-in slide-in-from-top-2 duration-200"
                          style={{ boxShadow: '0 10px 40px rgba(0,0,0,0.6)' }}
                        >
                          {/* User Header */}
                          <div className="px-4 py-2 border-b border-white/5 mb-1.5 text-left">
                            <p className="text-xs text-white/40 font-bold uppercase tracking-wider">Account</p>
                            <p className="text-sm font-semibold text-white truncate max-w-full">
                              {userData?.firstName || userData?.lastName 
                                ? `${userData.firstName || ''} ${userData.lastName || ''}`.trim() 
                                : (userData?.displayName || user.displayName || 'User')}
                            </p>
                            {userData?.username && (
                              <p className="text-xs text-indigo-400 font-semibold font-mono truncate max-w-full">@{userData.username}</p>
                            )}
                            <p className="text-[11px] text-indigo-400/80 font-bold uppercase tracking-wider mt-0.5">
                              {userData?.plan === 'pro' ? 'Pro Tier' : userData?.plan === 'super' ? 'Super Tier' : userData?.plan === 'recovery_pass' ? 'Single Pass' : 'Free Tier'}
                            </p>
                          </div>

                          {/* Menu Actions (desktop dropdown has ONLY Profile and Sign Out) */}
                          <Link 
                            to="/profile" 
                            className="flex items-center px-4 py-2 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors text-left w-full"
                            onClick={() => setProfileMenuOpen(false)}
                          >
                            Profile
                          </Link>

                          <div className="border-t border-white/5 mt-1.5 pt-1.5">
                            <button 
                              onClick={() => {
                                logout()
                                setProfileMenuOpen(false)
                              }}
                              className="flex items-center px-4 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/5 transition-colors text-left w-full font-medium"
                            >
                              Sign Out
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="relative flex flex-col items-end">
                    <button 
                      onClick={handleLogin} 
                      className="rounded-lg bg-white hover:bg-white/90 text-black border-none px-4 py-2 font-semibold text-xs md:text-sm transition-all shadow-sm"
                    >
                      Get Started
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Mobile/Tablet Left Hamburger Menu Overlay */}
        {mobileMenuOpen && (
          <div className="lg:hidden mt-4 pt-4 border-t border-white/5 flex flex-col gap-3 text-left px-2 animate-in fade-in slide-in-from-top-2 duration-200">
            {/* Marketing Links (visible in hamburger for mobile and tablet) */}
            <p className="text-xs font-bold text-white/30 uppercase tracking-wider px-2 mt-1 mb-1">Navigation</p>
            <Link to="/" className="py-2 px-2 text-white/70 hover:text-white hover:bg-white/5 rounded-md text-sm font-medium transition-all" onClick={() => setMobileMenuOpen(false)}>Home</Link>
            <Link to="/restore-data" className="py-2 px-2 text-white/70 hover:text-white hover:bg-white/5 rounded-md text-sm font-medium transition-all" onClick={() => setMobileMenuOpen(false)}>Restore Guide</Link>
            <Link to="/pricing" className="py-2 px-2 text-white/70 hover:text-white hover:bg-white/5 rounded-md text-sm font-medium transition-all" onClick={() => setMobileMenuOpen(false)}>Pricing</Link>
            <Link to="/reviews" className="py-2 px-2 text-white/70 hover:text-white hover:bg-white/5 rounded-md text-sm font-medium transition-all" onClick={() => setMobileMenuOpen(false)}>Reviews</Link>
            <Link to="/support" className="py-2 px-2 text-white/70 hover:text-white hover:bg-white/5 rounded-md text-sm font-medium transition-all" onClick={() => setMobileMenuOpen(false)}>Support & FAQ</Link>

            {/* Authenticated Tools */}
            {user && (
              <div className="border-t border-white/5 pt-3 flex flex-col gap-3">
                <p className="text-xs font-bold text-white/30 uppercase tracking-wider px-2 mb-1">App Tools</p>
                {!isAdmin && (
                  <Link to="/dashboard" className="py-2 px-2 text-white/70 hover:text-white hover:bg-white/5 rounded-md text-sm font-medium transition-all" onClick={() => setMobileMenuOpen(false)}>Dashboard</Link>
                )}
                <Link to="/tool" className="py-2 px-2 text-white/70 hover:text-white hover:bg-white/5 rounded-md text-sm font-medium transition-all" onClick={() => setMobileMenuOpen(false)}>Restore My Data</Link>
                {isAdmin && (
                  <Link to="/admin" className="py-2 px-2 text-white/70 hover:text-white hover:bg-white/5 rounded-md text-sm font-medium transition-all" onClick={() => setMobileMenuOpen(false)}>Admin Center</Link>
                )}
              </div>
            )}
            
            {!user && (
              <div className="border-t border-white/5 pt-4 flex flex-col items-center gap-1.5 w-full">
                <button 
                  onClick={async () => {
                    await handleLogin()
                  }}
                  className="w-full py-2.5 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:opacity-90 text-white border-0 shadow-[0_0_20px_rgba(99,102,241,0.4)] font-semibold text-sm transition-all"
                >
                  Get Started
                </button>
              </div>
            )}

            {/* Mobile Theme Toggle Row (Left Overlay) (Hidden) */}
            <div className="flex items-center justify-between py-2 px-2 border-t border-white/5 mt-2 pt-3">
              <span className="text-xs font-bold text-white/30 uppercase tracking-wider">Appearance</span>
              <button 
                onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all ${
                  theme === 'light'
                    ? 'bg-zinc-150 border-zinc-200 text-zinc-800 hover:bg-zinc-200 hover:text-zinc-900'
                    : 'bg-white/[0.04] border-white/10 hover:bg-white/[0.08] text-white/80'
                }`}
              >
                {theme === 'light' ? (
                  <>
                    <Moon className="w-3.5 h-3.5" />
                    <span>Dark Mode</span>
                  </>
                ) : (
                  <>
                    <Sun className="w-3.5 h-3.5" />
                    <span>Light Mode</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Mobile/Tablet Right Profile Hamburger Overlay */}
        {profileMenuOpen && user && (
          <div className="lg:hidden mt-4 pt-4 border-t border-white/5 flex flex-col gap-3 text-left px-2 animate-in fade-in slide-in-from-top-2 duration-200 profile-menu-container">
            <p className="text-xs font-bold text-white/30 uppercase tracking-wider px-2 mb-1">Account</p>
            <div className="px-2 py-1.5 flex items-center gap-2.5 mb-1 bg-white/[0.02] border border-white/5 rounded-xl p-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-xs text-white shadow-[0_0_10px_rgba(99,102,241,0.4)] border border-white/10 flex-shrink-0">
                {userData?.firstName?.charAt(0).toUpperCase() || user.displayName?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-white truncate">
                  {userData?.firstName || user.displayName?.split(" ")[0] || "User"}
                </p>
                {userData?.username && (
                  <p className="text-[10px] text-indigo-400 font-semibold font-mono truncate">@{userData.username}</p>
                )}
                <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider mt-0.5">
                  {userData?.plan === 'pro' ? 'Pro Tier' : userData?.plan === 'super' ? 'Super Tier' : userData?.plan === 'recovery_pass' ? 'Single Pass' : 'Free Tier'}
                </p>
              </div>
            </div>
            <Link to="/profile" className="py-2 px-2 text-white/70 hover:text-white hover:bg-white/5 rounded-md text-sm font-medium transition-all" onClick={() => setProfileMenuOpen(false)}>Profile</Link>
            
            {/* Mobile Theme Toggle Row (Right Overlay) (Hidden) */}
            <div className="flex items-center justify-between py-2 px-2 border-t border-white/5 mt-1 pt-3">
              <span className="text-xs font-bold text-white/30 uppercase tracking-wider">Appearance</span>
              <button 
                onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all ${
                  theme === 'light'
                    ? 'bg-zinc-150 border-zinc-200 text-zinc-800 hover:bg-zinc-200 hover:text-zinc-900'
                    : 'bg-white/[0.04] border-white/10 hover:bg-white/[0.08] text-white/80'
                }`}
              >
                {theme === 'light' ? (
                  <>
                    <Moon className="w-3.5 h-3.5" />
                    <span>Dark Mode</span>
                  </>
                ) : (
                  <>
                    <Sun className="w-3.5 h-3.5" />
                    <span>Light Mode</span>
                  </>
                )}
              </button>
            </div>

            <div className="border-t border-white/5 pt-3">
              <button 
                onClick={() => {
                  logout()
                  setProfileMenuOpen(false)
                }}
                className="py-2 px-2 text-red-400 hover:text-red-300 hover:bg-red-500/5 rounded-md text-sm font-medium transition-all text-left w-full"
              >
                Sign Out
              </button>
            </div>
          </div>
        )}
      </nav>

      <main className="flex-1 pt-16">
        <div key={location.pathname} className="animate-page h-full">
          <Outlet />
        </div>
      </main>

      {/* SupportWidget ONLY on public pages */}
      <SupportWidget />

      <footer className="w-full border-t border-white/5 py-12 bg-black/40 backdrop-blur-md mt-auto">
          <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-white/50 text-sm">
              <span className="w-4 h-4 rounded-sm bg-gradient-to-br from-indigo-500 to-purple-600"></span>
              &copy; 2026 TakeoutFix System Core. All rights reserved.
            </div>
            <div className="flex flex-wrap gap-6 text-sm text-white/40 items-center justify-center md:justify-end">
              <Link to="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
              <Link to="/terms" className="hover:text-white transition-colors">Terms of Service</Link>
              <Link to="/support" className="hover:text-white transition-colors">Support Center</Link>
              <Link to="/support?tab=feedback" className="hover:text-white transition-colors">Give Feedback</Link>
              <a href="mailto:takeoutfix.support@gmail.com" className="text-indigo-400 hover:text-indigo-300 transition-colors font-medium">
                takeoutfix.support@gmail.com
              </a>
            </div>
          </div>
        </footer>
    </div>
  )
}
