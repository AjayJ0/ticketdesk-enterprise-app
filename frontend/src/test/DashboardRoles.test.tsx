import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DashboardPage } from "../pages/DashboardPage";
import { apiRequest } from "../services/api";
const auth = vi.hoisted(() => ({ user: { id: 1, role: "agent", full_name: "Consultant Example" } }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("../services/api", () => ({ apiRequest: vi.fn() }));
vi.mock("recharts", () => {
  const chart = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return Object.fromEntries(["Area", "AreaChart", "Bar", "BarChart", "CartesianGrid", "Cell", "Pie", "PieChart", "ResponsiveContainer", "Tooltip", "XAxis", "YAxis"].map(key => [key, chart]));
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiRequest).mockImplementation(async endpoint => {
    if (endpoint === "/dashboard/summary") return { total_tickets: 2, open_tickets: 1, assigned_tickets: 1, in_progress_tickets: 0, pending_tickets: 0, resolved_tickets: 0, closed_tickets: 0, overdue_tickets: 0, avg_resolution_hours: 0, sla_compliance_percentage: 100, unassigned_queue_count: 0 };
    if (endpoint === "/dashboard/trends") return { daily: [], weekly: [], monthly: [] };
    return { by_status: [], by_priority: [], by_category: [], recent_tickets: [], agent_performance: [{ agent_id: 8, agent_name: "Support Example", email: "support@example.com", support_team: "Test Team", assigned_total: 2, resolved_count: 1, pending_workload: 1, avg_resolution_hours: 1, sla_compliance_rate: 100 }] };
  });
});
afterEach(cleanup);
function LocationProbe() { const location = useLocation(); return <span data-testid="current-path">{location.pathname}{location.search}</span>; }
function mount(role: string) {
  auth.user.role = role;
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><DashboardPage /><LocationProbe /></MemoryRouter></QueryClientProvider>);
}
it("removes only the requested consultant dashboard sections for every agent", async () => {
  mount("agent");
  await screen.findByText("Enterprise Service Operations Center");
  for (const label of ["Total Tickets", "Open Tickets", "In Progress", "Resolved Tickets", "Closed Tickets", "Transferred Tickets", "Overdue Tickets"]) expect(screen.getByText(label)).toBeInTheDocument();
  for (const label of ["Avg Resolution Time", "SLA Compliance", "Ticket Volume Trend (Created vs Resolved)", "Recent Support Tickets", "IT Support Agent Workload & SLA Performance"]) expect(screen.queryByText(label)).not.toBeInTheDocument();
  expect(screen.getByText("Ticket Status Distribution")).toBeInTheDocument();
  expect(screen.getByText("Priority Distribution")).toBeInTheDocument();
  expect(screen.getByText("Ticket Category Distribution")).toBeInTheDocument();
  expect(vi.mocked(apiRequest).mock.calls.some(([endpoint]) => endpoint === "/dashboard/trends")).toBe(false);
});
it("preserves the agreed admin dashboard with metrics and graphs but no recent table", async () => {
  mount("admin");
  expect(await screen.findByText("Ticket Volume Trend (Created vs Resolved)")).toBeInTheDocument();
  expect(screen.queryByText("Avg Resolution Time")).not.toBeInTheDocument();
  expect(screen.queryByText("SLA Alerts Today")).not.toBeInTheDocument();
  expect(screen.getByText("Transferred Tickets")).toBeInTheDocument();
  expect(screen.queryByText("IT Support Agent Workload & SLA Performance")).not.toBeInTheDocument();
  expect(screen.queryByText("Recent Support Tickets")).not.toBeInTheDocument();
});
it("preserves the employee dashboard and support/knowledge entry points", async () => {
  mount("employee");
  expect(await screen.findByText("My Total Tickets")).toBeInTheDocument();
  expect(screen.queryByText("Log a Technical Support Request")).not.toBeInTheDocument();
  expect(screen.queryByText("Overdue Tickets")).not.toBeInTheDocument();
  expect(screen.queryByText("Transferred Tickets")).not.toBeInTheDocument();
  expect(screen.queryByText("Avg Resolution Time")).not.toBeInTheDocument();
  expect(screen.queryByText("SLA Compliance")).not.toBeInTheDocument();
  expect(screen.queryByText("Browse Enterprise Knowledge Base")).not.toBeInTheDocument();
  expect(screen.queryByText("View My Employee Directory Profile")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "View My Tickets" })).toHaveAttribute("href", "/tickets/my");
  expect(screen.getByRole("link", { name: "Create Support Ticket" })).toHaveAttribute("href", "/tickets/new");
  expect(screen.queryByText("IT Support Agent Workload & SLA Performance")).not.toBeInTheDocument();
});

it.each(["agent", "admin"])("opens scoped transferred records from the %s transfer card", async role => {
  mount(role);
  fireEvent.click(await screen.findByText("Transferred Tickets"));
  expect(screen.getByTestId("current-path")).toHaveTextContent(role === "admin" ? "/tickets?status=transferred" : "/tickets/my?status=transferred");
});
