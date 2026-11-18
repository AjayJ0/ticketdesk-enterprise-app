import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  apiRequest,
  clearAuthTokens,
  getAuthSession,
  revokeAuthSession,
  AUTH_SESSION_CLEARED,
  ApiError,
  setAuthTokens,
} from "../services/api";
import { AuthUser } from "../types";

interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: AuthUser;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const queryClient = useQueryClient();
  const generation = useRef(0);

  const refreshProfile = useCallback(async () => {
    const epoch = generation.current;
    const session = getAuthSession();
    if (!session) {
      setUser(null); setIsLoading(false); return;
    }
    try {
      const profile = await apiRequest<AuthUser>("/auth/me");
      if (epoch !== generation.current || getAuthSession()?.id !== session.id) return;
      if (String(profile.id) !== session.subject || profile.role !== session.role) {
        clearAuthTokens(session.id);
        return;
      }
      setUser(profile);
    } catch (error) {
      if (epoch !== generation.current || getAuthSession()?.id !== session.id) return;
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) clearAuthTokens(session.id);
    } finally {
      if (epoch === generation.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const cleared = () => {
      generation.current += 1;
      queryClient.clear(); setUser(null); setIsLoading(false);
    };
    window.addEventListener(AUTH_SESSION_CLEARED, cleared);
    refreshProfile();
    return () => { generation.current += 1; window.removeEventListener(AUTH_SESSION_CLEARED, cleared); };
  }, [refreshProfile, queryClient]);

  const login = async (email: string, password: string): Promise<AuthUser> => {
    const epoch = ++generation.current;
    const data = await apiRequest<LoginResponse>("/auth/login", {
      method: "POST", body: JSON.stringify({ email, password }),
    });
    if (epoch !== generation.current) throw new ApiError("A newer sign-in replaced this request.", 409, "SESSION_CHANGED");
    setAuthTokens(data.access_token, data.refresh_token);
    const session = getAuthSession()!;
    if (String(data.user.id) !== session.subject || data.user.role !== session.role) {
      clearAuthTokens(session.id);
      throw new ApiError("Sign-in identity mismatch.", 401, "SESSION_IDENTITY_MISMATCH");
    }
    queryClient.clear(); setUser(data.user); setIsLoading(false);
    return data.user;
  };

  const logout = async (): Promise<void> => {
    const session = getAuthSession();
    generation.current += 1;
    clearAuthTokens();
    queryClient.clear(); setUser(null); setIsLoading(false);
    try { if (session) await revokeAuthSession(session); } catch { /* Local logout is already complete. */ }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
