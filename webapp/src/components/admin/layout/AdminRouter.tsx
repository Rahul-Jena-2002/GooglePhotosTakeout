import React, { Suspense } from "react"
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { ShieldAlert } from "lucide-react"
import AdminLayout from "./AdminLayout"
import { ToolWorkspaceContent } from "../../../react-pages/tool/ToolWorkspace"
import { ToastContainer } from "../../ui/toast"
import { AuthProvider, useAuth } from "../../../contexts/AuthContext"
import { isSuperAdminEmail as checkSuperAdminEmail } from "../../../lib/adminAuth"

// Lazy-loaded admin page bundles
const AdminDashboard      = React.lazy(() => import("../../../react-pages/admin/AdminDashboard"))
const AdminUsers          = React.lazy(() => import("../../../react-pages/admin/AdminUsers"))
const AdminUserDashboard  = React.lazy(() => import("../../../react-pages/admin/AdminUserDashboard"))
const AdminSupport        = React.lazy(() => import("../../../react-pages/admin/AdminSupport"))
const AdminReviews        = React.lazy(() => import("../../../react-pages/admin/AdminReviews"))
const AdminTeam           = React.lazy(() => import("../../../react-pages/admin/AdminTeam"))
const AdminSettings       = React.lazy(() => import("../../../react-pages/admin/AdminSettings"))
const AdminStatistics     = React.lazy(() => import("../../../react-pages/admin/AdminStatistics"))
const AdminAudit          = React.lazy(() => import("../../../react-pages/admin/AdminAudit"))
const AdminKeys           = React.lazy(() => import("../../../react-pages/admin/AdminKeys"))
const AdminPaymentGateway = React.lazy(() => import("../../../react-pages/admin/AdminPaymentGateway"))
const AdminPlanThresholds = React.lazy(() => import("../../../react-pages/admin/AdminPlanThresholds"))
const AdminTierFeatures   = React.lazy(() => import("../../../react-pages/admin/AdminTierFeatures"))
const AdminDev           = React.lazy(() => import("../../../react-pages/admin/AdminDev"))
const AdminTransactions  = React.lazy(() => import("../../../react-pages/admin/AdminTransactions"))
const AdminMonetization  = React.lazy(() => import("../../../react-pages/admin/AdminMonetization"))
const AdminProductCatalogue = React.lazy(() => import("../../../react-pages/admin/AdminProductCatalogue"))

// ---------------------------------------------------------------------------
// Loading skeleton (shown while lazy chunks are fetching)
// ---------------------------------------------------------------------------
const AdminSkeleton = () => (
  <div className="flex items-center gap-3 text-zinc-500 py-12 justify-center w-full">
    <div className="w-4 h-4 border-2 border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
    Loading panel...
  </div>
)

// ---------------------------------------------------------------------------
// Role-based route guard
//
// Usage:
//   <RequireRole allow={["SUPER_ADMIN", "ADMIN"]}><AdminRevenue /></RequireRole>
//
// If the logged-in admin's role is not in `allow`, renders a friendly "Access
// Denied" panel instead of the actual page.  Falls through while auth is still
// loading so we don't flash the error during the initial Firestore fetch.
// ---------------------------------------------------------------------------
type AdminRoleType = "SUPER_ADMIN" | "ADMIN" | "SUPPORT" | "MODERATOR" | "DEVELOPER"

function RequireRole({
  allow,
  children,
}: {
  allow: AdminRoleType[]
  children: React.ReactNode
}) {
  const { user, adminData, loading } = useAuth()
  const isDev = import.meta.env.DEV
  const isSuperAdminEmail = checkSuperAdminEmail(user?.email || adminData?.email)

  // Still loading — show nothing (AdminLayout already shows a spinner)
  if (loading) return null

  const role = isSuperAdminEmail ? "SUPER_ADMIN" : (adminData?.role as AdminRoleType | undefined)
  const permitted = (role != null && allow.includes(role)) || isSuperAdminEmail || isDev

  if (!permitted) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[60vh] p-8 text-center">
        <div className="w-14 h-14 bg-red-500/10 border border-red-500/20 text-red-400 rounded-full flex items-center justify-center mb-5">
          <ShieldAlert className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-bold text-white mb-2">Access Denied</h2>
        <p className="text-zinc-400 text-sm max-w-xs leading-relaxed">
          Your admin role (<span className="text-zinc-200 font-semibold font-mono text-xs">{role ?? "none"}</span>) does not have permission to view this panel.
        </p>
        <p className="text-zinc-600 text-xs mt-4">
          Required: {allow.join(" / ")}
        </p>
      </div>
    )
  }

  return <>{children}</>
}

function RequireDeveloper({ children }: { children: React.ReactNode }) {
  const { user, adminData, loading } = useAuth()
  const isDev = import.meta.env.DEV

  if (loading) return null

  const isSuper = checkSuperAdminEmail(user?.email || adminData?.email)
  const isDeveloper = adminData?.role === "DEVELOPER" || adminData?.role === "SUPER_ADMIN" || isSuper || isDev

  if (!isDeveloper) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[60vh] p-8 text-center">
        <div className="w-14 h-14 bg-red-500/10 border border-red-500/20 text-red-400 rounded-full flex items-center justify-center mb-5">
          <ShieldAlert className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-bold text-white mb-2">Developer Clearance Required</h2>
        <p className="text-zinc-400 text-sm max-w-xs leading-relaxed">
          This panel is restricted to Developer or Super Admin accounts.
        </p>
      </div>
    )
  }

  return <>{children}</>
}

// ---------------------------------------------------------------------------
// Router content (needs to live inside AuthProvider)
// ---------------------------------------------------------------------------
function AdminRouterContent() {
  return (
    <BrowserRouter>
      <Suspense fallback={<AdminSkeleton />}>
        <Routes>
          <Route path="/admin" element={<AdminLayout />}>

            {/* ── Open to all admins ─────────────────────────────────────────── */}
            <Route index element={<AdminDashboard />} />
            <Route path="tool"  element={<ToolWorkspaceContent />} />
            
            {/* ── SUPER_ADMIN only: Admin Team ──────────────────────────────── */}
            <Route path="team"  element={
              <RequireRole allow={["SUPER_ADMIN"]}>
                <AdminTeam />
              </RequireRole>
            } />
            <Route path="dev" element={
              <RequireDeveloper>
                <AdminDev />
              </RequireDeveloper>
            } />

            {/* ── ADMIN + SUPER_ADMIN only ───────────────────────────────────── */}
            <Route path="users" element={
              <RequireRole allow={["SUPER_ADMIN", "ADMIN"]}>
                <AdminUsers />
              </RequireRole>
            } />
            <Route path="users/dashboard" element={
              <RequireRole allow={["SUPER_ADMIN", "ADMIN"]}>
                <AdminUserDashboard />
              </RequireRole>
            } />
            <Route path="revenue" element={<Navigate to="/admin" replace />} />
            <Route path="payments" element={
              <RequireRole allow={["SUPER_ADMIN", "ADMIN"]}>
                <AdminTransactions />
              </RequireRole>
            } />
            <Route path="statistics" element={
              <RequireRole allow={["SUPER_ADMIN", "ADMIN"]}>
                <AdminStatistics />
              </RequireRole>
            } />
            <Route path="monetization" element={
              <RequireRole allow={["SUPER_ADMIN", "ADMIN"]}>
                <AdminMonetization />
              </RequireRole>
            } />
            <Route path="catalog" element={
              <RequireRole allow={["SUPER_ADMIN", "ADMIN"]}>
                <AdminProductCatalogue />
              </RequireRole>
            } />
            <Route path="products" element={<Navigate to="/admin/catalog" replace />} />
            <Route path="product-catalogue" element={<Navigate to="/admin/catalog" replace />} />
            <Route path="audit" element={
              <RequireRole allow={["SUPER_ADMIN", "ADMIN"]}>
                <AdminAudit />
              </RequireRole>
            } />

            {/* ── Open to SUPPORT + ADMIN + SUPER_ADMIN ─────────────────────────── */}
            <Route path="support" element={
              <RequireRole allow={["SUPER_ADMIN", "ADMIN", "SUPPORT"]}>
                <AdminSupport />
              </RequireRole>
            } />

            {/* ── MODERATOR + above ─────────────────────────────────────────── */}
            <Route path="reviews" element={
              <RequireRole allow={["SUPER_ADMIN", "ADMIN", "MODERATOR"]}>
                <AdminReviews />
              </RequireRole>
            } />

            {/* ── SUPER_ADMIN only (most sensitive) ─────────────────────────── */}
            <Route path="settings" element={
              <RequireRole allow={["SUPER_ADMIN"]}>
                <AdminSettings />
              </RequireRole>
            } />
            <Route path="keys" element={
              <RequireRole allow={["SUPER_ADMIN"]}>
                <AdminKeys />
              </RequireRole>
            } />
            <Route path="payment-gateway" element={
              <RequireRole allow={["SUPER_ADMIN"]}>
                <AdminPaymentGateway />
              </RequireRole>
            } />
            <Route path="plan-thresholds" element={
              <RequireRole allow={["SUPER_ADMIN"]}>
                <AdminPlanThresholds />
              </RequireRole>
            } />
            <Route path="tier-features" element={
              <RequireRole allow={["SUPER_ADMIN"]}>
                <AdminTierFeatures />
              </RequireRole>
            } />

            {/* ── Fallback ─────────────────────────────────────────────────── */}
            <Route path="*" element={
              <div className="text-zinc-500 font-bold p-8 text-center">
                Page not found — check the URL.
              </div>
            } />
          </Route>

          {/* Top-level non-admin fallback — shouldn't normally be reached */}
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </Suspense>
      <ToastContainer />
    </BrowserRouter>
  )
}

// ---------------------------------------------------------------------------
// Default export — wraps AdminRouterContent in AuthProvider
// ---------------------------------------------------------------------------
export default function AdminRouter() {
  return (
    <AuthProvider>
      <AdminRouterContent />
    </AuthProvider>
  )
}
