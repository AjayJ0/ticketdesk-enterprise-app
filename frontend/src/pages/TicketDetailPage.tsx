import React, { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  History,
  Lock,
  MessageSquare,
  Paperclip,
  RotateCcw,
  Send,
  ShieldAlert,
  Upload,
  UserCheck,
  UserPlus,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { ApiError, apiRequest, downloadAuthorizedBlob } from "../services/api";
import {
  SupportTeamInfo,
  TicketDetail,
  TicketPriority,
  TicketStatus,
  UserSummary,
} from "../types";
import { PriorityBadge, RoleBadge, SLABadge, StatusBadge } from "../components/ui/Badges";
import {
  formatDateTime,
  formatFileSize,
  formatMinutesDuration,
  formatRelativeTime,
} from "../utils/format";

export const TicketDetailPage: React.FC = () => {
  const { ticketId } = useParams<{ ticketId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [commentBody, setCommentBody] = useState("");
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [statusModal, setStatusModal] = useState<{ open: boolean; targetStatus: TicketStatus | null }>({
    open: false,
    targetStatus: null,
  });
  const [statusReason, setStatusReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [rejectAssignment, setRejectAssignment] = useState(false);
  const [targetTeam, setTargetTeam] = useState("");
  const [targetAgent, setTargetAgent] = useState("");
  const [transferReason, setTransferReason] = useState("");

  const {
    data: ticket,
    isLoading,
    error,
  } = useQuery<TicketDetail>({
    queryKey: ["ticket", ticketId],
    queryFn: () => apiRequest<TicketDetail>(`/tickets/${ticketId}`),
    enabled: !!ticketId,
    refetchInterval: 5000,
  });

  const isStaff = user?.role === "agent" || user?.role === "admin";

  const { data: agents } = useQuery<UserSummary[]>({
    queryKey: ["support-agents"],
    queryFn: () => apiRequest<UserSummary[]>("/users/agents"),
    enabled: isStaff,
  });

  const { data: supportTeams } = useQuery<SupportTeamInfo[]>({
    queryKey: ["support-teams"],
    queryFn: () => apiRequest<SupportTeamInfo[]>("/users/support-teams"),
    enabled: isStaff,
  });

  const refreshTicketData = () => {
    queryClient.invalidateQueries({ queryKey: ["ticket", ticketId] });
    queryClient.invalidateQueries({ queryKey: ["tickets"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
    queryClient.invalidateQueries({ queryKey: ["sla-alerts"] });
  };

  const statusMutation = useMutation({
    mutationFn: (payload: { status: TicketStatus; reason?: string }) =>
      apiRequest<TicketDetail>(`/tickets/${ticketId}/status`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      setStatusModal({ open: false, targetStatus: null });
      setStatusReason("");
      setActionError(null);
      refreshTicketData();
    },
    onError: (err: unknown) => {
      setActionError(err instanceof ApiError ? err.message : "Failed to update status.");
    },
  });

  const assignMutation = useMutation({
    mutationFn: (payload: { assigned_agent_id?: number | null; support_team_id?: number | null; note?: string }) =>
      apiRequest<TicketDetail>(`/tickets/${ticketId}/assign`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      setActionError(null);
      refreshTicketData();
    },
    onError: (err: unknown) => {
      setActionError(err instanceof ApiError ? err.message : "Failed to assign ticket.");
    },
  });

  const acceptMutation = useMutation({
    mutationFn: () => apiRequest<TicketDetail>(`/tickets/${ticketId}/accept`, { method: "POST" }),
    onSuccess: () => { setActionError(null); refreshTicketData(); },
    onError: (err: unknown) => { setActionError(err instanceof ApiError ? err.message : "Unable to accept ticket."); refreshTicketData(); },
  });
  const transferMutation = useMutation({
    mutationFn: () => apiRequest(`/tickets/${ticketId}/transfer`, { method: "POST", body: JSON.stringify({
      support_team_id: targetTeam === "admin" ? null : Number(targetTeam),
      escalate_to_admin: targetTeam === "admin", reject_assignment: rejectAssignment,
      assigned_agent_id: targetAgent ? Number(targetAgent) : null, reason: transferReason.trim(),
    }) }),
    onSuccess: () => { setTransferOpen(false); setRejectAssignment(false); setTransferReason(""); setActionError(null); refreshTicketData(); },
    onError: (err: unknown) => setActionError(err instanceof ApiError ? err.message : "Unable to transfer ticket."),
  });

  const updatePriorityMutation = useMutation({
    mutationFn: (priority: TicketPriority) =>
      apiRequest<TicketDetail>(`/tickets/${ticketId}`, {
        method: "PUT",
        body: JSON.stringify({ priority }),
      }),
    onSuccess: () => {
      setActionError(null);
      refreshTicketData();
    },
    onError: (err: unknown) => {
      setActionError(err instanceof ApiError ? err.message : "Failed to update priority.");
    },
  });

  const commentMutation = useMutation({
    mutationFn: (payload: { body: string; is_internal: boolean }) =>
      apiRequest(`/tickets/${ticketId}/comments`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      setCommentBody("");
      setIsInternalNote(false);
      setActionError(null);
      refreshTicketData();
    },
    onError: (err: unknown) => {
      setActionError(err instanceof ApiError ? err.message : "Failed to post comment.");
    },
  });

  const handleAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !ticket) return;
    setUploadingFile(true);
    setActionError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      await apiRequest(`/tickets/${ticket.ticket_number}/attachments`, {
        method: "POST",
        body: formData,
      });
      refreshTicketData();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "File upload failed.");
    } finally {
      setUploadingFile(false);
      e.target.value = "";
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-slate-200 rounded w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-96 bg-white rounded-xl border border-slate-200" />
          <div className="h-96 bg-white rounded-xl border border-slate-200" />
        </div>
      </div>
    );
  }

  if (error || !ticket || !user) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center max-w-lg mx-auto my-12">
        <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-900">Ticket Unavailable</h2>
        <p className="text-xs text-slate-500 mt-1">
          {error instanceof ApiError
            ? error.message
            : "The requested ticket could not be found or you do not have permission to view it."}
        </p>
        <button
          onClick={() => navigate("/dashboard")}
          className="mt-4 px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  // Compute available status transitions for current user
  const getAvailableStatusActions = (): { label: string; target: TicketStatus; variant: string }[] => {
    const style = "bg-blue-600 hover:bg-blue-700 text-white";
    if (user.role === "employee") return ticket.status === "resolved" ? [{ label: "Reopen Ticket", target: "open", variant: style }] : [];
    if (!ticket.can_manage || ticket.status === "transferred") return [];
    const actions: { label: string; target: TicketStatus; variant: string }[] = [];
    if (ticket.status === "assigned" || ticket.status === "pending") actions.push({ label: "Start Progress", target: "in_progress", variant: style });
    if (ticket.status === "in_progress") actions.push({ label: "Mark Pending", target: "pending", variant: style });
    if (["assigned", "in_progress", "pending", "resolved"].includes(ticket.status)) actions.push({ label: "Close Ticket", target: "closed", variant: "bg-slate-800 hover:bg-slate-900 text-white" });
    if (["in_progress", "pending"].includes(ticket.status)) actions.push({ label: "Mark Resolved", target: "resolved", variant: style });
    if (ticket.status === "resolved" || ticket.status === "closed") actions.push({ label: "Reopen Ticket", target: "open", variant: style });
    return actions;
  };

  const statusActions = getAvailableStatusActions();

  return (
    <div className="space-y-6">
      {/* Top Action & Navigation Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Ticket Queue
          </button>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-sm font-bold px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
              {ticket.ticket_number}
            </span>
            <StatusBadge status={ticket.status} />
            {ticket.transfer_outcome && <span className="rounded bg-cyan-50 px-2 py-1 text-xs font-semibold text-cyan-800">Transferred</span>}
            <PriorityBadge priority={ticket.priority} />
            <SLABadge health={ticket.sla.sla_health} />
            {ticket.reopened_count > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
                <RotateCcw className="w-3 h-3" />
                Reopened ({ticket.reopened_count})
              </span>
            )}
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight pt-1">
            {ticket.subject}
          </h1>
        </div>

        {/* Primary Workflow Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {ticket.can_accept && <button onClick={() => acceptMutation.mutate()} disabled={acceptMutation.isPending}
            className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-700">Accept Ticket</button>}
          {ticket.can_manage && !["resolved", "closed", "transferred"].includes(ticket.status) && <button
            onClick={() => { setRejectAssignment(false); setTransferOpen(!transferOpen); }} className="rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-2 text-xs font-semibold text-cyan-800">Transfer Ticket</button>}

          {user.role === "admin" && ticket.status === "open" && ticket.assigned_agent?.id === user.id && <button
            onClick={() => { setRejectAssignment(true); setTransferOpen(true); setTargetTeam(""); setTargetAgent(""); }}
            className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800">Reject / Redirect</button>}
          {statusActions.map((act) => (
            <button
              key={act.target}
              onClick={() => {
                if (act.target === "resolved" || act.target === "open" || act.label.includes("Reopen")) {
                  setStatusModal({ open: true, targetStatus: act.target });
                } else {
                  statusMutation.mutate({ status: act.target });
                }
              }}
              disabled={statusMutation.isPending}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold shadow-2xs transition-colors cursor-pointer ${act.variant}`}
            >
              {act.label}
            </button>
          ))}
        </div>
      </div>

      {actionError && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-center justify-between text-xs text-red-700">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="font-bold underline">
            Dismiss
          </button>
        </div>
      )}

      {(ticket.lineage?.length || 0) > 0 && <section className="rounded-xl border border-cyan-200 bg-cyan-50 p-4 text-sm">
        <h2 className="font-bold text-cyan-900">Linked request history</h2>
        <p className="mt-1 text-xs text-cyan-800">Previous conversations, attachments and completed work are preserved in the linked tickets. Original submission: {formatDateTime(ticket.original_submitted_at)}</p>
        <div className="mt-2 flex flex-wrap gap-3">{ticket.lineage?.map(link => link.can_open
          ? <Link key={link.id} to={`/tickets/${link.ticket_number}`} className="font-semibold text-blue-700 underline">{link.relation}: {link.ticket_number} ({link.status})</Link>
          : <span key={link.id}>{link.relation}: {link.ticket_number} ({link.status}) — routed to {link.support_team_name}</span>)}</div>
      </section>}
      {transferOpen && <section className="space-y-3 rounded-xl border border-cyan-200 bg-white p-5">
        <h2 className="font-bold">{rejectAssignment ? "Reject assignment and redirect" : "Transfer or escalate"}</h2>
        <p className="text-xs text-slate-600">Closes this work segment with a Transferred outcome and creates a linked Open ticket. The original overall SLA deadline stays {formatDateTime(ticket.resolution_due_at)}.</p>
        <select aria-label="Transfer target team" value={targetTeam} onChange={e => { setTargetTeam(e.target.value); setTargetAgent(""); }} className="w-full rounded border p-2">
          <option value="">Select target support team</option><option value="admin">Administrator escalation</option>{supportTeams?.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
        </select>
        <select aria-label="Transfer target consultant" value={targetAgent} onChange={e => setTargetAgent(e.target.value)} disabled={!targetTeam} className="w-full rounded border p-2">
          <option value="">{targetTeam === "admin" ? "Select administrator" : "Available team queue"}</option>{agents?.filter(agent => targetTeam === "admin" ? agent.role === "admin" : agent.support_team_id === Number(targetTeam)).map(agent => <option key={agent.id} value={agent.id}>{agent.full_name}</option>)}
        </select>
        <textarea aria-label="Transfer reason and completed work" value={transferReason} onChange={e => setTransferReason(e.target.value)} placeholder="Describe completed work and why this specialty is needed" maxLength={2000} className="w-full rounded border p-2" />
        <button onClick={() => transferMutation.mutate()} disabled={!targetTeam || (targetTeam === "admin" && !targetAgent) || transferReason.trim().length < 5 || transferMutation.isPending} className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Confirm Transfer</button>
      </section>}

      {ticket.routed_by && <p className="rounded-lg bg-slate-100 p-3 text-sm">Assigned by {ticket.routed_by.full_name} ({ticket.routed_by.support_team_name || ticket.routed_by.role}) from {ticket.previous_ticket_number}.</p>}
      {/* Two-Column Enterprise Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT / MAIN PANEL (2 columns) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Issue Description & Requester Context */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center">
                  {ticket.requester.full_name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">
                      {ticket.requester.full_name}
                    </span>
                    <span className="text-xs text-slate-400">•</span>
                    <span className="text-xs text-slate-500">
                      {ticket.requester.job_title || "Employee"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-mono">
                    {ticket.requester.email} • {ticket.department_name || "Corporate"}
                  </p>
                </div>
              </div>
              <div className="text-right text-xs text-slate-500">
                <span>Reported {formatDateTime(ticket.created_at)}</span>
              </div>
            </div>

            <div className="prose prose-sm max-w-none text-slate-800 whitespace-pre-wrap text-sm leading-relaxed">
              {ticket.description}
            </div>

            {ticket.affected_service && (
              <div className="pt-3 border-t border-slate-100 flex items-center gap-2 text-xs">
                <span className="font-semibold text-slate-500">Affected Service / Asset:</span>
                <span className="px-2.5 py-0.5 rounded bg-slate-100 text-slate-800 font-mono font-medium">
                  {ticket.affected_service}
                </span>
              </div>
            )}
          </div>

          {/* File Attachments Section */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Paperclip className="w-4 h-4 text-blue-600" />
                <h2 className="text-sm font-bold text-slate-900">
                  Attachments ({ticket.attachments.length})
                </h2>
              </div>
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer transition-colors">
                <Upload className="w-3.5 h-3.5" />
                <span>{uploadingFile ? "Uploading..." : "Upload File"}</span>
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.txt"
                  onChange={handleAttachmentUpload}
                  disabled={uploadingFile || !ticket.can_chat}
                  className="hidden"
                />
              </label>
            </div>

            {ticket.attachments.length === 0 ? (
              <p className="text-xs text-slate-500 py-2">
                No diagnostic files or screenshots attached yet. Allowed: PDF, PNG, JPG, JPEG, TXT.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ticket.attachments.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-slate-50/60 hover:bg-slate-50"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FileText className="w-5 h-5 text-blue-600 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-800 truncate">
                          {att.original_filename}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {formatFileSize(att.file_size)} • {att.uploaded_by_name} •{" "}
                          <span className="uppercase font-mono">{att.storage_provider}</span>
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        downloadAuthorizedBlob(
                          `/tickets/${ticket.ticket_number}/attachments/${att.id}/download`,
                          att.original_filename
                        )
                      }
                      className="p-2 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors shrink-0 cursor-pointer"
                      title="Download attachment"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Communication: Comments & Restricted Internal Notes */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-blue-600" />
                <h2 className="text-sm font-bold text-slate-900">
                  Ticket Conversation & Notes ({ticket.comments.length})
                </h2>
              </div>
            </div>

            {/* Comments List */}
            <div className="space-y-4">
              {ticket.comments.length === 0 ? (
                <p className="text-xs text-slate-500 py-3">
                  No comments posted yet. Add a message below to communicate on this ticket.
                </p>
              ) : (
                ticket.comments.map((c) => (
                  <div
                    key={c.id}
                    className={`p-4 rounded-xl border text-xs space-y-2 ${
                      c.is_internal
                        ? "bg-amber-50/70 border-amber-200"
                        : c.author.id === user.id
                        ? "bg-blue-50/30 border-blue-200/80"
                        : "bg-slate-50/70 border-slate-200"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">{c.author.full_name}</span>
                        <RoleBadge role={c.author.role} />
                        {c.is_internal && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-200/80 text-amber-900 font-semibold text-[11px]">
                            <Lock className="w-3 h-3" />
                            Internal Agent Note (Hidden from Employee)
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-500">
                        {formatDateTime(c.created_at)}
                      </span>
                    </div>
                    <p className="text-slate-800 whitespace-pre-wrap leading-relaxed text-xs">
                      {c.body}
                    </p>
                  </div>
                ))
              )}
            </div>

            {/* Add Comment / Internal Note Composer */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!commentBody.trim() || !ticket.can_chat) return;
                commentMutation.mutate({
                  body: commentBody.trim(),
                  is_internal: isStaff ? isInternalNote : false,
                });
              }}
              className="pt-4 border-t border-slate-200 space-y-3"
            >
              {isStaff && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsInternalNote(false)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      !isInternalNote
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    Public Reply (Visible to Requester)
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsInternalNote(true)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      isInternalNote
                        ? "bg-amber-600 text-white"
                        : "bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100"
                    }`}
                  >
                    <Lock className="w-3.5 h-3.5" />
                    Restricted Internal Note
                  </button>
                </div>
              )}

              <textarea
                rows={3}
                disabled={!ticket.can_chat}
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                placeholder={
                  isInternalNote
                    ? "Write a private internal engineering note (visible only to IT Support Agents & Administrators)..."
                    : "Write a reply or status update..."
                }
                className={`w-full px-3.5 py-2.5 text-xs rounded-lg border focus:outline-none focus:ring-2 ${
                  isInternalNote
                    ? "bg-amber-50/40 border-amber-300 focus:border-amber-500 focus:ring-amber-500/20"
                    : "bg-slate-50 border-slate-300 focus:border-blue-600 focus:ring-blue-600/20 focus:bg-white"
                }`}
              />

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={!ticket.can_chat || !commentBody.trim() || commentMutation.isPending}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-50 cursor-pointer ${
                    isInternalNote
                      ? "bg-amber-600 hover:bg-amber-700"
                      : "bg-blue-600 hover:bg-blue-700"
                  }`}
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>
                    {commentMutation.isPending
                      ? "Posting..."
                      : isInternalNote
                      ? "Save Internal Note"
                      : "Post Public Comment"}
                  </span>
                </button>
              </div>
            </form>
          </div>

          {/* Ticket Activity & Status History Timeline */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-4">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-blue-600" />
              <h2 className="text-sm font-bold text-slate-900">
                Ticket Activity & Audit Timeline ({ticket.history.length})
              </h2>
            </div>

            <div className="relative pl-5 border-l-2 border-slate-200 space-y-4">
              {ticket.history.map((item) => (
                <div key={item.id} className="relative text-xs">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600 border-2 border-white absolute -left-[25px] top-1" />
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <span className="font-semibold text-slate-800">{item.description}</span>
                    <span className="text-[11px] text-slate-400">
                      {formatRelativeTime(item.created_at)}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Action: <span className="font-mono">{item.action}</span> by{" "}
                    <strong>{item.actor_name}</strong>
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT METADATA & SLA PANEL (1 column) */}
        <div className="space-y-6">
          {/* SLA Governance Status Card */}
          <div className="bg-navy-900 text-white rounded-xl p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-blue-400">
                <Clock className="w-4 h-4" />
                <h3 className="text-xs font-bold uppercase tracking-wider">SLA Monitor</h3>
              </div>
              <SLABadge health={ticket.sla.sla_health} />
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-200">{ticket.sla.policy_name}</p>
              <p className="text-lg font-bold text-white mt-1">
                {ticket.sla.sla_health === "closed" ? "Closed" : ticket.status === "resolved"
                  ? ticket.sla.resolution_breached
                    ? "Completed Outside SLA Target"
                    : "Resolved Within SLA Target"
                  : formatMinutesDuration(ticket.sla.remaining_minutes)}
              </p>
            </div>

            <div className="space-y-2 pt-3 border-t border-slate-800 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Response Target:</span>
                <span className="font-mono text-slate-200">
                  {ticket.sla.response_target_minutes} mins
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">First Responded:</span>
                <span className="text-slate-200">
                  {ticket.sla.first_responded_at ? (
                    <span className="inline-flex items-center gap-1 text-emerald-400">
                      <CheckCircle2 className="w-3 h-3" />
                      {formatRelativeTime(ticket.sla.first_responded_at)}
                    </span>
                  ) : (
                    <span className="text-amber-400">Awaiting agent response</span>
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Resolution Due:</span>
                <span className="font-mono text-slate-200">
                  {formatDateTime(ticket.sla.resolution_due_at)}
                </span>
              </div>
              {ticket.sla.resolved_at && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Resolved At:</span>
                  <span className="font-mono text-emerald-400">
                    {formatDateTime(ticket.sla.resolved_at)}
                  </span>
                </div>
              )}
            </div>

            {ticket.sla.is_overdue && (
              <div className="p-2.5 rounded-lg bg-red-500/20 border border-red-500/40 flex items-center gap-2 text-xs text-red-200">
                <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
                <span>SLA resolution deadline exceeded. Escalated in operational dashboard.</span>
              </div>
            )}
          </div>

          {/* Ticket Properties & Assignment Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Ticket Classification & Routing
            </h3>

            {/* Status */}
            <div className="flex items-center justify-between text-xs py-1.5 border-b border-slate-100">
              <span className="text-slate-500 font-medium">Current Status</span>
              <StatusBadge status={ticket.status} />
            </div>

            {/* Priority (Editable for Agents/Admins) */}
            <div className="space-y-1.5 py-1.5 border-b border-slate-100">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-medium">Priority Level</span>
                <PriorityBadge priority={ticket.priority} />
              </div>
              {ticket.can_manage && !["closed", "transferred"].includes(ticket.status) && (
                <select
                  value={ticket.priority}
                  onChange={(e) =>
                    updatePriorityMutation.mutate(e.target.value as TicketPriority)
                  }
                  disabled={updatePriorityMutation.isPending}
                  aria-label="Change ticket priority"
                  className="w-full mt-1 px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md font-medium text-slate-700"
                >
                  <option value="low">Low (P4)</option>
                  <option value="medium">Medium (P3)</option>
                  <option value="high">High (P2)</option>
                  <option value="critical">Critical (P1)</option>
                </select>
              )}
            </div>

            {/* Assigned Agent (Editable for Agents/Admins) */}
            <div className="space-y-1.5 py-1.5 border-b border-slate-100">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-medium">Assigned Agent</span>
                <span className="font-semibold text-slate-800">
                  {ticket.assigned_agent ? ticket.assigned_agent.full_name : "Unassigned"}
                </span>
              </div>
              {user.role === "admin" && ticket.can_manage && !["closed", "transferred"].includes(ticket.status) && (
                <div className="flex items-center gap-1.5 pt-1">
                  <UserPlus className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <select
                    value={ticket.assigned_agent?.id || ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      assignMutation.mutate({
                        assigned_agent_id: val ? Number(val) : null,
                      });
                    }}
                    disabled={assignMutation.isPending}
                    aria-label="Assign agent"
                    className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md font-medium text-slate-700"
                  >
                    <option value="">-- Unassigned --</option>
                    {agents?.filter(ag => ag.role === "admin" || ag.support_team_id === ticket.support_team_id).map((ag) => (
                      <option key={ag.id} value={ag.id}>
                        {ag.full_name} ({ag.support_team_name || ag.role})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Support Team */}
            <div className="space-y-1.5 py-1.5 border-b border-slate-100">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-medium">Support Team</span>
                <span className="font-semibold text-slate-800">
                  {ticket.support_team_name || "General Triage"}
                </span>
              </div>

            </div>

            {/* Metadata Details */}
            <div className="space-y-2.5 text-xs pt-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Category:</span>
                <span className="font-semibold text-slate-800">{ticket.category_name}</span>
              </div>
              {ticket.subcategory && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Subcategory:</span>
                  <span className="text-slate-700">{ticket.subcategory}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">Department:</span>
                <span className="text-slate-700">{ticket.department_name || "Corporate"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Created Date:</span>
                <span className="text-slate-700">{formatDateTime(ticket.created_at)}</span>
              </div>
              <div className="text-xs text-slate-600">Team received: {formatDateTime(ticket.team_received_at)}<br />Work started: {formatDateTime(ticket.work_started_at)}</div>
              <div className="flex justify-between">
                <span className="text-slate-500">Last Updated:</span>
                <span className="text-slate-700">{formatDateTime(ticket.updated_at)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Status Transition Reason Modal (For Resolve / Reopen) */}
      {statusModal.open && statusModal.targetStatus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              {statusModal.targetStatus === "resolved"
                ? "Resolve Support Ticket"
                : "Reopen Support Ticket"}
            </h3>
            <p className="text-xs text-slate-600">
              {statusModal.targetStatus === "resolved"
                ? "Provide a resolution summary for the requester and audit log."
                : "Explain why this ticket needs to be reopened so the assigned engineer can investigate."}
            </p>
            <textarea
              rows={4}
              value={statusReason}
              onChange={(e) => setStatusReason(e.target.value)}
              placeholder="Enter resolution notes or reason for status change..."
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 focus:bg-white"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setStatusModal({ open: false, targetStatus: null })}
                className="px-3.5 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  statusMutation.mutate({
                    status: statusModal.targetStatus!,
                    reason: statusReason,
                  })
                }
                disabled={statusMutation.isPending}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
              >
                {statusMutation.isPending ? "Saving..." : "Confirm Status Change"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
