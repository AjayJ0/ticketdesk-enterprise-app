import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { Link } from "react-router-dom";
import { apiRequest, downloadAuthorizedBlob } from "../services/api";
import { AgentPerformanceItem } from "../types";

interface TicketsReportResponse {
  total_tickets: number;
  distinct_requests: number;
  transferred_count: number;
  records: { id: number; ticket_number: string; subject: string; status: string; work_outcome?: string; team?: string }[];
  open_vs_closed: {
    active: number;
    resolved_or_closed: number;
    resolution_rate_percentage: number;
  };
  volume_by_date: { date: string; created: number; resolved: number }[];
  by_category: { category: string; count: number }[];
  by_priority: { priority: string; count: number }[];
}

interface SLAReportResponse {
  total_evaluated: number;
  compliant_count: number;
  breached_count: number;
  overall_compliance_percentage: number;
  average_resolution_hours: number;
  by_priority: {
    priority: string;
    total: number;
    compliant: number;
    breached: number;
    compliance_percentage: number;
    avg_resolution_hours: number;
  }[];
}

export const ReportsPage: React.FC = () => {
  const { user } = useAuth();
  const personal = user?.role === "agent";
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [exporting, setExporting] = useState(false);

  const buildDateQuery = () => {
    const params = new URLSearchParams();
    if (startDate) params.set("start_date", startDate);
    if (endDate) params.set("end_date", endDate);
    return params.toString();
  };

  const { data: ticketsReport, isLoading: loadingTickets } = useQuery<TicketsReportResponse>({
    queryKey: ["reports-tickets", user?.id, startDate, endDate],
    queryFn: () => apiRequest<TicketsReportResponse>(`/reports/tickets?${buildDateQuery()}`),
  });

  const { data: slaReport, isLoading: loadingSLA } = useQuery<SLAReportResponse>({
    queryKey: ["reports-sla", user?.id, startDate, endDate],
    queryFn: () => apiRequest<SLAReportResponse>(`/reports/sla?${buildDateQuery()}`),
  });

  const { data: agentsReport, isLoading: loadingAgents } = useQuery<AgentPerformanceItem[]>({
    queryKey: ["reports-agents", user?.id],
    queryFn: () => apiRequest<AgentPerformanceItem[]>("/reports/agents"),
  });

  const handleExportCSV = async () => {
    setExporting(true);
    try {
      await downloadAuthorizedBlob(
        `/reports/export/csv?${buildDateQuery()}`,
        `ticketdesk_enterprise_report_${new Date().toISOString().slice(0, 10)}.csv`
      );
    } finally {
      setExporting(false);
    }
  };

  if (loadingTickets || loadingSLA || loadingAgents || !ticketsReport || !slaReport) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-10 bg-slate-200 rounded w-72" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 bg-white rounded-xl border border-slate-200" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header + Date Range Filter + CSV Export */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {personal ? "My Work Reports & Analytics" : "Enterprise Reports & SLA Analytics"}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {personal ? "Your individual work records and CSV export, including tickets you transferred. Team queue visibility does not grant access to other consultants’ reports." : "Organization-wide operational intelligence and CSV reports across all support teams."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center gap-1.5 text-xs text-slate-600 px-2">
            <Calendar className="w-4 h-4 text-blue-600" />
            <span className="font-semibold">Date Filter:</span>
          </div>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            aria-label="Start date"
            className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
          />
          <span className="text-xs text-slate-400">to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            aria-label="End date"
            className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
          />
          {(startDate || endDate) && (
            <button
              onClick={() => {
                setStartDate("");
                setEndDate("");
              }}
              className="text-xs font-semibold text-blue-600 hover:underline px-2 cursor-pointer"
            >
              Reset
            </button>
          )}
          <button
            onClick={handleExportCSV}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{exporting ? "Exporting..." : "Export CSV Report"}</span>
          </button>
        </div>
      </div>

      {/* Top Executive Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-semibold uppercase text-slate-500">
            <span>Total Tickets Analyzed</span>
            <FileSpreadsheet className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">{ticketsReport.total_tickets}</p>
          <p className="text-[11px] text-slate-500 mt-1">
            {ticketsReport.open_vs_closed.active} active vs{" "}
            {ticketsReport.open_vs_closed.resolved_or_closed} resolved/closed
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-semibold uppercase text-slate-500">
            <span>Resolution Rate</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">
            {ticketsReport.open_vs_closed.resolution_rate_percentage}%
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Percentage of tickets reaching Resolved/Closed
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-semibold uppercase text-slate-500">
            <span>Overall SLA Compliance</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">
            {slaReport.overall_compliance_percentage}%
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            {slaReport.compliant_count} met SLA • {slaReport.breached_count} breached
          </p>
        </div>


      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-bold">{personal ? "My Ticket Work Records" : "Ticket Records"}</h2>
        <p className="mt-1 text-xs text-slate-600">{ticketsReport.total_tickets} unique ticket records · {ticketsReport.distinct_requests} original employee requests · {ticketsReport.transferred_count} transferred records. A linked successor is a separate work record, not a resolved original ticket.</p>
        <div className="mt-3 divide-y text-xs">{ticketsReport.records?.map(row => <div key={row.id} className="flex flex-wrap justify-between gap-2 py-2">
          <Link to={`/tickets/${row.ticket_number}`} className="font-semibold text-blue-700">{row.ticket_number} — {row.subject}</Link><span>{personal ? row.work_outcome || row.status : row.status} · {row.team}</span>
        </div>)}</div>
      </section>

      {/* Charts: Ticket Volume by Date + Tickets by Category */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs">
          <h2 className="text-sm font-bold text-slate-900">Ticket Volume by Date</h2>
          <p className="text-xs text-slate-500 mb-4">Daily created vs resolved ticket counts</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={ticketsReport.volume_by_date}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748B" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748B" }} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="created"
                  name="Created"
                  stroke="#2563EB"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="resolved"
                  name="Resolved"
                  stroke="#059669"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs">
          <h2 className="text-sm font-bold text-slate-900">Tickets by Category</h2>
          <p className="text-xs text-slate-500 mb-4">Distribution across service domains</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ticketsReport.by_category}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="category" tick={{ fontSize: 11, fill: "#475569" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748B" }} />
                <Tooltip />
                <Bar dataKey="count" name="Tickets" fill="#2563EB" radius={[6, 6, 0, 0]} barSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* SLA Compliance Breakdown by Priority Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-blue-600" />
          <div>
            <h2 className="text-sm font-bold text-slate-900">SLA Compliance by Priority Tier</h2>
            <p className="text-xs text-slate-500">
              Comparison of target resolution performance across Critical, High, Medium, and Low priorities
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-5">Priority Tier</th>
                <th className="py-3 px-5 text-center">Total Tickets</th>
                <th className="py-3 px-5 text-center">Within SLA</th>
                <th className="py-3 px-5 text-center">SLA Breached</th>
                <th className="py-3 px-5 text-right">Compliance Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {slaReport.by_priority.map((row) => (
                <tr key={row.priority} className="hover:bg-slate-50/60">
                  <td className="py-3.5 px-5 font-bold text-slate-900">{row.priority}</td>
                  <td className="py-3.5 px-5 text-center font-semibold">{row.total}</td>
                  <td className="py-3.5 px-5 text-center text-emerald-700 font-semibold">
                    {row.compliant}
                  </td>
                  <td className="py-3.5 px-5 text-center text-red-600 font-semibold">
                    {row.breached}
                  </td>
                  <td className="py-3.5 px-5 text-right font-bold text-slate-900">
                    {row.compliance_percentage}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Agent Workload & Performance Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-sm font-bold text-slate-900">Agent Workload & Resolution Efficiency</h2>
          <p className="text-xs text-slate-500">
            Individual IT Support Agent output and active ticket queue distribution
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-5">Agent Name</th>
                <th className="py-3 px-5">Support Team</th>
                <th className="py-3 px-5 text-center">Assigned</th>
                <th className="py-3 px-5 text-center">Resolved</th>
                <th className="py-3 px-5 text-center">Pending</th>
                <th className="py-3 px-5 text-right">SLA Compliance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {agentsReport?.map((ag) => (
                <tr key={ag.agent_id} className="hover:bg-slate-50/60">
                  <td className="py-3.5 px-5">
                    <p className="font-semibold text-slate-900">{ag.agent_name}</p>
                    <p className="text-[11px] text-slate-500 font-mono">{ag.email}</p>
                  </td>
                  <td className="py-3.5 px-5 text-slate-700">{ag.support_team}</td>
                  <td className="py-3.5 px-5 text-center font-semibold">{ag.assigned_total}</td>
                  <td className="py-3.5 px-5 text-center text-emerald-700 font-semibold">
                    {ag.resolved_count}
                  </td>
                  <td className="py-3.5 px-5 text-center text-amber-700 font-semibold">
                    {ag.pending_workload}
                  </td>
                  <td className="py-3.5 px-5 text-right font-bold text-emerald-600">
                    {ag.sla_compliance_rate}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
