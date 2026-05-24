/**
 * HARDENED API PROXY ROUTE HANDLER
 *
 * Securely proxies API requests to the backend.
 * Implements OWASP SSRF prevention measures.
 *
 * Security measures:
 * - Strict path allowlist
 * - Method restrictions
 * - Path traversal prevention
 * - Hop-by-hop header stripping
 * - Request timeout/abort handling
 * - Sanitized error responses
 *
 * Edge Runtime: deployed to ALL Vercel edge regions globally (including Mumbai
 * for Indian users), not just the project's serverless region (US East on free
 * plan). This drops proxy latency from ~200ms (US East) to ~10ms (Mumbai edge)
 * for Indian users, with a direct hop to Railway Singapore (~50ms) after that.
 */

// Deploy to Vercel Edge Network — runs at the nearest edge node to the user.
// For India-only users this means Mumbai edge (~10ms) instead of US East (~200ms).
export const runtime = 'edge';

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { ALLOWED_METHODS, isPathSafe, isPathAllowed, createSafeHeaders } from "@/lib/api/proxy-validators";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// ============================================================================
// Configuration (Server-only)
// ============================================================================

import { BACKEND_PRIMARY_URL, BACKEND_FALLBACK_URL, isConnectionRefused as checkConnectionRefused } from "@/lib/config/env";

const BACKEND_API_URL = BACKEND_PRIMARY_URL;

// Request timeout in milliseconds
// Longer timeout for file uploads (multipart requests)
const REQUEST_TIMEOUT_MS = 120_000; // 120 seconds for file uploads

// ============================================================================
// Error Response Helpers
// ============================================================================

function errorResponse(
  code: string,
  message: string,
  status: number
): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: { code, message },
    },
    { status }
  );
}

// ============================================================================
// Main Proxy Handler
// ============================================================================

async function proxyRequest(
  request: NextRequest,
  method: string
): Promise<NextResponse> {
  // Generate a unique ID for this request — used for log correlation and forwarded to the backend
  const requestId = crypto.randomUUID();

  // Validate backend URL is configured
  if (!BACKEND_API_URL) {
    logger.error("Proxy: backend URL not configured", { requestId });
    return errorResponse(
      "SERVICE_UNAVAILABLE",
      "Service temporarily unavailable",
      503
    );
  }

  // Validate method
  if (!ALLOWED_METHODS.has(method)) {
    return errorResponse("METHOD_NOT_ALLOWED", "Method not allowed", 405);
  }

  // Extract and validate path
  const url = new URL(request.url);
  const pathSegments = url.pathname.replace("/api/proxy", "");

  // Child logger binds requestId + method + path to every log call in this request
  const reqLog = logger.child({ requestId, method, path: pathSegments });

  // Security: Check for path traversal
  if (!isPathSafe(pathSegments)) {
    reqLog.warn("Proxy: blocked suspicious path");
    return errorResponse("BAD_REQUEST", "Invalid request path", 400);
  }

  // Security: Check path allowlist
  if (!isPathAllowed(pathSegments)) {
    reqLog.warn("Proxy: blocked non-allowlisted path");
    return errorResponse("FORBIDDEN", "Access denied", 403);
  }

  // Build backend URL
  const backendUrl = `${BACKEND_API_URL}${pathSegments}${url.search}`;
  const fallbackUrl = BACKEND_FALLBACK_URL ? `${BACKEND_FALLBACK_URL}${pathSegments}${url.search}` : "";

  // Token is injected by proxy.ts as x-supabase-access-token on every request.
  // Fall back to the browser-forwarded X-Supabase-Token header (client-side calls),
  // then to server-side cookie session as a last resort.
  let accessToken: string | null =
    request.headers.get("x-supabase-access-token") ??
    request.headers.get("X-Supabase-Token");
  if (!accessToken) {
    const supabase = await createSupabaseServerClient();
    const { data: { session } } = await supabase.auth.getSession();
    accessToken = session?.access_token ?? null;
  }

  // Check if this is a multipart/form-data request (file upload)
  const contentType = request.headers.get("content-type") || "";
  const isMultipart = contentType.includes("multipart/form-data");

  // Create safe headers — passes accessToken as Authorization: Bearer <token>
  const safeHeaders = createSafeHeaders(request.headers, accessToken);

  // Forward request ID to backend for end-to-end tracing
  safeHeaders.set("X-Request-ID", requestId);

  // Get request body for non-GET requests
  // For multipart/form-data, we need to preserve the boundary and stream the body
  let body: ArrayBuffer | ReadableStream<Uint8Array> | null = null;
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    if (isMultipart) {
      // For multipart/form-data, we need to read the body and forward it
      // Reading as arrayBuffer preserves the multipart structure with boundary
      try {
        body = await request.arrayBuffer();
        // Ensure Content-Type header is preserved with boundary
        if (contentType) {
          safeHeaders.set("Content-Type", contentType);
        }
        reqLog.info("Proxy: forwarding multipart request", { contentType, bodySize: body.byteLength });
      } catch (error) {
        reqLog.error("Proxy: error reading multipart body", { error: error instanceof Error ? error.message : String(error) });
        return errorResponse(
          "BAD_REQUEST",
          "Failed to read request body",
          400
        );
      }
    } else {
      // For other content types, read as ArrayBuffer
      try {
        body = await request.arrayBuffer();
      } catch {
        // No body or error reading body
      }
    }
  }

  // Remove Content-Type header for DELETE requests without body
  // Fastify throws error if Content-Type is set but body is empty
  if (method === "DELETE" && (!body || (body instanceof ArrayBuffer && body.byteLength === 0))) {
    safeHeaders.delete("Content-Type");
  }

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const fetchOptions = {
    method,
    headers: safeHeaders,
    body: body as BodyInit,
    signal: controller.signal,
    redirect: "manual" as const,
    credentials: "include" as const,
  };

  try {
    if (isMultipart) {
      reqLog.info("Proxy: sending multipart request to backend", { url: backendUrl, hasBody: !!body });
    }

    let response: Response;
    try {
      response = await fetch(backendUrl, fetchOptions);
    } catch (fetchError) {
      if (checkConnectionRefused(fetchError) && fallbackUrl) {
        reqLog.info("Proxy: primary backend unavailable, trying fallback URL");
        response = await fetch(fallbackUrl, fetchOptions);
      } else {
        throw fetchError;
      }
    }

    if (isMultipart) {
      reqLog.info("Proxy: backend multipart response", { status: response.status, contentType: response.headers.get("content-type"), ok: response.ok });
    }

    clearTimeout(timeoutId);

    // Get response data
    const responseContentType = response.headers.get("content-type");
    let data: unknown;

    if (responseContentType?.includes("application/json")) {
      try {
        data = await response.json();
        
        // Log backend errors for debugging (especially for multipart requests)
        if (!response.ok) {
          const errorMessage = typeof data === 'object' && data !== null && 'error' in data
            ? (typeof (data as Record<string, unknown>).error === 'object'
                ? ((data as Record<string, Record<string, unknown>>).error?.message)
                : (data as Record<string, unknown>).error)
            : 'Unknown error';
          reqLog.error("Proxy: backend error response", { status: response.status, isMultipart, errorMessage });
        }
      } catch (parseError) {
        reqLog.error("Proxy: failed to parse backend JSON response", { status: response.status, parseError: parseError instanceof Error ? parseError.message : String(parseError) });
        // Return error response
        return errorResponse(
          "PARSE_ERROR",
          "Backend returned invalid response",
          response.status
        );
      }
    } else {
      // 204 No Content — body-less response
      if (response.status === 204) {
        return new NextResponse(null, { status: 204 });
      }
      // SSE — pipe the stream directly without buffering so events reach the
      // browser in real-time.  The timeout was already cleared above, so the
      // AbortController won't interrupt a long-running stream.
      if (responseContentType?.includes("text/event-stream")) {
        return new NextResponse(response.body, {
          status: response.status,
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "X-Request-ID": requestId,
          },
        });
      }
      // For non-JSON responses (e.g., file downloads), buffer and forward
      const responseBody = await response.arrayBuffer();
      return new NextResponse(responseBody, {
        status: response.status,
        headers: {
          "Content-Type": responseContentType || "application/octet-stream",
        },
      });
    }

    // Return JSON response with same status, echoing requestId for client-side correlation
    return NextResponse.json(data, {
      status: response.status,
      headers: { "X-Request-ID": requestId },
    });
  } catch (error) {
    clearTimeout(timeoutId);

    // Handle abort/timeout
    if (error instanceof Error && error.name === "AbortError") {
      reqLog.error("Proxy: request timeout");
      return errorResponse("TIMEOUT", "Request timed out", 504);
    }

    reqLog.error("Proxy: unhandled error", {
      isMultipart,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      message: error instanceof Error ? error.message : String(error),
    });

    // Return sanitized error
    return errorResponse(
      "PROXY_ERROR",
      "Unable to process request",
      502
    );
  }
}

// ============================================================================
// HTTP Method Handlers
// ============================================================================

export async function GET(request: NextRequest) {
  return proxyRequest(request, "GET");
}

export async function POST(request: NextRequest) {
  return proxyRequest(request, "POST");
}

export async function PUT(request: NextRequest) {
  return proxyRequest(request, "PUT");
}

export async function PATCH(request: NextRequest) {
  return proxyRequest(request, "PATCH");
}

export async function DELETE(request: NextRequest) {
  return proxyRequest(request, "DELETE");
}

export async function OPTIONS(request: NextRequest) {
  return proxyRequest(request, "OPTIONS");
}
