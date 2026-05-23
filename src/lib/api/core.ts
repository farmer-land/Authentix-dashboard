/**
 * API CORE — Shared types, request primitives, and utilities
 *
 * This module is the foundation for all domain API modules.
 * It exports:
 *   - Shared response/error types
 *   - ApiError class
 *   - apiRequest / authApiRequest request functions
 *   - extractApiError / buildQueryString utilities
 *
 * Domain modules (auth.ts, templates.ts, …) import from here.
 * External consumers should import types from @/lib/api/client.
 */

import { logger } from "@/lib/logger";

// ── Constants ─────────────────────────────────────────────────────────────────

export const API_BASE_URL = "/api/proxy";

// ── Response envelope types ───────────────────────────────────────────────────

export interface ApiErrorData {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiErrorData | string;
  meta?: {
    request_id: string;
    timestamp: string;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

// ── Error class ───────────────────────────────────────────────────────────────

export class ApiError extends Error {
  code: string;
  details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/**
 * Extract error code and message from an ApiResponse error field.
 */
export function extractApiError(
  error: ApiErrorData | string | undefined,
  fallback: string,
): { code: string; message: string } {
  if (typeof error === "object" && error !== null) {
    return { code: error.code ?? "HTTP_ERROR", message: error.message ?? fallback };
  }
  if (typeof error === "string") {
    return { code: "HTTP_ERROR", message: error };
  }
  return { code: "HTTP_ERROR", message: fallback };
}

/**
 * Build a query string from a params object, filtering out falsy values.
 * Returns "" when there are no params, or "?key=val&..." otherwise.
 */
export function buildQueryString(
  params: Record<string, string | number | boolean | undefined | null>,
): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) qs.set(key, String(value));
  }
  const str = qs.toString();
  return str ? `?${str}` : "";
}

// ── Request functions ─────────────────────────────────────────────────────────

/**
 * Make API request to Next.js Route Handler (auth endpoints).
 */
export async function authApiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `/api${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    credentials: "include",
  });

  const data = (await response.json()) as ApiResponse<T>;

  if (!response.ok || !data.success) {
    const { code: errorCode, message: errorMessage } = extractApiError(data.error, "Request failed");
    throw new ApiError(errorCode, errorMessage);
  }

  return data.data as T;
}

/**
 * Make authenticated API request to backend.
 * Attaches the Supabase access token as Authorization: Bearer so the proxy
 * route can forward it to the backend without relying on server-side cookie
 * parsing (which is unreliable in Route Handler context).
 * @param _retry internal flag — true when this is a post-refresh retry (prevents loops)
 */
export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  _retry = false,
): Promise<ApiResponse<T>> {
  // Get access token from the browser Supabase client (handles refresh automatically)
  let accessToken: string | null = null;
  try {
    const { createSupabaseBrowserClient } = await import("@/lib/supabase/browser");
    const supabase = createSupabaseBrowserClient();
    const { data: { session } } = await supabase.auth.getSession();
    accessToken = session?.access_token ?? null;
  } catch {
    // Non-browser context or Supabase unavailable — proxy falls back to cookie
  }

  const headers: HeadersInit = {
    ...(options.body && { "Content-Type": "application/json" }),
    ...(accessToken && { "X-Supabase-Token": accessToken }),
    ...options.headers,
  };

  const url = `${API_BASE_URL}${endpoint}`;

  const isLongRunningOperation =
    endpoint.includes("/certificates/generate") ||
    endpoint.includes("/certificates/generation-jobs");
  const timeoutDuration = isLongRunningOperation ? 300000 : 10000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutDuration);

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
      credentials: "include",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiError("TIMEOUT", "Request timed out. Please try again.", { url, endpoint });
    }
    const errorMessage = error instanceof Error ? error.message : "Network error";
    logger.error("API network error", { url, endpoint, errorMessage });
    throw new ApiError(
      "NETWORK_ERROR",
      "Failed to connect to server. Please check your connection.",
      { url, endpoint },
    );
  }

  if (response.status === 204) {
    return { success: true, data: undefined as unknown as T };
  }

  const contentType = response.headers.get("content-type");
  let data: ApiResponse<T>;

  try {
    if (contentType?.includes("application/json")) {
      const responseText = await response.text();
      try {
        data = JSON.parse(responseText) as ApiResponse<T>;
      } catch (parseError) {
        logger.error("API JSON parse error", {
          endpoint,
          parseError: parseError instanceof Error ? parseError.message : String(parseError),
        });
        throw new ApiError("PARSE_ERROR", "Failed to parse JSON response", {
          status: response.status,
          statusText: response.statusText,
          responseText: responseText.substring(0, 200),
        });
      }
    } else {
      const text = await response.text();
      logger.error("API non-JSON response", {
        endpoint,
        status: response.status,
        contentType,
        textPreview: text.substring(0, 200),
      });
      throw new ApiError(
        "INVALID_RESPONSE",
        `Unexpected response format: ${contentType}`,
        { status: response.status, statusText: response.statusText },
      );
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error("API error processing response", {
      endpoint,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new ApiError("PARSE_ERROR", "Failed to process response", {
      status: response.status,
      statusText: response.statusText,
    });
  }

  if (!response.ok || !data.success) {
    const errorObj =
      typeof data.error === "object" && data.error !== null
        ? data.error
        : typeof data.error === "string"
          ? { message: data.error }
          : { message: "Unknown error" };

    const logContext = {
      endpoint,
      status: response.status,
      errorCode: "code" in errorObj ? errorObj.code : "UNKNOWN",
      errorMessage: errorObj.message || "Unknown error",
    };
    // 4xx = expected client errors (not found, auth, validation); 5xx = server fault
    if (response.status >= 500) {
      logger.error("API server error", logContext);
    } else {
      logger.warn("API request failed", logContext);
    }

    if (response.status === 401) {
      if (!_retry) {
        try {
          await authApiRequest<void>("/auth/refresh", { method: "POST" });
          return apiRequest<T>(endpoint, options, true);
        } catch {
          // Refresh failed — fall through to throw session-expired error
        }
      }
      throw new ApiError("UNAUTHORIZED", "Session expired. Please sign in again.");
    }

    const error = data.error;
    const { code: errorCode, message: errorMessage } = extractApiError(
      error,
      `HTTP ${response.status}: ${response.statusText}`,
    );
    const errorDetails =
      typeof error === "object" && error !== null && "details" in error
        ? (error.details as Record<string, unknown>)
        : undefined;

    const apiError = new ApiError(errorCode, errorMessage, errorDetails);
    Object.defineProperty(apiError, "status", {
      value: response.status,
      writable: false,
      enumerable: true,
    });
    throw apiError;
  }

  return data;
}
