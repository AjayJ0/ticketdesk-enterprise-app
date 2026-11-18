import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { TicketPriority, TicketStatus } from "../types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelativeTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const diffSec = Math.round((Date.now() - d.getTime()) / 1000);
  if (diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return formatDateTime(iso);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

export function formatMinutesDuration(minutes?: number | null): string {
  if (minutes === null || minutes === undefined) return "—";
  const absMin = Math.abs(minutes);
  const hrs = Math.floor(absMin / 60);
  const mins = absMin % 60;
  const formatted = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
  return minutes < 0 ? `Overdue by ${formatted}` : `${formatted} remaining`;
}

export function formatStatusLabel(status: TicketStatus | string): string {
  const map: Record<string, string> = {
    open: "Open",
    assigned: "Assigned",
    in_progress: "In Progress",
    pending: "Pending",
    resolved: "Resolved",
    closed: "Closed",
    transferred: "Transferred",
  };
  return map[status] || status;
}

export function formatPriorityLabel(priority: TicketPriority | string): string {
  const map: Record<string, string> = {
    critical: "Critical",
    high: "High",
    medium: "Medium",
    low: "Low",
  };
  return map[priority] || priority;
}
