import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  ArrowRightLeft,
  AlertTriangle,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  FilePlus2,
  FolderKanban,
  Inbox,
  ShieldCheck,
  Ticket,
  Timer,
  UserCheck,
  Users,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { apiRequest } from "../services/api";
import {
  PaginatedTickets,
  DashboardDistribution,
  DashboardSummary,
  DashboardTrends,
} from "../types";

const STATUS_COLORS: Record<string, string> = {
  open: "#2563EB",
  assigned: "#4F46E5",
  in_progress: "#D97706",
  pending: "#9333EA",
  resolved: "#059669",
  closed: "#64748B",
  transferred: "#0891B2",
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: "#DC2626",
  high: "#EA580C",
  medium: "#0284C7",
  low: "#64748B",
};

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [trendRange, setTrendRange] = useState<"daily" | "weekly" | "monthly">("daily");

  const isEmployee = user?.role === "employee";
  const isAdmin = user?.role === "admin";

  const { data: summary, isLoading: loadingSummary } = useQuery<DashboardSummary>({
    queryKey: ["dashboard-summary", user?.id, user?.role],
    queryFn: () => apiRequest<DashboardSummary>("/dashboard/summary"),
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: 10000,
  });

  const { data: trends, isLoading: loadingTrends } = useQuery<DashboardTrends>({
    queryKey: ["dashboard-trends", user?.id, user?.role],
    queryFn: () => apiRequest<DashboardTrends>("/dashboard/trends"),
    enabled: isAdmin,
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: 10000,
  });

  const { data: distribution, isLoading: loadingDist } = useQuery<DashboardDistribution>({
    queryKey: ["dashboard-distribution", user?.id, user?.role],
    queryFn: () => apiRequest<DashboardDistribution>("/dashboard/distribution"),
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: 10000,
  });

  const { data: activeSlaAlerts } = useQuery<PaginatedTickets>({
    queryKey: ["sla-alerts", user?.id, 1],
    queryFn: () => apiRequest<PaginatedTickets>("/notifications/sla-alerts?page=1&page_size=20"),
    enabled: isAdmin,
    refetchInterval: 10000,
  });

  if (loadingSummary || (isAdmin && loadingTrends) || loadingDist) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-10 bg-slate-200 rounded-lg w-72" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-28 bg-white rounded-xl border border-slate-200 p-5" />
          ))}
        </div>
        <div className="h-80 bg-white rounded-xl border border-slate-200" />
      </div>
    );
  }

  if (!summary || !distribution || !user) return null;

  const kpiCards = [
    {
      label: isEmployee ? "My Total Tickets" : "Total Tickets",
      value: summary.total_tickets,
      sub: `${summary.assigned_tickets} currently assigned`,
      icon: Inbox,
      accent: "text-blue-600 bg-blue-50 border-blue-100",
    },
    {
      label: "Open Tickets",
      value: summary.open_tickets,
      sub: `${summary.unassigned_queue_count} awaiting triage`,
      icon: FolderKanban,
      accent: "text-indigo-600 bg-indigo-50 border-indigo-100",
    },
    {
      label: "In Progress",
      value: summary.in_progress_tickets,
      sub: `${summary.pending_tickets} pending external input`,
      icon: Activity,
      accent: "text-amber-600 bg-amber-50 border-amber-100",
    },
    {
      label: "Resolved Tickets",
      value: summary.resolved_tickets,
      sub: "Verified fix delivered",
      icon: CheckCircle2,
      accent: "text-emerald-600 bg-emerald-50 border-emerald-100",
    },
    {
      label: "Closed Tickets",
      value: summary.closed_tickets,
      sub: "Completed lifecycle",
      icon: ShieldCheck,
      accent: "text-slate-600 bg-slate-100 border-slate-200",
    },
    {
      label: "Transferred Tickets",
      value: summary.transferred_tickets || 0,
      sub: "",
      icon: ArrowRightLeft,
      accent: "text-cyan-700 bg-cyan-50 border-cyan-100",
    },
    {
      label: "Overdue Tickets",
      value: isAdmin ? activeSlaAlerts?.total ?? summary.overdue_tickets : summary.overdue_tickets,
      sub: summary.overdue_tickets > 0 ? "Requires immediate escalation" : "Zero active breaches",
      icon: AlertTriangle,
      accent:
        summary.overdue_tickets > 0
          ? "text-red-600 bg-red-50 border-red-200"
          : "text-emerald-600 bg-emerald-50 border-emerald-100",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {isEmployee
              ? `Welcome back, ${user.full_name.split(" ")[0]}`
              : "Enterprise Service Operations Center"}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {isEmployee
              ? "Monitor your IT service requests, SLA targets, and access self-service knowledge resources."
              : "Real-time telemetry across incident queues, SLA targets, and engineering support teams."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {!isEmployee ? (
            <Link
              to="/reports"
              className="px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors"
            >
              View Full Analytics
            </Link>
          ) : (
            <Link
              to="/tickets/my"
              className="px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors"
            >
              View My Tickets
            </Link>
          )}
          <Link
            to="/tickets/new"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors"
          >
            <FilePlus2 className="w-4 h-4" />
            Create Support Ticket
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.filter(card => !(isEmployee && ["Overdue Tickets", "Transferred Tickets"].includes(card.label))).map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              onClick={() => navigate(card.label === "Transferred Tickets" ? `${isAdmin ? "/tickets" : "/tickets/my"}?status=transferred` : isEmployee ? "/tickets/my" : "/tickets")}
              className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-2xs hover:border-blue-400 hover:shadow-xs transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 group-hover:text-blue-600 transition-colors">
                  {card.label}
                </span>
                <div className={`w-8 h-8 rounded-lg border flex items-center justify-center ${card.accent}`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <span className="text-2xl font-bold text-slate-900 tracking-tight">
                  {card.value}
                </span>
                {card.sub && <span className="text-[11px] text-slate-500">{card.sub}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* EMPLOYEE VIEW: Clean 3-Column Analytics Breakdown (No Ticket Volume Trend & No Recent Support Tickets) */}
      {isEmployee ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 1. Status Distribution */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs flex flex-col justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Ticket Status Distribution</h2>
              <p className="text-xs text-slate-500">Breakdown by current lifecycle stage</p>
            </div>

            <div className="h-48 my-2">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={distribution.by_status.filter((s) => s.value > 0)}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={72}
                    paddingAngle={3}
                  >
                    {distribution.by_status
                      .filter((s) => s.value > 0)
                      .map((entry) => (
                        <Cell key={entry.key} fill={STATUS_COLORS[entry.key] || "#64748B"} />
                      ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
              {distribution.by_status.map((item) => (
                <div
                  key={item.key}
                  className="flex items-center justify-between text-xs px-2 py-1 rounded bg-slate-50"
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: STATUS_COLORS[item.key] || "#64748B" }}
                    />
                    <span className="text-slate-600 font-medium">{item.name}</span>
                  </div>
                  <span className="font-bold text-slate-900">{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 2. Priority Distribution */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs flex flex-col justify-between">
            <div className="mb-3">
              <h2 className="text-sm font-bold text-slate-900">Priority Distribution</h2>
              <p className="text-xs text-slate-500">Your requests by criticality tier</p>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={distribution.by_priority}
                  margin={{ top: 5, right: 10, left: -25, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#475569" }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748B" }} />
                  <Tooltip />
                  <Bar dataKey="value" name="Tickets" radius={[6, 6, 0, 0]} barSize={36}>
                    {distribution.by_priority.map((entry) => (
                      <Cell key={entry.key} fill={PRIORITY_COLORS[entry.key] || "#2563EB"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 3. Category Distribution */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs flex flex-col justify-between">
            <div className="mb-3">
              <h2 className="text-sm font-bold text-slate-900">Ticket Category Distribution</h2>
              <p className="text-xs text-slate-500">Hardware, Software, Network, Access, Security & Other</p>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={distribution.by_category}
                  layout="vertical"
                  margin={{ top: 5, right: 15, left: 10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#64748B" }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#334155" }} width={75} />
                  <Tooltip />
                  <Bar dataKey="value" name="Tickets" fill="#2563EB" radius={[0, 6, 6, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      ) : (
        /* AGENT & ADMIN VIEW: Full Operational Center */
        <>
          <div className={isAdmin ? "grid grid-cols-1 lg:grid-cols-3 gap-6" : "grid grid-cols-1 gap-6"}>
            {/* Ticket Volume Trend (Administrator only) */}
            {isAdmin && (
            <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Ticket Volume Trend (Created vs Resolved)
                  </h2>
                  <p className="text-xs text-slate-500">
                    Live historical ticket inflow and resolution velocity
                  </p>
                </div>
                <div className="inline-flex rounded-lg bg-slate-100 p-0.5 border border-slate-200">
                  {(["daily", "weekly", "monthly"] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setTrendRange(mode)}
                      className={`px-3 py-1 rounded-md text-xs font-semibold capitalize transition-colors cursor-pointer ${
                        trendRange === mode
                          ? "bg-white text-blue-600 shadow-2xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={trends?.[trendRange] || trends?.daily || []}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="colorCreated" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563EB" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorResolved" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#059669" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748B" }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748B" }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#0F172A",
                        borderColor: "#1E293B",
                        borderRadius: "8px",
                        color: "#F8FAFC",
                        fontSize: "12px",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="created"
                      name="Created Tickets"
                      stroke="#2563EB"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorCreated)"
                    />
                    <Area
                      type="monotone"
                      dataKey="resolved"
                      name="Resolved Tickets"
                      stroke="#059669"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorResolved)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            )}

            {/* Status Distribution Donut + Breakdown */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs flex flex-col justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Ticket Status Distribution</h2>
                <p className="text-xs text-slate-500">Breakdown by current lifecycle stage</p>
              </div>

              <div className="h-48 my-2">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={distribution.by_status.filter((s) => s.value > 0)}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={72}
                      paddingAngle={3}
                    >
                      {distribution.by_status
                        .filter((s) => s.value > 0)
                        .map((entry) => (
                          <Cell key={entry.key} fill={STATUS_COLORS[entry.key] || "#64748B"} />
                        ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                {distribution.by_status.map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between text-xs px-2 py-1 rounded bg-slate-50"
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: STATUS_COLORS[item.key] || "#64748B" }}
                      />
                      <span className="text-slate-600 font-medium">{item.name}</span>
                    </div>
                    <span className="font-bold text-slate-900">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Priority + Category Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs">
              <div className="mb-4">
                <h2 className="text-sm font-bold text-slate-900">Priority Distribution</h2>
                <p className="text-xs text-slate-500">Volume by incident criticality tier</p>
              </div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={distribution.by_priority}
                    margin={{ top: 5, right: 15, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#475569" }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748B" }} />
                    <Tooltip />
                    <Bar dataKey="value" name="Tickets" radius={[6, 6, 0, 0]} barSize={42}>
                      {distribution.by_priority.map((entry) => (
                        <Cell key={entry.key} fill={PRIORITY_COLORS[entry.key] || "#2563EB"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs">
              <div className="mb-4">
                <h2 className="text-sm font-bold text-slate-900">Ticket Category Distribution</h2>
                <p className="text-xs text-slate-500">
                  Hardware, Software, Network, Access, Security & Other
                </p>
              </div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={distribution.by_category}
                    layout="vertical"
                    margin={{ top: 5, right: 20, left: 20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#64748B" }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#334155" }} width={80} />
                    <Tooltip />
                    <Bar dataKey="value" name="Tickets" fill="#2563EB" radius={[0, 6, 6, 0]} barSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

        </>
      )}
    </div>
  );
};
