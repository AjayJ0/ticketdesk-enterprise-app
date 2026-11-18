import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { apiRequest } from "../services/api";
import { SLAAlertsPage } from "../pages/SLAAlertsPage";
import { ProfilePage } from "../pages/ProfilePage";
import { AppLayout } from "../layouts/AppLayout";
import { TicketsListPage } from "../pages/TicketsListPage";
import { SLAManagementPage } from "../pages/SLAManagementPage";

const auth = vi.hoisted(() => ({ user: { id: 1, role: "agent", full_name: "Test Consultant", email: "consultant@example.com" }, refreshProfile: vi.fn(), logout: vi.fn() }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("../services/api", () => ({ apiRequest: vi.fn() }));
const alerts = { items: [{ id: 5, ticket_number: "TKT-TEST-5", subject: "Network unavailable", priority: "high", status: "in_progress", resolution_due_at: "2020-01-01T00:00:00Z", requester: { full_name: "Test Employee" }, assigned_agent: { full_name: "Test Consultant" }, support_team_name: "Network Team" }], total: 1, total_pages: 1, page: 1, page_size: 20 };
function mount(element: React.ReactNode, path = "/") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}>{element}</MemoryRouter></QueryClientProvider>);
}
beforeEach(() => {
  vi.clearAllMocks();
  auth.user = { id: 1, role: "agent", full_name: "Test Consultant", email: "consultant@example.com" };
  vi.mocked(apiRequest).mockImplementation(async endpoint => {
    if (endpoint.startsWith("/notifications/sla-alerts")) return alerts;
    if (endpoint.startsWith("/notifications")) return { items: [], unread_count: 0, total: 0 };
    if (endpoint.startsWith("/tickets?")) return { items: [], total: 0, page: 1, total_pages: 0 };
    if (endpoint === "/dashboard/summary") return { total_tickets: 0, open_tickets: 0, assigned_tickets: 0, in_progress_tickets: 0, resolved_tickets: 0, closed_tickets: 0 };
    return [];
  });
});
afterEach(cleanup);

describe("SLA Alerts and requested profile cleanup", () => {
  it("navigates from the admin sidebar, shows outstanding count and links a breached ticket", async () => {
    auth.user.role = "admin";
    mount(<Routes><Route element={<AppLayout />}><Route path="dashboard" element={<p>Dashboard</p>} /><Route path="sla-alerts" element={<SLAAlertsPage />} /></Route></Routes>, "/dashboard");
    const link = screen.getAllByRole("link", { name: /SLA Alerts/ })[0];
    await screen.findAllByLabelText("1 outstanding SLA alerts");
    fireEvent.click(link);
    expect(await screen.findByText("Resolution SLA breached")).toBeInTheDocument();
    expect(screen.getByText("Test Employee")).toBeInTheDocument();
    expect(screen.getByText("Test Consultant / Network Team")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /TKT-TEST-5/ })).toHaveAttribute("href", "/tickets/TKT-TEST-5");
  });
  it.each(["employee", "agent"])("hides admin-only SLA navigation from %s", role => {
    auth.user.role = role;
    mount(<AppLayout />);
    expect(screen.queryByRole("link", { name: /SLA Alerts/ })).not.toBeInTheDocument();
    expect(vi.mocked(apiRequest).mock.calls.some(([endpoint]) => endpoint.startsWith("/notifications/sla-alerts"))).toBe(false);
  });
  it("shows the empty state without hiding load failures", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ ...alerts, items: [], total: 0 });
    mount(<SLAAlertsPage />);
    expect(await screen.findByText("No outstanding resolution SLA breaches.")).toBeInTheDocument();
    cleanup();
    vi.mocked(apiRequest).mockRejectedValue(new Error("offline"));
    mount(<SLAAlertsPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load SLA alerts");
  });
  it("removes the overdue quick filter while preserving other ticket filters", async () => {
    mount(<TicketsListPage mode="my" />);
    expect(screen.queryByText("Overdue / SLA Breach Only")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Filter by status")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter by priority")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter by category")).toBeInTheDocument();
  });
  it("retains one upper profile save button which submits the edited values", async () => {
    auth.user.role = "admin";
    mount(<ProfilePage />);
    const buttons = screen.getAllByRole("button", { name: "Save Profile Changes" });
    expect(buttons).toHaveLength(1);
    expect(buttons[0].closest("form")).toBeTruthy();
    fireEvent.change(screen.getByDisplayValue("Test Consultant"), { target: { value: "Updated Administrator" } });
    fireEvent.click(buttons[0]);
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/auth/me", expect.objectContaining({ method: "PUT", body: expect.stringContaining("Updated Administrator") })));
    await waitFor(() => expect(auth.refreshProfile).toHaveBeenCalled());
  });
  it("removes only the SLA assumptions notice", async () => {
    mount(<SLAManagementPage />);
    expect(screen.queryByText("SLA Evaluation Engine & Timezone Assumptions")).not.toBeInTheDocument();
    expect(await screen.findByText("Service Level Agreement (SLA) Policies")).toBeInTheDocument();
  });
});
