import { BrowserRouter, Routes, Route } from "react-router-dom"
import { Suspense, lazy } from "react"
import AdminLayout from "./AdminLayout"
import { ToolWorkspaceContent } from "../react-pages/ToolWorkspace"
import { ToastContainer } from "./ui/toast"
import { AuthProvider } from "../contexts/AuthContext"

const AdminDashboard = lazy(() => import("../react-pages/AdminDashboard"))
const AdminUsers = lazy(() => import("../react-pages/AdminUsers"))
const AdminUserDashboard = lazy(() => import("../react-pages/AdminUserDashboard"))
const AdminSupport = lazy(() => import("../react-pages/AdminSupport"))
const AdminReviews = lazy(() => import("../react-pages/AdminReviews"))
const AdminTeam = lazy(() => import("../react-pages/AdminTeam"))
const AdminRevenue = lazy(() => import("../react-pages/AdminRevenue"))
const AdminSettings = lazy(() => import("../react-pages/AdminSettings"))
const AdminStatistics = lazy(() => import("../react-pages/AdminStatistics"))
const AdminAudit = lazy(() => import("../react-pages/AdminAudit"))
const AdminKeys = lazy(() => import("../react-pages/AdminKeys"))

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="flex items-center gap-3 text-zinc-400">
        <div className="w-4 h-4 border-2 border-zinc-700 border-t-zinc-300 rounded-full animate-spin" />
        <span className="text-sm">Loading...</span>
      </div>
    </div>
  )
}

function AdminRouterContent() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Suspense fallback={<LoadingFallback />}><AdminDashboard /></Suspense>} />
          <Route path="tool" element={<ToolWorkspaceContent />} />
          <Route path="users" element={<Suspense fallback={<LoadingFallback />}><AdminUsers /></Suspense>} />
          <Route path="users/dashboard" element={<Suspense fallback={<LoadingFallback />}><AdminUserDashboard /></Suspense>} />
          <Route path="support" element={<Suspense fallback={<LoadingFallback />}><AdminSupport /></Suspense>} />
          <Route path="reviews" element={<Suspense fallback={<LoadingFallback />}><AdminReviews /></Suspense>} />
          <Route path="team" element={<Suspense fallback={<LoadingFallback />}><AdminTeam /></Suspense>} />
          <Route path="revenue" element={<Suspense fallback={<LoadingFallback />}><AdminRevenue /></Suspense>} />
          <Route path="settings" element={<Suspense fallback={<LoadingFallback />}><AdminSettings /></Suspense>} />
          <Route path="keys" element={<Suspense fallback={<LoadingFallback />}><AdminKeys /></Suspense>} />
          <Route path="statistics" element={<Suspense fallback={<LoadingFallback />}><AdminStatistics /></Suspense>} />
          <Route path="audit" element={<Suspense fallback={<LoadingFallback />}><AdminAudit /></Suspense>} />
          <Route path="*" element={<div className="text-red-500 font-bold p-8">Nested Route Not Found: {window.location.pathname}</div>} />
        </Route>
        <Route path="*" element={<div className="text-red-500 font-bold p-8">Top-level Route Not Found: {window.location.pathname}</div>} />
      </Routes>
      <ToastContainer />
    </BrowserRouter>
  )
}

export default function AdminRouter() {
  return (
    <AuthProvider>
      <AdminRouterContent />
    </AuthProvider>
  )
}
