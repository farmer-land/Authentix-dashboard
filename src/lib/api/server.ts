/**
 * SERVER-SIDE API CLIENT
 *
 * Utilities for making authenticated API calls from Server Components
 * and Route Handlers using HttpOnly cookies.
 */

import { cookies, headers } from "next/headers";

/**
 * Backend API URL - Server-only, never exposed to client
 * BACKEND_API_URL must be set in environment variables for production
 */
import { BACKEND_PRIMARY_URL, BACKEND_FALLBACK_URL, isPreSendConnectionError } from "@/lib/config/env";

const BACKEND_URL = BACKEND_PRIMARY_URL;

/** Cookie names for auth tokens */
export const AUTH_COOKIES = {
  ACCESS_TOKEN: "auth_access_token",
  REFRESH_TOKEN: "auth_refresh_token",
  EXPIRES_AT: "auth_expires_at",
} as const;

/** Cookie configuration for secure HttpOnly cookies */
export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  // 7 days default expiry
  maxAge: 60 * 60 * 24 * 7,
};

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta: {
    request_id: string;
    timestamp: string;
  };
}

/**
 * Custom error class for API errors (server-side)
 */
export class ServerApiError extends Error {
  code: string;
  status: number;
  details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    status: number = 500,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ServerApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/**
 * Get access token for server-side use.
 *
 * Priority:
 *   1. x-supabase-access-token request header (injected by the edge proxy for every
 *      proxied request — always fresh, no refresh needed)
 *   2. Supabase server client getSession() — handles token refresh automatically
 *      via the HttpOnly refresh-token cookie (same logic the proxy uses)
 *   3. Raw auth_access_token cookie — legacy fallback, may be stale
 */
export async function getServerAccessToken(): Promise<string | null> {
  // 1. Header injected by the proxy / client
  try {
    const headerStore = await headers();
    const fromHeader =
      headerStore.get("x-supabase-access-token") ??
      headerStore.get("x-supabase-token");
    if (fromHeader) return fromHeader;
  } catch {
    // headers() unavailable outside request context
  }

  // 2. Supabase server client — refreshes expired tokens automatically
  try {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const supabase = await createSupabaseServerClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) return session.access_token;
  } catch {
    // Supabase server client unavailable
  }

  // 3. Raw cookie fallback (may be stale but better than nothing)
  const cookieStore = await cookies();
  return cookieStore.get(AUTH_COOKIES.ACCESS_TOKEN)?.value ?? null;
}

/**
 * Get refresh token — only used by the legacy refresh route.
 */
export async function getServerRefreshToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(AUTH_COOKIES.REFRESH_TOKEN)?.value ?? null;
}

/**
 * Check if the current request is authenticated.
 * A non-null access token (from header or cookie) is sufficient —
 * the backend validates the JWT signature on every call.
 */
export async function isServerAuthenticated(): Promise<boolean> {
  const token = await getServerAccessToken();
  return !!token;
}

/**
 * Set auth cookies (server-side, used in Route Handlers)
 */
export async function setServerAuthCookies(tokens: {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.set(AUTH_COOKIES.ACCESS_TOKEN, tokens.access_token, {
    ...COOKIE_OPTIONS,
    maxAge: tokens.expires_at - Math.floor(Date.now() / 1000),
  });

  cookieStore.set(AUTH_COOKIES.REFRESH_TOKEN, tokens.refresh_token, {
    ...COOKIE_OPTIONS,
    // Refresh token has longer lifetime
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  cookieStore.set(AUTH_COOKIES.EXPIRES_AT, tokens.expires_at.toString(), {
    ...COOKIE_OPTIONS,
    maxAge: tokens.expires_at - Math.floor(Date.now() / 1000),
  });
}

/**
 * Clear auth cookies (server-side, used in Route Handlers)
 */
export async function clearServerAuthCookies(): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.delete(AUTH_COOKIES.ACCESS_TOKEN);
  cookieStore.delete(AUTH_COOKIES.REFRESH_TOKEN);
  cookieStore.delete(AUTH_COOKIES.EXPIRES_AT);
}

/**
 * Make an authenticated API request (server-side)
 */
export async function serverApiRequest<T>(
  endpoint: string,
  options: RequestInit & { skipAuth?: boolean } = {}
): Promise<ApiResponse<T>> {
  const { skipAuth, ...fetchOptions } = options;

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...fetchOptions.headers,
  };

  // Add auth header if not skipped
  if (!skipAuth) {
    const token = await getServerAccessToken();
    if (!token) {
      throw new ServerApiError("UNAUTHORIZED", "Not authenticated", 401);
    }
    (headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }

  if (!BACKEND_URL) {
    throw new ServerApiError(
      "CONFIG_ERROR",
      "Backend API URL is not configured",
      503
    );
  }

  const primaryUrl = `${BACKEND_URL}${endpoint}`;

  let response: Response;
  try {
    response = await fetch(primaryUrl, {
      ...fetchOptions,
      headers,
      cache: skipAuth ? "default" : "no-store",
    });
  } catch (error) {
    // Local backend not running — fall back to the deployed backend (dev only).
    // Gated on a pre-send error so a request that may already have been received
    // is never re-sent; see isPreSendConnectionError.
    if (isPreSendConnectionError(error) && BACKEND_FALLBACK_URL) {
      console.warn(
        `[ServerApi] Local backend unreachable, using Railway fallback: ${BACKEND_FALLBACK_URL}${endpoint}`
      );
      try {
        response = await fetch(`${BACKEND_FALLBACK_URL}${endpoint}`, {
          ...fetchOptions,
          headers,
          cache: skipAuth ? "default" : "no-store",
        });
      } catch (fallbackError) {
        const msg = fallbackError instanceof Error ? fallbackError.message : "Network error";
        throw new ServerApiError("NETWORK_ERROR", `Failed to connect to backend: ${msg}`, 503);
      }
    } else {
      const errorMessage = error instanceof Error ? error.message : "Network error";
      throw new ServerApiError("NETWORK_ERROR", `Failed to connect to backend: ${errorMessage}`, 503);
    }
  }

  // Handle non-JSON responses
  const contentType = response.headers.get("content-type");
  let data: ApiResponse<T>;

  try {
    if (contentType?.includes("application/json")) {
      data = (await response.json()) as ApiResponse<T>;
    } else {
      const text = await response.text();
      throw new ServerApiError(
        "INVALID_RESPONSE",
        `Expected JSON but received ${contentType}`,
        response.status,
        { response: text.substring(0, 200) }
      );
    }
  } catch (error) {
    if (error instanceof ServerApiError) throw error;
    throw new ServerApiError(
      "PARSE_ERROR",
      `Failed to parse response: ${error instanceof Error ? error.message : "Unknown"}`,
      response.status
    );
  }

  if (!response.ok || !data.success) {
    const apiError = data.error ?? {
      code: "HTTP_ERROR",
      message: `HTTP ${response.status}: ${response.statusText}`,
    };
    throw new ServerApiError(
      apiError.code,
      apiError.message,
      response.status,
      apiError.details
    );
  }

  return data;
}

/**
 * Make a backend auth request (used by Route Handlers)
 */
export async function backendAuthRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  if (!BACKEND_URL) {
    throw new ServerApiError(
      "CONFIG_ERROR",
      "Backend API URL is not configured",
      503
    );
  }

  const primaryUrl = `${BACKEND_URL}${endpoint}`;
  const fetchHeaders = { "Content-Type": "application/json", ...options.headers };

  let response: Response;
  try {
    response = await fetch(primaryUrl, { ...options, headers: fetchHeaders });
  } catch (error) {
    // Local backend not running — fall back to the deployed backend (dev only).
    // Pre-send gate: never re-send a request that may already have been received.
    if (isPreSendConnectionError(error) && BACKEND_FALLBACK_URL) {
      console.warn(
        `[BackendAuth] Local backend unreachable, using Railway fallback: ${BACKEND_FALLBACK_URL}${endpoint}`
      );
      try {
        response = await fetch(`${BACKEND_FALLBACK_URL}${endpoint}`, { ...options, headers: fetchHeaders });
      } catch (fallbackError) {
        const msg = fallbackError instanceof Error ? fallbackError.message : "Network error";
        throw new ServerApiError("NETWORK_ERROR", `Failed to connect to backend: ${msg}`, 503);
      }
    } else {
      const errorMessage = error instanceof Error ? error.message : "Network error";
      console.error(`[BackendAuth] Network error for ${primaryUrl}:`, errorMessage);
      throw new ServerApiError("NETWORK_ERROR", `Failed to connect to backend: ${errorMessage}`, 503);
    }
  }

  let data: ApiResponse<T>;
  try {
    data = (await response.json()) as ApiResponse<T>;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Parse error";
    console.error(`[BackendAuth] JSON parse error for ${primaryUrl}:`, errorMessage);
    throw new ServerApiError(
      "PARSE_ERROR",
      `Failed to parse backend response: ${errorMessage}`,
      response.status
    );
  }

  // Log the response for debugging
  if (!response.ok || !data.success) {
    console.error(`[BackendAuth] Error response from ${primaryUrl}:`, {
      status: response.status,
      success: data.success,
      error: data.error,
    });
    
    throw new ServerApiError(
      data.error?.code ?? "AUTH_ERROR",
      data.error?.message ?? "Authentication failed",
      response.status,
      data.error?.details
    );
  }

  // Check if data.data exists
  if (!data.data) {
    console.warn(`[BackendAuth] No data in response from ${primaryUrl}, but success=true`);
    // Return empty object as fallback (caller should handle this)
    return {} as T;
  }

  return data.data as T;
}

// ============================================================================
// Server-Side Data Fetching (for Server Components)
// ============================================================================

/** User session data */
export interface ServerSession {
  user: {
    id: string;
    email: string;
    full_name: string | null;
  } | null;
  valid: boolean;
}

/** User profile data */
export interface ServerUserProfile {
  id: string;
  email: string;
  full_name: string | null;
  organization_id: string;
  organization: {
    name: string;
    // Logo fields from backend - supports multiple structures
    logo_file_id?: string | null;
    logo_bucket?: string | null;
    logo_path?: string | null;
    logo_url?: string | null;
    // Nested structure: logo.bucket/path
    logo?: {
      bucket?: string | null;
      path?: string | null;
    } | null;
  } | null;
}

/**
 * Get session data from backend (server-side)
 * Returns null if not authenticated
 */
export async function getServerSession(): Promise<ServerSession | null> {
  try {
    const response = await serverApiRequest<ServerSession>("/auth/session");
    return response.data ?? null;
  } catch {
    return null;
  }
}

/**
 * Get user profile from backend (server-side)
 * Returns null if not authenticated
 */
export async function getServerUserProfile(): Promise<ServerUserProfile | null> {
  try {
    const response = await serverApiRequest<ServerUserProfile>("/users/me");
    return response.data ?? null;
  } catch {
    return null;
  }
}

/**
 * Get session and profile in parallel (server-side)
 * More efficient than sequential calls
 */
export async function getServerAuthData(): Promise<{
  session: ServerSession | null;
  profile: ServerUserProfile | null;
}> {
  const [session, profile] = await Promise.all([
    getServerSession(),
    getServerUserProfile(),
  ]);
  return { session, profile };
}

/**
 * Sanitize error messages for client-side display
 * (keeps detailed errors server-side only)
 */
export function sanitizeErrorMessage(error: unknown): string {
  if (error instanceof ServerApiError) {
    // Return user-friendly messages for known error codes
    switch (error.code) {
      case "INVALID_CREDENTIALS":
        return "Invalid email or password";
      case "USER_NOT_FOUND":
        return "Account not found";
      case "EMAIL_NOT_VERIFIED":
        return "Please verify your email before signing in";
      case "ACCOUNT_DISABLED":
        return "This account has been disabled";
      case "RATE_LIMITED":
        return "Too many attempts. Please try again later.";
      case "NETWORK_ERROR":
        return "Unable to connect. Please check your connection.";
      default:
        // Don't expose internal error details
        return "An error occurred. Please try again.";
    }
  }
  return "An unexpected error occurred";
}
