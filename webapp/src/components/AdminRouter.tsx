import { BrowserRouter, Routes, Route } from "react-router-dom"
import AdminLayout from "./AdminLayout"
import AdminDashboard from "../react-pages/AdminDashboard"
import AdminUsers from "../react-pages/AdminUsers"
import AdminUserDashboard from "../react-pages/AdminUserDashboard"
import AdminSupport from "../react-pages/AdminSupport"
import AdminReviews from "../react-pages/AdminReviews"
import AdminTeam from "../react-pages/AdminTeam"
import AdminRevenue from "../react-pages/AdminRevenue"
import AdminSettings from "../react-pages/AdminSettings"
import AdminStatistics from "../react-pages/AdminStatistics"
import AdminAudit from "../react-pages/AdminAudit"
import AdminKeys from "../react-pages/AdminKeys"
import { ToolWorkspaceContent } from "../react-pages/ToolWorkspace"
import { ToastContainer } from "./ui/toast"

import { AuthProvider } from "../contexts/AuthContext"

function AdminRouterContent() {
  return (
    <BrowserRouter>
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
          <Route path="statistics" element={<AdminStatistics />} />
          <Route path="audit" element={<AdminAudit />} />
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
