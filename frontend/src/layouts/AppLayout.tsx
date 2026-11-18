import React, { useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  BookOpen,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  FilePlus2,
  HelpCircle,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings,
  Shield,
  Ticket,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { apiRequest } from "../services/api";
import { NotificationList, PaginatedTickets, RoleType } from "../types";
import { cn, formatRelativeTime } from "../utils/format";
import { RoleBadge } from "../components/ui/Badges";

interface NavItem {
  label: string;
  to: string;
  icon: React.ElementType;
  roles: RoleType[];
  section: "workspace" | "knowledge" | "admin";
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    to: "/dashboard",
    icon: LayoutDashboard,
    roles: ["employee", "agent", "admin"],
    section: "workspace",
  },
  {
    label: "My Tickets",
    to: "/tickets/my",
    icon: Ticket,
    roles: ["employee", "agent", "admin"],
    section: "workspace",
  },
  {
    label: "SLA Alerts",
    to: "/sla-alerts",
    icon: AlertTriangle,
    roles: ["admin"],
    section: "workspace",
  },
  {
    label: "All Tickets",
    to: "/tickets",
    icon: Inbox,
    roles: ["agent", "admin"],
    section: "workspace",
  },
  {
    label: "Assigned to Me",
    to: "/tickets/assigned",
    icon: UserCheck,
    roles: ["admin"],
    section: "workspace",
  },
  {
    label: "Create Ticket",
    to: "/tickets/new",
    icon: FilePlus2,
    roles: ["employee", "agent", "admin"],
    section: "workspace",
  },
  {
    label: "Knowledge Base",
    to: "/knowledge",
    icon: BookOpen,
    roles: ["employee", "agent", "admin"],
    section: "knowledge",
  },
  {
    label: "Reports & Analytics",
    to: "/reports",
    icon: BarChart3,
    roles: ["agent", "admin"],
    section: "knowledge",
  },
  {
    label: "User Management",
    to: "/admin/users",
    icon: Users,
    roles: ["admin"],
    section: "admin",
  },
  {
    label: "SLA Management",
    to: "/admin/sla",
    icon: Clock,
    roles: ["admin"],
    section: "admin",
  },
  {
    label: "Audit Logs",
    to: "/admin/audit-logs",
    icon: ClipboardList,
    roles: ["admin"],
    section: "admin",
  },
  {
    label: "Settings",
    to: "/settings",
    icon: Settings,
    roles: ["agent", "admin"],
    section: "admin",
  },
];

export const AppLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const [notifOpen, setNotifOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const { data: notificationsData } = useQuery<NotificationList>({
    queryKey: ["notifications"],
    queryFn: () => apiRequest<NotificationList>("/notifications?limit=20"),
    refetchInterval: 20000,
  });

  const { data: slaAlerts } = useQuery<PaginatedTickets>({
    queryKey: ["sla-alerts", user?.id, 1],
    queryFn: () => apiRequest<PaginatedTickets>("/notifications/sla-alerts?page=1&page_size=20"),
    enabled: user?.role === "admin",
    refetchInterval: 20000,
    staleTime: 0,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest(`/notifications/${id}/read`, { method: "PATCH" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => apiRequest("/notifications/read-all", { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  if (!user) return null;

  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(user.role));
  const workspaceItems = visibleItems.filter((i) => i.section === "workspace");
  const knowledgeItems = visibleItems.filter((i) => i.section === "knowledge");
  const adminItems = visibleItems.filter((i) => i.section === "admin");

  const handleGlobalSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const term = globalSearch.trim();
    if (!term) return;
    if (term.toUpperCase().startsWith("TKT-")) {
      navigate(`/tickets/${term.toUpperCase()}`);
    } else {
      const targetPath = user.role === "employee" ? "/tickets/my" : "/tickets";
      navigate(`${targetPath}?search=${encodeURIComponent(term)}`);
    }
  };

  const unreadCount = notificationsData?.unread_count || 0;

  const getBreadcrumbLabel = () => {
    const path = location.pathname;
    if (path === "/sla-alerts") return "SLA Alerts";
    if (path.startsWith("/dashboard")) return "Operational Dashboard";
    if (path === "/tickets/new") return "Create Support Ticket";
    if (path === "/tickets/my") return "My Support Tickets";
    if (path === "/tickets/assigned") return "Assigned Queue";
    if (path === "/tickets") return "All Enterprise Tickets";
    if (path.startsWith("/tickets/")) return `Ticket Details / ${path.split("/").pop()}`;
    if (path.startsWith("/knowledge")) return "Enterprise Knowledge Base";
    if (path.startsWith("/reports")) return "Reports & Analytics";
    if (path.startsWith("/admin/users")) return "User & Role Administration";
    if (path.startsWith("/admin/sla")) return "Service Level Agreement Policies";
    if (path.startsWith("/admin/audit-logs")) return "Security & Compliance Audit Logs";
    if (path.startsWith("/profile")) return "Corporate Employee Profile";
    if (path.startsWith("/settings")) return "Platform Settings & Preferences";
    return "Workspace";
  };

  const renderNavSection = (title: string, items: NavItem[]) => {
    if (items.length === 0) return null;
    return (
      <div className="mb-5">
        {!collapsed && (
          <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            {title}
          </p>
        )}
        <div className="space-y-1">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/tickets"}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-slate-300 hover:bg-slate-800/80 hover:text-white",
                    collapsed && "justify-center px-2"
                  )
                }
                title={collapsed ? `${item.label}${item.to === "/sla-alerts" ? ` (${slaAlerts?.total || 0} outstanding)` : ""}` : undefined}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {!collapsed && <span className="truncate">{item.label === "All Tickets" && user.role === "agent" ? "My Team Queue" : item.label}</span>}
                {item.to === "/sla-alerts" && (slaAlerts?.total || 0) > 0 && (
                  <span aria-label={`${slaAlerts?.total} outstanding SLA alerts`}
                    className={cn("rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white", !collapsed && "ml-auto")}>
                    {slaAlerts!.total > 99 ? "99+" : slaAlerts!.total}
                  </span>
                )}
              </NavLink>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Desktop Left Sidebar */}
      <aside
        className={cn(
          "hidden lg:flex flex-col bg-navy-900 text-white border-r border-slate-800 transition-all duration-200 shrink-0 select-none",
          collapsed ? "w-16" : "w-64"
        )}
      >
        {/* Brand Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800/80">
          <Link to="/dashboard" className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shrink-0 shadow-inner">
              <Shield className="w-4 h-4 text-white" />
            </div>
            {!collapsed && (
              <div className="leading-tight">
                <span className="font-bold text-sm tracking-tight text-white block">
                  TicketDesk
                </span>
                <span className="text-[10px] font-medium text-blue-400 uppercase tracking-widest block">
                  Enterprise ITSM
                </span>
              </div>
            )}
          </Link>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {renderNavSection("Service Desk", workspaceItems)}
          {renderNavSection("Intelligence", knowledgeItems)}
          {renderNavSection(user.role === "admin" ? "Administration" : "Preferences", adminItems)}
        </nav>

        {/* Bottom User Card */}
        <div className="p-3 border-t border-slate-800/80 bg-navy-950/50">
          {!collapsed ? (
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => navigate("/profile")}
                className="min-w-0 text-left hover:opacity-90 transition-opacity cursor-pointer"
                title="View Employee Profile"
              >
                <p className="text-xs font-semibold text-white truncate hover:text-blue-400 transition-colors">
                  {user.full_name}
                </p>
                <p className="text-[11px] text-slate-400 truncate">
                  {user.role_info?.display_name || user.role.toUpperCase()}
                </p>
              </button>
              <button
                onClick={() => { void logout(); navigate("/login", { replace: true, state: null }); }}
                className="p-2 rounded-md text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => { void logout(); navigate("/login", { replace: true, state: null }); }}
              className="w-full flex justify-center p-2 rounded-md text-slate-400 hover:text-red-400 hover:bg-slate-800"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </aside>

      {/* Mobile Sidebar Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-64 bg-navy-900 text-white flex flex-col z-10">
            <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
                  <Shield className="w-4 h-4 text-white" />
                </div>
                <span className="font-bold text-sm text-white">TicketDesk Enterprise</span>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 py-4">
              {renderNavSection("Service Desk", workspaceItems)}
              {renderNavSection("Intelligence", knowledgeItems)}
              {renderNavSection("Administration", adminItems)}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Navigation Bar */}
        <header className="h-16 bg-white border-b border-slate-200 px-4 lg:px-8 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-md text-slate-600 hover:bg-slate-100"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500">
              <span className="font-medium text-slate-400">TicketDesk</span>
              <span>/</span>
              <span className="font-semibold text-slate-800 truncate">
                {getBreadcrumbLabel()}
              </span>
            </div>
          </div>

          {/* Global Search */}
          <form onSubmit={handleGlobalSearchSubmit} className="flex-1 max-w-md">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder="Search by Ticket ID (e.g. TKT-2026-0001), subject, or service..."
                className="w-full pl-9 pr-4 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 focus:bg-white transition-all"
              />
            </div>
          </form>

          {/* Right Header Controls */}
          <div className="flex items-center gap-2.5">
            {/* Notifications Dropdown */}
            <div className="relative">
              <button
                onClick={() => {
                  setNotifOpen(!notifOpen);
                  setHelpOpen(false);
                }}
                className="relative p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
                aria-label="Notifications"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                        Notifications
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        {unreadCount} unread alert{unreadCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    {unreadCount > 0 && (
                      <button
                        onClick={() => markAllReadMutation.mutate()}
                        className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                    {(notificationsData?.items || []).length === 0 ? (
                      <div className="py-8 text-center text-xs text-slate-500">
                        No notifications yet.
                      </div>
                    ) : (
                      notificationsData?.items.map((n) => (
                        <div
                          key={n.id}
                          onClick={() => {
                            if (!n.is_read) markReadMutation.mutate(n.id);
                            setNotifOpen(false);
                            if (n.ticket_number) {
                              navigate(`/tickets/${n.ticket_number}`);
                            }
                          }}
                          className={cn(
                            "px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors",
                            !n.is_read && "bg-blue-50/40"
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-semibold text-slate-800">{n.title}</p>
                            {!n.is_read && (
                              <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0 mt-1" />
                            )}
                          </div>
                          <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">{n.message}</p>
                          <span className="text-[10px] text-slate-400 mt-1 block">
                            {formatRelativeTime(n.created_at)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Help / Support Icon */}
            <div className="relative">
              <button
                onClick={() => {
                  setHelpOpen(!helpOpen);
                  setNotifOpen(false);
                }}
                className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
                aria-label="Help & Support"
              >
                <HelpCircle className="w-5 h-5" />
              </button>
              {helpOpen && (
                <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200 p-4 z-50">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Enterprise IT Support
                  </h4>
                  <p className="text-xs text-slate-600 mb-3">
                    Need urgent assistance or self-service runbooks?
                  </p>
                  <div className="space-y-2 text-xs">
                    <button
                      onClick={() => {
                        setHelpOpen(false);
                        navigate("/knowledge");
                      }}
                      className="w-full text-left px-3 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 font-medium text-slate-700 flex items-center justify-between"
                    >
                      <span>Browse Knowledge Base</span>
                      <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                    </button>
                    <button
                      onClick={() => {
                        setHelpOpen(false);
                        navigate("/tickets/new");
                      }}
                      className="w-full text-left px-3 py-2 rounded-lg bg-blue-50 hover:bg-blue-100 font-medium text-blue-700 flex items-center justify-between"
                    >
                      <span>Log New Support Ticket</span>
                      <FilePlus2 className="w-3.5 h-3.5 text-blue-600" />
                    </button>
                    <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                      Emergency SOC Hotline: <strong className="text-slate-700">+1 (800) 555-ITSM</strong>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="hidden md:block h-6 w-px bg-slate-200 mx-1" />

            {/* User Profile + Role Badge (Click name/profile to open read-only Profile Page) */}
            <div className="flex items-center gap-2">
              <div className="hidden md:block">
                <RoleBadge role={user.role} />
              </div>
              <button
                type="button"
                onClick={() => navigate("/profile")}
                className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 border border-transparent hover:border-slate-200 transition-all cursor-pointer group"
                title="Click to view your Employee Profile"
              >
                <div className="w-7 h-7 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0 shadow-2xs">
                  {user.full_name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div className="text-left">
                  <p className="text-xs font-semibold text-slate-800 group-hover:text-blue-600 leading-none transition-colors">
                    {user.full_name}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5 hidden sm:block">
                    {user.department?.name || "Enterprise IT"}
                  </p>
                </div>
              </button>
              <button
                onClick={() => { void logout(); navigate("/login", { replace: true, state: null }); }}
                className="p-2 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        {/* Main Workspace Content */}
        <main className="flex-1 p-4 lg:p-8 max-w-[1600px] w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
