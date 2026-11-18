import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "../contexts/AuthContext";
import { LoginPage } from "../pages/LoginPage";
import { PriorityBadge, RoleBadge, SLABadge, StatusBadge } from "../components/ui/Badges";
import { formatFileSize, formatMinutesDuration, formatStatusLabel } from "../utils/format";

describe("TicketDesk Enterprise UI Components & Utilities", () => {
  it("renders status, priority, SLA, and role badges accurately", () => {
    render(
      <div>
        <StatusBadge status="in_progress" />
        <PriorityBadge priority="critical" />
        <SLABadge health="breached" />
        <RoleBadge role="admin" />
      </div>
    );

    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("Critical")).toBeInTheDocument();
    expect(screen.getByText("SLA Breached")).toBeInTheDocument();
    expect(screen.getByText("Administrator")).toBeInTheDocument();
  });

  it("formats file sizes, durations, and status labels properly", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(2048)).toBe("2.0 KB");
    expect(formatMinutesDuration(125)).toBe("2h 5m remaining");
    expect(formatMinutesDuration(-45)).toBe("Overdue by 45m");
    expect(formatStatusLabel("in_progress")).toBe("In Progress");
  });

  it("renders the LoginPage with password recovery and no administrator account shortcut", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <BrowserRouter>
          <AuthProvider>
            <LoginPage />
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    );

    expect(screen.getByText("Sign in to your workspace")).toBeInTheDocument();
    expect(screen.getByLabelText("Corporate Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByText("Forgot password?")).toBeInTheDocument();
    expect(screen.queryByText("admin@ticketdesk.enterprise")).not.toBeInTheDocument();
    expect(screen.queryByText("Primary Administrator Account")).not.toBeInTheDocument();
  });
});
