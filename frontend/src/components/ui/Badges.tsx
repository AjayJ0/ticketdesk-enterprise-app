import React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Flame,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { RoleType, TicketPriority, TicketStatus } from "../../types";
import { cn, formatPriorityLabel, formatStatusLabel } from "../../utils/format";

export const StatusBadge: React.FC<{ status: TicketStatus | string; className?: string }> = ({
  status,
  className,
}) => {
  const styles: Record<string, string> = {
    open: "bg-blue-50 text-blue-700 border-blue-200",
    assigned: "bg-indigo-50 text-indigo-700 border-indigo-200",
    in_progress: "bg-amber-50 text-amber-800 border-amber-200",
    pending: "bg-purple-50 text-purple-700 border-purple-200",
    resolved: "bg-emerald-50 text-emerald-700 border-emerald-200",
    closed: "bg-slate-100 text-slate-600 border-slate-200",
    transferred: "bg-cyan-50 text-cyan-800 border-cyan-200",
  };

  const dotColors: Record<string, string> = {
    open: "bg-blue-600",
    assigned: "bg-indigo-600",
    in_progress: "bg-amber-500",
    pending: "bg-purple-600",
    resolved: "bg-emerald-600",
    closed: "bg-slate-400",
    transferred: "bg-cyan-600",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-medium border",
        styles[status] || "bg-slate-100 text-slate-700 border-slate-200",
        className
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full", dotColors[status] || "bg-slate-500")} />
      {formatStatusLabel(status)}
    </span>
  );
};

export const PriorityBadge: React.FC<{ priority: TicketPriority | string; className?: string }> = ({
  priority,
  className,
}) => {
  const styles: Record<string, string> = {
    critical: "bg-red-50 text-red-700 border-red-200",
    high: "bg-orange-50 text-orange-700 border-orange-200",
    medium: "bg-sky-50 text-sky-700 border-sky-200",
    low: "bg-slate-100 text-slate-600 border-slate-200",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-semibold border",
        styles[priority] || styles.medium,
        className
      )}
    >
      {priority === "critical" && <Flame className="w-3 h-3 text-red-600" />}
      {formatPriorityLabel(priority)}
    </span>
  );
};

export const SLABadge: React.FC<{
  health: "within_sla" | "at_risk" | "breached" | "met" | string;
  className?: string;
}> = ({ health, className }) => {
  if (health === "closed") {
    return <span className={cn("inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700", className)}><ShieldCheck className="h-3.5 w-3.5" />Closed</span>;
  }
  if (health === "breached") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700 border border-red-200",
          className
        )}
      >
        <ShieldAlert className="w-3.5 h-3.5 text-red-600" />
        SLA Breached
      </span>
    );
  }
  if (health === "at_risk") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200",
          className
        )}
      >
        <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
        At Risk
      </span>
    );
  }
  if (health === "met") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200",
          className
        )}
      >
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
        SLA Met
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-slate-50 text-slate-700 border border-slate-200",
        className
      )}
    >
      <Clock className="w-3.5 h-3.5 text-blue-600" />
      On Track
    </span>
  );
};

export const RoleBadge: React.FC<{ role: RoleType | string }> = ({ role }) => {
  const map: Record<string, { label: string; style: string }> = {
    admin: {
      label: "Administrator",
      style: "bg-indigo-50 text-indigo-700 border-indigo-200",
    },
    agent: {
      label: "IT Support Agent",
      style: "bg-blue-50 text-blue-700 border-blue-200",
    },
    employee: {
      label: "Employee",
      style: "bg-slate-100 text-slate-700 border-slate-200",
    },
  };
  const info = map[role] || map.employee;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-medium border", info.style)}>
      <ShieldCheck className="w-3 h-3" />
      {info.label}
    </span>
  );
};
