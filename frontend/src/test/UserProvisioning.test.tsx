import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserManagementPage } from "../pages/UserManagementPage";
import { apiRequest } from "../services/api";
vi.mock("../services/api", () => ({ apiRequest: vi.fn() }));
const employee = { id: 2, full_name: "Existing Employee", email: "employee@example.com", role: "employee", is_active: true, created_at: "2026-01-01", department_id: null, support_team_id: null };
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiRequest).mockImplementation(async (endpoint, options) => {
    if (endpoint === "/users/support-teams") return [{ id: 1, name: "Support Team", code: "SUPPORT" }];
    if (endpoint === "/users/departments") return [];
    if (options?.method === "POST") return { id: 10, ...JSON.parse(String(options.body)) };
    return { items: [employee], total: 1, page: 1, page_size: 50, total_pages: 1 };
  });
});
afterEach(cleanup);
function mount() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><UserManagementPage /></QueryClientProvider>);
}
it.each(["employee", "agent", "admin"])("creates %s accounts without changing the role when selecting a team", async role => {
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Create User Account" }));
  const select = screen.getByRole("combobox", { name: "New account role" });
  expect(within(select).getAllByRole("option").map(option => option.textContent)).toEqual(["Employee", "IT Support Agent", "Administrator"]);
  expect(select).toHaveValue("agent");
  fireEvent.change(select, { target: { value: role } });
  const team = screen.getByRole("combobox", { name: "New account support team" });
  expect(screen.getByRole("combobox", { name: "New account department" })).toBeInTheDocument();
  expect(screen.getByPlaceholderText("Enter job title")).toBeInTheDocument();
  await waitFor(() => expect(within(team).getAllByRole("option")).toHaveLength(3));
  fireEvent.change(team, { target: { value: "1" } });
  expect(select).toHaveValue(role);
  fireEvent.change(screen.getByPlaceholderText("Enter name"), { target: { value: "Created Account" } });
  fireEvent.change(screen.getByPlaceholderText("Enter email ID"), { target: { value: "created@example.com" } });
  fireEvent.change(screen.getByPlaceholderText("Enter password (minimum 4 characters)"), { target: { value: "TestPassword123" } });
  fireEvent.click(screen.getByRole("button", { name: "Create Account" }));
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/users", expect.objectContaining({ method: "POST", body: expect.stringContaining(`"role":"${role}"`) })));
  const request = vi.mocked(apiRequest).mock.calls.find(([endpoint, options]) => endpoint === "/users" && options?.method === "POST")!;
  const payload = JSON.parse(String(request[1]?.body));
  expect(payload).toMatchObject({ role, password: "TestPassword123" });
  expect(payload.support_team_id).toBe(1);
  await screen.findByText(/created successfully/);
  fireEvent.click(screen.getByRole("button", { name: "Create User Account" }));
  expect(screen.getByRole("combobox", { name: "New account role" })).toHaveValue("agent");
});
it("retains the Employee role when editing an existing employee", async () => {
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
  const option = screen.getByRole("option", { name: "Employee" });
  expect(option.closest("select")).toHaveValue("employee");
  expect(screen.getByDisplayValue("Existing Employee")).toBeInTheDocument();
});

it("creates organization entries inline and preserves them when switching roles", async () => {
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Create User Account" }));
  fireEvent.change(screen.getByRole("combobox", { name: "New account department" }), { target: { value: "new" } });
  fireEvent.change(screen.getByRole("combobox", { name: "New account support team" }), { target: { value: "new" } });
  const submit = screen.getByRole("button", { name: "Create Account" });
  fireEvent.change(screen.getByPlaceholderText("Enter name"), { target: { value: "Inline User" } });
  fireEvent.change(screen.getByPlaceholderText("Enter email ID"), { target: { value: "inline@example.com" } });
  fireEvent.change(screen.getByPlaceholderText("Enter password (minimum 4 characters)"), { target: { value: "TestPassword123" } });
  expect(submit).toBeDisabled();
  fireEvent.change(screen.getByLabelText("New department name"), { target: { value: "  Research  " } });
  fireEvent.change(screen.getByLabelText("New support team name"), { target: { value: "  Research IT  " } });
  fireEvent.click(submit);
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/users", expect.objectContaining({ body: expect.stringContaining('"department_name":"Research"') })));
  const request = vi.mocked(apiRequest).mock.calls.find(([endpoint, options]) => endpoint === "/users" && options?.method === "POST")!;
  expect(JSON.parse(String(request[1]?.body))).toMatchObject({ department_name: "Research", support_team_name: "Research IT", department_id: null, support_team_id: null });
  await screen.findByText(/created successfully/);
  fireEvent.click(screen.getByRole("button", { name: "Create User Account" }));
  fireEvent.change(screen.getByRole("combobox", { name: "New account department" }), { target: { value: "new" } });
  fireEvent.change(screen.getByLabelText("New department name"), { target: { value: "Stale department" } });
  fireEvent.change(screen.getByRole("combobox", { name: "New account role" }), { target: { value: "employee" } });
  expect(screen.getByLabelText("New department name")).toHaveValue("Stale department");
  fireEvent.change(screen.getByRole("combobox", { name: "New account role" }), { target: { value: "admin" } });
  expect(screen.getByRole("combobox", { name: "New account department" })).toHaveValue("new");
});
