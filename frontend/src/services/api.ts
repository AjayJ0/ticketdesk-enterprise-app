const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "/api/v1";

const ACCESS_TOKEN_KEY = "td_access_token";
const REFRESH_TOKEN_KEY = "td_refresh_token";

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setAuthTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearAuthTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

async function tryRefreshTokens(): Promise<string | null> {
  const refresh = getRefreshToken();
  if (!refresh) return null;
  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!res.ok) {
      clearAuthTokens();
      return null;
    }
    const data = await res.json();
    setAuthTokens(data.access_token, data.refresh_token);
    return data.access_token;
  } catch {
    clearAuthTokens();
    return null;
  }
}

export class ApiError extends Error {
  status: number;
  code: string;
  details: unknown;

  constructor(message: string, status: number, code = "API_ERROR", details: unknown = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  retry = true
): Promise<T> {
  const token = getAccessToken();
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (!(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401 && retry && !endpoint.startsWith("/auth/login")) {
    const newToken = await tryRefreshTokens();
    if (newToken) {
      return apiRequest<T>(endpoint, options, false);
    }
  }

  if (!response.ok) {
    let errMsg = `Request failed (${response.status})`;
    let errCode = `HTTP_${response.status}`;
    let errDetails: unknown = null;

    try {
      const errBody = await response.json();
      if (errBody?.error) {
        errMsg = errBody.error.message || errMsg;
        errCode = errBody.error.code || errCode;
        errDetails = errBody.error.details;
      } else if (errBody?.detail) {
        errMsg = typeof errBody.detail === "string" ? errBody.detail : JSON.stringify(errBody.detail);
      }
    } catch {
      // Non-JSON error response
    }
    throw new ApiError(errMsg, response.status, errCode, errDetails);
  }

  return response.json() as Promise<T>;
}

export async function downloadAuthorizedBlob(endpoint: string, filename: string): Promise<void> {
  const token = getAccessToken();
  const headers = new Headers();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, { headers });
  if (!response.ok) {
    throw new ApiError("Failed to download file", response.status);
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
