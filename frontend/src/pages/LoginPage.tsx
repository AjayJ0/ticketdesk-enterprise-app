import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Lock,
  Mail,
  Shield,
  Terminal,
  UserCheck,
  Users,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { ApiError } from "../services/api";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid corporate email address"),
  password: z.string().min(4, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

const DEMO_ACCOUNTS = [
  {
    role: "Administrator",
    name: "Evelyn Sterling",
    email: "admin@ticketdesk.enterprise",
    password: "Admin@12345",
    badge: "Full Admin & Config",
    icon: Shield,
  },
  {
    role: "IT Support Agent",
    name: "Alex Rivera",
    email: "alex.rivera@ticketdesk.enterprise",
    password: "Agent@12345",
    badge: "Network & Cloud Queue",
    icon: UserCheck,
  },
  {
    role: "Employee",
    name: "Sarah Chen",
    email: "sarah.chen@ticketdesk.enterprise",
    password: "Employee@12345",
    badge: "Requester Portal",
    icon: Users,
  },
];

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState<string | null>(null);

  const from = (location.state as { from?: { pathname?: string } })?.from?.pathname || "/dashboard";

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (values: LoginFormValues) => {
    setServerError(null);
    try {
      await login(values.email, values.password);
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setServerError(err.message);
      } else {
        setServerError("Unable to reach authentication server. Please verify backend status.");
      }
    }
  };

  const handleQuickDemoLogin = async (email: string, password: string) => {
    setValue("email", email);
    setValue("password", password);
    await onSubmit({ email, password });
  };

  return (
    <div className="min-h-screen flex bg-slate-950 text-slate-100">
      {/* Left Enterprise Branding Column */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 bg-navy-900 border-r border-slate-800 relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/30">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white">
                TicketDesk Enterprise
              </h1>
              <p className="text-xs text-blue-400 font-medium uppercase tracking-widest">
                Enterprise IT Service Management Platform
              </p>
            </div>
          </div>

          <div className="mt-16 max-w-lg">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 mb-4">
              <Terminal className="w-3.5 h-3.5" />
              Production-Grade ITSM Architecture
            </span>
            <h2 className="text-3xl font-bold text-white tracking-tight leading-snug">
              Unified Incident Response, SLA Governance & Service Operations.
            </h2>
            <p className="mt-4 text-sm text-slate-400 leading-relaxed">
              Engineered for modern enterprise IT teams to triage, assign, track, and resolve technical incidents with real-time SLA compliance, role-based access control, and AWS cloud integration.
            </p>

            <div className="mt-8 space-y-3.5">
              {[
                "Full-lifecycle ticket state machine with automated SLA deadline tracking",
                "Strict Role-Based Access Control (Employee, IT Support Agent, Administrator)",
                "Dual storage engine supporting local filesystem and Amazon S3 + AWS Lambda",
                "Immutable compliance audit trail and real-time operational analytics",
              ].map((feature, idx) => (
                <div key={idx} className="flex items-start gap-2.5 text-xs text-slate-300">
                  <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                  <span>{feature}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="relative z-10 pt-8 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
          <span>TicketDesk Enterprise v1.0</span>
          <span>PostgreSQL • FastAPI • React • AWS Ready</span>
        </div>
      </div>

      {/* Right Authentication Form Column */}
      <div className="flex-1 flex flex-col justify-center px-6 py-12 lg:px-16 bg-white text-slate-900">
        <div className="w-full max-w-md mx-auto">
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-base text-slate-900">TicketDesk Enterprise</span>
          </div>

          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">
              Sign in to your workspace
            </h2>
            <p className="mt-1.5 text-sm text-slate-500">
              Enter your corporate SSO credentials or select an evaluation demo role below.
            </p>
          </div>

          {serverError && (
            <div className="mt-5 p-3.5 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2.5 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{serverError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5"
              >
                Corporate Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="name@ticketdesk.enterprise"
                  {...register("email")}
                  className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 focus:bg-white transition-all"
                />
              </div>
              {errors.email && (
                <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••••••"
                  {...register("password")}
                  className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 focus:bg-white transition-all"
                />
              </div>
              {errors.password && (
                <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold text-sm shadow-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <span>{isSubmitting ? "Authenticating..." : "Sign In to TicketDesk"}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Instant Demo Role Switcher for Live Evaluation */}
          <div className="mt-8 pt-6 border-t border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                1-Click Evaluation Demo Accounts
              </span>
              <span className="text-[11px] text-slate-400">Development Seed</span>
            </div>

            <div className="space-y-2">
              {DEMO_ACCOUNTS.map((acct) => {
                const Icon = acct.icon;
                return (
                  <button
                    key={acct.email}
                    type="button"
                    onClick={() => handleQuickDemoLogin(acct.email, acct.password)}
                    className="w-full p-3 rounded-lg border border-slate-200 hover:border-blue-400 hover:bg-blue-50/40 text-left transition-all flex items-center justify-between group cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 group-hover:bg-blue-100 text-slate-700 group-hover:text-blue-700 flex items-center justify-center shrink-0">
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900">{acct.role}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                            {acct.badge}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 truncate font-mono mt-0.5">
                          {acct.email}
                        </p>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
