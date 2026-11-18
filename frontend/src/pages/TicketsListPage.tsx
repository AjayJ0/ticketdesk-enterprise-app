import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  FilePlus2,
  Filter,
  MessageSquare,
  Paperclip,
  RotateCcw,
  Search,
} from "lucide-react";
import { apiRequest } from "../services/api";
import { CategoryItem, PaginatedTickets } from "../types";
import { PriorityBadge, SLABadge, StatusBadge } from "../components/ui/Badges";
import { formatDateTime, formatRelativeTime } from "../utils/format";

interface TicketsListPageProps {
  mode: "all" | "my" | "assigned";
}

export const TicketsListPage: React.FC<TicketsListPageProps> = ({ mode }) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [searchInput, setSearchInput] = useState(searchParams.get("search") || "");
  const [debouncedSearch, setDebouncedSearch] = useState(searchParams.get("search") || "");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [categoryId, setCategoryId] = useState<string>("all");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [sortBy, setSortBy] = useState("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const pageSize = 12;

  useEffect(() => {
    const urlSearch = searchParams.get("search") || "";
    if (urlSearch !== searchInput) {
      setSearchInput(urlSearch);
      setDebouncedSearch(urlSearch);
    }
  }, [searchParams]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1);
    }, 280);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data: categories } = useQuery<CategoryItem[]>({
    queryKey: ["ticket-categories"],
    queryFn: () => apiRequest<CategoryItem[]>("/tickets/categories"),
  });

  const buildQueryString = () => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("page_size", String(pageSize));
    params.set("sort_by", sortBy);
    params.set("sort_order", sortOrder);
    if (mode === "my") params.set("my_tickets", "true");
    if (mode === "assigned") params.set("assigned_to_me", "true");
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (priorityFilter !== "all") params.set("priority", priorityFilter);
    if (categoryId !== "all") params.set("category_id", categoryId);
    if (overdueOnly) params.set("overdue_only", "true");
    if (unassignedOnly && mode === "all") params.set("unassigned_only", "true");
    return params.toString();
  };

  const { data, isLoading, refetch } = useQuery<PaginatedTickets>({
    queryKey: [
      "tickets",
      mode,
      page,
      debouncedSearch,
      statusFilter,
      priorityFilter,
      categoryId,
      overdueOnly,
      unassignedOnly,
      sortBy,
      sortOrder,
    ],
    queryFn: () => apiRequest<PaginatedTickets>(`/tickets?${buildQueryString()}`),
  });

  const handleResetFilters = () => {
    setSearchInput("");
    setDebouncedSearch("");
    setStatusFilter("all");
    setPriorityFilter("all");
    setCategoryId("all");
    setOverdueOnly(false);
    setUnassignedOnly(false);
    setSortBy("created_at");
    setSortOrder("desc");
    setPage(1);
    setSearchParams({});
  };

  const toggleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  const titleMap = {
    all: {
      title: "All Enterprise Tickets",
      sub: "Complete IT Service Management queue across all departments and support teams.",
    },
    my: {
      title: "My Support Tickets",
      sub: "View, track, and respond to technical support requests you have submitted.",
    },
    assigned: {
      title: "Assigned to Me",
      sub: "Your active engineering support queue prioritized by SLA deadline.",
    },
  }[mode];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{titleMap.title}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{titleMap.sub}</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => refetch()}
            className="px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Refresh
          </button>
          <Link
            to="/tickets/new"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors"
          >
            <FilePlus2 className="w-4 h-4" />
            Create Ticket
          </Link>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Search Input */}
          <div className="md:col-span-4 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Filter by Ticket ID, subject, description, service..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 focus:bg-white"
            />
          </div>

          {/* Status Filter */}
          <div className="md:col-span-2">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by status"
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg font-medium text-slate-700 focus:outline-none focus:border-blue-600"
            >
              <option value="all">All Statuses</option>
              <option value="open">Open</option>
              <option value="assigned">Assigned</option>
              <option value="in_progress">In Progress</option>
              <option value="pending">Pending</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          {/* Priority Filter */}
          <div className="md:col-span-2">
            <select
              value={priorityFilter}
              onChange={(e) => {
                setPriorityFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by priority"
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg font-medium text-slate-700 focus:outline-none focus:border-blue-600"
            >
              <option value="all">All Priorities</option>
              <option value="critical">Critical (P1)</option>
              <option value="high">High (P2)</option>
              <option value="medium">Medium (P3)</option>
              <option value="low">Low (P4)</option>
            </select>
          </div>

          {/* Category Filter */}
          <div className="md:col-span-2">
            <select
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by category"
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg font-medium text-slate-700 focus:outline-none focus:border-blue-600"
            >
              <option value="all">All Categories</option>
              {categories?.map((cat) => (
                <option key={cat.id} value={String(cat.id)}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          {/* Sort Selector */}
          <div className="md:col-span-2">
            <select
              value={`${sortBy}:${sortOrder}`}
              onChange={(e) => {
                const [field, ord] = e.target.value.split(":");
                setSortBy(field);
                setSortOrder(ord as "asc" | "desc");
              }}
              aria-label="Sort tickets"
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg font-medium text-slate-700 focus:outline-none focus:border-blue-600"
            >
              <option value="created_at:desc">Newest First</option>
              <option value="created_at:asc">Oldest First</option>
              <option value="updated_at:desc">Recently Updated</option>
              <option value="resolution_due_at:asc">SLA Due Soonest</option>
              <option value="priority:asc">Priority</option>
            </select>
          </div>
        </div>

        {/* Quick Toggle Pills & Count */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-slate-500 font-medium mr-1">
              <Filter className="w-3.5 h-3.5" />
              Quick Filters:
            </span>
            <button
              type="button"
              onClick={() => {
                setOverdueOnly(!overdueOnly);
                setPage(1);
              }}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium border transition-colors cursor-pointer ${
                overdueOnly
                  ? "bg-red-50 text-red-700 border-red-200"
                  : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Overdue / SLA Breach Only
            </button>

            {mode === "all" && (
              <button
                type="button"
                onClick={() => {
                  setUnassignedOnly(!unassignedOnly);
                  setPage(1);
                }}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium border transition-colors cursor-pointer ${
                  unassignedOnly
                    ? "bg-blue-50 text-blue-700 border-blue-200"
                    : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                }`}
              >
                Unassigned Queue Only
              </button>
            )}

            {(debouncedSearch ||
              statusFilter !== "all" ||
              priorityFilter !== "all" ||
              categoryId !== "all" ||
              overdueOnly ||
              unassignedOnly) && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="text-blue-600 hover:text-blue-700 font-semibold ml-2 cursor-pointer"
              >
                Clear All Filters
              </button>
            )}
          </div>

          <div className="text-slate-500 font-medium">
            Showing <strong className="text-slate-800">{data?.items.length || 0}</strong> of{" "}
            <strong className="text-slate-800">{data?.total || 0}</strong> tickets
          </div>
        </div>
      </div>

      {/* Tickets Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th
                  onClick={() => toggleSort("ticket_number")}
                  className="py-3.5 px-4 cursor-pointer hover:text-slate-800"
                >
                  <div className="inline-flex items-center gap-1">
                    <span>Ticket ID</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3.5 px-4">Subject & Service</th>
                <th className="py-3.5 px-4">Category</th>
                <th className="py-3.5 px-4">Requester</th>
                <th className="py-3.5 px-4">Assigned Agent</th>
                <th className="py-3.5 px-4">Priority</th>
                <th className="py-3.5 px-4">Status</th>
                <th
                  onClick={() => toggleSort("resolution_due_at")}
                  className="py-3.5 px-4 cursor-pointer hover:text-slate-800"
                >
                  <div className="inline-flex items-center gap-1">
                    <span>SLA Target</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => toggleSort("created_at")}
                  className="py-3.5 px-4 text-right cursor-pointer hover:text-slate-800"
                >
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {isLoading ? (
                [...Array(6)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={9} className="py-4 px-4">
                      <div className="h-6 bg-slate-100 rounded w-full" />
                    </td>
                  </tr>
                ))
              ) : (data?.items || []).length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    <p className="text-sm font-semibold text-slate-700">
                      No matching tickets found
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Try adjusting your search query or status/priority filters.
                    </p>
                  </td>
                </tr>
              ) : (
                data?.items.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => navigate(`/tickets/${t.ticket_number}`)}
                    className="hover:bg-blue-50/30 cursor-pointer transition-colors group"
                  >
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span className="font-mono font-semibold text-blue-600 group-hover:underline">
                        {t.ticket_number}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 max-w-sm">
                      <p className="font-semibold text-slate-900 truncate">{t.subject}</p>
                      <div className="flex items-center gap-3 mt-0.5 text-[11px] text-slate-500">
                        {t.affected_service && (
                          <span className="truncate">{t.affected_service}</span>
                        )}
                        {t.comment_count > 0 && (
                          <span className="inline-flex items-center gap-1 text-slate-400">
                            <MessageSquare className="w-3 h-3" />
                            {t.comment_count}
                          </span>
                        )}
                        {t.attachment_count > 0 && (
                          <span className="inline-flex items-center gap-1 text-slate-400">
                            <Paperclip className="w-3 h-3" />
                            {t.attachment_count}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span className="font-medium text-slate-700">{t.category_name}</span>
                      {t.subcategory && (
                        <span className="block text-[11px] text-slate-400">{t.subcategory}</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <p className="font-medium text-slate-800">{t.requester.full_name}</p>
                      <p className="text-[11px] text-slate-500">{t.department_name || "Corporate"}</p>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {t.assigned_agent ? (
                        <div>
                          <p className="font-medium text-slate-800">{t.assigned_agent.full_name}</p>
                          <p className="text-[11px] text-slate-500">{t.support_team_name}</p>
                        </div>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-medium">
                          Unassigned
                        </span>
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
                      {t.resolution_due_at && (
                        <span className="block text-[10px] text-slate-400 mt-0.5">
                          Due {formatDateTime(t.resolution_due_at)}
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right text-slate-500 whitespace-nowrap">
                      {formatRelativeTime(t.created_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {data && data.total_pages > 1 && (
          <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50/60 flex items-center justify-between text-xs">
            <span className="text-slate-600">
              Page <strong>{data.page}</strong> of <strong>{data.total_pages}</strong> ({data.total}{" "}
              total records)
            </span>
            <div className="flex items-center gap-1.5">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-2.5 py-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 font-medium text-slate-700 inline-flex items-center gap-1 cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Prev
              </button>
              <button
                disabled={page >= data.total_pages}
                onClick={() => setPage((p) => Math.min(data.total_pages, p + 1))}
                className="px-2.5 py-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 font-medium text-slate-700 inline-flex items-center gap-1 cursor-pointer"
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
