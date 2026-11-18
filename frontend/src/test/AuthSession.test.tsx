import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "../contexts/AuthContext";
import { apiRequest, getAccessToken, getAuthSession, setAuthTokens } from "../services/api";
const jwt = (id: number, role: string, tag = "", identity = `account-${id}`) => `header.${btoa(JSON.stringify({ sub: String(id), role, sid: identity }))}.sig${tag}`;
const user = (id: number, role: string) => ({ id, role, email: `${role}@example.com`, full_name: role });
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); sessionStorage.clear(); localStorage.clear(); });

it("does not send another tab's origin-wide legacy tokens on navigation", async () => {
  const token = jwt(1, "admin");
  setAuthTokens(token, "admin-refresh");
  // Reproduces the old bug trigger: another same-origin tab logs in as a consultant.
  localStorage.setItem("td_access_token", jwt(2, "agent"));
  localStorage.setItem("td_refresh_token", "agent-refresh");
  const fetch = vi.fn(async (_url, options: RequestInit) => {
    expect(new Headers(options.headers).get("Authorization")).toBe(`Bearer ${token}`);
    return response(user(1, "admin"));
  });
  vi.stubGlobal("fetch", fetch);
  const profile = await apiRequest<{ id: number; role: string }>("/auth/me");
  await apiRequest("/settings");
  expect(profile).toMatchObject({ id: 1, role: "admin" });
  expect(getAccessToken()).toBe(token);
});

it("keeps independent tab session stores and survives reload reads", () => {
  const tabA = sessionStorage;
  setAuthTokens(jwt(1, "admin"), "admin-refresh");
  const memory = new Map<string, string>();
  const tabB = { getItem: (key: string) => memory.get(key) || null, setItem: (key: string, value: string) => memory.set(key, value), removeItem: (key: string) => memory.delete(key) };
  vi.stubGlobal("sessionStorage", tabB);
  expect(getAuthSession()).toBeNull();
  setAuthTokens(jwt(2, "agent"), "agent-refresh");
  expect(getAuthSession()?.subject).toBe("2");
  vi.stubGlobal("sessionStorage", tabA);
  expect(getAuthSession()?.subject).toBe("1");
  expect(JSON.parse(tabA.getItem("td_tab_session")!).role).toBe("admin");
});

it("refreshes simultaneous 401 requests once and retains the same identity", async () => {
  const old = jwt(1, "admin", "old"), fresh = jwt(1, "admin", "new");
  setAuthTokens(old, "refresh-1");
  let refreshCalls = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, options: RequestInit) => {
    if (url.endsWith("/auth/refresh")) {
      refreshCalls += 1;
      await new Promise(resolve => setTimeout(resolve, 5));
      return response({ access_token: fresh, refresh_token: "refresh-2", user: user(1, "admin") });
    }
    return new Headers(options.headers).get("Authorization") === `Bearer ${old}` ? response({}, 401) : response({ ok: true });
  }));
  const values = await Promise.all([apiRequest("/settings"), apiRequest("/tickets")]);
  expect(values).toEqual([{ ok: true }, { ok: true }]);
  expect(refreshCalls).toBe(1);
  expect(getAuthSession()).toMatchObject({ subject: "1", role: "admin", accessToken: fresh });
});

it("rejects a refresh response for another user instead of switching identities", async () => {
  setAuthTokens(jwt(1, "admin"), "refresh-1");
  vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith("/auth/refresh") ? response({ access_token: jwt(2, "agent"), refresh_token: "wrong", user: user(2, "agent") }) : response({}, 401)));
  await expect(apiRequest("/settings")).rejects.toMatchObject({ code: "SESSION_IDENTITY_MISMATCH" });
  expect(getAuthSession()).toBeNull();
});

function Probe() {
  const auth = useAuth();
  return <><span data-testid="identity">{auth.user?.email || "signed-out"}</span><button onClick={() => auth.login("agent@example.com", "test").catch(() => {})}>Sign in agent</button><button onClick={() => auth.logout()}>Logout</button></>;
}
function mount() { render(<QueryClientProvider client={new QueryClient()}><AuthProvider><Probe /></AuthProvider></QueryClientProvider>); }

it("ignores a stale me response after an explicit sign-in", async () => {
  setAuthTokens(jwt(1, "admin"), "admin-refresh");
  let finish!: (value: Response) => void;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.endsWith("/auth/me")) return new Promise<Response>(resolve => { finish = resolve; });
    return response({ access_token: jwt(2, "agent"), refresh_token: "agent-refresh", user: user(2, "agent") });
  }));
  mount();
  fireEvent.click(screen.getByText("Sign in agent"));
  await screen.findByText("agent@example.com");
  await act(async () => finish(response(user(1, "admin"))));
  expect(screen.getByTestId("identity")).toHaveTextContent("agent@example.com");
  expect(getAuthSession()?.subject).toBe("2");
});

it("does not let an old logout response erase a newer explicit sign-in", async () => {
  setAuthTokens(jwt(1, "admin"), "admin-refresh");
  let finish!: (value: Response) => void;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.endsWith("/auth/me")) return response(user(1, "admin"));
    if (url.endsWith("/auth/logout")) return new Promise<Response>(resolve => { finish = resolve; });
    return response({ access_token: jwt(2, "agent"), refresh_token: "agent-refresh", user: user(2, "agent") });
  }));
  mount();
  await screen.findByText("admin@example.com");
  fireEvent.click(screen.getByText("Logout"));
  await waitFor(() => expect(getAuthSession()).toBeNull());
  fireEvent.click(screen.getByText("Sign in agent"));
  await screen.findByText("agent@example.com");
  await act(async () => finish(response({ success: true })));
  expect(screen.getByTestId("identity")).toHaveTextContent("agent@example.com");
  expect(getAuthSession()?.subject).toBe("2");
});

it("rejects a different account stamp even if a numeric ID and role were reused", async () => {
  setAuthTokens(jwt(1, "admin"), "refresh-1");
  vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith("/auth/refresh") ? response({ access_token: jwt(1, "admin", "new", "different-account"), refresh_token: "wrong", user: user(1, "admin") }) : response({}, 401)));
  await expect(apiRequest("/settings")).rejects.toMatchObject({ code: "SESSION_IDENTITY_MISMATCH" });
  expect(getAuthSession()).toBeNull();
});
