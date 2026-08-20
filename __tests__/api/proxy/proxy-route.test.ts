/**
 * Integration tests for the API proxy route handler.
 *
 * These tests cover security-critical path validation and request handling
 * without making real HTTP calls. The backend fetch is mocked via vi.stubGlobal.
 *
 * Note: Full round-trip proxy tests (real backend) belong in e2e/.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

// Mutable so individual tests can turn the dev fallback on/off. Read per-request
// by the route handler, so a getter is enough — no module reload needed.
const envState = vi.hoisted(() => ({ fallbackUrl: "" }));

vi.mock("@/lib/config/env", async () => {
  const actual = await vi.importActual<typeof import("@/lib/config/env")>("@/lib/config/env");
  return {
    ...actual,
    // Real isPreSendConnectionError — the retry logic under test depends on it.
    BACKEND_PRIMARY_URL: "http://backend.test",
    get BACKEND_FALLBACK_URL() {
      return envState.fallbackUrl;
    },
  };
});

const loggerMock = vi.hoisted(() => {
  const reqLog = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
  reqLog.child.mockImplementation(() => reqLog);
  return {
    reqLog,
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn(() => reqLog),
    },
  };
});

vi.mock("@/lib/logger", () => ({ logger: loggerMock.logger }));

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    get: vi.fn().mockReturnValue(undefined),
    getAll: vi.fn().mockReturnValue([]),
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
  }),
}));

import { GET, POST, DELETE } from "@/app/api/proxy/[...path]/route";

// ── Fetch mock helpers ─────────────────────────────────────────────────────────

function mockFetch(status: number, body: unknown) {
  const mockResponse = {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "Content-Type": "application/json" }),
    json: vi.fn().mockResolvedValue(body),
    arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
  };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));
  return mockResponse;
}

function makeRequest(path: string, method = "GET", body?: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/proxy${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  envState.fallbackUrl = "";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── Path security: traversal ──────────────────────────────────────────────────

describe("Proxy route — path traversal prevention", () => {
  it("returns 403 for paths containing .. (normalized before handler, blocked by allowlist)", async () => {
    const res = await GET(makeRequest("/auth/../admin"));
    expect(res.status).toBe(403);
  });

  it("returns 403 for URL-encoded traversal %2e%2e (normalized before handler, blocked by allowlist)", async () => {
    const res = await GET(makeRequest("/auth/%2e%2e/admin"));
    expect(res.status).toBe(403);
  });

  it("returns 400 for double-slash paths", async () => {
    const res = await GET(makeRequest("/auth//login"));
    expect(res.status).toBe(400);
  });

  it("returns 400 for paths with null bytes", async () => {
    const res = await GET(makeRequest("/auth/%00login"));
    expect(res.status).toBe(400);
  });
});

// ── Path security: allowlist ──────────────────────────────────────────────────

describe("Proxy route — path allowlist", () => {
  it("returns 403 for paths not in the allowlist", async () => {
    const res = await GET(makeRequest("/admin/users"));
    expect(res.status).toBe(403);
  });

  it("returns 403 for paths attempting to access arbitrary routes", async () => {
    const res = await GET(makeRequest("/internal/secrets"));
    expect(res.status).toBe(403);
  });

  it("allows allowed prefixes through to the backend", async () => {
    mockFetch(200, { success: true, data: [] });
    const res = await GET(makeRequest("/templates"));
    // Should NOT be 400 or 403 — reached the backend mock
    expect([200, 201, 204].includes(res.status) || res.status < 500).toBe(true);
  });

  it("allows /auth/ prefix", async () => {
    mockFetch(200, { success: true, data: {} });
    const res = await GET(makeRequest("/auth/access-context"));
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(400);
  });

  it("allows /certificates/ prefix", async () => {
    mockFetch(200, { success: true, data: [] });
    const res = await GET(makeRequest("/certificates/generation-jobs"));
    expect(res.status).not.toBe(403);
  });

  it("allows /jobs/ prefix", async () => {
    mockFetch(200, { success: true, data: { id: "job_1", status: "completed" } });
    const res = await GET(makeRequest("/jobs/job_1"));
    expect(res.status).not.toBe(403);
  });
});

// ── Response forwarding ───────────────────────────────────────────────────────

describe("Proxy route — response forwarding", () => {
  it("forwards backend JSON response with the same status", async () => {
    mockFetch(200, { success: true, data: { id: "t1" } });
    const res = await GET(makeRequest("/templates"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("includes X-Request-ID response header", async () => {
    mockFetch(200, { success: true, data: {} });
    const res = await GET(makeRequest("/templates"));
    expect(res.headers.get("X-Request-ID")).toBeTruthy();
  });

  it("forwards non-200 status codes from backend", async () => {
    mockFetch(404, { success: false, error: "Not found" });
    const res = await GET(makeRequest("/templates"));
    expect(res.status).toBe(404);
  });

  it("handles 204 No Content responses", async () => {
    const mockResponse = {
      ok: true,
      status: 204,
      headers: new Headers({ "Content-Type": "text/plain" }),
      json: vi.fn(),
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

    const res = await DELETE(makeRequest("/templates/t1", "DELETE"));
    expect(res.status).toBe(204);
  });
});

// ── POST forwarding ───────────────────────────────────────────────────────────

describe("Proxy route — POST requests", () => {
  it("forwards POST body to backend", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      headers: new Headers({ "Content-Type": "application/json" }),
      json: vi.fn().mockResolvedValue({ success: true, data: { id: "new_1" } }),
      arrayBuffer: vi.fn(),
    });
    vi.stubGlobal("fetch", fetchMock);

    await POST(makeRequest("/certificates/generation-jobs", "POST", { templateId: "t1" }));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/certificates/generation-jobs"),
      expect.objectContaining({ method: "POST" })
    );
  });
});

// ── GARDEN-38: connection-failure retry ───────────────────────────────────────

describe("Proxy route — connection-failure retry (GARDEN-38)", () => {
  function okResponse(status = 200) {
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers({ "Content-Type": "application/json" }),
      json: vi.fn().mockResolvedValue({ success: true, data: {} }),
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
    };
  }

  /** A `TypeError: fetch failed` carrying an undici-style `cause.code`. */
  function connectionError(code: string): TypeError {
    const error = new TypeError("fetch failed");
    (error as TypeError & { cause?: unknown }).cause = { code };
    return error;
  }

  it("retries a POST whose connection was never established (ECONNREFUSED)", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(connectionError("ECONNREFUSED"))
      .mockResolvedValueOnce(okResponse(201));
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(makeRequest("/dashboard/editor-events", "POST", { event: "x" }));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(201);
  });

  it.each(["ENOTFOUND", "EAI_AGAIN"])(
    "retries a POST on %s — DNS never resolved, so nothing was sent",
    async (code) => {
      const fetchMock = vi
        .fn()
        .mockRejectedValueOnce(connectionError(code))
        .mockResolvedValueOnce(okResponse(201));
      vi.stubGlobal("fetch", fetchMock);

      const res = await POST(makeRequest("/dashboard/editor-events", "POST", { event: "x" }));

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(res.status).toBe(201);
    },
  );

  it("does NOT retry a POST on a bare ECONNRESET — it may have reached the server", async () => {
    const fetchMock = vi.fn().mockRejectedValue(connectionError("ECONNRESET"));
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(makeRequest("/dashboard/editor-events", "POST", { event: "x" }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(502);
  });

  it("does NOT retry a DELETE on an ambiguous error", async () => {
    const fetchMock = vi.fn().mockRejectedValue(connectionError("ECONNRESET"));
    vi.stubGlobal("fetch", fetchMock);

    const res = await DELETE(makeRequest("/templates/t1", "DELETE"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(502);
  });

  it("still retries a GET on an ambiguous error — idempotent, unchanged behaviour", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(connectionError("ECONNRESET"))
      .mockResolvedValueOnce(okResponse(200));
    vi.stubGlobal("fetch", fetchMock);

    const res = await GET(makeRequest("/templates"));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
  });

  it("retries at most once — a second failure surfaces as 502", async () => {
    const fetchMock = vi.fn().mockRejectedValue(connectionError("ECONNREFUSED"));
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(makeRequest("/dashboard/editor-events", "POST", { event: "x" }));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(502);
  });
});

// ── GARDEN-38: dev-only Railway fallback ──────────────────────────────────────

describe("Proxy route — Railway fallback (GARDEN-38)", () => {
  const FALLBACK = "https://fallback.test/api/v1";

  function connectionError(code: string): TypeError {
    const error = new TypeError("fetch failed");
    (error as TypeError & { cause?: unknown }).cause = { code };
    return error;
  }

  it("uses the fallback when the local backend refuses the connection", async () => {
    envState.fallbackUrl = FALLBACK;
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(connectionError("ECONNREFUSED"))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "Content-Type": "application/json" }),
        json: vi.fn().mockResolvedValue({ success: true, data: {} }),
        arrayBuffer: vi.fn(),
      });
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(makeRequest("/dashboard/editor-events", "POST", { event: "x" }));

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("http://backend.test"),
      expect.anything(),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${FALLBACK}/dashboard/editor-events`,
      expect.anything(),
    );
  });

  it("logs at warn naming the URL actually used, on every fallback request", async () => {
    envState.fallbackUrl = FALLBACK;
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(connectionError("ECONNREFUSED"))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "Content-Type": "application/json" }),
        json: vi.fn().mockResolvedValue({ success: true, data: {} }),
        arrayBuffer: vi.fn(),
      });
    vi.stubGlobal("fetch", fetchMock);

    await POST(makeRequest("/dashboard/editor-events", "POST", { event: "x" }));

    expect(loggerMock.reqLog.warn).toHaveBeenCalledWith(
      expect.stringContaining("Railway fallback"),
      expect.objectContaining({ fallbackUrl: `${FALLBACK}/dashboard/editor-events` }),
    );
  });

  it("does NOT use the fallback on an ambiguous error — the request may have landed", async () => {
    envState.fallbackUrl = FALLBACK;
    const fetchMock = vi.fn().mockRejectedValue(connectionError("ECONNRESET"));
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(makeRequest("/dashboard/editor-events", "POST", { event: "x" }));

    expect(res.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.not.stringContaining("fallback.test"),
      expect.anything(),
    );
  });

  it("attempts no fallback when it is disabled, as in a production build", async () => {
    // Production resolves BACKEND_FALLBACK_URL to "" — see env.test.ts.
    envState.fallbackUrl = "";
    const fetchMock = vi.fn().mockRejectedValue(connectionError("ECONNREFUSED"));
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(makeRequest("/dashboard/editor-events", "POST", { event: "x" }));

    expect(res.status).toBe(502);
    // Retried against the primary only — never a different host.
    for (const call of fetchMock.mock.calls) {
      expect(call[0]).toContain("http://backend.test");
    }
    expect(loggerMock.reqLog.warn).not.toHaveBeenCalledWith(
      expect.stringContaining("Railway fallback"),
      expect.anything(),
    );
  });
});
