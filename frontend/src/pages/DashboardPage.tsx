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
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  FilePlus2,
  FolderKanban,
  Inbox,
  ShieldCheck,
  Timer,
  Users,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { apiRequest } from "../services/api";
import {
  DashboardDistribution,
  DashboardSummary,
  DashboardTrends,
} from "../types";
import { PriorityBadge, SLABadge, StatusBadge } from "../components/ui/Badges";
import { formatRelativeTime } from "../utils/format";

const STATUS_COLORS: Record<string, string> = {
  open: "#2563EB",
  assigned: "#4F46E5",
  in_progress: "#D97706",
  pending: "#9333EA",
  resolved: "#059669",
  closed: "#64748B",
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

  const { data: summary, isLoading: loadingSummary } = useQuery<DashboardSummary>({
    queryKey: ["dashboard-summary"],
    queryFn: () => apiRequest<DashboardSummary>("/dashboard/summary"),
  });

  const { data: trends, isLoading: loadingTrends } = useQuery<DashboardTrends>({
    queryKey: ["dashboard-trends"],
    queryFn: () => apiRequest<DashboardTrends>("/dashboard/trends"),
  });

  const { data: distribution, isLoading: loadingDist } = useQuery<DashboardDistribution>({
    queryKey: ["dashboard-distribution"],
    queryFn: () => apiRequest<DashboardDistribution>("/dashboard/distribution"),
  });

  if (loadingSummary || loadingTrends || loadingDist) {
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

  if (!summary || !trends || !distribution || !user) return null;

  const activeTrendData = trends[trendRange] || trends.daily;

  const kpiCards = [
    {
      label: user.role === "employee" ? "My Total Tickets" : "Total Tickets",
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
      label: "Overdue Tickets",
      value: summary.overdue_tickets,
      sub: summary.overdue_tickets > 0 ? "Requires immediate escalation" : "Zero active breaches",
      icon: AlertTriangle,
      accent:
        summary.overdue_tickets > 0
          ? "text-red-600 bg-red-50 border-red-200"
          : "text-emerald-600 bg-emerald-50 border-emerald-100",
    },
    {
      label: "Avg Resolution Time",
      value: `${summary.avg_resolution_hours}h`,
      sub: "Mean time to resolve (MTTR)",
      icon: Timer,
      accent: "text-sky-600 bg-sky-50 border-sky-100",
    },
    {
      label: "SLA Compliance",
      value: `${summary.sla_compliance_percentage}%`,
      sub: "Target threshold: 95.0%",
      icon: Clock,
      accent:
        summary.sla_compliance_percentage >= 90
          ? "text-emerald-600 bg-emerald-50 border-emerald-100"
          : "text-amber-600 bg-amber-50 border-amber-100",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {user.role === "employee"
              ? "My IT Support Overview"
              : "Enterprise Service Operations Center"}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {user.role === "employee"
              ? "Track your active support requests, SLA status, and resolution updates."
              : "Real-time telemetry across incident queues, SLA targets, and engineering support teams."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {user.role !== "employee" && (
            <Link
              to="/reports"
              className="px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors"
            >
              View Full Analytics
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

      {/* 8 KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-2xs hover:border-slate-300 transition-all"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
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
                <span className="text-[11px] text-slate-500">{card.sub}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts Row 1: Ticket Volume Trend + Status Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Ticket Volume Trend (2 columns wide) */}
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
              <AreaChart data={activeTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
              <div key={item.key} className="flex items-center justify-between text-xs px-2 py-1 rounded bg-slate-50">
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

      {/* Charts Row 2: Priority Distribution + Category Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Priority Distribution */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs">
          <div className="mb-4">
            <h2 className="text-sm font-bold text-slate-900">Priority Distribution</h2>
            <p className="text-xs text-slate-500">Volume by incident criticality tier</p>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distribution.by_priority} margin={{ top: 5, right: 15, left: -20, bottom: 0 }}>
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

        {/* Category Distribution */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs">
          <div className="mb-4">
            <h2 className="text-sm font-bold text-slate-900">Ticket Category Distribution</h2>
            <p className="text-xs text-slate-500">Hardware, Software, Network, Access, Security & Other</p>
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

      {/* Recent Tickets Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Recent Support Tickets</h2>
            <p className="text-xs text-slate-500">Latest incidents and service requests across the platform</p>
          </div>
          <Link
            to={user.role === "employee" ? "/tickets/my" : "/tickets"}
            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
          >
            <span>View All Tickets</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">Ticket ID</th>
                <th className="py-3 px-4">Subject</th>
                <th className="py-3 px-4">Requester</th>
                <th className="py-3 px-4">Assigned Agent</th>
                <th className="py-3 px-4">Priority</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">SLA</th>
                <th className="py-3 px-4 text-right">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {distribution.recent_tickets.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => navigate(`/tickets/${t.ticket_number}`)}
                  className="hover:bg-slate-50/90 cursor-pointer transition-colors"
                >
                  <td className="py-3.5 px-4 font-mono font-semibold text-blue-600 whitespace-nowrap">
                    {t.ticket_number}
                  </td>
                  <td className="py-3.5 px-4 max-w-xs">
                    <p className="font-semibold text-slate-900 truncate">{t.subject}</p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {t.category_name} {t.subcategory ? `• ${t.subcategory}` : ""}
                    </p>
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <p className="font-medium text-slate-800">{t.requester.full_name}</p>
                    <p className="text-[11px] text-slate-500">{t.department_name || "Corporate"}</p>
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    {t.assigned_agent ? (
                      <span className="font-medium text-slate-800">{t.assigned_agent.full_name}</span>
                    ) : (
                      <span className="text-slate-400 italic">Unassigned</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <PriorityBadge priority={t.priority} />
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <SLABadge health={t.sla_health} />
                  </td>
                  <td className="py-3.5 px-4 text-right text-slate-500 whitespace-nowrap">
                    {formatRelativeTime(t.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Agent Performance Table (Visible to IT Support Agents & Administrators) */}
      {user.role !== "employee" && distribution.agent_performance.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Users className="w-4 h-4 text-blue-600" />
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  IT Support Agent Workload & SLA Performance
                </h2>
                <p className="text-xs text-slate-500">
                  Live resolution metrics calculated from assigned enterprise tickets
                </p>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-5">Support Agent</th>
                  <th className="py-3 px-5">Support Team</th>
                  <th className="py-3 px-5 text-center">Assigned Tickets</th>
                  <th className="py-3 px-5 text-center">Resolved Tickets</th>
                  <th className="py-3 px-5 text-center">Pending Workload</th>
                  <th className="py-3 px-5 text-center">Avg Resolution</th>
                  <th className="py-3 px-5 text-right">SLA Compliance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {distribution.agent_performance.map((ag) => (
                  <tr key={ag.agent_id} className="hover:bg-slate-50/60">
                    <td className="py-3.5 px-5">
                      <p className="font-semibold text-slate-900">{ag.agent_name}</p>
                      <p className="text-[11px] text-slate-500 font-mono">{ag.email}</p>
                    </td>
                    <td className="py-3.5 px-5 text-slate-700 font-medium">{ag.support_team}</td>
                    <td className="py-3.5 px-5 text-center font-semibold text-slate-800">
                      {ag.assigned_total}
                    </td>
                    <td className="py-3.5 px-5 text-center">
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold">
                        {ag.resolved_count}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-center">
                      <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 font-semibold">
                        {ag.pending_workload}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-center text-slate-700 font-mono">
                      {ag.avg_resolution_hours}h
                    </td>
                    <td className="py-3.5 px-5 text-right">
                      <span
                        className={`font-bold ${
                          ag.sla_compliance_rate >= 90 ? "text-emerald-600" : "text-amber-600"
                        }`}
                      >
                        {ag.sla_compliance_rate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
