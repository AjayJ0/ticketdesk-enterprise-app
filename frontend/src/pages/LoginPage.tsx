import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  KeyRound,
  Lock,
  Mail,
  Phone,
  Shield,
  Smartphone,
  X,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { ApiError, apiRequest } from "../services/api";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid corporate email address"),
  password: z.string().min(4, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

interface OTPDispatchResponse {
  success: boolean;
  message: string;
  masked_phone: string;
  email: string;
  expires_in_seconds: number;
  dev_otp_code?: string | null;
}

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState<string | null>(null);
  const [resetSuccessBanner, setResetSuccessBanner] = useState<string | null>(null);

  // Forgot Password Phone OTP Authenticator state
  const [forgotOpen, setForgotOpen] = useState(false);
  const [otpStep, setOtpStep] = useState<"request" | "verify">("request");
  const [fpEmail, setFpEmail] = useState("");
  const [fpPhone, setFpPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otpDispatchInfo, setOtpDispatchInfo] = useState<OTPDispatchResponse | null>(null);
  const [fpError, setFpError] = useState<string | null>(null);
  const [fpLoading, setFpLoading] = useState(false);

  const returnPath = (location.state as { from?: { pathname?: unknown } } | null)?.from?.pathname;
  const from =
    typeof returnPath === "string" &&
    returnPath.startsWith("/") &&
    !returnPath.startsWith("//") &&
    !/[\\?#\u0000-\u0020\u007f]/.test(returnPath)
      ? returnPath
      : "/dashboard";

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
    setResetSuccessBanner(null);
    try {
      await login(values.email, values.password);
      navigate({ pathname: from }, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setServerError(err.message);
      } else {
        setServerError("Unable to reach authentication server. Please verify backend status.");
      }
    }
  };

  const openForgotModal = () => {
    setForgotOpen(true);
    setOtpStep("request");
    setFpError(null);
    setOtpDispatchInfo(null);
    setOtpCode("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const handleRequestOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setFpError(null);
    if (!fpPhone.trim()) {
      setFpError("Please enter your registered phone number.");
      return;
    }
    setFpLoading(true);
    try {
      const res = await apiRequest<OTPDispatchResponse>("/auth/forgot-password/request-otp", {
        method: "POST",
        body: JSON.stringify({
          email: fpEmail.trim() ? fpEmail.trim() : null,
          phone: fpPhone.trim(),
        }),
      });
      setOtpDispatchInfo(res);
      setFpEmail(res.email);
      setOtpStep("verify");
    } catch (err) {
      setFpError(
        err instanceof ApiError
          ? err.message
          : "Failed to dispatch verification OTP. Check your phone number."
      );
    } finally {
      setFpLoading(false);
    }
  };

  const handleVerifyAndResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setFpError(null);
    if (otpCode.trim().length !== 6) {
      setFpError("Please enter the 6-digit OTP code sent to your phone.");
      return;
    }
    if (newPassword.length < 8) {
      setFpError("New password must be at least 8 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setFpError("New password and confirmation password do not match.");
      return;
    }

    setFpLoading(true);
    try {
      const res = await apiRequest<{ success: boolean; message: string }>(
        "/auth/forgot-password/verify-reset",
        {
          method: "POST",
          body: JSON.stringify({
            email: fpEmail.trim() ? fpEmail.trim() : null,
            phone: fpPhone.trim(),
            otp_code: otpCode.trim(),
            new_password: newPassword,
          }),
        }
      );
      setForgotOpen(false);
      setValue("email", fpEmail);
      setValue("password", "");
      setResetSuccessBanner(res.message);
    } catch (err) {
      setFpError(
        err instanceof ApiError ? err.message : "Failed to verify OTP or reset password."
      );
    } finally {
      setFpLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 px-4 py-8 sm:px-6 sm:py-12">
      <header className="mx-auto mb-8 flex w-full max-w-xl flex-col items-center text-center sm:mb-10">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 shadow-lg shadow-blue-600/20">
          <Shield className="h-5 w-5 text-white" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          TicketDesk Enterprise
        </h1>
        <p className="mt-2 text-xs font-medium text-blue-600 sm:text-sm">
          Enterprise IT Service Management Platform
        </p>
      </header>

      <main className="mx-auto w-full max-w-md">
        <div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">
              Sign in to your workspace
            </h2>
            <p className="mt-1.5 text-sm text-slate-500">
              Enter your corporate credentials to sign in.
            </p>
          </div>

          {resetSuccessBanner && (
            <div className="mt-5 p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 flex items-start gap-2.5 text-xs text-emerald-800">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{resetSuccessBanner}</span>
            </div>
          )}

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
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="password"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-700"
                >
                  Password
                </label>
                <button
                  type="button"
                  onClick={openForgotModal}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline cursor-pointer"
                >
                  Forgot password?
                </button>
              </div>
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


        </div>
      </main>

      {/* Self-Service Forgot Password via Phone Number OTP Authenticator Modal */}
      {forgotOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4">
          <div className="bg-white text-slate-900 rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-200">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Phone OTP Password Authenticator
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {otpStep === "request"
                      ? "Step 1 of 2: Verify your registered phone number"
                      : "Step 2 of 2: Enter 6-digit OTP & set new password"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setForgotOpen(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {fpError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2 text-xs text-red-700">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{fpError}</span>
              </div>
            )}

            {otpStep === "request" ? (
              <form onSubmit={handleRequestOTP} className="space-y-3.5 text-xs">
                <p className="text-slate-600 leading-relaxed">
                  Enter your registered <strong>Phone Number</strong> (and optional corporate email) to receive a 6-digit one-time verification code.
                </p>

                <div>
                  <label className="block font-bold uppercase text-slate-700 mb-1">
                    Registered Phone Number *
                  </label>
                  <div className="relative">
                    <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="tel"
                      value={fpPhone}
                      onChange={(e) => setFpPhone(e.target.value)}
                      placeholder="e.g. +1 (415) 890-1001 or 9876543210"
                      required
                      className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-lg font-mono focus:outline-none focus:border-blue-600 focus:bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold uppercase text-slate-700 mb-1">
                    Corporate Email (Optional)
                  </label>
                  <div className="relative">
                    <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      value={fpEmail}
                      onChange={(e) => setFpEmail(e.target.value)}
                      placeholder="name@ticketdesk.enterprise"
                      className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 focus:bg-white"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setForgotOpen(false)}
                    className="px-4 py-2 rounded-lg border border-slate-300 font-semibold text-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={fpLoading}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold cursor-pointer"
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>{fpLoading ? "Sending OTP..." : "Send Verification OTP"}</span>
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleVerifyAndResetPassword} className="space-y-3.5 text-xs">
                {otpDispatchInfo && (
                  <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 space-y-1.5">
                    <p className="font-semibold text-blue-900">{otpDispatchInfo.message}</p>
                    <p className="text-[11px] text-blue-700">
                      Account: <strong className="font-mono">{otpDispatchInfo.email}</strong>
                    </p>
                    {otpDispatchInfo.dev_otp_code && (
                      <div className="mt-2 pt-2 border-t border-blue-200/80 flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase text-blue-800">
                          SMS / Authenticator OTP Code:
                        </span>
                        <span className="px-2.5 py-1 rounded bg-navy-900 text-emerald-400 font-mono text-sm font-bold tracking-widest">
                          {otpDispatchInfo.dev_otp_code}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="block font-bold uppercase text-slate-700 mb-1">
                    6-Digit Verification OTP *
                  </label>
                  <div className="relative">
                    <KeyRound className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      maxLength={6}
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                      placeholder="123456"
                      required
                      className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-lg font-mono text-sm tracking-widest font-bold focus:outline-none focus:border-blue-600 focus:bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold uppercase text-slate-700 mb-1">
                    New Password (Min 8 chars) *
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new strong password"
                    required
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-bold uppercase text-slate-700 mb-1">
                    Confirm New Password *
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    required
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 focus:bg-white"
                  />
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setOtpStep("request")}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    ← Resend / Change Phone
                  </button>
                  <button
                    type="submit"
                    disabled={fpLoading}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{fpLoading ? "Verifying..." : "Verify OTP & Change Password"}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
