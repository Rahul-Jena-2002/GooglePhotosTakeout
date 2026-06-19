import React, { Suspense } from "react"
import { BrowserRouter, Routes, Route } from "react-router-dom"
import AdminLayout from "./AdminLayout"
import { ToolWorkspaceContent } from "../react-pages/ToolWorkspace"
import { ToastContainer } from "./ui/toast"
import { AuthProvider } from "../contexts/AuthContext"

const AdminDashboard = React.lazy(() => import("../react-pages/AdminDashboard"))
const AdminUsers = React.lazy(() => import("../react-pages/AdminUsers"))
const AdminUserDashboard = React.lazy(() => import("../react-pages/AdminUserDashboard"))
const AdminSupport = React.lazy(() => import("../react-pages/AdminSupport"))
const AdminReviews = React.lazy(() => import("../react-pages/AdminReviews"))
const AdminTeam = React.lazy(() => import("../react-pages/AdminTeam"))
const AdminRevenue = React.lazy(() => import("../react-pages/AdminRevenue"))
const AdminSettings = React.lazy(() => import("../react-pages/AdminSettings"))
const AdminStatistics = React.lazy(() => import("../react-pages/AdminStatistics"))
const AdminAudit = React.lazy(() => import("../react-pages/AdminAudit"))
const AdminKeys = React.lazy(() => import("../react-pages/AdminKeys"))
const AdminPaymentGateway = React.lazy(() => import("../react-pages/AdminPaymentGateway"))
const AdminPlanThresholds = React.lazy(() => import("../react-pages/AdminPlanThresholds"))
const AdminTierFeatures = React.lazy(() => import("../react-pages/AdminTierFeatures"))

const AdminSkeleton = () => (
  <div className="flex items-center gap-3 text-zinc-500 py-12 justify-center w-full">
    <div className="w-4 h-4 border-2 border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
    Loading panel...
  </div>
)

function AdminRouterContent() {
  return (
    <BrowserRouter>
      <Suspense fallback={<AdminSkeleton />}>
        <Routes>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="tool" element={<ToolWorkspaceContent />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="users/dashboard" element={<AdminUserDashboard />} />
            <Route path="support" element={<AdminSupport />} />
            <Route path="reviews" element={<AdminReviews />} />
            <Route path="team" element={<AdminTeam />} />
            <Route path="revenue" element={<AdminRevenue />} />
            <Route path="settings" element={<AdminSettings />} />
            <Route path="keys" element={<AdminKeys />} />
            <Route path="payment-gateway" element={<AdminPaymentGateway />} />
            <Route path="plan-thresholds" element={<AdminPlanThresholds />} />
            <Route path="tier-features" element={<AdminTierFeatures />} />
            <Route path="statistics" element={<AdminStatistics />} />
            <Route path="audit" element={<AdminAudit />} />
            <Route path="*" element={<div className="text-red-500 font-bold p-8">Nested Route Not Found: {window.location.pathname}</div>} />
          </Route>
          <Route path="*" element={<div className="text-red-500 font-bold p-8">Top-level Route Not Found: {window.location.pathname}</div>} />
        </Routes>
      </Suspense>
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
