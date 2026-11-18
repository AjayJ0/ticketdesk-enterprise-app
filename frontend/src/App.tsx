import React from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AppLayout } from "./layouts/AppLayout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { TicketsListPage } from "./pages/TicketsListPage";
import { CreateTicketPage } from "./pages/CreateTicketPage";
import { TicketDetailPage } from "./pages/TicketDetailPage";
import { KnowledgeBasePage } from "./pages/KnowledgeBasePage";
import { ReportsPage } from "./pages/ReportsPage";
import { UserManagementPage } from "./pages/UserManagementPage";
import { SLAManagementPage } from "./pages/SLAManagementPage";
import { AuditLogsPage } from "./pages/AuditLogsPage";
import { SettingsPage } from "./pages/SettingsPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="tickets/my" element={<TicketsListPage mode="my" />} />
              <Route
                path="tickets"
                element={
                  <ProtectedRoute allowedRoles={["agent", "admin"]}>
                    <TicketsListPage mode="all" />
                  </ProtectedRoute>
                }
              />
              <Route
                path="tickets/assigned"
                element={
                  <ProtectedRoute allowedRoles={["agent", "admin"]}>
                    <TicketsListPage mode="assigned" />
                  </ProtectedRoute>
                }
              />
              <Route path="tickets/new" element={<CreateTicketPage />} />
              <Route path="tickets/:ticketId" element={<TicketDetailPage />} />
              <Route path="knowledge" element={<KnowledgeBasePage />} />
              <Route
                path="reports"
                element={
                  <ProtectedRoute allowedRoles={["agent", "admin"]}>
                    <ReportsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="admin/users"
                element={
                  <ProtectedRoute allowedRoles={["admin"]}>
                    <UserManagementPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="admin/sla"
                element={
                  <ProtectedRoute allowedRoles={["admin"]}>
                    <SLAManagementPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="admin/audit-logs"
                element={
                  <ProtectedRoute allowedRoles={["admin"]}>
                    <AuditLogsPage />
                  </ProtectedRoute>
                }
              />
              <Route path="settings" element={<SettingsPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
