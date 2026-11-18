import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Lock,
  Search,
} from "lucide-react";
import { apiRequest } from "../services/api";
import { PaginatedAuditLogs } from "../types";
import { RoleBadge } from "../components/ui/Badges";
import { formatDateTime } from "../utils/format";

export const AuditLogsPage: React.FC = () => {
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState("all");
  const [page, setPage] = useState(1);

  const buildQuery = () => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("page_size", "20");
    if (search.trim()) params.set("search", search.trim());
    if (entityFilter !== "all") params.set("entity_type", entityFilter);
    return params.toString();
  };

  const { data, isLoading } = useQuery<PaginatedAuditLogs>({
    queryKey: ["audit-logs", page, search, entityFilter],
    queryFn: () => apiRequest<PaginatedAuditLogs>(`/audit-logs?${buildQuery()}`),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Security & Compliance Audit Logs
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Immutable, append-only audit trail of authentication events, ticket changes, role modifications, and administrative updates.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold">
          <Lock className="w-3.5 h-3.5 text-emerald-400" />
          Append-Only Compliance Ledger
        </span>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-2 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by action (e.g. USER_LOGIN, TICKET_CREATED), entity ID (TKT-2026-0001), or metadata..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600 focus:bg-white"
          />
        </div>

        <select
          value={entityFilter}
          onChange={(e) => {
            setEntityFilter(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by entity type"
          className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg font-medium text-slate-700"
        >
          <option value="all">All Entity Types</option>
          <option value="ticket">Tickets</option>
          <option value="user">Users & Auth</option>
          <option value="sla_policy">SLA Policies</option>
          <option value="knowledge_article">Knowledge Base</option>
          <option value="system_settings">System Settings</option>
        </select>
      </div>

      {/* Audit Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-3.5 px-4">Timestamp (UTC)</th>
                <th className="py-3.5 px-4">Actor</th>
                <th className="py-3.5 px-4">Action</th>
                <th className="py-3.5 px-4">Entity</th>
                <th className="py-3.5 px-4">IP Address</th>
                <th className="py-3.5 px-4">Change Metadata</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {isLoading ? (
                [...Array(6)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={6} className="py-4 px-4">
                      <div className="h-5 bg-slate-100 rounded" />
                    </td>
                  </tr>
                ))
              ) : (data?.items || []).length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500">
                    <ClipboardList className="w-6 h-6 mx-auto mb-1 text-slate-400" />
                    No audit entries match your filter.
                  </td>
                </tr>
              ) : (
                data?.items.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                      {formatDateTime(log.created_at)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900">{log.user_name}</span>
                        {log.user_role && <RoleBadge role={log.user_role} />}
                      </div>
                      {log.user_email && (
                        <span className="block text-[11px] text-slate-400 font-mono">
                          {log.user_email}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-mono font-semibold text-[11px] border border-blue-200">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap font-mono text-slate-700">
                      <span className="text-slate-400">{log.entity_type}:</span>{" "}
                      <strong>{log.entity_id || "—"}</strong>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                      {log.ip_address || "127.0.0.1"}
                    </td>
                    <td className="py-3 px-4">
                      <code className="text-[11px] bg-slate-100 px-2 py-0.5 rounded text-slate-700 font-mono block max-w-md truncate">
                        {JSON.stringify(log.metadata)}
                      </code>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {data && data.total_pages > 1 && (
          <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50/60 flex items-center justify-between text-xs">
            <span className="text-slate-600">
              Page <strong>{data.page}</strong> of <strong>{data.total_pages}</strong> ({data.total}{" "}
              audit records)
            </span>
            <div className="flex items-center gap-1.5">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-2.5 py-1.5 rounded border border-slate-200 bg-white disabled:opacity-40 inline-flex items-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Prev
              </button>
              <button
                disabled={page >= data.total_pages}
                onClick={() => setPage((p) => Math.min(data.total_pages, p + 1))}
                className="px-2.5 py-1.5 rounded border border-slate-200 bg-white disabled:opacity-40 inline-flex items-center gap-1"
              >
                Next
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
