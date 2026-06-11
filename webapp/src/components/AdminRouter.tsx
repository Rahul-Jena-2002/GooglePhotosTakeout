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
import AdminToolMonitor from "../react-pages/AdminToolMonitor"
import AdminAudit from "../react-pages/AdminAudit"
import { ToastContainer } from "./ui/toast"

import { AuthProvider } from "../contexts/AuthContext"

function AdminRouterContent() {
  return (
    <BrowserRouter basename="/admin">
      <Routes>
        <Route path="/" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="users/dashboard/:uid" element={<AdminUserDashboard />} />
          <Route path="support" element={<AdminSupport />} />
          <Route path="reviews" element={<AdminReviews />} />
          <Route path="team" element={<AdminTeam />} />
          <Route path="revenue" element={<AdminRevenue />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="statistics" element={<AdminStatistics />} />
          <Route path="tool-monitor" element={<AdminToolMonitor />} />
          <Route path="audit" element={<AdminAudit />} />
        </Route>
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
